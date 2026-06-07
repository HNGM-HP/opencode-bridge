/**
 * 微信适配器工具函数
 *
 * 从 weixin-adapter.ts 提取的模块级纯函数。
 */

import type { WeixinAccountRow } from '../../store/config-store.js';
import type { WeixinCredentials } from './weixin/weixin-types.js';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function accountToCreds(account: WeixinAccountRow): WeixinCredentials {
  return {
    botToken: account.token,
    ilinkBotId: account.account_id,
    baseUrl: account.base_url || 'https://ilinkai.weixin.qq.com',
    cdnBaseUrl: account.cdn_base_url || 'https://novac2c.cdn.weixin.qq.com/c2c',
  };
}
