/**
 * 从 main-helpers.ts 拆分出的时间线、工具状态与流式输出辅助函数
 *
 * 这些函数仅依赖 streamStateManager, outputBuffer, permissionHandler,
 * questionHandler，不引用 chatSessionStore 或会话解析逻辑。
 */

import { permissionHandler } from '../permissions/handler.js';
import { questionHandler } from '../opencode/question-handler.js';
import { streamStateManager, type ToolRuntimeState, type TimelineSegment, type StreamTimelineState } from '../store/stream-state.js';
import { outputBuffer } from '../opencode/output-buffer.js';
import {
  type StreamCardSegment,
  type StreamCardPendingPermission,
  type StreamCardPendingQuestion,
} from '../feishu/cards-stream.js';

// ── 常量 ────────────────────────────────────────────

const TOOL_TRACE_LIMIT = 20000;

// ── 权限 & 时间线 ──────────────────────────────────

export function getPendingPermissionForChat(chatId: string): StreamCardPendingPermission | undefined {
  const head = permissionHandler.peekForChat(chatId);
  if (!head) return undefined;

  const pendingCount = permissionHandler.getQueueSizeForChat(chatId);
  return {
    sessionId: head.sessionId,
    permissionId: head.permissionId,
    tool: head.tool,
    description: head.description,
    risk: head.risk,
    pendingCount,
    parentSessionId: head.parentSessionId,
    relatedSessionId: head.relatedSessionId,
  };
}

export function getOrCreateTimelineState(bufferKey: string): StreamTimelineState {
  return streamStateManager.getOrCreateTimeline(bufferKey);
}

export function trimTimeline(timeline: StreamTimelineState): void {
  streamStateManager.trimTimeline(timeline);
}

export function upsertTimelineSegment(bufferKey: string, segmentKey: string, segment: TimelineSegment): void {
  streamStateManager.upsertTimelineSegment(bufferKey, segmentKey, segment);
}

export function appendTimelineText(
  bufferKey: string,
  segmentKey: string,
  type: 'text' | 'reasoning',
  deltaText: string
): void {
  if (!deltaText) return;
  const timeline = getOrCreateTimelineState(bufferKey);
  const previous = timeline.segments.get(segmentKey);
  if (previous && previous.type === type) {
    timeline.segments.set(segmentKey, {
      type,
      text: `${previous.text}${deltaText}`,
    });
    return;
  }

  if (!timeline.segments.has(segmentKey)) {
    timeline.order.push(segmentKey);
    trimTimeline(timeline);
  }
  timeline.segments.set(segmentKey, {
    type,
    text: deltaText,
  });
}

export function setTimelineText(
  bufferKey: string,
  segmentKey: string,
  type: 'text' | 'reasoning',
  text: string
): void {
  const timeline = getOrCreateTimelineState(bufferKey);
  const previous = timeline.segments.get(segmentKey);
  if (previous && previous.type === type && previous.text === text) {
    return;
  }

  if (!timeline.segments.has(segmentKey)) {
    timeline.order.push(segmentKey);
    trimTimeline(timeline);
  }
  timeline.segments.set(segmentKey, { type, text });
}

export function upsertTimelineTool(
  bufferKey: string,
  toolKey: string,
  state: ToolRuntimeState,
  kind: 'tool' | 'subtask' = 'tool'
): void {
  const segmentKey = `tool:${toolKey}`;
  const timeline = getOrCreateTimelineState(bufferKey);
  const previous = timeline.segments.get(segmentKey);
  if (previous && previous.type === 'tool') {
    timeline.segments.set(segmentKey, {
      type: 'tool',
      name: state.name,
      status: state.status,
      output: state.output ?? previous.output,
      kind,
    });
    return;
  }

  if (!timeline.segments.has(segmentKey)) {
    timeline.order.push(segmentKey);
    trimTimeline(timeline);
  }
  timeline.segments.set(segmentKey, {
    type: 'tool',
    name: state.name,
    status: state.status,
    ...(state.output !== undefined ? { output: state.output } : {}),
    kind,
  });
}

export function upsertTimelineNote(
  bufferKey: string,
  noteKey: string,
  text: string,
  variant?: 'retry' | 'compaction' | 'question' | 'error' | 'permission'
): void {
  upsertTimelineSegment(bufferKey, `note:${noteKey}`, {
    type: 'note',
    text,
    ...(variant ? { variant } : {}),
  });
}

