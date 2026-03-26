import { beforeEach, describe, expect, it, vi } from 'vitest';
import { p2pHandler } from '../src/handlers/p2p.js';
import { groupHandler } from '../src/handlers/group.js';
import type { FeishuMessageEvent } from '../src/feishu/client.js';

const baseEvent: FeishuMessageEvent = {
  messageId: 'msg-p2p-1',
  chatId: 'chat-p2p-1',
  chatType: 'p2p',
  senderId: 'ou-user-1',
  senderType: 'user',
  content: '帮我看下这个报错',
  msgType: 'text',
  rawEvent: {
    sender: { sender_type: 'user' },
    message: {
      message_id: 'msg-p2p-1',
      create_time: '0',
      chat_id: 'chat-p2p-1',
      chat_type: 'p2p',
      message_type: 'text',
      content: '{"text":"帮我看下这个报错"}',
    },
  },
};

describe('p2p handler thinking placeholder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('私聊普通消息应转发到群聊处理链路', async () => {
    vi.spyOn(p2pHandler as never, 'ensurePrivateSession').mockResolvedValue({
      firstBinding: false,
    } as never);
    const groupSpy = vi.spyOn(groupHandler, 'handleMessage').mockResolvedValue(undefined);

    await p2pHandler.handleMessage(baseEvent);

    expect(groupSpy).toHaveBeenCalledTimes(1);
    expect(groupSpy).toHaveBeenCalledWith(baseEvent);
  });
});
