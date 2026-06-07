/**
 * QQ 适配器类型定义与常量
 *
 * 从 qq-adapter.ts 提取，包含模块级常量、OpCode/Intents 枚举和接口。
 */

// ── 模块级常量 ────────────────────────────────

export const QQ_MESSAGE_LIMIT = 3000;
export const QQ_API_BASE = 'https://api.sgroup.qq.com';
export const QQ_OAUTH_BASE = 'https://bots.qq.com/app/getAppAccessToken';
export const QQ_GATEWAY_URL = 'https://api.sgroup.qq.com/gateway/bot';

// ── WebSocket OpCode ──────────────────────────

export const OpCode = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

// ── Intent 位掩码 ─────────────────────────────

export const Intents = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  DIRECT_MESSAGE: 1 << 12,
  GROUP_AND_C2C: 1 << 25,
  AUDIO_ACTION: 1 << 29,
  AT_MESSAGES: 1 << 30,
};

export const FULL_INTENTS = Intents.AT_MESSAGES | Intents.DIRECT_MESSAGE | Intents.GROUP_AND_C2C;

// ── 平台类型 ──────────────────────────────────

export type QQProtocol = 'official' | 'onebot';

export type OneBotEvent = {
  post_type: string;
  message_type?: string;
  message_id?: number;
  user_id?: number;
  group_id?: number;
  message?: string | OneBotMessageSegment[];
  raw_message?: string;
  self_id?: number;
};

export type OneBotMessageSegment = {
  type: string;
  data: Record<string, unknown>;
};

export type OneBotAttachmentData = {
  file?: string;
  url?: string;
  filename?: string;
  size?: number;
  file_size?: number;
};

export type QQCardPayload = {
  qqText?: string;
  content?: string;
  text?: string;
  markdown?: string;
  forcePlainText?: boolean;
};

// ── WebSocket 消息类型 ────────────────────────

export type QQWSMessage = {
  op: number;
  s?: number;
  t?: string;
  d?: unknown;
};

export type QQGatewayResponse = {
  url: string;
  shards?: number;
  session_start_limit?: {
    total: number;
    remaining: number;
    reset_after: number;
  };
};

export type QQDispatchData = {
  id?: string;
  session_id?: string;
  content?: string;
  timestamp?: string;
  author?: {
    id?: string;
    user_openid?: string;
    member_openid?: string;
  };
  group_id?: string;
  channel_id?: string;
  guild_id?: string;
  attachments?: Array<{
    content_type?: string;
    filename?: string;
    url?: string;
    size?: number;
  }>;
};
