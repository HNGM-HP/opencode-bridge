import type { OpencodeClient as SdkOpencodeClient } from '@opencode-ai/sdk';
import type { Message, Part } from '@opencode-ai/sdk';
import type { PermissionResponseOptions, ShellExecutionResult } from './client.js';
import { opencodeConfig, modelConfig } from '../config.js';
import {
  withOpencodeAuthorizationHeaders,
  appendAuthHint,
  formatSdkError,
  inlineLocalUploadParts,
} from './client-helpers.js';

export interface MessagesDeps {
  getClient: () => SdkOpencodeClient | null;
  ensureDirectoryEventStream: (directory: string) => Promise<void>;
  normalizeDirectory: (directory?: string) => string | undefined;
}

export class MessagesManager {
  constructor(private deps: MessagesDeps) {}

  // 获取客户端实例
  private getClient(): SdkOpencodeClient {
    const client = this.deps.getClient();
    if (!client) {
      throw new Error('OpenCode客户端未连接');
    }
    return client;
  }

  private resolveModelOption(options?: { providerId?: string; modelId?: string }): { providerID: string; modelID: string } | undefined {
    const providerId = options?.providerId?.trim();
    const modelId = options?.modelId?.trim();
    if (providerId && modelId) {
      return {
        providerID: providerId,
        modelID: modelId,
      };
    }

    const defaultProvider = modelConfig.defaultProvider;
    const defaultModel = modelConfig.defaultModel;
    if (defaultProvider && defaultModel) {
      return {
        providerID: defaultProvider,
        modelID: defaultModel,
      };
    }

    return undefined;
  }

  // 发送消息并等待响应
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
    const client = this.getClient();
    const model = this.resolveModelOption(options);

