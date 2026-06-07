/**
 * 群聊处理器类型定义与常量
 *
 * 从 group.ts 提取。
 */

import path from 'path';

export const ATTACHMENT_BASE_DIR = path.resolve(process.cwd(), 'tmp', 'feishu-uploads');
export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf',
  '.pjp', '.pjpeg', '.jfif', '.jpe'
]);

export type OpencodeFilePartInput = { type: 'file'; mime: string; url: string; filename?: string };

export type OpencodePartInput = { type: 'text'; text: string } | OpencodeFilePartInput;

export type QuestionSkipActionResult = 'applied' | 'not_found' | 'stale_card' | 'invalid_state';
