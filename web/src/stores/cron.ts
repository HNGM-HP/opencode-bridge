/**
 * 定时任务状态管理
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { configApi, type CronJob, type CreateCronJobInput } from '../api'

export const useCronStore = defineStore('cron', () => {
  const cronJobs = ref<CronJob[]>([])

  const cronJobCount = computed(() => cronJobs.value.length)
  const runningJobCount = computed(() => cronJobs.value.filter(j => j.enabled).length)

  async function fetchCronJobs() {
    cronJobs.value = await configApi.getCronJobs()
  }

  async function toggleCronJob(id: string) {
    const updated = await configApi.toggleCronJob(id)
    const idx = cronJobs.value.findIndex(j => j.id === id)
    if (idx !== -1) cronJobs.value[idx] = updated
  }

  async function deleteCronJob(id: string) {
    await configApi.deleteCronJob(id)
    cronJobs.value = cronJobs.value.filter(j => j.id !== id)
  }

  async function createCronJob(input: CreateCronJobInput) {
    const created = await configApi.createCronJob(input)
    cronJobs.value = [...cronJobs.value, created]
  }

  return {
    cronJobs, cronJobCount, runningJobCount,
    fetchCronJobs, toggleCronJob, deleteCronJob, createCronJob,
  }
})
