import { outputBuffer } from '../opencode/output-buffer.js';
import { streamStateManager } from '../store/stream-state.js';
import { getSenderByPlatform, getCachedAdapter } from '../platform/loader.js';
import { chatSessionStore } from '../store/chat-session.js';
import { buildPortableUpdatePayload } from '../utils/text-builder.js';
import { buildStreamCards, type StreamCardData, type StreamCardSegment, type StreamCardPendingPermission, type StreamCardPendingQuestion } from '../feishu/cards-stream.js';

export interface BufferCallbackDependencies {
  /** 获取时间线片段列表 */
  getTimelineSegments: (bufferKey: string) => StreamCardSegment[];
  /** 解析会话所属平台 */
  resolveSessionConversation: (sessionId: string) => { platform: string; conversationId: string } | null;
  /** 构建权限队列键 */
  buildPermissionQueueKeyBySession: (sessionId: string, conversationId: string) => string;
  /** 获取待处理的权限申请 */
  getPendingPermissionForChat: (chatId: string) => StreamCardPendingPermission | undefined;
  /** 获取待处理的问题 */
  getPendingQuestionForBuffer: (sessionId: string, chatId: string) => StreamCardPendingQuestion | undefined;
  /** 清理会话快照 */
  clearPartSnapshotsForSession: (sessionID: string) => void;
  /** 更新或创建实时卡片交互记录 */
  upsertLiveCardInteraction: (
    chatId: string,
    replyMessageId: string | null,
    cardData: StreamCardData,
    bodyMessageIds: string[],
    thinkingMessageId: string | null,
    openCodeMsgId: string
  ) => void;
}

