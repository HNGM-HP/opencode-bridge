/**
 * API 类型定义
 *
 * 集中管理所有与后端 API 通信相关的 TypeScript 类型
 */

import type { AxiosInstance } from 'axios'
import axios from 'axios'

// 管理后台不再启用账号/密码鉴权，所有请求直接放行
export const http: AxiosInstance = axios.create({ baseURL: '/api' })

// ──────────────────── 配置类型 ────────────────────

export interface BridgeSettings {
  FEISHU_ENABLED?: string
  FEISHU_APP_ID?: string
  FEISHU_APP_SECRET?: string
  FEISHU_ENCRYPT_KEY?: string
  FEISHU_VERIFICATION_TOKEN?: string
  ALLOWED_USERS?: string
  ENABLED_PLATFORMS?: string
  DISCORD_ENABLED?: string
  DISCORD_TOKEN?: string
  DISCORD_CLIENT_ID?: string
  DISCORD_ALLOWED_BOT_IDS?: string
  WECOM_ENABLED?: string
  WECOM_BOT_ID?: string
  WECOM_SECRET?: string
  WEIXIN_ENABLED?: string
  DINGTALK_ENABLED?: string
  TELEGRAM_ENABLED?: string
  TELEGRAM_BOT_TOKEN?: string
  QQ_ENABLED?: string
  QQ_PROTOCOL?: string
  QQ_ONEBOT_WS_URL?: string
  QQ_APP_ID?: string
  QQ_SECRET?: string
  WHATSAPP_ENABLED?: string
  WHATSAPP_MODE?: string
  WHATSAPP_SESSION_PATH?: string
  WHATSAPP_BUSINESS_PHONE_ID?: string
  WHATSAPP_BUSINESS_ACCESS_TOKEN?: string
  OPENCODE_HOST?: string
  OPENCODE_PORT?: string
  OPENCODE_AUTO_START?: string
  /** @deprecated 不再使用，保留供旧配置兼容 */
  OPENCODE_AUTO_START_CMD?: string
  OPENCODE_AUTO_START_FOREGROUND?: string
  OPENCODE_SERVER_USERNAME?: string
  OPENCODE_SERVER_PASSWORD?: string
  OPENCODE_CONFIG_FILE?: string
  RELIABILITY_CRON_ENABLED?: string
  RELIABILITY_CRON_API_ENABLED?: string
  RELIABILITY_CRON_API_HOST?: string
  RELIABILITY_CRON_API_PORT?: string
  RELIABILITY_CRON_API_TOKEN?: string
  RELIABILITY_CRON_JOBS_FILE?: string
  RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP?: string
  RELIABILITY_CRON_FORWARD_TO_PRIVATE?: string
  RELIABILITY_CRON_FALLBACK_FEISHU_CHAT_ID?: string
  RELIABILITY_CRON_FALLBACK_DISCORD_CONVERSATION_ID?: string
  RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED?: string
  RELIABILITY_INBOUND_HEARTBEAT_ENABLED?: string
  RELIABILITY_HEARTBEAT_INTERVAL_MS?: string
  RELIABILITY_HEARTBEAT_AGENT?: string
  RELIABILITY_HEARTBEAT_PROMPT?: string
  RELIABILITY_HEARTBEAT_ALERT_CHATS?: string
  RELIABILITY_FAILURE_THRESHOLD?: string
  RELIABILITY_WINDOW_MS?: string
  RELIABILITY_COOLDOWN_MS?: string
  RELIABILITY_REPAIR_BUDGET?: string
  RELIABILITY_MODE?: string
  RELIABILITY_LOOPBACK_ONLY?: string
  GROUP_REQUIRE_MENTION?: string
  GROUP_REPLY_REQUIRE_MENTION?: string
  SHOW_THINKING_CHAIN?: string
  SHOW_TOOL_CHAIN?: string
  FEISHU_SHOW_THINKING_CHAIN?: string
  FEISHU_SHOW_TOOL_CHAIN?: string
  DISCORD_SHOW_THINKING_CHAIN?: string
  DISCORD_SHOW_TOOL_CHAIN?: string
  WECOM_SHOW_THINKING_CHAIN?: string
  WECOM_SHOW_TOOL_CHAIN?: string
  TELEGRAM_SHOW_THINKING_CHAIN?: string
  TELEGRAM_SHOW_TOOL_CHAIN?: string
  QQ_SHOW_THINKING_CHAIN?: string
  QQ_SHOW_TOOL_CHAIN?: string
  WHATSAPP_SHOW_THINKING_CHAIN?: string
  WHATSAPP_SHOW_TOOL_CHAIN?: string
  WEIXIN_SHOW_THINKING_CHAIN?: string
  WEIXIN_SHOW_TOOL_CHAIN?: string
  DINGTALK_SHOW_THINKING_CHAIN?: string
  DINGTALK_SHOW_TOOL_CHAIN?: string
  ALLOWED_DIRECTORIES?: string
  DEFAULT_WORK_DIRECTORY?: string
  PROJECT_ALIASES?: string
  GIT_ROOT_NORMALIZATION?: string
  TOOL_WHITELIST?: string
  PERMISSION_REQUEST_TIMEOUT_MS?: string
  OUTPUT_UPDATE_INTERVAL?: string
  MAX_DELAYED_RESPONSE_WAIT_MS?: string
  ATTACHMENT_MAX_SIZE?: string
  ENABLE_MANUAL_SESSION_BIND?: string
  ROUTER_MODE?: string
  DEFAULT_PROVIDER?: string
  DEFAULT_MODEL?: string
  CHAT_MODEL_WHITELIST?: string
  IMAGE_VISION_PREPROCESS?: string
  VISION_OCR_MODEL?: string
  VISION_OCR_PROMPT?: string
}

