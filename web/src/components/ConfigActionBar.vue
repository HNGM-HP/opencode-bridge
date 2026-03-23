<template>
  <div class="config-action-bar">
    <el-button type="primary" :loading="saving" @click="$emit('save')">保存配置</el-button>
    <el-button @click="handleCancel">取消修改</el-button>
    <el-button @click="handleExport">导出配置</el-button>
    <el-button @click="triggerImport">导入配置</el-button>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInput"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { BridgeSettings } from '../api'

const props = defineProps<{
  saving: boolean
  configData: BridgeSettings
}>()

const emit = defineEmits<{
  save: []
  cancel: []
  importConfig: [config: BridgeSettings]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

function handleCancel() {
  location.reload()
}

function handleExport() {
  const config = props.configData
  const jsonStr = JSON.stringify(config, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bridge-config-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  ElMessage.success('配置已导出')
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const config = JSON.parse(text) as BridgeSettings

    await ElMessageBox.confirm(
      '导入配置将覆盖当前页面的所有配置项，是否继续？',
      '确认导入',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )

    emit('importConfig', config)
    ElMessage.success('配置已导入')
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('配置文件格式错误: ' + (e.message || '未知错误'))
    }
  }

  // 清空文件选择，允许重复选择同一文件
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<style scoped>
.config-action-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-action-bar .el-button {
  width: 100%;
  margin: 0;
}
</style>