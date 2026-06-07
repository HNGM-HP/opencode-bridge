/**
 * 从 cards.ts 提取的类型定义与常量
 *
 * 按 card 功能域分组排列。
 */

// ── 权限确认卡片 ─────────────────────────────

export interface PermissionCardData {
  tool: string;
  description: string;
  risk?: string;
  sessionId: string;
  permissionId: string;
  parentSessionId?: string;
  relatedSessionId?: string;
}

// ── 执行状态卡片 ─────────────────────────────

export interface StatusCardData {
  status: 'running' | 'completed' | 'failed' | 'aborted';
  sessionId: string;
  currentTool?: string;
  progress?: string;
  output?: string;
}

// ── Markdown 卡片 ────────────────────────────

export interface MarkdownCardPage {
  title: string;
  markdown: string;
  template?: 'blue' | 'green' | 'red' | 'orange' | 'grey';
}

// ── 帮助 / 快捷命令卡片 ─────────────────────

export interface HelpShortcutAction {
  label: string;
  command: string;
}

export interface ShortcutCardData {
  title: string;
  description?: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  shortcuts: HelpShortcutAction[];
  template?: 'blue' | 'green' | 'red' | 'orange' | 'grey';
}

export interface HelpCardData {
  title: string;
  markdown: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  shortcuts: HelpShortcutAction[];
  template?: 'blue' | 'green' | 'red' | 'orange' | 'grey';
}

// ── 控制面板卡片 ─────────────────────────────

export interface ControlCardData {
  conversationKey: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  currentModel?: string;
  currentAgent?: string;
  currentEffort?: string;
  models: Array<{ label: string; value: string }>;
  agents: Array<{ label: string; value: string }>;
}

// ── 会话控制卡片 ─────────────────────────────

export interface SessionCtlSessionOption {
  label: string;
  value: string;
}

export interface SessionControlCardData {
  chatId: string;
  chatType: 'p2p' | 'group';
  currentDirectory: string;
  currentSessionId: string;
  currentSessionTitle: string;
  selectedSessionId: string;
  sessionOptions: SessionCtlSessionOption[];
  totalSessionCount?: number;
}

export const SESSION_CTL_CURRENT_VALUE = '__current_session__';
export const SESSION_CTL_NEW_VALUE = '__new_session__';

// ── 会话列表卡片 ─────────────────────────────

export interface SessionListActionCardData {
  title: string;
  sessionId: string;
  markdown: string;
  chatId: string;
  chatType: 'p2p' | 'group';
}

export interface SessionListCardEntry {
  sessionId: string;
  markdown: string;
}

export interface SessionListCardData {
  title: string;
  summaryMarkdown: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  entries: SessionListCardEntry[];
}

// ── AI 提问卡片 ──────────────────────────────

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionCardData {
  requestId: string;
  sessionId: string;
  questions: QuestionInfo[];
  conversationKey: string;
  chatId: string;
  draftAnswers?: string[][];
  draftCustomAnswers?: string[];
  pendingCustomQuestionIndex?: number;
  currentQuestionIndex?: number;
  optionPageIndexes?: number[];
}

export const QUESTION_OPTION_PAGE_SIZE = 15;

// ── 创建群聊卡片 ─────────────────────────────

export interface CreateChatSessionOption {
  label: string;
  value: string;
}

export interface CreateChatCardData {
  selectedSessionId?: string;
  sessionOptions: CreateChatSessionOption[];
  totalSessionCount?: number;
  manualBindEnabled: boolean;
  projectOptions?: Array<{ name: string; directory: string; source: 'alias' | 'history' }>;
  allowCustomPath?: boolean;
  chatNameInput?: string;
}

export const CREATE_CHAT_NEW_SESSION_VALUE = '__new_session__';
