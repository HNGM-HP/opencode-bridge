/**
 * OpenCode API 路由
 *
 * 处理 OpenCode 相关 API 端点
 */

import express from 'express';
import { execSync, spawn } from 'node:child_process';
import { configStore } from '../../store/config-store.js';
import { opencodeClient } from '../../opencode/client.js';
import { opencodeConfig } from '../../config.js';
import { probeTcpPort, resolveProcessManagerPath, toRecord, parseOptionalBoolean, buildOpencodeAuthHeaders } from '../utils.js';

export interface OpencodeRoutesOptions {
  version: string;
}

export function createOpencodeRoutes(options: OpencodeRoutesOptions): express.Router {
  const router = express.Router();
  const { version } = options;

  // ── GET /api/opencode/status
  router.get('/status', async (_req, res) => {
    try {
      let opencodeVersion: string | null = null;
      try {
        opencodeVersion = execSync('opencode --version', { encoding: 'utf-8', timeout: 5000, windowsHide: true }).trim();
      } catch {
        // 未安装
      }

      const probeResult = await probeTcpPort(opencodeConfig.host, opencodeConfig.port, 2000);

      res.json({
        installed: !!opencodeVersion,
        version: opencodeVersion,
        portOpen: probeResult.isOpen,
        portReason: probeResult.reason,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ── GET /api/opencode/check-update
  router.get('/check-update', async (_req, res) => {
    try {
      let latestVersion: string | null = null;
      let githubError: string | null = null;
      try {
        const https = await import('node:https');
        const ghRes = await new Promise<string>((resolve, reject) => {
          const req = https.request(
            {
              hostname: 'api.github.com',
              path: '/repos/anomalyco/opencode/releases/latest',
              method: 'GET',
              headers: { 'User-Agent': 'opencode-bridge' },
              timeout: 10000,
            },
            (ghRes) => {
              let data = '';
              ghRes.on('data', chunk => (data += chunk));
              ghRes.on('end', () => resolve(data));
              ghRes.on('error', reject);
            }
          );
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
          });
          req.end();
        });

        const release = JSON.parse(ghRes);
        if (release.tag_name) {
          latestVersion = release.tag_name.replace(/^v/, '');
        }
      } catch (e: unknown) {
        githubError = e instanceof Error ? e.message : String(e);
      }

      res.json({ latestVersion, githubError });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ── POST /api/opencode/install
  router.post('/install', (_req, res) => {
    res.json({ ok: true, message: '正在安装 OpenCode...' });

    setTimeout(() => {
      try {
        execSync('npm i -g opencode-ai', { encoding: 'utf-8', timeout: 120000, windowsHide: true });
        console.log('[Admin] OpenCode 安装完成');
      } catch (error: unknown) {
        console.error('[Admin] OpenCode 安装失败:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, 100);
  });

  // ── POST /api/opencode/upgrade
  router.post('/upgrade', (_req, res) => {
    res.json({ ok: true, message: '正在升级 OpenCode...' });

    setTimeout(() => {
      try {
        execSync('opencode upgrade', { encoding: 'utf-8', timeout: 120000, windowsHide: true });
        console.log('[Admin] OpenCode 升级完成');
      } catch (error: unknown) {
        console.error('[Admin] OpenCode 升级失败:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, 100);
  });

  // ── POST /api/opencode/start
  router.post('/start', async (_req, res) => {
    try {
      const { spawnSync: spawnSyncLocal } = await import('node:child_process');
      const scriptPath = resolveProcessManagerPath();
      const isWindows = process.platform === 'win32';

      const port = opencodeConfig.port;
      const processArgs = port !== 4096
        ? [scriptPath, 'start-opencode', '--port', String(port)]
        : [scriptPath, 'start-opencode'];
      const result = spawnSyncLocal(process.execPath, processArgs, {
        encoding: 'utf-8',
        timeout: 20000,
        windowsHide: isWindows,
      });

      const stdout = (result.stdout || '').trim();
      const stderr = (result.stderr || '').trim();
      if (stdout) console.log('[Admin] opencode start:', stdout);
      if (stderr) console.warn('[Admin] opencode start stderr:', stderr);

      if (result.status !== 0 || result.error) {
        const msg = result.error?.message || stderr || '启动失败';
        res.status(500).json({ error: msg });
        return;
      }

      const skipped = stdout.includes('已在运行');
      res.json({
        ok: true,
        message: skipped ? 'OpenCode 已在后台运行（无需重复启动）' : 'OpenCode 已后台启动',
      });
    } catch (error: unknown) {
      res.status(500).json({ error: '启动失败：' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // ── POST /api/opencode/attach
  router.post('/attach', (req, res) => {
    const isWindows = process.platform === 'win32';
    if (!isWindows) {
      res.status(400).json({ error: '前台 attach 窗口仅支持 Windows 平台' });
      return;
    }

    try {
      const { port = 4096, host = 'localhost' } = req.body || {};
      const attachUrl = `http://${host}:${port}`;

      spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Start-Process cmd -ArgumentList '/k opencode attach ${attachUrl}'`,
        ],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }
      ).unref();

      console.log(`[Admin] OpenCode attach 窗口已拉起（${attachUrl}）`);
      res.json({ ok: true, message: `OpenCode 前台窗口已打开（${attachUrl}）` });
    } catch (error: unknown) {
      res.status(500).json({ error: '打开前台窗口失败：' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // ── POST /api/opencode/stop
  router.post('/stop', (_req, res) => {
    res.json({ ok: true, message: '正在终止 OpenCode...' });

    setTimeout(() => {
      try {
        const scriptPath = resolveProcessManagerPath();
        const result = execSync('"' + process.execPath + '" "' + scriptPath + '" kill-opencode', {
          encoding: 'utf-8',
          timeout: 15000,
          windowsHide: true,
        });
        console.log('[Admin] OpenCode 终止结果:', result.trim());
      } catch (error: unknown) {
        console.error('[Admin] OpenCode 终止失败:', error instanceof Error ? error.message : 'Unknown error');
        if (error instanceof Error && 'stdout' in error) {
          console.error('[Admin] stdout:', (error as any).stdout);
        }
        if (error instanceof Error && 'stderr' in error) {
          console.error('[Admin] stderr:', (error as any).stderr);
        }
      }
    }, 100);
  });

  // ── GET /api/opencode/models
  router.get('/models', async (_req, res) => {
    try {
      const { execSync } = await import('node:child_process');
      const output = execSync('opencode models', { encoding: 'utf-8', timeout: 30000, windowsHide: true });
      const models = output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('opencode/'));

      const grouped: Record<string, string[]> = {};
      for (const model of models) {
        const [provider, ...rest] = model.split('/');
        const modelName = rest.join('/');
        if (!grouped[provider]) grouped[provider] = [];
        grouped[provider].push(modelName);
      }
      res.json({ models: grouped, raw: models });
    } catch (error: unknown) {
      console.warn('[Admin] 获取模型列表失败（OpenCode 可能未运行）:', error instanceof Error ? error.message : 'Unknown error');
      res.json({ models: {}, raw: [], fallback: true, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ── GET /api/opencode/model-catalog
  router.get('/model-catalog', async (_req, res) => {
    try {
      const providersResult = await opencodeClient.getProviders();
      const providers = Array.isArray(providersResult.providers) ? providersResult.providers : [];

      const items = providers
        .map(provider => {
          const record = provider as Record<string, unknown>;
          const id = extractProviderId(provider);
          if (!id) return null;

          const name = typeof record.name === 'string' && record.name.trim()
            ? record.name.trim()
            : id;

          return { id, name, models: extractProviderModels(provider) };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));

      res.json({ providers: items });
    } catch (error: unknown) {
      console.warn('[Admin] 获取完整模型目录失败（OpenCode 可能未运行）:', error instanceof Error ? error.message : 'Unknown error');
      res.json({ providers: [], fallback: true, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ── GET /api/opencode/enabled-models-sync
  router.get('/enabled-models-sync', async (_req, res) => {
    try {
      let config: unknown;
      try {
        config = await opencodeClient.getConfig();
      } catch {
        const connected = await opencodeClient.connect();
        if (!connected) {
          throw new Error('OpenCode 当前不可连接，无法读取运行时配置');
        }
        config = await opencodeClient.getConfig();
      }

      const models = extractEnabledModelsFromOpencodeConfig(config);
      res.json({ source: 'opencode_runtime_config', models, count: models.length });
    } catch (error: unknown) {
      console.warn('[Admin] 同步 OpenCode 已启用模型失败（OpenCode 可能未运行）:', error instanceof Error ? error.message : 'Unknown error');
      res.json({ models: [], count: 0, fallback: true, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}

// ── 辅助函数（从 OpenCode 配置中提取已启用模型）

function extractEnabledModelsFromOpencodeConfig(config: unknown): string[] {
  const root = toRecord(config);
  if (!root) return [];

  const providersRecord = toRecord(root.provider) || toRecord(root.providers);
  if (!providersRecord) return [];

  const selected = new Set<string>();
  for (const [providerId, rawProvider] of Object.entries(providersRecord)) {
    const providerRecord = toRecord(rawProvider);
    if (!providerRecord) continue;

    const rawModels = providerRecord.models;
    if (Array.isArray(rawModels)) {
      for (const item of rawModels) {
        if (typeof item === 'string' && item.trim()) {
          selected.add(`${providerId}/${item.trim()}`);
          continue;
        }
        const modelRecord = toRecord(item);
        const modelId = typeof modelRecord?.id === 'string' && modelRecord.id.trim()
          ? modelRecord.id.trim()
          : '';
        if (modelId) {
          selected.add(`${providerId}/${modelId}`);
        }
      }
      continue;
    }

    const modelMap = toRecord(rawModels);
    if (!modelMap) continue;

    for (const [modelKey, rawModel] of Object.entries(modelMap)) {
      if (rawModel === false || rawModel === null) continue;

      const modelRecord = toRecord(rawModel);
      const disabled = parseOptionalBoolean(modelRecord?.disabled);
      if (disabled === true) continue;

      const configId = typeof modelRecord?.id === 'string' && modelRecord.id.trim()
        ? modelRecord.id.trim()
        : modelKey.trim();
      if (configId) {
        selected.add(`${providerId}/${configId}`);
      }
    }
  }

  return Array.from(selected).sort((left, right) => left.localeCompare(right, 'en'));
}

function extractProviderId(provider: unknown): string | undefined {
  const record = toRecord(provider);
  const rawId = typeof record?.id === 'string' ? record.id.trim() : '';
  return rawId || undefined;
}

function extractProviderModels(provider: unknown): Array<{ id: string; name: string }> {
  const record = toRecord(provider);
  const rawModels = record?.models;
  const models: Array<{ id: string; name: string }> = [];
  const dedupe = new Set<string>();

  const pushModel = (rawModel: unknown, fallbackId?: string): void => {
    const fallbackNormalized = typeof fallbackId === 'string' ? fallbackId.trim() : '';
    if (!rawModel || typeof rawModel !== 'object') {
      if (!fallbackNormalized) return;
      const key = fallbackNormalized.toLowerCase();
      if (dedupe.has(key)) return;
      dedupe.add(key);
      models.push({ id: fallbackNormalized, name: fallbackNormalized });
      return;
    }

    const modelRecord = rawModel as Record<string, unknown>;
    const modelId = typeof modelRecord.id === 'string' && modelRecord.id.trim()
      ? modelRecord.id.trim()
      : fallbackNormalized;
    if (!modelId) return;

    const modelName = typeof modelRecord.name === 'string' && modelRecord.name.trim()
      ? modelRecord.name.trim()
      : modelId;
    const key = modelId.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);
    models.push({ id: modelId, name: modelName });
  };

  if (Array.isArray(rawModels)) {
    for (const rawModel of rawModels) {
      pushModel(rawModel);
    }
  } else {
    const modelMap = toRecord(rawModels);
    if (modelMap) {
      for (const [modelKey, rawModel] of Object.entries(modelMap)) {
        pushModel(rawModel, modelKey);
      }
    }
  }

  return models.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
}
