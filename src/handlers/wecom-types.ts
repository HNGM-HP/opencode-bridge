/**
 * 企业微信处理器类型定义与常量
 *
 * 从 wecom.ts 提取。
 */

import path from 'node:path';

export const ATTACHMENT_BASE_DIR = path.resolve(process.cwd(), 'tmp', 'wecom-uploads');

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf',
  '.mp4', '.mp3', '.wav', '.ogg', '.m4a',
]);

export const WECOM_MESSAGE_LIMIT = 1800;

export type OpencodeFilePartInput = { type: 'file'; mime: string; url: string; filename?: string };
export type OpencodePartInput = { type: 'text'; text: string } | OpencodeFilePartInput;

export type PermissionDecision = {
  allow: boolean;
  remember: boolean;
};
