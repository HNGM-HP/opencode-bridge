/**
 * QQ 处理器类型定义与常量
 *
 * 从 qq.ts 提取。
 */

import path from 'node:path';

// ── 模块级常量 ────────────────────────────────

export const ATTACHMENT_BASE_DIR = path.resolve(process.cwd(), 'tmp', 'qq-uploads');

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf',
  '.pjp', '.pjpeg', '.jfif', '.jpe',
  '.mp4', '.mp3', '.wav', '.ogg', '.m4a'
]);

export const QQ_CARD_SOFT_LIMIT = 2800;

// ── 类型定义 ──────────────────────────────────

export type OpencodeFilePartInput = { type: 'file'; mime: string; url: string; filename?: string };
export type OpencodePartInput = { type: 'text'; text: string } | OpencodeFilePartInput;

export type PermissionDecision = {
  allow: boolean;
  remember: boolean;
};

export type QQSessionInfo = Awaited<ReturnType<typeof import('../opencode/client.js').opencodeClient.listSessions>>[number];
