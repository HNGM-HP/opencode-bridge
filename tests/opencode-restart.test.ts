import { describe, expect, it, vi } from 'vitest';
import { formatRestartResultText, restartOpenCodeProcess } from '../src/reliability/opencode-restart.js';

describe('restartOpenCodeProcess', () => {
  it('应在可停止并健康恢复时返回成功', async () => {
    const checkSingleInstance = vi.fn(async () => ({
      status: 'ok' as const,
      pidFromFile: 123,
      pidAlive: true,
      portOpen: true,
      probeReason: 'connected',
      runningPids: [123],
      conflictPids: [],
    }));
    const killProcess = vi.fn();
    const startProcess = vi.fn(async () => undefined);
    const probeHealth = vi.fn(async () => ({ ok: true }));

    const result = await restartOpenCodeProcess({
      host: 'localhost',
      port: 4096,
      checkSingleInstance,
      killProcess,
      startProcess,
      probeHealth,
      healthCheckRetries: 2,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('restarted');
    expect(killProcess).toHaveBeenCalledWith(123);
    expect(startProcess).toHaveBeenCalledTimes(1);
  });

  it('健康检查持续失败时应返回失败', async () => {
    const result = await restartOpenCodeProcess({
      host: 'localhost',
      port: 4096,
      checkSingleInstance: async () => ({
        status: 'not-running',
        pidFromFile: null,
        pidAlive: false,
        portOpen: false,
        probeReason: 'timeout',
        runningPids: [],
        conflictPids: [],
      }),
      killProcess: () => undefined,
      startProcess: async () => undefined,
      probeHealth: async () => ({ ok: false }),
      healthCheckRetries: 2,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('health_check_failed');
  });

  it('formatRestartResultText 应返回可读文案', () => {
    const successText = formatRestartResultText({
      ok: true,
      reason: 'restarted',
      host: 'localhost',
      port: 4096,
      killedPids: [1001],
      failedToKillPids: [],
    });
    expect(successText).toContain('已重启成功');

    const failedText = formatRestartResultText({
      ok: false,
      reason: 'start_failed',
      host: 'localhost',
      port: 4096,
      killedPids: [],
      failedToKillPids: [],
    });
    expect(failedText).toContain('启动命令执行失败');
  });
});
