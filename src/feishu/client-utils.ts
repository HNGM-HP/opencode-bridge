/**
 * FeishuClient 工具函数
 * 
 * 从 client.ts 提取的独立工具函数和类型定义。
 * 不依赖 FeishuClient 类实例。
 */
import * as lark from '@larksuiteoapi/node-sdk';

export function formatError(error: unknown): { message: string; responseData?: unknown } {
  if (error instanceof Error) {
    const responseData = typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { data?: unknown } }).response?.data
      : undefined;
    return { message: `${error.name}: ${error.message}`, responseData };
  }

  const responseData = typeof error === 'object' && error !== null && 'response' in error
    ? (error as { response?: { data?: unknown } }).response?.data
    : undefined;

  let message = '';
  try {
    message = JSON.stringify(error);
  } catch {
    message = String(error);
  }

  return { message, responseData };
}

export function extractApiCode(responseData: unknown): number | undefined {
  if (!responseData || typeof responseData !== 'object') return undefined;
  const value = (responseData as { code?: unknown }).code;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function stringifyErrorPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function isUniversalCardBuildFailure(responseData: unknown): boolean {
  const apiCode = extractApiCode(responseData);
  if (apiCode === 230099) {
    return true;
  }

  const text = stringifyErrorPayload(responseData).toLowerCase();
  return text.includes('230099')
    || text.includes('200800')
    || text.includes('create universal card fail');
}

// 检查是否为 completion 对象未找到错误（230001）
export function isCompletionNotFoundError(responseData: unknown): boolean {
  const apiCode = extractApiCode(responseData);
  return apiCode === 230001;
}

// 检查是否为可重试的错误（网络错误、5xx 服务端错误）
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // 网络错误（无响应）
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('timeout')
    ) {
      return true;
    }
  }

  // 检查 HTTP 状态码
  const record = error as Record<string, unknown>;
  const statusCode =
    typeof record.code === 'number' ? record.code :
    typeof (error as { response?: { status?: number } }).response?.status === 'number'
      ? (error as { response: { status: number } }).response.status
      : undefined;

  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // 检查 responseData 中的 code
  const responseData = typeof record.response === 'object' && record.response !== null
    ? (record.response as Record<string, unknown>).data
    : undefined;
  const apiCode = extractApiCode(responseData);
  if (apiCode && apiCode >= 500000 && apiCode < 600000) {
    return true;
  }

  return false;
}

// 重试配置
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

// 通用重试工具函数
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 最后一次尝试不再等待
      if (attempt === options.maxAttempts - 1) {
        break;
      }

      // 只对可重试的错误进行重试
      if (!isRetryableError(error)) {
        break;
      }

      // 指数退避
      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt),
        options.maxDelayMs
      );

      console.warn(`[飞书] 操作失败，${delay}ms 后重试（第 ${attempt + 1}/${options.maxAttempts} 次）`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// 连接状态类型
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export function buildFallbackInteractiveCard(sourceCard: object): object {
  const cardRecord = sourceCard as {
    header?: {
      title?: { content?: unknown };
      template?: unknown;
    };
  };
  const rawTitle = cardRecord.header?.title?.content;
  const title = typeof rawTitle === 'string' && rawTitle.trim()
    ? rawTitle.trim().slice(0, 60)
    : 'OpenCode 输出（已精简）';
  const rawTemplate = cardRecord.header?.template;
  const template = typeof rawTemplate === 'string' && rawTemplate.trim()
    ? rawTemplate.trim()
    : 'blue';

  return {
    schema: '2.0',
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: title,
      },
      template,
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: '⚠️ 卡片内容过长或结构超限，已自动精简显示。\n请在 OpenCode Web 查看完整输出。',
        },
      ],
    },
  };
}

// 飞书事件数据类型（SDK 未导出，手动定义）
export interface FeishuEventData {
  event_id?: string;
  token?: string;
  create_time?: string;
  event_type?: string;
  tenant_key?: string;
  ts?: string;
  uuid?: string;
  type?: string;
  app_id?: string;
  sender: {
    sender_id?: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    update_time?: string;
    chat_id: string;
    thread_id?: string;
    chat_type: string;
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: {
        union_id?: string;
        user_id?: string;
        open_id?: string;
      };
      name: string;
      tenant_key?: string;
    }>;
    user_agent?: string;
  };
}

// 消息事件类型
export interface FeishuMessageEvent {
  messageId: string;
  chatId: string;
  threadId?: string;
  chatType: 'p2p' | 'group';
  senderId: string;
  senderType: 'user' | 'bot';
  content: string;
  msgType: string;
  attachments?: FeishuAttachment[];
  mentions?: Array<{ key: string; id: { open_id: string }; name: string }>;
  rawEvent: FeishuEventData;
}

export interface FeishuAttachment {
  type: 'image' | 'file';
  fileKey: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function collectAttachmentsFromContent(content: unknown): FeishuAttachment[] {
  if (!content || typeof content !== 'object') return [];
  const attachments: FeishuAttachment[] = [];
  const visited = new Set<object>();
  const stack: unknown[] = [content];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current as object)) continue;
    visited.add(current as object);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const record = current as Record<string, unknown>;
    const imageKey = getString(record.image_key) || getString(record.imageKey);
    if (imageKey) {
      attachments.push({ type: 'image', fileKey: imageKey });
    }

    const fileKey = getString(record.file_key) || getString(record.fileKey);
    if (fileKey) {
      attachments.push({
        type: 'file',
        fileKey,
        fileName: getString(record.file_name) || getString(record.fileName),
        fileType: getString(record.file_type) || getString(record.fileType),
        fileSize: getNumber(record.file_size) || getNumber(record.fileSize),
      });
    }

    for (const value of Object.values(record)) {
      stack.push(value);
    }
  }

  return attachments;
}

export function extractTextFromPost(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const record = content as { content?: unknown; title?: unknown };
  const parts: string[] = [];
  const root = record.content;
  if (!root) return '';
  const stack: unknown[] = [root];
  const visited = new Set<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current as object)) continue;
    visited.add(current as object);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const node = current as Record<string, unknown>;
    const tag = getString(node.tag);
    if ((tag === 'text' || tag === 'a') && typeof node.text === 'string') {
      parts.push(node.text);
    }

    for (const value of Object.values(node)) {
      stack.push(value);
    }
  }

  return parts.join('');
}

// 卡片动作事件类型
export interface FeishuCardActionEvent {
  openId: string;
  action: {
    tag: string;
    value: Record<string, unknown>;
  };
  token: string;
  messageId?: string;
  chatId?: string;
  threadId?: string;
  rawEvent: unknown;
}

export type FeishuCardActionResponse = object;

