/**
 * Stream Accumulator
 *
 * Extracted from OpenCodeEventHub.handleMessagePartUpdated.
 * Handles streaming delta accumulation for text, reasoning, tool calls,
 * subtasks, retry, and compaction events.
 */

import type { StreamStateManager } from '../store/stream-state.js';
import { CORRELATION_CACHE_TTL_MS } from '../store/stream-state.js';
import type { ToolRuntimeState } from './opencode-event-hub.js';
import type { UserMessageIdCache } from './user-message-cache.js';

export interface StreamAccumulatorDeps {
  toSessionId: (value: unknown) => string;
  chatSessionStore: {
    getChatId(sessionId: string): string | undefined;
    rememberSessionAlias(sessionId: string, chatId: string, ttl: number): void;
  };
  outputBuffer: {
    get(bufferKey: string): unknown;
    getOrCreate(bufferKey: string, conversationId: string, sessionId: string, msgId: string | null): unknown;
    append(bufferKey: string, text: string): void;
    appendThinking(bufferKey: string, text: string): void;
    touch(bufferKey: string): void;
  };
  setToolCallCorrelation: (toolCallId: unknown, chatId: unknown) => void;
  setMessageCorrelation: (messageId: unknown, chatId: unknown) => void;
  asRecord: (value: unknown) => Record<string, unknown> | null;
  normalizeToolStatus: (status: unknown) => 'pending' | 'running' | 'completed' | 'failed';
  buildToolTraceOutput: (part: Record<string, unknown>, status: ToolRuntimeState['status'], withInput: boolean) => string | undefined;
  upsertToolState: (bufferKey: string, toolKey: string, state: ToolRuntimeState, kind?: 'tool' | 'subtask') => void;
  getOrCreateToolStateBucket: (bufferKey: string) => Map<string, ToolRuntimeState>;
  upsertTimelineNote: (bufferKey: string, noteKey: string, text: string, variant?: 'retry' | 'compaction' | 'question' | 'error' | 'permission') => void;
  appendTimelineText: (bufferKey: string, segmentKey: string, type: 'text' | 'reasoning', deltaText: string) => void;
  setTimelineText: (bufferKey: string, segmentKey: string, type: 'text' | 'reasoning', text: string) => void;
  streamStateManager: StreamStateManager;
  appendTextFromPart: (sessionID: string, part: { id?: unknown; text?: unknown }, bufferKey: string) => void;
  appendReasoningFromPart: (sessionID: string, part: { id?: unknown; text?: unknown }, bufferKey: string) => void;
  stringifyToolOutput: (value: unknown) => string | undefined;
  getToolStatusText: (status: ToolRuntimeState['status']) => string;
  pickFirstDefined: (...values: unknown[]) => unknown;
  resolveConversationRoute: (sessionId: string, fallbackConversationId: string) => { platform: string; conversationId: string; bufferKey: string; permissionChatKey: string };
  userMessageIdCache: UserMessageIdCache;
}

export class StreamAccumulator {
  constructor(private depsFactory: () => StreamAccumulatorDeps) {}

