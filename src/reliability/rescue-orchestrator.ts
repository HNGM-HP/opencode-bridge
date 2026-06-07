/**
 * Rescue Orchestrator — OpenCode 故障恢复编排器
 *
 * 监控 OpenCode 服务健康状态，在检测到故障时执行恢复流程
 */

import { spawn } from 'node:child_process';
import { opencodeConfig, reliabilityConfig } from '../config.js';
import { probeOpenCodeHealth } from './opencode-probe.js';
import { decideRescuePolicy } from './rescue-policy.js';
import { executeRescuePipeline } from './rescue-executor.js';
import { reportRecoveryContext } from './recovery-reporter.js';
import { FailureType, RescueState } from './types.js';

export interface ReliabilityRescueOrchestrator {
  runWatchdogProbe: () => Promise<void> | void;
  runStaleCleanup: () => Promise<void> | void;
  runBudgetReset: () => Promise<void> | void;
  cleanup: () => Promise<void> | void;
}

export const createRescueOrchestrator = (
  logger: Pick<Console, 'info' | 'error'> = console
): ReliabilityRescueOrchestrator => {
  let rescueState: RescueState = RescueState.HEALTHY;
  let failureCount = 0;
  let firstFailureAtMs = 0;
  let repairBudgetRemaining = reliabilityConfig.repairBudget;
  let lastRepairAtMs: number | undefined;
  const HEALTHY_LOG_INTERVAL_MS = 10 * 60 * 1000;
  const WAIT_LOG_INTERVAL_MS = 5 * 60 * 1000;
  let lastHealthyLogAtMs = 0;
  let lastPolicyLogAtMs = 0;
  let lastPolicySignature = '';

  return {
    runWatchdogProbe: async () => {
      const nowMs = Date.now();
      try {
        const probeResult = await probeOpenCodeHealth({
          host: opencodeConfig.host,
          port: opencodeConfig.port,
        });

        if (probeResult.ok) {
          failureCount = 0;
          firstFailureAtMs = 0;
          rescueState = RescueState.HEALTHY;
          const shouldLogHealthy =
            lastHealthyLogAtMs === 0 || nowMs - lastHealthyLogAtMs >= HEALTHY_LOG_INTERVAL_MS;
          if (shouldLogHealthy) {
            logger.info('[Reliability] watchdog probe healthy');
            lastHealthyLogAtMs = nowMs;
          }
          return;
        }

        failureCount += 1;
        if (firstFailureAtMs === 0) {
          firstFailureAtMs = nowMs;
        }

        const failureType = probeResult.failureType ?? FailureType.OPENCODE_HTTP_DOWN;
        const policyDecision = decideRescuePolicy({
          failureType,
          currentState: rescueState,
          latestAttemptFailed: true,
          nowMs,
          retry: {
            mode: 'infinite',
            attempt: failureCount,
            failureCount,
            firstFailureAtMs,
          },
          rescue: {
            targetHost: opencodeConfig.host,
            budgetRemaining: repairBudgetRemaining,
            lastRepairAtMs,
          },
        });

        rescueState = policyDecision.nextState;
        repairBudgetRemaining = policyDecision.nextBudgetRemaining;

        if (policyDecision.action !== 'repair') {
          const signature = `${policyDecision.action}:${policyDecision.reason}`;
          const shouldLogPolicy =
            signature !== lastPolicySignature
            || lastPolicyLogAtMs === 0
            || nowMs - lastPolicyLogAtMs >= WAIT_LOG_INTERVAL_MS;
          if (shouldLogPolicy) {
            logger.info(`[Reliability] watchdog policy=${policyDecision.action} reason=${policyDecision.reason}`);
            lastPolicyLogAtMs = nowMs;
            lastPolicySignature = signature;
          }
          return;
        }

        logger.info(`[Reliability] watchdog rescue start reason=${policyDecision.reason}`);

        const startOpenCode = async (): Promise<void> => {
          return new Promise((resolve, reject) => {
            try {
              const isWindows = process.platform === 'win32';
              const child = spawn('opencode', [], {
                detached: true,
                stdio: 'ignore',
                shell: isWindows,
                windowsHide: isWindows,
              });
              child.unref();
              setTimeout(() => resolve(), 2000);
            } catch (error) {
              reject(error);
            }
          });
        };

        const rescueResult = await executeRescuePipeline({
          lockTargetPath: './logs/opencode-rescue',
          pidFilePath: './logs/opencode.pid',
          host: opencodeConfig.host,
          port: opencodeConfig.port,
          configPath: process.env.OPENCODE_CONFIG_FILE?.trim() || './opencode.json',
          serverFields: {
            host: opencodeConfig.host,
            port: opencodeConfig.port,
            auth: {
              username: opencodeConfig.serverUsername,
              password: opencodeConfig.serverPassword,
            },
          },
          startOpenCode,
        });

        if (!rescueResult.ok) {
          rescueState = RescueState.DEGRADED;
          logger.error(`[Reliability] rescue failed step=${rescueResult.failedStep} reason=${rescueResult.reason}`);
          return;
        }

        lastRepairAtMs = Date.now();
        rescueState = RescueState.RECOVERED;
        await reportRecoveryContext({
          failureType,
          failureReason: policyDecision.reason,
          backupPath: rescueResult.config.backup.path,
          nextActions: [
            '检查 OpenCode 健康端点与认证配置是否长期稳定',
            '观察下一轮 watchdog 探针，确认故障不再复现',
          ],
          selfCheckCommands: [
            'npm run build',
            'npm test -- tests/reliability-bootstrap.test.ts',
          ],
          context: {
            policyAction: policyDecision.action,
            policyReason: policyDecision.reason,
            trace: rescueResult.trace,
            health: rescueResult.health,
          },
        });
        logger.info('[Reliability] rescue succeeded and recovery context reported');
      } catch (error) {
        logger.error('[Reliability] watchdog probe failed:', error);
      }
    },
    runStaleCleanup: async () => {
      logger.info('[Reliability] stale cleanup tick');
    },
    runBudgetReset: async () => {
      logger.info('[Reliability] budget reset tick');
    },
    cleanup: async () => {
      logger.info('[Reliability] rescue orchestrator cleaned');
    },
  };
};
