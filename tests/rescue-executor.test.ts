import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditLogger } from '../src/reliability/audit-log.js';
import type { EnvironmentDoctorReport } from '../src/reliability/environment-doctor.js';
import type { ApplyConfigGuardResult, ConfigGuardServerFields } from '../src/reliability/config-guard.js';
import type { OpenCodeProbeResult } from '../src/reliability/opencode-probe.js';
import type { ProcessGuardResult, RescueLockAcquireResult } from '../src/reliability/process-guard.js';
import { FailureType } from '../src/reliability/types.js';
import { executeRescuePipeline } from '../src/reliability/rescue-executor.js';

interface TestHarness {
  events: AuditEvent[];
  calls: string[];
  released: { value: boolean };
  lockResult: RescueLockAcquireResult;
  singleInstanceResult: ProcessGuardResult;
  doctorReport: EnvironmentDoctorReport;
  configResult: ApplyConfigGuardResult;
  configError: Error | null;
  probeResult: OpenCodeProbeResult;
  startImpl: () => Promise<void>;
}

function createAuditRecorder(): { events: AuditEvent[]; logger: AuditLogger } {
  const events: AuditEvent[] = [];
  return {
    events,
    logger: {
      async log(event: AuditEvent): Promise<void> {
        events.push(event);
      },
    },
  };
}

function buildServerFields(): ConfigGuardServerFields {
  return {
    host: '127.0.0.1',
    port: 4096,
    auth: {
      username: 'opencode',
      password: 'pw',
    },
  };
}

function buildHarness(): TestHarness {
  const released = { value: false };
  return {
    events: [],
    calls: [],
    released,
    lockResult: {
      ok: true,
      lockPath: 'memory/rescue.lock',
      release: async () => {
        released.value = true;
      },
    },
    singleInstanceResult: {
      status: 'ok',
      pidFromFile: 100,
      pidAlive: true,
      portOpen: true,
      probeReason: 'connected',
      runningPids: [100],
      conflictPids: [],
    },
    doctorReport: {
      os: 'linux',
      endpoint: {
        host: '127.0.0.1',
        port: 4096,
        probeHost: '127.0.0.1',
      },
      issues: [],
      summary: {
        totalIssues: 0,
        repairable: 0,
        manualRequired: 0,
      },
    },
    configResult: {
      appliedLevel: 'level1',
      backup: {
        path: 'tmp/opencode.json.bak',
        timestamp: Date.now(),
        sha256: 'abc',
      },
    },
    configError: null,
    probeResult: {
      ok: true,
      failureType: null,
      tcp: {
        reachable: true,
        reason: 'connected',
        failureType: null,
      },
      http: {
        attempted: true,
        ok: true,
        statusCode: 200,
        reason: 'http_200',
        url: 'http://127.0.0.1:4096/health',
        failureType: null,
      },
      auth: {
        status: 'valid',
        reason: 'http_ok',
        failureType: null,
      },
    },
    startImpl: async () => {
      return;
    },
  };
}

async function runWithHarness(harness: TestHarness) {
  const recorder = createAuditRecorder();
  return {
    recorder,
    result: await executeRescuePipeline({
      lockTargetPath: 'memory/rescue',
      pidFilePath: 'logs/opencode.pid',
      host: '127.0.0.1',
      port: 4096,
      configPath: '.config/opencode.json',
      serverFields: buildServerFields(),
      audit: recorder.logger,
      deps: {
        acquireRescueLock: async () => {
          harness.calls.push('lock');
          return harness.lockResult;
        },
        checkOpenCodeSingleInstance: async () => {
          harness.calls.push('single-instance');
          return harness.singleInstanceResult;
        },
        diagnoseEnvironment: async () => {
          harness.calls.push('doctor');
          return harness.doctorReport;
        },
        applyConfigGuardWithFallback: async () => {
          harness.calls.push('config');
          if (harness.configError) {
            throw harness.configError;
          }
          return harness.configResult;
        },
        startOpenCode: async () => {
          harness.calls.push('start');
          await harness.startImpl();
        },
        probeOpenCodeHealth: async () => {
          harness.calls.push('verify');
          return harness.probeResult;
        },
      },
    }),
  };
}

