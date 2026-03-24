/**
 * 钉钉 AI Card 流式响应模块
 *
 * 支持 AI Card 创建、流式更新、完成
 * 实现类似飞书的弹出式面板效果
 */

import type { DingtalkConfig, DingtalkAICardInstance, DingtalkAICardTarget } from './dingtalk-types.js';
import { DINGTALK_API } from './dingtalk-types.js';
import axios from 'axios';

// ──────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────

/** AI Card 模板 ID */
const AI_CARD_TEMPLATE_ID = '02fcf2f4-5e02-4a85-b672-46d1f715543e.schema';

/** AI Card 状态 */
const AICardStatus = {
  PROCESSING: '1',
  INPUTING: '2',
  FINISHED: '3',
  EXECUTING: '4',
  FAILED: '5',
} as const;

/** HTTP 客户端 */
const httpClient = axios.create({
  timeout: 30_000,
});

// ──────────────────────────────────────────────
// Token 管理
// ──────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiredAt: number }>();

async function getAccessToken(config: DingtalkConfig): Promise<string> {
  const cacheKey = config.clientId;
  const cached = tokenCache.get(cacheKey);

  // 提前 5 分钟刷新
  if (cached && cached.expiredAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  // 获取新 token
  const resp = await httpClient.get(
    `${DINGTALK_API}/v1.0/oauth2/accessToken`,
    {
      params: {
        appKey: config.clientId,
        appSecret: config.clientSecret,
      },
    }
  );

  if (!resp.data?.accessToken) {
    throw new Error('获取 access_token 失败');
  }

  tokenCache.set(cacheKey, {
    token: resp.data.accessToken,
    expiredAt: resp.data.expireIn * 1000 + Date.now(),
  });

  return resp.data.accessToken;
}

// ──────────────────────────────────────────────
// Markdown 格式修正
// ──────────────────────────────────────────────

/**
 * 确保 Markdown 表格前有空行
 */
function ensureTableBlankLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  const tableDividerRegex = /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/;
  const tableRowRegex = /^\s*\|?.*\|.*\|?\s*$/;

  const isDivider = (line: string) =>
    line &&
    typeof line === 'string' &&
    line.includes('|') &&
    tableDividerRegex.test(line);

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1] ?? '';

    if (
      tableRowRegex.test(currentLine) &&
      isDivider(nextLine) &&
      i > 0 &&
      lines[i - 1].trim() !== '' &&
      !tableRowRegex.test(lines[i - 1])
    ) {
      result.push('');
    }

    result.push(currentLine);
  }
  return result.join('\n');
}

// ──────────────────────────────────────────────
// AI Card 操作
// ──────────────────────────────────────────────

/**
 * 构建卡片投放请求体
 */
function buildDeliverBody(
  cardInstanceId: string,
  target: DingtalkAICardTarget,
  robotCode: string,
): Record<string, unknown> {
  const base = { outTrackId: cardInstanceId, userIdType: 1 };

  if (target.type === 'group') {
    return {
      ...base,
      openSpaceId: `dtv1.card//IM_GROUP.${target.openConversationId}`,
      imGroupOpenDeliverModel: {
        robotCode,
      },
    };
  }

  return {
    ...base,
    openSpaceId: `dtv1.card//IM_ROBOT.${target.userId}`,
    imRobotOpenDeliverModel: {
      spaceType: 'IM_ROBOT',
      robotCode,
      extension: {
        dynamicSummary: 'true',
      },
    },
  };
}

/**
 * 创建 AI Card
 */
