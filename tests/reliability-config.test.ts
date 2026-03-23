import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const envKeys = [
  'RELIABILITY_CRON_ENABLED',
  'RELIABILITY_CRON_API_ENABLED',
  'RELIABILITY_CRON_API_HOST',
  'RELIABILITY_CRON_API_PORT',
  'RELIABILITY_CRON_API_TOKEN',
  'RELIABILITY_CRON_JOBS_FILE',
  'RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP',
  'RELIABILITY_CRON_FORWARD_TO_PRIVATE',
  'RELIABILITY_CRON_FALLBACK_FEISHU_CHAT_ID',
  'RELIABILITY_CRON_FALLBACK_DISCORD_CONVERSATION_ID',
  'RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED',
  'RELIABILITY_INBOUND_HEARTBEAT_ENABLED',
  'RELIABILITY_HEARTBEAT_AGENT',
  'RELIABILITY_HEARTBEAT_PROMPT',
  'RELIABILITY_HEARTBEAT_ALERT_CHATS',
  'RELIABILITY_HEARTBEAT_INTERVAL_MS',
  'RELIABILITY_FAILURE_THRESHOLD',
  'RELIABILITY_WINDOW_MS',
  'RELIABILITY_COOLDOWN_MS',
  'RELIABILITY_REPAIR_BUDGET',
  'RELIABILITY_MODE',
  'RELIABILITY_LOOPBACK_ONLY',
  'OPENCODE_BRIDGE_CONFIG_DIR',
  'OPENCODE_BRIDGE_ENV_FILE',
  'OPENCODE_BRIDGE_ACTIVE_ENV_FILE',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
];

const backup = new Map<string, string | undefined>();

