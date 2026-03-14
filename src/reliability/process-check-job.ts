import fs from 'node:fs/promises';
import path from 'node:path';
import { reliabilityConfig } from '../config.js';
import { auditLogger, generateIncidentId, type AuditEvent } from './audit-log.js';
import {
  checkOpenCodeSingleInstance,
  type ProcessGuardResult,
  type ProcessGuardStatus,
} from './process-guard.js';
import { type CronScheduler } from './scheduler.js';

type ProcessAliveChecker = (pid: number) => Promise<boolean>;
type OpenCodeInstanceChecker = (options: {
  pidFilePath: string;
  host: string;
  port: number;
  timeoutMs?: number;
  processKeywords?: string[];
}) => Promise<ProcessGuardResult>;

export type BridgeProcessStatus = 'ok' | 'not-running' | 'stale-pid';

export interface ProcessConsistencyStatus {
  opencodeStatus: ProcessGuardStatus;
  bridgeStatus: BridgeProcessStatus;
  stalePidCleaned: boolean;
  details: string;
}

export interface StaleLockCleanupResult {
  cleanedPaths: string[];
  skippedPaths: string[];
}

export interface BudgetResetResult {
  previous: number;
  current: number;
  maxBudget: number;
}

export interface RepairBudgetState {
  maxBudget: number;
  remaining: number;
  lastUpdatedAtMs: number;
  lastResetAtMs: number;
}

export interface ProcessCheckJobRunner {
  checkProcessConsistency: () => Promise<ProcessConsistencyStatus>;
  cleanupStaleLocks: () => Promise<StaleLockCleanupResult>;
  resetBudget: () => Promise<BudgetResetResult>;
}

interface ProcessCheckJobAuditEvent {
  action: string;
  result: 'success' | 'failed';
  metadata?: Record<string, unknown>;
}

type ProcessCheckJobAuditLogger = (event: ProcessCheckJobAuditEvent) => Promise<void>;

export interface ProcessCheckJobRunnerOptions {
  bridgePidFilePath: string;
  opencodePidFilePath: string;
  opencodeHost: string;
  opencodePort: number;
  repairBudgetState: RepairBudgetState;
  staleLockPaths: string[];
  staleLockMs?: number;
  opencodeProbeTimeoutMs?: number;
  processKeywords?: string[];
  now?: () => number;
  isProcessAlive?: ProcessAliveChecker;
  checkOpenCodeSingleInstance?: OpenCodeInstanceChecker;
  auditLog?: ProcessCheckJobAuditLogger;
}

export interface ProcessCheckJobCronExpressions {
  processConsistencyCheck: string;
  staleLockCleanup: string;
  budgetReset: string;
}

export interface RegisterProcessCheckJobsOptions {
  runner: ProcessCheckJobRunner;
  cronExpressions?: Partial<ProcessCheckJobCronExpressions>;
  timezone?: string;
}

const DEFAULT_CRON_EXPRESSIONS: ProcessCheckJobCronExpressions = {
  processConsistencyCheck: '*/30 * * * * *',
  staleLockCleanup: '0 */5 * * * *',
  budgetReset: '0 0 * * *',
};

const DEFAULT_STALE_LOCK_MS = 10 * 60 * 1000;
const DEFAULT_AUDIT_PATH = path.resolve(process.cwd(), 'logs', 'reliability-audit.jsonl');
const missingPidNoticePaths = new Set<string>();

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function createRepairBudgetState(maxBudget: number, now: () => number = Date.now): RepairBudgetState {
  const safeMaxBudget = Number.isFinite(maxBudget) && maxBudget > 0
    ? Math.floor(maxBudget)
    : reliabilityConfig.repairBudget;
  const ts = now();
  return {
    maxBudget: safeMaxBudget,
    remaining: safeMaxBudget,
    lastUpdatedAtMs: ts,
    lastResetAtMs: ts,
  };
}

const createAuditLogger = (): ProcessCheckJobAuditLogger => {
  const logger = auditLogger(DEFAULT_AUDIT_PATH, true);
  return async event => {
    const auditEvent: AuditEvent = {
      incidentId: generateIncidentId(),
      classification: 'system',
      decision: 'update',
      action: event.action,
      result: event.result,
      timestamp: new Date().toISOString(),
      ...(event.metadata ? { metadata: event.metadata } : {}),
    };
    await logger.log(auditEvent);
  };
};

