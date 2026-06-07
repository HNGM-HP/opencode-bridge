/**
 * Discord 处理器工具函数
 *
 * 从 discord.ts 提取的模块级纯函数。
 */

import type { PermissionDecision, DiscordCommand } from './discord-types.js';

// ── 文本规范化 ────────────────────────────────

export function normalizeMessageText(value: string): string {
  return value.trim();
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

// ── Discord 命令解析 ──────────────────────────

export function parseDiscordCommand(text: string): DiscordCommand | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const commandPrefix = normalized.startsWith('///')
    ? '///'
    : normalized.startsWith('/')
      ? '/'
      : null;

  if (!commandPrefix) {
    return null;
  }

  const body = normalized.slice(commandPrefix.length).trim();
  if (!body) {
    return null;
  }

  const [name, ...rest] = body.split(/\s+/);
  return {
    name: name.toLowerCase(),
    args: rest.join(' ').trim(),
  };
}

// ── Custom ID 解析 ────────────────────────────

export function parseConversationIdFromCustomId(prefix: string, customId: string): string | null {
  const expectedPrefix = `${prefix}:`;
  if (!customId.startsWith(expectedPrefix)) {
    return null;
  }

  const value = customId.slice(expectedPrefix.length).trim();
  return value.length > 0 ? value : null;
}

// ── 自然语言文件发送命令解析 ──────────────────

export function parseNaturalFileSendText(text: string): string | null {
  const matched = text.trim().match(/^发送文件\s+(.+)$/u);
  if (!matched) {
    return null;
  }

  const value = matched[1].trim();
  return value || null;
}
