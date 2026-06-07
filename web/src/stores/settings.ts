/**
 * 设置状态管理（配置、保存、重启）
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { configApi, type BridgeSettings } from '../api'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<BridgeSettings>({})
  const pendingRestart = ref(false)
  const pendingRestartKeys = ref<string[]>([])

  async function fetchConfig() {
    settings.value = await configApi.getConfig()
  }

  async function saveConfig(partial: BridgeSettings) {
    const result = await configApi.saveConfig({ ...settings.value, ...partial })
    settings.value = { ...settings.value, ...partial }
    if (result.needRestart) {
      pendingRestart.value = true
      pendingRestartKeys.value = result.changedKeys
    }
    return result
  }

  async function restart() {
    await configApi.restart()
    pendingRestart.value = false
    pendingRestartKeys.value = []
  }

  return {
    settings, pendingRestart, pendingRestartKeys,
    fetchConfig, saveConfig, restart,
  }
})
