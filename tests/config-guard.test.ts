import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type { AuditEvent, AuditLogger } from '../src/reliability/audit-log.js';
import {
  applyConfigGuardWithFallback,
  rollbackConfigFromBackup,
  type ConfigBackup,
  type ConfigGuardServerFields,
} from '../src/reliability/config-guard.js';

function createAuditRecorder(): { logger: AuditLogger; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    logger: {
      async log(event: AuditEvent): Promise<void> {
        events.push(event);
      },
    },
  };
}

describe('config-guard', () => {
  let tempDir = '';
  let configPath = '';
  let serverFields: ConfigGuardServerFields;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-guard-test-'));
    configPath = path.join(tempDir, 'opencode.json');
    serverFields = {
      host: '127.0.0.1',
      port: 4096,
      auth: {
        username: 'opencode',
        password: 'pw-123',
      },
    };
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('Level 1 应只覆盖 server 关键字段并保留其他配置', async () => {
    await fs.writeFile(
      configPath,
      `${JSON.stringify({
        feature: { enabled: true },
        server: {
          host: 'localhost',
          port: 3000,
          auth: { username: 'old', password: 'old-pw' },
          cors: ['*'],
        },
      }, null, 2)}\n`,
      'utf-8'
    );
    const recorder = createAuditRecorder();

    const result = await applyConfigGuardWithFallback({
      configPath,
      serverFields,
      audit: recorder.logger,
    });

    expect(result.appliedLevel).toBe('level1');
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      feature: { enabled: boolean };
      server: {
        host: string;
        port: number;
        auth: { username: string; password: string };
        cors: string[];
      };
    };

    expect(parsed.feature.enabled).toBe(true);
    expect(parsed.server.host).toBe('127.0.0.1');
    expect(parsed.server.port).toBe(4096);
    expect(parsed.server.auth.username).toBe('opencode');
    expect(parsed.server.auth.password).toBe('pw-123');
    expect(parsed.server.cors).toEqual(['*']);
    expect(result.backup.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(path.basename(result.backup.path)).toMatch(/\.bak\.\d{13}\.[a-f0-9]{64}$/u);
    expect(recorder.events.some(event => event.classification === 'config')).toBe(true);
  });

  it('解析异常时应先备份再写入 Level 1 可恢复配置', async () => {
    await fs.writeFile(configPath, '{invalid-json', 'utf-8');
    const recorder = createAuditRecorder();

    const result = await applyConfigGuardWithFallback({
      configPath,
      serverFields,
      audit: recorder.logger,
    });

    expect(result.appliedLevel).toBe('level1');
    const next = JSON.parse(await fs.readFile(configPath, 'utf-8')) as {
      server: { host: string; port: number; auth: { username: string; password: string } };
    };
    expect(next.server.host).toBe('127.0.0.1');
    expect(next.server.port).toBe(4096);
    expect(next.server.auth.username).toBe('opencode');
    expect(next.server.auth.password).toBe('pw-123');
    expect(recorder.events.some(event => event.action === 'config.parse.failed')).toBe(true);
  });

  it('Level 1 写入失败后应升级到 Level 2 最小模板', async () => {
    await fs.writeFile(configPath, `${JSON.stringify({ feature: { enabled: true } }, null, 2)}\n`, 'utf-8');
    const recorder = createAuditRecorder();
    let writeAttempts = 0;

    const result = await applyConfigGuardWithFallback({
      configPath,
      serverFields,
      audit: recorder.logger,
      io: {
        writeFile: async (targetPath, content) => {
          writeAttempts += 1;
          const isMainConfigWrite = targetPath.includes('opencode.json.') && !targetPath.includes('.bak.');
          if (isMainConfigWrite && writeAttempts === 2) {
            throw new Error('mock level1 write fail');
          }
          await fs.writeFile(targetPath, content, 'utf-8');
        },
      },
    });

    expect(result.appliedLevel).toBe('level2');
    const parsed = JSON.parse(await fs.readFile(configPath, 'utf-8')) as {
      server: { host: string; port: number; auth: { username: string; password: string } };
      reliability: { mode: string };
    };
    expect(parsed.server.host).toBe('127.0.0.1');
    expect(parsed.server.port).toBe(4096);
    expect(parsed.server.auth.username).toBe('opencode');
    expect(parsed.reliability.mode).toBe('observe');
    expect(writeAttempts).toBe(3);
    expect(recorder.events.some(event => event.action === 'config.guard.level1.failed')).toBe(true);
    expect(recorder.events.some(event => event.action === 'config.guard.level2.applied')).toBe(true);
  });

  it('Level 1 和 Level 2 都失败时应抛出异常', async () => {
    await fs.writeFile(configPath, `${JSON.stringify({ feature: true }, null, 2)}\n`, 'utf-8');

    await expect(
      applyConfigGuardWithFallback({
        configPath,
        serverFields,
        io: {
          writeFile: async (targetPath, content) => {
            const isMainConfigWrite = targetPath.includes('opencode.json.') && !targetPath.includes('.bak.');
            if (isMainConfigWrite) {
              throw new Error('always fail');
            }
            await fs.writeFile(targetPath, content, 'utf-8');
          },
        },
      })
    ).rejects.toThrow('always fail');
  });

  it('应支持从备份回滚配置', async () => {
    const originalContent = `${JSON.stringify({ foo: 'bar', server: { host: 'localhost', port: 1 } }, null, 2)}\n`;
    await fs.writeFile(configPath, originalContent, 'utf-8');
    const recorder = createAuditRecorder();

    const result = await applyConfigGuardWithFallback({
      configPath,
      serverFields,
      audit: recorder.logger,
    });

    await fs.writeFile(configPath, `${JSON.stringify({ broken: true }, null, 2)}\n`, 'utf-8');
    await rollbackConfigFromBackup({
      configPath,
      backup: result.backup,
      audit: recorder.logger,
    });

    const restored = await fs.readFile(configPath, 'utf-8');
    expect(restored).toBe(originalContent);
    expect(recorder.events.some(event => event.decision === 'rollback')).toBe(true);
  });

  it('备份哈希应与备份文件内容一致', async () => {
    const content = `${JSON.stringify({ server: { host: 'localhost', port: 3000 } }, null, 2)}\n`;
    await fs.writeFile(configPath, content, 'utf-8');

    const result = await applyConfigGuardWithFallback({
      configPath,
      serverFields,
    });

    const backupRaw = await fs.readFile(result.backup.path, 'utf-8');
    const hash = createHash('sha256').update(backupRaw, 'utf-8').digest('hex');
    expect(hash).toBe(result.backup.sha256);
  });
});
