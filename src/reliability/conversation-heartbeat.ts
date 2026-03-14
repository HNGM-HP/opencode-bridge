import fs from 'node:fs';
import path from 'node:path';
import { FailureType } from './types.js';

export interface HeartbeatCheckDefinition {
  id: FailureType;
  description: string;
}

export interface HeartbeatState {
  lastRunAt: number;
  lastWindowKey: string;
  lastExecutedCheckIds: string[];
  updatedAt: number;
}

export interface ConversationHeartbeatResult {
  executed: boolean;
  reason: 'executed' | 'window_not_elapsed' | 'window_dedup' | 'no_checks';
  executedCheckIds: string[];
}

export interface ConversationHeartbeatOptions {
  heartbeatFilePath?: string;
  stateFilePath?: string;
  windowMs?: number;
  now?: () => number;
  executeCheck?: (check: HeartbeatCheckDefinition) => Promise<void> | void;
  logger?: Pick<Console, 'warn' | 'error' | 'info'>;
}

const DEFAULT_WINDOW_MS = 30 * 60 * 1000;

const createDefaultState = (): HeartbeatState => {
  return {
    lastRunAt: 0,
    lastWindowKey: '',
    lastExecutedCheckIds: [],
    updatedAt: 0,
  };
};

const normalizeNumber = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim());
};

const isFailureType = (value: string): value is FailureType => {
  return Object.values(FailureType).includes(value as FailureType);
};

export function parseHeartbeatChecklist(markdown: string): HeartbeatCheckDefinition[] {
  const checks: HeartbeatCheckDefinition[] = [];
  const lines = markdown.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = line.match(/^-\s*\[( |x|X)\]\s*([a-z0-9_]+)\s*:\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const enabled = match[1] === ' ';
    if (!enabled) {
      continue;
    }

    const type = match[2].trim();
    const description = match[3].trim();
    if (!isFailureType(type) || !description) {
      continue;
    }

    checks.push({
      id: type,
      description,
    });
  }

  return checks;
}

const readHeartbeatState = (stateFilePath: string, logger?: Pick<Console, 'warn' | 'error'>): HeartbeatState => {
  if (!fs.existsSync(stateFilePath)) {
    return createDefaultState();
  }

  try {
    const raw = fs.readFileSync(stateFilePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      lastRunAt: normalizeNumber(parsed.lastRunAt, 0),
      lastWindowKey: typeof parsed.lastWindowKey === 'string' ? parsed.lastWindowKey : '',
      lastExecutedCheckIds: normalizeStringArray(parsed.lastExecutedCheckIds),
      updatedAt: normalizeNumber(parsed.updatedAt, 0),
    };
  } catch (error) {
    logger?.warn?.(`[Heartbeat] 状态文件损坏，已降级为默认状态: ${error instanceof Error ? error.message : String(error)}`);
    return createDefaultState();
  }
};

const atomicWriteState = (stateFilePath: string, state: HeartbeatState): void => {
  const dir = path.dirname(stateFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${stateFilePath}.${process.pid}.tmp`;
  const content = `${JSON.stringify(state, null, 2)}\n`;

  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, stateFilePath);
  } catch (error) {
    console.error('[conversation-heartbeat] tmp cleanup failed:', error instanceof Error ? error.message : String(error));
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // 忽略清理失败
    }
    throw error;
  }
};

export class ConversationHeartbeatEngine {
  private readonly heartbeatFilePath: string;

  private readonly stateFilePath: string;

  private readonly windowMs: number;

  private readonly now: () => number;

  private readonly executeCheck: (check: HeartbeatCheckDefinition) => Promise<void>;

  private readonly logger: Pick<Console, 'warn' | 'error' | 'info'>;

  constructor(options: ConversationHeartbeatOptions = {}) {
    this.heartbeatFilePath = options.heartbeatFilePath ?? path.join(process.cwd(), 'HEARTBEAT.md');
    this.stateFilePath = options.stateFilePath ?? path.join(process.cwd(), 'memory', 'heartbeat-state.json');
    this.windowMs = options.windowMs && options.windowMs > 0 ? options.windowMs : DEFAULT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger ?? console;
    this.executeCheck = async (check: HeartbeatCheckDefinition) => {
      if (options.executeCheck) {
        await options.executeCheck(check);
      }
    };
  }

  async onInboundMessage(): Promise<ConversationHeartbeatResult> {
    const currentTime = this.now();
    const currentWindowKey = String(Math.floor(currentTime / this.windowMs));
    const state = readHeartbeatState(this.stateFilePath, this.logger);

    if (state.lastWindowKey && state.lastWindowKey === currentWindowKey) {
      return {
        executed: false,
        reason: 'window_dedup',
        executedCheckIds: [],
      };
    }

    if (state.lastRunAt > 0 && currentTime - state.lastRunAt < this.windowMs) {
      return {
        executed: false,
        reason: 'window_not_elapsed',
        executedCheckIds: [],
      };
    }

    const checks = this.loadChecklist();
    if (checks.length === 0) {
      return {
        executed: false,
        reason: 'no_checks',
        executedCheckIds: [],
      };
    }

    const executedCheckIds: string[] = [];
    for (const check of checks) {
      await this.executeCheck(check);
      executedCheckIds.push(check.id);
    }

    const nextState: HeartbeatState = {
      lastRunAt: currentTime,
      lastWindowKey: currentWindowKey,
      lastExecutedCheckIds: executedCheckIds,
      updatedAt: currentTime,
    };
    atomicWriteState(this.stateFilePath, nextState);

    return {
      executed: true,
      reason: 'executed',
      executedCheckIds,
    };
  }

  private loadChecklist(): HeartbeatCheckDefinition[] {
    if (!fs.existsSync(this.heartbeatFilePath)) {
      this.logger.warn(`[Heartbeat] 检查清单不存在: ${this.heartbeatFilePath}`);
      return [];
    }

    try {
      const markdown = fs.readFileSync(this.heartbeatFilePath, 'utf-8');
      return parseHeartbeatChecklist(markdown);
    } catch (error) {
      this.logger.error(
        `[Heartbeat] 读取检查清单失败: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
}
