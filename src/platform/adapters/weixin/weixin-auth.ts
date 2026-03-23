/**
 * WeChat QR 码登录流程
 *
 * 管理 QR 码生成、状态轮询和凭证持久化
 * 活跃登录会话存储在 globalThis 中以支持 HMR
 */

import QRCode from 'qrcode';
import { startLoginQr, pollLoginQrStatus } from './weixin-api.js';
import { configStore } from '../../../store/config-store.js';
import type { QrCodeStatusResponse } from './weixin-types.js';
import { DEFAULT_BASE_URL, DEFAULT_CDN_BASE_URL } from './weixin-types.js';

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

export interface QrLoginSession {
  qrcode: string;
  qrImage: string; // base64
  startedAt: number;
  refreshCount: number;
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'failed';
  accountId?: string;
  error?: string;
  pollPromise?: Promise<void>; // 当前正在进行的轮询
  confirmed?: boolean; // 是否已确认（防止重复处理）
}

// ──────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────

const MAX_REFRESHES = 3;
const QR_TTL_MS = 5 * 60_000;
const GLOBAL_KEY = '__weixin_login_sessions__';

// ──────────────────────────────────────────────
// 会话存储
// ──────────────────────────────────────────────

function getLoginSessions(): Map<string, QrLoginSession> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, QrLoginSession>();
  }
  return g[GLOBAL_KEY] as Map<string, QrLoginSession>;
}

// ──────────────────────────────────────────────
// 公开 API
// ──────────────────────────────────────────────

/**
 * 启动新的 QR 登录会话
 * 返回可用于轮询状态的会话 ID
 */
export async function startQrLoginSession(): Promise<{ sessionId: string; qrImage: string }> {
  const resp = await startLoginQr();

  if (!resp.qrcode || !resp.qrcode_img_content) {
    throw new Error('Failed to get QR code from WeChat server');
  }

  // qrcode_img_content 是 URL，生成 data URL 供前端使用
  const qrDataUrl = await QRCode.toDataURL(resp.qrcode_img_content, { width: 256, margin: 2 });

  const sessionId = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: QrLoginSession = {
    qrcode: resp.qrcode,
    qrImage: qrDataUrl,
    startedAt: Date.now(),
    refreshCount: 0,
    status: 'waiting',
  };

  getLoginSessions().set(sessionId, session);

  // 10 分钟后自动清理
  setTimeout(() => {
    getLoginSessions().delete(sessionId);
  }, 10 * 60_000);

  return { sessionId, qrImage: qrDataUrl };
}

/**
 * 轮询 QR 登录状态
 *
 * 使用后台轮询策略，避免前端高频调用导致请求堆积
 */
export async function pollQrLoginStatus(sessionId: string): Promise<QrLoginSession> {
  const sessions = getLoginSessions();
  const session = sessions.get(sessionId);
  if (!session) {
    return {
      qrcode: '',
      qrImage: '',
      startedAt: 0,
      refreshCount: 0,
      status: 'failed',
      error: 'Session not found',
    };
  }

  // 已确认或失败，直接返回
  if (session.status === 'confirmed' || session.status === 'failed') {
    return session;
  }

  // 防止重复处理确认状态
  if (session.confirmed) {
    return session;
  }

  // 检查 QR 是否过期（5 分钟）
  if (Date.now() - session.startedAt > QR_TTL_MS) {
    if (session.refreshCount >= MAX_REFRESHES) {
      session.status = 'failed';
      session.error = 'QR code expired after maximum refreshes';
      return session;
    }

    // 刷新 QR 码
    try {
      const resp = await startLoginQr();
      if (resp.qrcode && resp.qrcode_img_content) {
        session.qrcode = resp.qrcode;
        session.qrImage = await QRCode.toDataURL(resp.qrcode_img_content, { width: 256, margin: 2 });
        session.startedAt = Date.now();
        session.refreshCount++;
        session.status = 'waiting';
      }
    } catch (err) {
      session.status = 'failed';
      session.error = `QR refresh failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    return session;
  }

  // 如果已有轮询在进行，等待其完成
  if (session.pollPromise) {
    await session.pollPromise;
    return session;
  }

  // 启动新的轮询（后台执行）
  session.pollPromise = doPoll(sessionId, session);
  await session.pollPromise;
  session.pollPromise = undefined;

  return session;
}

/**
 * 执行单次轮询
 */
async function doPoll(sessionId: string, session: QrLoginSession): Promise<void> {
  try {
    const resp: QrCodeStatusResponse = await pollLoginQrStatus(session.qrcode);

    switch (resp.status) {
      case 'wait':
        session.status = 'waiting';
        break;

      case 'scaned':
        session.status = 'scanned';
        break;

      case 'confirmed': {
        // 防止重复处理
        if (session.confirmed) {
          return;
        }
        session.confirmed = true;
        session.status = 'confirmed';

        if (resp.bot_token && resp.ilink_bot_id) {
          // 规范化账号 ID（替换不安全字符）
          const accountId = (resp.ilink_bot_id || '').replace(/[@.]/g, '-');
          session.accountId = accountId;

          const botToken = resp.bot_token; // 保存到变量以帮助 TypeScript 收窄类型

          // 异步持久化到数据库，避免阻塞
          setImmediate(() => {
            try {
              configStore.upsertWeixinAccount({
                accountId,
                userId: resp.ilink_user_id || '',
                baseUrl: resp.baseurl || DEFAULT_BASE_URL,
                cdnBaseUrl: DEFAULT_CDN_BASE_URL,
                token: botToken,
                name: accountId,
                enabled: true,
              });
              console.log(`[weixin-auth] Login successful, account ${accountId} saved`);
            } catch (err) {
              console.error('[weixin-auth] Failed to save account:', err);
            }
          });
        }
        break;
      }

      case 'expired':
        session.status = 'expired';
        // 下次轮询时刷新
        session.startedAt = 0;
        break;

      default:
        // 未知状态，继续等待
        break;
    }
  } catch (err) {
    // 轮询超时是正常的，不改变状态
    if (err instanceof Error && err.name === 'TimeoutError') {
      return;
    }
    console.error('[weixin-auth] Poll error:', err);
  }
}

/**
 * 取消并清理登录会话
 */
export function cancelQrLoginSession(sessionId: string): void {
  getLoginSessions().delete(sessionId);
}

/**
 * 获取登录会话
 */
export function getQrLoginSession(sessionId: string): QrLoginSession | undefined {
  return getLoginSessions().get(sessionId);
}