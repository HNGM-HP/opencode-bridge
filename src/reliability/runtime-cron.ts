import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Part } from '@opencode-ai/sdk';
import type { CronScheduler, SchedulerJobState } from './scheduler.js';
import { reliabilityConfig } from '../config.js';
import type { PlatformSender } from '../platform/types.js';
import { chatSessionStore } from '../store/chat-session.js';

export interface RuntimeCronSchedule {
  kind: 'cron';
  expr: string;
}

export interface RuntimeCronPayloadSystemEvent {
  kind: 'systemEvent';
  text: string;
  sessionId?: string;
  directory?: string;
  agent?: string;
  delivery?: RuntimeCronDelivery;
}

export interface RuntimeCronDelivery {
  platform: 'feishu' | 'discord';
  conversationId: string;
  creatorId?: string;
  fallbackConversationId?: string;
}

export type RuntimeCronPayload = RuntimeCronPayloadSystemEvent;

export interface RuntimeCronJob {
  id: string;
  name: string;
  schedule: RuntimeCronSchedule;
  payload: RuntimeCronPayload;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface RuntimeCronJobView extends RuntimeCronJob {
  schedulerJobId: string;
  state: SchedulerJobState | null;
}

interface RuntimeCronStoreFile {
  version: 1;
  jobs: RuntimeCronJob[];
}

export interface AddRuntimeCronJobInput {
  id?: string;
  name: string;
  schedule: RuntimeCronSchedule;
  payload: RuntimeCronPayload;
  enabled?: boolean;
}

export interface UpdateRuntimeCronJobInput {
  id: string;
  name?: string;
  schedule?: RuntimeCronSchedule;
  payload?: RuntimeCronPayload;
  enabled?: boolean;
}

export interface RuntimeCronManagerOptions {
  scheduler: CronScheduler;
  filePath?: string;
  timezone?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  dispatchPayload?: (job: RuntimeCronJob) => Promise<void>;
}

export interface RuntimeCronDispatcherDependencies {
  getSessionById: (sessionId: string, options?: { directory?: string }) => Promise<unknown | null>;
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
  ) => Promise<{ parts: Part[] }>;
  sendMessageAsync: (
    sessionId: string,
    text: string,
    options?: {
      agent?: string;
      directory?: string;
      providerId?: string;
      modelId?: string;
      variant?: string;
    }
  ) => Promise<boolean>;
  getSender: (platform: 'feishu' | 'discord') => PlatformSender | null;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface RuntimeCronCleanupResult {
  removedJobIds: string[];
}

export interface RuntimeCronOrphanScanDependencies {
  hasConversationBinding: (platform: 'feishu' | 'discord', conversationId: string, sessionId?: string) => boolean;
  getSessionStatus: (sessionId: string, directory?: string) => Promise<'exists' | 'missing' | 'unknown'>;
}

export interface RuntimeCronOrphanScanResult {
  removedJobIds: string[];
  invalidJobIds: string[];
  missingConversationJobIds: string[];
  missingSessionJobIds: string[];
}

const STORE_VERSION = 1 as const;
const RUNTIME_JOB_PREFIX = 'runtime-cron:';

// ── Runtime Cron Registry ────────────────────────────────────────────

let runtimeCronManager: RuntimeCronManager | null = null;

export function setRuntimeCronManager(manager: RuntimeCronManager | null): void {
  runtimeCronManager = manager;
}

export function getRuntimeCronManager(): RuntimeCronManager | null {
  return runtimeCronManager;
}

// ── Default implementations ───────────────────────────────────────────

const defaultDispatchPayload = async (job: RuntimeCronJob): Promise<void> => {
  if (job.payload.kind === 'systemEvent') {
    return;
  }
};

const defaultStorePath = (): string => {
  return path.join(os.homedir(), 'cron', 'jobs.json');
};

// ── RuntimeCronManager ────────────────────────────────────────────────

export class RuntimeCronManager {
  private readonly scheduler: CronScheduler;

  private readonly filePath: string;

  private readonly timezone?: string;

  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  private readonly dispatchPayload: (job: RuntimeCronJob) => Promise<void>;

  private jobs = new Map<string, RuntimeCronJob>();

