/**
 * Reliability Bootstrap — 可靠性系统启动装配
 *
 * 组装心跳、定时调度、救援编排、运行时 cron、进程检查等可靠性组件
 */

import { reliabilityConfig } from '../config.js';
import { opencodeClient } from '../opencode/client.js';
import { chatSessionStore } from '../store/chat-session.js';
import { getCachedAdapter, getSenderByPlatform } from '../platform/loader.js';
import { ConversationHeartbeatEngine } from './conversation-heartbeat.js';
import { CronScheduler } from './scheduler.js';
import { createInternalJobRegistry } from './job-registry.js';
import { createProcessCheckJobRunner, createRepairBudgetState } from './process-check-job.js';
import { createProactiveHeartbeatRunner } from './proactive-heartbeat.js';
import { RuntimeCronManager, setRuntimeCronManager, createRuntimeCronDispatcher, scanAndCleanupOrphanRuntimeCronJobs } from './runtime-cron.js';
import { createCronApiServer } from './cron-api-server.js';
import { createRescueOrchestrator, type ReliabilityRescueOrchestrator } from './rescue-orchestrator.js';

export interface ReliabilityJobHandlers {
  watchdogProbe: () => Promise<void>;
  processConsistencyCheck: () => Promise<void>;
  staleCleanup: () => Promise<void>;
  budgetReset: () => Promise<void>;
}

export interface ReliabilityScheduler {
  start: () => void;
  stop: () => Promise<void>;
}

export interface ReliabilityLifecycleDependencies {
  createHeartbeatEngine?: () => Pick<ConversationHeartbeatEngine, 'onInboundMessage'>;
  createScheduler?: () => ReliabilityScheduler;
  createRescueOrchestrator?: () => ReliabilityRescueOrchestrator;
  createJobRegistry?: (handlers: ReliabilityJobHandlers) => {
    registerAll: (scheduler: ReliabilityScheduler) => void;
  };
  logger?: Pick<Console, 'info' | 'error'>;
}