/** 注册输出缓冲回调（处理流式消息的渲染和发送） */
export function registerBufferCallback(
  deps: BufferCallbackDependencies
): void {
  const STREAM_CARD_COMPONENT_BUDGET = 180;
  const FEISHU_RENDER_DEDUPE_WINDOW_MS = 15_000;

  const feishuRecentRenderCache = new Map<string, {
    status: StreamCardData['status'];
    signature: string;
    messageIds: string[];
    updatedAt: number;
  }>();

  const qqProgressState = new Map<string, {
    sentThinking: string;
    lastThinkingChunk: string;
    finalSent: boolean;
  }>();

  const pruneFeishuRecentRenderCache = (): void => {
    const now = Date.now();
    for (const [key, value] of feishuRecentRenderCache.entries()) {
      if (now - value.updatedAt > FEISHU_RENDER_DEDUPE_WINDOW_MS) {
        feishuRecentRenderCache.delete(key);
      }
    }
  };

  const getQQProgressState = (bufferKey: string): { sentThinking: string; lastThinkingChunk: string; finalSent: boolean } => {
    let state = qqProgressState.get(bufferKey);
    if (!state) {
      state = {
        sentThinking: '',
        lastThinkingChunk: '',
        finalSent: false,
      };
      qqProgressState.set(bufferKey, state);
    }
    return state;
  };

  const getIncrementalSuffix = (fullText: string, sentText: string): string => {
    if (!fullText) {
      return '';
    }
    if (!sentText) {
      return fullText;
    }
    if (fullText.startsWith(sentText)) {
      return fullText.slice(sentText.length);
    }
    if (sentText.startsWith(fullText)) {
      return '';
    }
    return fullText;
  };

  outputBuffer.setUpdateCallback(async (buffer) => {
    const { text, thinking } = outputBuffer.getAndClear(buffer.key);
    const timelineSegments = deps.getTimelineSegments(buffer.key);
    const sessionConversation = deps.resolveSessionConversation(buffer.sessionId);
    const platform = sessionConversation?.platform ?? 'feishu';
    const conversationId = sessionConversation?.conversationId ?? buffer.chatId;
    const permissionQueueKey = deps.buildPermissionQueueKeyBySession(buffer.sessionId, conversationId);
    const pendingPermission = deps.getPendingPermissionForChat(permissionQueueKey);
    const pendingQuestion = deps.getPendingQuestionForBuffer(buffer.sessionId, conversationId);

    if (
      !text &&
      !thinking &&
      timelineSegments.length === 0 &&
      buffer.tools.length === 0 &&
      !pendingPermission &&
      !pendingQuestion &&
      buffer.status === 'running'
    ) return;

    const current = streamStateManager.getContent(buffer.key) || { text: '', thinking: '' };
    current.text += text;
    current.thinking += thinking;

    if (buffer.status !== 'running') {
      if (buffer.finalText) {
        current.text = buffer.finalText;
      }
      if (buffer.finalThinking) {
        current.thinking = buffer.finalThinking;
      }
    }

    streamStateManager.setContent(buffer.key, current);

    const hasVisibleContent =
      current.text.trim().length > 0 ||
      current.thinking.trim().length > 0 ||
      buffer.tools.length > 0 ||
      timelineSegments.length > 0 ||
      Boolean(pendingPermission) ||
      Boolean(pendingQuestion);

    if (!hasVisibleContent && buffer.status === 'running') return;

    const status: StreamCardData['status'] =
      buffer.status === 'failed' || buffer.status === 'aborted'
        ? 'failed'
        : buffer.status === 'completed'
          ? 'completed'
          : 'processing';

    let existingMessageIds = streamStateManager.getCardMessageIds(buffer.key) || [];
    if (existingMessageIds.length === 0 && buffer.messageId) {
      existingMessageIds = [buffer.messageId];
    }

    const cardData: StreamCardData = {
      text: current.text,
      thinking: current.thinking,
      chatId: conversationId,
      messageId: existingMessageIds[0] || undefined,
      tools: [...buffer.tools],
      segments: timelineSegments,
      ...(pendingPermission ? { pendingPermission } : {}),
      ...(pendingQuestion ? { pendingQuestion } : {}),
      status,
      showThinking: false,
    };

    if (platform === 'qq') {
      const sender = getSenderByPlatform(platform);
      if (!sender) {
        console.error('[outputBuffer] 无法获取 QQ sender');
        return;
      }

      const onlyText = chatSessionStore.getSessionByConversation('qq', conversationId)?.qqOutputOnlyText === true;
      const progress = getQQProgressState(buffer.key);

      const thinkingDelta = getIncrementalSuffix(current.thinking, progress.sentThinking);
      const normalizedThinkingDelta = thinkingDelta.trim();

      if (normalizedThinkingDelta && normalizedThinkingDelta !== progress.lastThinkingChunk) {
        const safeThinkingDelta = normalizedThinkingDelta.replace(/```/g, '` ` `');
        const thinkingPayload = onlyText
          ? `思考过程：\n${normalizedThinkingDelta}`
          : `**思考过程**\n\`\`\`text\n${safeThinkingDelta}\n\`\`\``;
        await sender.sendCard(conversationId, onlyText
          ? { qqText: thinkingPayload, forcePlainText: true }
          : { markdown: thinkingPayload, qqText: thinkingPayload });
        progress.sentThinking = current.thinking;
        progress.lastThinkingChunk = normalizedThinkingDelta;
      } else if (current.thinking.length > progress.sentThinking.length) {
        progress.sentThinking = current.thinking;
      }

      if (buffer.status !== 'running' && !progress.finalSent) {
        const finalCardData: StreamCardData = {
          ...cardData,
          thinking: '',
          segments: (cardData.segments ?? []).filter(segment => segment.type !== 'reasoning'),
        };
        const finalPayload = buildPortableUpdatePayload(finalCardData, conversationId, 'qq');
        await sender.sendCard(
          conversationId,
          onlyText
            ? { qqText: finalPayload.qqText, forcePlainText: true }
            : { markdown: finalPayload.markdown, qqText: finalPayload.qqText }
        );
        progress.finalSent = true;
      }

      if (buffer.status !== 'running') {
        qqProgressState.delete(buffer.key);
        streamStateManager.clear(buffer.key);
        deps.clearPartSnapshotsForSession(buffer.sessionId);
        outputBuffer.clear(buffer.key);
      }
      return;
    }

    if (platform !== 'feishu') {
      const sender = getSenderByPlatform(platform);
      if (!sender) {
        console.error(`[outputBuffer] 无法获取平台 ${platform} 的 sender`);
        return;
      }
      const payload = buildPortableUpdatePayload(cardData, conversationId, platform);
      const qqOnlyText = platform === 'qq'
        && chatSessionStore.getSessionByConversation('qq', conversationId)?.qqOutputOnlyText === true;
      const nextMessageIds: string[] = [];
      const existingMessageId = existingMessageIds[0];
      const outboundPayload = qqOnlyText
        ? { qqText: payload.qqText, forcePlainText: true }
        : payload;

      if (existingMessageId) {
        const updated = await sender.updateCard(existingMessageId, outboundPayload);
        if (updated) {
          nextMessageIds.push(existingMessageId);
        } else {
          const replacementMessageId = await sender.sendCard(conversationId, outboundPayload);
          if (replacementMessageId) {
            void sender.deleteMessage(existingMessageId).catch(() => undefined);
            nextMessageIds.push(replacementMessageId);
          }
        }
      } else {
        const newMessageId = await sender.sendCard(conversationId, outboundPayload);
        if (newMessageId) {
          nextMessageIds.push(newMessageId);
        }
      }

      for (let index = 1; index < existingMessageIds.length; index++) {
        const redundantMessageId = existingMessageIds[index];
        if (!redundantMessageId) {
          continue;
        }
        void sender.deleteMessage(redundantMessageId).catch(() => undefined);
      }

      if (nextMessageIds.length > 0) {
        outputBuffer.setMessageId(buffer.key, nextMessageIds[0]);
        streamStateManager.setCardMessageIds(buffer.key, nextMessageIds);
      } else {
        streamStateManager.setCardMessageIds(buffer.key, []);
      }

      if (buffer.status !== 'running') {
        streamStateManager.clear(buffer.key);
        deps.clearPartSnapshotsForSession(buffer.sessionId);
        outputBuffer.clear(buffer.key);
      }
      return;
    }

    const cards = buildStreamCards(
      {
        ...cardData,
        messageId: existingMessageIds[0] || undefined,
      },
      {
        componentBudget: STREAM_CARD_COMPONENT_BUDGET,
      }
    );

    pruneFeishuRecentRenderCache();
    const renderSignature = JSON.stringify(cards);
    const cachedRender = feishuRecentRenderCache.get(buffer.key);

    if (
      existingMessageIds.length === 0 &&
      cachedRender &&
      cachedRender.messageIds.length > 0 &&
      Date.now() - cachedRender.updatedAt <= FEISHU_RENDER_DEDUPE_WINDOW_MS
    ) {
      existingMessageIds = [...cachedRender.messageIds];
      outputBuffer.setMessageId(buffer.key, existingMessageIds[0]);
      streamStateManager.setCardMessageIds(buffer.key, existingMessageIds);
    }

    if (
      cachedRender &&
      cachedRender.status === status &&
      cachedRender.signature === renderSignature &&
      cachedRender.messageIds.length > 0 &&
      Date.now() - cachedRender.updatedAt <= FEISHU_RENDER_DEDUPE_WINDOW_MS
    ) {
      outputBuffer.setMessageId(buffer.key, cachedRender.messageIds[0]);
      streamStateManager.setCardMessageIds(buffer.key, [...cachedRender.messageIds]);

      if (buffer.status !== 'running') {
        streamStateManager.clear(buffer.key);
        deps.clearPartSnapshotsForSession(buffer.sessionId);
        outputBuffer.clear(buffer.key);
      }
      return;
    }

    const nextMessageIds: string[] = [];

    const feishuAdapter = getCachedAdapter('feishu');
    if (!feishuAdapter) {
      console.error('[outputBuffer] 飞书适配器未加载');
      return;
    }
    const sender = feishuAdapter.getSender();
    for (let index = 0; index < cards.length; index++) {
      const card = cards[index];
      const existingMessageId = existingMessageIds[index];

      if (existingMessageId) {
        const updated = await sender.updateCard(existingMessageId, card);
        if (updated) {
          nextMessageIds.push(existingMessageId);
          continue;
        }
        console.warn(`[outputBuffer] 飞书卡片更新失败，保留原卡避免重复发卡: buffer=${buffer.key}, msgId=${existingMessageId}`);
        nextMessageIds.push(existingMessageId);
        continue;
      }

      const newMessageId = await sender.sendCard(conversationId, card);
      if (newMessageId) {
        nextMessageIds.push(newMessageId);
      }
    }

    for (let index = cards.length; index < existingMessageIds.length; index++) {
      const redundantMessageId = existingMessageIds[index];
      if (!redundantMessageId) {
        continue;
      }
      void sender.deleteMessage(redundantMessageId).catch(() => undefined);
    }

    if (nextMessageIds.length > 0) {
      outputBuffer.setMessageId(buffer.key, nextMessageIds[0]);
      streamStateManager.setCardMessageIds(buffer.key, nextMessageIds);
      feishuRecentRenderCache.set(buffer.key, {
        status,
        signature: renderSignature,
        messageIds: [...nextMessageIds],
        updatedAt: Date.now(),
      });
    } else {
      streamStateManager.setCardMessageIds(buffer.key, []);
    }

    cardData.messageId = nextMessageIds[0] || undefined;
    cardData.thinkingMessageId = undefined;

    deps.upsertLiveCardInteraction(
      conversationId,
      buffer.replyMessageId,
      cardData,
      nextMessageIds,
      null,
      buffer.openCodeMsgId
    );

    if (buffer.status !== 'running') {
      streamStateManager.clear(buffer.key);
      deps.clearPartSnapshotsForSession(buffer.sessionId);
      outputBuffer.clear(buffer.key);
    }
  });
}