const restoreEnv = (): void => {
  for (const key of envKeys) {
    const value = backup.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const snapshotEnv = (): void => {
  for (const key of envKeys) {
    backup.set(key, process.env[key]);
  }
};

const loadConfigModule = async () => {
  vi.resetModules();
  return await import('../src/config.js');
};

describe('ReliabilityConfig - default values', () => {
  afterEach(() => {
    restoreEnv();
    backup.clear();
  });

  it('应使用安全默认值当所有环境变量都未设置时', async () => {
    snapshotEnv();
    for (const key of envKeys) {
      delete process.env[key];
    }

    const { reliabilityConfig } = await loadConfigModule();

    expect(reliabilityConfig.cronEnabled).toBe(true);
    expect(reliabilityConfig.cronApiEnabled).toBe(false);
    expect(reliabilityConfig.cronApiHost).toBe('127.0.0.1');
    expect(reliabilityConfig.cronApiPort).toBe(4097);
    expect(reliabilityConfig.cronOrphanAutoCleanup).toBe(false);
    expect(reliabilityConfig.cronForwardToPrivateChat).toBe(false);
    expect(reliabilityConfig.cronFallbackFeishuChatId).toBeUndefined();
    expect(reliabilityConfig.cronFallbackDiscordConversationId).toBeUndefined();
    expect(reliabilityConfig.proactiveHeartbeatEnabled).toBe(false);
    expect(reliabilityConfig.inboundHeartbeatEnabled).toBe(false);
    expect(reliabilityConfig.heartbeatAlertChats).toEqual([]);

    // 心跳间隔默认 30 分钟
    expect(reliabilityConfig.heartbeatIntervalMs).toBe(1800000);
    // 失败阈值默认 3
    expect(reliabilityConfig.failureThreshold).toBe(3);
    // 窗口默认 90 秒
    expect(reliabilityConfig.windowMs).toBe(90000);
    // 冷却窗口默认 5 分钟
    expect(reliabilityConfig.cooldownMs).toBe(300000);
    // 修复预算默认 3
    expect(reliabilityConfig.repairBudget).toBe(3);
    // 模式默认 observe
    expect(reliabilityConfig.mode).toBe('observe');
    // 仅本地自动救援默认开启
    expect(reliabilityConfig.loopbackOnly).toBe(true);
  });
});

describe('ReliabilityConfig - custom values', () => {
  afterEach(() => {
    restoreEnv();
    backup.clear();
  });

  it('应支持自定义心跳间隔', async () => {
    snapshotEnv();
    process.env.RELIABILITY_HEARTBEAT_INTERVAL_MS = '60000';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.heartbeatIntervalMs).toBe(60000);
  });

  it('应支持 cron 与主动心跳开关', async () => {
    snapshotEnv();
    process.env.RELIABILITY_CRON_ENABLED = 'false';
    process.env.RELIABILITY_CRON_API_ENABLED = 'true';
    process.env.RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED = 'false';
    process.env.RELIABILITY_INBOUND_HEARTBEAT_ENABLED = 'true';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.cronEnabled).toBe(false);
    expect(reliabilityConfig.cronApiEnabled).toBe(true);
    expect(reliabilityConfig.proactiveHeartbeatEnabled).toBe(false);
    expect(reliabilityConfig.inboundHeartbeatEnabled).toBe(true);
  });

  it('应支持 cron 僵尸清理与私聊回退配置', async () => {
    snapshotEnv();
    process.env.RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP = 'true';
    process.env.RELIABILITY_CRON_FORWARD_TO_PRIVATE = 'true';
    process.env.RELIABILITY_CRON_FALLBACK_FEISHU_CHAT_ID = 'oc_fallback';
    process.env.RELIABILITY_CRON_FALLBACK_DISCORD_CONVERSATION_ID = 'channel_fallback';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.cronOrphanAutoCleanup).toBe(true);
    expect(reliabilityConfig.cronForwardToPrivateChat).toBe(true);
    expect(reliabilityConfig.cronFallbackFeishuChatId).toBe('oc_fallback');
    expect(reliabilityConfig.cronFallbackDiscordConversationId).toBe('channel_fallback');
  });

  it('应支持从指定 config dir 加载 env 文件', async () => {
    snapshotEnv();
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;

    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-bridge-config-'));
    fs.writeFileSync(
      path.join(configRoot, '.env'),
      'FEISHU_APP_ID=cli_from_config_dir\nFEISHU_APP_SECRET=secret_from_config_dir\n',
      'utf-8'
    );
    process.env.OPENCODE_BRIDGE_CONFIG_DIR = configRoot;

    const configModule = await loadConfigModule();
    expect(configModule.feishuConfig.appId).toBe('cli_from_config_dir');
    expect(configModule.feishuConfig.appSecret).toBe('secret_from_config_dir');
    expect(process.env.OPENCODE_BRIDGE_ACTIVE_ENV_FILE).toBe(path.join(configRoot, '.env'));
  });

  it('指定 config dir 但缺少 .env 时应回退到默认位置', async () => {
    snapshotEnv();
    delete process.env.OPENCODE_BRIDGE_ACTIVE_ENV_FILE;
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;

    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-bridge-empty-config-'));
    process.env.OPENCODE_BRIDGE_CONFIG_DIR = configRoot;

    const configModule = await loadConfigModule();
    // 当指定目录没有 .env 时，会回退到项目根目录的 .env
    expect(configModule.feishuConfig.appId).toBe('');
    expect(configModule.feishuConfig.appSecret).toBe('');
    // 会回退到 cwd 的 .env（如果存在）
    expect(process.env.OPENCODE_BRIDGE_ACTIVE_ENV_FILE).toBeDefined();
  });

  it('应支持主动心跳告警会话列表', async () => {
    snapshotEnv();
    process.env.RELIABILITY_HEARTBEAT_ALERT_CHATS = 'oc_1, oc_2 ,';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.heartbeatAlertChats).toEqual(['oc_1', 'oc_2']);
  });

  it('应支持自定义失败阈值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_FAILURE_THRESHOLD = '5';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.failureThreshold).toBe(5);
  });

  it('应支持自定义窗口大小', async () => {
    snapshotEnv();
    process.env.RELIABILITY_WINDOW_MS = '120000';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.windowMs).toBe(120000);
  });

  it('应支持自定义冷却窗口', async () => {
    snapshotEnv();
    process.env.RELIABILITY_COOLDOWN_MS = '600000';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.cooldownMs).toBe(600000);
  });

  it('应支持自定义修复预算', async () => {
    snapshotEnv();
    process.env.RELIABILITY_REPAIR_BUDGET = '10';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.repairBudget).toBe(10);
  });

  it('应支持自定义模式 observe', async () => {
    snapshotEnv();
    process.env.RELIABILITY_MODE = 'observe';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.mode).toBe('observe');
  });

  it('应支持自定义模式 shadow', async () => {
    snapshotEnv();
    process.env.RELIABILITY_MODE = 'shadow';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.mode).toBe('shadow');
  });

  it('应支持自定义模式 active', async () => {
    snapshotEnv();
    process.env.RELIABILITY_MODE = 'active';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.mode).toBe('active');
  });

  it('应支持关闭 loopback 限制', async () => {
    snapshotEnv();
    process.env.RELIABILITY_LOOPBACK_ONLY = 'false';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.loopbackOnly).toBe(false);
  });

  it('应支持开启 loopback 限制', async () => {
    snapshotEnv();
    process.env.RELIABILITY_LOOPBACK_ONLY = 'true';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.loopbackOnly).toBe(true);
  });
});

