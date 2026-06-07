/**
 * Admin HTTP Server（独立进程）
 *
 * 提供：
 * - 管理后台 API（配置、定时任务、服务管理、OpenCode 管理等）
 * - 静态前端文件托管
 *
 * 路由已按领域拆分到 routes/ 目录
 */

import express from 'express';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { RuntimeCronManager } from '../reliability/runtime-cron.js';
import type { BridgeManager } from './bridge-manager.js';
import { initResourceSystem } from '../services/resources/index.js';

// ── 导入路由模块
import { createSessionRoutes } from './routes/session.js';
import { registerWorkspaceGitRoutes } from './routes/workspace-git.js';
import { registerWorkspaceFilesRoutes } from './routes/workspace-files.js';
import { registerWorkspaceTerminalRoutes } from './routes/workspace-terminal.js';
import { registerResourcesTerminalRoutes, setupResourcesTerminalWebSocket } from './routes/resources-terminal.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerChatUploadRoutes } from './routes/chat-upload.js';
import { createResourcesRoutes } from './routes/resources.js';
import { createConfigRoutes } from './routes/config.js';
import { createCronRoutes } from './routes/cron.js';
import { createAdminRoutes } from './routes/admin.js';
import { createOpencodeRoutes } from './routes/opencode.js';
import { createLogsRoutes } from './routes/logs.js';
import { createWeixinRoutes } from './routes/weixin.js';
import { createWhatsAppRoutes } from './routes/whatsapp.js';
import { createDingtalkRoutes } from './routes/dingtalk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AdminServerOptions {
  port: number;
  cronManager?: RuntimeCronManager;
  startedAt?: Date;
  version?: string;
  bridgeManager?: BridgeManager;
}

export function createAdminServer(options: AdminServerOptions): { start: () => Promise<void>; stop: () => void } {
  const app = express();
  const { port, cronManager, bridgeManager } = options;
  const startedAt = options.startedAt ?? new Date();
  const version = options.version ?? 'unknown';
  const cronJobCount = () => cronManager?.listJobs().length ?? 0;

  app.use(express.json());

  // ── 静态前端文件（dist/public）
  const publicDir = path.resolve(__dirname, '../../dist/public');
  app.use(express.static(publicDir));

  // ── 管理后台不再启用账号 / 密码鉴权，所有请求直接放行
  const api = express.Router();

  // ── Register Chat Routes (Phase A: Native Chat UI)
  registerChatRoutes(app);
  registerChatUploadRoutes(app);

  // ── Config API（配置读取/保存）
  api.use('/config', createConfigRoutes());

  // ── Cron API（定时任务 CRUD）
  api.use('/cron', createCronRoutes({ cronManager }));

  // ── Admin API（服务状态、重启、升级、健康检查等）
  api.use('/admin', createAdminRoutes({
    version,
    startedAt,
    cronJobCount: cronJobCount(),
    bridgeManager,
  }));

  // ── OpenCode API（安装、启动、模型管理等）
  api.use('/opencode', createOpencodeRoutes({ version }));

  // ── Logs API（日志查询）
  api.use('/logs', createLogsRoutes());

  // ── 个人微信管理 API
  api.use('/weixin', createWeixinRoutes());

  // ── WhatsApp 状态 API
  api.use('/whatsapp', createWhatsAppRoutes());

  // ── 钉钉账号管理 API
  api.use('/dingtalk', createDingtalkRoutes());

  // ── Session 管理路由
  api.use('/sessions', createSessionRoutes());
  registerWorkspaceGitRoutes(api);
  registerWorkspaceFilesRoutes(api);
  registerWorkspaceTerminalRoutes(api);

  // ── Resources OAuth 代执行路由
  registerResourcesTerminalRoutes(api);

  // ── Resources 管理路由（Skills, MCP, Agents, Providers）
  api.use('/resources', createResourcesRoutes());

  app.use('/api', api);

  // SPA fallback（所有非 /api 路由返回 index.html）
  app.use((_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    async start() {
      // ── 初始化资源系统（skills/mcp/agents/providers 目录与事件总线）
      await initResourceSystem();

      server = app.listen(port, '0.0.0.0', () => {
        const interfaces = os.networkInterfaces();
        let lanIp = 'localhost';
        for (const name of Object.keys(interfaces)) {
          for (const net of interfaces[name] || []) {
            if (net.family === 'IPv4' && !net.internal) {
              lanIp = net.address;
              break;
            }
          }
          if (lanIp !== 'localhost') break;
        }
        console.log(`[Admin] 可视化配置面板已启动: http://${lanIp}:${port}`);
      });

      // ── 兼容旧入口；OAuth 已改为 HTTP 代执行
      setupResourcesTerminalWebSocket(server);
    },
    stop() {
      server?.close();
    },
  };
}
