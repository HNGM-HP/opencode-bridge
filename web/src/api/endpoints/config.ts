/**
 * 配置管理 API
 */

import { http } from '../types'
import type {
  BridgeSettings,
  SaveConfigResult,
  ServiceStatus,
  BridgeStatus,
  OpenCodeStatus,
  OpenCodeUpdateCheck,
  CronJob,
  CreateCronJobInput,
  LogLevel,
  LogQueryResult,
  LogStats,
  ChatModelProviderInfo,
  ModelProvider,
  SessionInfo,
} from '../types'

export const configApi = {
  async getConfig(): Promise<BridgeSettings> {
    const res = await http.get<{ settings: BridgeSettings }>('/config')
    return res.data.settings
  },

  async saveConfig(settings: BridgeSettings): Promise<SaveConfigResult> {
    const res = await http.post<SaveConfigResult>('/config', settings)
    return res.data
  },

  async getCronJobs(): Promise<CronJob[]> {
    const res = await http.get<{ jobs: CronJob[] }>('/cron')
    return res.data.jobs
  },

  async createCronJob(input: CreateCronJobInput): Promise<CronJob> {
    const res = await http.post<{ job: CronJob }>('/cron/create', input)
    return res.data.job
  },

  async toggleCronJob(id: string): Promise<CronJob> {
    const res = await http.post<{ job: CronJob }>(`/cron/${id}/toggle`)
    return res.data.job
  },

  async deleteCronJob(id: string): Promise<void> {
    await http.delete(`/cron/${id}`)
  },

  async getStatus(): Promise<ServiceStatus> {
    const res = await http.get<ServiceStatus>('/admin/status')
    return res.data
  },

  async restart(): Promise<{ ok: boolean; pid?: number; message: string }> {
    const res = await http.post<{ ok: boolean; pid?: number; message: string }>('/admin/restart')
    return res.data
  },

  async getModels(): Promise<{ providers: ModelProvider[]; raw: string[] }> {
    const res = await http.get<{ models: Record<string, string[]>; raw: string[] }>('/opencode/models')
    const providers: ModelProvider[] = Object.entries(res.data.models).map(([name, models]) => ({
      name,
      models,
    }))
    return { providers, raw: res.data.raw }
  },

  async getModelCatalog(): Promise<ChatModelProviderInfo[]> {
    const res = await http.get<{ providers: ChatModelProviderInfo[] }>('/opencode/model-catalog')
    return Array.isArray(res.data.providers) ? res.data.providers : []
  },

  async syncEnabledModelsFromOpenCode(): Promise<{ source: string; models: string[]; count: number }> {
    const res = await http.get<{ source: string; models: string[]; count: number }>('/opencode/enabled-models-sync')
    return {
      source: res.data.source,
      models: Array.isArray(res.data.models) ? res.data.models : [],
      count: typeof res.data.count === 'number' ? res.data.count : 0,
    }
  },

  async getSessions(): Promise<{
    feishu: SessionInfo[]
    discord: SessionInfo[]
    wecom: SessionInfo[]
    telegram: SessionInfo[]
    qq: SessionInfo[]
    whatsapp: SessionInfo[]
    weixin: SessionInfo[]
  }> {
    const res = await http.get<{
      feishu: SessionInfo[]
      discord: SessionInfo[]
      wecom: SessionInfo[]
      telegram: SessionInfo[]
      qq: SessionInfo[]
      whatsapp: SessionInfo[]
      weixin: SessionInfo[]
    }>('/sessions')
    return res.data
  },

  async getLogs(params?: {
    level?: LogLevel
    search?: string
    start?: string
    end?: string
    page?: number
    limit?: number
  }): Promise<LogQueryResult> {
    const res = await http.get<LogQueryResult>('/logs', { params })
    return res.data
  },

  async getLogStats(): Promise<LogStats> {
    const res = await http.get<LogStats>('/logs/stats')
    return res.data
  },

  async clearLogs(): Promise<void> {
    await http.delete('/logs')
  },

  async getHealth(): Promise<{
    status: string
    timestamp: string
    checks: {
      database: { status: string; message: string }
      opencode: { status: string; message: string }
      feishu: { status: string; message: string }
      discord: { status: string; message: string }
      wecom: { status: string; message: string }
      telegram: { status: string; message: string }
      qq: { status: string; message: string }
      whatsapp: { status: string; message: string }
    }
  }> {
    const res = await http.get('/admin/health')
    return res.data
  },

  async repair(): Promise<{ ok: boolean; results: string[] }> {
    const res = await http.post('/admin/repair')
    return res.data
  },

  async getBridgeStatus(): Promise<BridgeStatus> {
    const res = await http.get<BridgeStatus>('/admin/bridge')
    return res.data
  },

  async upgrade(): Promise<{ ok: boolean; message: string }> {
    const res = await http.post('/admin/upgrade')
    return res.data
  },

  async getOpenCodeStatus(): Promise<OpenCodeStatus> {
    const res = await http.get<OpenCodeStatus>('/opencode/status')
    return res.data
  },

  async installOpenCode(): Promise<{ ok: boolean; message: string }> {
    const res = await http.post('/opencode/install')
    return res.data
  },

  async upgradeOpenCode(): Promise<{ ok: boolean; message: string }> {
    const res = await http.post('/opencode/upgrade')
    return res.data
  },

  async startOpenCode(): Promise<{ ok: boolean; message: string }> {
    const res = await http.post('/opencode/start')
    return res.data
  },

  async attachOpenCode(host?: string, port?: number): Promise<{ ok: boolean; message: string }> {
    const res = await http.post('/opencode/attach', { host: host ?? 'localhost', port: port ?? 4096 })
    return res.data
  },

  async stopOpenCode(): Promise<{ ok: boolean; message: string }> {
    const res = await http.post('/opencode/stop')
    return res.data
  },

  async checkOpenCodeUpdate(): Promise<OpenCodeUpdateCheck> {
    const res = await http.get<OpenCodeUpdateCheck>('/opencode/check-update')
    return res.data
  },

  async checkBridgeUpdate(): Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion: string | null }> {
    const res = await http.get<{ hasUpdate: boolean; currentVersion: string; latestVersion: string | null }>('/admin/check-update')
    return res.data
  },

  async stopBridge(): Promise<{ ok: boolean; message: string }> {
    const res = await http.post<{ ok: boolean; message: string }>('/admin/stop-bridge')
    return res.data
  },

  async shutdown(): Promise<{ ok: boolean; message: string }> {
    const res = await http.post<{ ok: boolean; message: string }>('/admin/shutdown')
    return res.data
  },

  async getAutoStart(): Promise<{ enabled: boolean; supported: boolean; platform: string }> {
    const res = await http.get<{ enabled: boolean; supported: boolean; platform: string }>('/admin/autostart')
    return res.data
  },

  async setAutoStart(enabled: boolean): Promise<{ ok: boolean; enabled: boolean; supported: boolean; platform: string }> {
    const res = await http.put<{ ok: boolean; enabled: boolean; supported: boolean; platform: string }>('/admin/autostart', { enabled })
    return res.data
  },

  async getOnboardingStatus(): Promise<{ completed: boolean }> {
    const res = await http.get<{ completed: boolean }>('/admin/onboarding-status')
    return res.data
  },

  async setOnboardingStatus(completed: boolean): Promise<{ ok: boolean; completed: boolean }> {
    const res = await http.put<{ ok: boolean; completed: boolean }>('/admin/onboarding-status', { completed })
    return res.data
  },
}
