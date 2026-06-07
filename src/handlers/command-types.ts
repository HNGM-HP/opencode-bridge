/**
 * 从 command.ts 提取的类型定义与常量
 *
 * 按功能域分组排列。
 */

import { KNOWN_EFFORT_LEVELS, type EffortLevel } from '../commands/effort.js';

// ── Provider/Model 类型 ──────────────────────

export interface ProviderModelMeta {
  providerId: string;
  modelId: string;
  modelName?: string;
  variants: EffortLevel[];
}

export interface EffortSupportInfo {
  model: { providerId: string; modelId: string } | null;
  supportedEfforts: EffortLevel[];
  modelMatched: boolean;
}

// ── Agent 翻译规则 ────────────────────────────

export interface BuiltinAgentTranslationRule {
  names: string[];
  descriptionStartsWith: string;
  translated: string;
}

export const BUILTIN_AGENT_TRANSLATION_RULES: BuiltinAgentTranslationRule[] = [
  {
    names: ['build', 'default'],
    descriptionStartsWith: 'the default agent. executes tools based on configured permissions.',
    translated: '默认执行角色（按权限自动调用工具）',
  },
  {
    names: ['plan'],
    descriptionStartsWith: 'plan mode. disallows all edit tools.',
    translated: '规划模式（禁用编辑类工具）',
  },
  {
    names: ['general'],
    descriptionStartsWith: 'general-purpose agent for researching complex questions and executing multi-step tasks.',
    translated: '通用研究子角色（复杂任务/并行执行）',
  },
  {
    names: ['explore'],
    descriptionStartsWith: 'fast agent specialized for exploring codebases.',
    translated: '代码库探索子角色（快速检索与定位）',
  },
];

// ── Module-level 常量 ─────────────────────────

export const INTERNAL_HIDDEN_AGENT_NAMES = new Set(['compaction', 'title', 'summary']);

export const PANEL_MODEL_OPTION_LIMIT = 500;
export const SESSION_CTL_OPTION_LIMIT = 100;
export const SESSION_CTL_EXISTING_LIMIT = SESSION_CTL_OPTION_LIMIT - 2;
export const EFFORT_USAGE_TEXT = '用法: /effort（查看） 或 /effort <low|high|max|xhigh>（设置） 或 /effort default（清除）';
export const EFFORT_DISPLAY_ORDER = KNOWN_EFFORT_LEVELS;
