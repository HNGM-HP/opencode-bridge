import { createOpencodeClient, type OpencodeClient as SdkOpencodeClient } from '@opencode-ai/sdk';
import type { Session, Message, Part, Project } from '@opencode-ai/sdk';
import { opencodeConfig } from '../config.js';
import { EventEmitter } from 'events';
import {
  formatSdkError,
  withOpencodeAuthorizationHeaders,
  appendAuthHint,
} from './client-helpers.js';
import { EventStreamManager } from './event-stream.js';
import { CommandCacheManager } from './command-cache.js';
import { ProvidersManager } from './providers.js';
import { SessionsManager } from './sessions.js';
import { MessagesManager } from './messages.js';

// 权限请求事件类型
export interface PermissionRequestEvent {
  sessionId: string;
  permissionId: string;
  tool: string;
  description: string;
  risk?: string;
  parentSessionId?: string;
  relatedSessionId?: string;
  messageId?: string;
  callId?: string;
}

export interface PermissionResponseOptions {
  directory?: string;
  fallbackDirectories?: string[];
}

// 消息部分类型
export interface MessagePart {
  type: string;
  text?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export type AgentMode = 'primary' | 'subagent' | 'all';

export interface OpencodeAgentInfo {
  name: string;
  description?: string;
  mode?: AgentMode;
  hidden?: boolean;
  builtIn?: boolean;
  native?: boolean;
}

export interface OpencodeCommandInfo {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
  source?: 'command' | 'mcp' | 'skill';
  template: string;
  subtask?: boolean;
  hints: string[];
}

export interface OpencodeAgentConfig {
  description?: string;
  mode?: AgentMode;
  prompt?: string;
  tools?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface OpencodeRuntimeConfig {
  agent?: Record<string, OpencodeAgentConfig>;
  [key: string]: unknown;
}

export interface ShellExecutionResult {
  info?: Message;
  parts: Part[];
}

export interface SessionQueryOptions {
  directory?: string;
}

class OpencodeClientWrapper extends EventEmitter {
  private client: SdkOpencodeClient | null = null;
  private eventStreamManager = new EventStreamManager({
    getClient: () => this.client,
    emitEvent: (type, event) => this.emit(type, event),
  });
  private knownSessionDirectories: Set<string> = new Set();
  private commandCacheManager = new CommandCacheManager({
    getClient: () => this.client,
  });

  private providersManager = new ProvidersManager({
    getClient: () => this.client,
  });

  private sessionsManager = new SessionsManager({
    getClient: () => this.client,
    normalizeDirectory: (directory) => this.normalizeDirectory(directory),
    rememberDirectory: (directory) => this.rememberDirectory(directory),
    ensureDirectoryEventStream: (directory) => this.ensureDirectoryEventStream(directory),
    knownSessionDirectoriesRef: { current: this.knownSessionDirectories },
  });

  private messagesManager = new MessagesManager({
    getClient: () => this.client,
    ensureDirectoryEventStream: (directory) => this.ensureDirectoryEventStream(directory),
    normalizeDirectory: (directory) => this.normalizeDirectory(directory),
  });

  constructor() {
    super();
  }

  // 连接到OpenCode服务器
  async connect(): Promise<boolean> {
    console.log(`[OpenCode] 正在连接到 ${opencodeConfig.baseUrl}...`);

    try {
      this.client = createOpencodeClient({
        baseUrl: opencodeConfig.baseUrl,
        headers: withOpencodeAuthorizationHeaders(),
      });

      // 通过获取会话列表来检查服务器状态
      const result = await this.client.session.list();

      if (result.error) {
        const statusCode = result.response?.status;
        const reason = appendAuthHint(
          statusCode
            ? `OpenCode 连接失败（HTTP ${statusCode}）`
            : `OpenCode 连接失败: ${formatSdkError(result.error)}`,
          statusCode
        );
        console.error(`[OpenCode] ${reason}`);
        return false;
      }

      console.log('[OpenCode] 已连接');
      this.eventStreamManager.setListeningEnabled(true);

      // 启动事件监听
      void this.eventStreamManager.start();
      return true;
    } catch (error) {
      // 统一错误处理：格式化错误信息并添加认证提示
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = /\b(\d{3})\b/.exec(errorMessage)?.[1];
      const numericCode = statusCode ? parseInt(statusCode, 10) : undefined;

      const reason = appendAuthHint(
        `OpenCode 连接失败: ${errorMessage}`,
        numericCode
      );
      console.error(`[OpenCode] ${reason}`);
      return false;
    }
  }

