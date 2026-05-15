/**
 * Provider 管理器
 *
 * 职责：
 *   1. 读写 ~/.local/share/opencode/auth.json（仅 type=api 的增删改，OAuth 只读）
 *   2. 缓存 opencode models 输出（按 provider 分组）
 *   3. 提供 list / get / setKey / removeKey / refreshModels 接口
 *
 * 注意：
 *   - OAuth 类型的 provider 只能通过 opencode providers login 命令在终端登录
 *   - Web 端只能管理 type=api 的 provider
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  emitResourceChange,
} from '../events.js';
import { ensureResourceDir, getResourceDir } from '../paths.js';
import { PROVIDER_REFRESH_INTERVAL_MS } from '../constants.js';
import type {
  ApiProviderConfig,
  CustomProviderInput,
  ModelsCache,
  ModelInfo,
  OpenCodeAuthConfig,
  ProviderConfig,
  ProviderOverridesConfig,
  ProviderSummary,
} from './types.js';

// Re-export types for CLI use
export type { ProviderSummary, ModelInfo };
import {
  getOpenCodeAuthPath,
  isProviderEditable,
  PROVIDER_DISPLAY_NAMES,
} from './types.js';

/** 注册表状态 */
interface ProviderRegistryState {
  /** auth.json 内容缓存 */
  authConfig: OpenCodeAuthConfig;
  /** 模型列表缓存 */
  modelsCache: ModelsCache;
  /** 项目级 provider 覆盖配置 */
  overrides: ProviderOverridesConfig;
  /** 是否已初始化 */
  initialized: boolean;
  /** 是否已释放 */
  disposed: boolean;
}

const DEFAULT_OVERRIDES: ProviderOverridesConfig = {
  providers: {},
  disabledProviders: [],
  hiddenModels: {},
};

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;

/**
 * 读取 auth.json 文件
 */
async function readAuthConfig(): Promise<OpenCodeAuthConfig> {
  const authPath = getOpenCodeAuthPath();
  try {
    const content = await fs.readFile(authPath, 'utf-8');
    const parsed = JSON.parse(content) as OpenCodeAuthConfig;
    return parsed || {};
  } catch (err) {
    // 文件不存在或解析失败，返回空对象
    return {};
  }
}

/**
 * 写入 auth.json 文件（原子性写入）
 */
async function writeAuthConfig(config: OpenCodeAuthConfig): Promise<void> {
  const authPath = getOpenCodeAuthPath();
  const tempPath = authPath + '.tmp';
  const content = JSON.stringify(config, null, 2);

  // 原子性写入：先写临时文件，再重命名
  await fs.mkdir(path.dirname(authPath), { recursive: true });
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, authPath);
}

function getOverridesPath(): string {
  return path.join(getResourceDir('provider', 'project'), 'overrides.json');
}

async function readOverridesConfig(): Promise<ProviderOverridesConfig> {
  try {
    const parsed = JSON.parse(await fs.readFile(getOverridesPath(), 'utf-8')) as Partial<ProviderOverridesConfig>;
    return {
      providers: parsed.providers && typeof parsed.providers === 'object' ? parsed.providers : {},
      disabledProviders: Array.isArray(parsed.disabledProviders) ? parsed.disabledProviders : [],
      hiddenModels: parsed.hiddenModels && typeof parsed.hiddenModels === 'object' ? parsed.hiddenModels : {},
    };
  } catch {
    return { ...DEFAULT_OVERRIDES, providers: {}, disabledProviders: [], hiddenModels: {} };
  }
}

