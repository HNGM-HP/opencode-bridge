/**
 * Telegram 处理器类型定义与常量
 *
 * 从 telegram.ts 提取。
 */

import path from 'node:path';

// ── 模块级常量 ────────────────────────────────

export const ATTACHMENT_BASE_DIR = path.resolve(process.cwd(), 'tmp', 'telegram-uploads');

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf',
  '.mp4', '.mov', '.mp3', '.ogg', '.wav', '.m4a',
]);

// ── 类型定义 ──────────────────────────────────

export type ParsedQuestionAnswer = { type: 'skip' | 'custom' | 'selection'; values?: string[]; custom?: string };

export type OpencodeFilePartInput = { type: 'file'; mime: string; url: string; filename?: string };
export type OpencodePartInput = { type: 'text'; text: string } | OpencodeFilePartInput;

export type PermissionDecision = {
  allow: boolean;
  remember: boolean;
};