  private clearEventReconnectTimer(): void {
    this.eventStreamManager.clearReconnectTimer();
  }

  private scheduleEventReconnect(reason: string): void {
    this.eventStreamManager.scheduleReconnect(reason);
  }

  private clearDirectoryEventReconnectTimer(directory: string): void {
    this.eventStreamManager.clearDirectoryEventReconnectTimer(directory);
  }

  private scheduleDirectoryEventReconnect(directory: string, reason: string): void {
    this.eventStreamManager.scheduleDirectoryEventReconnect(directory, reason);
  }

  private async ensureDirectoryEventStream(directory: string): Promise<void> {
    return this.eventStreamManager.ensureDirectoryEventStream(directory);
  }


  // 启动SSE事件监听
  private async startEventListener(): Promise<void> {
    return this.eventStreamManager.start();
  }

  // 处理SSE事件
  private handleEvent(event: { type: string; properties?: Record<string, unknown> }): void {
    this.eventStreamManager.handleEvent(event);
  }

  // 获取客户端实例
  getClient(): SdkOpencodeClient {
    if (!this.client) {
      throw new Error('OpenCode客户端未连接');
    }
    return this.client;
  }

  private normalizeDirectory(directory?: string): string | undefined {
    if (typeof directory !== 'string') {
      return undefined;
    }

    const normalized = directory.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private rememberDirectory(directory?: string): string | undefined {
    const normalized = this.normalizeDirectory(directory);
    if (normalized) {
      this.knownSessionDirectories.add(normalized);
    }
    return normalized;
  }

  // ── Providers / Config ──────────────────────────────────────────

  async getProviders(): Promise<{
    providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
    default: Record<string, string>;
  }> {
    return this.providersManager.getProviders();
  }

  async getProvidersFull(): Promise<{
    providers: Array<Record<string, unknown>>;
    default: Record<string, string>;
  }> {
    return this.providersManager.getProvidersFull();
  }

  async getModelCapabilities(
    providerId: string,
    modelId: string,
  ): Promise<{
    input?: { text?: boolean; image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean };
    output?: { text?: boolean; image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean };
    attachment?: boolean;
  } | null> {
    return this.providersManager.getModelCapabilities(providerId, modelId);
  }

  async listVisionModels(): Promise<Array<{
    providerID: string;
    providerName: string;
    modelID: string;
    modelName: string;
  }>> {
    return this.providersManager.listVisionModels();
  }

  async getConfig(): Promise<OpencodeRuntimeConfig> {
    return this.providersManager.getConfig();
  }

  async updateConfig(config: OpencodeRuntimeConfig): Promise<OpencodeRuntimeConfig | null> {
    return this.providersManager.updateConfig(config);
  }

  async getAgents(): Promise<OpencodeAgentInfo[]> {
    return this.providersManager.getAgents();
  }

  // ── Sessions ────────────────────────────────────────────────────

  async getOrCreateSession(title?: string): Promise<Session> {
    return this.sessionsManager.getOrCreateSession(title);
  }

  async listProjects(options?: SessionQueryOptions): Promise<Project[]> {
    return this.sessionsManager.listProjects(options);
  }

  async listSessions(options?: SessionQueryOptions): Promise<Session[]> {
    return this.sessionsManager.listSessions(options);
  }

  async listSessionsAcrossProjects(): Promise<Session[]> {
    return this.sessionsManager.listSessionsAcrossProjects();
  }

  async listAllSessions(knownDirectories: string[]): Promise<Session[]> {
    return this.sessionsManager.listAllSessions(knownDirectories);
  }

  async getSessionById(sessionId: string, options?: SessionQueryOptions): Promise<Session | null> {
    return this.sessionsManager.getSessionById(sessionId, options);
  }

  async findSessionAcrossProjects(sessionId: string): Promise<Session | null> {
    return this.sessionsManager.findSessionAcrossProjects(sessionId);
  }

  async createSession(title?: string, directory?: string): Promise<Session> {
    return this.sessionsManager.createSession(title, directory);
  }

  async updateSession(sessionId: string, title: string): Promise<boolean> {
    return this.sessionsManager.updateSession(sessionId, title);
  }

  async deleteSession(sessionId: string, options?: SessionQueryOptions): Promise<boolean> {
    return this.sessionsManager.deleteSession(sessionId, options);
  }

  async getSessionMessages(sessionId: string): Promise<Array<{ info: Message; parts: Part[] }>> {
    return this.sessionsManager.getSessionMessages(sessionId);
  }

  async getSessionLastActivityTime(sessionId: string): Promise<number> {
    return this.sessionsManager.getSessionLastActivityTime(sessionId);
  }

  // ── Messages ────────────────────────────────────────────────────

  async sendMessage(
    sessionId: string,
    text: string,
    options?: {
      providerId?: string;
      modelId?: string;
      agent?: string;
      variant?: string;
      directory?: string;
    }
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.messagesManager.sendMessage(sessionId, text, options);
  }

  async sendMessageParts(
    sessionId: string,
    parts: Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; url: string; filename?: string }>,
    options?: {
      providerId?: string;
      modelId?: string;
      agent?: string;
      variant?: string;
      directory?: string;
    },
    messageId?: string
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.messagesManager.sendMessageParts(sessionId, parts, options, messageId);
  }

