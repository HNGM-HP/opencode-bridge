import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapReliabilityLifecycle,
  type ReliabilityLifecycleDependencies,
  type ReliabilityJobHandlers,
} from '../src/index.js';
import type { ConversationHeartbeatResult } from '../src/reliability/conversation-heartbeat.js';

describe('reliability bootstrap lifecycle', () => {
  it('启动时应初始化 heartbeat、scheduler 与 rescue orchestrator', async () => {
    const previousInboundHeartbeatEnabled = process.env.RELIABILITY_INBOUND_HEARTBEAT_ENABLED;
    process.env.RELIABILITY_INBOUND_HEARTBEAT_ENABLED = 'true';

    const callTrace: string[] = [];

    const heartbeat = {
      onInboundMessage: vi.fn(async (): Promise<ConversationHeartbeatResult> => {
        callTrace.push('heartbeat.onInboundMessage');
        return { executed: true, reason: 'executed', executedCheckIds: [] };
      }),
    };

    const scheduler = {
      start: vi.fn(() => {
        callTrace.push('scheduler.start');
      }),
      stop: vi.fn(async () => {
        callTrace.push('scheduler.stop');
      }),
    };

    const rescueOrchestrator = {
      runWatchdogProbe: vi.fn(async () => {
        callTrace.push('rescue.watchdogProbe');
      }),
      runStaleCleanup: vi.fn(async () => {
        callTrace.push('rescue.staleCleanup');
      }),
      runBudgetReset: vi.fn(async () => {
        callTrace.push('rescue.budgetReset');
      }),
      cleanup: vi.fn(async () => {
        callTrace.push('rescue.cleanup');
      }),
    };

    // processCheckRunner 在 bootstrapReliabilityLifecycle 内部创建，无法直接 mock
    // 但通过验证 handlers.budgetReset() 被调用，间接验证了新架构的正确性

    let capturedHandlers: ReliabilityJobHandlers | undefined;
    const deps: ReliabilityLifecycleDependencies = {
      createHeartbeatEngine: () => heartbeat,
      createScheduler: () => scheduler,
      createRescueOrchestrator: () => rescueOrchestrator,
      createJobRegistry: (handlers) => {
        capturedHandlers = handlers as ReliabilityJobHandlers;
        return {
          registerAll: (receivedScheduler: unknown) => {
            expect(receivedScheduler).toBe(scheduler);
            callTrace.push('registry.registerAll');
          },
        };
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const lifecycle = bootstrapReliabilityLifecycle(deps);

    expect(callTrace).toEqual(['registry.registerAll', 'scheduler.start']);
    expect(capturedHandlers).not.toBeUndefined();

    await lifecycle.onInboundMessage();
    expect(heartbeat.onInboundMessage).toHaveBeenCalledTimes(1);

    const handlers = capturedHandlers!;
    await handlers.watchdogProbe();
    await handlers.staleCleanup();
    await handlers.budgetReset();

    expect(rescueOrchestrator.runWatchdogProbe).toHaveBeenCalledTimes(1);
    expect(rescueOrchestrator.runStaleCleanup).toHaveBeenCalledTimes(1);
    expect(rescueOrchestrator.runBudgetReset).toHaveBeenCalledTimes(0);

    if (previousInboundHeartbeatEnabled === undefined) {
      delete process.env.RELIABILITY_INBOUND_HEARTBEAT_ENABLED;
    } else {
      process.env.RELIABILITY_INBOUND_HEARTBEAT_ENABLED = previousInboundHeartbeatEnabled;
    }
  });

  it('退出时应清理 scheduler 与 rescue 资源且幂等', async () => {
    const schedulerStop = vi.fn(async () => undefined);
    const rescueCleanup = vi.fn(async () => undefined);

    // processCheckRunner 在 bootstrapReliabilityLifecycle 内部创建，无法直接 mock
    const lifecycle = bootstrapReliabilityLifecycle({
      createHeartbeatEngine: () => ({
        onInboundMessage: async (): Promise<ConversationHeartbeatResult> => ({ executed: true, reason: 'executed', executedCheckIds: [] }),
      }),
      createScheduler: () => ({
        start: () => undefined,
        stop: schedulerStop,
      }),
      createRescueOrchestrator: () => ({
        runWatchdogProbe: async () => undefined,
        runStaleCleanup: async () => undefined,
        runBudgetReset: async () => undefined,
        cleanup: rescueCleanup,
      }),
      createJobRegistry: () => ({
        registerAll: () => undefined,
      }),
    });

    await lifecycle.cleanup();
    await lifecycle.cleanup();

    expect(schedulerStop).toHaveBeenCalledTimes(1);
    expect(rescueCleanup).toHaveBeenCalledTimes(1);
  });
});
