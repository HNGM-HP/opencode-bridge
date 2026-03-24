/**
 * 钉钉平台类型定义
 *
 * 定义钉钉适配器所需的类型、接口和常量
 */

// ──────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────

/** 钉钉 API 基础 URL */
export const DINGTALK_API = 'https://api.dingtalk.com';

/** 消息去重最大数量 */
export const DEDUP_MAX = 500;

/** 心跳间隔（毫秒） */
export const HEARTBEAT_INTERVAL = 10 * 1000;

/** 超时阈值（毫秒） */
export const TIMEOUT_THRESHOLD = 20 * 1000;

/** 重连退避基数（毫秒） */
export const BACKOFF_BASE_MS = 2_000;

/** 最大重连退避（毫秒） */
export const BACKOFF_MAX_MS = 30_000;

// ──────────────────────────────────────────────
// 钉钉账号配置
// ──────────────────────────────────────────────

/**
 * 钉钉账号行（数据库存储格式）
 */
export interface DingtalkAccountRow {
  account_id: string;
  client_id: string;
  client_secret: string;
  name: string;
  enabled: number;
  endpoint: string;
  created_at: string;
  updated_at: string;
}

/**
 * 钉钉配置（运行时使用）
 */
export interface DingtalkConfig {
  clientId: string;
  clientSecret: string;
  endpoint?: string;
  debug?: boolean;
}

// ──────────────────────────────────────────────
// 钉钉消息类型
// ──────────────────────────────────────────────

/**
 * 钉钉消息类型
 */
export type DingtalkMsgType = 'text' | 'markdown' | 'link' | 'actionCard' | 'image';

/**
 * 钉钉原始消息数据
 */
export interface DingtalkRawMessage {
  msgtype: string;
  conversationType: '1' | '2'; // 1=单聊, 2=群聊
  conversationId: string;
  conversationTitle?: string;
  senderId: string;
  senderStaffId?: string;
  senderNick?: string;
  senderCorpId?: string;
  msgId: string;
  sessionWebhook: string;
  sessionWebhookExpiredTime?: number;
  robotCode?: string;
  text?: {
    content: string;
  };
  content?: Record<string, unknown>;
  createdAt?: number;
}

/**
 * 钉钉消息事件头部
 */
export interface DingtalkMessageHeaders {
  messageId: string;
  timestamp: string;
  topic: string;
  contentType: string;
}

/**
 * 钉钉 WebSocket 回调数据
 */
export interface DingtalkCallbackData {
  headers: DingtalkMessageHeaders;
  data: string;
}

// ──────────────────────────────────────────────
// 消息发送类型
// ──────────────────────────────────────────────

/**
 * 消息发送结果
 */
export interface DingtalkSendResult {
  ok: boolean;
  processQueryKey?: string;
  cardInstanceId?: string;
  error?: string;
  usedAICard?: boolean;
}

/**
 * AI Card 目标
 */
export interface DingtalkAICardTarget {
  type: 'user' | 'group';
  userId?: string;
  openConversationId?: string;
}

/**
 * AI Card 实例
 */
export interface DingtalkAICardInstance {
  cardInstanceId: string;
  conversationId: string;
  target: DingtalkAICardTarget;
}

// ──────────────────────────────────────────────
// 会话 Webhook 缓存
// ──────────────────────────────────────────────

/**
 * SessionWebhook 缓存条目
 */
export interface SessionWebhookCache {
  webhook: string;
  expiredTime: number;
}