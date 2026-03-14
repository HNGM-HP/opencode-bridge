import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CronScheduler } from '../src/reliability/scheduler.js';
import { RuntimeCronManager, toSchedulerJobId } from '../src/reliability/runtime-cron.js';

const waitMs = async (ms: number): Promise<void> => {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
};

describe('RuntimeCronManager', () => {
  it('应支持 add/list/update/remove 并持久化', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-cron-test-'));
    const jobsFile = path.join(root, 'jobs.json');
    const scheduler = new CronScheduler();
    const manager = new RuntimeCronManager({
      scheduler,
      filePath: jobsFile,
    });

    const created = manager.addJob({
      name: 'demo-job',
      schedule: { kind: 'cron', expr: '*/5 * * * * *' },
      payload: {
        kind: 'systemEvent',
        text: 'hello',
        sessionId: 'session-1',
        delivery: {
          platform: 'feishu',
          conversationId: 'chat-1',
          creatorId: 'user-1',
        },
      },
      enabled: true,
    });

    expect(created.id.length).toBeGreaterThan(0);
    expect(scheduler.hasJob(toSchedulerJobId(created.id))).toBe(true);

    const listed = manager.listJobs();
    expect(listed.length).toBe(1);
    expect(listed[0].name).toBe('demo-job');
    expect(listed[0].payload.delivery?.conversationId).toBe('chat-1');

    const updated = manager.updateJob({
      id: created.id,
      name: 'demo-job-updated',
      enabled: false,
    });
    expect(updated.name).toBe('demo-job-updated');
    expect(scheduler.hasJob(toSchedulerJobId(created.id))).toBe(false);

    const removed = manager.removeJob(created.id);
    expect(removed).toBe(true);
    expect(manager.listJobs()).toEqual([]);

    const raw = fs.readFileSync(jobsFile, 'utf-8');
    expect(raw.includes('"version": 1')).toBe(true);
  });

  it('应在 scheduler 运行时执行 systemEvent payload', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-cron-run-test-'));
    const jobsFile = path.join(root, 'jobs.json');
    const scheduler = new CronScheduler();
    const executed: string[] = [];

    const manager = new RuntimeCronManager({
      scheduler,
      filePath: jobsFile,
      dispatchPayload: async job => {
        executed.push(job.payload.text);
      },
    });

    manager.addJob({
      name: 'fast-job',
      schedule: { kind: 'cron', expr: '*/1 * * * * *' },
      payload: {
        kind: 'systemEvent',
        text: 'tick',
        sessionId: 'session-1',
        delivery: {
          platform: 'feishu',
          conversationId: 'chat-1',
        },
      },
      enabled: true,
    });

    scheduler.start();
    await waitMs(1200);
    await scheduler.stop();

    expect(executed.length).toBeGreaterThan(0);
    expect(executed[0]).toBe('tick');
  });
});
