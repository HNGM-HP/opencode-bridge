/**
 * 从 main() 提取出的模块级辅助函数
 *
 * 这些函数仅引用模块级导入（streamStateManager, outputBuffer,
 * chatSessionStore）和同模块的兄弟函数，
 * 不捕获任何 main() 局部变量。
 *
 * 时间线、工具状态和流式输出相关函数已拆分至 main-helpers-timeline.ts，
 * 此文件通过 re-export 保持向后兼容。
 */

import { getSenderByPlatform } from '../platform/loader.js';
import { type PermissionRequestEvent } from '../opencode/client.js';
import { streamStateManager } from '../store/stream-state.js';
import { outputBuffer } from '../opencode/output-buffer.js';
import { chatSessionStore, type InteractionRecord } from '../store/chat-session.js';
import { type StreamCardData } from '../feishu/cards-stream.js';

import { upsertTimelineNote } from './main-helpers-timeline.js';

// ── 类型 ────────────────────────────────────────────

export type PermissionChatResolution = {
  chatId?: string;
  source: 'session' | 'parent_session' | 'related_session' | 'tool_call' | 'message' | 'unresolved';
};

// ── 类型转换 ──────────────────────────────────────

export function toSessionId(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

// ── 关联缓存 ──────────────────────────────────────

export function setToolCallCorrelation(toolCallId: unknown, chatId: unknown): void {
  const normalizedKey = toNonEmptyString(toolCallId);
  const normalizedChatId = toNonEmptyString(chatId);
  if (!normalizedKey || !normalizedChatId) return;
  streamStateManager.setToolCallChat(normalizedKey, normalizedChatId);
}

export function setMessageCorrelation(messageId: unknown, chatId: unknown): void {
  const normalizedKey = toNonEmptyString(messageId);
  const normalizedChatId = toNonEmptyString(chatId);
  if (!normalizedKey || !normalizedChatId) return;
  streamStateManager.setMessageChat(normalizedKey, normalizedChatId);
}

export function getToolCallCorrelation(toolCallId: unknown): string | undefined {
  const normalizedKey = toNonEmptyString(toolCallId);
  if (!normalizedKey) return undefined;
  const chatId = streamStateManager.getChatIdByToolCall(normalizedKey);
  if (!chatId) return undefined;
  // 会话存在性检查
  if (!chatSessionStore.hasConversationId(chatId)) {
    return undefined;
  }
  return chatId;
}

export function getMessageCorrelation(messageId: unknown): string | undefined {
  const normalizedKey = toNonEmptyString(messageId);
  if (!normalizedKey) return undefined;
  const chatId = streamStateManager.getChatIdByMessage(normalizedKey);
  if (!chatId) return undefined;
  // 会话存在性检查
  if (!chatSessionStore.hasConversationId(chatId)) {
    return undefined;
  }
  return chatId;
}

// 兼容旧接口（已废弃，保留导出兼容性）
export function setCorrelationChatRef(
  _map: unknown,
  key: unknown,
  chatId: unknown
): void {
  console.warn('[Deprecated] setCorrelationChatRef is deprecated, use setToolCallCorrelation or setMessageCorrelation instead');
}

export function getCorrelationChatRef(
  _map: unknown,
  key: unknown
): string | undefined {
  console.warn('[Deprecated] getCorrelationChatRef is deprecated, use getToolCallCorrelation or getMessageCorrelation instead');
  return undefined;
}

// ── 权限 / 会话解析 ────────────────────────────────

export function resolvePermissionChat(event: PermissionRequestEvent): PermissionChatResolution {
  const directChatId = chatSessionStore.getChatId(event.sessionId);
  if (directChatId) {
    return { chatId: directChatId, source: 'session' };
  }

  const parentSessionId = toNonEmptyString(event.parentSessionId);
  if (parentSessionId) {
    const parentChatId = chatSessionStore.getChatId(parentSessionId);
    if (parentChatId) {
      return { chatId: parentChatId, source: 'parent_session' };
    }
  }

  const relatedSessionId = toNonEmptyString(event.relatedSessionId);
  if (relatedSessionId) {
    const relatedChatId = chatSessionStore.getChatId(relatedSessionId);
    if (relatedChatId) {
      return { chatId: relatedChatId, source: 'related_session' };
    }
  }

  const toolCallChatId = getToolCallCorrelation(event.callId);
  if (toolCallChatId) {
    return { chatId: toolCallChatId, source: 'tool_call' };
  }

  const messageChatId = getMessageCorrelation(event.messageId);
  if (messageChatId) {
    return { chatId: messageChatId, source: 'message' };
  }

  return { source: 'unresolved' };
}

export function resolveSessionConversation(
  sessionId: string
): { platform: string; conversationId: string } | null {
  const conversation = chatSessionStore.getConversationBySessionId(sessionId);
  if (conversation) {
    return {
      platform: conversation.platform,
      conversationId: conversation.conversationId,
    };
  }

  const feishuChatId = chatSessionStore.getChatId(sessionId);
  if (feishuChatId) {
    return {
      platform: 'feishu',
      conversationId: feishuChatId,
    };
  }
  return null;
}

export function buildBufferKeyBySession(sessionId: string, conversationId: string): string {
  const conversation = resolveSessionConversation(sessionId);
  const platform = conversation?.platform ?? 'feishu';
  const resolvedConversationId = conversation?.conversationId ?? conversationId;

  if (platform === 'feishu') {
    return `chat:${resolvedConversationId}`;
  }
  return `chat:${platform}:${resolvedConversationId}`;
}

export function buildPermissionQueueKeyBySession(sessionId: string, conversationId: string): string {
  const conversation = resolveSessionConversation(sessionId);
  const platform = conversation?.platform ?? 'feishu';
  const resolvedConversationId = conversation?.conversationId ?? conversationId;

  if (platform === 'feishu') {
    return resolvedConversationId;
  }
  return `${platform}:${resolvedConversationId}`;
}

// ── 错误格式化 ─────────────────────────────────────

export function formatProviderError(raw: unknown): string {
  if (!raw || typeof raw !== 'object') {
    return '模型执行失败';
  }

  const error = raw as { name?: unknown; data?: Record<string, unknown> };
  const name = typeof error.name === 'string' ? error.name : 'UnknownError';
  const data = error.data && typeof error.data === 'object' ? error.data : {};

  if (name === 'APIError') {
    const message = typeof data.message === 'string' ? data.message : '上游接口报错';
    const statusCode = typeof data.statusCode === 'number' ? data.statusCode : undefined;
    if (statusCode === 429) {
      return `模型请求过快（429）：${message}`;
    }
    if (statusCode === 408 || statusCode === 504) {
      return `模型响应超时：${message}`;
    }
    return statusCode ? `模型接口错误（${statusCode}）：${message}` : `模型接口错误：${message}`;
  }

  if (name === 'ProviderAuthError') {
    const providerID = typeof data.providerID === 'string' ? data.providerID : 'unknown';
    const message = typeof data.message === 'string' ? data.message : '鉴权失败';
    return `模型鉴权失败（${providerID}）：${message}`;
  }

  if (name === 'MessageOutputLengthError') {
    return '模型输出超过长度限制，已中断';
  }

  if (name === 'MessageAbortedError') {
    const message = typeof data.message === 'string' ? data.message : '会话已中断';
    return `会话已中断：${message}`;
  }

  const generic = typeof data.message === 'string' ? data.message : '';
  return generic ? `${name}：${generic}` : `${name}`;
}

// ── 实时卡片 ───────────────────────────────────────

export function upsertLiveCardInteraction(
  chatId: string,
  replyMessageId: string | null,
  cardData: StreamCardData,
  bodyMessageIds: string[],
  thinkingMessageId: string | null,
  openCodeMsgId: string
): void {
  const botMessageIds = [...bodyMessageIds, thinkingMessageId].filter((id: string | null): id is string => typeof id === 'string' && id.length > 0);
  if (botMessageIds.length === 0) {
    return;
  }

  let existing: InteractionRecord | undefined;
  for (const msgId of botMessageIds) {
    existing = chatSessionStore.findInteractionByBotMsgId(chatId, msgId);
    if (existing) {
      break;
    }
  }

  if (existing) {
    chatSessionStore.updateInteraction(
      chatId,
      r => r === existing,
      r => {
        if (!r.userFeishuMsgId && replyMessageId) {
          r.userFeishuMsgId = replyMessageId;
        }

        for (const msgId of botMessageIds) {
          if (!r.botFeishuMsgIds.includes(msgId)) {
            r.botFeishuMsgIds.push(msgId);
          }
        }

        r.cardData = { ...cardData };
        r.type = 'normal';
        if (openCodeMsgId) {
          r.openCodeMsgId = openCodeMsgId;
        }
        r.timestamp = Date.now();
      }
    );
    return;
  }

  chatSessionStore.addInteraction(chatId, {
    userFeishuMsgId: replyMessageId || '',
    openCodeMsgId: openCodeMsgId || '',
    botFeishuMsgIds: botMessageIds,
    type: 'normal',
    cardData: { ...cardData },
    timestamp: Date.now(),
  });
}

// ── 会话失败处理 ───────────────────────────────────

export async function applyFailureToSession(sessionID: string, errorText: string): Promise<void> {
  const conversation = resolveSessionConversation(sessionID);
  if (!conversation) return;
  const platform = conversation.platform;
  const conversationId = conversation.conversationId;

  const dedupeKey = `${sessionID}:${errorText}`;
  if (streamStateManager.getErrorNotice(sessionID) === dedupeKey) {
    return;
  }
  streamStateManager.setErrorNotice(sessionID, dedupeKey);

  const bufferKey = buildBufferKeyBySession(sessionID, conversationId);
  const existingBuffer = outputBuffer.get(bufferKey) || outputBuffer.getOrCreate(bufferKey, conversationId, sessionID, null);

  upsertTimelineNote(bufferKey, `error:${sessionID}:${errorText}`, `❌ ${errorText}`, 'error');
  outputBuffer.append(bufferKey, `\n\n❌ ${errorText}`);
  outputBuffer.touch(bufferKey);
  outputBuffer.setStatus(bufferKey, 'failed');

  if (!existingBuffer.messageId) {
    const sender = getSenderByPlatform(platform);
    if (sender) {
      await sender.sendText(conversationId, `❌ ${errorText}`);
    }
  }
}

// ── 从 main-helpers-timeline.ts 重导出（向后兼容） ─

export {
  getPendingPermissionForChat,
  getOrCreateTimelineState,
  trimTimeline,
  upsertTimelineSegment,
  appendTimelineText,
  setTimelineText,
  upsertTimelineTool,
  upsertTimelineNote,
  getTimelineSegments,
  getPendingQuestionForBuffer,
  normalizeToolStatus,
  getToolStatusText,
  stringifyToolOutput,
  asRecord,
  pickFirstDefined,
  buildToolTraceOutput,
  clipToolTrace,
  mergeToolOutput,
  getOrCreateToolStateBucket,
  syncToolsToBuffer,
  upsertToolState,
  markActiveToolsCompleted,
  appendTextFromPart,
  appendReasoningFromPart,
  clearPartSnapshotsForSession,
} from './main-helpers-timeline.js';
