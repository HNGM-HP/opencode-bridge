import { feishuClient, type FeishuMessageEvent } from '../feishu/client.js';
import { getCachedAdapter, getSenderByPlatform } from '../platform/loader.js';
import { rootRouter } from '../router/root-router.js';
import type { ReliabilityLifecycle } from '../reliability/bootstrap.js';
import { createDiscordHandler } from '../handlers/discord.js';
import { wecomHandler } from '../handlers/wecom.js';
import { telegramHandler } from '../handlers/telegram.js';
import { qqHandler } from '../handlers/qq.js';
import { whatsappHandler } from '../handlers/whatsapp.js';
import { weixinHandler } from '../handlers/weixin.js';
import { dingtalkHandler } from '../handlers/dingtalk.js';
import { p2pHandler } from '../handlers/p2p.js';
import { cardActionHandler } from '../handlers/card-action.js';
import { lifecycleHandler } from '../handlers/lifecycle.js';
import { commandHandler } from '../handlers/command.js';
import { chatSessionStore } from '../store/chat-session.js';
import { isPlatformConfigured, reliabilityConfig } from '../config.js';
import { getRuntimeCronManager, cleanupRuntimeCronJobsByConversation } from '../reliability/runtime-cron.js';

export interface PlatformListeners {
  onFeishuMessage: (event: FeishuMessageEvent) => Promise<void>;
  onFeishuChatUnavailable: (chatId: string) => void;
}

/** 注册各平台事件监听器（飞书、Discord、企业微信等） */
export function setupPlatformListeners(
  reliabilityLifecycle: ReliabilityLifecycle
): PlatformListeners {
  // 4. 监听飞书消息（通过路由器分发）
  const onFeishuMessage = async (event: FeishuMessageEvent) => {
    await reliabilityLifecycle.onInboundMessage();
    await rootRouter.onMessage(event);
  };
  feishuClient.on('message', onFeishuMessage);

  const onFeishuChatUnavailable = (chatId: string) => {
    console.warn(`[Platform] 检测到不可用群聊，移除会话绑定: ${chatId}`);
    chatSessionStore.removeSession(chatId);
  };
  feishuClient.on('chatUnavailable', onFeishuChatUnavailable);

  // 5. 监听飞书卡片动作（通过路由器分发）
  feishuClient.setCardActionHandler(async (event) => {
    return await rootRouter.onAction(event);
  });

  // Discord 消息监听（仅当已配置）
  const discordAdapter = getCachedAdapter('discord');
  if (discordAdapter) {
    const discordHandler = createDiscordHandler(discordAdapter.getSender());
    discordAdapter.onMessage(async (event) => {
      await discordHandler.handleMessage(event);
    });
    if (discordAdapter.onInteraction) {
      discordAdapter.onInteraction(async (interaction: unknown) => {
        await discordHandler.handleInteraction(interaction as any);
      });
    }
  }

  // 企业微信消息监听（仅当已配置）
  const wecomAdapter = getCachedAdapter('wecom');
  if (wecomAdapter) {
    wecomAdapter.onMessage(async (event) => {
      const sender = wecomAdapter.getSender();
      await wecomHandler.handleMessage(event, sender);
    });
  }

  // Telegram 消息监听（仅当已配置）
  const telegramAdapter = getCachedAdapter('telegram');
  if (telegramAdapter) {
    telegramAdapter.onMessage(async (event) => {
      const sender = telegramAdapter.getSender();
      await telegramHandler.handleMessage(event, sender);
    });
    telegramAdapter.onAction(async (event) => {
      const sender = telegramAdapter.getSender();
      await telegramHandler.handleAction(event, sender);
    });
  }

  // QQ 消息监听（仅当已配置）
  const qqAdapter = getCachedAdapter('qq');
  if (qqAdapter) {
    qqAdapter.onMessage(async (event) => {
      const sender = qqAdapter.getSender();
      await qqHandler.handleMessage(event, sender);
    });
    qqAdapter.onAction(async (event) => {
      const sender = qqAdapter.getSender();
      await qqHandler.handleAction(event, sender);
    });
  }

  // WhatsApp 消息监听（仅当已配置）
  const whatsappAdapter = getCachedAdapter('whatsapp');
  if (whatsappAdapter) {
    whatsappAdapter.onMessage(async (event) => {
      const sender = whatsappAdapter.getSender();
      await whatsappHandler.handleMessage(event, sender);
    });
    whatsappAdapter.onAction(async (event) => {
      const sender = whatsappAdapter.getSender();
      await whatsappHandler.handleAction(event, sender);
    });
  }

  // 个人微信消息监听（仅当已配置）
  const weixinAdapter = getCachedAdapter('weixin');
  if (weixinAdapter) {
    weixinAdapter.onMessage(async (event) => {
      const sender = weixinAdapter.getSender();
      await weixinHandler.handleMessage(event, sender);
    });
  }

  // 钉钉消息监听（仅当已配置）
  const dingtalkAdapter = getCachedAdapter('dingtalk');
  if (dingtalkAdapter) {
    dingtalkAdapter.onMessage(async (event) => {
      const sender = dingtalkAdapter.getSender();
      await dingtalkHandler.handleMessage(event, sender);
    });
  }

  // 7. 监听生命周期事件 (需要在启动后注册)
  feishuClient.onMemberLeft(async (chatId, memberId) => {
    await lifecycleHandler.handleMemberLeft(chatId, memberId);
  });

  feishuClient.onChatDisbanded(async (chatId) => {
    console.log(`[Platform] 群 ${chatId} 已解散`);
    if (reliabilityConfig.cronOrphanAutoCleanup) {
      cleanupRuntimeCronJobsByConversation(getRuntimeCronManager(), 'feishu', chatId);
    }
    chatSessionStore.removeSession(chatId);
  });

  feishuClient.onMessageRecalled(async (event) => {
    const chatId = event.chat_id;
    const recalledMsgId = event.message_id;

    if (chatId && recalledMsgId) {
      const session = chatSessionStore.getSession(chatId);
      if (session && session.lastFeishuUserMsgId === recalledMsgId) {
        console.log(`[Platform] 检测到用户撤回最后一条消息: ${recalledMsgId}`);
        await commandHandler.handleUndo(chatId);
      }
    }
  });

  return { onFeishuMessage, onFeishuChatUnavailable };
}

