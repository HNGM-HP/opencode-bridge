import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CronScheduler } from '../src/reliability/scheduler.js';
import { RuntimeCronManager } from '../src/reliability/runtime-cron.js';
import {
  cleanupRuntimeCronJobsByConversation,
  cleanupRuntimeCronJobsBySessionId,
  scanAndCleanupOrphanRuntimeCronJobs,
} from '../src/reliability/runtime-cron-orphan.js';

function createManager(): RuntimeCronManager {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-cron-orphan-'));
  const jobsFile = path.join(root, 'jobs.json');
  return new RuntimeCronManager({
    scheduler: new CronScheduler(),
    filePath: jobsFile,
  });
}

describe('runtime-cron-orphan', () => {
  it('应按会话窗口删除绑定任务', () => {
    const manager = createManager();
    const job = manager.addJob({
      name: 'news',
      schedule: { kind: 'cron', expr: '*/5 * * * * *' },
      payload: {
        kind: 'systemEvent',
        text: 'news',
        sessionId: 'session-1',
        delivery: {
          platform: 'feishu',
          conversationId: 'chat-1',
        },
      },
    });

    const cleanup = cleanupRuntimeCronJobsByConversation(manager, 'feishu', 'chat-1');
    expect(cleanup.removedJobIds).toEqual([job.id]);
    expect(manager.listJobs()).toHaveLength(0);
  });

  it('应按 sessionId 删除绑定任务', () => {
    const manager = createManager();
    const job = manager.addJob({
      name: 'news',
      schedule: { kind: 'cron', expr: '*/5 * * * * *' },
      payload: {
        kind: 'systemEvent',
        text: 'news',
        sessionId: 'session-1',
        delivery: {
          platform: 'feishu',
          conversationId: 'chat-1',
        },
      },
    });

    const cleanup = cleanupRuntimeCronJobsBySessionId(manager, 'session-1');
    expect(cleanup.removedJobIds).toEqual([job.id]);
    expect(manager.listJobs()).toHaveLength(0);
  });

  it('应扫描并清理缺少绑定或会话的僵尸任务', async () => {
    const manager = createManager();
    const invalid = manager.addJob({
      name: 'invalid',
      schedule: { kind: 'cron', expr: '*/5 * * * * *' },
      payload: {
        kind: 'systemEvent',
        text: 'invalid',
      },
    });
    const missingConversation = manager.addJob({
      name: 'missing-conversation',
      schedule: { kind: 'cron', expr: '*/5 * * * * *' },
      payload: {
        kind: 'systemEvent',
        text: 'mc',
        sessionId: 'session-2',
        delivery: {
          platform: 'discord',
          conversationId: 'channel-2',
        },
      },
    });
    const missingSession = manager.addJob({
      name: 'missing-session',
      schedule: { kind: 'cron', expr: '*/5 * * * * *' },
      payload: {
        kind: 'systemEvent',
        text: 'ms',
        sessionId: 'session-3',
        delivery: {
          platform: 'feishu',
          conversationId: 'chat-3',
        },
      },
    });

    const result = await scanAndCleanupOrphanRuntimeCronJobs(manager, {
      hasConversationBinding: (platform, conversationId) => platform === 'feishu' && conversationId === 'chat-3',
      getSessionStatus: vi.fn(async (sessionId: string) => sessionId === 'session-3' ? 'missing' : 'exists'),
    });

    expect(result.invalidJobIds).toEqual([invalid.id]);
    expect(result.missingConversationJobIds).toEqual([missingConversation.id]);
    expect(result.missingSessionJobIds).toEqual([missingSession.id]);
    expect(manager.listJobs()).toHaveLength(0);
  });
});
