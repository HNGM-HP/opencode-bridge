/**
 * Config API 路由
 *
 * 处理配置读取/保存相关的 API 端点
 */

import express from 'express';
import { configStore, type BridgeSettings } from '../../store/config-store.js';

// ── 需要重启才能生效的敏感配置项
const RESTART_REQUIRED_KEYS: (keyof BridgeSettings)[] = [
  'FEISHU_ENABLED',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_ENCRYPT_KEY',
  'FEISHU_VERIFICATION_TOKEN',
  'DISCORD_ENABLED',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'WECOM_ENABLED',
  'WECOM_BOT_ID',
  'WECOM_SECRET',
  'WEIXIN_ENABLED',
  'DINGTALK_ENABLED',
  'TELEGRAM_ENABLED',
  'TELEGRAM_BOT_TOKEN',
  'QQ_ENABLED',
  'QQ_PROTOCOL',
  'QQ_ONEBOT_HTTP_URL',
  'QQ_ONEBOT_WS_URL',
  'QQ_APP_ID',
  'QQ_SECRET',
  'QQ_CALLBACK_URL',
  'QQ_ENCRYPT_KEY',
  'WHATSAPP_ENABLED',
  'WHATSAPP_MODE',
  'WHATSAPP_BUSINESS_PHONE_ID',
  'WHATSAPP_BUSINESS_ACCESS_TOKEN',
  'OPENCODE_HOST',
  'OPENCODE_PORT',
  'OPENCODE_SERVER_USERNAME',
  'OPENCODE_SERVER_PASSWORD',
  'OPENCODE_AUTO_START',
  'OPENCODE_AUTO_START_FOREGROUND',
  'RELIABILITY_CRON_ENABLED',
  'RELIABILITY_CRON_API_ENABLED',
  'RELIABILITY_CRON_API_HOST',
  'RELIABILITY_CRON_API_PORT',
  'RELIABILITY_CRON_API_TOKEN',
];

const SECRET_KEYS: (keyof BridgeSettings)[] = [
  'FEISHU_APP_SECRET',
  'DISCORD_TOKEN',
  'WECOM_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'QQ_SECRET',
  'WHATSAPP_BUSINESS_ACCESS_TOKEN',
  'OPENCODE_SERVER_PASSWORD',
  'RELIABILITY_CRON_API_TOKEN',
];

const MASK = '••••••••';

export function createConfigRoutes(): express.Router {
  const router = express.Router();

  // ── GET /api/config
  router.get('/', (_req, res) => {
    const settings = configStore.get();
    // 脱敏：不直接返回密钥原文给前端
    const masked = { ...settings };
    for (const k of SECRET_KEYS) {
      if (masked[k]) {
        masked[k] = MASK;
      }
    }
    res.json({ settings: masked });
  });

  // ── POST /api/config
  router.post('/', (req, res) => {
    const incoming = req.body as Partial<BridgeSettings>;
    const current = configStore.get();

    // 若前端传来的仍是掩码值，则保留原始值
    const merged: BridgeSettings = { ...current };
    for (const [k, v] of Object.entries(incoming)) {
      const key = k as keyof BridgeSettings;
      if (SECRET_KEYS.includes(key) && v === MASK) {
        continue; // 保留原值，不覆盖
      }
      if (v === undefined || v === '') {
        delete merged[key];
      } else {
        (merged as Record<string, string>)[key] = String(v);
      }
    }

    configStore.set(merged);

    // 同步更新 process.env，确保运行时配置立即生效
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') {
        process.env[key] = String(value);
      } else {
        delete process.env[key];
      }
    }

    // 检测哪些敏感 key 发生了变更
    const changedRestartKeys = RESTART_REQUIRED_KEYS.filter(k => {
      const oldVal = (current as Record<string, string | undefined>)[k] ?? '';
      const newVal = (incoming as Record<string, string | undefined>)[k] ?? '';
      return newVal !== MASK && newVal !== oldVal;
    });

    res.json({
      ok: true,
      needRestart: changedRestartKeys.length > 0,
      changedKeys: changedRestartKeys,
    });
  });

  return router;
}
