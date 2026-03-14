import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type AuditEvent, type AuditLogger } from '../src/reliability/audit-log.js';
import {
  applyConfigGuardWithFallback,
  type ApplyConfigGuardResult,
  type ConfigGuardIO,
  type ConfigGuardServerFields,
} from '../src/reliability/config-guard.js';
import { decideRescuePolicy, type RescuePolicyDecision, type RescuePolicyInput } from '../src/reliability/rescue-policy.js';
import { FailureType, RescueState } from '../src/reliability/types.js';

interface RecoveryContextPayload {
  sessionId: string;
  failureType: FailureType;
  rescueReason: string;
  appliedLevel: 'level1' | 'level2' | 'manual';
  nextState: RescueState;
}

interface RescuePipelineResult {
  decision: RescuePolicyDecision;
  guardResult: ApplyConfigGuardResult | null;
  finalState: RescueState;
}

class OpenCodeMock {
  private readonly receivedContexts: RecoveryContextPayload[] = [];

  receiveRecoveryContext(payload: RecoveryContextPayload): void {
    this.receivedContexts.push(payload);
  }

  getRecoveryContexts(): RecoveryContextPayload[] {
    return [...this.receivedContexts];
  }
}

class RecoveryReporter {
  constructor(private readonly openCode: OpenCodeMock) {}

  async report(payload: RecoveryContextPayload): Promise<void> {
    this.openCode.receiveRecoveryContext(payload);
  }
}

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

function createBaseInput(overrides: Partial<RescuePolicyInput> = {}): RescuePolicyInput {
  return {
    failureType: FailureType.OPENCODE_TCP_DOWN,
    currentState: RescueState.DEGRADED,
    latestAttemptFailed: true,
    nowMs: 200_000,
    retry: {
      mode: 'finite',
      attempt: 3,
      maxAttempts: 3,
      failureCount: 3,
      firstFailureAtMs: 100_000,
    },
    rescue: {
      targetHost: '127.0.0.1',
      budgetRemaining: 3,
      lastRepairAtMs: undefined,
    },
    ...overrides,
  };
}

async function runRescuePipeline(options: {
  input: RescuePolicyInput;
  configPath: string;
  serverFields: ConfigGuardServerFields;
  reporter: RecoveryReporter;
  audit: AuditLogger;
  io?: ConfigGuardIO;
  sessionId: string;
}): Promise<RescuePipelineResult> {
  const decision = decideRescuePolicy(options.input);
  if (decision.action !== 'repair') {
    return {
      decision,
      guardResult: null,
      finalState: decision.nextState,
    };
  }

  const guardResult = await applyConfigGuardWithFallback({
    configPath: options.configPath,
    serverFields: options.serverFields,
    audit: options.audit,
    io: options.io,
  });

  const finalState = RescueState.RECOVERED;
  await options.reporter.report({
    sessionId: options.sessionId,
    failureType: options.input.failureType,
    rescueReason: decision.reason,
    appliedLevel: guardResult.appliedLevel,
    nextState: finalState,
  });

  return {
    decision,
    guardResult,
    finalState,
  };
}

