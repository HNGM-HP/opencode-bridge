import { describe, expect, it } from 'vitest';
import { FailureType, RescueState } from '../src/reliability/types.js';
import {
  decideRescuePolicy,
  type RescuePolicyInput,
} from '../src/reliability/rescue-policy.js';

const baseInput = (overrides: Partial<RescuePolicyInput> = {}): RescuePolicyInput => {
  return {
    failureType: FailureType.OPENCODE_TCP_DOWN,
    currentState: RescueState.SUSPECT,
    latestAttemptFailed: true,
    nowMs: 200000,
    retry: {
      mode: 'finite',
      attempt: 3,
      maxAttempts: 3,
      failureCount: 3,
      firstFailureAtMs: 100000,
    },
    rescue: {
      targetHost: '127.0.0.1',
      budgetRemaining: 3,
      lastRepairAtMs: undefined,
    },
    ...overrides,
  };
};

describe('rescue-policy', () => {
  it('有限重连在最终失败时进入 repair', () => {
    const decision = decideRescuePolicy(baseInput());

    expect(decision.action).toBe('repair');
    expect(decision.nextState).toBe(RescueState.REPAIRING);
    expect(decision.nextBudgetRemaining).toBe(2);
    expect(decision.reason).toContain('finite_retry_final_failure');
  });

  it('有限重连未到最终失败时保持 wait', () => {
    const decision = decideRescuePolicy(baseInput({
      retry: {
        mode: 'finite',
        attempt: 2,
        maxAttempts: 3,
        failureCount: 2,
        firstFailureAtMs: 150000,
      },
    }));

    expect(decision.action).toBe('wait');
    expect(decision.nextState).toBe(RescueState.SUSPECT);
    expect(decision.nextBudgetRemaining).toBe(3);
    expect(decision.reason).toContain('not_rescue_candidate');
  });

  it('无限重连满足 3 次失败且 >=90 秒时进入 repair', () => {
    const decision = decideRescuePolicy(baseInput({
      retry: {
        mode: 'infinite',
        attempt: 8,
        failureCount: 3,
        firstFailureAtMs: 100000,
      },
    }));

    expect(decision.action).toBe('repair');
    expect(decision.nextState).toBe(RescueState.REPAIRING);
    expect(decision.nextBudgetRemaining).toBe(2);
    expect(decision.reason).toContain('infinite_retry_threshold_met');
  });

  it('无限重连不足 90 秒时保持 wait', () => {
    const decision = decideRescuePolicy(baseInput({
      retry: {
        mode: 'infinite',
        attempt: 8,
        failureCount: 3,
        firstFailureAtMs: 130000,
      },
    }));

    expect(decision.action).toBe('wait');
    expect(decision.nextState).toBe(RescueState.SUSPECT);
    expect(decision.reason).toContain('not_rescue_candidate');
  });

  it('预算耗尽时应进入 manual_required', () => {
    const decision = decideRescuePolicy(baseInput({
      rescue: {
        targetHost: '127.0.0.1',
        budgetRemaining: 0,
        lastRepairAtMs: undefined,
      },
    }));

    expect(decision.action).toBe('manual');
    expect(decision.nextState).toBe(RescueState.MANUAL_REQUIRED);
    expect(decision.nextBudgetRemaining).toBe(0);
    expect(decision.reason).toContain('repair_budget_exhausted');
  });

  it('处于 cooldown 窗口时应 wait', () => {
    const decision = decideRescuePolicy(baseInput({
      rescue: {
        targetHost: '127.0.0.1',
        budgetRemaining: 3,
        lastRepairAtMs: 150000,
      },
    }));

    expect(decision.action).toBe('wait');
    expect(decision.nextState).toBe(RescueState.SUSPECT);
    expect(decision.reason).toContain('cooldown_active');
    expect(decision.cooldownRemainingMs).toBeGreaterThan(0);
  });

  it('loopback-only 开启时远端主机必须人工介入', () => {
    const decision = decideRescuePolicy(baseInput({
      rescue: {
        targetHost: '10.0.0.12',
        budgetRemaining: 3,
        lastRepairAtMs: undefined,
      },
    }));

    expect(decision.action).toBe('manual');
    expect(decision.nextState).toBe(RescueState.MANUAL_REQUIRED);
    expect(decision.reason).toContain('loopback_only_blocked');
  });

  it('非失败事件应保持 observe', () => {
    const decision = decideRescuePolicy(baseInput({
      latestAttemptFailed: false,
      currentState: RescueState.HEALTHY,
    }));

    expect(decision.action).toBe('observe');
    expect(decision.nextState).toBe(RescueState.HEALTHY);
    expect(decision.reason).toContain('no_new_failure');
  });

  it('taxonomy 非可修复故障应直接人工介入', () => {
    const decision = decideRescuePolicy(baseInput({
      failureType: FailureType.OPENCODE_AUTH_INVALID,
      currentState: RescueState.DEGRADED,
    }));

    expect(decision.action).toBe('manual');
    expect(decision.nextState).toBe(RescueState.MANUAL_REQUIRED);
    expect(decision.reason).toContain('taxonomy_manual_required');
  });
});
