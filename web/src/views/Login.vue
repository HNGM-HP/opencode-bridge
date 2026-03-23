<template>
  <div class="login-container">
    <el-card class="login-card" shadow="hover">
      <template #header>
        <div class="login-header">
          <el-icon size="32" color="#409eff"><Monitor /></el-icon>
          <h2>OpenCode Bridge 配置中心</h2>
        </div>
      </template>

      <el-form :model="form" label-width="100px" size="large">
        <el-form-item label="管理密码">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入管理密码"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="loggingIn" @click="handleLogin" style="width: 100%">
            登录
          </el-button>
        </el-form-item>

        <el-alert
          v-if="error"
          type="error"
          :closable="false"
          show-icon
          class="error-alert"
        >
          {{ error }}
        </el-alert>
      </el-form>

      <div class="login-tip">
        <el-text size="small" type="info">
          {{ tipMessage }}
        </el-text>
        <el-button
          v-if="hasOldToken"
          size="small"
          type="warning"
          text
          @click="clearOldToken"
          style="margin-left: 8px"
        >
          清除旧登录缓存
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Monitor } from '@element-plus/icons-vue'
import axios from 'axios'

const router = useRouter()
const loggingIn = ref(false)
const error = ref('')
const hasPassword = ref(true)
const checkingStatus = ref(true)

const form = reactive({
  password: '',
})

const hasOldToken = computed(() => !!localStorage.getItem('admin_token'))

const tipMessage = computed(() => {
  if (!hasPassword.value) {
    return '首次使用请设置管理密码'
  }
  return '请输入管理密码登录'
})

onMounted(async () => {
  try {
    const http = axios.create({ baseURL: '/api' })
    const { data } = await http.get('/admin/password-status')
    hasPassword.value = data.hasPassword

    // 如果没有密码，直接跳转到设置密码页面
    if (!data.hasPassword) {
      router.replace('/change-password?mode=setup')
      return
    }
  } catch {
    // 检查失败，保持默认行为
  } finally {
    checkingStatus.value = false
  }
})

async function handleLogin() {
  if (!form.password.trim()) {
    error.value = '请输入密码'
    return
  }

  loggingIn.value = true
  error.value = ''

  try {
    // 先用临时 token 测试登录
    const http = axios.create({ baseURL: '/api' })
    http.defaults.headers.Authorization = `Bearer ${form.password}`

    await http.get('/admin/status')

    // 登录成功，保存 token
    localStorage.setItem('admin_token', form.password)
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch (e: any) {
    if (e.response?.status === 401) {
      error.value = '密码错误，请重试'
    } else {
      error.value = '登录失败：' + (e.message || '未知错误')
    }
  } finally {
    loggingIn.value = false
  }
}

function clearOldToken() {
  localStorage.removeItem('admin_token')
  ElMessage.success('已清除旧登录缓存，请重新登录')
}
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.login-card {
  width: 420px;
}

.login-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.login-tip {
  margin-top: 16px;
  text-align: center;
}

.error-alert {
  margin-top: 12px;
}
</style>