async function writeOverridesConfig(config: ProviderOverridesConfig): Promise<void> {
  ensureResourceDir('provider', 'project');
  await fs.writeFile(getOverridesPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function validateCustomProviderInput(input: CustomProviderInput): void {
  if (!PROVIDER_ID_PATTERN.test(input.providerId)) {
    throw new Error('Provider ID must match /^[a-z0-9][a-z0-9-_]*$/');
  }
  if (!input.name?.trim()) {
    throw new Error('Provider display name is required');
  }
  if (!/^https?:\/\//.test(input.baseURL || '')) {
    throw new Error('Provider baseURL must start with http:// or https://');
  }
  if (!Array.isArray(input.models) || input.models.length === 0) {
    throw new Error('At least one model is required');
  }
  const seenModels = new Set<string>();
  for (const model of input.models) {
    const id = model.id?.trim();
    const name = model.name?.trim();
    if (!id || !name) throw new Error('Model id and name are required');
    if (seenModels.has(id)) throw new Error(`Duplicate model id: ${id}`);
    seenModels.add(id);
  }
}

/**
 * 执行 opencode models 命令并解析输出
 */
async function fetchModelsFromOpenCode(): Promise<Map<string, string[]>> {
  return new Promise((resolve) => {
    const models = new Map<string, string[]>();
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'opencode models' : 'opencode';
    const args = isWindows ? [] : ['models'];
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows,
      windowsHide: isWindows,
    });
    let settled = false;

    let stdout = '';
    let stderr = '';

    const finish = (result: Map<string, string[]>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      console.error(`[Providers] 启动 ${command} models 失败:`, error instanceof Error ? error.message : String(error));
      finish(new Map());
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error('[Providers] opencode models 失败:', stderr || `exit code ${code}`);
        // 即使失败也返回空缓存，不阻塞启动
        finish(new Map());
        return;
      }

      // 解析输出：每行格式为 "provider/model"
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const slashIndex = trimmed.indexOf('/');
        if (slashIndex === -1) {
          // 没有 / 的行，归入 unknown provider
          const unknown = models.get('unknown') || [];
          unknown.push(trimmed);
          models.set('unknown', unknown);
          continue;
        }

        const providerId = trimmed.slice(0, slashIndex);
        const modelId = trimmed.slice(slashIndex + 1);

        const providerModels = models.get(providerId) || [];
        providerModels.push(modelId);
        models.set(providerId, providerModels);
      }

      finish(models);
    });

    // 30 秒超时
    const timeoutId = setTimeout(() => {
      child.kill();
      console.error('[Providers] opencode models 超时');
      finish(models);
    }, 30000);
  });
}

/**
 * Provider Registry 类
 */
export class ProviderRegistry {
  private state: ProviderRegistryState = {
    authConfig: {},
    modelsCache: new Map(),
    overrides: { ...DEFAULT_OVERRIDES, providers: {}, disabledProviders: [], hiddenModels: {} },
    initialized: false,
    disposed: false,
  };
  private refreshInterval: NodeJS.Timeout | null = null;

  /**
   * 初始化：读取 auth.json + 缓存 models
   */
  async init(): Promise<void> {
    if (this.state.disposed) {
      throw new Error('ProviderRegistry 已释放，不可重新初始化');
    }
    if (this.state.initialized) {
      return; // 幂等
    }

    // 读取 auth.json
    this.state.authConfig = await readAuthConfig();
    this.state.overrides = await readOverridesConfig();

    // 缓存 models（后台执行，不阻塞初始化）
    this.refreshModels().catch((err) => {
      console.error('[Providers] 缓存 models 失败:', err);
    });

    // 设置定期刷新（每30分钟）
    this.startPeriodicRefresh();

    this.state.initialized = true;
    console.log('[Providers] Registry 已就绪');
  }

  /**
   * 启动定期刷新
   */
  private startPeriodicRefresh(): void {
    if (this.refreshInterval) {
      return;
    }

    this.refreshInterval = setInterval(() => {
      if (!this.state.disposed) {
        this.refreshModels().catch((err) => {
          console.error('[Providers] 定期刷新 models 失败:', err);
        });
      }
    }, PROVIDER_REFRESH_INTERVAL_MS);

    console.log(`[Providers] 已设置定期刷新，间隔 ${PROVIDER_REFRESH_INTERVAL_MS / 60000} 分钟`);
  }

  /**
   * 释放
   */
  async dispose(): Promise<void> {
    this.state.disposed = true;
    this.state.modelsCache.clear();
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    console.log('[Providers] Registry 已释放');
  }

  /**
   * 重新读取 auth.json。OAuth login/logout 由 opencode CLI 写入文件后调用。
   */
  async reloadAuth(): Promise<void> {
    this.state.authConfig = await readAuthConfig();
    emitResourceChange('provider', 'reload');
  }

  async reloadOverrides(): Promise<void> {
    this.state.overrides = await readOverridesConfig();
    emitResourceChange('provider', 'reload');
  }