export interface SaveConfigResult {
  ok: boolean
  needRestart: boolean
  changedKeys: string[]
}

export interface ServiceStatus {
  version: string
  uptime: number
  startedAt: string
  dbPath: string
  cronJobCount: number
  needsPasswordChange?: boolean
  bridgeRunning?: boolean
  bridgePid?: number
}

export interface BridgeStatus {
  managed: boolean
  running: boolean
  pid?: number
  startedAt?: string
  exitCode?: number
  exitReason?: string
}

export interface OpenCodeStatus {
  installed: boolean
  version?: string
  portOpen: boolean
  portReason?: string
}

export interface OpenCodeUpdateCheck {
  latestVersion: string | null
  githubError?: string | null
}

// ──────────────────── Cron 类型 ────────────────────

export interface CronJob {
  id: string
  name?: string
  cronExpression: string
  enabled: boolean
  platform: string
  conversationId: string
  lastRunAt?: string
  nextRunAt?: string
  state?: { status: string; lastError?: string }
}

export interface CreateCronJobInput {
  name?: string
  cronExpression: string
  platform: 'feishu' | 'discord' | 'wecom' | 'telegram' | 'qq' | 'whatsapp'
  conversationId: string
  prompt?: string
}

// ──────────────────── 日志类型 ────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  source: string
  message: string
  raw: string[]
}

export interface LogQueryResult {
  entries: LogEntry[]
  total: number
}

export interface LogStats {
  total: number
  debug: number
  info: number
  warn: number
  error: number
}

// ──────────────────── Session 绑定类型 ────────────────────

export interface SessionInfo {
  chatId?: string
  conversationId?: string
  title: string
  userId?: string
  platform?: 'feishu' | 'discord' | 'wecom' | 'telegram' | 'qq' | 'whatsapp' | 'weixin'
}

export interface SessionBindingItem {
  platform: string
  conversationId: string
  sessionId: string
  title?: string
  chatType?: 'p2p' | 'group'
  creatorId: string
  sessionDirectory?: string
  resolvedDirectory?: string
  projectName?: string
  createdAt: number
}

export interface SessionBindingsResponse {
  bindings: SessionBindingItem[]
  total: number
  page: number
  limit: number
}

export interface CreateBindingRequest {
  platform: string
  conversationId: string
  sessionId: string
  title?: string
  creatorId?: string
  chatType?: 'p2p' | 'group'
  sessionDirectory?: string
}

export interface UpdateBindingRequest {
  sessionId?: string
  title?: string
  sessionDirectory?: string
  resolvedDirectory?: string
  projectName?: string
}

