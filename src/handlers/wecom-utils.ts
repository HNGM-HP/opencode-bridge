/**
 * 企业微信处理器工具函数
 *
 * 从 wecom.ts 提取的模块级纯函数。
 */

import path from 'node:path';
import type { PermissionDecision } from './wecom-types.js';

export function extractExtension(name: string): string {
  return path.extname(name).toLowerCase();
}

export function normalizeExtension(ext: string): string {
  if (!ext) return '';
  const withDot = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (withDot === '.jpeg' || withDot === '.pjpeg' || withDot === '.pjp' || withDot === '.jpe' || withDot === '.jfif') {
    return '.jpg';
  }
  return withDot;
}

export function extensionFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
  };
  return map[ct] || '';
}

export function mimeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || 'attachment';
}

export function extractFilenameFromUrl(url: string): string {
  const segments = url.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && last.includes('.')) {
    return decodeURIComponent(last.split('?')[0]);
  }
  return `wecom_attachment_${Date.now()}`;
}

export function parsePermissionDecision(raw: string): PermissionDecision | null {
  const normalized = raw.normalize('NFKC').trim().toLowerCase();
  if (!normalized) return null;

  const compact = normalized
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。！!,.，；;:：\-]/g, '');

  const hasAlways =
    compact.includes('始终') ||
    compact.includes('永久') ||
    compact.includes('always') ||
    compact.includes('记住') ||
    compact.includes('总是');

  const containsAny = (words: string[]): boolean => {
    return words.some(word => compact === word || compact.includes(word));
  };

  const isDeny =
    compact === 'n' ||
    compact === 'no' ||
    compact === '否' ||
    compact === '拒绝' ||
    containsAny(['拒绝', '不同意', '不允许', 'deny']);
  if (isDeny) {
    return { allow: false, remember: false };
  }

  const isAllow =
    compact === 'y' ||
    compact === 'yes' ||
    compact === 'ok' ||
    compact === 'always' ||
    compact === '允许' ||
    compact === '始终允许' ||
    containsAny(['允许', '同意', '通过', '批准', 'allow']);
  if (isAllow) {
    return { allow: true, remember: hasAlways };
  }

  return null;
}
