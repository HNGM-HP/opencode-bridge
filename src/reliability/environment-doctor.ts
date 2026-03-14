import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type RuntimePlatform = NodeJS.Platform;
export type EnvironmentOs = 'windows' | 'linux' | 'macos' | 'unknown';
export type EnvironmentIssueCode = 'missing_command' | 'missing_env' | 'port_unavailable' | 'path_not_writable';
export type IssueClassification = 'repairable' | 'manual_required';

export interface PortCheckResult {
  available: boolean;
  reason: string;
}

export interface EnvironmentIssue {
  code: EnvironmentIssueCode;
  classification: IssueClassification;
  detail: string;
  suggestion: string;
}

export interface EnvironmentDoctorSummary {
  totalIssues: number;
  repairable: number;
  manualRequired: number;
}

export interface EnvironmentDoctorReport {
  os: EnvironmentOs;
  endpoint: {
    host: string;
    port: number;
    probeHost: string;
  };
  issues: EnvironmentIssue[];
  summary: EnvironmentDoctorSummary;
}

type CommandExistsChecker = (command: string) => Promise<boolean>;
type PortChecker = (host: string, port: number, timeoutMs: number) => Promise<PortCheckResult>;
type PathWritableChecker = (directory: string) => Promise<boolean>;

export interface EnvironmentDoctorOptions {
  platform?: RuntimePlatform;
  env?: NodeJS.ProcessEnv;
  requiredCommands?: string[];
  requiredEnvKeys?: string[];
  writableDirectories?: string[];
  commandExists?: CommandExistsChecker;
  portChecker?: PortChecker;
  pathWritableChecker?: PathWritableChecker;
  timeoutMs?: number;
  defaultHost?: string;
  defaultPort?: number;
}

export async function diagnoseEnvironment(
  options: EnvironmentDoctorOptions = {}
): Promise<EnvironmentDoctorReport> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const requiredCommands = options.requiredCommands ?? ['opencode'];
  const requiredEnvKeys = options.requiredEnvKeys ?? [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'OPENCODE_HOST',
    'OPENCODE_PORT',
  ];
  const writableDirectories = options.writableDirectories ?? [
    path.resolve(process.cwd(), 'logs'),
    path.resolve(process.cwd(), 'memory'),
    path.resolve(process.cwd(), '.sisyphus', 'evidence'),
  ];
  const timeoutMs = options.timeoutMs ?? 1200;
  const commandExists = options.commandExists ?? hasCommandInPath;
  const portChecker = options.portChecker ?? checkPortAvailability;
  const pathWritableChecker = options.pathWritableChecker ?? isPathWritable;

  const endpoint = resolveOpencodeEndpoint(env, options.defaultHost ?? 'localhost', options.defaultPort ?? 4096);
  const issues: EnvironmentIssue[] = [];

  for (const command of requiredCommands) {
    const exists = await commandExists(command);
    if (!exists) {
      issues.push({
        code: 'missing_command',
        classification: 'repairable',
        detail: `未检测到命令: ${command}`,
        suggestion: getInstallHint(command, mapPlatformToOs(platform)),
      });
    }
  }

  const missingEnvKeys = requiredEnvKeys.filter(key => !getRuntimeEnvValue(env, key));
  if (missingEnvKeys.length > 0) {
    issues.push({
      code: 'missing_env',
      classification: 'manual_required',
      detail: `缺失关键环境变量: ${missingEnvKeys.join(', ')}`,
      suggestion: '补全 .env 中缺失项后重启服务。',
    });
  }

  const portResult = await portChecker(endpoint.probeHost, endpoint.port, timeoutMs);
  if (!portResult.available) {
    issues.push({
      code: 'port_unavailable',
      classification: 'manual_required',
      detail: `端口不可用: ${endpoint.probeHost}:${endpoint.port} (${portResult.reason})`,
      suggestion: '释放端口或修改 OPENCODE_PORT 后重试。',
    });
  }

  for (const directory of writableDirectories) {
    const writable = await pathWritableChecker(directory);
    if (!writable) {
      issues.push({
        code: 'path_not_writable',
        classification: 'manual_required',
        detail: `目录不可写: ${directory}`,
        suggestion: '调整目录权限或更换可写目录。',
      });
    }
  }

  const summary = summarizeIssues(issues);
  return {
    os: mapPlatformToOs(platform),
    endpoint,
    issues,
    summary,
  };
}

