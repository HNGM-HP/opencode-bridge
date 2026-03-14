import fs from 'node:fs';
import path from 'node:path';

export interface HeartbeatAgentClient {
  createSession: (title?: string, directory?: string) => Promise<{ id: string }>;
  getSessionById: (sessionId: string, options?: { directory?: string }) => Promise<{ id: string } | null>;
  sendMessage: (
    sessionId: string,
    text: string,
    options?: {
      agent?: string;
      directory?: string;
      providerId?: string;
      modelId?: string;
      variant?: string;
    }
  ) => Promise<{ parts: unknown[] }>;
}

export interface ProactiveHeartbeatRunnerOptions {
  enabled: boolean;
  intervalMs: number;
  prompt: string;
  checklistPath?: string;
  sessionStatePath?: string;
  sessionTitle?: string;
  directory?: string;
  agent?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  client: HeartbeatAgentClient;
  notifyAlert?: (text: string) => Promise<void>;
}

export interface ProactiveHeartbeatRunner {
  start: () => void;
  stop: () => Promise<void>;
  runNow: () => Promise<void>;
}

interface HeartbeatSessionState {
  sessionId: string;
  updatedAtMs: number;
}

const DEFAULT_PROMPT = 'Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.';

export function createProactiveHeartbeatRunner(options: ProactiveHeartbeatRunnerOptions): ProactiveHeartbeatRunner {
  const logger = options.logger ?? console;
  const checklistPath = options.checklistPath ?? path.join(process.cwd(), 'HEARTBEAT.md');
  const sessionStatePath = options.sessionStatePath ?? path.join(process.cwd(), 'memory', 'heartbeat-session.json');
  const sessionTitle = options.sessionTitle?.trim() || 'Bridge Heartbeat Monitor';
  const prompt = options.prompt?.trim() || DEFAULT_PROMPT;
  const intervalMs = options.intervalMs > 0 ? options.intervalMs : 30 * 60 * 1000;
  const agent = options.agent?.trim();
  const directory = options.directory?.trim();

  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let closed = false;

  const runNow = async (): Promise<void> => {
    if (!options.enabled || closed) {
      return;
    }

    if (running) {
      logger.info('[Heartbeat] proactive tick skipped: previous run still active');
      return;
    }

    running = true;
    try {
      if (!fs.existsSync(checklistPath)) {
        logger.warn(`[Heartbeat] checklist not found, continue with prompt contract: ${checklistPath}`);
      }

      const sessionId = await ensureSessionId();
      const response = await options.client.sendMessage(sessionId, prompt, {
        ...(agent ? { agent } : {}),
        ...(directory ? { directory } : {}),
      });
      const text = extractText(response.parts).trim();
      if (isHeartbeatOk(text)) {
        logger.info('[Heartbeat] proactive heartbeat ack: HEARTBEAT_OK');
        return;
      }

      const alert = text || 'Heartbeat run completed without HEARTBEAT_OK marker.';
      logger.warn(`[Heartbeat] proactive alert: ${alert.slice(0, 300)}`);
      if (options.notifyAlert) {
        await options.notifyAlert(alert);
      }
    } catch (error) {
      logger.error('[Heartbeat] proactive heartbeat failed:', error);
      if (options.notifyAlert) {
        const message = error instanceof Error ? error.message : String(error);
        await options.notifyAlert(`Heartbeat proactive run failed: ${message}`);
      }
    } finally {
      running = false;
    }
  };

  return {
    start: (): void => {
      if (!options.enabled || closed || timer) {
        return;
      }
      timer = setInterval(() => {
        void runNow();
      }, intervalMs);
      logger.info(`[Heartbeat] proactive runner started (intervalMs=${intervalMs})`);
    },
    stop: async (): Promise<void> => {
      closed = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      while (running) {
        await wait(50);
      }
      logger.info('[Heartbeat] proactive runner stopped');
    },
    runNow,
  };

  async function ensureSessionId(): Promise<string> {
    const state = readSessionState(sessionStatePath);
    if (state?.sessionId) {
      const exists = await options.client.getSessionById(state.sessionId, directory ? { directory } : undefined);
      if (exists) {
        return state.sessionId;
      }
    }

    const created = await options.client.createSession(sessionTitle, directory);
    const nextState: HeartbeatSessionState = {
      sessionId: created.id,
      updatedAtMs: Date.now(),
    };
    writeSessionState(sessionStatePath, nextState);
    return created.id;
  }
}

function extractText(parts: unknown[]): string {
  const fragments: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) {
      fragments.push(record.text.trim());
    }
  }
  return fragments.join('\n').trim();
}

function isHeartbeatOk(text: string): boolean {
  return /^HEARTBEAT_OK(\b|$)/i.test(text.trim());
}

function readSessionState(filePath: string): HeartbeatSessionState | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
    if (!sessionId) {
      return null;
    }
    return {
      sessionId,
      updatedAtMs: typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : 0,
    };
  } catch (error) {
    console.error('[proactive-heartbeat] readSessionState failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function writeSessionState(filePath: string, state: HeartbeatSessionState): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}
