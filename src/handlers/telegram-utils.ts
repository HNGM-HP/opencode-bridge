/**
 * Telegram 处理器工具函数
 *
 * 从 telegram.ts 提取的模块级纯函数。
 */

import path from 'node:path';
import type { PermissionDecision } from './telegram-types.js';

// ── 文件类型检测 ──────────────────────────────

export function extractExtension(name: string): string {
  return path.extname(name).toLowerCase();
}

export function mimeFromExtension(ext: string): string {
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.pdf': return 'application/pdf';
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.mp3': return 'audio/mpeg';
    case '.ogg': return 'audio/ogg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    default: return 'application/octet-stream';
  }
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || 'attachment';
}

// ── 权限决策解析 ──────────────────────────────

export function parsePermissionDecision(raw: string): PermissionDecision | null {
  const normalized = raw.normalize('NFKC').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const compact = normalized
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。！!,.，；;:：\-]/g, '');

  const hasAlways =
    compact.includes('始终')
    || compact.includes('永久')
    || compact.includes('always')
    || compact.includes('记住')
    || compact.includes('总是');

  const containsAny = (words: string[]): boolean => {
    return words.some(word => compact === word || compact.includes(word));
  };

  const isDeny =
    compact === 'n'
    || compact === 'no'
    || compact === '否'
    || compact === '拒绝'
    || containsAny(['拒绝', '不同意', '不允许', 'deny']);

  if (isDeny) {
    return { allow: false, remember: false };
  }

  const isAllow =
    compact === 'y'
    || compact === 'yes'
    || compact === 'ok'
    || compact === 'always'
    || compact === '允许'
    || compact === '始终允许'
    || containsAny(['允许', '同意', '通过', '批准', 'allow']);

  if (isAllow) {
    return { allow: true, remember: hasAlways };
  }

  return null;
}
