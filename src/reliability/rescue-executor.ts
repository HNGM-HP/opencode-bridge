import { generateIncidentId, type AuditLogger } from './audit-log.js';
import {
  applyConfigGuardWithFallback,
  type ApplyConfigGuardResult,
  type ConfigGuardServerFields,
} from './config-guard.js';
import { diagnoseEnvironment, type EnvironmentDoctorReport } from './environment-doctor.js';
import { probeOpenCodeHealth, type OpenCodeProbeResult } from './opencode-probe.js';
import {
  acquireRescueLock,
  checkOpenCodeSingleInstance,
  type ProcessGuardResult,
  type RescueLockAcquireResult,
} from './process-guard.js';

export type RescueStep = 'lock' | 'doctor' | 'config' | 'start' | 'verify' | 'release';
export type RescueStepResult = 'success' | 'failed';

export interface RescueStepTrace {
  step: RescueStep;
  result: RescueStepResult;
  durationMs: number;
  reason?: string;
}

export interface RescueExecutorOptions {
  lockTargetPath: string;
  pidFilePath: string;
  host: string;
  port: number;
  configPath: string;
  serverFields: ConfigGuardServerFields;
  healthPath?: string;
  startOpenCode?: () => Promise<void>;
  audit?: AuditLogger;
  deps?: Partial<RescueExecutorDependencies>;
}

export interface RescueExecutionSuccess {
  ok: true;
  trace: RescueStepTrace[];
  lockPath: string;
  singleInstance: ProcessGuardResult;
  doctor: EnvironmentDoctorReport;
  config: ApplyConfigGuardResult;
  health: OpenCodeProbeResult;
}

export interface RescueExecutionFailure {
  ok: false;
  failedStep: RescueStep;
  reason: string;
  trace: RescueStepTrace[];
}

export type RescueExecutionResult = RescueExecutionSuccess | RescueExecutionFailure;

export interface RescueExecutorDependencies {
  acquireRescueLock: typeof acquireRescueLock;
  checkOpenCodeSingleInstance: typeof checkOpenCodeSingleInstance;
  diagnoseEnvironment: typeof diagnoseEnvironment;
  applyConfigGuardWithFallback: typeof applyConfigGuardWithFallback;
  probeOpenCodeHealth: typeof probeOpenCodeHealth;
  startOpenCode: () => Promise<void>;
  now: () => number;
}

const noOpAuditLogger: AuditLogger = {
  async log(): Promise<void> {
    return;
  },
};

