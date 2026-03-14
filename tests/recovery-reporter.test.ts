import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent, AuditLogger } from '../src/reliability/audit-log.js';
import { FailureType } from '../src/reliability/types.js';
import {
  reportRecoveryContext,
  type RecoveryReporterClient,
  type ReportRecoveryContextInput,
} from '../src/reliability/recovery-reporter.js';

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

function createInput(): ReportRecoveryContextInput {
  return {
    failureType: FailureType.OPENCODE_AUTH_INVALID,
    failureReason: '连接恢复后发现 password=super-secret，需重新认证',
    backupPath: '/secure/opencode.json.bak.123',
    nextActions: [
      '回滚到备份配置并重启服务',
      '校验服务端 Basic Auth 配置一致性',
    ],
    selfCheckCommands: [
      'npm run build',
      'npm test -- tests/recovery-reporter.test.ts',
    ],
    context: {
      OPENCODE_SERVER_PASSWORD: 'plain-password',
      token: 'abc-token',
      detail: 'manual-check-required',
    },
    directory: '/workspace',
  };
}

describe('recovery-reporter', () => {
  it('应发送包含故障原因/备份路径/建议动作的完整模板，并自动脱敏敏感字段', async () => {
    const sendMessageAsync = vi.fn(async () => {
      return;
    });
    const createSession = vi.fn(async () => ({ id: 'session-new-1' }));
    const client: RecoveryReporterClient = {
      sendMessageAsync,
      createSession,
    };
    const recorder = createAuditRecorder();

    const result = await reportRecoveryContext(createInput(), {
      client,
      audit: recorder.logger,
    });

    expect(result.sent).toBe(true);
    expect(result.sessionId).toBe('session-new-1');
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(sendMessageAsync).toHaveBeenCalledTimes(1);
    const firstCall = sendMessageAsync.mock.calls[0] as unknown as [string, string, { directory?: string } | undefined];
    expect(firstCall[0]).toBe('session-new-1');
    expect(firstCall[2]).toEqual({ directory: '/workspace' });
    expect(firstCall[1]).toContain('故障原因');
    expect(firstCall[1]).toContain('备份配置路径');
    expect(firstCall[1]).toContain('建议还原动作');
    expect(firstCall[1]).toContain('自检指令');
    expect(firstCall[1]).toContain('nextAction');
    expect(firstCall[1]).toContain('/secure/opencode.json.bak.123');
    expect(firstCall[1]).not.toContain('plain-password');
    expect(firstCall[1]).not.toContain('abc-token');
    expect(firstCall[1]).not.toContain('super-secret');
    expect(firstCall[1]).toContain('***');
    expect(recorder.events.some(event => event.action === 'recovery.report.attempt')).toBe(true);
    expect(recorder.events.some(event => event.action === 'recovery.report.sent')).toBe(true);
  });

  it('发送失败时应降级为仅审计，不应抛出异常', async () => {
    const sendMessageAsync = vi.fn(async () => {
      throw new Error('network down');
    });
    const createSession = vi.fn(async () => ({ id: 'session-existing' }));
    const client: RecoveryReporterClient = {
      sendMessageAsync,
      createSession,
    };
    const recorder = createAuditRecorder();

    const result = await reportRecoveryContext(
      {
        ...createInput(),
        sessionId: 'session-existing',
      },
      {
        client,
        audit: recorder.logger,
      }
    );

    expect(result.sent).toBe(false);
    expect(result.sessionId).toBe('session-existing');
    expect(result.error).toContain('network down');
    expect(createSession).not.toHaveBeenCalled();
    expect(sendMessageAsync).toHaveBeenCalledTimes(1);
    expect(recorder.events.some(event => event.action === 'recovery.report.attempt')).toBe(true);
    expect(recorder.events.some(event => event.action === 'recovery.report.failed')).toBe(true);
  });
});