  /**
   * 列出所有 provider（摘要信息）
   */
  list(): ProviderSummary[] {
    const result: ProviderSummary[] = [];
    const providerIds = new Set([
      ...Object.keys(this.state.authConfig),
      ...this.state.modelsCache.keys(),
      ...Object.keys(this.state.overrides.providers),
    ]);

    for (const providerId of providerIds) {
      const config = this.state.authConfig[providerId];
      const custom = this.state.overrides.providers[providerId];
      const type = config?.type ?? 'api';
      const configured = config
        ? (config.type === 'api' ? !!config.key : !!config.access)
        : false;
      const customModels = custom ? Object.keys(custom.models) : [];
      const cachedModels = this.state.modelsCache.get(providerId) || [];
      const models = Array.from(new Set([...customModels, ...cachedModels])).sort();

      result.push({
        providerId,
        type,
        configured: configured || !!custom,
        editable: custom ? true : (config ? isProviderEditable(config) : true),
        displayName: custom?.name || PROVIDER_DISPLAY_NAMES[providerId] || providerId,
        source: custom ? 'custom' : (config?.type === 'oauth' ? 'oauth' : (config?.type === 'api' ? 'api' : 'models')),
        disabled: this.state.overrides.disabledProviders.includes(providerId),
        models,
        modelCount: models.length,
      });
    }

    // 按 providerId 排序
    return result.sort((a, b) => a.providerId.localeCompare(b.providerId));
  }

  /**
   * 获取单个 provider 配置
   */
  get(providerId: string): ProviderConfig | null {
    return this.state.authConfig[providerId] || null;
  }

  getCustom(providerId: string): CustomProviderInput | null {
    const custom = this.state.overrides.providers[providerId];
    if (!custom) return null;
    return {
      providerId,
      name: custom.name,
      baseURL: custom.options.baseURL,
      models: Object.entries(custom.models).map(([id, model]) => ({ id, name: model.name })),
      headers: custom.options.headers,
    };
  }

  /**
   * 设置 API Key（仅适用于 type=api 的 provider）
   */
  async setKey(providerId: string, apiKey: string): Promise<void> {
    if (this.state.disposed) {
      throw new Error('ProviderRegistry 已释放');
    }

    const existing = this.state.authConfig[providerId];

    // 如果已存在且是 OAuth 类型，拒绝覆盖
    if (existing && existing.type === 'oauth') {
      throw new Error(`Provider "${providerId}" 是 OAuth 类型，无法设置 API Key`);
    }

    // 更新配置，保留未知字段
    let newConfig: ApiProviderConfig;
    if (existing && existing.type === 'api') {
      // 合并现有配置，保留未知字段
      newConfig = {
        ...existing,
        type: 'api',
        key: apiKey,
      };
    } else {
      // 创建新配置
      newConfig = {
        type: 'api',
        key: apiKey,
      };
    }

    this.state.authConfig[providerId] = newConfig;
    await writeAuthConfig(this.state.authConfig);

    emitResourceChange('provider', 'update', { name: providerId });

    console.log(`[Providers] 已设置 provider "${providerId}" 的 API Key`);
  }

  /**
   * 删除 provider 配置
   */
  async removeKey(providerId: string): Promise<void> {
    if (this.state.disposed) {
      throw new Error('ProviderRegistry 已释放');
    }

    const existing = this.state.authConfig[providerId];
    if (!existing) {
      throw new Error(`Provider "${providerId}" 不存在`);
    }

    // OAuth 类型不允许删除（建议用户通过 opencode providers logout 删除）
    if (existing.type === 'oauth') {
      throw new Error(`Provider "${providerId}" 是 OAuth 类型，请通过命令行删除：opencode providers logout ${providerId}`);
    }

    delete this.state.authConfig[providerId];
    await writeAuthConfig(this.state.authConfig);

    emitResourceChange('provider', 'remove', { name: providerId });

    console.log(`[Providers] 已删除 provider "${providerId}"`);
  }

  async upsertCustomProvider(input: CustomProviderInput): Promise<void> {
    validateCustomProviderInput(input);
    const existing = this.state.authConfig[input.providerId];
    if (existing && existing.type === 'oauth') {
      throw new Error(`Provider "${input.providerId}" 是 OAuth 类型，无法覆盖为自定义 Provider`);
    }

    this.state.overrides.providers[input.providerId] = {
      npm: '@ai-sdk/openai-compatible',
      name: input.name.trim(),
      options: {
        baseURL: input.baseURL.trim(),
        ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
      },
      models: Object.fromEntries(input.models.map(model => [model.id.trim(), { name: model.name.trim() }])),
    };
    this.state.overrides.disabledProviders = this.state.overrides.disabledProviders.filter(id => id !== input.providerId);
    await writeOverridesConfig(this.state.overrides);

    if (input.apiKey?.trim()) {
      await this.setKey(input.providerId, input.apiKey.trim());
    }

    emitResourceChange('provider', 'update', { name: input.providerId });
  }

