/**
 * 会话管理状态
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { configApi, type SessionInfo, type ServiceStatus } from '../api'

export const useAppStore = defineStore('app', () => {
  const status = ref<ServiceStatus | null>(null)
  const sessions = ref<SessionInfo[]>([])
  const loading = ref(false)
  const initialized = ref(false)

  async function fetchStatus() {
    status.value = await configApi.getStatus()
  }

  async function fetchSessions() {
    const data = await configApi.getSessions()
    const feishuSessions = (data.feishu || []).map(s => ({ ...s, platform: 'feishu' as const }))
    const discordSessions = (data.discord || []).map(s => ({ ...s, platform: 'discord' as const }))
    const wecomSessions = (data.wecom || []).map(s => ({ ...s, platform: 'wecom' as const }))
    const telegramSessions = (data.telegram || []).map(s => ({ ...s, platform: 'telegram' as const }))
    const qqSessions = (data.qq || []).map(s => ({ ...s, platform: 'qq' as const }))
    const whatsappSessions = (data.whatsapp || []).map(s => ({ ...s, platform: 'whatsapp' as const }))
    const weixinSessions = (data.weixin || []).map(s => ({ ...s, platform: 'weixin' as const }))
    sessions.value = [...feishuSessions, ...discordSessions, ...wecomSessions, ...telegramSessions, ...qqSessions, ...whatsappSessions, ...weixinSessions]
  }

  async function initializeAll() {
    if (initialized.value) return
    loading.value = true
    try {
      const { useSettingsStore } = await import('./settings')
      const { useCronStore } = await import('./cron')
      const { useModelsStore } = await import('./models')
      await Promise.all([
        useSettingsStore().fetchConfig(),
        fetchStatus(),
        useCronStore().fetchCronJobs(),
        fetchSessions(),
        useModelsStore().fetchModels(),
      ])
      initialized.value = true
    } finally {
      loading.value = false
    }
  }

  return {
    status, sessions, loading, initialized,
    fetchStatus, fetchSessions, initializeAll,
  }
})