  handleMessagePartUpdated(event: unknown): void {
    const deps = this.depsFactory();
    const {
      toSessionId,
      chatSessionStore,
      outputBuffer,
      setToolCallCorrelation,
      setMessageCorrelation,
      asRecord,
      normalizeToolStatus,
      buildToolTraceOutput,
      upsertToolState,
      getOrCreateToolStateBucket,
      upsertTimelineNote,
      appendTimelineText,
      setTimelineText,
      streamStateManager,
      appendTextFromPart,
      appendReasoningFromPart,
      stringifyToolOutput,
      getToolStatusText,
      pickFirstDefined,
      resolveConversationRoute,
      userMessageIdCache,
    } = deps;

    const eventObj = event as Record<string, unknown>;
    const part = eventObj?.part as Record<string, unknown> | undefined;
    const sessionID = toSessionId(eventObj?.sessionID || part?.sessionID);
    const delta = eventObj?.delta;
    if (!sessionID) return;

    const partMessageId = typeof part?.messageID === 'string' ? part.messageID : '';
    if (partMessageId && userMessageIdCache.isUserMessage(sessionID, partMessageId)) {
      return;
    }

    const chatId = chatSessionStore.getChatId(sessionID);
    if (!chatId) return;

    const route = resolveConversationRoute(sessionID, chatId);
    const bufferKey = route.bufferKey;
    if (!outputBuffer.get(bufferKey)) {
      outputBuffer.getOrCreate(bufferKey, route.conversationId, sessionID, null);
    }

    chatSessionStore.rememberSessionAlias(sessionID, chatId, CORRELATION_CACHE_TTL_MS);

    // Tool 处理
    if (part?.type === 'tool' && typeof part === 'object') {
      const toolPart = part as Record<string, unknown>;
      const rawToolName = toolPart.tool;
      const toolObj = asRecord(rawToolName);
      const toolName = typeof rawToolName === 'string' && rawToolName.trim()
        ? rawToolName.trim()
        : toolObj && typeof toolObj.name === 'string' && toolObj.name.trim()
          ? toolObj.name.trim()
          : 'tool';
      const state = asRecord(toolPart.state);
      const status = normalizeToolStatus(state?.status);
      const toolKey = typeof toolPart.callID === 'string' && toolPart.callID
        ? toolPart.callID
        : typeof toolPart.id === 'string' && toolPart.id
          ? toolPart.id
          : `${toolName}:${Date.now()}`;
      setToolCallCorrelation(toolPart.callID, chatId);
      setToolCallCorrelation(toolPart.callId, chatId);
      setToolCallCorrelation(toolPart.toolCallID, chatId);
      setToolCallCorrelation(toolPart.toolCallId, chatId);
      setMessageCorrelation(toolPart.messageID, chatId);
      setMessageCorrelation(toolPart.messageId, chatId);
      const previous = getOrCreateToolStateBucket(bufferKey).get(toolKey);
      const output = buildToolTraceOutput(toolPart, status, !previous || !previous.output);

      upsertToolState(bufferKey, toolKey, {
        name: toolName,
        status,
        ...(output ? { output } : {}),
        kind: 'tool',
      }, 'tool');
    }

    // Subtask 处理
    if (part?.type === 'subtask' && typeof part === 'object') {
      const subtaskPart = part as Record<string, unknown>;
      const taskName = typeof subtaskPart.description === 'string' && subtaskPart.description.trim()
        ? subtaskPart.description.trim()
        : 'Subtask';
      const state = asRecord(subtaskPart.state);
      const status = normalizeToolStatus(state?.status);
      const toolKey = typeof subtaskPart.id === 'string' && subtaskPart.id
        ? `subtask:${subtaskPart.id}`
        : `subtask:${Date.now()}`;
      const previous = getOrCreateToolStateBucket(bufferKey).get(toolKey);
      const outputParts: string[] = [];

      if (!previous) {
        if (typeof subtaskPart.agent === 'string' && subtaskPart.agent.trim()) {
          outputParts.push(`agent=${subtaskPart.agent.trim()}`);
        }
        if (typeof subtaskPart.prompt === 'string' && subtaskPart.prompt.trim()) {
          const normalizedPrompt = subtaskPart.prompt.trim().replace(/\s+/g, ' ');
          outputParts.push(`prompt=${normalizedPrompt.slice(0, 200)}`);
        }
      }

      const stateOutput = status === 'failed'
        ? stringifyToolOutput(pickFirstDefined(state?.error, state?.output))
        : stringifyToolOutput(pickFirstDefined(state?.output, state?.result, state?.message));
      if (stateOutput && stateOutput.trim()) {
        outputParts.push(stateOutput.trim());
      } else {
        outputParts.push(`状态更新：${getToolStatusText(status)}`);
      }

      const output = outputParts.join('\n\n');
      upsertToolState(bufferKey, toolKey, {
        name: taskName,
        status,
        ...(output ? { output } : {}),
        kind: 'subtask',
      }, 'subtask');
    }

    // Retry 处理
    if (part?.type === 'retry') {
      const errorObj = (part as Record<string, unknown>).error as Record<string, unknown> | undefined;
      const errorData = errorObj?.data as Record<string, unknown> | undefined;
      const retryMessage = errorData?.message;
      if (typeof retryMessage === 'string' && retryMessage.trim()) {
        const retryKey = typeof (part as Record<string, unknown>).id === 'string' && (part as Record<string, unknown>).id
          ? (part as Record<string, unknown>).id as string
          : retryMessage.trim().slice(0, 80);
        upsertTimelineNote(bufferKey, `part-retry:${sessionID}:${retryKey}`, `⚠️ 模型请求重试：${retryMessage.trim()}`, 'retry');
        outputBuffer.touch(bufferKey);
      }
    }

    // Compaction 处理
    if (part?.type === 'compaction') {
      const compactionKey = typeof (part as Record<string, unknown>).id === 'string' && (part as Record<string, unknown>).id
        ? (part as Record<string, unknown>).id as string
        : `${Date.now()}`;
      upsertTimelineNote(bufferKey, `compaction:${sessionID}:${compactionKey}`, '🗜️ 会话上下文已压缩', 'compaction');
      outputBuffer.touch(bufferKey);
    }

    // Delta 字符串处理
    if (typeof delta === 'string') {
      if (delta.length > 0) {
        if (part?.type === 'reasoning') {
          outputBuffer.appendThinking(bufferKey, delta);
          if (typeof part?.id === 'string') {
            const key = `${sessionID}:${part.id}`;
            const prev = streamStateManager.getReasoningSnapshot(key) || '';
            const next = `${prev}${delta}`;
            streamStateManager.setReasoningSnapshot(key, next);
            setTimelineText(bufferKey, `reasoning:${key}`, 'reasoning', next);
          } else {
            appendTimelineText(bufferKey, `reasoning:${sessionID}:anonymous`, 'reasoning', delta);
          }
          return;
        }
        if (part?.type === 'text') {
          if (typeof part?.id === 'string' && part.id) {
            const key = `${sessionID}:${part.id}`;
            const prev = streamStateManager.getTextSnapshot(key) || '';
            const next = `${prev}${delta}`;
            streamStateManager.setTextSnapshot(key, next);
            setTimelineText(bufferKey, `text:${key}`, 'text', next);
          } else {
            appendTimelineText(bufferKey, `text:${sessionID}:anonymous`, 'text', delta);
          }
          outputBuffer.append(bufferKey, delta);
          return;
        }
        outputBuffer.append(bufferKey, delta);
        return;
      }
    }

    // Delta 对象处理
    if (delta && typeof delta === 'object') {
      const deltaObj = delta as Record<string, unknown>;
      if (deltaObj.type === 'reasoning') {
        const reasoningText =
          typeof deltaObj.text === 'string'
            ? deltaObj.text
            : typeof deltaObj.reasoning === 'string'
              ? deltaObj.reasoning
              : '';
        if (reasoningText) {
          outputBuffer.appendThinking(bufferKey, reasoningText);
          if (typeof part?.id === 'string' && part.id) {
            const key = `${sessionID}:${part.id}`;
            const prev = streamStateManager.getReasoningSnapshot(key) || '';
            const next = `${prev}${reasoningText}`;
            streamStateManager.setReasoningSnapshot(key, next);
            setTimelineText(bufferKey, `reasoning:${key}`, 'reasoning', next);
          } else {
            appendTimelineText(bufferKey, `reasoning:${sessionID}:anonymous`, 'reasoning', reasoningText);
          }
        }
      } else if (deltaObj.type === 'thinking' && typeof deltaObj.thinking === 'string') {
        outputBuffer.appendThinking(bufferKey, deltaObj.thinking);
        if (typeof part?.id === 'string' && part.id) {
          const key = `${sessionID}:${part.id}`;
          const prev = streamStateManager.getReasoningSnapshot(key) || '';
          const next = `${prev}${deltaObj.thinking}`;
          streamStateManager.setReasoningSnapshot(key, next);
          setTimelineText(bufferKey, `reasoning:${key}`, 'reasoning', next);
        } else {
          appendTimelineText(bufferKey, `reasoning:${sessionID}:anonymous`, 'reasoning', deltaObj.thinking);
        }
      } else if (deltaObj.type === 'text' && typeof deltaObj.text === 'string' && deltaObj.text.length > 0) {
        outputBuffer.append(bufferKey, deltaObj.text);
        if (typeof part?.id === 'string' && part.id) {
          const key = `${sessionID}:${part.id}`;
          const prev = streamStateManager.getTextSnapshot(key) || '';
          const next = `${prev}${deltaObj.text}`;
          streamStateManager.setTextSnapshot(key, next);
          setTimelineText(bufferKey, `text:${key}`, 'text', next);
        } else {
          appendTimelineText(bufferKey, `text:${sessionID}:anonymous`, 'text', deltaObj.text);
        }
      } else if (typeof deltaObj.text === 'string' && deltaObj.text.length > 0) {
        outputBuffer.append(bufferKey, deltaObj.text);
        if (part?.type === 'reasoning') {
          if (typeof part?.id === 'string' && part.id) {
            const key = `${sessionID}:${part.id}`;
            const prev = streamStateManager.getReasoningSnapshot(key) || '';
            const next = `${prev}${deltaObj.text}`;
            streamStateManager.setReasoningSnapshot(key, next);
            setTimelineText(bufferKey, `reasoning:${key}`, 'reasoning', next);
          } else {
            appendTimelineText(bufferKey, `reasoning:${sessionID}:anonymous`, 'reasoning', deltaObj.text);
          }
        } else if (part?.type === 'text') {
          if (typeof part?.id === 'string' && part.id) {
            const key = `${sessionID}:${part.id}`;
            const prev = streamStateManager.getTextSnapshot(key) || '';
            const next = `${prev}${deltaObj.text}`;
            streamStateManager.setTextSnapshot(key, next);
            setTimelineText(bufferKey, `text:${key}`, 'text', next);
          } else {
            appendTimelineText(bufferKey, `text:${sessionID}:anonymous`, 'text', deltaObj.text);
          }
        }
      }
      return;
    }

    // 兜底处理
    if (part?.type === 'reasoning' && typeof (part as Record<string, unknown>).text === 'string') {
      appendReasoningFromPart(sessionID as string, part as { id?: unknown; text?: unknown }, bufferKey);
    } else if (part?.type === 'text' && typeof (part as Record<string, unknown>).text === 'string') {
      appendTextFromPart(sessionID as string, part as { id?: unknown; text?: unknown }, bufferKey);
    }
  }
}