export async function createAICard(
  config: DingtalkConfig,
  target: DingtalkAICardTarget,
  conversationId: string,
): Promise<DingtalkAICardInstance | null> {
  try {
    const token = await getAccessToken(config);
    const cardInstanceId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    console.log(`[钉钉][AICard] 创建卡片: conversationId=${conversationId}, cardInstanceId=${cardInstanceId}`);

    // 1. 创建卡片实例
    const createBody = {
      cardTemplateId: AI_CARD_TEMPLATE_ID,
      outTrackId: cardInstanceId,
      cardData: {
        cardParamMap: {
          config: JSON.stringify({ autoLayout: true }),
        },
      },
      callbackType: 'STREAM',
      imGroupOpenSpaceModel: { supportForward: true },
      imRobotOpenSpaceModel: { supportForward: true },
    };

    await httpClient.post(
      `${DINGTALK_API}/v1.0/card/instances`,
      createBody,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    // 2. 投放卡片
    const deliverBody = buildDeliverBody(cardInstanceId, target, config.clientId);

    await httpClient.post(
      `${DINGTALK_API}/v1.0/card/instances/deliver`,
      deliverBody,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`[钉钉][AICard] 卡片创建成功: ${cardInstanceId}`);

    return {
      cardInstanceId,
      conversationId,
      target,
    };
  } catch (error: any) {
    console.error(`[钉钉][AICard] 创建失败:`, error.message);
    return null;
  }
}

/**
 * 流式更新 AI Card 内容
 */
export async function streamAICard(
  config: DingtalkConfig,
  card: DingtalkAICardInstance,
  content: string,
  finished: boolean = false,
): Promise<boolean> {
  try {
    const token = await getAccessToken(config);
    const fixedContent = ensureTableBlankLines(content);

    // 先设置 INPUTING 状态（如果还没开始）
    const statusBody = {
      outTrackId: card.cardInstanceId,
      cardData: {
        cardParamMap: {
          flowStatus: AICardStatus.INPUTING,
          msgContent: fixedContent,
          staticMsgContent: '',
          sys_full_json_obj: JSON.stringify({
            order: ['msgContent'],
          }),
          config: JSON.stringify({ autoLayout: true }),
        },
      },
    };

    await httpClient.put(
      `${DINGTALK_API}/v1.0/card/instances`,
      statusBody,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    // 流式更新内容
    const streamBody = {
      outTrackId: card.cardInstanceId,
      guid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      key: 'msgContent',
      content: fixedContent,
      isFull: true,
      isFinalize: finished,
      isError: false,
    };

    await httpClient.put(
      `${DINGTALK_API}/v1.0/card/streaming`,
      streamBody,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    return true;
  } catch (error: any) {
    console.error(`[钉钉][AICard] 流式更新失败:`, error.message);
    return false;
  }
}

/**
 * 完成 AI Card
 */
export async function finishAICard(
  config: DingtalkConfig,
  card: DingtalkAICardInstance,
  content: string,
): Promise<boolean> {
  try {
    const token = await getAccessToken(config);
    const fixedContent = ensureTableBlankLines(content);

    // 流式更新最终内容
    await streamAICard(config, card, fixedContent, true);

    // 设置完成状态
    const finishBody = {
      outTrackId: card.cardInstanceId,
      cardData: {
        cardParamMap: {
          flowStatus: AICardStatus.FINISHED,
          msgContent: fixedContent,
          staticMsgContent: '',
          sys_full_json_obj: JSON.stringify({
            order: ['msgContent'],
          }),
          config: JSON.stringify({ autoLayout: true }),
        },
      },
      cardUpdateOptions: { updateCardDataByKey: true },
    };

    await httpClient.put(
      `${DINGTALK_API}/v1.0/card/instances`,
      finishBody,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`[钉钉][AICard] 卡片完成: ${card.cardInstanceId}`);
    return true;
  } catch (error: any) {
    console.error(`[钉钉][AICard] 完成失败:`, error.message);
    return false;
  }
}

/**
 * 设置 AI Card 错误状态
 */
export async function errorAICard(
  config: DingtalkConfig,
  card: DingtalkAICardInstance,
  errorMessage: string,
): Promise<boolean> {
  try {
    const token = await getAccessToken(config);

    const errorBody = {
      outTrackId: card.cardInstanceId,
      cardData: {
        cardParamMap: {
          flowStatus: AICardStatus.FAILED,
          msgContent: `❌ ${errorMessage}`,
          staticMsgContent: '',
          sys_full_json_obj: JSON.stringify({
            order: ['msgContent'],
          }),
          config: JSON.stringify({ autoLayout: true }),
        },
      },
      cardUpdateOptions: { updateCardDataByKey: true },
    };

    await httpClient.put(
      `${DINGTALK_API}/v1.0/card/instances`,
      errorBody,
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    return true;
  } catch (error: any) {
    console.error(`[钉钉][AICard] 设置错误状态失败:`, error.message);
    return false;
  }
}