/** 启动各平台适配器 */
export async function startPlatformAdapters(): Promise<void> {
  // 7.5~7.11. 启动各平台适配器（仅当已配置）
  const PLATFORM_STARTUP_LIST = [
    { platform: 'discord', label: 'Discord' },
    { platform: 'wecom', label: '企业微信' },
    { platform: 'telegram', label: 'Telegram' },
    { platform: 'qq', label: 'QQ' },
    { platform: 'whatsapp', label: 'WhatsApp' },
    { platform: 'weixin', label: '个人微信' },
    { platform: 'dingtalk', label: '钉钉' },
  ] as const;

  for (const { platform, label } of PLATFORM_STARTUP_LIST) {
    if (isPlatformConfigured(platform)) {
      const adapter = getCachedAdapter(platform);
      if (adapter) {
        try {
          await adapter.start();
          console.log(`[${label}] 适配器已启动`);
        } catch (e) {
          console.error(`[${label}] 启动失败:`, e);
        }
      }
    }
  }

  // 8. 启动飞书客户端
  if (isPlatformConfigured('feishu')) {
    const feishuAdapter = getCachedAdapter('feishu');
    if (feishuAdapter) {
      feishuClient.setCardActionHandler(async (event) => {
        const actionValue = event.action?.value;
        const action = actionValue && typeof actionValue === 'object'
          ? (actionValue as Record<string, unknown>).action
          : undefined;
        const actionName = typeof action === 'string' ? action : '';

        if (actionName.startsWith('create_chat')) {
          return await p2pHandler.handleCardAction(event);
        }

        return await cardActionHandler.handle(event);
      });
      await feishuAdapter.start();
      console.log('[飞书] 适配器已启动');
    }
  } else {
    console.log('[System] 飞书长连接暂未启动 (未配置 FEISHU_APP_ID/FEISHU_APP_SECRET)');
  }

  // 9. 启动清理检查
  await lifecycleHandler.cleanUpOnStart();
}
