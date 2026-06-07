/**
 * 模型提供商状态管理
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { configApi, type ModelProvider } from '../api'

export const useModelsStore = defineStore('models', () => {
  const modelProviders = ref<ModelProvider[]>([])

  async function fetchModels() {
    const data = await configApi.getModels()
    modelProviders.value = data.providers
  }

  return {
    modelProviders,
    fetchModels,
  }
})
