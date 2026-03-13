import type { Part } from '@opencode-ai/sdk';
import { reliabilityConfig } from '../config.js';
import type { PlatformSender } from '../platform/types.js';
import { chatSessionStore } from '../store/chat-session.js';
import type { RuntimeCronJob } from './runtime-cron.js';

export interface RuntimeCronDispatcherDependencies {
  getSessionById: (sessionId: string, options?: { directory?: string }) => Promise<unknown | null>;
  sendMessage: (
    sessionId: string,
    text: string,
    options?: {
      agent?: string;
      directory?: string;
      providerId?: string;
      modelId?: string;
      variant?: string;
    }
  ) => Promise<{ parts: Part[] }>;
  sendMessageAsync: (
    sessionId: string,
    text: string,
    options?: {
      agent?: string;
      directory?: string;
      providerId?: string;
      modelId?: string;
      variant?: string;
    }
  ) => Promise<boolean>;
  getSender: (platform: 'feishu' | 'discord') => PlatformSender | null;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export function createRuntimeCronDispatcher(dependencies: RuntimeCronDispatcherDependencies): {
  dispatch: (job: RuntimeCronJob) => Promise<void>;
} {
  const logger = dependencies.logger ?? console;

  return {
    dispatch: async (job: RuntimeCronJob) => {
      if (job.payload.kind !== 'systemEvent') {
        return;
      }

      const delivery = job.payload.delivery;
      if (!delivery) {
        throw new Error(`job ${job.id} is missing delivery binding`);
      }

      const boundSessionId = job.payload.sessionId?.trim();
      const inferredSessionId = chatSessionStore.getSessionByConversation(delivery.platform, delivery.conversationId)?.sessionId?.trim();
      const sessionId = boundSessionId || inferredSessionId || '';
      if (!sessionId) {
        throw new Error(`job ${job.id} is missing bound sessionId`);
      }
      if (!boundSessionId && inferredSessionId) {
        logger.warn(
          `[RuntimeCron] job ${job.id} is missing sessionId in payload; inferred ${inferredSessionId} from ${delivery.platform}:${delivery.conversationId}`
        );
      }

      const session = await dependencies.getSessionById(
        sessionId,
        job.payload.directory ? { directory: job.payload.directory } : undefined
      ).catch(() => null);
      if (!session) {
        throw new Error(`job ${job.id} bound session not found: ${sessionId}`);
      }

      const currentBinding = chatSessionStore.getSessionByConversation(delivery.platform, delivery.conversationId);
      const boundConversation = chatSessionStore.getConversationBySessionId(sessionId);
      const canStreamToOrigin = currentBinding?.sessionId === sessionId
        && boundConversation?.platform === delivery.platform
        && boundConversation.conversationId === delivery.conversationId;

      const messageOptions = {
        ...(job.payload.agent ? { agent: job.payload.agent } : {}),
        ...(job.payload.directory ? { directory: job.payload.directory } : {}),
      };

      if (canStreamToOrigin) {
        const queued = await dependencies.sendMessageAsync(sessionId, job.payload.text, messageOptions);
        if (!queued) {
          throw new Error(`job ${job.id} failed to enqueue prompt to bound session`);
        }
        return;
      }

      if (boundConversation) {
        throw new Error(
          `job ${job.id} bound session ${sessionId} is currently attached to ${boundConversation.platform}:${boundConversation.conversationId}`
        );
      }

      const fallbackConversationId = resolveFallbackConversationId(job);
      if (!fallbackConversationId) {
        throw new Error(`job ${job.id} target conversation missing and no fallback conversation configured`);
      }

      const sender = dependencies.getSender(delivery.platform);
      if (!sender) {
        throw new Error(`job ${job.id} sender unavailable for platform: ${delivery.platform}`);
      }

      const response = await dependencies.sendMessage(sessionId, job.payload.text, messageOptions);
      const text = extractAssistantText(response.parts);
      const forwardedText = [
        `⏰ Cron 转发：${job.name}`,
        `原目标 ${delivery.platform}:${delivery.conversationId} 已失效，已转发到当前会话。`,
        text || '模型已执行，但未返回可展示文本。',
      ].join('\n\n');
      const messageId = await sender.sendText(fallbackConversationId, forwardedText);
      if (!messageId) {
        throw new Error(`job ${job.id} fallback delivery failed for ${delivery.platform}:${fallbackConversationId}`);
      }
      logger.warn(
        `[RuntimeCron] forwarded job ${job.id} to fallback conversation ${delivery.platform}:${fallbackConversationId}`
      );
    },
  };
}

function resolveFallbackConversationId(job: RuntimeCronJob): string | undefined {
  if (!reliabilityConfig.cronForwardToPrivateChat) {
    return undefined;
  }

  const delivery = job.payload.delivery;
  if (!delivery) {
    return undefined;
  }

  if (delivery.fallbackConversationId) {
    return delivery.fallbackConversationId;
  }

  if (delivery.platform === 'feishu' && reliabilityConfig.cronFallbackFeishuChatId) {
    return reliabilityConfig.cronFallbackFeishuChatId;
  }

  if (delivery.platform === 'discord' && reliabilityConfig.cronFallbackDiscordConversationId) {
    return reliabilityConfig.cronFallbackDiscordConversationId;
  }

  if (!delivery.creatorId) {
    return undefined;
  }

  const privateBinding = chatSessionStore.findPrivateConversationByCreator(delivery.creatorId, delivery.platform);
  return privateBinding?.platform === delivery.platform ? privateBinding.conversationId : undefined;
}

function extractAssistantText(parts: Part[]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) {
      chunks.push(record.text.trim());
    }
  }
  return chunks.join('\n\n').trim();
}
