/**
 * Feishu 适配器工具函数
 *
 * 从 feishu-adapter.ts 提取。
 */

import type {
  PlatformMessageEvent,
  PlatformActionEvent,
  PlatformAttachment,
  PlatformMention,
} from '../types.js';
import type { FeishuMessageEvent, FeishuCardActionEvent } from '../../feishu/client.js';

/**
 * 将 Feishu 消息事件映射为平台通用事件
 */
export function mapMessageEvent(event: FeishuMessageEvent): PlatformMessageEvent {
  // 映射附件
  let attachments: PlatformAttachment[] | undefined;
  if (event.attachments && event.attachments.length > 0) {
    attachments = event.attachments.map(att => ({
      type: att.type,
      fileKey: att.fileKey,
      fileName: att.fileName,
      fileType: att.fileType,
      fileSize: att.fileSize,
    }));
  }

  // 映射提及
  let mentions: PlatformMention[] | undefined;
  if (event.mentions && event.mentions.length > 0) {
    mentions = event.mentions.map(m => ({
      key: m.key,
      id: m.id,
      name: m.name,
    }));
  }

  return {
    platform: 'feishu',
    // chatId -> conversationId
    conversationId: event.chatId,
    messageId: event.messageId,
    // openId -> senderId (已在 FeishuMessageEvent 中提取)
    senderId: event.senderId,
    senderType: event.senderType,
    content: event.content,
    msgType: event.msgType,
    threadId: event.threadId,
    chatType: event.chatType,
    attachments,
    mentions,
    rawEvent: event.rawEvent,
  };
}

/**
 * 将 Feishu 卡片动作事件映射为平台通用事件
 */
export function mapActionEvent(event: FeishuCardActionEvent): PlatformActionEvent {
  return {
    platform: 'feishu',
    // openId -> senderId
    senderId: event.openId,
    action: event.action,
    token: event.token,
    messageId: event.messageId,
    // chatId -> conversationId
    conversationId: event.chatId,
    threadId: event.threadId,
    rawEvent: event.rawEvent,
  };
}
