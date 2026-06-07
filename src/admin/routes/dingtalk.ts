/**
 * 钉钉 API 路由
 *
 * 处理钉钉账号管理相关的 API 端点
 */

import express from 'express';
import { configStore } from '../../store/config-store.js';

export function createDingtalkRoutes(): express.Router {
  const router = express.Router();

  // ── GET /api/dingtalk/accounts（列出所有钉钉账号）
  router.get('/accounts', (_req, res) => {
    const accounts = configStore.getDingtalkAccounts();
    const mapped = accounts.map(acc => ({
      id: acc.account_id,
      accountId: acc.account_id,
      clientId: acc.client_id,
      clientSecret: '••••••••',
      name: acc.name || acc.account_id,
      enabled: acc.enabled === 1,
      endpoint: acc.endpoint,
      createdAt: acc.created_at,
    }));
    res.json({ accounts: mapped });
  });

  // ── POST /api/dingtalk/accounts（创建钉钉账号）
  router.post('/accounts', (req, res) => {
    const { accountId, clientId, clientSecret, name, endpoint } = req.body;

    if (!accountId || !clientId || !clientSecret) {
      res.status(400).json({ error: '缺少必填字段: accountId, clientId, clientSecret' });
      return;
    }

    configStore.upsertDingtalkAccount({
      accountId,
      clientId,
      clientSecret,
      name,
      enabled: true,
      endpoint,
    });

    res.json({ ok: true, message: '账号创建成功' });
  });

  // ── PUT /api/dingtalk/accounts/:id（更新钉钉账号）
  router.put('/accounts/:id', (req, res) => {
    const accountId = req.params.id;
    const { clientId, clientSecret, name, endpoint } = req.body;

    const existing = configStore.getDingtalkAccount(accountId);
    if (!existing) {
      res.status(404).json({ error: '账号不存在' });
      return;
    }

    configStore.upsertDingtalkAccount({
      accountId,
      clientId: clientId || existing.client_id,
      clientSecret: clientSecret && clientSecret !== '••••••••' ? clientSecret : existing.client_secret,
      name: name !== undefined ? name : existing.name,
      enabled: existing.enabled === 1,
      endpoint: endpoint || existing.endpoint,
    });

    res.json({ ok: true, message: '账号更新成功' });
  });

  // ── DELETE /api/dingtalk/accounts/:id（删除账号）
  router.delete('/accounts/:id', (req, res) => {
    const accountId = req.params.id;
    const success = configStore.deleteDingtalkAccount(accountId);
    if (success) {
      res.json({ ok: true, message: `账号 ${accountId} 已删除` });
    } else {
      res.status(404).json({ error: '账号不存在' });
    }
  });

  // ── POST /api/dingtalk/accounts/:id/toggle（启用/禁用账号）
  router.post('/accounts/:id/toggle', async (req, res) => {
    const accountId = req.params.id;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled 必须是布尔值' });
      return;
    }

    const account = configStore.getDingtalkAccount(accountId);
    if (!account) {
      res.status(404).json({ error: '账号不存在' });
      return;
    }

    configStore.setDingtalkAccountEnabled(accountId, enabled);

    try {
      const { dingtalkAdapter } = await import('../../platform/adapters/dingtalk/index.js');
      if (enabled) {
        dingtalkAdapter.restartAccount(accountId);
      } else {
        dingtalkAdapter.stopAccount(accountId);
      }
    } catch (err) {
      console.error('[Admin] 控制钉钉连接失败:', err);
    }

    res.json({ ok: true, accountId, enabled, message: `账号已${enabled ? '启用' : '禁用'}` });
  });

  return router;
}
