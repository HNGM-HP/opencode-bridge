/**
 * API 入口 - 桶导出
 *
 * 保持与旧 import 路径的向后兼容（import { configApi, type BridgeSettings } from '../api'）
 *
 * 类型定义移至 ./types
 * 各领域 API 移至 ./endpoints/
 */

// 重新导出 HTTP 客户端
export { http } from './types'

// 重新导出所有类型
export type {
  BridgeSettings,
  SaveConfigResult,
  ServiceStatus,
  BridgeStatus,
  OpenCodeStatus,
  OpenCodeUpdateCheck,
  CronJob,
  CreateCronJobInput,
  LogLevel,
  LogEntry,
  LogQueryResult,
  LogStats,
  SessionInfo,
  SessionBindingItem,
  SessionBindingsResponse,
  CreateBindingRequest,
  UpdateBindingRequest,
  SessionStats,
  OpenCodeSessionBinding,
  OpenCodeSession,
  OpenCodeSessionsResponse,
  PlatformInfo,
  PlatformChat,
  ChatSessionSummary,
  ChatWorkspaceOption,
  ChatAgentInfo,
  ChatCommandInfo,
  ChatModelOption,
  ChatModelProviderInfo,
  ChatVisionModelInfo,
  ChatTokenUsage,
  ChatTodoItem,
  ChatPermissionRequest,
  ChatModelRef,
  ChatMessageMeta,
  ChatMessagePart,
  ChatHistoryMessage,
  ChatMessagePage,
  ChatEvent,
  ModelProvider,
  WorkspaceGitFileStatus,
  WorkspaceGitStatus,
  WorkspaceGitLogEntry,
  WorkspaceGitCommitDetail,
  WorkspaceTerminalSession,
  WorkspaceTerminalCommandResult,
  WorkspaceFileEntry,
  WorkspaceFileTree,
  WorkspaceFileContent,
  WeixinAccount,
  WeixinLoginSession,
  DingtalkAccount,
  WhatsAppConnectionStatus,
  WhatsAppStatus,
} from './types'

// 重新导出所有 API 对象
export { configApi } from './endpoints/config'
export { sessionApi } from './endpoints/session'
export { chatApi } from './endpoints/chat'
export { workspaceApi } from './endpoints/workspace'
export { weixinApi, dingtalkApi, whatsappApi } from './endpoints/platform'
