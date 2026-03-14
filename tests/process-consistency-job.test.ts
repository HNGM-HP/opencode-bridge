import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CronScheduler } from '../src/reliability/scheduler.js';
import {
  createProcessCheckJobRunner,
  createRepairBudgetState,
  registerProcessCheckJobs,
  type ProcessConsistencyStatus,
} from '../src/reliability/process-check-job.js';

describe('process-consistency-job', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'process-consistency-job-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('应注册 process consistency / stale lock / budget reset 三个任务', () => {
    const scheduler = new CronScheduler();
    registerProcessCheckJobs(scheduler, {
      runner: {
        checkProcessConsistency: async (): Promise<ProcessConsistencyStatus> => ({
          opencodeStatus: 'ok',
          bridgeStatus: 'ok',
          stalePidCleaned: false,
          details: 'ok',
        }),
        cleanupStaleLocks: async () => ({ cleanedPaths: [], skippedPaths: [] }),
        resetBudget: async () => ({ previous: 1, current: 3, maxBudget: 3 }),
      },
      cronExpressions: {
        processConsistencyCheck: '*/1 * * * * *',
        staleLockCleanup: '*/1 * * * * *',
        budgetReset: '*/1 * * * * *',
      },
    });

    expect(scheduler.getRegisteredJobIds().sort()).toEqual([
      'budget-reset',
      'process-consistency-check',
      'stale-lock-cleanup',
    ]);
  });

  it('健康单实例时不应清理 PID 文件', async () => {
    const bridgePidFilePath = path.join(tempDir, 'bridge.pid');
    await fs.writeFile(bridgePidFilePath, '2001', 'utf-8');

    const events: string[] = [];
    const runner = createProcessCheckJobRunner({
      bridgePidFilePath,
      opencodePidFilePath: path.join(tempDir, 'opencode.pid'),
      opencodeHost: '127.0.0.1',
      opencodePort: 4096,
      staleLockPaths: [],
      repairBudgetState: createRepairBudgetState(3),
      checkOpenCodeSingleInstance: async () => ({
        status: 'ok',
        pidFromFile: 1001,
        pidAlive: true,
        portOpen: true,
        probeReason: 'connected',
        runningPids: [1001],
        conflictPids: [],
      }),
      isProcessAlive: async pid => pid === 2001,
      auditLog: async event => {
        events.push(event.action);
      },
    });

    const result = await runner.checkProcessConsistency();

    expect(result.opencodeStatus).toBe('ok');
    expect(result.bridgeStatus).toBe('ok');
    expect(result.stalePidCleaned).toBe(false);
    expect(events).toContain('process.consistency.check');
    await expect(fs.stat(bridgePidFilePath)).resolves.toBeTruthy();
  });

  it('桥接 PID 僵尸时应清理残留 PID 文件', async () => {
    const bridgePidFilePath = path.join(tempDir, 'bridge.pid');
    await fs.writeFile(bridgePidFilePath, '999999', 'utf-8');

    const actions: string[] = [];
    const runner = createProcessCheckJobRunner({
      bridgePidFilePath,
      opencodePidFilePath: path.join(tempDir, 'opencode.pid'),
      opencodeHost: '127.0.0.1',
      opencodePort: 4096,
      staleLockPaths: [],
      repairBudgetState: createRepairBudgetState(2),
      checkOpenCodeSingleInstance: async () => ({
        status: 'not-running',
        pidFromFile: null,
        pidAlive: false,
        portOpen: false,
        probeReason: 'ECONNREFUSED',
        runningPids: [],
        conflictPids: [],
      }),
      isProcessAlive: async () => false,
      auditLog: async event => {
        actions.push(event.action);
      },
    });

    const result = await runner.checkProcessConsistency();

    expect(result.bridgeStatus).toBe('stale-pid');
    expect(result.stalePidCleaned).toBe(true);
    expect(actions).toContain('bridge.pid.cleaned');
    await expect(fs.stat(bridgePidFilePath)).rejects.toBeTruthy();
  });

  it('冲突进程应报告 single-instance-violation 且不做 kill', async () => {
    const runner = createProcessCheckJobRunner({
      bridgePidFilePath: path.join(tempDir, 'bridge.pid'),
      opencodePidFilePath: path.join(tempDir, 'opencode.pid'),
      opencodeHost: '127.0.0.1',
      opencodePort: 4096,
      staleLockPaths: [],
      repairBudgetState: createRepairBudgetState(3),
      checkOpenCodeSingleInstance: async () => ({
        status: 'single-instance-violation',
        pidFromFile: 3001,
        pidAlive: true,
        portOpen: true,
        probeReason: 'connected',
        runningPids: [3001, 3002],
        conflictPids: [3002],
      }),
      isProcessAlive: async () => true,
      auditLog: async () => {
        return;
      },
    });

    const result = await runner.checkProcessConsistency();

    expect(result.opencodeStatus).toBe('single-instance-violation');
    expect(result.details).toContain('3002');
  });

  it('锁残留超时应被清理', async () => {
    const lockTargetPath = path.join(tempDir, 'rescue-mutex');
    const lockPath = `${lockTargetPath}.lock`;
    await fs.mkdir(lockPath, { recursive: true });
    const staleAt = new Date(Date.now() - 120_000);
    await fs.utimes(lockPath, staleAt, staleAt);

    const runner = createProcessCheckJobRunner({
      bridgePidFilePath: path.join(tempDir, 'bridge.pid'),
      opencodePidFilePath: path.join(tempDir, 'opencode.pid'),
      opencodeHost: '127.0.0.1',
      opencodePort: 4096,
      staleLockPaths: [lockTargetPath],
      staleLockMs: 60_000,
      repairBudgetState: createRepairBudgetState(1),
      checkOpenCodeSingleInstance: async () => ({
        status: 'not-running',
        pidFromFile: null,
        pidAlive: false,
        portOpen: false,
        probeReason: 'ECONNREFUSED',
        runningPids: [],
        conflictPids: [],
      }),
      isProcessAlive: async () => false,
      auditLog: async () => {
        return;
      },
    });

    const cleaned = await runner.cleanupStaleLocks();
    expect(cleaned.cleanedPaths).toContain(lockPath);
    await expect(fs.stat(lockPath)).rejects.toBeTruthy();
  });

  it('budget reset 任务应将预算恢复到最大值', async () => {
    const budgetState = createRepairBudgetState(5);
    budgetState.remaining = 1;

    const runner = createProcessCheckJobRunner({
      bridgePidFilePath: path.join(tempDir, 'bridge.pid'),
      opencodePidFilePath: path.join(tempDir, 'opencode.pid'),
      opencodeHost: '127.0.0.1',
      opencodePort: 4096,
      staleLockPaths: [],
      repairBudgetState: budgetState,
      checkOpenCodeSingleInstance: async () => ({
        status: 'not-running',
        pidFromFile: null,
        pidAlive: false,
        portOpen: false,
        probeReason: 'ECONNREFUSED',
        runningPids: [],
        conflictPids: [],
      }),
      isProcessAlive: async () => false,
      auditLog: async () => {
        return;
      },
    });

    const resetResult = await runner.resetBudget();
    expect(resetResult.previous).toBe(1);
    expect(resetResult.current).toBe(5);
    expect(budgetState.remaining).toBe(5);
  });
});