  async sendMessageAsync(
    sessionId: string,
    text: string,
    options?: {
      providerId?: string;
      modelId?: string;
      agent?: string;
      variant?: string;
      directory?: string;
    }
  ): Promise<void> {
    return this.messagesManager.sendMessageAsync(sessionId, text, options);
  }

  async sendMessagePartsAsync(
    sessionId: string,
    parts: Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; url: string; filename?: string }>,
    options?: {
      providerId?: string;
      modelId?: string;
      agent?: string;
      variant?: string;
      directory?: string;
    }
  ): Promise<void> {
    return this.messagesManager.sendMessagePartsAsync(sessionId, parts, options);
  }

  async sendCommand(
    sessionId: string,
    command: string,
    args: string,
    options?: { directory?: string }
  ): Promise<{ info: Message; parts: Part[] }> {
    return this.messagesManager.sendCommand(sessionId, command, args, options);
  }

  async sendShellCommand(
    sessionId: string,
    command: string,
    agent: string,
    options?: { providerId?: string; modelId?: string; directory?: string }
  ): Promise<ShellExecutionResult> {
    return this.messagesManager.sendShellCommand(sessionId, command, agent, options);
  }

  async summarizeSession(sessionId: string, providerId: string, modelId: string): Promise<boolean> {
    return this.messagesManager.summarizeSession(sessionId, providerId, modelId);
  }

  async revertMessage(sessionId: string, messageId: string): Promise<boolean> {
    return this.messagesManager.revertMessage(sessionId, messageId);
  }

  async abortSession(sessionId: string): Promise<boolean> {
    return this.messagesManager.abortSession(sessionId);
  }

  async respondToPermission(
    sessionId: string,
    permissionId: string,
    allow: boolean,
    remember: boolean = false,
    options?: PermissionResponseOptions
  ): Promise<{ ok: boolean; expired?: boolean }> {
    return this.messagesManager.respondToPermission(sessionId, permissionId, allow, remember, options);
  }

  // 回复问题 (question 工具)
  async replyQuestion(
    requestId: string,
    answers: string[][]
  ): Promise<{ ok: boolean; expired?: boolean }> {
    return this.messagesManager.replyQuestion(requestId, answers);
  }

  // 拒绝/跳过问题
  async rejectQuestion(requestId: string): Promise<{ ok: boolean; expired?: boolean }> {
    return this.messagesManager.rejectQuestion(requestId);
  }

  // ── Commands ────────────────────────────────────────────────────

  // 获取可用命令列表（slash command）
  async getCommands(): Promise<OpencodeCommandInfo[]> {
    return this.commandCacheManager.getCommands();
  }

  private async checkOpenCodeVersion(): Promise<boolean> {
    return this.commandCacheManager.checkOpenCodeVersion();
  }

  // 获取 OpenCode 版本信息（供外部调用）
  public getOpencodeVersion(): string | null {
    return this.commandCacheManager.getOpencodeVersion();
  }

  // 清除命令缓存（用于强制刷新）
  public clearCommandsCache(): void {
    this.commandCacheManager.clearCommandsCache();
  }

  // 断开连接
  disconnect(): void {
    this.eventStreamManager.disconnect();
    this.client = null;
    console.log('[OpenCode] 已断开连接');
  }
}

// 单例导出
export const opencodeClient = new OpencodeClientWrapper();
