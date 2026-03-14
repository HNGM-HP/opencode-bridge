import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generateIncidentId, type AuditLogger } from './audit-log.js';

export interface ConfigGuardServerFields {
  host: string;
  port: number;
  auth: {
    username: string;
    password?: string;
  };
}

export interface ConfigBackup {
  path: string;
  timestamp: number;
  sha256: string;
}

export interface ConfigGuardIO {
  readFile?: (filePath: string) => Promise<string>;
  writeFile?: (filePath: string, content: string) => Promise<void>;
  rename?: (fromPath: string, toPath: string) => Promise<void>;
  mkdir?: (dirPath: string) => Promise<void>;
  exists?: (filePath: string) => Promise<boolean>;
}

export interface ApplyConfigGuardOptions {
  configPath: string;
  serverFields: ConfigGuardServerFields;
  level2Template?: Record<string, unknown>;
  audit?: AuditLogger;
  io?: ConfigGuardIO;
}

export interface ApplyConfigGuardResult {
  backup: ConfigBackup;
  appliedLevel: 'level1' | 'level2';
}

export interface RollbackConfigOptions {
  configPath: string;
  backup: ConfigBackup;
  audit?: AuditLogger;
  io?: ConfigGuardIO;
}

const defaultIO: Required<ConfigGuardIO> = {
  async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf-8');
  },
  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.promises.writeFile(filePath, content, 'utf-8');
  },
  async rename(fromPath: string, toPath: string): Promise<void> {
    await fs.promises.rename(fromPath, toPath);
  },
  async mkdir(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  },
  async exists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath);
  },
};

const noOpAuditLogger: AuditLogger = {
  async log(): Promise<void> {
    return;
  },
};

export async function applyConfigGuardWithFallback(
  options: ApplyConfigGuardOptions
): Promise<ApplyConfigGuardResult> {
  const io = resolveIO(options.io);
  const audit = options.audit ?? noOpAuditLogger;
  const backup = await createConfigBackup(options.configPath, io);
  await logAuditSafe(audit, {
    decision: 'create',
    action: 'config.backup.created',
    result: 'success',
    metadata: {
      configPath: options.configPath,
      backupPath: backup.path,
      timestamp: backup.timestamp,
      sha256: backup.sha256,
    },
  });

  const currentConfig = await readCurrentConfig(options.configPath, io, audit);
  const level1Config = buildLevel1Config(currentConfig, options.serverFields);

  try {
    await writeConfigAtomically(options.configPath, level1Config, io);
    await logAuditSafe(audit, {
      decision: 'update',
      action: 'config.guard.level1.applied',
      result: 'success',
      metadata: {
        configPath: options.configPath,
        backupPath: backup.path,
      },
    });
    return { backup, appliedLevel: 'level1' };
  } catch (error) {
    await logAuditSafe(audit, {
      decision: 'update',
      action: 'config.guard.level1.failed',
      result: 'failed',
      metadata: {
        configPath: options.configPath,
        error: normalizeErrorMessage(error),
      },
    });
  }

  const level2Config = options.level2Template ?? buildDefaultLevel2Template(options.serverFields);
  try {
    await writeConfigAtomically(options.configPath, level2Config, io);
    await logAuditSafe(audit, {
      decision: 'update',
      action: 'config.guard.level2.applied',
      result: 'success',
      metadata: {
        configPath: options.configPath,
        backupPath: backup.path,
      },
    });
    return { backup, appliedLevel: 'level2' };
  } catch (error) {
    await logAuditSafe(audit, {
      decision: 'update',
      action: 'config.guard.level2.failed',
      result: 'failed',
      metadata: {
        configPath: options.configPath,
        error: normalizeErrorMessage(error),
      },
    });
    throw error;
  }
}