  constructor(options: RuntimeCronManagerOptions) {
    this.scheduler = options.scheduler;
    this.filePath = options.filePath?.trim() || defaultStorePath();
    this.timezone = options.timezone;
    this.logger = options.logger ?? console;
    this.dispatchPayload = options.dispatchPayload ?? defaultDispatchPayload;
    this.jobs = this.loadJobsFromDisk();
    this.syncToScheduler();
  }

  listJobs(): RuntimeCronJobView[] {
    const views: RuntimeCronJobView[] = [];
    for (const job of this.jobs.values()) {
      const schedulerJobId = toSchedulerJobId(job.id);
      const state = this.scheduler.hasJob(schedulerJobId)
        ? this.scheduler.getJobState(schedulerJobId)
        : null;
      views.push({
        ...job,
        schedulerJobId,
        state,
      });
    }
    views.sort((a, b) => a.createdAtMs - b.createdAtMs);
    return views;
  }

  addJob(input: AddRuntimeCronJobInput): RuntimeCronJob {
    const normalized = normalizeAddInput(input);
    const jobId = normalized.id || randomUUID();
    if (this.jobs.has(jobId)) {
      throw new Error(`cron job id already exists: ${jobId}`);
    }

    const now = Date.now();
    const job: RuntimeCronJob = {
      id: jobId,
      name: normalized.name,
      schedule: normalized.schedule,
      payload: normalized.payload,
      enabled: normalized.enabled,
      createdAtMs: now,
      updatedAtMs: now,
    };

    this.jobs.set(job.id, job);
    try {
      this.applyJobToScheduler(job);
      this.persist();
    } catch (error) {
      this.jobs.delete(job.id);
      this.scheduler.removeJob(toSchedulerJobId(job.id));
      throw error;
    }
    return job;
  }

  updateJob(input: UpdateRuntimeCronJobInput): RuntimeCronJob {
    const existing = this.jobs.get(input.id);
    if (!existing) {
      throw new Error(`cron job not found: ${input.id}`);
    }

    const previous = { ...existing };
    const next = normalizeUpdatedJob(existing, input);
    this.jobs.set(existing.id, next);

    try {
      this.applyJobToScheduler(next);
      this.persist();
    } catch (error) {
      this.jobs.set(previous.id, previous);
      this.applyJobToScheduler(previous);
      throw error;
    }
    return next;
  }

  removeJob(jobId: string): boolean {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      return false;
    }

    this.jobs.delete(jobId);
    const schedulerRemoved = this.scheduler.removeJob(toSchedulerJobId(jobId));
    try {
      this.persist();
    } catch (error) {
      this.jobs.set(jobId, existing);
      if (schedulerRemoved && existing.enabled) {
        this.applyJobToScheduler(existing);
      }
      throw error;
    }
    return true;
  }