export function getTimelineSegments(bufferKey: string): StreamCardSegment[] {
  const timeline = streamStateManager.getTimeline(bufferKey);
  if (!timeline) {
    return [];
  }

  const segments: StreamCardSegment[] = [];
  for (const key of timeline.order) {
    const segment = timeline.segments.get(key);
    if (!segment) continue;

    if (segment.type === 'text' || segment.type === 'reasoning') {
      if (!segment.text.trim()) continue;
      segments.push({
        type: segment.type,
        text: segment.text,
      });
      continue;
    }

    if (segment.type === 'tool') {
      segments.push({
        type: 'tool',
        name: segment.name,
        status: segment.status,
        ...(segment.output !== undefined ? { output: segment.output } : {}),
        ...(segment.kind ? { kind: segment.kind } : {}),
      });
      continue;
    }

    if (!segment.text.trim()) continue;
    segments.push({
      type: 'note',
      text: segment.text,
      ...(segment.variant ? { variant: segment.variant } : {}),
    });
  }

  return segments;
}

export function getPendingQuestionForBuffer(sessionId: string, chatId: string): StreamCardPendingQuestion | undefined {
  const pending = questionHandler.getBySession(sessionId);
  if (!pending || pending.chatId !== chatId) {
    return undefined;
  }

  const totalQuestions = pending.request.questions.length;
  if (totalQuestions === 0) {
    return undefined;
  }

  const safeIndex = Math.min(Math.max(pending.currentQuestionIndex, 0), totalQuestions - 1);
  const question = pending.request.questions[safeIndex];
  if (!question) {
    return undefined;
  }

  return {
    requestId: pending.request.id,
    sessionId: pending.request.sessionID,
    chatId: pending.chatId,
    questionIndex: safeIndex,
    totalQuestions,
    header: typeof question.header === 'string' ? question.header : '',
    question: typeof question.question === 'string' ? question.question : '',
    options: Array.isArray(question.options)
      ? question.options.map(option => ({
          label: typeof option.label === 'string' ? option.label : '',
          description: typeof option.description === 'string' ? option.description : '',
        }))
      : [],
    multiple: question.multiple === true,
  };
}

// ── 工具状态 / 输出 ────────────────────────────────

export function normalizeToolStatus(status: unknown): 'pending' | 'running' | 'completed' | 'failed' {
  if (status === 'pending' || status === 'running' || status === 'completed') {
    return status;
  }
  if (status === 'error' || status === 'failed') {
    return 'failed';
  }
  return 'running';
}

export function getToolStatusText(status: ToolRuntimeState['status']): string {
  if (status === 'pending') return '等待中';
  if (status === 'running') return '执行中';
  if (status === 'completed') return '已完成';
  return '失败';
}

