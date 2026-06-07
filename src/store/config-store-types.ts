/**
 * ConfigStore 类型定义
 *
 * 与 store/config-store.ts 分离以便专注维护配置类型结构
 */

// ──────────────────────────────────────────────
// 数据结构：与 .env.example 完整对应的扁平 KV 类型
// ──────────────────────────────────────────────
export interface BridgeSettings {
  // 飞书
  FEISHU_ENABLED?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_ENCRYPT_KEY?: string;
  FEISHU_VERIFICATION_TOKEN?: string;

  // 白名单
  ALLOWED_USERS?: string;

  // 平台过滤
  ENABLED_PLATFORMS?: string;

  // Discord
  DISCORD_ENABLED?: string;
  DISCORD_TOKEN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_ALLOWED_BOT_IDS?: string;

  // 企业微信
  WECOM_ENABLED?: string;
  WECOM_BOT_ID?: string;
  WECOM_SECRET?: string;

  // 个人微信
  WEIXIN_ENABLED?: string;

  // 钉钉
  DINGTALK_ENABLED?: string;

  // Telegram
  TELEGRAM_ENABLED?: string;
  TELEGRAM_BOT_TOKEN?: string;

  // QQ (支持官方 API 和 OneBot 双协议)
  QQ_ENABLED?: string;
  QQ_PROTOCOL?: string; // 'official' | 'onebot'
  // OneBot 协议
  QQ_ONEBOT_HTTP_URL?: string;
  QQ_ONEBOT_WS_URL?: string;
  // QQ 官方 API
  QQ_APP_ID?: string;
  QQ_SECRET?: string;
  QQ_CALLBACK_URL?: string;
  QQ_ENCRYPT_KEY?: string;

  // WhatsApp
  WHATSAPP_ENABLED?: string;
  WHATSAPP_MODE?: string; // 'personal' | 'business'
  WHATSAPP_SESSION_PATH?: string;
  WHATSAPP_BUSINESS_PHONE_ID?: string;
  WHATSAPP_BUSINESS_ACCESS_TOKEN?: string;
  WHATSAPP_BUSINESS_WEBHOOK_VERIFY_TOKEN?: string;

  // OpenCode 连接
  OPENCODE_HOST?: string;
  OPENCODE_PORT?: string;
  OPENCODE_AUTO_START?: string;
  /** @deprecated 不再使用，保留供旧配置读取 */
  OPENCODE_AUTO_START_CMD?: string;
  OPENCODE_AUTO_START_FOREGROUND?: string;
  OPENCODE_SERVER_USERNAME?: string;
  OPENCODE_SERVER_PASSWORD?: string;
  OPENCODE_CONFIG_FILE?: string;

  // 可靠性 - Cron 调度
  RELIABILITY_CRON_ENABLED?: string;
  RELIABILITY_CRON_API_ENABLED?: string;
  RELIABILITY_CRON_API_HOST?: string;
  RELIABILITY_CRON_API_PORT?: string;
  RELIABILITY_CRON_API_TOKEN?: string;
  RELIABILITY_CRON_JOBS_FILE?: string;
  RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP?: string;
  RELIABILITY_CRON_FORWARD_TO_PRIVATE?: string;
  RELIABILITY_CRON_FALLBACK_FEISHU_CHAT_ID?: string;
  RELIABILITY_CRON_FALLBACK_DISCORD_CONVERSATION_ID?: string;

  // 可靠性 - 心跳
  RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED?: string;
  RELIABILITY_INBOUND_HEARTBEAT_ENABLED?: string;
  RELIABILITY_HEARTBEAT_INTERVAL_MS?: string;
  RELIABILITY_HEARTBEAT_AGENT?: string;
  RELIABILITY_HEARTBEAT_PROMPT?: string;
  RELIABILITY_HEARTBEAT_ALERT_CHATS?: string;

