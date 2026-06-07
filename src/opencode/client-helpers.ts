import fs from 'node:fs/promises';
import path from 'node:path';
import { opencodeConfig } from '../config.js';
import type { AgentMode } from './client.js';

export const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');

export interface PermissionEventProperties {
  sessionID?: string;
  sessionId?: string;
  session_id?: string;
  id?: string;
  requestId?: string;
  requestID?: string;
  request_id?: string;
  permissionId?: string;
  permissionID?: string;
  permission_id?: string;
  tool?: unknown;
  permission?: unknown;
  description?: string;
  risk?: string;
  metadata?: Record<string, unknown>;
}

export type PermissionCorrelation = {
  parentSessionId?: string;
  relatedSessionId?: string;
  messageId?: string;
  callId?: string;
};

export type DirectoryEventStreamEntry = {
  controller: AbortController;
  active: boolean;
  reconnectTimer: NodeJS.Timeout | null;
};

export function getPermissionLabel(props: PermissionEventProperties): string {
  if (typeof props.permission === 'string' && props.permission.trim()) {
    return props.permission;
  }

  if (typeof props.tool === 'string' && props.tool.trim()) {
    return props.tool;
  }

  if (props.tool && typeof props.tool === 'object') {
    const toolObj = props.tool as Record<string, unknown>;
    if (typeof toolObj.name === 'string' && toolObj.name.trim()) {
      return toolObj.name;
    }
  }

  return 'unknown';
}

export function getFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function getFirstStringFromRecord(record: Record<string, unknown> | undefined, keys: string[]): string {
  if (!record) {
    return '';
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

export function extractPermissionCorrelation(props: PermissionEventProperties): PermissionCorrelation {
  const propsRecord = props as Record<string, unknown>;
  const toolRecord = toRecord(props.tool);
  const metadataRecord = toRecord(props.metadata);

  const parentSessionId = getFirstString(
    getFirstStringFromRecord(propsRecord, ['parentSessionID', 'parentSessionId', 'parent_session_id']),
    getFirstStringFromRecord(toolRecord, ['parentSessionID', 'parentSessionId', 'parent_session_id']),
    getFirstStringFromRecord(metadataRecord, ['parentSessionID', 'parentSessionId', 'parent_session_id'])
  );

  const relatedSessionId = getFirstString(
    getFirstStringFromRecord(propsRecord, [
      'originSessionID',
      'originSessionId',
      'origin_session_id',
      'rootSessionID',
      'rootSessionId',
      'root_session_id',
      'sourceSessionID',
      'sourceSessionId',
      'source_session_id',
    ]),
    getFirstStringFromRecord(toolRecord, [
      'originSessionID',
      'originSessionId',
      'origin_session_id',
      'rootSessionID',
      'rootSessionId',
      'root_session_id',
      'sourceSessionID',
      'sourceSessionId',
      'source_session_id',
    ]),
    getFirstStringFromRecord(metadataRecord, [
      'originSessionID',
      'originSessionId',
      'origin_session_id',
      'rootSessionID',
      'rootSessionId',
      'root_session_id',
      'sourceSessionID',
      'sourceSessionId',
      'source_session_id',
    ])
  );

  const messageId = getFirstString(
    getFirstStringFromRecord(propsRecord, ['messageID', 'messageId', 'message_id']),
    getFirstStringFromRecord(toolRecord, ['messageID', 'messageId', 'message_id']),
    getFirstStringFromRecord(metadataRecord, ['messageID', 'messageId', 'message_id'])
  );

  const callId = getFirstString(
    getFirstStringFromRecord(propsRecord, ['callID', 'callId', 'call_id', 'toolCallID', 'toolCallId', 'tool_call_id']),
    getFirstStringFromRecord(toolRecord, ['callID', 'callId', 'call_id', 'toolCallID', 'toolCallId', 'tool_call_id']),
    getFirstStringFromRecord(metadataRecord, ['callID', 'callId', 'call_id', 'toolCallID', 'toolCallId', 'tool_call_id'])
  );

  return {
    ...(parentSessionId ? { parentSessionId } : {}),
    ...(relatedSessionId ? { relatedSessionId } : {}),
    ...(messageId ? { messageId } : {}),
    ...(callId ? { callId } : {}),
  };
}

export function isPermissionRequestEventType(eventType: string): boolean {
  const normalized = eventType.toLowerCase();
  if (!normalized.includes('permission')) {
    return false;
  }

  if (
    normalized.includes('replied') ||
    normalized.includes('reply') ||
    normalized.includes('granted') ||
    normalized.includes('denied') ||
    normalized.includes('resolved')
  ) {
    return false;
  }

  return (
    normalized.includes('request') ||
    normalized.includes('asked') ||
    normalized.includes('require') ||
    normalized.includes('pending')
  );
}

export function formatSdkError(error: unknown): string {
  if (!error) return '未知错误';

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message;
    }
    try {
      return JSON.stringify(record);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

export function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}

export function parseAgentMode(value: unknown): AgentMode | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'primary' || normalized === 'subagent' || normalized === 'all') {
    return normalized;
  }
  return undefined;
}

export function buildOpencodeAuthorizationHeaderValue(): string | undefined {
  const password = opencodeConfig.serverPassword;
  if (!password) {
    return undefined;
  }

  const username = opencodeConfig.serverUsername || 'opencode';
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

export function withOpencodeAuthorizationHeaders(headers?: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {
    ...(headers || {}),
  };
  const authorization = buildOpencodeAuthorizationHeaderValue();
  if (authorization) {
    merged.Authorization = authorization;
  }
  return merged;
}

export function isUnauthorizedStatusCode(statusCode?: number): boolean {
  return statusCode === 401 || statusCode === 403;
}

export function buildAuthEnvHint(): string {
  return '请检查 OPENCODE_SERVER_USERNAME / OPENCODE_SERVER_PASSWORD 是否与 OpenCode 服务端一致';
}

export function appendAuthHint(message: string, statusCode?: number): string {
  if (!isUnauthorizedStatusCode(statusCode)) {
    return message;
  }
  return `${message}；${buildAuthEnvHint()}`;
}

export function extractLocalUploadFilename(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }

  if (!pathname.startsWith('/uploads/')) {
    return null;
  }

  const filename = path.basename(pathname);
  return filename && filename !== '.' && filename !== '..' ? filename : null;
}

export async function inlineLocalUploadParts(
  parts: Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; url: string; filename?: string }>
): Promise<Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; url: string; filename?: string }>> {
  return Promise.all(parts.map(async part => {
    if (part.type !== 'file') {
      return part;
    }

    const filename = extractLocalUploadFilename(part.url);
    if (!filename) {
      return part;
    }

    const filePath = path.join(LOCAL_UPLOAD_DIR, filename);
    const buffer = await fs.readFile(filePath);
    const mime = part.mime || 'application/octet-stream';

    return {
      ...part,
      url: `data:${mime};base64,${buffer.toString('base64')}`,
    };
  }));
}
