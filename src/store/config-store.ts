/**
 * SQLite 配置持久化层
 *
 * 职责：
 * 1. 以单行 JSON 存储全量配置（settings 表 id=1）
 * 2. 提供 get/set/merge 三个同步接口，供 config.ts 调用
 * 3. 首次启动时若无 DB 则返回空对象，由 config.ts 决定是否迁移 .env
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { BridgeSettings, WeixinAccountRow, DingtalkAccountRow } from './config-store-types.js';

let DatabaseCtor: typeof Database;

try {
  DatabaseCtor = (await import('better-sqlite3')).default;
} catch (err: any) {
  const msg = [
    '[ConfigStore] FATAL: 无法加载 better-sqlite3 原生模块。',
    `[ConfigStore] 平台: ${process.platform} 架构: ${process.arch} Node: ${process.versions.node}`,
    `[ConfigStore] 错误: ${err?.message || err}`,
  ];
  if (process.platform === 'darwin') {
    msg.push(
      '[ConfigStore] macOS 排查建议:',
      '  1. 确认下载的安装包与 CPU 架构匹配 (arm64 = Apple Silicon, x64 = Intel)',
      '  2. 执行: xattr -cr "/Applications/OpenCode Bridge.app"  (移除安全隔离)',
      '  3. 删除配置数据库后重试: rm ~/Library/Application\\ Support/opencode-bridge/data/config.db',
    );
  }
  if (process.platform === 'linux' && process.env.ELECTRON_RUN_AS_NODE === '1') {
    msg.push(
      '[ConfigStore] Linux Electron 环境排查建议:',
      '  1. 确认已执行 electron-rebuild: npm run rebuild',
      '  2. 检查 .node 文件权限: ls -la node_modules/better-sqlite3/prebuilds/',
    );
  }
  for (const line of msg) {
    console.error(line);
  }
  throw err;
}

// ──────────────────────────────────────────────
// DB 路径解析（与 .env 查找策略对应）
// ──────────────────────────────────────────────
function resolveDbPath(): string {
  const explicit = process.env.OPENCODE_BRIDGE_CONFIG_DIR?.trim();
  if (explicit) {
    return path.join(path.resolve(explicit), 'config.db');
  }

  // 优先放在与 .env 同级的当前目录下的 data 文件夹
  const cwdDb = path.join(process.cwd(), 'data', 'config.db');
  return cwdDb;
}

// ──────────────────────────────────────────────
// ConfigStore 单例
// ──────────────────────────────────────────────
class ConfigStore {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor() {
    this.dbPath = resolveDbPath();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseCtor(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id      INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL DEFAULT '{}',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS admin_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      -- 微信账号表
      CREATE TABLE IF NOT EXISTS weixin_accounts (
        account_id    TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL DEFAULT '',
        base_url      TEXT NOT NULL DEFAULT '',
        cdn_base_url  TEXT NOT NULL DEFAULT '',
        token         TEXT NOT NULL,
        name          TEXT NOT NULL DEFAULT '',
        enabled       INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      -- 微信会话 token 表
      CREATE TABLE IF NOT EXISTS weixin_context_tokens (
        account_id   TEXT NOT NULL,
        peer_user_id TEXT NOT NULL,
        context_token TEXT NOT NULL,
        updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, peer_user_id)
      );
      -- 微信轮询游标表
      CREATE TABLE IF NOT EXISTS weixin_poll_offsets (
        account_id TEXT PRIMARY KEY,
        offset_buf TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      -- 钉钉账号表
      CREATE TABLE IF NOT EXISTS dingtalk_accounts (
        account_id    TEXT PRIMARY KEY,
        client_id     TEXT NOT NULL,
        client_secret TEXT NOT NULL,
        name          TEXT NOT NULL DEFAULT '',
        enabled       INTEGER NOT NULL DEFAULT 1,
        endpoint      TEXT NOT NULL DEFAULT 'https://api.dingtalk.com',
        created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      -- 钉钉会话 webhook 缓存表
      CREATE TABLE IF NOT EXISTS dingtalk_session_webhooks (
        account_id      TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        webhook         TEXT NOT NULL,
        expired_time    INTEGER NOT NULL,
        updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, conversation_id)
      );
    `);
  }

  /** 读取全量配置，若数据库为空则返回 {} */
  get(): BridgeSettings {
    const row = this.db
      .prepare<[], { payload: string }>('SELECT payload FROM settings WHERE id = 1')
      .get();
    if (!row) return {};
    try {
      return JSON.parse(row.payload) as BridgeSettings;
    } catch {
      return {};
    }
  }

  /** 全量覆盖写入 */
  set(settings: BridgeSettings): void {
    this.db
      .prepare(
        `INSERT INTO settings (id, payload, updated_at)
         VALUES (1, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(settings));
  }

  /** 部分合并写入（patch 语义） */
  merge(partial: Partial<BridgeSettings>): void {
    const current = this.get();
    this.set({ ...current, ...partial });
  }

  /** 判断是否已完成 .env 迁移 */
  isMigrated(): boolean {
    const row = this.db
      .prepare<[], { value: string }>(`SELECT value FROM admin_meta WHERE key = 'migration_done'`)
      .get();
    return row?.value === '1';
  }

  /** 标记迁移完成 */
  markMigrated(): void {
    this.db
      .prepare(
        `INSERT INTO admin_meta (key, value) VALUES ('migration_done', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`
      )
      .run();
  }

  // 注：管理后台已彻底移除账号 / 密码鉴权及登录超时机制，
  // 原 getAdminPassword / setAdminPassword / needsPasswordChange /
  // getPasswordChangedAt / setPasswordChangedAt /
  // getLoginTimeout / setLoginTimeout 等接口已删除。
  // admin_meta 表中遗留的相关字段不再读写，老数据会被自然忽略。

  // ──────────────────────────────────────────────
  // 首次安装引导（onboarding）状态
  // ──────────────────────────────────────────────

  /** 是否已完成或跳过首次安装引导 */
  isOnboardingCompleted(): boolean {
    const row = this.db
      .prepare<[], { value: string }>(`SELECT value FROM admin_meta WHERE key = 'onboarding_completed'`)
      .get();
    return row?.value === '1';
  }

  /** 设置引导完成标记（true=完成或跳过；false=重置以便重新展示） */
  setOnboardingCompleted(completed: boolean): void {
    this.db
      .prepare(
        `INSERT INTO admin_meta (key, value) VALUES ('onboarding_completed', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(completed ? '1' : '0');
  }

  getDbPath(): string {
    return this.dbPath;
  }

  // ──────────────────────────────────────────────
  // 微信账号管理
  // ──────────────────────────────────────────────

  /** 微信账号行类型 */
  getWeixinAccounts(): WeixinAccountRow[] {
    return this.db
      .prepare<[], WeixinAccountRow>('SELECT * FROM weixin_accounts ORDER BY created_at DESC')
      .all();
  }

  getWeixinAccount(accountId: string): WeixinAccountRow | undefined {
    return this.db
      .prepare<[string], WeixinAccountRow>('SELECT * FROM weixin_accounts WHERE account_id = ?')
      .get(accountId);
  }

  upsertWeixinAccount(params: {
    accountId: string;
    userId?: string;
    baseUrl?: string;
    cdnBaseUrl?: string;
    token: string;
    name?: string;
    enabled?: boolean;
  }): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO weixin_accounts (account_id, user_id, base_url, cdn_base_url, token, name, enabled, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           user_id = COALESCE(excluded.user_id, weixin_accounts.user_id),
           base_url = COALESCE(excluded.base_url, weixin_accounts.base_url),
           cdn_base_url = COALESCE(excluded.cdn_base_url, weixin_accounts.cdn_base_url),
           token = COALESCE(excluded.token, weixin_accounts.token),
           name = COALESCE(excluded.name, weixin_accounts.name),
           enabled = excluded.enabled,
           last_login_at = excluded.last_login_at,
           updated_at = excluded.updated_at`
      )
      .run(
        params.accountId,
        params.userId || '',
        params.baseUrl || '',
        params.cdnBaseUrl || '',
        params.token,
        params.name || params.accountId,
        params.enabled !== false ? 1 : 0,
        now,
        now,
        now
      );
  }

  deleteWeixinAccount(accountId: string): boolean {
    const result = this.db.prepare('DELETE FROM weixin_accounts WHERE account_id = ?').run(accountId);
    // 同时清理相关的 context_tokens 和 poll_offsets
    this.db.prepare('DELETE FROM weixin_context_tokens WHERE account_id = ?').run(accountId);
    this.db.prepare('DELETE FROM weixin_poll_offsets WHERE account_id = ?').run(accountId);
    return result.changes > 0;
  }

  setWeixinAccountEnabled(accountId: string, enabled: boolean): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE weixin_accounts SET enabled = ?, updated_at = ? WHERE account_id = ?')
      .run(enabled ? 1 : 0, now, accountId);
  }

  // ──────────────────────────────────────────────
  // 微信 context_token 管理
  // ──────────────────────────────────────────────

  getWeixinContextToken(accountId: string, peerUserId: string): string | null {
    const row = this.db
      .prepare<[string, string], { context_token: string }>(
        'SELECT context_token FROM weixin_context_tokens WHERE account_id = ? AND peer_user_id = ?'
      )
      .get(accountId, peerUserId);
    return row?.context_token || null;
  }

  upsertWeixinContextToken(accountId: string, peerUserId: string, contextToken: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO weixin_context_tokens (account_id, peer_user_id, context_token, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, peer_user_id) DO UPDATE SET context_token = excluded.context_token, updated_at = excluded.updated_at`
      )
      .run(accountId, peerUserId, contextToken, now);
  }

  // ──────────────────────────────────────────────
  // 微信轮询游标管理
  // ──────────────────────────────────────────────

  getWeixinPollOffset(accountId: string): string {
    const row = this.db
      .prepare<[string], { offset_buf: string }>('SELECT offset_buf FROM weixin_poll_offsets WHERE account_id = ?')
      .get(accountId);
    return row?.offset_buf || '';
  }

  setWeixinPollOffset(accountId: string, offsetBuf: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO weixin_poll_offsets (account_id, offset_buf, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET offset_buf = excluded.offset_buf, updated_at = excluded.updated_at`
      )
      .run(accountId, offsetBuf, now);
  }

  // ──────────────────────────────────────────────
  // 钉钉账号管理
  // ──────────────────────────────────────────────

  /** 获取所有钉钉账号 */
  getDingtalkAccounts(): DingtalkAccountRow[] {
    return this.db
      .prepare<[], DingtalkAccountRow>('SELECT * FROM dingtalk_accounts ORDER BY created_at DESC')
      .all();
  }

  /** 获取单个钉钉账号 */
  getDingtalkAccount(accountId: string): DingtalkAccountRow | undefined {
    return this.db
      .prepare<[string], DingtalkAccountRow>('SELECT * FROM dingtalk_accounts WHERE account_id = ?')
      .get(accountId);
  }

  /** 插入或更新钉钉账号 */
  upsertDingtalkAccount(params: {
    accountId: string;
    clientId: string;
    clientSecret: string;
    name?: string;
    enabled?: boolean;
    endpoint?: string;
  }): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO dingtalk_accounts (account_id, client_id, client_secret, name, enabled, endpoint, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           client_id = excluded.client_id,
           client_secret = excluded.client_secret,
           name = COALESCE(excluded.name, dingtalk_accounts.name),
           enabled = excluded.enabled,
           endpoint = COALESCE(excluded.endpoint, dingtalk_accounts.endpoint),
           updated_at = excluded.updated_at`
      )
      .run(
        params.accountId,
        params.clientId,
        params.clientSecret,
        params.name || params.accountId,
        params.enabled !== false ? 1 : 0,
        params.endpoint || 'https://api.dingtalk.com',
        now,
        now
      );
  }

  /** 删除钉钉账号 */
  deleteDingtalkAccount(accountId: string): boolean {
    const result = this.db.prepare('DELETE FROM dingtalk_accounts WHERE account_id = ?').run(accountId);
    // 同时清理相关的 session_webhooks
    this.db.prepare('DELETE FROM dingtalk_session_webhooks WHERE account_id = ?').run(accountId);
    return result.changes > 0;
  }

  /** 设置钉钉账号启用状态 */
  setDingtalkAccountEnabled(accountId: string, enabled: boolean): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE dingtalk_accounts SET enabled = ?, updated_at = ? WHERE account_id = ?')
      .run(enabled ? 1 : 0, now, accountId);
  }

  // ──────────────────────────────────────────────
  // 钉钉会话 webhook 缓存管理
  // ──────────────────────────────────────────────

  /** 获取缓存的 session webhook */
  getDingtalkSessionWebhook(accountId: string, conversationId: string): { webhook: string; expiredTime: number } | null {
    const row = this.db
      .prepare<[string, string], { webhook: string; expired_time: number }>(
        'SELECT webhook, expired_time FROM dingtalk_session_webhooks WHERE account_id = ? AND conversation_id = ?'
      )
      .get(accountId, conversationId);

    if (!row) return null;

    // 检查是否过期
    if (row.expired_time < Date.now()) {
      // 删除过期记录
      this.db
        .prepare('DELETE FROM dingtalk_session_webhooks WHERE account_id = ? AND conversation_id = ?')
        .run(accountId, conversationId);
      return null;
    }

    return { webhook: row.webhook, expiredTime: row.expired_time };
  }

  /** 缓存 session webhook */
  upsertDingtalkSessionWebhook(accountId: string, conversationId: string, webhook: string, expiredTime: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO dingtalk_session_webhooks (account_id, conversation_id, webhook, expired_time, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_id, conversation_id) DO UPDATE SET webhook = excluded.webhook, expired_time = excluded.expired_time, updated_at = excluded.updated_at`
      )
      .run(accountId, conversationId, webhook, expiredTime, now);
  }
}

export const configStore = new ConfigStore();

// 向后兼容的类型重导出
export type { BridgeSettings, WeixinAccountRow, DingtalkAccountRow } from './config-store-types.js';
