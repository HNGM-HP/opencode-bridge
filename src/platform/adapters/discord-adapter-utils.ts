/**
 * Discord 适配器工具函数
 *
 * 从 discord-adapter.ts 提取的模块级纯函数。
 */

import type { DiscordSendableChannel } from './discord-adapter-types.js';

// ── 动态导入缓存 ──────────────────────────────

let _discordModule: typeof import('discord.js') | null = null;
export async function getDiscordModule(): Promise<typeof import('discord.js')> {
  if (!_discordModule) {
    _discordModule = await import('discord.js');
  }
  return _discordModule;
}

// ── 工具函数 ──────────────────────────────────

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isDiscordSendableChannel(channel: unknown): channel is DiscordSendableChannel {
  if (!channel || typeof channel !== 'object') return false;

  const record = channel as {
    send?: unknown;
    messages?: { fetch?: unknown };
  };

  return typeof record.send === 'function'
    && !!record.messages
    && typeof record.messages.fetch === 'function';
}