    if (options?.directory) {
      void this.deps.ensureDirectoryEventStream(options.directory);
    }

      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text }],
          ...(options?.agent ? { agent: options.agent } : {}),
          ...(model ? { model } : {}),
          ...(options?.variant ? { variant: options.variant } : {}),
        },
      ...(options?.directory ? { query: { directory: options.directory } } : {}),
      });

    return response.data as { info: Message; parts: Part[] };
  }

  // 发送带多类型 parts 的消息
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
    const client = this.getClient();
    const model = this.resolveModelOption(options);
    const resolvedParts = await inlineLocalUploadParts(parts);

    if (options?.directory) {
      void this.deps.ensureDirectoryEventStream(options.directory);
    }

      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: resolvedParts,
          // ...(messageId ? { messageID: messageId } : {}), // 已注释：避免传递飞书 MessageID 导致 Opencode 无法处理
          ...(options?.agent ? { agent: options.agent } : {}),
          ...(model ? { model } : {}),
          ...(options?.variant ? { variant: options.variant } : {}),
        },
      ...(options?.directory ? { query: { directory: options.directory } } : {}),
      });

    return response.data as { info: Message; parts: Part[] };
  }

  // 异步发送消息（不等待响应）
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
    this.getClient();
    const model = this.resolveModelOption(options);

    if (options?.directory) {
      void this.deps.ensureDirectoryEventStream(options.directory);
    }

    const dirQuery = options?.directory ? `?directory=${encodeURIComponent(options.directory)}` : '';
    const response = await fetch(`${opencodeConfig.baseUrl}/session/${sessionId}/prompt_async${dirQuery}`, {
      method: 'POST',
      headers: withOpencodeAuthorizationHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        parts: [{ type: 'text', text }],
        ...(options?.agent ? { agent: options.agent } : {}),
        ...(model ? { model } : {}),
        ...(options?.variant ? { variant: options.variant } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
      const message = `prompt_async 请求失败 (${response.status} ${response.statusText})${suffix}`;
      throw new Error(appendAuthHint(message, response.status));
    }
  }

  // 异步发送多 parts 消息（立即返回，结果通过事件流推送）
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
    this.getClient();
    const model = this.resolveModelOption(options);
    const resolvedParts = await inlineLocalUploadParts(parts);

    if (options?.directory) {
      void this.deps.ensureDirectoryEventStream(options.directory);
    }

    const dirQuery = options?.directory ? `?directory=${encodeURIComponent(options.directory)}` : '';
    const response = await fetch(`${opencodeConfig.baseUrl}/session/${sessionId}/prompt_async${dirQuery}`, {
      method: 'POST',
      headers: withOpencodeAuthorizationHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        parts: resolvedParts,
        ...(options?.agent ? { agent: options.agent } : {}),
        ...(model ? { model } : {}),
        ...(options?.variant ? { variant: options.variant } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
      const message = `prompt_async 请求失败 (${response.status} ${response.statusText})${suffix}`;
      throw new Error(appendAuthHint(message, response.status));
    }
  }

  // 发送命令
  async sendCommand(
    sessionId: string,
    command: string,
    args: string,
    options?: { directory?: string }
  ): Promise<{ info: Message; parts: Part[] }> {
    const client = this.getClient();

    if (options?.directory) {
      void this.deps.ensureDirectoryEventStream(options.directory);
    }

      const result = await client.session.command({
        path: { id: sessionId },
        body: {
          command,
          arguments: args,
        },
      ...(options?.directory ? { query: { directory: options.directory } } : {}),
      });

    if (result.error) {
      const statusCode = result.response?.status;
      const detail = formatSdkError(result.error);
      const message = statusCode
        ? `OpenCode 命令调用失败（HTTP ${statusCode}）: ${detail}`
        : `OpenCode 命令调用失败: ${detail}`;
      throw new Error(appendAuthHint(message, statusCode));
    }

    return result.data as { info: Message; parts: Part[] };
  }

  async sendShellCommand(
    sessionId: string,
    command: string,
    agent: string,
    options?: { providerId?: string; modelId?: string; directory?: string }
  ): Promise<ShellExecutionResult> {
    this.getClient();

    if (options?.directory) {
      void this.deps.ensureDirectoryEventStream(options.directory);
    }

    const model = options?.providerId && options?.modelId
      ? {
          providerID: options.providerId,
          modelID: options.modelId,
        }
      : undefined;

    const dirQuery = options?.directory ? `?directory=${encodeURIComponent(options.directory)}` : '';
    const response = await fetch(`${opencodeConfig.baseUrl}/session/${sessionId}/shell${dirQuery}`, {
      method: 'POST',
      headers: withOpencodeAuthorizationHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        agent,
        command,
        ...(model ? { model } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const suffix = detail ? `: ${detail.slice(0, 500)}` : '';
      const message = `OpenCode Shell 调用失败（HTTP ${response.status} ${response.statusText}）${suffix}`;
      throw new Error(appendAuthHint(message, response.status));
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!payload || typeof payload !== 'object') {
      return { parts: [] };
    }

    const record = payload as Record<string, unknown>;
    const parts = Array.isArray(record.parts) ? record.parts as Part[] : [];

    if (record.info && typeof record.info === 'object') {
      return {
        info: record.info as Message,
        parts,
      };
    }

    if (typeof record.id === 'string' && typeof record.sessionID === 'string') {
      return {
        info: record as unknown as Message,
        parts,
      };
    }

    return { parts };
  }

  async summarizeSession(sessionId: string, providerId: string, modelId: string): Promise<boolean> {
    const client = this.getClient();
    const result = await client.session.summarize({
      path: { id: sessionId },
      body: {
        providerID: providerId,
        modelID: modelId,
      },
    });

    if (result.error) {
      const statusCode = result.response?.status;
      const detail = formatSdkError(result.error);
      const message = statusCode
        ? `会话压缩失败（HTTP ${statusCode}）: ${detail}`
        : `会话压缩失败: ${detail}`;
      throw new Error(appendAuthHint(message, statusCode));
    }

    return result.data === true;
  }

  // 撤回消息
  async revertMessage(sessionId: string, messageId: string): Promise<boolean> {
    const client = this.getClient();
    try {
      const result = await client.session.revert({
        path: { id: sessionId },
        body: { messageID: messageId },
      });
      return Boolean(result.data);
    } catch (error) {
      console.error('[OpenCode] 撤回消息失败:', error);
      return false;
    }
  }

  // 中断会话执行
  async abortSession(sessionId: string): Promise<boolean> {
    const client = this.getClient();

    try {
      const result = await client.session.abort({
        path: { id: sessionId },
      });
      return result.data === true;
    } catch (error) {
      console.error('[OpenCode] 中断会话失败:', error);
      return false;
    }
  }

  private buildPermissionDirectoryCandidates(options?: PermissionResponseOptions): Array<string | undefined> {
    const candidates: Array<string | undefined> = [];
    const seen = new Set<string>();

    const pushDirectory = (directory?: string): void => {
      const normalized = this.deps.normalizeDirectory(directory);
      if (!normalized) {
        if (!seen.has('__default__')) {
          seen.add('__default__');
          candidates.push(undefined);
        }
        return;
      }

      const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      candidates.push(normalized);
    };

    pushDirectory(options?.directory);

    if (Array.isArray(options?.fallbackDirectories)) {
      for (const directory of options!.fallbackDirectories) {
        pushDirectory(directory);
      }
    }

    pushDirectory(undefined);

    return candidates;
  }

  // 响应权限请求
  async respondToPermission(
    sessionId: string,
    permissionId: string,
    allow: boolean,
    remember: boolean = false,
    options?: PermissionResponseOptions
  ): Promise<{ ok: boolean; expired?: boolean }> {
    const responseType = allow ? (remember ? 'always' : 'once') : 'reject';
    const directoryCandidates = this.buildPermissionDirectoryCandidates(options);

    for (const directory of directoryCandidates) {
      try {
        const query = directory ? `?directory=${encodeURIComponent(directory)}` : '';
        const response = await fetch(
          `${opencodeConfig.baseUrl}/session/${sessionId}/permissions/${permissionId}${query}`,
          {
            method: 'POST',
            headers: withOpencodeAuthorizationHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              response: responseType,
            }),
          }
        );

        if (response.ok) {
          return { ok: true };
        }

        // 检查是否为过期错误（404 或特定错误信息）
        if (response.status === 404) {
          console.warn(`[OpenCode] 权限请求已过期: session=${sessionId}, permission=${permissionId}`);
          return { ok: false, expired: true };
        }

        const detail = await response.text().catch(() => '');
        const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
        const message = appendAuthHint(
          `权限响应失败（HTTP ${response.status} ${response.statusText}）${suffix}`,
          response.status
        );
        const directoryLabel = directory ? `directory=${directory}` : 'directory=<default>';
        console.error(`[OpenCode] ${message} (${directoryLabel})`);
      } catch (error) {
        const directoryLabel = directory ? `directory=${directory}` : 'directory=<default>';
        console.error(`[OpenCode] 响应权限失败 (${directoryLabel}):`, error);
      }
    }

    return { ok: false };
  }

  // 回复问题 (question 工具)
  // answers 是一个二维数组: [[第一个问题的答案们], [第二个问题的答案们], ...]
  // 每个答案是选项的 label
  async replyQuestion(
    requestId: string,
    answers: string[][]
  ): Promise<{ ok: boolean; expired?: boolean }> {
    try {
      const response = await fetch(
        `${opencodeConfig.baseUrl}/question/${requestId}/reply`,
        {
          method: 'POST',
          headers: withOpencodeAuthorizationHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ answers }),
        }
      );
      if (!response.ok) {
        // 检查是否为过期错误
        if (response.status === 404) {
          console.warn(`[OpenCode] 问题请求已过期: requestId=${requestId}`);
          return { ok: false, expired: true };
        }
        const detail = await response.text().catch(() => '');
        const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
        const message = appendAuthHint(
          `回复问题失败（HTTP ${response.status} ${response.statusText}）${suffix}`,
          response.status
        );
        console.error(`[OpenCode] ${message}`);
      }
      return { ok: response.ok };
    } catch (error) {
      console.error('[OpenCode] 回复问题失败:', error);
      return { ok: false };
    }
  }

  // 拒绝/跳过问题
  async rejectQuestion(requestId: string): Promise<{ ok: boolean; expired?: boolean }> {
    try {
      const response = await fetch(
        `${opencodeConfig.baseUrl}/question/${requestId}/reject`,
        {
          method: 'POST',
          headers: withOpencodeAuthorizationHeaders({ 'Content-Type': 'application/json' }),
        }
      );
      if (!response.ok) {
        // 检查是否为过期错误
        if (response.status === 404) {
          console.warn(`[OpenCode] 问题请求已过期: requestId=${requestId}`);
          return { ok: false, expired: true };
        }
        const detail = await response.text().catch(() => '');
        const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
        const message = appendAuthHint(
          `拒绝问题失败（HTTP ${response.status} ${response.statusText}）${suffix}`,
          response.status
        );
        console.error(`[OpenCode] ${message}`);
      }
      return { ok: response.ok };
    } catch (error) {
      console.error('[OpenCode] 拒绝问题失败:', error);
      return { ok: false };
    }
  }
}
