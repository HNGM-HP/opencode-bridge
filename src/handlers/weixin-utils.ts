/**
 * 微信处理器工具函数
 *
 * 从 weixin.ts 提取的模块级纯函数。
 */

import type { PermissionDecision } from './weixin-types.js';

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