async function readPidFile(pidFilePath: string): Promise<number | null> {
  try {
    const raw = (await fs.readFile(pidFilePath, 'utf-8')).trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      if (!missingPidNoticePaths.has(pidFilePath)) {
        missingPidNoticePaths.add(pidFilePath);
        console.info(`[process-check-job] bridge pid file not found, fallback to foreground mode detection: ${pidFilePath}`);
      }
      return null;
    }

    console.error('[process-check-job] readPidFile failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function removeFileIfExists(filePath: string): Promise<boolean> {
  try {
    await fs.rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

function resolveLockPath(targetPath: string): string {
  return targetPath.endsWith('.lock') ? targetPath : `${targetPath}.lock`;
}

export function createProcessCheckJobRunner(options: ProcessCheckJobRunnerOptions): ProcessCheckJobRunner {
  const getNow = options.now ?? Date.now;
  const staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
  const isProcessAlive = options.isProcessAlive ?? (async pid => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
  const checkSingleInstance = options.checkOpenCodeSingleInstance ?? checkOpenCodeSingleInstance;
  const auditLog = options.auditLog ?? createAuditLogger();

  return {
    checkProcessConsistency: async (): Promise<ProcessConsistencyStatus> => {
      const opencode = await checkSingleInstance({
        pidFilePath: options.opencodePidFilePath,
        host: options.opencodeHost,
        port: options.opencodePort,
        timeoutMs: options.opencodeProbeTimeoutMs,
        processKeywords: options.processKeywords,
      });

      let bridgeStatus: BridgeProcessStatus = 'not-running';
      let stalePidCleaned = false;
      const bridgePid = await readPidFile(options.bridgePidFilePath);

      if (bridgePid === null) {
        // 前台运行模式通常不会写 bridge.pid，此时当前进程即为 bridge 本体。
        bridgeStatus = 'ok';
      } else {
        const alive = await isProcessAlive(bridgePid);
        if (alive) {
          bridgeStatus = 'ok';
        } else {
          bridgeStatus = 'stale-pid';
          stalePidCleaned = await removeFileIfExists(options.bridgePidFilePath);
          await auditLog({
            action: 'bridge.pid.cleaned',
            result: stalePidCleaned ? 'success' : 'failed',
            metadata: {
              pidFilePath: options.bridgePidFilePath,
              pid: bridgePid,
            },
          });
        }
      }

      const details = [
        `opencode=${opencode.status}`,
        `bridge=${bridgeStatus}`,
        `runningPids=${opencode.runningPids.join(',') || 'none'}`,
      ].join(' ');

      await auditLog({
        action: 'process.consistency.check',
        result: 'success',
        metadata: {
          opencodeStatus: opencode.status,
          bridgeStatus,
          stalePidCleaned,
          opencodePidFromFile: opencode.pidFromFile,
          opencodeConflictPids: opencode.conflictPids,
          opencodeProbeReason: opencode.probeReason,
        },
      });

      if (opencode.status === 'single-instance-violation') {
        await auditLog({
          action: 'opencode.single_instance_violation',
          result: 'failed',
          metadata: {
            pidFromFile: opencode.pidFromFile,
            runningPids: opencode.runningPids,
            conflictPids: opencode.conflictPids,
          },
        });
      }

      return {
        opencodeStatus: opencode.status,
        bridgeStatus,
        stalePidCleaned,
        details,
      };
    },

    cleanupStaleLocks: async (): Promise<StaleLockCleanupResult> => {
      const cleanedPaths: string[] = [];
      const skippedPaths: string[] = [];

      for (const lockTargetPath of options.staleLockPaths) {
        const lockPath = resolveLockPath(lockTargetPath);
        try {
          const stat = await fs.stat(lockPath);
          const ageMs = getNow() - stat.mtimeMs;
          if (ageMs <= staleLockMs) {
            skippedPaths.push(lockPath);
            continue;
          }

          await fs.rm(lockPath, { recursive: true, force: true });
          cleanedPaths.push(lockPath);
          await auditLog({
            action: 'lock.stale.cleaned',
            result: 'success',
            metadata: {
              lockPath,
              ageMs,
              staleLockMs,
            },
          });
        } catch (error) {
          console.error('[process-check-job] cleanupStaleLocks failed:', error instanceof Error ? error.message : String(error));
          skippedPaths.push(lockPath);
        }
      }

      await auditLog({
        action: 'lock.cleanup.completed',
        result: 'success',
        metadata: {
          cleanedCount: cleanedPaths.length,
          skippedCount: skippedPaths.length,
        },
      });

      return {
        cleanedPaths,
        skippedPaths,
      };
    },

    resetBudget: async (): Promise<BudgetResetResult> => {
      const previous = options.repairBudgetState.remaining;
      options.repairBudgetState.remaining = options.repairBudgetState.maxBudget;
      options.repairBudgetState.lastResetAtMs = getNow();
      options.repairBudgetState.lastUpdatedAtMs = options.repairBudgetState.lastResetAtMs;

      await auditLog({
        action: 'rescue.budget.reset',
        result: 'success',
        metadata: {
          previous,
          current: options.repairBudgetState.remaining,
          maxBudget: options.repairBudgetState.maxBudget,
        },
      });

      return {
        previous,
        current: options.repairBudgetState.remaining,
        maxBudget: options.repairBudgetState.maxBudget,
      };
    },
  };
}

export function registerProcessCheckJobs(
  scheduler: CronScheduler,
  options: RegisterProcessCheckJobsOptions
): void {
  const cronExpressions: ProcessCheckJobCronExpressions = {
    ...DEFAULT_CRON_EXPRESSIONS,
    ...options.cronExpressions,
  };

  scheduler.registerJob({
    id: 'process-consistency-check',
    cronExpression: cronExpressions.processConsistencyCheck,
    timezone: options.timezone,
    waitForCompletion: true,
    run: async () => {
      await options.runner.checkProcessConsistency();
    },
  });

  scheduler.registerJob({
    id: 'stale-lock-cleanup',
    cronExpression: cronExpressions.staleLockCleanup,
    timezone: options.timezone,
    waitForCompletion: true,
    run: async () => {
      await options.runner.cleanupStaleLocks();
    },
  });

  scheduler.registerJob({
    id: 'budget-reset',
    cronExpression: cronExpressions.budgetReset,
    timezone: options.timezone,
    waitForCompletion: true,
    run: async () => {
      await options.runner.resetBudget();
    },
  });
}