export interface SessionStats {
  total: number
  byPlatform: Record<string, number>
  byType: { p2p: number; group: number; unknown: number }
}

export interface OpenCodeSessionBinding {
  platform: string
  conversationId: string
  title?: string
  chatType?: 'p2p' | 'group'
}

export interface OpenCodeSession {
  id: string
  title?: string
  createdAt?: string
  updatedAt?: number
  projectPath?: string
  directory?: string
  isBound: boolean
  bindings: OpenCodeSessionBinding[]
  localOnly?: boolean // 仅存在于本地绑定，OpenCode 中已不存在
}

export interface OpenCodeSessionsResponse {
  sessions: OpenCodeSession[]
  openCodeAvailable: boolean
}

export interface PlatformInfo {
  id: string
  name: string
  icon: string
}

export interface PlatformChat {
  id: string
  name: string
  type: 'p2p' | 'group' | 'channel'
  avatar?: string
  memberCount?: number
  isBound: boolean
  boundSessionId?: string
  boundSessionTitle?: string
}

// ──────────────────── 聊天（AI 工作区）类型 ────────────────────

export interface ChatSessionSummary {
  id: string
  title: string
  projectId: string
  directory: string
  parentId?: string
  createdAt: number
  updatedAt: number
  version: string
  summary?: {
    additions: number
    deletions: number
    files: number
  }
  share?: {
    url: string
  }
}

export interface ChatWorkspaceOption {
  id: string
  label: string
  directory: string
  source: 'project' | 'default' | 'allowlist'
}

export interface ChatAgentInfo {
  name: string
  description?: string
  mode?: 'primary' | 'subagent' | 'all'
  hidden?: boolean
  builtIn?: boolean
  native?: boolean
}

export interface ChatCommandInfo {
  name: string
  description?: string
  agent?: string
  model?: string
  source?: 'command' | 'mcp' | 'skill' | 'bridge-doc' | 'agent'
  template: string
  subtask?: boolean
  hints: string[]
  group?: string
}

export interface ChatModelOption {
  id: string
  name: string
  variants: string[]
}

export interface ChatModelProviderInfo {
  id: string
  name: string
  models: ChatModelOption[]
}

export interface ChatVisionModelInfo {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
}

export interface ChatTokenUsage {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost?: number
}

export interface ChatTodoItem {
  id: string
  content: string
  status: string
  priority?: string
}

export interface ChatPermissionRequest {
  id: string
  sessionId: string
  tool: string
  description: string
  risk?: string
  messageId?: string
  callId?: string
  metadata?: Record<string, unknown>
}

export interface ChatModelRef {
  providerId: string
  modelId: string
}

export interface ChatMessageMeta {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  parentId?: string
  model?: ChatModelRef
  agent?: string
}

export type ChatMessagePart =
  | {
      id: string
      messageID: string
      sessionID: string
      type: 'text'
      text: string
    }
  | {
      id: string
      messageID: string
      sessionID: string
      type: 'reasoning'
      text: string
    }
  | {
      id: string
      messageID: string
      sessionID: string
      type: 'tool'
      callID: string
      tool: string
      state:
        | { status: 'pending'; input: Record<string, unknown>; raw?: string }
        | { status: 'running'; input: Record<string, unknown>; title?: string; metadata?: Record<string, unknown> }
        | {
            status: 'completed'
            input: Record<string, unknown>
            output: string
            title: string
            metadata?: Record<string, unknown>
          }
        | {
            status: 'error'
            input: Record<string, unknown>
            error: string
            metadata?: Record<string, unknown>
          }
    }
  | {
      id: string
      messageID: string
      sessionID: string
      type: 'file' | 'subtask' | 'step-start' | 'step-finish' | 'snapshot' | 'patch' | 'agent' | 'retry' | 'compaction'
      [key: string]: unknown
    }

export interface ChatHistoryMessage {
  info: {
    id: string
    sessionID: string
    role: 'user' | 'assistant'
    parentID?: string
    time: {
      created: number
      completed?: number
    }
    error?: {
      data?: {
        message?: string
      }
    }
    finish?: string
    agent?: string
    mode?: string
    model?: {
      providerID: string
      modelID: string
    }
    providerID?: string
    modelID?: string
    cost?: number
    tokens?: {
      input: number
      output: number
      reasoning: number
      cache: {
        read: number
        write: number
      }
    }
  }
  parts: ChatMessagePart[]
}

