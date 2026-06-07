import type { EffortLevel } from '../commands/effort.js';

export type ChatSessionType = 'p2p' | 'group';
export type SessionOrderMode = 'default' | 'last_time';

export interface ChatSessionData {
  chatId: string;
  sessionId: string;
  sessionDirectory?: string;
  creatorId: string;
  createdAt: number;
  title?: string;
  chatType?: ChatSessionType;
  protectSessionDelete?: boolean;
  lastFeishuUserMsgId?: string;
  lastFeishuAiMsgId?: string;
  preferredModel?: string;
  preferredAgent?: string;
  preferredEffort?: EffortLevel;
  resolvedDirectory?: string;
  projectName?: string;
  defaultDirectory?: string;
  sessionOrderMode?: SessionOrderMode;
  qqOutputOnlyText?: boolean;
  helpWithQc?: boolean;
  sessionWithCtl?: boolean;
  sessionWithChange?: boolean;
  reminderSent?: boolean;
  interactionHistory: InteractionRecord[];
}

export interface SessionAliasRecord {
  chatId: string;
  expiresAt: number;
}

export interface InteractionRecord {
  userFeishuMsgId: string;
  openCodeMsgId: string;
  botFeishuMsgIds: string[];
  type: 'normal' | 'question_prompt' | 'question_answer';
  cardData?: any;
  timestamp: number;
}

export interface SessionBindingOptions {
  protectSessionDelete?: boolean;
  chatType?: ChatSessionType;
  sessionDirectory?: string;
  resolvedDirectory?: string;
  projectName?: string;
}

export interface ConversationBindingRecord {
  platform: string;
  conversationId: string;
  session: ChatSessionData;
}
