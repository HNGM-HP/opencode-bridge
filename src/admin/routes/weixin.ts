/**
 * 微信个人号 API 路由
 *
 * 处理微信账号管理、QR 登录相关的 API 端点
 */

import express from 'express';
import { configStore } from '../../store/config-store.js';

export function createWeixinRoutes(): express.Router {
  const router = express.Router();

  // ── GET /api/weixin/accounts（列出所有微信账号）
  router.get('/accounts', (_req, res) => {
    const accounts = configStore.getWeixinAccounts();
    const mapped = accounts.map(acc => ({
      id: acc.account_id,
      wxid: acc.account_id,
      nickname: acc.name || acc.account_id,
      avatar: '',
      enabled: acc.enabled === 1,
      userId: acc.user_id,
      createdAt: acc.created_at,
      lastLoginAt: acc.last_login_at,
    }));
    res.json({ accounts: mapped });
  });

  // ── DELETE /api/weixin/accounts/:id（删除账号）
  router.delete('/accounts/:id', (req, res) => {
    const accountId = req.params.id;
    const success = configStore.deleteWeixinAccount(accountId);
    if (success) {
      res.json({ ok: true, message: `账号 ${accountId} 已删除` });
    } else {
      res.status(404).json({ error: '账号不存在' });
    }
  });

  // ── POST /api/weixin/accounts/:id/toggle（启用/禁用账号）
  router.post('/accounts/:id/toggle', async (req, res) => {
    const accountId = req.params.id;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled 必须是布尔值' });
      return;
    }

    const account = configStore.getWeixinAccount(accountId);
    if (!account) {
      res.status(404).json({ error: '账号不存在' });
      return;
    }

    configStore.setWeixinAccountEnabled(accountId, enabled);

    try {
      const { weixinAdapter } = await import('../../platform/adapters/weixin-adapter.js');
      weixinAdapter.restartAccount(accountId);
    } catch (err) {
      console.error('[Admin] 控制消息轮询失败:', err);
    }

    res.json({ ok: true, accountId, enabled, message: `账号已${enabled ? '启用' : '禁用'}` });
  });

  // ── POST /api/weixin/login/start（启动 QR 登录）
  router.post('/login/start', async (_req, res) => {
    try {
      const { startQrLoginSession } = await import('../../platform/adapters/weixin/weixin-auth.js');
      const { sessionId, qrImage } = await startQrLoginSession();
      res.json({ ok: true, sessionId, qrImage });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Admin] 启动微信登录失败:', message);
      res.status(500).json({ error: '启动登录失败: ' + message });
    }
  });

  // ── GET /api/weixin/login/wait（轮询登录状态）
  router.get('/login/wait', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: '缺少 sessionId 参数' });
      return;
    }

    try {
      const { pollQrLoginStatus } = await import('../../platform/adapters/weixin/weixin-auth.js');
      const session = await pollQrLoginStatus(sessionId);

      const response: {
        ok: boolean;
        sessionId: string;
        status: string;
        qrImage?: string;
        account?: { id: string; wxid: string; nickname: string; avatar: string; enabled: boolean };
        error?: string;
      } = {
        ok: true,
        sessionId,
        status: session.status,
      };

      if (session.qrImage) {
        response.qrImage = session.qrImage;
      }

      if (session.error) {
        response.error = session.error;
      }

      if (session.status === 'confirmed' && session.accountId) {
        response.account = {
          id: session.accountId,
          wxid: session.accountId,
          nickname: session.accountId,
          avatar: '',
          enabled: true,
        };

        try {
          const { weixinAdapter } = await import('../../platform/adapters/weixin-adapter.js');
          weixinAdapter.restartAccount(session.accountId);
          console.log(`[Admin] 已启动账号 ${session.accountId} 的消息轮询`);
        } catch (err) {
          console.error('[Admin] 启动消息轮询失败:', err);
        }
      }

      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Admin] 轮询微信登录状态失败:', message);
      res.status(500).json({ error: '轮询登录状态失败: ' + message });
    }
  });

  // ── POST /api/weixin/login/cancel（取消登录）
  router.post('/login/cancel', (req, res) => {
    const sessionId = req.body.sessionId as string;
    if (sessionId) {
      // 动态导入并取消登录会话
      import('../../platform/adapters/weixin/weixin-auth.js').then(({ cancelQrLoginSession }) => {
        cancelQrLoginSession(sessionId);
      }).catch(() => {});
    }
    res.json({ ok: true, message: '登录已取消' });
  });

  return router;
}
