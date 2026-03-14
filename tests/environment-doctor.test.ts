import { describe, expect, it } from 'vitest';
import {
  diagnoseEnvironment,
  type EnvironmentDoctorOptions,
  type EnvironmentIssue,
} from '../src/reliability/environment-doctor.js';

function getIssue(issues: EnvironmentIssue[], code: EnvironmentIssue['code']): EnvironmentIssue | undefined {
  return issues.find(item => item.code === code);
}

describe('environment-doctor', () => {
  it('应正确识别 Windows 平台', async () => {
    const options: EnvironmentDoctorOptions = {
      platform: 'win32',
      env: {
        OPENCODE_HOST: '127.0.0.1',
        OPENCODE_PORT: '4096',
      },
      requiredEnvKeys: ['OPENCODE_HOST', 'OPENCODE_PORT'],
      writableDirectories: ['C:/temp'],
      commandExists: async () => true,
      portChecker: async () => ({ available: true, reason: 'ok' }),
      pathWritableChecker: async () => true,
    };

    const result = await diagnoseEnvironment(options);

    expect(result.os).toBe('windows');
    expect(result.issues).toHaveLength(0);
    expect(result.summary.manualRequired).toBe(0);
    expect(result.summary.repairable).toBe(0);
  });

  it('应正确识别 Linux 平台', async () => {
    const result = await diagnoseEnvironment({
      platform: 'linux',
      env: {
        OPENCODE_HOST: '127.0.0.1',
        OPENCODE_PORT: '4096',
      },
      requiredEnvKeys: ['OPENCODE_HOST', 'OPENCODE_PORT'],
      writableDirectories: ['/tmp/opencode'],
      commandExists: async () => true,
      portChecker: async () => ({ available: true, reason: 'ok' }),
      pathWritableChecker: async () => true,
    });

    expect(result.os).toBe('linux');
  });

  it('命令缺失时应标记为可修复问题', async () => {
    const result = await diagnoseEnvironment({
      platform: 'linux',
      env: {
        OPENCODE_HOST: '127.0.0.1',
        OPENCODE_PORT: '4096',
      },
      requiredEnvKeys: ['OPENCODE_HOST', 'OPENCODE_PORT'],
      writableDirectories: ['/tmp/opencode'],
      commandExists: async command => command !== 'opencode',
      portChecker: async () => ({ available: true, reason: 'ok' }),
      pathWritableChecker: async () => true,
    });

    const issue = getIssue(result.issues, 'missing_command');
    expect(issue).toBeDefined();
    expect(issue?.classification).toBe('repairable');
    expect(issue?.detail).toContain('opencode');
    expect(result.summary.repairable).toBe(1);
  });

  it('目录不可写时应标记为人工处理问题', async () => {
    const result = await diagnoseEnvironment({
      platform: 'darwin',
      env: {
        OPENCODE_HOST: 'localhost',
        OPENCODE_PORT: '4096',
      },
      requiredEnvKeys: ['OPENCODE_HOST', 'OPENCODE_PORT'],
      writableDirectories: ['/secure/path'],
      commandExists: async () => true,
      portChecker: async () => ({ available: true, reason: 'ok' }),
      pathWritableChecker: async directory => directory !== '/secure/path',
    });

    const issue = getIssue(result.issues, 'path_not_writable');
    expect(issue).toBeDefined();
    expect(issue?.classification).toBe('manual_required');
    expect(issue?.detail).toContain('/secure/path');
    expect(result.summary.manualRequired).toBe(1);
  });

  it('关键环境变量缺失时应标记为人工处理问题', async () => {
    const result = await diagnoseEnvironment({
      platform: 'linux',
      env: {
        OPENCODE_PORT: '4096',
      },
      requiredEnvKeys: ['OPENCODE_HOST', 'OPENCODE_PORT'],
      writableDirectories: ['/tmp/opencode'],
      commandExists: async () => true,
      portChecker: async () => ({ available: true, reason: 'ok' }),
      pathWritableChecker: async () => true,
    });

    const issue = getIssue(result.issues, 'missing_env');
    expect(issue).toBeDefined();
    expect(issue?.classification).toBe('manual_required');
    expect(issue?.detail).toContain('OPENCODE_HOST');
  });

  it('端口被占用时应标记为人工处理问题', async () => {
    const result = await diagnoseEnvironment({
      platform: 'linux',
      env: {
        OPENCODE_HOST: '127.0.0.1',
        OPENCODE_PORT: '4096',
      },
      requiredEnvKeys: ['OPENCODE_HOST', 'OPENCODE_PORT'],
      writableDirectories: ['/tmp/opencode'],
      commandExists: async () => true,
      portChecker: async () => ({ available: false, reason: 'EADDRINUSE' }),
      pathWritableChecker: async () => true,
    });

    const issue = getIssue(result.issues, 'port_unavailable');
    expect(issue).toBeDefined();
    expect(issue?.classification).toBe('manual_required');
    expect(issue?.detail).toContain('4096');
  });
});
