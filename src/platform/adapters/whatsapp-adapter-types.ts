/**
 * WhatsApp 适配器类型定义与常量
 *
 * 从 whatsapp-adapter.ts 提取。
 */

import path from 'node:path';

// ── 模块级常量 ────────────────────────────────

export const WHATSAPP_MESSAGE_LIMIT = 4096;

export const STATUS_FILE_PATH = path.join(process.cwd(), 'data', 'whatsapp-status.json');

// ── 动态导入类型 ──────────────────────────────

export type BaileysModule = typeof import('@whiskeysockets/baileys');
export type QRCodeModule = typeof import('qrcode');

// ── 连接状态 ──────────────────────────────────

export type WhatsAppConnectionStatus = 'connected' | 'need_scan' | 'disconnected' | 'connecting';

export interface WhatsAppStatusInfo {
  enabled: boolean;
  mode: string;
  status: WhatsAppConnectionStatus;
  qrCode?: string;
  qrRetry?: number;
}
