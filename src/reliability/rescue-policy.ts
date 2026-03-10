import { reliabilityConfig } from '../config.js';
import { FailureType, RescueState } from './types.js';

export type RescuePolicyAction = 'observe' | 'wait' | 'repair' | 'manual';
export type RetryMode = 'finite' | 'infinite';

export interface RescueRetryContext {
  mode: RetryMode;
  attempt: number;
  maxAttempts?: number;
  failureCount: number;
  firstFailureAtMs: number;
}

export interface RescueRuntimeContext {
  targetHost: string;
  budgetRemaining: number;
  lastRepairAtMs?: number;
}

export interface RescuePolicyInput {
  failureType: FailureType;
  currentState: RescueState;
  latestAttemptFailed: boolean;
  nowMs: number;
  retry: RescueRetryContext;
  rescue: RescueRuntimeContext;
}

export interface RescuePolicyConfig {
  failureThreshold: number;
  windowMs: number;
  cooldownMs: number;
  repairBudget: number;
  loopbackOnly: boolean;
}

export interface RescuePolicyDecision {
  action: RescuePolicyAction;
  reason: string;
  nextState: RescueState;
  nextBudgetRemaining: number;
  cooldownRemainingMs: number;
}

const NON_REPAIRABLE_FAILURE_TYPES = new Set<FailureType>([
  FailureType.BRIDGE_BOOT_FAILED,
  FailureType.OPENCODE_AUTH_INVALID,
]);

const DEFAULT_POLICY_CONFIG: RescuePolicyConfig = {
  failureThreshold: reliabilityConfig.failureThreshold,
  windowMs: reliabilityConfig.windowMs,
  cooldownMs: reliabilityConfig.cooldownMs,
  repairBudget: reliabilityConfig.repairBudget,
  loopbackOnly: reliabilityConfig.loopbackOnly,
};

function clampToNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function isLoopbackHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1';
}

function isFiniteRetryCandidate(retry: RescueRetryContext): boolean {
  if (!Number.isFinite(retry.maxAttempts) || (retry.maxAttempts as number) <= 0) {
    return false;
  }
  return retry.attempt >= (retry.maxAttempts as number);
}

function isInfiniteRetryCandidate(retry: RescueRetryContext, nowMs: number, config: RescuePolicyConfig): boolean {
  const elapsedMs = clampToNonNegative(nowMs - retry.firstFailureAtMs);
  return retry.failureCount >= config.failureThreshold
    && elapsedMs >= config.windowMs;
}

function buildDecision(
  action: RescuePolicyAction,
  reason: string,
  nextState: RescueState,
  nextBudgetRemaining: number,
  cooldownRemainingMs: number = 0,
): RescuePolicyDecision {
  return {
    action,
    reason,
    nextState,
    nextBudgetRemaining,
    cooldownRemainingMs,
  };
}

export function decideRescuePolicy(
  input: RescuePolicyInput,
  overrides: Partial<RescuePolicyConfig> = {},
): RescuePolicyDecision {
  const config: RescuePolicyConfig = {
    ...DEFAULT_POLICY_CONFIG,
    ...overrides,
  };

  const currentBudget = Math.min(
    clampToNonNegative(input.rescue.budgetRemaining),
    clampToNonNegative(config.repairBudget),
  );

  if (!input.latestAttemptFailed) {
    return buildDecision('observe', 'no_new_failure', input.currentState, currentBudget);
  }

  if (NON_REPAIRABLE_FAILURE_TYPES.has(input.failureType)) {
    return buildDecision('manual', 'taxonomy_manual_required', RescueState.MANUAL_REQUIRED, currentBudget);
  }

  const isRetryCandidate = input.retry.mode === 'finite'
    ? isFiniteRetryCandidate(input.retry)
    : isInfiniteRetryCandidate(input.retry, input.nowMs, config);

  if (!isRetryCandidate) {
    return buildDecision('wait', 'not_rescue_candidate', input.currentState, currentBudget);
  }

  if (config.loopbackOnly && !isLoopbackHost(input.rescue.targetHost)) {
    return buildDecision('manual', 'loopback_only_blocked', RescueState.MANUAL_REQUIRED, currentBudget);
  }

  if (currentBudget <= 0) {
    return buildDecision('manual', 'repair_budget_exhausted', RescueState.MANUAL_REQUIRED, currentBudget);
  }

  const lastRepairAtMs = input.rescue.lastRepairAtMs;
  if (typeof lastRepairAtMs === 'number' && Number.isFinite(lastRepairAtMs)) {
    const elapsedSinceLastRepair = clampToNonNegative(input.nowMs - lastRepairAtMs);
    if (elapsedSinceLastRepair < config.cooldownMs) {
      return buildDecision(
        'wait',
        'cooldown_active',
        input.currentState,
        currentBudget,
        config.cooldownMs - elapsedSinceLastRepair,
      );
    }
  }

  const candidateReason = input.retry.mode === 'finite'
    ? 'finite_retry_final_failure'
    : 'infinite_retry_threshold_met';

  return buildDecision(
    'repair',
    candidateReason,
    RescueState.REPAIRING,
    currentBudget - 1,
  );
}
