/**
 * 从 command.ts commandHandler 类提取的纯辅助函数
 *
 * 这些函数不依赖 CommandHandler 类的实例状态（无 this 引用），
 * 仅依赖模块级导入和参数。
 */

import { type EffortLevel } from '../commands/effort.js';
import { type SessionOrderMode } from '../store/chat-session.js';
import { EFFORT_DISPLAY_ORDER } from './command-types.js';

// ── 文本规范化 ────────────────────────────────

export function normalizeAgentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 显示宽度处理 ──────────────────────────────

export function getDisplayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += /[^\u0000-\u00ff]/.test(char) ? 2 : 1;
  }
  return width;
}

export function truncateByDisplayWidth(
  text: string,
  maxWidth: number,
  mode: 'start' | 'end' = 'end'
): string {
  const normalized = text.trim();
  if (!normalized) return '';
  if (getDisplayWidth(normalized) <= maxWidth) return normalized;

  const ellipsis = '...';
  const targetWidth = Math.max(0, maxWidth - getDisplayWidth(ellipsis));
  let collected = '';
  let usedWidth = 0;
  const chars = [...normalized];
  const source = mode === 'start' ? [...chars].reverse() : chars;

  for (const char of source) {
    const charWidth = getDisplayWidth(char);
    if (usedWidth + charWidth > targetWidth) break;
    collected = mode === 'start' ? `${char}${collected}` : `${collected}${char}`;
    usedWidth += charWidth;
  }

  return mode === 'start' ? `${ellipsis}${collected}` : `${collected}${ellipsis}`;
}

// ── 标识符比较 ────────────────────────────────

export function isSameIdentifier(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

// ── Effort 排序 ───────────────────────────────

export function sortEffortLevels(efforts: EffortLevel[]): EffortLevel[] {
  const order = new Map<string, number>();
  EFFORT_DISPLAY_ORDER.forEach((value, index) => {
    order.set(value, index);
  });

  return [...efforts].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.localeCompare(right);
  });
}

// ── 会话 ID 短标识 ────────────────────────────

export function getPrivateSessionShortId(userId: string): string {
  const normalized = userId.startsWith('ou_') ? userId.slice(3) : userId;
  return normalized.slice(0, 4);
}

// ── 排序模式格式化 ────────────────────────────

export function formatSessionOrderMode(mode: SessionOrderMode): string {
  return mode === 'last_time' ? '按最后修改时间倒序' : '默认排序';
}
