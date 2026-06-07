/**
 * Discord 适配器类型定义与常量
 *
 * 从 discord-adapter.ts 提取。
 */

import type { ActionRowBuilder, StringSelectMenuBuilder, Message } from 'discord.js';

// ── 模块级常量 ────────────────────────────────

export const DISCORD_MESSAGE_LIMIT = 1800;

// ── 类型定义 ──────────────────────────────────

export type DiscordSelectOptionPayload = {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
};

export type DiscordSelectComponentPayload = {
  type?: 'select';
  customId: string;
  placeholder?: string;
  options: DiscordSelectOptionPayload[];
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
};

export type DiscordCardPayload = {
  discordText?: string;
  discordComponents?: DiscordSelectComponentPayload[];
};

export type DiscordMessagePayload = {
  content: string;
  components?: ActionRowBuilder<StringSelectMenuBuilder>[];
};

export type DiscordSendableChannel = {
  send: (content: string | DiscordMessagePayload) => Promise<Message>;
  messages: {
    fetch: (messageId: string) => Promise<Message>;
  };
};
