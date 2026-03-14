import type { RuntimeCronJob, RuntimeCronManager } from './runtime-cron.js';

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
