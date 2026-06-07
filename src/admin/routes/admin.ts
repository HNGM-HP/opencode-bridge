/**
 * Admin API 路由
 *
 * 处理管理相关的 API 端点
 */

import express from 'express';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { configStore } from '../../store/config-store.js';
import { logStore } from '../../store/log-store.js';
import type { BridgeManager } from '../bridge-manager.js';
import { getAutoStart, setAutoStart } from '../autostart.js';
import { probeTcpPort } from '../utils.js';
import { opencodeConfig } from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AdminRoutesOptions {
  version: string;
  startedAt: Date;
  cronJobCount: number;
  bridgeManager: BridgeManager | undefined;
}

export function createAdminRoutes(options: AdminRoutesOptions): express.Router {
  const router = express.Router();
  const { version, startedAt, cronJobCount, bridgeManager } = options;

  // ── GET /api/admin/status
  router.get('/status', (_req, res) => {
    res.json({
      version,
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      startedAt: startedAt.toISOString(),
      dbPath: configStore.getDbPath(),
      cronJobCount,
    });
  });

  // ── POST /api/admin/restart
  router.post('/restart', async (_req, res) => {
    if (!bridgeManager) {
      res.status(503).json({ error: 'Bridge 管理器未初始化' });
      return;
    }

    // 同步等待重启完成
    const result = await bridgeManager.restart();

    if (result.success) {
      res.json({ ok: true, pid: result.pid, message: 'Bridge 重启成功' });
    } else {
      res.status(500).json({ error: result.error || '重启失败' });
    }
  });

  // ── POST /api/admin/stop-bridge（仅停止 Bridge 进程）
  router.post('/stop-bridge', async (_req, res) => {
    if (!bridgeManager) {
      res.status(503).json({ error: 'Bridge 管理器未初始化' });
      return;
    }

    res.json({ ok: true, message: 'Bridge 正在终止...' });

    // 异步执行终止逻辑
    bridgeManager.stop().then(() => {
      console.log('[Admin] Bridge 进程已终止（Web 面板保持运行）');
    }).catch((e: Error) => {
      console.error('[Admin] Bridge 终止失败:', e.message);
    });
  });

  // ── GET /api/admin/bridge
  router.get('/bridge', (_req, res) => {
    if (!bridgeManager) {
      res.json({ running: false, managed: false });
      return;
    }

    const status = bridgeManager.getStatus();
    res.json({ managed: true, ...status });
  });

  // ── POST /api/admin/upgrade
  router.post('/upgrade', async (_req, res) => {
    try {
      // 拉取最新代码
      try {
        execSync('git pull --ff-only', { encoding: 'utf-8', cwd: process.cwd(), windowsHide: true });
      } catch {
        // 忽略 git 错误，可能是本地修改
      }

      // 根据时区判断是否使用国内镜像
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const isChinaRegion = timezone.startsWith('Asia/Shanghai')
        || timezone.startsWith('Asia/Chongqing')
        || timezone.startsWith('Asia/Hong_Kong')
        || timezone.startsWith('Asia/Taipei')
        || timezone.startsWith('Asia/Macau');

      const originalEnv = process.env.PUPPETEER_DOWNLOAD_HOST;
      let puppeteerHostSet = false;

      if (isChinaRegion && !originalEnv) {
        process.env.PUPPETEER_DOWNLOAD_HOST = 'https://cdn.npmmirror.com/binaries/chrome-for-testing';
        puppeteerHostSet = true;
      }

      try {
        // 安装依赖
        execSync('npm install --include=dev', { encoding: 'utf-8', cwd: process.cwd(), windowsHide: true });
      } finally {
        if (puppeteerHostSet) {
          if (originalEnv) {
            process.env.PUPPETEER_DOWNLOAD_HOST = originalEnv;
          } else {
            delete process.env.PUPPETEER_DOWNLOAD_HOST;
          }
        }
      }

      // 构建前端
      execSync('npm run build:web', { encoding: 'utf-8', cwd: process.cwd(), windowsHide: true });

      // 构建后端
      execSync('npm run build', { encoding: 'utf-8', cwd: process.cwd(), windowsHide: true });

      res.json({ ok: true, message: '升级完成，请重启服务' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Admin] 升级失败:', message);
      res.status(500).json({ error: '升级失败：' + message });
    }
  });

  // ── POST /api/admin/shutdown（终止服务）
  router.post('/shutdown', async (_req, res) => {
    res.json({ ok: true, message: '服务正在终止...' });

    // 异步执行终止逻辑
    setTimeout(async () => {
      try {
        // 1. 终止 Bridge 子进程
        if (bridgeManager) {
          await bridgeManager.stop();
          console.log('[Admin] Bridge 进程已终止');
        }

        // 2. 终止 OpenCode 进程
        try {
          const processManagerPath = path.resolve(__dirname, '../../../scripts/process-manager.mjs');
          const { spawnSync } = await import('node:child_process');
          spawnSync(process.execPath, [processManagerPath, 'kill-opencode'], {
            stdio: 'inherit',
            windowsHide: true,
          });
          console.log('[Admin] OpenCode 进程已终止');
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          console.error('[Admin] 终止 OpenCode 失败:', message);
        }

        // 3. 退出 Admin 进程
        console.log('[Admin] 服务已终止');
        process.exit(0);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('[Admin] 终止服务失败:', message);
        process.exit(1);
      }
    }, 500);
  });

  // ── POST /api/admin/repair（修复功能）
  router.post('/repair', async (_req, res) => {
    const results: string[] = [];

    // 重新初始化数据库（如果不存在）
    try {
      const dbPath = configStore.getDbPath();
      const fs = await import('node:fs');
      if (dbPath && !fs.existsSync(dbPath)) {
        // 触发数据库初始化
        configStore.get();
        results.push('数据库已初始化');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      results.push(`数据库初始化失败: ${message}`);
    }

    // 清理日志缓存
    try {
      logStore.clear();
      results.push('日志缓存已清理');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      results.push(`日志清理失败: ${message}`);
    }

    res.json({ ok: true, results });
  });

  // ── GET /api/admin/onboarding-status
  router.get('/onboarding-status', (_req, res) => {
    res.json({ completed: configStore.isOnboardingCompleted() });
  });

  // ── PUT /api/admin/onboarding-status
  router.put('/onboarding-status', (req, res) => {
    const completed = Boolean(req.body?.completed);
    configStore.setOnboardingCompleted(completed);
    res.json({ ok: true, completed });
  });

  // ── GET /api/admin/check-update
  router.get('/check-update', async (_req, res) => {
    try {
      // 获取本地版本
      const localVersion = version;

      // 获取远程最新版本（通过 git fetch）
      try {
        execSync('git fetch --tags', { encoding: 'utf-8', timeout: 30000, windowsHide: true });
      } catch {
        // 忽略 fetch 错误
      }

      // 获取最新 tag
      let latestTag = '';
      try {
        latestTag = execSync('git describe --tags "$(git rev-list --tags --max-count=1)"', {
          encoding: 'utf-8',
          timeout: 5000,
          windowsHide: true,
        }).trim();
      } catch {
        // 没有 tag
      }

      // 检查是否有更新
      let hasUpdate = false;
      if (latestTag) {
        try {
          const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8', windowsHide: true }).trim();
          const tagCommit = execSync('git rev-parse ' + latestTag, { encoding: 'utf-8', windowsHide: true }).trim();
          hasUpdate = currentCommit !== tagCommit;
        } catch {
          // 忽略错误
        }
      }

      res.json({
        hasUpdate,
        currentVersion: localVersion,
        latestVersion: latestTag || null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ── GET /api/admin/health（健康检测）
  router.get('/health', async (_req, res) => {
    const health: {
      status: string;
      timestamp: string;
      checks: Record<string, { status: string; message: string }>;
    } = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'unknown', message: '' },
        opencode: { status: 'unknown', message: '' },
        feishu: { status: 'unknown', message: '' },
        discord: { status: 'unknown', message: '' },
        wecom: { status: 'unknown', message: '' },
        telegram: { status: 'unknown', message: '' },
        qq: { status: 'unknown', message: '' },
        whatsapp: { status: 'unknown', message: '' },
        weixin: { status: 'unknown', message: '' },
        dingtalk: { status: 'unknown', message: '' },
      },
    };

    // 检测数据库
    try {
      const dbPath = configStore.getDbPath();
      if (dbPath) {
        const fs = await import('node:fs');
        if (fs.existsSync(dbPath)) {
          health.checks.database = { status: 'ok', message: `数据库正常: ${dbPath}` };
        } else {
          health.checks.database = { status: 'warning', message: '数据库文件不存在，将自动创建' };
        }
      }
    } catch (e: unknown) {
      health.checks.database = { status: 'error', message: e instanceof Error ? e.message : 'Unknown error' };
      health.status = 'degraded';
    }

    // 检测 OpenCode 连接
    try {
      const probeResult = await probeTcpPort(opencodeConfig.host, opencodeConfig.port, 2000);
      const endpointLabel = `${opencodeConfig.host}:${opencodeConfig.port}`;
      if (probeResult.isOpen) {
        health.checks.opencode = { status: 'ok', message: `OpenCode 服务正常 (${endpointLabel})` };
      } else {
        health.checks.opencode = { status: 'error', message: `OpenCode 服务未响应 (${endpointLabel})` };
        health.status = 'degraded';
      }
    } catch (e: unknown) {
      health.checks.opencode = { status: 'error', message: e instanceof Error ? e.message : 'Unknown error' };
      health.status = 'degraded';
    }

    // 检测各平台配置
    const platformChecks: Array<{ key: string; enabledKey: string; check: (settings: Record<string, string>) => { status: string; message: string } }> = [
      {
        key: 'feishu',
        enabledKey: 'FEISHU_ENABLED',
        check: (s) => s.FEISHU_ENABLED === 'true' && s.FEISHU_APP_ID && s.FEISHU_APP_SECRET
          ? { status: 'ok', message: '飞书凭据已配置' }
          : s.FEISHU_ENABLED === 'true'
            ? { status: 'warning', message: '飞书已启用但凭据未配置' }
            : { status: 'ok', message: '飞书未启用' },
      },
      {
        key: 'discord',
        enabledKey: 'DISCORD_ENABLED',
        check: (s) => s.DISCORD_ENABLED === 'true' && s.DISCORD_TOKEN
          ? { status: 'ok', message: 'Discord 凭据已配置' }
          : s.DISCORD_ENABLED === 'true'
            ? { status: 'warning', message: 'Discord 已启用但凭据未配置' }
            : { status: 'ok', message: 'Discord 未启用' },
      },
      {
        key: 'wecom',
        enabledKey: 'WECOM_ENABLED',
        check: (s) => s.WECOM_ENABLED === 'true' && s.WECOM_BOT_ID && s.WECOM_SECRET
          ? { status: 'ok', message: '企业微信凭据已配置' }
          : s.WECOM_ENABLED === 'true'
            ? { status: 'warning', message: '企业微信已启用但凭据未配置' }
            : { status: 'ok', message: '企业微信未启用' },
      },
      {
        key: 'telegram',
        enabledKey: 'TELEGRAM_ENABLED',
        check: (s) => s.TELEGRAM_ENABLED === 'true' && s.TELEGRAM_BOT_TOKEN
          ? { status: 'ok', message: 'Telegram 凭据已配置' }
          : s.TELEGRAM_ENABLED === 'true'
            ? { status: 'warning', message: 'Telegram 已启用但凭据未配置' }
            : { status: 'ok', message: 'Telegram 未启用' },
      },
      {
        key: 'qq',
        enabledKey: 'QQ_ENABLED',
        check: (s) => {
          if (s.QQ_ENABLED !== 'true') return { status: 'ok', message: 'QQ 未启用' };
          const protocol = s.QQ_PROTOCOL || 'onebot';
          if (protocol === 'official') {
            return s.QQ_APP_ID && s.QQ_SECRET
              ? { status: 'ok', message: 'QQ 官方 API 已配置' }
              : { status: 'warning', message: 'QQ 已启用但官方 API 凭据未配置' };
          }
          return s.QQ_ONEBOT_WS_URL || s.QQ_ONEBOT_HTTP_URL
            ? { status: 'ok', message: 'QQ OneBot 已配置' }
            : { status: 'warning', message: 'QQ 已启用但 OneBot 地址未配置' };
        },
      },
      {
        key: 'whatsapp',
        enabledKey: 'WHATSAPP_ENABLED',
        check: (s) => {
          if (s.WHATSAPP_ENABLED !== 'true') return { status: 'ok', message: 'WhatsApp 未启用' };
          const mode = s.WHATSAPP_MODE || 'personal';
          if (mode === 'business') {
            return s.WHATSAPP_BUSINESS_PHONE_ID && s.WHATSAPP_BUSINESS_ACCESS_TOKEN
              ? { status: 'ok', message: 'WhatsApp Business API 已配置' }
              : { status: 'warning', message: 'WhatsApp Business 已启用但凭据未配置' };
          }
          return { status: 'ok', message: 'WhatsApp Personal 模式已启用' };
        },
      },
      {
        key: 'weixin',
        enabledKey: 'WEIXIN_ENABLED',
        check: (s) => {
          if (s.WEIXIN_ENABLED !== 'true') return { status: 'ok', message: '个人微信未启用' };
          const accounts = configStore.getWeixinAccounts();
          const enabledAccounts = accounts.filter(a => a.enabled === 1);
          return enabledAccounts.length > 0
            ? { status: 'ok', message: `个人微信已配置 ${enabledAccounts.length} 个账号` }
            : { status: 'warning', message: '个人微信已启用但无有效账号' };
        },
      },
      {
        key: 'dingtalk',
        enabledKey: 'DINGTALK_ENABLED',
        check: (s) => {
          if (s.DINGTALK_ENABLED !== 'true') return { status: 'ok', message: '钉钉未启用' };
          const accounts = configStore.getDingtalkAccounts();
          const enabledAccounts = accounts.filter(a => a.enabled === 1);
          return enabledAccounts.length > 0
            ? { status: 'ok', message: `钉钉已配置 ${enabledAccounts.length} 个账号` }
            : { status: 'warning', message: '钉钉已启用但无有效账号' };
        },
      },
    ];

    for (const pc of platformChecks) {
      try {
        const settings = configStore.get() as Record<string, string>;
        health.checks[pc.key] = pc.check(settings);
      } catch (e: unknown) {
        health.checks[pc.key] = { status: 'error', message: e instanceof Error ? e.message : 'Unknown error' };
      }
    }

    res.json(health);
  });

  // ── GET /api/admin/autostart（查询开机自启状态）
  router.get('/autostart', (_req, res) => {
    try {
      res.json(getAutoStart());
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : '查询自启状态失败' });
    }
  });

  // ── PUT /api/admin/autostart（启用/关闭开机自启）
  router.put('/autostart', (req, res) => {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled 必须为布尔值' });
      return;
    }
    try {
      setAutoStart(enabled);
      res.json({ ok: true, ...getAutoStart() });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : '设置自启失败' });
    }
  });

  return router;
}