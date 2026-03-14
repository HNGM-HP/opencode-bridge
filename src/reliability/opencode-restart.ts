import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { opencodeConfig, reliabilityConfig } from '../config.js';
import { probeOpenCodeHealth } from './opencode-probe.js';
import { checkOpenCodeSingleInstance, type ProcessGuardResult } from './process-guard.js';

type ProbeHealthFn = (options: { host: string; port: number }) => Promise<{ ok: boolean }>;
type CheckSingleInstanceFn = (options: {
  pidFilePath: string;
  host: string;
  port: number;
  timeoutMs?: number;
  processKeywords?: string[];
}) => Promise<ProcessGuardResult>;
type KillProcessFn = (pid: number) => void;
type StartProcessFn = () => Promise<void>;
type SleepFn = (ms: number) => Promise<void>;

export interface RestartOpenCodeOptions {
  host?: string;
  port?: number;
  pidFilePath?: string;
  processKeywords?: string[];
  healthCheckRetries?: number;
  healthCheckIntervalMs?: number;
  checkSingleInstance?: CheckSingleInstanceFn;
  killProcess?: KillProcessFn;
  startProcess?: StartProcessFn;
  probeHealth?: ProbeHealthFn;
  sleep?: SleepFn;
}

export interface RestartOpenCodeResult {
  ok: boolean;
  reason:
    | 'loopback_only_blocked'
    | 'stop_failed'
    | 'start_failed'
    | 'health_check_failed'
    | 'restarted';
  host: string;
  port: number;
  killedPids: number[];
  failedToKillPids: number[];
}

export async function restartOpenCodeProcess(options: RestartOpenCodeOptions = {}): Promise<RestartOpenCodeResult> {
  const host = options.host ?? opencodeConfig.host;
  const port = options.port ?? opencodeConfig.port;
  const pidFilePath = options.pidFilePath ?? './logs/opencode.pid';
  const processKeywords = options.processKeywords ?? ['opencode'];
  const healthCheckRetries = options.healthCheckRetries ?? 6;
  const healthCheckIntervalMs = options.healthCheckIntervalMs ?? 1000;
  const checkSingleInstance = options.checkSingleInstance ?? checkOpenCodeSingleInstance;
  const killProcess = options.killProcess ?? ((pid: number) => {
    process.kill(pid);
  });
  const startProcess = options.startProcess ?? defaultStartProcess;
  const probeHealth = options.probeHealth ?? probeOpenCodeHealth;
  const sleep = options.sleep ?? defaultSleep;

  if (reliabilityConfig.loopbackOnly && !isLoopbackHost(host)) {
    return {
      ok: false,
      reason: 'loopback_only_blocked',
      host,
      port,
      killedPids: [],
      failedToKillPids: [],
    };
  }

  const snapshot = await checkSingleInstance({
    pidFilePath,
    host,
    port,
    processKeywords,
  });

  const killedPids: number[] = [];
  const failedToKillPids: number[] = [];
  for (const pid of snapshot.runningPids) {
    try {
      killProcess(pid);
      killedPids.push(pid);
    } catch (error) {
      if (!isNoSuchProcessError(error)) {
        failedToKillPids.push(pid);
      }
    }
  }

  if (failedToKillPids.length > 0) {
    return {
      ok: false,
      reason: 'stop_failed',
      host,
      port,
      killedPids,
      failedToKillPids,
    };
  }

  await fs.rm(pidFilePath, { force: true }).catch(() => undefined);

  try {
    await startProcess();
  } catch {
    return {
      ok: false,
      reason: 'start_failed',
      host,
      port,
      killedPids,
      failedToKillPids,
    };
  }

  for (let attempt = 0; attempt < healthCheckRetries; attempt += 1) {
    const health = await probeHealth({ host, port });
    if (health.ok) {
      return {
        ok: true,
        reason: 'restarted',
        host,
        port,
        killedPids,
        failedToKillPids,
      };
    }
    if (attempt < healthCheckRetries - 1) {
      await sleep(healthCheckIntervalMs);
    }
  }

  return {
    ok: false,
    reason: 'health_check_failed',
    host,
    port,
    killedPids,
    failedToKillPids,
  };
}

export function formatRestartResultText(result: RestartOpenCodeResult): string {
  if (result.ok) {
    return [
      '✅ OpenCode 已重启成功',
      `- endpoint: ${result.host}:${result.port}`,
      `- stoppedPids: ${result.killedPids.length > 0 ? result.killedPids.join(',') : 'none'}`,
    ].join('\n');
  }

  switch (result.reason) {
    case 'loopback_only_blocked':
      return `❌ 已拒绝重启：当前 host=${result.host} 非本地 loopback（受 RELIABILITY_LOOPBACK_ONLY 保护）`;
    case 'stop_failed':
      return `❌ 重启失败：无法停止进程 pid=${result.failedToKillPids.join(',')}`;
    case 'start_failed':
      return '❌ 重启失败：OpenCode 启动命令执行失败';
    case 'health_check_failed':
      return `❌ 重启失败：启动后健康检查未通过（${result.host}:${result.port}）`;
    default:
      return '❌ 重启失败：未知原因';
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1';
}

function isNoSuchProcessError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if (!('code' in error)) {
    return false;
  }
  const code = String((error as { code?: unknown }).code || '');
  return code === 'ESRCH';
}

async function defaultStartProcess(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    try {
      const child = spawn('opencode', [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      setTimeout(() => resolve(), 500);
    } catch (error) {
      reject(error);
    }
  });
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}
