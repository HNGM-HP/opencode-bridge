/**
 * 配置状态管理（组合入口）
 *
 * 向后兼容：保留 useConfigStore，同时导出各领域子 store
 * 新代码建议按需导入子 store:
 *   import { useSettingsStore } from '../stores/config'
 */

import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useSettingsStore } from './settings'
import { useCronStore } from './cron'
import { useAppStore } from './app'
import { useModelsStore } from './models'

export { useSettingsStore }
export { useCronStore }
export { useAppStore }
export { useModelsStore }

// 组合 store（向后兼容原有的 useConfigStore）
export const useConfigStore = defineStore('config', () => {
  // 动态导入子 store 避免循环依赖
  const settingsStore = useSettingsStore()
  const cronStore = useCronStore()
  const appStore = useAppStore()
  const modelsStore = useModelsStore()

  // 组合状态
  const settings = computed(() => settingsStore.settings)
  const cronJobs = computed(() => cronStore.cronJobs)
  const status = computed(() => appStore.status)
  const sessions = computed(() => appStore.sessions)
  const modelProviders = computed(() => modelsStore.modelProviders)
  const loading = computed(() => appStore.loading)
  const initialized = computed(() => appStore.initialized)
  const pendingRestart = computed(() => settingsStore.pendingRestart)
  const pendingRestartKeys = computed(() => settingsStore.pendingRestartKeys)
  const cronJobCount = computed(() => cronStore.cronJobCount)
  const runningJobCount = computed(() => cronStore.runningJobCount)

  // 组合方法
  const fetchConfig = () => settingsStore.fetchConfig()
  const saveConfig = (partial: any) => settingsStore.saveConfig(partial)
  const restart = () => settingsStore.restart()
  const fetchCronJobs = () => cronStore.fetchCronJobs()
  const toggleCronJob = (id: string) => cronStore.toggleCronJob(id)
  const deleteCronJob = (id: string) => cronStore.deleteCronJob(id)
  const createCronJob = (input: any) => cronStore.createCronJob(input)
  const fetchStatus = () => appStore.fetchStatus()
  const fetchSessions = () => appStore.fetchSessions()
  const fetchModels = () => modelsStore.fetchModels()
  const initializeAll = () => appStore.initializeAll()

  return {
    // 状态
    settings, cronJobs, status, sessions, modelProviders,
    loading, initialized,
    pendingRestart, pendingRestartKeys,
    cronJobCount, runningJobCount,
    // 方法
    fetchConfig, saveConfig, restart,
    fetchCronJobs, toggleCronJob, deleteCronJob, createCronJob,
    fetchStatus, fetchSessions, fetchModels,
    initializeAll,
  }
})