export function stringifyToolOutput(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function pickFirstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

export function buildToolTraceOutput(
  part: Record<string, unknown>,
  status: ToolRuntimeState['status'],
  withInput: boolean
): string | undefined {
  const state = asRecord(part.state);
  const inputValue = withInput
    ? pickFirstDefined(
        part.input,
        part.args,
        part.arguments,
        part.raw,
        part.rawInput,
        state?.input,
        state?.args,
        state?.arguments,
        state?.raw
      )
    : undefined;
  const outputValue = status === 'failed'
    ? pickFirstDefined(state?.error, state?.output, part.error)
    : pickFirstDefined(state?.output, state?.result, state?.message, part.output, part.result);

  const inputText = stringifyToolOutput(inputValue);
  const outputText = stringifyToolOutput(outputValue);
  const blocks: string[] = [];

  if (inputText && inputText.trim()) {
    blocks.push(`调用参数:\n${inputText.trim()}`);
  }

  if (outputText && outputText.trim()) {
    blocks.push(`${status === 'failed' ? '错误输出' : '执行输出'}:\n${outputText.trim()}`);
  }

  if (blocks.length === 0) {
    return `状态更新：${getToolStatusText(status)}`;
  }

  return blocks.join('\n\n');
}

export function clipToolTrace(text: string): string {
  if (text.length <= TOOL_TRACE_LIMIT) {
    return text;
  }
  const retained = text.slice(-TOOL_TRACE_LIMIT);
  return `...（历史输出过长，已截断前 ${text.length - TOOL_TRACE_LIMIT} 字）...\n${retained}`;
}

export function mergeToolOutput(previous: string | undefined, incoming: string | undefined): string | undefined {
  if (!incoming || !incoming.trim()) {
    return previous;
  }

  const next = incoming.trim();
  if (!previous || !previous.trim()) {
    return clipToolTrace(next);
  }

  const prev = previous.trim();
  if (prev === next) {
    return previous;
  }

  if (next.startsWith(prev) || next.includes(prev)) {
    return clipToolTrace(next);
  }

  return clipToolTrace(`${previous}\n\n---\n${next}`);
}

export function getOrCreateToolStateBucket(bufferKey: string): Map<string, ToolRuntimeState> {
  let bucket = streamStateManager.getToolStates(bufferKey);
  if (!bucket) {
    bucket = new Map();
    streamStateManager.setToolStates(bufferKey, bucket);
  }
  return bucket;
}

export function syncToolsToBuffer(bufferKey: string): void {
  const bucket = streamStateManager.getToolStates(bufferKey);
  if (!bucket) {
    outputBuffer.setTools(bufferKey, []);
    return;
  }
  outputBuffer.setTools(bufferKey, Array.from(bucket.values()).map(item => ({
    name: item.name,
    status: item.status,
    ...(item.output !== undefined ? { output: item.output } : {}),
  })));
}

export function upsertToolState(
  bufferKey: string,
  toolKey: string,
  nextState: ToolRuntimeState,
  kind: 'tool' | 'subtask' = 'tool'
): void {
  const bucket = getOrCreateToolStateBucket(bufferKey);
  const previous = bucket.get(toolKey);
  const mergedOutput = mergeToolOutput(previous?.output, nextState.output);
  bucket.set(toolKey, {
    name: nextState.name,
    status: nextState.status,
    output: mergedOutput,
    kind: nextState.kind ?? previous?.kind ?? kind,
  });
  upsertTimelineTool(bufferKey, toolKey, {
    name: nextState.name,
    status: nextState.status,
    output: mergedOutput,
    kind: nextState.kind ?? previous?.kind ?? kind,
  }, nextState.kind ?? previous?.kind ?? kind);
  syncToolsToBuffer(bufferKey);
}

export function markActiveToolsCompleted(bufferKey: string): void {
  const bucket = streamStateManager.getToolStates(bufferKey);
  if (!bucket) return;
  for (const [toolKey, item] of bucket.entries()) {
    if (item.status === 'running' || item.status === 'pending') {
      bucket.set(toolKey, {
        ...item,
        status: 'completed',
      });
      upsertTimelineTool(bufferKey, toolKey, {
        ...item,
        status: 'completed',
      }, item.kind ?? 'tool');
    }
  }
  syncToolsToBuffer(bufferKey);
}

// ── 流式输出 / 快照 ────────────────────────────────

export function appendTextFromPart(sessionID: string, part: { id?: unknown; text?: unknown }, bufferKey: string): void {
  if (typeof part.text !== 'string') return;
  if (typeof part.id !== 'string' || !part.id) {
    outputBuffer.append(bufferKey, part.text);
    appendTimelineText(bufferKey, `text:${sessionID}:anonymous`, 'text', part.text);
    return;
  }

  const key = `${sessionID}:${part.id}`;
  const prev = streamStateManager.getTextSnapshot(key) || '';
  const current = part.text;
  if (current.startsWith(prev)) {
    const deltaText = current.slice(prev.length);
    if (deltaText) {
      outputBuffer.append(bufferKey, deltaText);
    }
  } else if (current !== prev) {
    outputBuffer.append(bufferKey, current);
  }
  streamStateManager.setTextSnapshot(key, current);
  setTimelineText(bufferKey, `text:${key}`, 'text', current);
}

export function appendReasoningFromPart(sessionID: string, part: { id?: unknown; text?: unknown }, bufferKey: string): void {
  if (typeof part.text !== 'string') return;
  if (typeof part.id !== 'string' || !part.id) {
    outputBuffer.appendThinking(bufferKey, part.text);
    appendTimelineText(bufferKey, `reasoning:${sessionID}:anonymous`, 'reasoning', part.text);
    return;
  }

  const key = `${sessionID}:${part.id}`;
  const prev = streamStateManager.getReasoningSnapshot(key) || '';
  const current = part.text;
  if (current.startsWith(prev)) {
    const deltaText = current.slice(prev.length);
    if (deltaText) {
      outputBuffer.appendThinking(bufferKey, deltaText);
    }
  } else if (current !== prev) {
    outputBuffer.appendThinking(bufferKey, current);
  }
  streamStateManager.setReasoningSnapshot(key, current);
  setTimelineText(bufferKey, `reasoning:${key}`, 'reasoning', current);
}

export function clearPartSnapshotsForSession(sessionID: string): void {
  // 注意：StreamStateManager 的快照是按 bufferKey 管理的
  // 这里保留旧的 sessionID:partId 格式，但需要遍历所有键
  // 暂时保留原始实现，后续可以优化
  const prefix = `${sessionID}:`;
  // 由于 StreamStateManager 没有暴露 keys() 方法，这里暂时跳过
  // 改为在 clear() 时统一清理
  streamStateManager.setRetryNotice(sessionID, '');
  streamStateManager.setErrorNotice(sessionID, '');
}
