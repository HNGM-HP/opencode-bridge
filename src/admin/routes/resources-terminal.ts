/**
 * Provider OAuth actions.
 *
 * The Web UI triggers structured login/logout/list actions and shows status only;
 * it does not expose an interactive terminal to users.
 */

import express from 'express';
import { createServer } from 'http';
import { spawn } from 'node:child_process';
import { getProviderRegistry } from '../../services/resources/providers/manager.js';

const ACTION_TIMEOUT_MS = 10 * 60 * 1000;
const PROVIDER_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

type OAuthActionResult = {
  ok: boolean;
  status: 'completed' | 'failed' | 'timeout';
  message: string;
  output?: string;
  error?: string;
};

function runProviderCommand(action: 'login' | 'logout' | 'list', providerId?: string): Promise<OAuthActionResult> {
  return new Promise((resolve) => {
    if (providerId && !PROVIDER_ID_PATTERN.test(providerId)) {
      resolve({ ok: false, status: 'failed', message: 'Provider ID 不合法', error: 'Invalid provider id' });
      return;
    }

    const args = ['providers', action];
    if (providerId) args.push(providerId);

    const child = spawn('opencode', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        ok: false,
        status: 'timeout',
        message: 'OAuth 操作超时，请稍后重试',
        output: stdout.trim() || undefined,
        error: stderr.trim() || undefined,
      });
    }, ACTION_TIMEOUT_MS);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: code === 0,
        status: code === 0 ? 'completed' : 'failed',
        message: code === 0 ? 'OAuth 操作已完成' : `OAuth 操作失败（退出码 ${code ?? 'unknown'}）`,
        output: stdout.trim() || undefined,
        error: stderr.trim() || undefined,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        status: 'failed',
        message: 'OAuth 操作启动失败',
        error: err.message,
      });
    });
  });
}

export function registerResourcesTerminalRoutes(api: express.Router): void {
  api.post('/resources/providers/:id/oauth/login', async (req, res) => {
    const result = await runProviderCommand('login', req.params.id);
    if (result.ok) await getProviderRegistry().reloadAuth();
    res.status(result.ok ? 200 : 500).json(result);
  });

  api.post('/resources/providers/:id/oauth/logout', async (req, res) => {
    const result = await runProviderCommand('logout', req.params.id);
    if (result.ok) await getProviderRegistry().reloadAuth();
    res.status(result.ok ? 200 : 500).json(result);
  });

  api.get('/resources/providers/oauth/list', async (_req, res) => {
    const result = await runProviderCommand('list');
    if (result.ok) await getProviderRegistry().reloadAuth();
    res.status(result.ok ? 200 : 500).json(result);
  });
}

export function setupResourcesTerminalWebSocket(httpServer: ReturnType<typeof createServer>): void {
  void httpServer;
}
