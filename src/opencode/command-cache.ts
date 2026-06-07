import type { OpencodeClient as SdkOpencodeClient } from '@opencode-ai/sdk';
import type { OpencodeCommandInfo } from './client.js';

export interface CommandCacheManagerDeps {
  getClient: () => SdkOpencodeClient | null;
}

export class CommandCacheManager {
  // 命令列表缓存（5 分钟 TTL）
  private commandsCache: OpencodeCommandInfo[] | null = null;
  private commandsCacheTimestamp: number = 0;
  private readonly COMMANDS_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  // OpenCode 版本信息缓存
  private opencodeVersion: string | null = null;
  private versionChecked = false;

  constructor(private deps: CommandCacheManagerDeps) {}

  // 获取可用命令列表（slash command）
  async getCommands(): Promise<OpencodeCommandInfo[]> {
    // 1. 检查缓存是否有效
    const now = Date.now();
    if (this.commandsCache && (now - this.commandsCacheTimestamp) < this.COMMANDS_CACHE_TTL) {
      return this.commandsCache;
    }

    // 2. 版本兼容性检查（仅首次调用时）
    if (!this.versionChecked) {
      const versionOk = await this.checkOpenCodeVersion();
      if (!versionOk) {
        console.warn('[OpenCode] 当前版本可能不支持 command.list API，继续尝试调用...');
      }
      this.versionChecked = true;
    }

    // 3. 调用 API 获取命令列表
    try {
      const client = this.deps.getClient();
      if (!client) {
        throw new Error('OpenCode客户端未连接');
      }
      const result = await client.command.list();
      const raw = Array.isArray(result.data) ? result.data : [];
      const commands = raw as OpencodeCommandInfo[];

      // 4. 更新缓存
      this.commandsCache = commands;
      this.commandsCacheTimestamp = now;

      return commands;
    } catch (error) {
      console.error('[OpenCode] 获取命令列表失败:', error);
      throw error; // 抛出错误让调用者处理
    }
  }

  // 检查 OpenCode 版本兼容性
  async checkOpenCodeVersion(): Promise<boolean> {
    try {
      const client = this.deps.getClient();
      if (!client) {
        throw new Error('OpenCode客户端未连接');
      }
      // 尝试调用 command.list 来检测 API 是否可用
      const result = await client.command.list();
      // 如果调用成功且有数据返回，说明 API 可用
      if (result.data && Array.isArray(result.data)) {
        return true;
      }
      // 如果返回空数组，也说明 API 可用（只是没有命令）
      return result.data !== undefined;
    } catch (error) {
      // 如果调用失败，说明 API 不可用或版本不兼容
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[OpenCode] command.list API 不可用:', errorMessage);
      return false;
    }
  }

  // 获取 OpenCode 版本信息（供外部调用）
  public getOpencodeVersion(): string | null {
    return this.opencodeVersion;
  }

  // 清除命令缓存（用于强制刷新）
  public clearCommandsCache(): void {
    this.commandsCache = null;
    this.commandsCacheTimestamp = 0;
  }
}
