/**
 * WhatsApp API 路由
 *
 * 处理 WhatsApp 连接状态相关的 API 端点
 */

import express from 'express';
import { configStore } from '../../store/config-store.js';

export function createWhatsAppRoutes(): express.Router {
  const router = express.Router();

  // ── GET /api/whatsapp/status（获取连接状态和二维码）
  router.get('/status', async (_req, res) => {
    try {
      const { readStatusFile } = await import('../../platform/adapters/whatsapp-adapter.js');
      const status = readStatusFile();
      if (status) {
        res.json({ ok: true, ...status });
      } else {
        const settings = configStore.get();
        res.json({
          ok: true,
          enabled: settings.WHATSAPP_ENABLED === 'true',
          mode: (settings.WHATSAPP_MODE || 'personal') as 'personal' | 'business',
          status: 'disconnected',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Admin] 获取 WhatsApp 状态失败:', message);
      res.status(500).json({ error: '获取状态失败: ' + message });
    }
  });

  return router;
}
