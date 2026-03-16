import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeishuMessageEvent } from '../src/feishu/client.js';
import { createPermissionActionCallbacks } from '../src/router/action-handlers.js';
import { permissionHandler } from '../src/permissions/handler.js';
import { opencodeClient } from '../src/opencode/client.js';
import { chatSessionStore } from '../src/store/chat-session.js';
import { outputBuffer } from '../src/opencode/output-buffer.js';
import { feishuClient } from '../src/feishu/client.js';

const baseEvent: FeishuMessageEvent = {
  messageId: 'msg-1',
  chatId: 'chat-1',
  chatType: 'group',
  senderId: 'ou-user',
  senderType: 'user',
  content: '允许',
  msgType: 'text',
  rawEvent: {
    sender: { sender_type: 'user' },
    message: {
      message_id: 'msg-1',
      create_time: '0',
      chat_id: 'chat-1',
      chat_type: 'group',
      message_type: 'text',
      content: '{"text":"允许"}',
    },
  },
};

describe('permission text action callbacks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('文本确认权限时应按候选 session 依次重试', async () => {
    const callbacks = createPermissionActionCallbacks(vi.fn());

    vi.spyOn(permissionHandler, 'peekForChat').mockReturnValue({
      sessionId: 'ses-main',
      sessionCandidates: ['ses-main', 'ses-parent'],
      permissionId: 'per-1',
      tool: 'Bash',
      description: '执行命令',
      chatId: 'chat-1',
      userId: 'user-1',
      createdAt: Date.now(),
    });
    vi.spyOn(chatSessionStore, 'getConversationBySessionId').mockReturnValue(null);
    vi.spyOn(chatSessionStore, 'getSession').mockReturnValue(undefined);
    vi.spyOn(chatSessionStore, 'getKnownDirectories').mockReturnValue([]);
    vi.spyOn(opencodeClient, 'respondToPermission')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.spyOn(permissionHandler, 'resolveForChat').mockReturnValue(undefined);
    vi.spyOn(outputBuffer, 'get').mockReturnValue(undefined);
    vi.spyOn(outputBuffer, 'getOrCreate').mockReturnValue({
      key: 'chat:chat-1',
      chatId: 'chat-1',
      messageId: null,
      thinkingMessageId: null,
      replyMessageId: null,
      sessionId: 'ses-main',
      content: [],
      thinking: [],
      tools: [],
      finalText: '',
      finalThinking: '',
      openCodeMsgId: '',
      showThinking: false,
      dirty: false,
      lastUpdate: Date.now(),
      timer: null,
      updating: false,
      rerunRequested: false,
      status: 'running',
    });
    vi.spyOn(outputBuffer, 'touch').mockImplementation(() => undefined);
    const replySpy = vi.spyOn(feishuClient, 'reply').mockResolvedValue('reply-msg');

    const handled = await callbacks.tryHandlePendingPermissionByText(baseEvent);

    expect(handled).toBe(true);
    expect(opencodeClient.respondToPermission).toHaveBeenNthCalledWith(
      1,
      'ses-main',
      'per-1',
      true,
      false,
      expect.any(Object)
    );
    expect(opencodeClient.respondToPermission).toHaveBeenNthCalledWith(
      2,
      'ses-parent',
      'per-1',
      true,
      false,
      expect.any(Object)
    );
    expect(replySpy).toHaveBeenCalledWith('msg-1', '已允许该权限');
  });

  it('卡片确认权限时也应按候选 session 依次重试', async () => {
    const callbacks = createPermissionActionCallbacks(vi.fn());

    vi.spyOn(chatSessionStore, 'getChatId').mockReturnValue('chat-1');
    vi.spyOn(permissionHandler, 'peekForChat').mockReturnValue({
      sessionId: 'ses-main',
      sessionCandidates: ['ses-main', 'ses-parent'],
      permissionId: 'per-2',
      tool: 'Bash',
      description: '执行命令',
      chatId: 'chat-1',
      userId: 'user-1',
      createdAt: Date.now(),
    });
    vi.spyOn(chatSessionStore, 'getConversationBySessionId').mockReturnValue(null);
    vi.spyOn(chatSessionStore, 'getSession').mockReturnValue(undefined);
    vi.spyOn(chatSessionStore, 'getKnownDirectories').mockReturnValue([]);
    vi.spyOn(opencodeClient, 'respondToPermission')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.spyOn(permissionHandler, 'resolveForChat').mockReturnValue(undefined);
    vi.spyOn(outputBuffer, 'touch').mockImplementation(() => undefined);

    const result = await callbacks.handlePermissionAction({
      sessionId: 'ses-main',
      permissionId: 'per-2',
      remember: false,
    }, 'permission_allow');

    expect(opencodeClient.respondToPermission).toHaveBeenNthCalledWith(
      1,
      'ses-main',
      'per-2',
      true,
      false,
      expect.any(Object)
    );
    expect(opencodeClient.respondToPermission).toHaveBeenNthCalledWith(
      2,
      'ses-parent',
      'per-2',
      true,
      false,
      expect.any(Object)
    );
    expect(result.toast?.type).toBe('success');
  });

  it('无待确认权限时，裸权限词不应落入普通 prompt', async () => {
    vi.useFakeTimers();
    const callbacks = createPermissionActionCallbacks(vi.fn());

    vi.spyOn(permissionHandler, 'peekForChat').mockReturnValue(undefined);
    const replySpy = vi.spyOn(feishuClient, 'reply').mockResolvedValue('reply-msg');

    const handledPromise = callbacks.tryHandlePendingPermissionByText({
      ...baseEvent,
      content: '始终允许',
      rawEvent: {
        ...baseEvent.rawEvent,
        message: {
          ...baseEvent.rawEvent.message,
          content: '{"text":"始终允许"}',
        },
      },
    });

    await vi.advanceTimersByTimeAsync(1600);
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(replySpy).toHaveBeenCalledWith('msg-1', '当前没有待确认权限，请在权限卡出现后再回复');
  });

  it('私聊里的裸权限词应回传给同用户最近的群聊权限请求', async () => {
    const callbacks = createPermissionActionCallbacks(vi.fn());

    vi.spyOn(permissionHandler, 'peekForChat').mockReturnValue(undefined);
    vi.spyOn(permissionHandler, 'findLatestForUser').mockReturnValue({
      sessionId: 'ses-group',
      sessionCandidates: ['ses-group'],
      permissionId: 'per-p2p-1',
      tool: 'Write',
      description: '写入文件',
      chatId: 'group-chat-1',
      userId: 'ou-user',
      createdAt: Date.now(),
    });
    vi.spyOn(chatSessionStore, 'getConversationBySessionId').mockReturnValue(null);
    vi.spyOn(chatSessionStore, 'getSession').mockReturnValue(undefined);
    vi.spyOn(chatSessionStore, 'getKnownDirectories').mockReturnValue([]);
    vi.spyOn(opencodeClient, 'respondToPermission').mockResolvedValue(true);
    vi.spyOn(permissionHandler, 'resolveForChat').mockReturnValue(undefined);
    vi.spyOn(outputBuffer, 'get').mockReturnValue(undefined);
    vi.spyOn(outputBuffer, 'getOrCreate').mockReturnValue({
      key: 'chat:group-chat-1',
      chatId: 'group-chat-1',
      messageId: null,
      thinkingMessageId: null,
      replyMessageId: null,
      sessionId: 'ses-group',
      content: [],
      thinking: [],
      tools: [],
      finalText: '',
      finalThinking: '',
      openCodeMsgId: '',
      showThinking: false,
      dirty: false,
      lastUpdate: Date.now(),
      timer: null,
      updating: false,
      rerunRequested: false,
      status: 'running',
    });
    vi.spyOn(outputBuffer, 'touch').mockImplementation(() => undefined);
    const replySpy = vi.spyOn(feishuClient, 'reply').mockResolvedValue('reply-msg');

    const handled = await callbacks.tryHandlePendingPermissionByText({
      ...baseEvent,
      chatId: 'p2p-chat-1',
      chatType: 'p2p',
      content: '允许',
      rawEvent: {
        ...baseEvent.rawEvent,
        message: {
          ...baseEvent.rawEvent.message,
          chat_id: 'p2p-chat-1',
          chat_type: 'p2p',
          content: '{"text":"允许"}',
        },
      },
    });

    expect(handled).toBe(true);
    expect(opencodeClient.respondToPermission).toHaveBeenCalledWith(
      'ses-group',
      'per-p2p-1',
      true,
      false,
      expect.any(Object)
    );
    expect(permissionHandler.resolveForChat).toHaveBeenCalledWith('group-chat-1', 'per-p2p-1');
    expect(replySpy).toHaveBeenCalledWith('msg-1', '已允许该权限');
  });
});
