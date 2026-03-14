import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeCronDispatcher } from '../src/reliability/runtime-cron-dispatcher.js';
import { chatSessionStore } from '../src/store/chat-session.js';
import type { RuntimeCronJob } from '../src/reliability/runtime-cron.js';

function buildJob(overrides: Partial<RuntimeCronJob> = {}): RuntimeCronJob {
  return {
    id: 'job-1',
    name: 'news',
    schedule: { kind: 'cron', expr: '0 0 8 * * *' },
    payload: {
      kind: 'systemEvent',
      text: '推送新闻',
      sessionId: 'session-1',
      delivery: {
        platform: 'feishu',
        conversationId: 'chat-1',
        creatorId: 'user-1',
      },
    },
    enabled: true,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  };
}

describe('runtime-cron-dispatcher', () => {
  beforeEach(() => {
    chatSessionStore.removeSessionByConversation('feishu', 'chat-1');
    chatSessionStore.removeSessionByConversation('feishu', 'chat-private');
    delete process.env.RELIABILITY_CRON_FORWARD_TO_PRIVATE;
  });

  afterEach(() => {
    chatSessionStore.removeSessionByConversation('feishu', 'chat-1');
    chatSessionStore.removeSessionByConversation('feishu', 'chat-private');
    delete process.env.RELIABILITY_CRON_FORWARD_TO_PRIVATE;
  });

  it('原绑定仍存在时应复用原 session 异步执行', async () => {
    chatSessionStore.setSessionByConversation('feishu', 'chat-1', 'session-1', 'user-1', '群聊-1', {
      chatType: 'group',
    });

    const sendMessageAsync = vi.fn(async () => true);
    const dispatcher = createRuntimeCronDispatcher({
      getSessionById: vi.fn(async () => ({ id: 'session-1' })),
      sendMessage: vi.fn(async () => ({ parts: [] })),
      sendMessageAsync,
      getSender: vi.fn(() => null),
    });

    await dispatcher.dispatch(buildJob());
    expect(sendMessageAsync).toHaveBeenCalledWith('session-1', '推送新闻', {});
  });

  it('原窗口失效且存在私聊回退时应转发到私聊', async () => {
    process.env.RELIABILITY_CRON_FORWARD_TO_PRIVATE = 'true';
    vi.resetModules();
    const { createRuntimeCronDispatcher: createDispatcher } = await import('../src/reliability/runtime-cron-dispatcher.js');
    const { chatSessionStore: store } = await import('../src/store/chat-session.js');

    store.setSessionByConversation('feishu', 'chat-private', 'session-private', 'user-1', '私聊-1', {
      chatType: 'p2p',
    });

    const sendText = vi.fn(async () => 'msg-1');
    const dispatcher = createDispatcher({
      getSessionById: vi.fn(async () => ({ id: 'session-1' })),
      sendMessage: vi.fn(async () => ({
        parts: [{ type: 'text', text: '今日国际新闻摘要' }] as never[],
      })),
      sendMessageAsync: vi.fn(async () => true),
      getSender: vi.fn(() => ({
        sendText,
        sendCard: vi.fn(async () => null),
        updateCard: vi.fn(async () => false),
        deleteMessage: vi.fn(async () => false),
      })),
    });

    await dispatcher.dispatch(buildJob());
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      'chat-private',
      expect.stringContaining('今日国际新闻摘要')
    );
  });

  it('旧任务缺少 sessionId 时应从当前窗口绑定推断执行 session', async () => {
    chatSessionStore.setSessionByConversation('feishu', 'chat-1', 'session-inferred', 'user-1', '群聊-1', {
      chatType: 'group',
    });

    const sendMessageAsync = vi.fn(async () => true);
    const warn = vi.fn();
    const dispatcher = createRuntimeCronDispatcher({
      getSessionById: vi.fn(async () => ({ id: 'session-inferred' })),
      sendMessage: vi.fn(async () => ({ parts: [] })),
      sendMessageAsync,
      getSender: vi.fn(() => null),
      logger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await dispatcher.dispatch(buildJob({
      payload: {
        kind: 'systemEvent',
        text: '推送新闻',
        delivery: {
          platform: 'feishu',
          conversationId: 'chat-1',
          creatorId: 'user-1',
        },
      },
    }));

    expect(sendMessageAsync).toHaveBeenCalledWith('session-inferred', '推送新闻', {});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing sessionId in payload'));
  });
});
