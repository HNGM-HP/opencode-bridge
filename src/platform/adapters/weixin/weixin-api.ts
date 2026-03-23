/**
 * WeChat HTTP 协议客户端
 *
 * 纯协议层，无业务逻辑或状态管理
 */

import crypto from 'crypto';
import type {
  WeixinCredentials,
  GetUpdatesResponse,
  GetUploadUrlResponse,
  GetConfigResponse,
  MessageItem,
  QrCodeStartResponse,
  QrCodeStatusResponse,
} from './weixin-types.js';
import {
  DEFAULT_BASE_URL,
  MessageType,
  MessageState,
  MessageItemType,
} from './weixin-types.js';

// ──────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────

const CHANNEL_VERSION = 'feishu-opencode-bridge/1.0';
const LONG_POLL_TIMEOUT_MS = 35_000;
const API_TIMEOUT_MS = 15_000;
const CONFIG_TIMEOUT_MS = 10_000;
const QR_LOGIN_BASE_URL = 'https://ilinkai.weixin.qq.com';
// QR 状态轮询使用较短超时，避免长时间阻塞
const QR_STATUS_POLL_TIMEOUT_MS = 8_000;

// ──────────────────────────────────────────────
// 请求头构建
// ──────────────────────────────────────────────

/**
 * 生成 X-WECHAT-UIN 头：随机 uint32 编码为 base64
 */
function generateWechatUin(): string {
  const buf = crypto.randomBytes(4);
  return buf.toString('base64');
}

/**
 * 构建认证请求头
 */
function buildHeaders(creds: WeixinCredentials, routeTag?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'Authorization': `Bearer ${creds.botToken}`,
    'X-WECHAT-UIN': generateWechatUin(),
  };
  if (routeTag) {
    headers['SKRouteTag'] = routeTag;
  }
  return headers;
}

// ──────────────────────────────────────────────
// 核心 HTTP 请求
// ──────────────────────────────────────────────

async function weixinRequest<T>(
  creds: WeixinCredentials,
  endpoint: string,
  body: unknown,
  timeoutMs: number = API_TIMEOUT_MS,
  routeTag?: string,
): Promise<T> {
  const baseUrl = creds.baseUrl || DEFAULT_BASE_URL;
  const url = `${baseUrl}/ilink/bot/${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(creds, routeTag),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`WeChat API error: ${res.status} ${res.statusText}`);
  }

  const rawText = await res.text();
  if (!rawText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch (err) {
    throw new Error(
      `WeChat API returned non-JSON body for ${endpoint}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ──────────────────────────────────────────────
// 消息 API
// ──────────────────────────────────────────────

/**
 * 长轮询获取消息更新
 */
export async function getUpdates(
  creds: WeixinCredentials,
  getUpdatesBuf: string,
  timeoutMs: number = LONG_POLL_TIMEOUT_MS,
): Promise<GetUpdatesResponse> {
  try {
    return await weixinRequest<GetUpdatesResponse>(
      creds,
      'getupdates',
      {
        get_updates_buf: getUpdatesBuf ?? '',
        base_info: { channel_version: CHANNEL_VERSION },
      },
      timeoutMs + 5_000, // 客户端超时略长于服务端
    );
  } catch (err) {
    // 长轮询超时是正常的，返回空响应
    if (err instanceof Error && err.name === 'TimeoutError') {
      return { msgs: [], get_updates_buf: getUpdatesBuf };
    }
    throw err;
  }
}

/**
 * 生成唯一客户端 ID
 */
function generateClientId(): string {
  return `bridge-wx-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 发送消息
 */
export async function sendMessage(
  creds: WeixinCredentials,
  toUserId: string,
  items: MessageItem[],
  contextToken: string,
): Promise<{ clientId: string }> {
  const clientId = generateClientId();
  await weixinRequest<Record<string, unknown>>(creds, 'sendmessage', {
    msg: {
      from_user_id: '',
      to_user_id: toUserId,
      client_id: clientId,
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      item_list: items.length > 0 ? items : undefined,
      context_token: contextToken || undefined,
    },
    base_info: { channel_version: CHANNEL_VERSION },
  });
  return { clientId };
}

/**
 * 发送文本消息（便捷封装）
 */
export async function sendTextMessage(
  creds: WeixinCredentials,
  toUserId: string,
  text: string,
  contextToken: string,
): Promise<{ clientId: string }> {
  return sendMessage(creds, toUserId, [
    { type: MessageItemType.TEXT, text_item: { text } },
  ], contextToken);
}

// ──────────────────────────────────────────────
// 配置与状态 API
// ──────────────────────────────────────────────

/**
 * 获取账号配置（typing_ticket 等）
 */
export async function getConfig(
  creds: WeixinCredentials,
  ilinkUserId?: string,
  contextToken?: string,
): Promise<GetConfigResponse> {
  return weixinRequest<GetConfigResponse>(
    creds,
    'getconfig',
    {
      ilink_user_id: ilinkUserId,
      context_token: contextToken,
      base_info: { channel_version: CHANNEL_VERSION },
    },
    CONFIG_TIMEOUT_MS,
  );
}

/**
 * 发送输入状态指示
 */
export async function sendTyping(
  creds: WeixinCredentials,
  ilinkUserId: string,
  typingTicket: string,
  typingStatus: number,
): Promise<void> {
  try {
    await weixinRequest<Record<string, unknown>>(
      creds,
      'sendtyping',
      {
        ilink_user_id: ilinkUserId,
        typing_ticket: typingTicket,
        status: typingStatus,
        base_info: { channel_version: CHANNEL_VERSION },
      },
      CONFIG_TIMEOUT_MS,
    );
  } catch {
    // 输入状态是尽力而为的，不应阻塞主流程
  }
}

// ──────────────────────────────────────────────
// CDN 上传 API
// ──────────────────────────────────────────────

/**
 * 获取 CDN 上传 URL
 */
export async function getUploadUrl(
  creds: WeixinCredentials,
  fileKey: string,
  fileType: number,
  fileSize: number,
  fileMd5: string,
  cipherFileSize: number,
): Promise<GetUploadUrlResponse> {
  return weixinRequest<GetUploadUrlResponse>(creds, 'getuploadurl', {
    file_key: fileKey,
    file_type: fileType,
    file_size: fileSize,
    file_md5: fileMd5,
    cipher_file_size: cipherFileSize,
  });
}

// ──────────────────────────────────────────────
// QR 登录 API
// ──────────────────────────────────────────────

/**
 * 启动 QR 码登录
 */
export async function startLoginQr(): Promise<QrCodeStartResponse> {
  const url = `${QR_LOGIN_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`QR login start failed: ${res.status}`);
  }
  return (await res.json()) as QrCodeStartResponse;
}

/**
 * 轮询 QR 码登录状态
 *
 * 注意：微信服务器可能长时间不响应，使用较短超时避免阻塞
 */
export async function pollLoginQrStatus(qrcode: string): Promise<QrCodeStatusResponse> {
  const url = `${QR_LOGIN_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(QR_STATUS_POLL_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`QR status poll failed: ${res.status}`);
  }
  return (await res.json()) as QrCodeStatusResponse;
}