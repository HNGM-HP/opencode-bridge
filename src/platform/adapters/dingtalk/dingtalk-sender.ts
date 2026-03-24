/**
 * 钉钉消息发送器
 *
 * 实现消息发送功能：
 * - 使用 sessionWebhook 回复消息（无需 access_token）
 * - 支持文本、Markdown 消息
 * - 支持 AI Card 流式响应
 */

import type { DingtalkConfig, DingtalkSendResult, DingtalkAICardInstance, DingtalkAICardTarget } from './dingtalk-types.js';
import { DINGTALK_API } from './dingtalk-types.js';
import { configStore } from '../../../store/config-store.js';
import { encodeDingtalkChatId, decodeDingtalkChatId, isDingtalkGroupChat } from './dingtalk-ids.js';
import { createAICard, streamAICard, finishAICard, errorAICard } from './dingtalk-card.js';

// ──────────────────────────────────────────────
// HTTP 客户端
// ──────────────────────────────────────────────

import axios from 'axios';

const httpClient = axios.create({
  timeout: 30_000,
});

// ──────────────────────────────────────────────
// Access Token 缓存
// ──────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiredAt: number }>();

async function getAccessToken(config: DingtalkConfig): Promise<string> {
  const cacheKey = config.clientId;
  const cached = tokenCache.get(cacheKey);

  // 提前 5 分钟刷新
  if (cached && cached.expiredAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  // 获取新 token
  const resp = await httpClient.get(
    `${DINGTALK_API}/v1.0/oauth2/accessToken`,
    {
      params: {
        appKey: config.clientId,
        appSecret: config.clientSecret,
      },
    }
  );

  if (!resp.data?.accessToken) {
    throw new Error('获取 access_token 失败');
  }

  tokenCache.set(cacheKey, {
    token: resp.data.accessToken,
    expiredAt: resp.data.expireIn * 1000 + Date.now(),
  });

  return resp.data.accessToken;
}

// ──────────────────────────────────────────────
// 消息发送
// ──────────────────────────────────────────────

/**
 * 使用 sessionWebhook 发送消息（回复消息）
 */
async function sendViaSessionWebhook(
  sessionWebhook: string,
  msgType: 'text' | 'markdown',
  content: string,
  title?: string,
): Promise<DingtalkSendResult> {
  try {
    const body: Record<string, unknown> = {
      msgtype: msgType,
    };

    if (msgType === 'markdown') {
      body.markdown = {
        title: title || content.split('\n')[0].replace(/^[#*\s\->]+/, '').slice(0, 20) || '消息',
        text: content,
      };
    } else {
      body.text = { content };
    }

    const resp = await httpClient.post(sessionWebhook, body, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return {
      ok: true,
      processQueryKey: resp.data?.processQueryKey,
    };
  } catch (error: any) {
    console.error('[钉钉] 通过 sessionWebhook 发送失败:', error.message);
    return {
      ok: false,
      error: error.message,
    };
  }
}

/**
 * 主动发送单聊消息
 */
async function sendToUser(
  config: DingtalkConfig,
  userId: string,
  content: string,
  msgType: 'text' | 'markdown' = 'text',
): Promise<DingtalkSendResult> {
  try {
    const token = await getAccessToken(config);

    const payload = msgType === 'markdown'
      ? {
          msgKey: 'sampleMarkdown',
          msgParam: JSON.stringify({
            title: content.split('\n')[0].replace(/^[#*\s\->]+/, '').slice(0, 20) || '消息',
            text: content,
          }),
        }
      : {
          msgKey: 'sampleText',
          msgParam: JSON.stringify({ content }),
        };

    const body = {
      robotCode: config.clientId,
      userIds: [userId],
      ...payload,
    };

    const resp = await httpClient.post(
      `${DINGTALK_API}/v1.0/robot/oToMessages/batchSend`,
      body,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      ok: true,
      processQueryKey: resp.data?.processQueryKey,
    };
  } catch (error: any) {
    console.error('[钉钉] 发送单聊消息失败:', error.message);
    return {
      ok: false,
      error: error.message,
    };
  }
}

/**
 * 主动发送群聊消息
 */
async function sendToGroup(
  config: DingtalkConfig,
  openConversationId: string,
  content: string,
  msgType: 'text' | 'markdown' = 'text',
): Promise<DingtalkSendResult> {
  try {
    const token = await getAccessToken(config);

    const payload = msgType === 'markdown'
      ? {
          msgKey: 'sampleMarkdown',
          msgParam: JSON.stringify({
            title: content.split('\n')[0].replace(/^[#*\s\->]+/, '').slice(0, 20) || '消息',
            text: content,
          }),
        }
      : {
          msgKey: 'sampleText',
          msgParam: JSON.stringify({ content }),
        };

    const body = {
      robotCode: config.clientId,
      openConversationId,
      ...payload,
    };

    const resp = await httpClient.post(
      `${DINGTALK_API}/v1.0/robot/groupMessages/send`,
      body,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      ok: true,
      processQueryKey: resp.data?.processQueryKey,
    };
  } catch (error: any) {
    console.error('[钉钉] 发送群聊消息失败:', error.message);
    return {
      ok: false,
      error: error.message,
    };
  }
}

// ──────────────────────────────────────────────
// DingtalkSender 类
// ──────────────────────────────────────────────

export class DingtalkSender {
  private readonly sessionWebhooks = new Map<string, string>();
  private readonly aiCards = new Map<string, DingtalkAICardInstance>();

  /**
   * 缓存 sessionWebhook
   */
  cacheSessionWebhook(conversationId: string, webhook: string): void {
    this.sessionWebhooks.set(conversationId, webhook);
  }

  /**
   * 发送文本消息
   */
  async sendText(conversationId: string, text: string): Promise<string | null> {
    const decoded = decodeDingtalkChatId(conversationId);
    if (!decoded) {
      console.warn('[钉钉] 无效的 chatId 格式');
      return null;
    }

    const { accountId, conversationId: rawConversationId } = decoded;
    const account = configStore.getDingtalkAccount(accountId);
    if (!account) {
      console.warn(`[钉钉] 找不到账号 ${accountId}`);
      return null;
    }

    const config: DingtalkConfig = {
      clientId: account.client_id,
      clientSecret: account.client_secret,
      endpoint: account.endpoint,
    };

    // 处理文本格式（去除 Markdown）
    let content = text;
    content = content.replace(/<[^>]+>/g, ''); // HTML
    content = content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/`{3}\w*\n?/g, '').replace(/`{3}/g, ''))
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 尝试使用缓存的 sessionWebhook
    const sessionWebhook = this.sessionWebhooks.get(rawConversationId);

    let result: DingtalkSendResult;

    if (sessionWebhook) {
      // 使用 sessionWebhook 发送
      result = await sendViaSessionWebhook(sessionWebhook, 'text', content);
    } else {
      // 主动发送
      const isGroup = isDingtalkGroupChat(rawConversationId);
      if (isGroup) {
        result = await sendToGroup(config, rawConversationId, content);
      } else {
        result = await sendToUser(config, rawConversationId, content);
      }
    }

    return result.ok ? result.processQueryKey || 'sent' : null;
  }

  /**
   * 发送卡片消息（支持 AI Card 流式响应）
   */
  async sendCard(conversationId: string, card: object): Promise<string | null> {
    const payload = card as { text?: string; markdown?: string };
    const content = payload.markdown || payload.text || JSON.stringify(card, null, 2);

    const decoded = decodeDingtalkChatId(conversationId);
    if (!decoded) {
      console.warn('[钉钉] 无效的 chatId 格式');
      return null;
    }

    const { accountId, conversationId: rawConversationId } = decoded;
    const account = configStore.getDingtalkAccount(accountId);
    if (!account) {
      console.warn(`[钉钉] 找不到账号 ${accountId}`);
      return null;
    }

    const config: DingtalkConfig = {
      clientId: account.client_id,
      clientSecret: account.client_secret,
      endpoint: account.endpoint,
    };

    // 检查是否已有 AI Card 实例
    const existingCard = this.aiCards.get(conversationId);
    if (existingCard) {
      // 流式更新现有卡片
      const success = await streamAICard(config, existingCard, content);
      return success ? existingCard.cardInstanceId : null;
    }

    // 尝试使用 sessionWebhook 发送 Markdown
    const sessionWebhook = this.sessionWebhooks.get(rawConversationId);

    if (sessionWebhook) {
      const result = await sendViaSessionWebhook(sessionWebhook, 'markdown', content);
      return result.ok ? result.processQueryKey || 'sent' : null;
    }

    // 主动发送 Markdown 消息
    const isGroup = isDingtalkGroupChat(rawConversationId);
    if (isGroup) {
      const result = await sendToGroup(config, rawConversationId, content, 'markdown');
      return result.ok ? result.processQueryKey || 'sent' : null;
    } else {
      const result = await sendToUser(config, rawConversationId, content, 'markdown');
      return result.ok ? result.processQueryKey || 'sent' : null;
    }
  }

  /**
   * 更新卡片消息
   */
  async updateCard(messageId: string, card: object): Promise<boolean> {
    const payload = card as { text?: string; markdown?: string; status?: string };
    const content = payload.markdown || payload.text || '';

    // 查找对应的 AI Card 实例
    for (const [conversationId, aiCard] of this.aiCards) {
      if (aiCard.cardInstanceId === messageId) {
        const decoded = decodeDingtalkChatId(conversationId);
        if (!decoded) continue;

        const account = configStore.getDingtalkAccount(decoded.accountId);
        if (!account) continue;

        const config: DingtalkConfig = {
          clientId: account.client_id,
          clientSecret: account.client_secret,
          endpoint: account.endpoint,
        };

        // 根据状态决定操作
        const isFinished = payload.status === 'completed' || payload.status === 'failed';

        if (isFinished) {
          if (payload.status === 'failed') {
            return await errorAICard(config, aiCard, content);
          } else {
            return await finishAICard(config, aiCard, content);
          }
        } else {
          return await streamAICard(config, aiCard, content);
        }
      }
    }

    // 未找到 AI Card，无法更新
    return false;
  }

  /**
   * 删除消息（钉钉不支持）
   */
  async deleteMessage(_messageId: string): Promise<boolean> {
    return false;
  }

  /**
   * 创建 AI Card（用于流式响应）
   */
  async createAICardForConversation(
    conversationId: string,
    target: DingtalkAICardTarget,
  ): Promise<DingtalkAICardInstance | null> {
    const decoded = decodeDingtalkChatId(conversationId);
    if (!decoded) {
      console.warn('[钉钉] 无效的 chatId 格式');
      return null;
    }

    const account = configStore.getDingtalkAccount(decoded.accountId);
    if (!account) {
      console.warn(`[钉钉] 找不到账号 ${decoded.accountId}`);
      return null;
    }

    const config: DingtalkConfig = {
      clientId: account.client_id,
      clientSecret: account.client_secret,
      endpoint: account.endpoint,
    };

    const card = await createAICard(config, target, conversationId);
    if (card) {
      this.aiCards.set(conversationId, card);
    }

    return card;
  }

  /**
   * 清理 AI Card 实例
   */
  clearAICard(conversationId: string): void {
    this.aiCards.delete(conversationId);
  }
}