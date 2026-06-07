import type { OpencodeClient as SdkOpencodeClient } from '@opencode-ai/sdk';
import type { PermissionRequestEvent } from './client.js';
import {
  type PermissionEventProperties,
  type DirectoryEventStreamEntry,
  getPermissionLabel,
  getFirstString,
  extractPermissionCorrelation,
  isPermissionRequestEventType,
} from './client-helpers.js';

export interface EventStreamManagerDeps {
  getClient: () => SdkOpencodeClient | null;
  emitEvent: (type: string, event: unknown) => void;
}

export class EventStreamManager {
  private eventAbortController: AbortController | null = null;
  private eventReconnectTimer: NodeJS.Timeout | null = null;
  private eventReconnectAttempt = 0;
  private eventListeningEnabled = false;
  private eventStreamActive = false;
  private directoryEventStreams: Map<string, DirectoryEventStreamEntry> = new Map();
  private pendingDirectoryStreams: Map<string, Promise<void>> = new Map();

  constructor(private deps: EventStreamManagerDeps) {}

  // ── public accessors ──────────────────────────────────────────

  setListeningEnabled(v: boolean): void {
    this.eventListeningEnabled = v;
  }

  resetReconnectAttempt(): void {
    this.eventReconnectAttempt = 0;
  }

  isActive(): boolean {
    return this.eventStreamActive;
  }

  setActive(v: boolean): void {
    this.eventStreamActive = v;
  }

  // ── event reconnect ────────────────────────────────────────────

  clearReconnectTimer(): void {
    if (this.eventReconnectTimer) {
      clearTimeout(this.eventReconnectTimer);
      this.eventReconnectTimer = null;
    }
  }

  scheduleReconnect(reason: string): void {
    if (!this.eventListeningEnabled || !this.deps.getClient()) {
      return;
    }

    if (this.eventReconnectTimer) {
      return;
    }

    const maxBackoffMs = 15000;
    const baseBackoffMs = 2000;
    const step = Math.min(this.eventReconnectAttempt, 4);
    const delay = Math.min(baseBackoffMs * Math.pow(2, step), maxBackoffMs);
    this.eventReconnectAttempt += 1;

    console.warn(`[OpenCode] ${reason}，将在 ${Math.round(delay / 1000)} 秒后重连事件流（第 ${this.eventReconnectAttempt} 次）`);
    this.eventReconnectTimer = setTimeout(() => {
      this.eventReconnectTimer = null;
      void this.start();
    }, delay);
  }

  // ── directory event reconnect ──────────────────────────────────

  clearDirectoryEventReconnectTimer(directory: string): void {
    const entry = this.directoryEventStreams.get(directory);
    if (!entry || !entry.reconnectTimer) {
      return;
    }
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }

  scheduleDirectoryEventReconnect(directory: string, reason: string): void {
    if (!this.eventListeningEnabled || !this.deps.getClient()) {
      return;
    }

    const entry = this.directoryEventStreams.get(directory);
    if (!entry || entry.reconnectTimer) {
      return;
    }

    const delay = 3000;
    console.warn(`[OpenCode] ${reason}，将在 ${Math.round(delay / 1000)} 秒后重连目录事件流: ${directory}`);
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      void this.ensureDirectoryEventStream(directory);
    }, delay);
  }

  // ── directory event stream ─────────────────────────────────────

  async ensureDirectoryEventStream(directory: string): Promise<void> {
    if (!this.deps.getClient() || !this.eventListeningEnabled) {
      return;
    }

    const normalizedDirectory = directory.trim();
    if (!normalizedDirectory) {
      return;
    }

    // 防竞态：同一目录正在建立连接时，等待而非重复创建
    const pending = this.pendingDirectoryStreams.get(normalizedDirectory);
    if (pending) {
      await pending;
      return;
    }

    const promise = this._createDirectoryEventStream(normalizedDirectory);
    this.pendingDirectoryStreams.set(normalizedDirectory, promise);
    try {
      await promise;
    } finally {
      this.pendingDirectoryStreams.delete(normalizedDirectory);
    }
  }

  private async _createDirectoryEventStream(normalizedDirectory: string): Promise<void> {
    const existing = this.directoryEventStreams.get(normalizedDirectory);
    if (existing?.active) {
      return;
    }

    if (existing) {
      this.clearDirectoryEventReconnectTimer(normalizedDirectory);
      existing.controller.abort();
    }

    const controller = new AbortController();
    this.directoryEventStreams.set(normalizedDirectory, {
      controller,
      active: true,
      reconnectTimer: null,
    });

    try {
      const events = await this.deps.getClient()!.event.subscribe({
        query: { directory: normalizedDirectory },
      });
      console.log(`[OpenCode] 目录事件流订阅成功: ${normalizedDirectory}`);

      (async () => {
        try {
          for await (const event of events.stream) {
            if (controller.signal.aborted || !this.eventListeningEnabled) {
              break;
            }

            if (event.type.toLowerCase().includes('permission')) {
              console.log(`[OpenCode] 目录事件: ${event.type}`, JSON.stringify(event.properties || {}).slice(0, 1200));
            }

            this.handleEvent(event);
          }

          if (!controller.signal.aborted && this.eventListeningEnabled) {
            const entry = this.directoryEventStreams.get(normalizedDirectory);
            if (entry) {
              entry.active = false;
            }
            this.scheduleDirectoryEventReconnect(normalizedDirectory, '目录事件流已结束');
          }
        } catch (error) {
          if (!controller.signal.aborted && this.eventListeningEnabled) {
            console.error(`[OpenCode] 目录事件流中断: ${normalizedDirectory}`, error);
            const entry = this.directoryEventStreams.get(normalizedDirectory);
            if (entry) {
              entry.active = false;
            }
            this.scheduleDirectoryEventReconnect(normalizedDirectory, '目录事件流中断');
          }
        }
      })();
    } catch (error) {
      console.error(`[OpenCode] 目录事件流订阅失败: ${normalizedDirectory}`, error);
      // 先清理可能存在的重连定时器，再删除条目，防止僵尸 timer 继续触发
      this.clearDirectoryEventReconnectTimer(normalizedDirectory);
      this.directoryEventStreams.delete(normalizedDirectory);
    }
  }

  // ── main event stream ──────────────────────────────────────────

  async start(): Promise<void> {
    if (!this.deps.getClient() || !this.eventListeningEnabled) return;
    if (this.eventStreamActive) return;

    this.eventStreamActive = true;
    this.clearReconnectTimer();

    const controller = new AbortController();
    if (this.eventAbortController) {
      this.eventAbortController.abort();
    }
    this.eventAbortController = controller;

    try {
      const events = await this.deps.getClient()!.event.subscribe();
      console.log('[OpenCode] 事件流订阅成功');
      this.eventReconnectAttempt = 0;

      // 异步处理事件流
      (async () => {
        try {
          for await (const event of events.stream) {
            if (controller.signal.aborted || !this.eventListeningEnabled) {
              break;
            }

            // Debug log for permission requests to catch missing ones
            if (event.type.toLowerCase().includes('permission')) {
              console.log(`[OpenCode] 收到底层事件: ${event.type}`, JSON.stringify(event.properties || {}).slice(0, 1200));
            }
            this.handleEvent(event);
          }

          if (!controller.signal.aborted && this.eventListeningEnabled) {
            this.scheduleReconnect('事件流已结束');
          }
        } catch (error) {
          if (!controller.signal.aborted && this.eventListeningEnabled) {
            console.error('[OpenCode] 事件流中断:', error);
            this.scheduleReconnect('事件流中断');
          }
        } finally {
          if (this.eventAbortController === controller) {
            this.eventAbortController = null;
          }
          this.eventStreamActive = false;
        }
      })();
    } catch (error) {
      console.error('[OpenCode] 无法订阅事件:', error);
      this.eventStreamActive = false;
      if (!controller.signal.aborted && this.eventListeningEnabled) {
        this.scheduleReconnect('订阅失败');
      }
    }
  }

  // ── event handler ──────────────────────────────────────────────

  // Private in spirit — only exposed for OpencodeClientWrapper delegation
  handleEvent(event: { type: string; properties?: Record<string, unknown> }): void {
    const eventType = event.type.toLowerCase();
    // 权限请求事件（兼容不同事件命名）
    if (isPermissionRequestEventType(eventType) && event.properties) {
      const props = event.properties as PermissionEventProperties;
      const correlation = extractPermissionCorrelation(props);
      const directSessionId = getFirstString(props.sessionID, props.sessionId, props.session_id);
      const sessionId = getFirstString(
        directSessionId,
        correlation.relatedSessionId,
        correlation.parentSessionId
      );

      const permissionEvent: PermissionRequestEvent = {
        sessionId,
        permissionId: getFirstString(
          props.id,
          props.requestId,
          props.requestID,
          props.request_id,
          props.permissionId,
          props.permissionID,
          props.permission_id
        ),
        // permission.asked 的 tool 常为对象（messageID/callID），显示/判断应优先用 permission
        tool: getPermissionLabel(props),
        // If description is missing, try to construct one from metadata
        description: props.description || (props.metadata ? JSON.stringify(props.metadata) : ''),
        risk: props.risk,
        ...(correlation.parentSessionId ? { parentSessionId: correlation.parentSessionId } : {}),
        ...(correlation.relatedSessionId ? { relatedSessionId: correlation.relatedSessionId } : {}),
        ...(correlation.messageId ? { messageId: correlation.messageId } : {}),
        ...(correlation.callId ? { callId: correlation.callId } : {}),
      };

      if (!permissionEvent.sessionId || !permissionEvent.permissionId) {
        console.warn('[OpenCode] 权限事件缺少关键字段:', event.type, JSON.stringify(event.properties || {}).slice(0, 1200));
        return;
      }

      this.deps.emitEvent('permissionRequest', permissionEvent);
    }

    // 消息更新事件
    if (event.type === 'message.updated' && event.properties) {
      this.deps.emitEvent('messageUpdated', event.properties);
    }

    // 会话状态变化事件
    if (event.type === 'session.status' && event.properties) {
      this.deps.emitEvent('sessionStatus', event.properties);
    }

    // 会话空闲事件（处理完成）
    if (event.type === 'session.idle' && event.properties) {
      this.deps.emitEvent('sessionIdle', event.properties);
    }

    // 会话错误事件
    if (event.type === 'session.error' && event.properties) {
      this.deps.emitEvent('sessionError', event.properties);
    }

    // 消息部分更新事件（流式输出）
    if (event.type === 'message.part.updated' && event.properties) {
      this.deps.emitEvent('messagePartUpdated', event.properties);
    }

    // AI 提问事件
    if (event.type === 'question.asked' && event.properties) {
      this.deps.emitEvent('questionAsked', event.properties);
    }
  }

  // ── disconnect ─────────────────────────────────────────────────

  disconnect(): void {
    this.eventListeningEnabled = false;
    this.eventStreamActive = false;
    this.clearReconnectTimer();
    this.eventReconnectAttempt = 0;
    if (this.eventAbortController) {
      this.eventAbortController.abort();
      this.eventAbortController = null;
    }
    for (const [directory, entry] of this.directoryEventStreams) {
      this.clearDirectoryEventReconnectTimer(directory);
      entry.controller.abort();
    }
    this.directoryEventStreams.clear();
  }
}
