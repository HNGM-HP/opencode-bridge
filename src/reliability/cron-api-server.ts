import http from 'node:http';
import { URL } from 'node:url';
import {
  RuntimeCronManager,
  type AddRuntimeCronJobInput,
  type UpdateRuntimeCronJobInput,
} from './runtime-cron.js';

export interface CronApiServerOptions {
  host: string;
  port: number;
  token?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface CronApiServer {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const MAX_BODY_BYTES = 256 * 1024;

export function createCronApiServer(manager: RuntimeCronManager, options: CronApiServerOptions): CronApiServer {
  const logger = options.logger ?? console;
  const token = options.token?.trim();

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || 'GET';
      const requestUrl = new URL(req.url || '/', `http://${options.host}:${options.port}`);

      if (token && !isAuthorized(req, token)) {
        writeJson(res, 401, {
          ok: false,
          error: 'unauthorized',
        });
        return;
      }

      if (method === 'GET' && requestUrl.pathname === '/cron/list') {
        writeJson(res, 200, {
          ok: true,
          jobs: manager.listJobs(),
        });
        return;
      }

      if (method === 'POST' && requestUrl.pathname === '/cron/add') {
        const payload = await readJsonBody(req);
        const input = parseAddInput(payload);
        const job = manager.addJob(input);
        writeJson(res, 200, {
          ok: true,
          job,
        });
        return;
      }

      if (method === 'POST' && requestUrl.pathname === '/cron/remove') {
        const payload = await readJsonBody(req);
        const id = typeof payload.id === 'string' ? payload.id.trim() : '';
        if (!id) {
          writeJson(res, 400, { ok: false, error: 'id is required' });
          return;
        }

        const removed = manager.removeJob(id);
        writeJson(res, 200, {
          ok: true,
          removed,
          id,
        });
        return;
      }

      if (method === 'POST' && requestUrl.pathname === '/cron/update') {
        const payload = await readJsonBody(req);
        const input = parseUpdateInput(payload);
        if (!input || typeof input.id !== 'string' || !input.id.trim()) {
          writeJson(res, 400, { ok: false, error: 'id is required' });
          return;
        }

        const job = manager.updateJob(input);
        writeJson(res, 200, {
          ok: true,
          job,
        });
        return;
      }

      writeJson(res, 404, {
        ok: false,
        error: 'not_found',
      });
    } catch (error) {
      writeJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    start: async () => {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, () => {
          server.off('error', reject);
          resolve();
        });
      });
      logger.info(`[RuntimeCronAPI] listening at http://${options.host}:${options.port}`);
    },
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      logger.info('[RuntimeCronAPI] stopped');
    },
  };
}

function isAuthorized(req: http.IncomingMessage, token: string): boolean {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return false;
  }

  const matched = authorization.match(/^Bearer\s+(.+)$/i);
  if (!matched) {
    return false;
  }
  return matched[1] === token;
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('payload too large');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf-8').trim();
  if (!text) {
    return {};
  }

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid json body');
  }
  return parsed as Record<string, unknown>;
}

function writeJson(res: http.ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  const content = `${JSON.stringify(payload)}\n`;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(content));
  res.end(content);
}

function parseAddInput(payload: Record<string, unknown>): AddRuntimeCronJobInput {
  const name = toTrimmedString(payload.name);
  if (!name) {
    throw new Error('name is required');
  }

  const schedule = parseSchedule(payload.schedule);
  const eventPayload = parsePayload(payload.payload);
  const id = toTrimmedString(payload.id);
  const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : undefined;
  return {
    ...(id ? { id } : {}),
    name,
    schedule,
    payload: eventPayload,
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
  };
}

function parseUpdateInput(payload: Record<string, unknown>): UpdateRuntimeCronJobInput {
  const id = toTrimmedString(payload.id);
  if (!id) {
    throw new Error('id is required');
  }

  const next: UpdateRuntimeCronJobInput = { id };
  const name = toTrimmedString(payload.name);
  if (name) {
    next.name = name;
  }

  if ('schedule' in payload) {
    next.schedule = parseSchedule(payload.schedule);
  }

  if ('payload' in payload) {
    next.payload = parsePayload(payload.payload);
  }

  if (typeof payload.enabled === 'boolean') {
    next.enabled = payload.enabled;
  }

  return next;
}

function parseSchedule(value: unknown): { kind: 'cron'; expr: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('schedule is required');
  }

  const record = value as Record<string, unknown>;
  const kind = toTrimmedString(record.kind);
  const expr = toTrimmedString(record.expr);
  if (kind !== 'cron' || !expr) {
    throw new Error('schedule must be { kind: "cron", expr: "..." }');
  }

  return {
    kind: 'cron',
    expr,
  };
}

function parsePayload(value: unknown): {
  kind: 'systemEvent';
  text: string;
  sessionId?: string;
  directory?: string;
  agent?: string;
  delivery?: {
    platform: 'feishu' | 'discord';
    conversationId: string;
    creatorId?: string;
    fallbackConversationId?: string;
  };
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('payload is required');
  }

  const record = value as Record<string, unknown>;
  const kind = toTrimmedString(record.kind);
  const text = toTrimmedString(record.text);
  if (kind !== 'systemEvent' || !text) {
    throw new Error('payload must be { kind: "systemEvent", text: "..." }');
  }

  const sessionId = toTrimmedString(record.sessionId);
  const directory = toTrimmedString(record.directory);
  const agent = toTrimmedString(record.agent);
  const delivery = parseDelivery(record.delivery);
  return {
    kind: 'systemEvent',
    text,
    ...(sessionId ? { sessionId } : {}),
    ...(directory ? { directory } : {}),
    ...(agent ? { agent } : {}),
    ...(delivery ? { delivery } : {}),
  };
}

function parseDelivery(value: unknown): {
  platform: 'feishu' | 'discord';
  conversationId: string;
  creatorId?: string;
  fallbackConversationId?: string;
} | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('delivery must be an object');
  }

  const record = value as Record<string, unknown>;
  const platform = toTrimmedString(record.platform);
  const conversationId = toTrimmedString(record.conversationId);
  if ((platform !== 'feishu' && platform !== 'discord') || !conversationId) {
    throw new Error('delivery must include platform and conversationId');
  }

  const creatorId = toTrimmedString(record.creatorId);
  const fallbackConversationId = toTrimmedString(record.fallbackConversationId);
  return {
    platform,
    conversationId,
    ...(creatorId ? { creatorId } : {}),
    ...(fallbackConversationId ? { fallbackConversationId } : {}),
  };
}

function toTrimmedString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}
