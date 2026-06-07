/**
 * WhatsApp 适配器工具函数
 *
 * 从 whatsapp-adapter.ts 提取的模块级纯函数。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BaileysModule, QRCodeModule, WhatsAppStatusInfo } from './whatsapp-adapter-types.js';
import { STATUS_FILE_PATH } from './whatsapp-adapter-types.js';

// ── 动态导入缓存：baileys ──────────────────────

let _baileysModule: BaileysModule | null = null;
export async function getBaileysModule(): Promise<BaileysModule> {
  if (!_baileysModule) {
    _baileysModule = await import('@whiskeysockets/baileys');
  }
  return _baileysModule;
}

// ── 动态导入缓存：QRCode ───────────────────────

let _qrcodeModule: QRCodeModule | null = null;
export async function getQRCodeModule(): Promise<QRCodeModule> {
  if (!_qrcodeModule) {
    _qrcodeModule = await import('qrcode');
  }
  return _qrcodeModule;
}

// ── 状态文件读写 ──────────────────────────────

export function writeStatusFile(status: WhatsAppStatusInfo): void {
  try {
    const dir = path.dirname(STATUS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 2), 'utf-8');
  } catch (err) {
    console.error('[WhatsApp] 写入状态文件失败:', err);
  }
}

export function readStatusFile(): WhatsAppStatusInfo | null {
  try {
    if (!fs.existsSync(STATUS_FILE_PATH)) {
      return null;
    }
    const content = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
    return JSON.parse(content) as WhatsAppStatusInfo;
  } catch (err) {
    console.error('[WhatsApp] 读取状态文件失败:', err);
    return null;
  }
}