export async function executeRescuePipeline(options: RescueExecutorOptions): Promise<RescueExecutionResult> {
  const trace: RescueStepTrace[] = [];
  const audit = options.audit ?? noOpAuditLogger;
  const deps = resolveDependencies(options);

  let lockPath = '';
  let releaseLock: (() => Promise<void>) | null = null;
  let singleInstanceResult: ProcessGuardResult | null = null;
  let doctorReport: EnvironmentDoctorReport | null = null;
  let configResult: ApplyConfigGuardResult | null = null;
  let probeResult: OpenCodeProbeResult | null = null;

  try {
    const lockStartedAt = deps.now();
    const lockAcquire = await deps.acquireRescueLock({
      lockTargetPath: options.lockTargetPath,
    });

    if (!lockAcquire.ok) {
      const lockReason = lockAcquire.code;
      const failedTrace = buildStepTrace('lock', 'failed', lockStartedAt, deps.now(), lockReason);
      trace.push(failedTrace);
      await writeAudit(audit, 'lock', 'failed', failedTrace.durationMs, lockReason, {
        code: lockAcquire.code,
        lockPath: lockAcquire.lockPath,
      });
      return {
        ok: false,
        failedStep: 'lock',
        reason: lockReason,
        trace,
      };
    }

    lockPath = lockAcquire.lockPath;
    releaseLock = lockAcquire.release;

    singleInstanceResult = await deps.checkOpenCodeSingleInstance({
      pidFilePath: options.pidFilePath,
      host: options.host,
      port: options.port,
    });

    if (singleInstanceResult.status === 'single-instance-violation') {
      const violationReason = `single-instance-violation:${singleInstanceResult.runningPids.join(',')}`;
      const failedTrace = buildStepTrace('lock', 'failed', lockStartedAt, deps.now(), violationReason);
      trace.push(failedTrace);
      await writeAudit(audit, 'lock', 'failed', failedTrace.durationMs, violationReason, {
        lockPath,
        runningPids: singleInstanceResult.runningPids,
        conflictPids: singleInstanceResult.conflictPids,
      });
      return {
        ok: false,
        failedStep: 'lock',
        reason: violationReason,
        trace,
      };
    }

    const lockTrace = buildStepTrace('lock', 'success', lockStartedAt, deps.now());
    trace.push(lockTrace);
    await writeAudit(audit, 'lock', 'success', lockTrace.durationMs, undefined, {
      lockPath,
      singleInstanceStatus: singleInstanceResult.status,
      runningPids: singleInstanceResult.runningPids,
    });

    const doctorStartedAt = deps.now();
    doctorReport = await deps.diagnoseEnvironment();
    if (doctorReport.summary.totalIssues > 0) {
      const doctorReason = `doctor_issues:${doctorReport.summary.totalIssues}`;
      const failedTrace = buildStepTrace('doctor', 'failed', doctorStartedAt, deps.now(), doctorReason);
      trace.push(failedTrace);
      await writeAudit(audit, 'doctor', 'failed', failedTrace.durationMs, doctorReason, {
        summary: doctorReport.summary,
      });
      return {
        ok: false,
        failedStep: 'doctor',
        reason: doctorReason,
        trace,
      };
    }

    const doctorTrace = buildStepTrace('doctor', 'success', doctorStartedAt, deps.now());
    trace.push(doctorTrace);
    await writeAudit(audit, 'doctor', 'success', doctorTrace.durationMs, undefined, {
      summary: doctorReport.summary,
    });

    const configStartedAt = deps.now();
    try {
      configResult = await deps.applyConfigGuardWithFallback({
        configPath: options.configPath,
        serverFields: options.serverFields,
        audit,
      });
    } catch (error) {
      const configReason = formatError(error);
      const failedTrace = buildStepTrace('config', 'failed', configStartedAt, deps.now(), configReason);
      trace.push(failedTrace);
      await writeAudit(audit, 'config', 'failed', failedTrace.durationMs, configReason, {
        configPath: options.configPath,
      });
      return {
        ok: false,
        failedStep: 'config',
        reason: configReason,
        trace,
      };
    }

    const configTrace = buildStepTrace('config', 'success', configStartedAt, deps.now());
    trace.push(configTrace);
    await writeAudit(audit, 'config', 'success', configTrace.durationMs, undefined, {
      configPath: options.configPath,
      appliedLevel: configResult.appliedLevel,
      backupPath: configResult.backup.path,
    });

    const startStartedAt = deps.now();
    try {
      await deps.startOpenCode();
    } catch (error) {
      const startReason = formatError(error);
      const failedTrace = buildStepTrace('start', 'failed', startStartedAt, deps.now(), startReason);
      trace.push(failedTrace);
      await writeAudit(audit, 'start', 'failed', failedTrace.durationMs, startReason);
      return {
        ok: false,
        failedStep: 'start',
        reason: startReason,
        trace,
      };
    }

    const startTrace = buildStepTrace('start', 'success', startStartedAt, deps.now());
    trace.push(startTrace);
    await writeAudit(audit, 'start', 'success', startTrace.durationMs);

    const verifyStartedAt = deps.now();
    probeResult = await deps.probeOpenCodeHealth({
      host: options.host,
      port: options.port,
      healthPath: options.healthPath,
    });
    if (!probeResult.ok) {
      const verifyReason = probeResult.failureType ?? 'health_probe_failed';
      const failedTrace = buildStepTrace('verify', 'failed', verifyStartedAt, deps.now(), verifyReason);
      trace.push(failedTrace);
      await writeAudit(audit, 'verify', 'failed', failedTrace.durationMs, verifyReason, {
        tcp: probeResult.tcp,
        http: probeResult.http,
        auth: probeResult.auth,
      });
      return {
        ok: false,
        failedStep: 'verify',
        reason: verifyReason,
        trace,
      };
    }

    const verifyTrace = buildStepTrace('verify', 'success', verifyStartedAt, deps.now());
    trace.push(verifyTrace);
    await writeAudit(audit, 'verify', 'success', verifyTrace.durationMs, undefined, {
      tcp: probeResult.tcp,
      http: probeResult.http,
      auth: probeResult.auth,
    });

    return {
      ok: true,
      trace,
      lockPath,
      singleInstance: singleInstanceResult,
      doctor: doctorReport,
      config: configResult,
      health: probeResult,
    };
  } finally {
    if (releaseLock) {
      const releaseStartedAt = deps.now();
      try {
        await releaseLock();
        const releaseTrace = buildStepTrace('release', 'success', releaseStartedAt, deps.now());
        trace.push(releaseTrace);
        await writeAudit(audit, 'release', 'success', releaseTrace.durationMs, undefined, { lockPath });
      } catch (error) {
        const releaseReason = formatError(error);
        const releaseTrace = buildStepTrace('release', 'failed', releaseStartedAt, deps.now(), releaseReason);
        trace.push(releaseTrace);
        await writeAudit(audit, 'release', 'failed', releaseTrace.durationMs, releaseReason, { lockPath });
      }
    }
  }
}

function resolveDependencies(options: RescueExecutorOptions): RescueExecutorDependencies {
  return {
    acquireRescueLock: options.deps?.acquireRescueLock ?? acquireRescueLock,
    checkOpenCodeSingleInstance: options.deps?.checkOpenCodeSingleInstance ?? checkOpenCodeSingleInstance,
    diagnoseEnvironment: options.deps?.diagnoseEnvironment ?? diagnoseEnvironment,
    applyConfigGuardWithFallback: options.deps?.applyConfigGuardWithFallback ?? applyConfigGuardWithFallback,
    probeOpenCodeHealth: options.deps?.probeOpenCodeHealth ?? probeOpenCodeHealth,
    startOpenCode: options.deps?.startOpenCode ?? options.startOpenCode ?? (async () => undefined),
    now: options.deps?.now ?? Date.now,
  };
}

function buildStepTrace(
  step: RescueStep,
  result: RescueStepResult,
  startedAt: number,
  endedAt: number,
  reason?: string
): RescueStepTrace {
  return {
    step,
    result,
    durationMs: Math.max(0, endedAt - startedAt),
    ...(reason ? { reason } : {}),
  };
}

async function writeAudit(
  audit: AuditLogger,
  step: RescueStep,
  result: RescueStepResult,
  durationMs: number,
  reason?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await audit.log({
      incidentId: generateIncidentId(),
      classification: 'system',
      decision: 'update',
      action: `rescue.step.${step}`,
      result: result === 'success' ? 'success' : 'failed',
      timestamp: new Date().toISOString(),
      metadata: {
        step,
        durationMs,
        ...(reason ? { reason } : {}),
        ...(metadata ?? {}),
      },
    });
  } catch (error) {
    console.error('[rescue-executor] writeAudit failed:', error instanceof Error ? error.message : String(error));
    return;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
