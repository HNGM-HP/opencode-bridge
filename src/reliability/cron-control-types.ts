/**
 * Cron 控制类型定义
 */
import type { RuntimeCronManager } from './runtime-cron.js';

export type CronIntentAction = 'list' | 'help' | 'add' | 'update' | 'remove' | 'pause' | 'resume';
export type CronIntentSource = 'slash' | 'natural';

export interface CronIntent {
  action: CronIntentAction;
  source: CronIntentSource;
  argsText: string;
  preset?: {
    id?: string;
    expr?: string;
    text?: string;
    name?: string;
  };
}

export interface ExecuteCronIntentOptions {
  manager: RuntimeCronManager | null;
  intent: CronIntent;
  currentSessionId?: string;
  currentDirectory?: string;
  currentConversationId?: string;
  creatorId?: string;
  platform: 'feishu' | 'discord';
}

export interface ResolveCronIntentForExecutionOptions {
  source: CronIntentSource;
  argsText: string;
  action?: CronIntentAction;
  semanticParser?: (argsText: string, source: CronIntentSource, actionHint?: CronIntentAction) => Promise<CronIntent | null>;
}

export interface ParsedOptionArgs {
  options: Record<string, string>;
  flags: Set<string>;
  positionals: string[];
}
