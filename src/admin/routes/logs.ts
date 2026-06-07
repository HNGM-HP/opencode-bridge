/**
 * Logs API 路由
 *
 * 处理日志查询相关的 API 端点
 */

import express from 'express';
import { logStore } from '../../store/log-store.js';

export function createLogsRoutes(): express.Router {
  const router = express.Router();

  // ── GET /api/logs（查询日志）
  router.get('/', (req, res) => {
    const { level, search, start, end, page = '1', limit = '100' } = req.query;

    const result = logStore.query({
      level: level as 'debug' | 'info' | 'warn' | 'error' | undefined,
      search: search as string | undefined,
      start: start ? new Date(start as string) : undefined,
      end: end ? new Date(end as string) : undefined,
      page: parseInt(page as string, 10) || 1,
      limit: Math.min(parseInt(limit as string, 10) || 100, 500),
    });

    res.json(result);
  });

  // ── GET /api/logs/stats（日志统计）
  router.get('/stats', (_req, res) => {
    const stats = logStore.getStats();
    res.json(stats);
  });

  // ── DELETE /api/logs（清空日志）
  router.delete('/', (_req, res) => {
    logStore.clear();
    res.json({ ok: true, message: '日志已清空' });
  });

  return router;
}