describe('reliability rescue e2e', () => {
  let tempDir = '';
  let configPath = '';
  let serverFields: ConfigGuardServerFields;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reliability-rescue-e2e-'));
    configPath = path.join(tempDir, 'opencode.json');
    serverFields = {
      host: '127.0.0.1',
      port: 4096,
      auth: {
        username: 'opencode',
        password: 'pw-123',
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify({ feature: { enabled: true } }, null, 2)}\n`, 'utf-8');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('有限重连最终失败触发救援', async () => {
    const openCode = new OpenCodeMock();
    const reporter = new RecoveryReporter(openCode);
    const recorder = createAuditRecorder();

    const result = await runRescuePipeline({
      input: createBaseInput({
        retry: {
          mode: 'finite',
          attempt: 3,
          maxAttempts: 3,
          failureCount: 3,
          firstFailureAtMs: 110_000,
        },
      }),
      configPath,
      serverFields,
      reporter,
      audit: recorder.logger,
      sessionId: 'sess-finite-001',
    });

    expect(result.decision.action).toBe('repair');
    expect(result.decision.reason).toBe('finite_retry_final_failure');
    expect(result.guardResult?.appliedLevel).toBe('level1');
    expect(result.finalState).toBe(RescueState.RECOVERED);
    expect(openCode.getRecoveryContexts()).toHaveLength(1);
    expect(recorder.events.some(event => event.action === 'config.guard.level1.applied')).toBe(true);
  });

  it('无限重连达到 3 次失败且 90 秒阈值后触发救援', async () => {
    const openCode = new OpenCodeMock();
    const reporter = new RecoveryReporter(openCode);
    const recorder = createAuditRecorder();

    const result = await runRescuePipeline({
      input: createBaseInput({
        nowMs: 191_000,
        retry: {
          mode: 'infinite',
          attempt: 9,
          failureCount: 3,
          firstFailureAtMs: 100_000,
        },
      }),
      configPath,
      serverFields,
      reporter,
      audit: recorder.logger,
      sessionId: 'sess-infinite-001',
    });

    expect(result.decision.action).toBe('repair');
    expect(result.decision.reason).toBe('infinite_retry_threshold_met');
    expect(result.guardResult?.appliedLevel).toBe('level1');
    expect(openCode.getRecoveryContexts()).toHaveLength(1);
  });

  it('Level 1 失败时升级到 Level 2', async () => {
    const openCode = new OpenCodeMock();
    const reporter = new RecoveryReporter(openCode);
    const recorder = createAuditRecorder();
    let writeAttempts = 0;

    const io: ConfigGuardIO = {
      writeFile: async (targetPath, content) => {
        writeAttempts += 1;
        const isMainConfigWrite = targetPath.includes('opencode.json.') && !targetPath.includes('.bak.');
        if (isMainConfigWrite && writeAttempts === 2) {
          throw new Error('mock level1 write fail');
        }
        await fs.writeFile(targetPath, content, 'utf-8');
      },
    };

    const result = await runRescuePipeline({
      input: createBaseInput(),
      configPath,
      serverFields,
      reporter,
      audit: recorder.logger,
      io,
      sessionId: 'sess-level2-001',
    });

    expect(result.decision.action).toBe('repair');
    expect(result.guardResult?.appliedLevel).toBe('level2');
    expect(writeAttempts).toBe(3);
    expect(recorder.events.some(event => event.action === 'config.guard.level1.failed')).toBe(true);
    expect(recorder.events.some(event => event.action === 'config.guard.level2.applied')).toBe(true);
  });

  it('恢复后 reporter 向 OpenCode 下发修复上下文', async () => {
    const openCode = new OpenCodeMock();
    const reporter = new RecoveryReporter(openCode);
    const recorder = createAuditRecorder();

    const result = await runRescuePipeline({
      input: createBaseInput({
        failureType: FailureType.OPENCODE_HTTP_DOWN,
      }),
      configPath,
      serverFields,
      reporter,
      audit: recorder.logger,
      sessionId: 'sess-report-001',
    });

    const contexts = openCode.getRecoveryContexts();
    expect(result.finalState).toBe(RescueState.RECOVERED);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toEqual({
      sessionId: 'sess-report-001',
      failureType: FailureType.OPENCODE_HTTP_DOWN,
      rescueReason: 'finite_retry_final_failure',
      appliedLevel: 'level1',
      nextState: RescueState.RECOVERED,
    });
  });

  it('remote host should trigger manual_required, not repair', async () => {
    const openCode = new OpenCodeMock();
    const reporter = new RecoveryReporter(openCode);
    const recorder = createAuditRecorder();

    const decision = decideRescuePolicy(createBaseInput({
      retry: {
        mode: 'finite',
        attempt: 3,
        maxAttempts: 3,
        failureCount: 3,
        firstFailureAtMs: 110_000,
      },
      rescue: {
        targetHost: '192.168.1.10',
        budgetRemaining: 3,
        lastRepairAtMs: undefined,
      },
    }));

    expect(decision.action).toBe('manual');
    expect(decision.reason).toBe('loopback_only_blocked');
    expect(decision.nextState).toBe(RescueState.MANUAL_REQUIRED);
    expect(decision.nextBudgetRemaining).toBe(3);

    await fs.mkdir('.sisyphus/evidence', { recursive: true });
    await fs.writeFile(
      '.sisyphus/evidence/task-15-remote-host-guard.txt',
      [
        'Task 15: 非 loopback 主机拒绝自动救援',
        '=====================================',
        '',
        '测试场景:',
        '- 目标主机：192.168.1.10 (非 loopback)',
        '- 救援策略：loopbackOnly = true',
        '',
        '决策结果:',
        `- action: ${decision.action}`,
        `- reason: ${decision.reason}`,
        `- nextState: ${decision.nextState}`,
        `- nextBudgetRemaining: ${decision.nextBudgetRemaining}`,
        '',
        '验证规则:',
        '根据 src/reliability/rescue-policy.ts:136 loopback 检查',
        '当 loopbackOnly=true 且 targetHost 非 localhost/127.0.0.1/::1 时',
        '必须返回 manual_required，禁止自动救援',
        '',
        '测试时间:',
        new Date().toISOString(),
      ].join('\n'),
      'utf-8',
    );
  });
});