  getJob(jobId: string): RuntimeCronJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  private syncToScheduler(): void {
    for (const job of this.jobs.values()) {
      try {
        this.applyJobToScheduler(job);
      } catch (error) {
        this.logger.warn(
          `[RuntimeCron] skip invalid persisted job ${job.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private applyJobToScheduler(job: RuntimeCronJob): void {
    const schedulerJobId = toSchedulerJobId(job.id);
    if (!job.enabled) {
      this.scheduler.removeJob(schedulerJobId);
      return;
    }

    this.scheduler.upsertJob({
      id: schedulerJobId,
      cronExpression: job.schedule.expr,
      timezone: this.timezone,
      waitForCompletion: true,
      run: async () => {
        await this.executeJob(job.id);
      },
    });
  }

  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || !job.enabled) {
      return;
    }

    try {
      await this.dispatchPayload(job);
      this.logger.info(`[RuntimeCron] job executed: ${job.id} (${job.name})`);
    } catch (error) {
      this.logger.error('[RuntimeCron] job execution failed:', error);
      throw error;
    }
  }

  private loadJobsFromDisk(): Map<string, RuntimeCronJob> {
    const result = new Map<string, RuntimeCronJob>();
    if (!fs.existsSync(this.filePath)) {
      return result;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as RuntimeCronStoreFile;
      if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.jobs)) {
        this.logger.warn(`[RuntimeCron] invalid store file format: ${this.filePath}`);
        return result;
      }

      for (const item of parsed.jobs) {
        try {
          const normalized = normalizePersistedJob(item);
          result.set(normalized.id, normalized);
        } catch (error) {
          this.logger.warn(
            `[RuntimeCron] skip invalid persisted job: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return result;
    } catch (error) {
      this.logger.warn(
        `[RuntimeCron] failed to read store file: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  private persist(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const snapshot: RuntimeCronStoreFile = {
      version: STORE_VERSION,
      jobs: Array.from(this.jobs.values()).sort((a, b) => a.createdAtMs - b.createdAtMs),
    };
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }
}

export function toSchedulerJobId(runtimeCronJobId: string): string {
  return `${RUNTIME_JOB_PREFIX}${runtimeCronJobId}`;
}

// ── Private helpers (RuntimeCronManager) ──────────────────────────────

function normalizeAddInput(input: AddRuntimeCronJobInput): {
  id?: string;
  name: string;
  schedule: RuntimeCronSchedule;
  payload: RuntimeCronPayload;
  enabled: boolean;
} {
  const id = input.id?.trim();
  const name = normalizeName(input.name);
  const schedule = normalizeSchedule(input.schedule);
  const payload = normalizePayload(input.payload);
  return {
    ...(id ? { id } : {}),
    name,
    schedule,
    payload,
    enabled: input.enabled !== false,
  };
}

function normalizeUpdatedJob(existing: RuntimeCronJob, input: UpdateRuntimeCronJobInput): RuntimeCronJob {
  const name = typeof input.name === 'string' ? normalizeName(input.name) : existing.name;
  const schedule = input.schedule ? normalizeSchedule(input.schedule) : existing.schedule;
  const payload = input.payload ? normalizePayload(input.payload) : existing.payload;
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : existing.enabled;
  return {
    ...existing,
    name,
    schedule,
    payload,
    enabled,
    updatedAtMs: Date.now(),
  };
}

function normalizePersistedJob(input: RuntimeCronJob): RuntimeCronJob {
  const id = input.id?.trim();
  if (!id) {
    throw new Error('missing id');
  }

  return {
    id,
    name: normalizeName(input.name),
    schedule: normalizeSchedule(input.schedule),
    payload: normalizePayload(input.payload),
    enabled: input.enabled !== false,
    createdAtMs: toNonNegativeInt(input.createdAtMs, Date.now()),
    updatedAtMs: toNonNegativeInt(input.updatedAtMs, Date.now()),
  };
}

function normalizeName(value: string): string {
  const name = value?.trim();
  if (!name) {
    throw new Error('job name is required');
  }
  return name;
}

function normalizeSchedule(schedule: RuntimeCronSchedule): RuntimeCronSchedule {
  if (!schedule || schedule.kind !== 'cron') {
    throw new Error('schedule.kind must be cron');
  }

  const expr = schedule.expr?.trim();
  if (!expr) {
    throw new Error('schedule.expr is required');
  }
  return {
    kind: 'cron',
    expr,
  };
}

function normalizePayload(payload: RuntimeCronPayload): RuntimeCronPayload {
  if (!payload || payload.kind !== 'systemEvent') {
    throw new Error('payload.kind must be systemEvent');
  }

  const text = payload.text?.trim();
  if (!text) {
    throw new Error('payload.text is required');
  }

  const sessionId = payload.sessionId?.trim();
  const directory = payload.directory?.trim();
  const agent = payload.agent?.trim();
  const delivery = normalizeDelivery(payload.delivery);
  return {
    kind: 'systemEvent',
    text,
    ...(sessionId ? { sessionId } : {}),
    ...(directory ? { directory } : {}),
    ...(agent ? { agent } : {}),
    ...(delivery ? { delivery } : {}),
  };
}

function normalizeDelivery(delivery: RuntimeCronDelivery | undefined): RuntimeCronDelivery | undefined {
  if (!delivery) {
    return undefined;
  }

  const platform = delivery.platform === 'discord' ? 'discord' : delivery.platform === 'feishu' ? 'feishu' : '';
  const conversationId = delivery.conversationId?.trim();
  const creatorId = delivery.creatorId?.trim();
  const fallbackConversationId = delivery.fallbackConversationId?.trim();

  if (!platform || !conversationId) {
    throw new Error('delivery must include platform and conversationId');
  }

  return {
    platform,
    conversationId,
    ...(creatorId ? { creatorId } : {}),
    ...(fallbackConversationId ? { fallbackConversationId } : {}),
  };
}

function toNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

// ── Cron Dispatcher ───────────────────────────────────────────────────

export function createRuntimeCronDispatcher(dependencies: RuntimeCronDispatcherDependencies): {
  dispatch: (job: RuntimeCronJob) => Promise<void>;
} {
  const logger = dependencies.logger ?? console;

  return {
    dispatch: async (job: RuntimeCronJob) => {
      if (job.payload.kind !== 'systemEvent') {
        return;
      }

      const delivery = job.payload.delivery;
      if (!delivery) {
        throw new Error(`job ${job.id} is missing delivery binding`);
      }

      const boundSessionId = job.payload.sessionId?.trim();
      const inferredSessionId = chatSessionStore.getSessionByConversation(delivery.platform, delivery.conversationId)?.sessionId?.trim();
      const sessionId = boundSessionId || inferredSessionId || '';
      if (!sessionId) {
        throw new Error(`job ${job.id} is missing bound sessionId`);
      }
      if (!boundSessionId && inferredSessionId) {
        logger.warn(
          `[RuntimeCron] job ${job.id} is missing sessionId in payload; inferred ${inferredSessionId} from ${delivery.platform}:${delivery.conversationId}`
        );
      }

      const session = await dependencies.getSessionById(
        sessionId,
        job.payload.directory ? { directory: job.payload.directory } : undefined
      ).catch(() => null);
      if (!session) {
        throw new Error(`job ${job.id} bound session not found: ${sessionId}`);
      }

      const currentBinding = chatSessionStore.getSessionByConversation(delivery.platform, delivery.conversationId);
      const boundConversation = chatSessionStore.getConversationBySessionId(sessionId);
      const canStreamToOrigin = currentBinding?.sessionId === sessionId
        && boundConversation?.platform === delivery.platform
        && boundConversation.conversationId === delivery.conversationId;

      const messageOptions = {
        ...(job.payload.agent ? { agent: job.payload.agent } : {}),
        ...(job.payload.directory ? { directory: job.payload.directory } : {}),
      };

      if (canStreamToOrigin) {
        const queued = await dependencies.sendMessageAsync(sessionId, job.payload.text, messageOptions);
        if (!queued) {
          throw new Error(`job ${job.id} failed to enqueue prompt to bound session`);
        }
        return;
      }

      if (boundConversation) {
        throw new Error(
          `job ${job.id} bound session ${sessionId} is currently attached to ${boundConversation.platform}:${boundConversation.conversationId}`
        );
      }

      const fallbackConversationId = resolveFallbackConversationId(job);
      if (!fallbackConversationId) {
        throw new Error(`job ${job.id} target conversation missing and no fallback conversation configured`);
      }

      const sender = dependencies.getSender(delivery.platform);
      if (!sender) {
        throw new Error(`job ${job.id} sender unavailable for platform: ${delivery.platform}`);
      }

      const response = await dependencies.sendMessage(sessionId, job.payload.text, messageOptions);
      const text = extractAssistantText(response.parts);
      const forwardedText = [
        `\u23F0 Cron \u8F6C\u53D1\uFF1A${job.name}`,
        `\u539F\u76EE\u6807 ${delivery.platform}:${delivery.conversationId} \u5DF2\u5931\u6548\uFF0C\u5DF2\u8F6C\u53D1\u5230\u5F53\u524D\u4F1A\u8BDD\u3002`,
        text || '\u6A21\u578B\u5DF2\u6267\u884C\uFF0C\u4F46\u672A\u8FD4\u56DE\u53EF\u5C55\u793A\u6587\u672C\u3002',
      ].join('\n\n');
      const messageId = await sender.sendText(fallbackConversationId, forwardedText);
      if (!messageId) {
        throw new Error(`job ${job.id} fallback delivery failed for ${delivery.platform}:${fallbackConversationId}`);
      }
      logger.warn(
        `[RuntimeCron] forwarded job ${job.id} to fallback conversation ${delivery.platform}:${fallbackConversationId}`
      );
    },
  };
}

function resolveFallbackConversationId(job: RuntimeCronJob): string | undefined {
  if (!reliabilityConfig.cronForwardToPrivateChat) {
    return undefined;
  }

  const delivery = job.payload.delivery;
  if (!delivery) {
    return undefined;
  }

  if (delivery.fallbackConversationId) {
    return delivery.fallbackConversationId;
  }

  if (delivery.platform === 'feishu' && reliabilityConfig.cronFallbackFeishuChatId) {
    return reliabilityConfig.cronFallbackFeishuChatId;
  }

  if (delivery.platform === 'discord' && reliabilityConfig.cronFallbackDiscordConversationId) {
    return reliabilityConfig.cronFallbackDiscordConversationId;
  }

  if (!delivery.creatorId) {
    return undefined;
  }

  const privateBinding = chatSessionStore.findPrivateConversationByCreator(delivery.creatorId, delivery.platform);
  return privateBinding?.platform === delivery.platform ? privateBinding.conversationId : undefined;
}

function extractAssistantText(parts: Part[]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) {
      chunks.push(record.text.trim());
    }
  }
  return chunks.join('\n\n').trim();
}

// ── Orphan Cleanup ────────────────────────────────────────────────────

export function cleanupRuntimeCronJobsByConversation(
  manager: RuntimeCronManager | null,
  platform: 'feishu' | 'discord',
  conversationId: string
): RuntimeCronCleanupResult {
  if (!manager) {
    return { removedJobIds: [] };
  }

  const removedJobIds: string[] = [];
  for (const job of manager.listJobs()) {
    const delivery = job.payload.delivery;
    if (!delivery) {
      continue;
    }
    if (delivery.platform !== platform || delivery.conversationId !== conversationId) {
      continue;
    }
    if (manager.removeJob(job.id)) {
      removedJobIds.push(job.id);
    }
  }

  return { removedJobIds };
}

export function cleanupRuntimeCronJobsBySessionId(
  manager: RuntimeCronManager | null,
  sessionId: string
): RuntimeCronCleanupResult {
  if (!manager) {
    return { removedJobIds: [] };
  }

  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return { removedJobIds: [] };
  }

  const removedJobIds: string[] = [];
  for (const job of manager.listJobs()) {
    if (job.payload.sessionId !== normalizedSessionId) {
      continue;
    }
    if (manager.removeJob(job.id)) {
      removedJobIds.push(job.id);
    }
  }

  return { removedJobIds };
}

export async function scanAndCleanupOrphanRuntimeCronJobs(
  manager: RuntimeCronManager | null,
  dependencies: RuntimeCronOrphanScanDependencies
): Promise<RuntimeCronOrphanScanResult> {
  const result: RuntimeCronOrphanScanResult = {
    removedJobIds: [],
    invalidJobIds: [],
    missingConversationJobIds: [],
    missingSessionJobIds: [],
  };

  if (!manager) {
    return result;
  }

  for (const job of manager.listJobs()) {
    const classification = await classifyRuntimeCronJob(job, dependencies);
    if (classification === 'ok' || classification === 'unknown-session-status') {
      continue;
    }

    result.removedJobIds.push(job.id);
    if (classification === 'invalid') {
      result.invalidJobIds.push(job.id);
    }
    if (classification === 'missing-conversation') {
      result.missingConversationJobIds.push(job.id);
    }
    if (classification === 'missing-session') {
      result.missingSessionJobIds.push(job.id);
    }
    manager.removeJob(job.id);
  }

  return result;
}

async function classifyRuntimeCronJob(
  job: RuntimeCronJob,
  dependencies: RuntimeCronOrphanScanDependencies
): Promise<'ok' | 'invalid' | 'missing-conversation' | 'missing-session' | 'unknown-session-status'> {
  const sessionId = job.payload.sessionId?.trim();
  const delivery = job.payload.delivery;

  if (!sessionId || !delivery) {
    return 'invalid';
  }

  const hasConversation = dependencies.hasConversationBinding(
    delivery.platform,
    delivery.conversationId,
    sessionId
  );
  if (!hasConversation) {
    return 'missing-conversation';
  }

  const sessionStatus = await dependencies.getSessionStatus(sessionId, job.payload.directory);
  if (sessionStatus === 'missing') {
    return 'missing-session';
  }
  if (sessionStatus === 'unknown') {
    return 'unknown-session-status';
  }

  return 'ok';
}
