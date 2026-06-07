/**
 * 文件发送器类型定义与常量
 *
 * 从 file-sender.ts 提取。
 */

import path from 'path';
import { COMMAND_DOC_PATH } from '../commands/command-doc.js';

// ── 安全校验常量 ───────────────────────────────

export const SYSTEM_GENERATED_PATHS: Set<string> = new Set([
  path.resolve(COMMAND_DOC_PATH),
]);

export const SENSITIVE_NAME_PATTERNS = [
  /\.env$/i,
  /\.env\..+$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /credentials/i,
  /\.key$/i,
  /secrets?\./i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /authorized_keys/i,
  /known_hosts/i,
];

export const SENSITIVE_EXACT_NAMES = new Set([
  'shadow', 'passwd', 'sudoers', 'gshadow', 'master.passwd',
  'group', 'hosts', 'fstab', 'crontab', 'environ', 'cmdline',
  'SAM', 'SYSTEM', 'SECURITY', 'NTDS.dit',
  '.bash_history', '.zsh_history', '.fish_history',
  '.bashrc', '.zshrc', '.profile',
]);

export const SENSITIVE_PATH_PREFIXES = [
  '/etc/', '/proc/', '/sys/', '/dev/', '/boot/', '/root/',
  '/.ssh/', '/.aws/', '/.gnupg/', '/.config/gcloud',
];

// ── 上传限制常量 ───────────────────────────────

export const FEISHU_IMAGE_MAX_SIZE = 10 * 1024 * 1024;  // 10MB
export const FEISHU_FILE_MAX_SIZE = 30 * 1024 * 1024;    // 30MB

export const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.ico',
]);

// ── 类型定义 ────────────────────────────────────

export type FeishuFileType = 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream';

export const FILE_TYPE_MAP: Record<string, FeishuFileType> = {
  '.pdf': 'pdf',
  '.mp4': 'mp4',
  '.opus': 'opus',
  '.ogg': 'opus',
  '.doc': 'doc',
  '.docx': 'doc',
  '.xls': 'xls',
  '.xlsx': 'xls',
  '.ppt': 'ppt',
  '.pptx': 'ppt',
};

export interface SendFileRequest {
  filePath: string;
  chatId: string;
}

export interface SendFileResult {
  success: boolean;
  messageId?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
  sendType?: 'image' | 'file';
}