describe('rescue-executor', () => {
  it('应按顺序完整执行 lock -> doctor -> config -> start -> verify -> release', async () => {
    const harness = buildHarness();

    const { result, recorder } = await runWithHarness(harness);

    expect(result.ok).toBe(true);
    expect(harness.calls).toEqual(['lock', 'single-instance', 'doctor', 'config', 'start', 'verify']);
    expect(harness.released.value).toBe(true);
    expect(result.trace.map(item => item.step)).toEqual([
      'lock',
      'doctor',
      'config',
      'start',
      'verify',
      'release',
    ]);
    expect(result.trace.every(item => item.durationMs >= 0)).toBe(true);
    expect(result.trace.every(item => item.result === 'success')).toBe(true);
    expect(recorder.events.length).toBeGreaterThanOrEqual(6);
  });

  it('单实例冲突时必须硬失败并短路后续步骤', async () => {
    const harness = buildHarness();
    harness.singleInstanceResult = {
      ...harness.singleInstanceResult,
      status: 'single-instance-violation',
      runningPids: [101, 202],
      conflictPids: [202],
    };

    const { result } = await runWithHarness(harness);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe('lock');
      expect(result.reason).toContain('single-instance-violation');
    }
    expect(harness.calls).toEqual(['lock', 'single-instance']);
    expect(harness.released.value).toBe(true);
  });

  it('获取锁失败时应立即短路', async () => {
    const harness = buildHarness();
    harness.lockResult = {
      ok: false,
      code: 'lock-busy',
      lockPath: 'memory/rescue.lock',
    };

    const { result } = await runWithHarness(harness);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe('lock');
      expect(result.reason).toContain('lock-busy');
    }
    expect(harness.calls).toEqual(['lock']);
    expect(harness.released.value).toBe(false);
  });

  it('环境诊断失败时应短路 config/start/verify', async () => {
    const harness = buildHarness();
    harness.doctorReport = {
      ...harness.doctorReport,
      summary: {
        totalIssues: 1,
        repairable: 0,
        manualRequired: 1,
      },
      issues: [
        {
          code: 'missing_env',
          classification: 'manual_required',
          detail: '缺失 OPENCODE_PORT',
          suggestion: '补齐环境变量',
        },
      ],
    };

    const { result } = await runWithHarness(harness);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe('doctor');
      expect(result.reason).toContain('doctor_issues');
    }
    expect(harness.calls).toEqual(['lock', 'single-instance', 'doctor']);
    expect(harness.released.value).toBe(true);
  });

  it('配置回退失败时应短路 start/verify', async () => {
    const harness = buildHarness();
    harness.configError = new Error('config write failed');

    const { result } = await runWithHarness(harness);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe('config');
      expect(result.reason).toContain('config write failed');
    }
    expect(harness.calls).toEqual(['lock', 'single-instance', 'doctor', 'config']);
    expect(harness.released.value).toBe(true);
  });

  it('启动失败时应短路 verify', async () => {
    const harness = buildHarness();
    harness.startImpl = async () => {
      throw new Error('start failed');
    };

    const { result } = await runWithHarness(harness);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe('start');
      expect(result.reason).toContain('start failed');
    }
    expect(harness.calls).toEqual(['lock', 'single-instance', 'doctor', 'config', 'start']);
    expect(harness.released.value).toBe(true);
  });

  it('健康复检失败时不得误报 recovered', async () => {
    const harness = buildHarness();
    harness.probeResult = {
      ...harness.probeResult,
      ok: false,
      failureType: FailureType.OPENCODE_HTTP_DOWN,
      http: {
        attempted: true,
        ok: false,
        statusCode: 503,
        reason: 'http_503',
        url: 'http://127.0.0.1:4096/health',
        failureType: FailureType.OPENCODE_HTTP_DOWN,
      },
      auth: {
        status: 'unknown',
        reason: 'unknown',
        failureType: null,
      },
    };

    const { result } = await runWithHarness(harness);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe('verify');
      expect(result.reason).toContain('opencode_http_down');
    }
    expect(harness.calls).toEqual(['lock', 'single-instance', 'doctor', 'config', 'start', 'verify']);
    expect(harness.released.value).toBe(true);
  });
});
