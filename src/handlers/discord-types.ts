/**
 * Discord 处理器类型定义与常量
 *
 * 从 discord.ts 提取。
 */

// ── 模块级常量 ────────────────────────────────

export const PANEL_SELECT_PREFIX = 'oc_panel';
export const BIND_SELECT_PREFIX = 'oc_bind';
export const RENAME_MODAL_PREFIX = 'oc_rename';
export const QUESTION_SELECT_PREFIX = 'oc_question';
export const MODEL_SELECT_PREFIX = 'oc_model';
export const AGENT_SELECT_PREFIX = 'oc_agent';
export const RENAME_INPUT_ID = 'session_name';
export const MAX_SESSION_OPTIONS = 25;
export const MAX_MODEL_OPTIONS = 500;
export const MODEL_PAGE_SIZE = 24;
export const DISCORD_FILE_MAX_SIZE = 25 * 1024 * 1024;

// ── 类型定义 ──────────────────────────────────

export type ParsedQuestionAnswer = NonNullable<ReturnType<typeof import('../opencode/question-parser.js').parseQuestionAnswerText>>;

export type PermissionDecision = {
  allow: boolean;
  remember: boolean;
};

export type DiscordCommand = {
  name: string;
  args: string;
};
