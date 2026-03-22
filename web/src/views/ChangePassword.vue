<template>
  <div class="change-password-container">
    <el-card class="change-password-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <el-icon size="24" color="#e6a23c"><WarningFilled /></el-icon>
          <h2>首次登录 - 请修改密码</h2>
        </div>
      </template>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="warning-alert"
      >
        <template #title>
          <strong>安全提示</strong>
        </template>
        <template #default>
          为了账户安全，首次登录必须修改密码后才能继续使用。
          新密码长度至少 8 位。
          <br /><strong>原密码</strong>即您刚才登录时使用的密码。
        </template>
      </el-alert>

      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px" size="large">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input
            v-model="form.oldPassword"
            type="password"
            placeholder="请输入当前密码"
            show-password
            @keyup.enter="handleSubmit"
          />
          <div v-if="fieldErrors.oldPassword" class="field-error">{{ fieldErrors.oldPassword }}</div>
        </el-form-item>

        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            placeholder="请输入新密码（至少 8 位）"
            show-password
            @keyup.enter="handleSubmit"
          />
          <div v-if="fieldErrors.newPassword" class="field-error">{{ fieldErrors.newPassword }}</div>
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
            @keyup.enter="handleSubmit"
          />
          <div v-if="fieldErrors.confirmPassword" class="field-error">{{ fieldErrors.confirmPassword }}</div>
        </el-form-item>

        <el-form-item class="button-row">
          <el-button :disabled="submitting" @click="handleCancel">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            确认修改
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import axios from 'axios'

const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const fieldErrors = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (value !== form.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码长度至少 8 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' },
  ],
}

function handleCancel() {
  localStorage.removeItem('admin_token')
  router.push('/login')
}

function clearFieldErrors() {
  fieldErrors.oldPassword = ''
  fieldErrors.newPassword = ''
  fieldErrors.confirmPassword = ''
}

async function handleSubmit() {
  clearFieldErrors()
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true

  try {
    const token = localStorage.getItem('admin_token')
    const http = axios.create({
      baseURL: '/api',
      headers: { Authorization: `Bearer ${token}` },
    })

    await http.put('/admin/password', {
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    })

    localStorage.setItem('admin_token', form.newPassword)
    ElMessage.success('密码修改成功，正在跳转...')
    router.push('/dashboard')
  } catch (e: any) {
    if (e.response?.status === 401) {
      fieldErrors.oldPassword = '原密码错误，请重新输入'
    } else {
      ElMessage.error(e.response?.data?.error || '修改失败，请重试')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.change-password-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.change-password-card {
  width: 460px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.warning-alert {
  margin-bottom: 20px;
}

.field-error {
  color: #f56c6c;
  font-size: 12px;
  line-height: 1;
  padding-top: 4px;
}

.button-row {
  margin-top: 24px;
}

.button-row :deep(.el-form-item__content) {
  justify-content: flex-end;
  gap: 12px;
}
</style>