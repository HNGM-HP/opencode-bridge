/**
 * 企业微信适配器类型定义与常量
 *
 * 从 wecom-adapter.ts 提取。
 */

import type { BaseMessage } from '@wecom/aibot-node-sdk';

/** 企业微信消息扩展类型（SDK BaseMessage 的扩展字段） */
export interface WeComMessageExt {
  text?: { content: string };
  image?: { url?: string; aeskey?: string };
  file?: {
    url?: string;
    aeskey?: string;
    name?: string;
    size?: number;
  };
  mixed?: {
    msg_item: Array<{
      msgtype: 'text' | 'image';
      text?: { content: string };
      image?: { url?: string; aeskey?: string };
    }>;
  };
}

export type WeComMessageBody = BaseMessage & WeComMessageExt;