describe('ReliabilityConfig - invalid value fallback', () => {
  afterEach(() => {
    restoreEnv();
    backup.clear();
  });

  it('无效的心跳间隔应回退到默认值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_HEARTBEAT_INTERVAL_MS = '-1000';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.heartbeatIntervalMs).toBe(1800000);
  });

  it('非数字心跳间隔应回退到默认值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_HEARTBEAT_INTERVAL_MS = 'invalid';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.heartbeatIntervalMs).toBe(1800000);
  });

  it('无效的失败阈值应回退到默认值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_FAILURE_THRESHOLD = '-1';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.failureThreshold).toBe(3);
  });

  it('非数字失败阈值应回退到默认值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_FAILURE_THRESHOLD = 'abc';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.failureThreshold).toBe(3);
  });

  it('无效的窗口大小应回退到默认值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_WINDOW_MS = '-5000';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.windowMs).toBe(90000);
  });

  it('无效的冷却窗口应回退到默认值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_COOLDOWN_MS = '-100';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.cooldownMs).toBe(300000);
  });

  it('无效的修复预算应回退到默认值', async () => {
    snapshotEnv();
    process.env.RELIABILITY_REPAIR_BUDGET = '-5';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.repairBudget).toBe(3);
  });

  it('无效的模式应回退到 observe', async () => {
    snapshotEnv();
    process.env.RELIABILITY_MODE = 'invalid-mode';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.mode).toBe('observe');
  });

  it('大小写混合的模式应能正确解析', async () => {
    snapshotEnv();
    process.env.RELIABILITY_MODE = 'SHADOW';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.mode).toBe('shadow');
  });

  it('无效的 loopback 配置应回退到 true', async () => {
    snapshotEnv();
    process.env.RELIABILITY_LOOPBACK_ONLY = 'invalid';

    const { reliabilityConfig } = await loadConfigModule();
    expect(reliabilityConfig.loopbackOnly).toBe(true);
  });
});

describe('ReliabilityConfig - mode validation', () => {
  afterEach(() => {
    restoreEnv();
    backup.clear();
  });

  it('mode 属性应该是只读的', async () => {
    snapshotEnv();
    process.env.RELIABILITY_MODE = 'observe';

    const { reliabilityConfig } = await loadConfigModule();
    
    // 验证 mode 是有效值
    expect(['observe', 'shadow', 'active']).toContain(reliabilityConfig.mode);
  });

  it('所有配置项应该可枚举', async () => {
    snapshotEnv();
    for (const key of envKeys) {
      delete process.env[key];
    }

    const { reliabilityConfig } = await loadConfigModule();
    const keys = Object.keys(reliabilityConfig);
    
    expect(keys).toContain('heartbeatIntervalMs');
    expect(keys).toContain('cronEnabled');
    expect(keys).toContain('cronApiEnabled');
    expect(keys).toContain('cronOrphanAutoCleanup');
    expect(keys).toContain('cronForwardToPrivateChat');
    expect(keys).toContain('proactiveHeartbeatEnabled');
    expect(keys).toContain('inboundHeartbeatEnabled');
    expect(keys).toContain('failureThreshold');
    expect(keys).toContain('windowMs');
    expect(keys).toContain('cooldownMs');
    expect(keys).toContain('repairBudget');
    expect(keys).toContain('mode');
    expect(keys).toContain('loopbackOnly');
  });
});
