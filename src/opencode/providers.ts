import type { OpencodeClient as SdkOpencodeClient } from '@opencode-ai/sdk';
import type { OpencodeRuntimeConfig, OpencodeAgentInfo, AgentMode } from './client.js';
import { parseBoolean, parseAgentMode } from './client-helpers.js';

export interface ProvidersDeps {
  getClient: () => SdkOpencodeClient | null;
}

export class ProvidersManager {
  constructor(private deps: ProvidersDeps) {}

  // 获取客户端实例
  private getClient(): SdkOpencodeClient {
    const client = this.deps.getClient();
    if (!client) {
      throw new Error('OpenCode客户端未连接');
    }
    return client;
  }

  // 获取配置（含模型列表）
  async getProviders(): Promise<{
    providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
    default: Record<string, string>;
  }> {
    const client = this.getClient();
    const result = await client.config.providers();
    return result.data as unknown as {
      providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
      default: Record<string, string>;
    };
  }

  /**
   * 获取 opencode 提供的 providers 完整数据（含 capabilities）
   *
   * 与 {@link getProviders} 的区别：后者为了兼容历史调用点做了强类型窄化，
   * 丢掉了 `capabilities.input.image` 等关键字段。本方法返回 SDK 原始 shape，
   * 供能力嗅探 / vision 模型枚举等场景使用。
   */
  async getProvidersFull(): Promise<{
    providers: Array<Record<string, unknown>>;
    default: Record<string, string>;
  }> {
    const client = this.getClient();
    const result = await client.config.providers();
    const data = (result.data || {}) as Record<string, unknown>;
    const providers = Array.isArray(data.providers) ? (data.providers as Array<Record<string, unknown>>) : [];
    const defaultMap = (data.default && typeof data.default === 'object' && !Array.isArray(data.default)
      ? data.default
      : {}) as Record<string, string>;
    return { providers, default: defaultMap };
  }

  /**
   * 查询单个 model 的 capabilities。
   *
   * @returns `{ input, attachment, ... }` 结构；若 provider/model 未找到或数据缺失，返回 `null`
   *          —— 调用方应据此采用"乐观"或"悲观"策略。
   */
  async getModelCapabilities(
    providerId: string,
    modelId: string,
  ): Promise<{
    input?: { text?: boolean; image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean };
    output?: { text?: boolean; image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean };
    attachment?: boolean;
  } | null> {
    if (!providerId?.trim() || !modelId?.trim()) return null;

    let full: Awaited<ReturnType<ProvidersManager['getProvidersFull']>>;
    try {
      full = await this.getProvidersFull();
    } catch (error) {
      console.debug('[OpenCode] getModelCapabilities: 拉取 providers 失败', error instanceof Error ? error.message : error);
      return null;
    }

    const providerLower = providerId.trim().toLowerCase();
    const modelLower = modelId.trim().toLowerCase();

    for (const provider of full.providers) {
      if (!provider || typeof provider !== 'object') continue;
      const pid = typeof provider.id === 'string' ? provider.id.trim().toLowerCase() : '';
      if (pid !== providerLower) continue;

      const modelsRaw = provider.models;
      const modelList: Array<Record<string, unknown>> = Array.isArray(modelsRaw)
        ? (modelsRaw as Array<Record<string, unknown>>)
        : modelsRaw && typeof modelsRaw === 'object'
          ? (Object.values(modelsRaw as Record<string, unknown>) as Array<Record<string, unknown>>)
          : [];

      for (const model of modelList) {
        if (!model || typeof model !== 'object') continue;
        const mid = typeof model.id === 'string'
          ? model.id.trim().toLowerCase()
          : typeof (model as Record<string, unknown>).modelID === 'string'
            ? ((model as Record<string, unknown>).modelID as string).trim().toLowerCase()
            : '';
        if (mid !== modelLower) continue;

        const caps = model.capabilities;
        if (!caps || typeof caps !== 'object') return null;
        return caps as {
          input?: { text?: boolean; image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean };
          output?: { text?: boolean; image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean };
          attachment?: boolean;
        };
      }
      return null; // provider 匹配，但 model 未找到
    }
    return null; // provider 未找到
  }