  // 可靠性 - 救援策略
  RELIABILITY_FAILURE_THRESHOLD?: string;
  RELIABILITY_WINDOW_MS?: string;
  RELIABILITY_COOLDOWN_MS?: string;
  RELIABILITY_REPAIR_BUDGET?: string;
  RELIABILITY_MODE?: string;
  RELIABILITY_LOOPBACK_ONLY?: string;

  // 群聊行为
  GROUP_REQUIRE_MENTION?: string;
  GROUP_REPLY_REQUIRE_MENTION?: string;

  // 输出显示
  SHOW_THINKING_CHAIN?: string;
  SHOW_TOOL_CHAIN?: string;
  FEISHU_SHOW_THINKING_CHAIN?: string;
  FEISHU_SHOW_TOOL_CHAIN?: string;
  DISCORD_SHOW_THINKING_CHAIN?: string;
  DISCORD_SHOW_TOOL_CHAIN?: string;
  WECOM_SHOW_THINKING_CHAIN?: string;
  WECOM_SHOW_TOOL_CHAIN?: string;
  TELEGRAM_SHOW_THINKING_CHAIN?: string;
  TELEGRAM_SHOW_TOOL_CHAIN?: string;
  QQ_SHOW_THINKING_CHAIN?: string;
  QQ_SHOW_TOOL_CHAIN?: string;
  WHATSAPP_SHOW_THINKING_CHAIN?: string;
  WHATSAPP_SHOW_TOOL_CHAIN?: string;
  WEIXIN_SHOW_THINKING_CHAIN?: string;
  WEIXIN_SHOW_TOOL_CHAIN?: string;
  DINGTALK_SHOW_THINKING_CHAIN?: string;
  DINGTALK_SHOW_TOOL_CHAIN?: string;

  // 工作目录
  ALLOWED_DIRECTORIES?: string;
  DEFAULT_WORK_DIRECTORY?: string;
  PROJECT_ALIASES?: string;
  GIT_ROOT_NORMALIZATION?: string;

  // 工具 / 权限
  TOOL_WHITELIST?: string;
  PERMISSION_REQUEST_TIMEOUT_MS?: string;

  // 输出控制
  OUTPUT_UPDATE_INTERVAL?: string;
  MAX_DELAYED_RESPONSE_WAIT_MS?: string;

  // 会话绑定
  ENABLE_MANUAL_SESSION_BIND?: string;

  // 路由模式
  ROUTER_MODE?: string;

  // 附件
  ATTACHMENT_MAX_SIZE?: string;

  // 非多模态模型图片预处理（借用 opencode 内已配置的多模态 model 做 OCR）
  IMAGE_VISION_PREPROCESS?: string;     // 'true' | 'false'
  VISION_OCR_MODEL?: string;            // 'providerID/modelID'
  VISION_OCR_PROMPT?: string;           // OCR 引导提示词

  // 模型（扩展字段，.env.example 未列出但 config.ts 引用）
  DEFAULT_PROVIDER?: string;
  DEFAULT_MODEL?: string;
  CHAT_MODEL_WHITELIST?: string;      // JSON 数组：["provider/model", ...]

  // CLI / TUI 向导相关（仅 CLI 使用，web 端不展示）
  CLI_LANG?: string;            // 'zh' | 'en'
  WEB_ADMIN_DISABLED?: string;  // 'true' 时无头模式启动不开 web 管理面板
  ADMIN_PORT?: string;          // web 管理面板端口（默认 4098）
}

// ──────────────────────────────────────────────
// 微信账号类型定义
// ──────────────────────────────────────────────

export interface WeixinAccountRow {
  account_id: string;
  user_id: string;
  base_url: string;
  cdn_base_url: string;
  token: string;
  name: string;
  enabled: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// 钉钉账号类型定义
// ──────────────────────────────────────────────

export interface DingtalkAccountRow {
  account_id: string;
  client_id: string;
  client_secret: string;
  name: string;
  enabled: number;
  endpoint: string;
  created_at: string;
  updated_at: string;
}