export interface ChatMessagePage {
  messages: ChatHistoryMessage[]
  tasks: ChatTodoItem[]
  total: number
  hasMore: boolean
  nextCursor: string | null
}

export type ChatEvent =
  | { type: 'message_start'; msg: ChatMessageMeta }
  | { type: 'text_delta'; msgId: string; text: string }
  | { type: 'reasoning_delta'; msgId: string; text: string }
  | {
      type: 'tool_start'
      msgId: string
      tool: { id: string; callId: string; name: string; input: unknown; title?: string }
    }
  | { type: 'tool_delta'; msgId: string; toolId: string; output: string }
  | {
      type: 'tool_end'
      msgId: string
      toolId: string
      callId: string
      name: string
      result: string
      isError: boolean
      title?: string
      durationMs?: number
    }
  | { type: 'message_end'; msgId: string; usage?: ChatTokenUsage; finish?: string; error?: string }
  | { type: 'permission_ask'; req: ChatPermissionRequest }
  | { type: 'permission_resolved'; reqId: string; decision: 'allow' | 'reject' | 'always' }
  | { type: 'task_update'; todos: ChatTodoItem[] }
  | { type: 'session_idle'; sessionId: string }
  | { type: 'session_status'; sessionId: string; status: string }
  | { type: 'error'; message: string }
  | { type: 'keepalive' }

export interface ModelProvider {
  name: string
  models: string[]
}

// ──────────────────── 工作区（Workspace）类型 ────────────────────

export interface WorkspaceGitFileStatus {
  path: string
  index: string
  workingTree: string
  staged: boolean
  modified: boolean
  untracked: boolean
  conflicted: boolean
}

export interface WorkspaceGitStatus {
  directory: string
  repositoryRoot: string
  branch: string
  tracking?: string
  ahead: number
  behind: number
  clean: boolean
  detached: boolean
  branches: string[]
  counts: {
    staged: number
    modified: number
    untracked: number
    conflicted: number
  }
  files: WorkspaceGitFileStatus[]
  lastCommit?: {
    hash: string
    message: string
    authorName: string
    date: string
  }
}

export interface WorkspaceGitLogEntry {
  sha: string
  message: string
  authorName: string
  authorEmail: string
  date: string
}

export interface WorkspaceGitCommitDetail {
  sha: string
  message: string
  authorName: string
  authorEmail: string
  date: string
  stats: string
  diff: string
}

export interface WorkspaceTerminalSession {
  sessionId: string
  shell: string
  cwd: string
}

export interface WorkspaceTerminalCommandResult {
  ok: boolean
  exitCode: number
  stdout: string
  stderr: string
  cwd: string
}

export interface WorkspaceFileEntry {
  name: string
  path: string
  type: 'directory' | 'file'
  size: number
  mtimeMs: number
  inaccessible?: boolean
}

export interface WorkspaceFileTree {
  directory: string
  path: string
  entries: WorkspaceFileEntry[]
  truncated: boolean
}

export interface WorkspaceFileContent {
  directory: string
  path: string
  size: number
  truncated: boolean
  isBinary: boolean
  content: string
}

// ──────────────────── 平台适配器类型 ────────────────────

export interface WeixinAccount {
  id: string
  wxid: string
  nickname?: string
  avatar?: string
  enabled: boolean
  createdAt: number
  lastUsedAt?: number
}

export interface WeixinLoginSession {
  sessionId: string
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'cancelled' | 'error'
  qrImage?: string
  account?: WeixinAccount
  error?: string
}

export interface DingtalkAccount {
  id: string
  accountId: string
  clientId: string
  clientSecret: string
  name: string
  enabled: boolean
  endpoint: string
  createdAt: string
}

export type WhatsAppConnectionStatus = 'connected' | 'need_scan' | 'disconnected' | 'connecting'

export interface WhatsAppStatus {
  ok: boolean
  enabled: boolean
  mode: 'personal' | 'business'
  status: WhatsAppConnectionStatus
  qrCode?: string
}