  /**
   * 枚举所有支持 image 输入的 model。
   *
   * 供 Web UI 的 VISION_OCR_MODEL 下拉选择器使用。
   */
  async listVisionModels(): Promise<Array<{
    providerID: string;
    providerName: string;
    modelID: string;
    modelName: string;
  }>> {
    let full: Awaited<ReturnType<ProvidersManager['getProvidersFull']>>;
    try {
      full = await this.getProvidersFull();
    } catch (error) {
      console.warn('[OpenCode] listVisionModels: 拉取 providers 失败', error instanceof Error ? error.message : error);
      return [];
    }

    const result: Array<{ providerID: string; providerName: string; modelID: string; modelName: string }> = [];

    for (const provider of full.providers) {
      if (!provider || typeof provider !== 'object') continue;
      const providerID = typeof provider.id === 'string' ? provider.id.trim() : '';
      if (!providerID) continue;
      const providerName = typeof provider.name === 'string' && provider.name.trim()
        ? provider.name.trim()
        : providerID;

      const modelsRaw = provider.models;
      const modelList: Array<Record<string, unknown>> = Array.isArray(modelsRaw)
        ? (modelsRaw as Array<Record<string, unknown>>)
        : modelsRaw && typeof modelsRaw === 'object'
          ? (Object.values(modelsRaw as Record<string, unknown>) as Array<Record<string, unknown>>)
          : [];

      for (const model of modelList) {
        if (!model || typeof model !== 'object') continue;
        const modelID = typeof model.id === 'string'
          ? model.id.trim()
          : typeof (model as Record<string, unknown>).modelID === 'string'
            ? ((model as Record<string, unknown>).modelID as string).trim()
            : '';
        if (!modelID) continue;

        const caps = (model.capabilities || {}) as Record<string, unknown>;
        const input = (caps.input || {}) as Record<string, unknown>;
        if (input.image !== true) continue;

        const modelName = typeof model.name === 'string' && model.name.trim()
          ? model.name.trim()
          : modelID;

        result.push({ providerID, providerName, modelID, modelName });
      }
    }

    return result;
  }

  // 获取完整配置
  async getConfig(): Promise<OpencodeRuntimeConfig> {
    const client = this.getClient();
    const result = await client.config.get();
    return (result.data || {}) as OpencodeRuntimeConfig;
  }

  // 更新完整配置
  async updateConfig(config: OpencodeRuntimeConfig): Promise<OpencodeRuntimeConfig | null> {
    const client = this.getClient();
    try {
      const result = await client.config.update({
        body: config as unknown as never,
      });
      return (result.data || null) as OpencodeRuntimeConfig | null;
    } catch (error) {
      console.error('[OpenCode] 更新配置失败:', error);
      return null;
    }
  }

  // 获取可用 Agent 列表
  async getAgents(): Promise<OpencodeAgentInfo[]> {
    const client = this.getClient();
    const result = await client.app.agents();
    const rawAgents = Array.isArray(result.data) ? result.data : [];
    const agents: OpencodeAgentInfo[] = [];

    for (const item of rawAgents) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (!name) continue;

      const description = typeof record.description === 'string' && record.description.trim().length > 0
        ? record.description.trim()
        : undefined;
      const mode = parseAgentMode(record.mode);
      const hidden = parseBoolean(record.hidden);
      const builtIn = parseBoolean(record.builtIn);
      const native = parseBoolean(record.native);

      agents.push({
        name,
        description,
        mode,
        ...(hidden !== undefined ? { hidden } : {}),
        ...(builtIn !== undefined ? { builtIn } : {}),
        ...(native !== undefined ? { native } : {}),
      });
    }

    return agents;
  }
}
