import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createProactiveHeartbeatRunner } from '../src/reliability/proactive-heartbeat.js';

describe('proactive heartbeat runner', () => {
  it('runNow 应发送心跳并在 HEARTBEAT_OK 时静默', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proactive-heartbeat-test-'));
    const checklistPath = path.join(root, 'HEARTBEAT.md');
    const sessionStatePath = path.join(root, 'memory', 'heartbeat-session.json');
    fs.writeFileSync(checklistPath, '- [ ] opencode_http_down: check\n', 'utf-8');

    const notifyAlert = vi.fn(async () => undefined);
    const createSession = vi.fn(async () => ({ id: 's1' }));
    const getSessionById = vi.fn(async () => null);
    const sendMessage = vi.fn(async () => ({
      parts: [{ type: 'text', text: 'HEARTBEAT_OK' }],
    }));

    const runner = createProactiveHeartbeatRunner({
      enabled: true,
      intervalMs: 60000,
      prompt: 'Read HEARTBEAT.md and reply HEARTBEAT_OK',
      checklistPath,
      sessionStatePath,
      notifyAlert,
      client: {
        createSession,
        getSessionById,
        sendMessage,
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runner.runNow();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(notifyAlert).toHaveBeenCalledTimes(0);
    expect(fs.existsSync(sessionStatePath)).toBe(true);

    await runner.stop();
  });

  it('runNow 在非 HEARTBEAT_OK 时应触发告警回调', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proactive-heartbeat-alert-test-'));
    const checklistPath = path.join(root, 'HEARTBEAT.md');
    fs.writeFileSync(checklistPath, '- [ ] opencode_tcp_down: check\n', 'utf-8');

    const notifyAlert = vi.fn(async () => undefined);
    const runner = createProactiveHeartbeatRunner({
      enabled: true,
      intervalMs: 60000,
      prompt: 'Read HEARTBEAT.md and reply HEARTBEAT_OK',
      checklistPath,
      client: {
        createSession: async () => ({ id: 's2' }),
        getSessionById: async () => null,
        sendMessage: async () => ({
          parts: [{ type: 'text', text: 'HEARTBEAT_ALERT: tcp timeout' }],
        }),
      },
      notifyAlert,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runner.runNow();

    expect(notifyAlert).toHaveBeenCalledTimes(1);
    await runner.stop();
  });
});