export interface ReliabilityLifecycle {
  onInboundMessage: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export const bootstrapReliabilityLifecycle = (
  dependencies: ReliabilityLifecycleDependencies = {}
): ReliabilityLifecycle => {
  const logger = dependencies.logger ?? console;
  const shouldUseInboundHeartbeat = reliabilityConfig.inboundHeartbeatEnabled || Boolean(dependencies.createHeartbeatEngine);
  const heartbeatEngine = dependencies.createHeartbeatEngine?.()
    ?? new ConversationHeartbeatEngine({
      windowMs: reliabilityConfig.heartbeatIntervalMs,
    });
  const scheduler = dependencies.createScheduler?.() ?? new CronScheduler();
  const rescueOrchestrator = dependencies.createRescueOrchestrator?.() ?? createRescueOrchestrator(logger);

  // 初始化 process check job runner
  const repairBudgetState = createRepairBudgetState(reliabilityConfig.repairBudget);
  const processCheckRunner = createProcessCheckJobRunner({
    bridgePidFilePath: './logs/bridge.pid',
    opencodePidFilePath: './logs/opencode.pid',
    opencodeHost: 'localhost',
    opencodePort: 4096,
    repairBudgetState,
    staleLockPaths: [],
  });

  const jobHandlers: ReliabilityJobHandlers = {
    watchdogProbe: async () => {
      await rescueOrchestrator.runWatchdogProbe();
    },
    processConsistencyCheck: async () => {
      await processCheckRunner.checkProcessConsistency();
    },
    staleCleanup: async () => {
      await rescueOrchestrator.runStaleCleanup();
      await cleanupOrphanCronJobs();
    },
    budgetReset: async () => {
      await processCheckRunner.resetBudget();
    },
  };

  const registry = dependencies.createJobRegistry?.(jobHandlers)
    ?? {
      registerAll: (injectedScheduler: ReliabilityScheduler) => {
        if (!(injectedScheduler instanceof CronScheduler)) {
          throw new Error('[Reliability] 默认任务注册器要求 CronScheduler 实例');
        }
        createInternalJobRegistry({
          handlers: jobHandlers,
        }).registerAll(injectedScheduler as CronScheduler);
      },
    };

  registry.registerAll(scheduler);

  let runtimeCronManager: RuntimeCronManager | null = null;
  const runtimeCronDispatcher = createRuntimeCronDispatcher({
    getSessionById: async (sessionId, options) => {
      return await opencodeClient.getSessionById(sessionId, options);
    },
    sendMessage: async (sessionId, text, options) => {
      return await opencodeClient.sendMessage(sessionId, text, options);
    },
    sendMessageAsync: async (sessionId, text, options) => {
      await opencodeClient.sendMessageAsync(sessionId, text, options);
      return true;
    },
    getSender: platform => {
      return getSenderByPlatform(platform);
    },
    logger: {
      info: message => { logger.info(message); },
      warn: message => { logger.info(message); },
      error: (...args: unknown[]) => { logger.error('[RuntimeCronDispatch]', ...args); },
    },
  });
  if (scheduler instanceof CronScheduler) {
    runtimeCronManager = new RuntimeCronManager({
      scheduler,
      filePath: reliabilityConfig.cronJobsFile,
      dispatchPayload: async (job) => {
        await runtimeCronDispatcher.dispatch(job);
      },
      logger: {
        info: message => { logger.info(message); },
        warn: message => { logger.info(message); },
        error: (...args: unknown[]) => { logger.error('[RuntimeCron]', ...args); },
      },
    });
    setRuntimeCronManager(runtimeCronManager);
  } else {
    logger.info('[Reliability] 当前 scheduler 非 CronScheduler，跳过 runtime cron manager 注入');
    setRuntimeCronManager(null);
  }

  const cleanupOrphanCronJobs = async (): Promise<void> => {
    if (!runtimeCronManager || !reliabilityConfig.cronOrphanAutoCleanup) {
      return;
    }

    const cleanup = await scanAndCleanupOrphanRuntimeCronJobs(runtimeCronManager, {
      hasConversationBinding: (platform, conversationId, sessionId) => {
        const binding = chatSessionStore.getSessionByConversation(platform, conversationId);
        if (!binding) {
          return false;
        }
        return !sessionId || binding.sessionId === sessionId;
      },
      getSessionStatus: async (sessionId, directory) => {
        try {
          const session = await opencodeClient.getSessionById(
            sessionId,
            directory ? { directory } : undefined
          );
          return session ? 'exists' : 'missing';
        } catch {
          return 'unknown';
        }
      },
    });

    if (cleanup.removedJobIds.length > 0) {
      logger.info(`[RuntimeCron] orphan cleanup removed ${cleanup.removedJobIds.length} job(s)`);
    }
  };

  const proactiveHeartbeatRunner = createProactiveHeartbeatRunner({
    enabled: reliabilityConfig.proactiveHeartbeatEnabled,
    intervalMs: reliabilityConfig.heartbeatIntervalMs,
    prompt: reliabilityConfig.heartbeatPrompt || '',
    agent: reliabilityConfig.heartbeatAgent,
    client: {
      createSession: async (title?: string, directory?: string) => {
        const created = await opencodeClient.createSession(title, directory);
        return { id: created.id };
      },
      getSessionById: async (sessionId: string, options?: { directory?: string }) => {
        return await opencodeClient.getSessionById(sessionId, options);
      },
      sendMessage: async (
        sessionId: string,
        text: string,
        options?: {
          agent?: string;
          directory?: string;
          providerId?: string;
          modelId?: string;
          variant?: string;
        }
      ) => {
        const response = await opencodeClient.sendMessage(sessionId, text, options);
        return { parts: response.parts as unknown[] };
      },
    },
    notifyAlert: async (alertText: string) => {
      if (reliabilityConfig.heartbeatAlertChats.length === 0) {
        return;
      }

      const feishuAdapter = getCachedAdapter('feishu');
      if (!feishuAdapter) {
        logger.error('[Heartbeat] 飞书适配器未加载，无法发送告警');
        return;
      }
      const sender = feishuAdapter.getSender();
      for (const chatId of reliabilityConfig.heartbeatAlertChats) {
        try {
          await sender.sendText(chatId, `⚠️ [Heartbeat Alert]\n${alertText}`);
        } catch (error) {
          logger.error(`[Heartbeat] 发送告警失败 chat=${chatId}:`, error);
        }
      }
    },
    logger: {
      info: message => { logger.info(message); },
      warn: message => { logger.info(message); },
      error: (...args: unknown[]) => { logger.error(...args); },
    },
  });

  let cronApiServer: { start: () => Promise<void>; stop: () => Promise<void> } | null = null;
  if (reliabilityConfig.cronApiEnabled && runtimeCronManager) {
    cronApiServer = createCronApiServer(runtimeCronManager, {
      host: reliabilityConfig.cronApiHost,
      port: reliabilityConfig.cronApiPort,
      token: reliabilityConfig.cronApiToken,
      logger: {
        info: message => { logger.info(message); },
        warn: message => { logger.info(message); },
        error: (...args: unknown[]) => { logger.error(...args); },
      },
    });
    void cronApiServer.start().catch(error => {
      logger.error('[RuntimeCronAPI] 启动失败:', error);
    });
  }

  if (reliabilityConfig.cronEnabled) {
    void cleanupOrphanCronJobs().catch(error => {
      logger.error('[RuntimeCron] startup orphan cleanup failed:', error);
    });
    scheduler.start();
  }
  proactiveHeartbeatRunner.start();
  logger.info('[Reliability] bootstrap 完成（heartbeat + scheduler + rescue orchestrator）');

  let cleaned = false;

  return {
    onInboundMessage: async () => {
      if (!shouldUseInboundHeartbeat) {
        return;
      }
      try {
        await heartbeatEngine.onInboundMessage();
      } catch (error) {
        logger.error('[Heartbeat] 入站触发执行失败:', error);
      }
    },
    cleanup: async () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      await Promise.all([
        scheduler.stop(),
        Promise.resolve(rescueOrchestrator.cleanup()),
        Promise.resolve(proactiveHeartbeatRunner.stop()),
        cronApiServer ? cronApiServer.stop() : Promise.resolve(),
      ]);
      setRuntimeCronManager(null);
      logger.info('[Reliability] cleanup 完成');
    },
  };
};
