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
      parentSessionId: 'ses-parent',
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
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
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
      parentSessionId: 'ses-parent',
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
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.spyOn(permissionHandler, 'resolveForChat').mockReturnValue(undefined);
    vi.spyOn(outputBuffer, 'touch').mockImplementation(() => undefined);

    const result = await callbacks.handlePermissionAction({
      sessionId: 'ses-main',
      parentSessionId: 'ses-parent',
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
    const callbacks = createPermissionActionCallbacks(vi.fn());

    vi.spyOn(permissionHandler, 'peekForChat').mockReturnValue(undefined);
    const replySpy = vi.spyOn(feishuClient, 'reply').mockResolvedValue('reply-msg');

    const handled = await callbacks.tryHandlePendingPermissionByText({
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

    // 当没有待确认权限时，函数应返回 false，让其他处理器处理
    expect(handled).toBe(false);
    // 不应该发送任何消息
    expect(replySpy).not.toHaveBeenCalled();
  });

  it('有待确认权限时，无效回复应提示正确格式', async () => {
    const callbacks = createPermissionActionCallbacks(vi.fn());

    vi.spyOn(permissionHandler, 'peekForChat').mockReturnValue({
      sessionId: 'ses-main',
      permissionId: 'per-1',
      tool: 'Bash',
      description: '执行命令',
      chatId: 'chat-1',
      userId: 'user-1',
      createdAt: Date.now(),
    });
    const replySpy = vi.spyOn(feishuClient, 'reply').mockResolvedValue('reply-msg');

    // 发送一个不能解析为权限决策的内容
    const handled = await callbacks.tryHandlePendingPermissionByText({
      ...baseEvent,
      content: '随便说说',
      rawEvent: {
        ...baseEvent.rawEvent,
        message: {
          ...baseEvent.rawEvent.message,
          content: '{"text":"随便说说"}',
        },
      },
    });

    expect(handled).toBe(true);
    expect(replySpy).toHaveBeenCalledWith('msg-1', '当前有待确认权限，请回复：允许 / 拒绝 / 始终允许（也支持 y / n / always）');
  });
});