  async disconnect(providerId: string): Promise<void> {
    if (this.state.overrides.providers[providerId]) {
      delete this.state.overrides.providers[providerId];
      delete this.state.overrides.hiddenModels[providerId];
      await writeOverridesConfig(this.state.overrides);
    }
    if (this.state.authConfig[providerId]?.type === 'api') {
      delete this.state.authConfig[providerId];
      await writeAuthConfig(this.state.authConfig);
    }
    if (!this.state.overrides.disabledProviders.includes(providerId)) {
      this.state.overrides.disabledProviders.push(providerId);
      await writeOverridesConfig(this.state.overrides);
    }
    emitResourceChange('provider', 'remove', { name: providerId });
  }

  async setModelVisibility(providerId: string, modelId: string, visible: boolean): Promise<void> {
    const hidden = new Set(this.state.overrides.hiddenModels[providerId] || []);
    if (visible) hidden.delete(modelId);
    else hidden.add(modelId);
    this.state.overrides.hiddenModels[providerId] = Array.from(hidden).sort();
    await writeOverridesConfig(this.state.overrides);
    emitResourceChange('provider', 'update', { name: providerId });
  }

  isModelVisible(providerId: string, modelId: string): boolean {
    return !(this.state.overrides.hiddenModels[providerId] || []).includes(modelId);
  }

  /**
   * 刷新模型缓存（重新执行 opencode models）
   */
  async refreshModels(): Promise<void> {
    if (this.state.disposed) {
      return;
    }

    console.log('[Providers] 正在刷新模型列表...');
    const newCache = await fetchModelsFromOpenCode();
    this.state.modelsCache = newCache;

    const totalModels = Array.from(newCache.values()).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[Providers] 模型列表已刷新，共 ${newCache.size} 个 provider、${totalModels} 个模型`);

    emitResourceChange('provider', 'reload');
  }

  /**
   * 获取指定 provider 的模型列表
   */
  getModels(providerId: string): string[] {
    const custom = this.state.overrides.providers[providerId];
    return Array.from(new Set([
      ...(custom ? Object.keys(custom.models) : []),
      ...(this.state.modelsCache.get(providerId) || []),
    ])).sort();
  }

  /**
   * 获取所有模型信息（扁平化列表）
   */
  getAllModels(): ModelInfo[] {
    const result: ModelInfo[] = [];

    for (const [providerId, modelIds] of this.state.modelsCache.entries()) {
      for (const modelId of modelIds) {
        result.push({
          providerId,
          modelId,
          providerName: this.state.overrides.providers[providerId]?.name || PROVIDER_DISPLAY_NAMES[providerId] || providerId,
          name: this.state.overrides.providers[providerId]?.models[modelId]?.name || modelId,
          visible: !(this.state.overrides.hiddenModels[providerId] || []).includes(modelId),
          custom: !!this.state.overrides.providers[providerId]?.models[modelId],
          fullName: `${providerId}/${modelId}`,
        });
      }
    }

    for (const [providerId, provider] of Object.entries(this.state.overrides.providers)) {
      for (const [modelId, model] of Object.entries(provider.models)) {
        if (result.some(item => item.providerId === providerId && item.modelId === modelId)) continue;
        result.push({
          providerId,
          modelId,
          providerName: provider.name,
          name: model.name,
          visible: !(this.state.overrides.hiddenModels[providerId] || []).includes(modelId),
          custom: true,
          fullName: `${providerId}/${modelId}`,
        });
      }
    }

    return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * 检查 provider 是否已配置
   */
  isConfigured(providerId: string): boolean {
    const config = this.state.authConfig[providerId];
    if (!config) return false;
    return config.type === 'api' ? !!config.key : !!config.access;
  }
}

// 单例
let globalProviderRegistry: ProviderRegistry | null = null;

/**
 * 获取全局 Provider registry 单例
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!globalProviderRegistry) {
    globalProviderRegistry = new ProviderRegistry();
  }
  return globalProviderRegistry;
}
