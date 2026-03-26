import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupHandler } from '../src/handlers/group.js';
import { feishuClient, type FeishuMessageEvent } from '../src/feishu/client.js';
import { chatSessionStore } from '../src/store/chat-session.js';
import { opencodeClient } from '../src/opencode/client.js';
import { outputBuffer } from '../src/opencode/output-buffer.js';

const baseEvent: FeishuMessageEvent = {
  messageId: 'msg-group-1',
  chatId: 'chat-group-1',
  chatType: 'group',
  senderId: 'ou-user-1',
  senderType: 'user',
  content: '帮我看看这个问题',
  msgType: 'text',
  rawEvent: {
    sender: { sender_type: 'user' },
    message: {
      message_id: 'msg-group-1',
      create_time: '0',
      chat_id: 'chat-group-1',
      chat_type: 'group',
      message_type: 'text',
      content: '{"text":"帮我看看这个问题"}',
    },
  },
};

describe('group handler thinking placeholder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    outputBuffer.clearAll();
    chatSessionStore.removeSession(baseEvent.chatId);
  });

  it('处理群聊 prompt 时应先发送思考中占位卡片', async () => {
    vi.spyOn(chatSessionStore, 'getSessionId').mockReturnValue('ses-group-1');
    vi.spyOn(chatSessionStore, 'updateLastInteraction').mockImplementation(() => undefined);
    vi.spyOn(chatSessionStore, 'getSession').mockReturnValue(undefined);
    vi.spyOn(opencodeClient, 'sendMessagePartsAsync').mockResolvedValue(undefined);

    const sendCardSpy = vi.spyOn(feishuClient, 'sendCard').mockResolvedValue('card-thinking-1');

    await groupHandler.handleMessage(baseEvent);

    expect(sendCardSpy).toHaveBeenCalledTimes(1);
    expect(sendCardSpy).toHaveBeenCalledWith(
      baseEvent.chatId,
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '处理中...',
          }),
        }),
        body: expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({
              tag: 'markdown',
              content: '🤔 思考中...',
            }),
          ]),
        }),
      })
    );

    expect(outputBuffer.get(`chat:${baseEvent.chatId}`)?.messageId).toBe('card-thinking-1');
    expect(opencodeClient.sendMessagePartsAsync).toHaveBeenCalledTimes(1);
  });
});