export function mapPlatformToOs(platform: RuntimePlatform): EnvironmentOs {
  if (platform === 'win32') {
    return 'windows';
  }
  if (platform === 'linux') {
    return 'linux';
  }
  if (platform === 'darwin') {
    return 'macos';
  }
  return 'unknown';
}

export function resolveOpencodeEndpoint(
  env: NodeJS.ProcessEnv,
  defaultHost: string,
  defaultPort: number
): { host: string; port: number; probeHost: string } {
  const configuredHost = getRuntimeEnvValue(env, 'OPENCODE_HOST');
  const configuredPort = getRuntimeEnvValue(env, 'OPENCODE_PORT');

  const host = configuredHost || defaultHost;
  const parsedPort = Number.parseInt(configuredPort || String(defaultPort), 10);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : defaultPort;

  return {
    host,
    port,
    probeHost: resolveProbeHost(host),
  };
}

function resolveProbeHost(host: string): string {
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }
  if (host === '::') {
    return '::1';
  }
  return host;
}

function getRuntimeEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function summarizeIssues(issues: EnvironmentIssue[]): EnvironmentDoctorSummary {
  let repairable = 0;
  let manualRequired = 0;

  for (const issue of issues) {
    if (issue.classification === 'repairable') {
      repairable += 1;
      continue;
    }
    manualRequired += 1;
  }

  return {
    totalIssues: issues.length,
    repairable,
    manualRequired,
  };
}

async function hasCommandInPath(command: string): Promise<boolean> {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = await execFileAsync(lookupCommand, [command], {
      windowsHide: true,
      timeout: 1200,
      maxBuffer: 1024 * 1024,
    });
    return (result.stdout || '').trim().length > 0;
  } catch (error) {
    console.error('[environment-doctor] command probe failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

function getInstallHint(command: string, runtimeOs: EnvironmentOs): string {
  if (command !== 'opencode') {
    return `安装并加入 PATH 后重试: ${command}`;
  }
  if (runtimeOs === 'windows') {
    return '可执行: npm i -g opencode-ai，然后重开终端验证 opencode --version。';
  }
  if (runtimeOs === 'linux' || runtimeOs === 'macos') {
    return '可执行: npm i -g opencode-ai，并确认 shell PATH 已包含 npm 全局 bin。';
  }
  return '可执行: npm i -g opencode-ai，然后验证 opencode --version。';
}

export async function checkPortAvailability(
  host: string,
  port: number,
  timeoutMs = 1200
): Promise<PortCheckResult> {
  return new Promise(resolve => {
    const server = net.createServer();
    let settled = false;

    const timer = setTimeout(() => {
      finish(false, 'timeout');
    }, timeoutMs);
    timer.unref();

    const finish = (available: boolean, reason: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      server.removeAllListeners();
      if (server.listening) {
        server.close(() => {
          resolve({ available, reason });
        });
        return;
      }
      resolve({ available, reason });
    };

    server.once('error', error => {
      const reason =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : error instanceof Error
            ? error.message
            : String(error);
      finish(false, reason);
    });

    server.once('listening', () => {
      finish(true, 'available');
    });

    server.listen(port, host);
  });
}

export async function isPathWritable(directory: string): Promise<boolean> {
  const targetPath = path.resolve(directory);
  try {
    await fs.mkdir(targetPath, { recursive: true });
    await fs.access(targetPath, fs.constants.W_OK);
    const probeFilePath = path.join(targetPath, `.doctor-write-${process.pid}-${Date.now()}-${os.hostname()}.tmp`);
    await fs.writeFile(probeFilePath, 'ok', 'utf-8');
    await fs.rm(probeFilePath, { force: true });
    return true;
  } catch {
    return false;
  }
}