export async function rollbackConfigFromBackup(options: RollbackConfigOptions): Promise<void> {
  const io = resolveIO(options.io);
  const audit = options.audit ?? noOpAuditLogger;

  const backupExists = await io.exists(options.backup.path);
  if (!backupExists) {
    const error = new Error(`备份不存在：${options.backup.path}`);
    await logAuditSafe(audit, {
      decision: 'rollback',
      action: 'config.rollback.failed',
      result: 'failed',
      metadata: {
        configPath: options.configPath,
        backupPath: options.backup.path,
        error: error.message,
      },
    });
    throw error;
  }

  const backupRaw = await io.readFile(options.backup.path);
  const backupHash = createHash('sha256').update(backupRaw, 'utf-8').digest('hex');
  if (backupHash !== options.backup.sha256) {
    const error = new Error('备份校验失败：sha256 不匹配');
    await logAuditSafe(audit, {
      decision: 'rollback',
      action: 'config.rollback.failed',
      result: 'failed',
      metadata: {
        configPath: options.configPath,
        backupPath: options.backup.path,
        expectedSha256: options.backup.sha256,
        actualSha256: backupHash,
      },
    });
    throw error;
  }

  await writeRawAtomically(options.configPath, backupRaw, io);
  await logAuditSafe(audit, {
    decision: 'rollback',
    action: 'config.rollback.applied',
    result: 'success',
    metadata: {
      configPath: options.configPath,
      backupPath: options.backup.path,
      sha256: options.backup.sha256,
    },
  });
}

async function readCurrentConfig(
  configPath: string,
  io: Required<ConfigGuardIO>,
  audit: AuditLogger
): Promise<Record<string, unknown>> {
  const exists = await io.exists(configPath);
  if (!exists) {
    return {};
  }

  const raw = (await io.readFile(configPath)).trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('配置根节点不是对象');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    await logAuditSafe(audit, {
      decision: 'update',
      action: 'config.parse.failed',
      result: 'failed',
      metadata: {
        configPath,
        error: normalizeErrorMessage(error),
      },
    });
    return {};
  }
}

function buildLevel1Config(
  currentConfig: Record<string, unknown>,
  serverFields: ConfigGuardServerFields
): Record<string, unknown> {
  const currentServer = readObjectRecord(currentConfig.server);
  return {
    ...currentConfig,
    server: {
      ...currentServer,
      host: serverFields.host,
      port: serverFields.port,
      auth: {
        username: serverFields.auth.username,
        ...(serverFields.auth.password ? { password: serverFields.auth.password } : {}),
      },
    },
  };
}

function buildDefaultLevel2Template(serverFields: ConfigGuardServerFields): Record<string, unknown> {
  return {
    server: {
      host: serverFields.host,
      port: serverFields.port,
      auth: {
        username: serverFields.auth.username,
        ...(serverFields.auth.password ? { password: serverFields.auth.password } : {}),
      },
    },
    reliability: {
      mode: 'observe',
      loopbackOnly: true,
    },
  };
}

export async function createConfigBackup(
  configPath: string,
  customIO?: ConfigGuardIO
): Promise<ConfigBackup> {
  const io = resolveIO(customIO);
  const exists = await io.exists(configPath);
  const originalRaw = exists ? await io.readFile(configPath) : '';
  const sha256 = createHash('sha256').update(originalRaw, 'utf-8').digest('hex');
  const timestamp = Date.now();
  const backupPath = `${configPath}.bak.${timestamp}.${sha256}`;
  await writeRawAtomically(backupPath, originalRaw, io);
  return {
    path: backupPath,
    timestamp,
    sha256,
  };
}

async function writeConfigAtomically(
  configPath: string,
  configObject: Record<string, unknown>,
  io: Required<ConfigGuardIO>
): Promise<void> {
  const content = `${JSON.stringify(configObject, null, 2)}\n`;
  await writeRawAtomically(configPath, content, io);
}

async function writeRawAtomically(
  targetPath: string,
  content: string,
  io: Required<ConfigGuardIO>
): Promise<void> {
  const targetDir = path.dirname(targetPath);
  await io.mkdir(targetDir);
  const tmpPath = `${targetPath}.${process.pid}.tmp`;
  await io.writeFile(tmpPath, content);
  await io.rename(tmpPath, targetPath);
}

function resolveIO(customIO?: ConfigGuardIO): Required<ConfigGuardIO> {
  return {
    readFile: customIO?.readFile ?? defaultIO.readFile,
    writeFile: customIO?.writeFile ?? defaultIO.writeFile,
    rename: customIO?.rename ?? defaultIO.rename,
    mkdir: customIO?.mkdir ?? defaultIO.mkdir,
    exists: customIO?.exists ?? defaultIO.exists,
  };
}

function readObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function logAuditSafe(
  audit: AuditLogger,
  input: {
    decision: 'create' | 'update' | 'rollback';
    action: string;
    result: 'success' | 'failed';
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await audit.log({
      incidentId: generateIncidentId(),
      classification: 'config',
      decision: input.decision,
      action: input.action,
      result: input.result,
      timestamp: new Date().toISOString(),
      metadata: input.metadata,
    });
  } catch {
    // 审计日志失败不应阻断配置保护主流程。
  }
}
