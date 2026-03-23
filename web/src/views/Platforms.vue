<template>
  <div class="page">
    <div class="page-header">
      <h2>平台接入配置</h2>
      <p class="desc">配置飞书、Discord、企业微信、个人微信、Telegram、QQ 与 WhatsApp 机器人的核心凭证和接入参数</p>
    </div>

    <div class="page-layout">
      <div class="form-area">
        <el-form :model="form" label-position="top" @submit.prevent>

      <!-- 飞书配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">🤖 飞书（Lark）配置 <el-tag size="small" type="info">可选</el-tag></span>
            <div class="inline-switch">
              <span>启用飞书</span>
              <el-switch v-model="feishuEnabled"
                active-text="开启" inactive-text="关闭"
                @change="form.FEISHU_ENABLED = feishuEnabled ? 'true' : 'false'" />
            </div>
          </div>
        </template>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="App ID">
              <el-input v-model="form.FEISHU_APP_ID" placeholder="cli_xxxxxxxxxxxxx"
                prefix-icon="Key" clearable :disabled="!feishuEnabled" />
              <div class="field-tip">飞书开发者后台 → 凭证与基础信息 → App ID</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="App Secret">
              <el-input v-model="form.FEISHU_APP_SECRET" placeholder="••••••••"
                type="password" show-password prefix-icon="Lock" :disabled="!feishuEnabled" />
              <div class="field-tip">飞书开发者后台 → 凭证与基础信息 → App Secret</div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="Encrypt Key（可选）">
              <el-input v-model="form.FEISHU_ENCRYPT_KEY" placeholder="留空则不加密"
                type="password" show-password :disabled="!feishuEnabled" />
              <div class="field-tip">消息加密密钥，与飞书后台「事件订阅 → 加密策略」保持一致</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Verification Token（可选）">
              <el-input v-model="form.FEISHU_VERIFICATION_TOKEN" placeholder="留空则跳过验证"
                type="password" show-password :disabled="!feishuEnabled" />
              <div class="field-tip">飞书事件订阅验证 Token，用于校验请求来源</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- Discord 配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">🎮 Discord 配置 <el-tag size="small" type="info">可选</el-tag></span>
            <div class="inline-switch">
              <span>启用 Discord</span>
              <el-switch v-model="discordEnabled"
                active-text="开启" inactive-text="关闭"
                @change="form.DISCORD_ENABLED = discordEnabled ? 'true' : 'false'" />
            </div>
          </div>
        </template>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="Bot Token">
              <el-input v-model="form.DISCORD_TOKEN" placeholder="your-discord-bot-token"
                type="password" show-password :disabled="!discordEnabled" />
              <div class="field-tip">Discord Developer Portal → Bot → Token</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Client ID">
              <el-input v-model="form.DISCORD_CLIENT_ID" placeholder="your-discord-client-id"
                :disabled="!discordEnabled" />
              <div class="field-tip">Discord Developer Portal → OAuth2 → Client ID</div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="允许的 Bot ID 列表（可选）">
              <el-input v-model="form.DISCORD_ALLOWED_BOT_IDS" placeholder="纯数字 ID，逗号分隔"
                :disabled="!discordEnabled" />
              <div class="field-tip">允许其他 Bot 加入白名单，填 Discord Snowflake ID（纯数字）</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- 企业微信配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">💼 企业微信（WeCom）配置 <el-tag size="small" type="info">可选</el-tag></span>
            <div class="inline-switch">
              <span>启用企业微信</span>
              <el-switch v-model="wecomEnabled"
                active-text="开启" inactive-text="关闭"
                @change="form.WECOM_ENABLED = wecomEnabled ? 'true' : 'false'" />
            </div>
          </div>
        </template>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="Bot ID">
              <el-input v-model="form.WECOM_BOT_ID" placeholder="your-wecom-bot-id"
                prefix-icon="Key" clearable :disabled="!wecomEnabled" />
              <div class="field-tip">企业微信管理后台 → 应用管理 → AgentId</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Secret">
              <el-input v-model="form.WECOM_SECRET" placeholder="your-wecom-secret"
                type="password" show-password prefix-icon="Lock" :disabled="!wecomEnabled" />
              <div class="field-tip">企业微信管理后台 → 应用管理 → Secret</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- 个人微信配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">💬 个人微信配置 <el-tag size="small" type="info">可选</el-tag></span>
            <div class="inline-switch">
              <span>启用个人微信</span>
              <el-switch v-model="weixinEnabled"
                active-text="开启" inactive-text="关闭"
                @change="form.WEIXIN_ENABLED = weixinEnabled ? 'true' : 'false'" />
            </div>
          </div>
        </template>

        <el-alert type="warning" :closable="false" style="margin-bottom: 16px" v-if="weixinEnabled">
          个人微信基于腾讯 OpenClaw 协议，仅支持私聊，不支持群聊。请使用专用测试账号。
        </el-alert>

        <div v-if="weixinEnabled">
          <!-- 账号列表 -->
          <div class="weixin-accounts" v-if="weixinAccounts.length > 0">
            <div class="account-item" v-for="acc in weixinAccounts" :key="acc.id">
              <div class="account-info">
                <el-avatar :size="36" :src="acc.avatar">
                  {{ (acc.nickname || acc.wxid || '?')[0] }}
                </el-avatar>
                <div class="account-meta">
                  <div class="nickname">{{ acc.nickname || acc.wxid }}</div>
                  <div class="wxid">ID: {{ acc.wxid }}</div>
                </div>
              </div>
              <div class="account-actions">
                <el-tag :type="acc.enabled ? 'success' : 'info'" size="small">
                  {{ acc.enabled ? '已启用' : '已禁用' }}
                </el-tag>
                <el-button size="small" @click="toggleWeixinAccount(acc.id, !acc.enabled)">
                  {{ acc.enabled ? '禁用' : '启用' }}
                </el-button>
                <el-popconfirm title="确定删除此账号？" @confirm="deleteWeixinAccount(acc.id)">
                  <template #reference>
                    <el-button size="small" type="danger">删除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>

          <el-empty v-else description="暂无已登录账号" :image-size="60" />

          <!-- 扫码登录 -->
          <div class="qr-login-section">
            <el-button type="primary" @click="startWeixinLogin" :loading="weixinLoginLoading">
              {{ weixinLoginLoading ? '获取二维码中...' : '扫码登录新账号' }}
            </el-button>

            <el-dialog v-model="weixinQrDialogVisible" title="微信扫码登录" width="360px" :close-on-click-modal="false">
              <div class="qr-dialog-content">
                <div class="qr-image" v-if="weixinQrImage">
                  <img :src="weixinQrImage" alt="QR Code" />
                </div>
                <el-skeleton v-else animated>
                  <template #template>
                    <el-skeleton-item variant="image" style="width: 200px; height: 200px" />
                  </template>
                </el-skeleton>
                <div class="qr-status">
                  <el-tag :type="weixinQrStatusType">{{ weixinQrStatusText }}</el-tag>
                </div>
                <el-button @click="cancelWeixinLogin" v-if="weixinLoginLoading">取消</el-button>
              </div>
            </el-dialog>
          </div>
        </div>
      </el-card>

      <!-- Telegram 配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">📱 Telegram 配置 <el-tag size="small" type="info">可选</el-tag></span>
            <div class="inline-switch">
              <span>启用 Telegram</span>
              <el-switch v-model="telegramEnabled"
                active-text="开启" inactive-text="关闭"
                @change="form.TELEGRAM_ENABLED = telegramEnabled ? 'true' : 'false'" />
            </div>
          </div>
        </template>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="Bot Token">
              <el-input v-model="form.TELEGRAM_BOT_TOKEN" placeholder="123456789:ABCdefGHI..."
                type="password" show-password :disabled="!telegramEnabled" />
              <div class="field-tip">从 @BotFather 获取，格式：123456789:ABCdefGHI...</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-tag :type="telegramStatusType">{{ telegramStatusText }}</el-tag>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- QQ 配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">💬 QQ 配置 <el-tag size="small" type="info">可选</el-tag></span>
            <div class="inline-switch">
              <span>启用 QQ</span>
              <el-switch v-model="qqEnabled"
                active-text="开启" inactive-text="关闭"
                @change="form.QQ_ENABLED = qqEnabled ? 'true' : 'false'" />
            </div>
          </div>
        </template>

        <el-row :gutter="24">
          <el-col :span="8">
            <el-form-item label="协议类型">
              <el-select v-model="form.QQ_PROTOCOL" :disabled="!qqEnabled" style="width: 100%">
                <el-option label="官方 API (推荐)" value="official" />
                <el-option label="OneBot (NapCat)" value="onebot" />
              </el-select>
              <div class="field-tip">官方 API 更稳定，OneBot 支持传统 QQ 群</div>
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="状态">
              <el-tag :type="qqStatusType">{{ qqStatusText }}</el-tag>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 官方 API 配置 -->
        <el-row :gutter="24" v-if="form.QQ_PROTOCOL === 'official'">
          <el-col :span="12">
            <el-form-item label="App ID">
              <el-input v-model="form.QQ_APP_ID" :disabled="!qqEnabled" placeholder="QQ 开放平台应用 ID" />
              <div class="field-tip">从 QQ 机器人开放平台获取</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Secret">
              <el-input v-model="form.QQ_SECRET" type="password" show-password :disabled="!qqEnabled" placeholder="QQ 开放平台应用密钥" />
              <div class="field-tip">从 QQ 机器人开放平台获取</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-alert v-if="form.QQ_PROTOCOL === 'official'" type="info" :closable="false" style="margin-top: 8px">
          官方 API 使用 WebSocket 连接接收消息，无需配置回调地址。
        </el-alert>

        <!-- OneBot 配置 -->
        <el-row :gutter="24" v-if="form.QQ_PROTOCOL === 'onebot'">
          <el-col :span="24">
            <el-alert type="warning" :closable="false" style="margin-bottom: 16px">
              OneBot 协议存在风控风险，建议仅用于个人测试。推荐使用 NapCat（NTQQ 官方协议）。
            </el-alert>
          </el-col>
          <el-col :span="24">
            <el-form-item label="WebSocket 地址">
              <el-input v-model="form.QQ_ONEBOT_WS_URL" :disabled="!qqEnabled" placeholder="ws://localhost:3001" />
              <div class="field-tip">NapCat/go-cqhttp 的 WebSocket 地址</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- WhatsApp 配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">🟢 WhatsApp 配置 <el-tag size="small" type="info">可选</el-tag></span>
            <div class="inline-switch">
              <span>启用 WhatsApp</span>
              <el-switch v-model="whatsappEnabled"
                active-text="开启" inactive-text="关闭"
                @change="form.WHATSAPP_ENABLED = whatsappEnabled ? 'true' : 'false'" />
            </div>
          </div>
        </template>

        <el-row :gutter="24">
          <el-col :span="8">
            <el-form-item label="模式">
              <el-select v-model="form.WHATSAPP_MODE" :disabled="!whatsappEnabled" style="width: 100%">
                <el-option label="个人版 (扫码登录)" value="personal" />
                <el-option label="Business API" value="business" />
              </el-select>
              <div class="field-tip">个人版免费但有风控风险</div>
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="状态">
              <el-tag :type="whatsappStatusType">{{ whatsappStatusText }}</el-tag>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 个人版配置 -->
        <el-row :gutter="24" v-if="form.WHATSAPP_MODE === 'personal'">
          <el-col :span="24">
            <el-alert type="warning" :closable="false" style="margin-bottom: 16px">
              WhatsApp Web 协议存在风控风险，可能导致号码被封。建议使用专用测试号码。
            </el-alert>
          </el-col>
          <el-col :span="24">
            <el-form-item label="Session 存储路径">
              <el-input v-model="form.WHATSAPP_SESSION_PATH" :disabled="!whatsappEnabled" placeholder="~/.whatsapp-session" />
              <div class="field-tip">WhatsApp 会话数据存储目录</div>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- Business API 配置 -->
        <el-row :gutter="24" v-if="form.WHATSAPP_MODE === 'business'">
          <el-col :span="12">
            <el-form-item label="Phone ID">
              <el-input v-model="form.WHATSAPP_BUSINESS_PHONE_ID" :disabled="!whatsappEnabled" placeholder="WhatsApp Business Phone ID" />
              <div class="field-tip">从 Meta for Developers 获取</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Access Token">
              <el-input v-model="form.WHATSAPP_BUSINESS_ACCESS_TOKEN" type="password" show-password :disabled="!whatsappEnabled" placeholder="WhatsApp Business Access Token" />
              <div class="field-tip">从 Meta for Developers 获取</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- 通用访问控制 -->
      <el-card class="config-card">
        <template #header>
          <span class="card-title">🔐 访问控制</span>
        </template>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="平台白名单（ENABLED_PLATFORMS）">
              <el-select v-model="enabledPlatforms" multiple placeholder="留空 = 全部平台启用"
                style="width:100%" @change="onPlatformsChange">
                <el-option label="飞书 (feishu)" value="feishu" />
                <el-option label="Discord (discord)" value="discord" />
                <el-option label="企业微信 (wecom)" value="wecom" />
                <el-option label="个人微信 (weixin)" value="weixin" />
                <el-option label="Telegram (telegram)" value="telegram" />
                <el-option label="QQ (qq)" value="qq" />
                <el-option label="WhatsApp (whatsapp)" value="whatsapp" />
              </el-select>
              <div class="field-tip">指定启用哪些平台，留空时所有平台均可用</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="用户白名单（ALLOWED_USERS）">
              <el-select v-model="allowedUsers" multiple placeholder="选择允许的用户" filterable
                style="width:100%" @change="onAllowedUsersChange">
                <el-option-group v-for="group in sessionGroups" :key="group.label" :label="group.label">
                  <el-option v-for="item in group.options" :key="item.value" :label="item.label" :value="item.value" />
                </el-option-group>
              </el-select>
              <div class="field-tip">从当前活跃会话中选择允许的用户，也可手动输入 open_id</div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="群聊触发策略（GROUP_REQUIRE_MENTION）">
              <el-switch v-model="groupRequireMention"
                active-text="必须 @ 机器人才响应" inactive-text="普通消息也响应"
                @change="form.GROUP_REQUIRE_MENTION = groupRequireMention ? 'true' : 'false'" />
              <div class="field-tip">为 true 时，群聊中只有明确 @ 机器人的消息才会触发响应</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>
    </el-form>
      </div>

      <div class="sidebar">
        <ConfigActionBar
          :saving="saving"
          :config-data="form"
          @save="handleSave"
          @import-config="handleImportConfig"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConfigStore } from '../stores/config'
import { weixinApi, type WeixinAccount } from '../api'
import ConfigActionBar from '../components/ConfigActionBar.vue'

const store = useConfigStore()
const saving = ref(false)
const feishuEnabled = ref(false)
const discordEnabled = ref(false)
const wecomEnabled = ref(false)
const weixinEnabled = ref(false)
const telegramEnabled = ref(false)
const qqEnabled = ref(false)
const whatsappEnabled = ref(false)
const groupRequireMention = ref(false)
const enabledPlatforms = ref<string[]>([])
const allowedUsers = ref<string[]>([])

// 微信账号管理
const weixinAccounts = ref<WeixinAccount[]>([])
const weixinLoginLoading = ref(false)
const weixinQrDialogVisible = ref(false)
const weixinQrImage = ref('')
const weixinQrSessionId = ref('')
const weixinQrStatus = ref<'waiting' | 'scanned' | 'confirmed' | 'expired' | 'cancelled' | 'error'>('waiting')

const weixinQrStatusType = computed(() => {
  switch (weixinQrStatus.value) {
    case 'waiting': return 'info'
    case 'scanned': return 'warning'
    case 'confirmed': return 'success'
    case 'expired': return 'danger'
    case 'cancelled': return 'info'
    case 'error': return 'danger'
    default: return 'info'
  }
})

const weixinQrStatusText = computed(() => {
  switch (weixinQrStatus.value) {
    case 'waiting': return '请扫描二维码'
    case 'scanned': return '已扫描，请在手机确认'
    case 'confirmed': return '登录成功'
    case 'expired': return '二维码已过期'
    case 'cancelled': return '已取消'
    case 'error': return '登录失败'
    default: return '未知状态'
  }
})

// 从 store 获取会话数据（启动时已加载）
const sessions = computed(() => {
  const list = store.sessions
  return {
    feishu: list.filter(s => s.platform === 'feishu'),
    discord: list.filter(s => s.platform === 'discord'),
    wecom: list.filter(s => s.platform === 'wecom'),
    telegram: list.filter(s => s.platform === 'telegram'),
    qq: list.filter(s => s.platform === 'qq'),
    whatsapp: list.filter(s => s.platform === 'whatsapp'),
    weixin: list.filter(s => s.platform === 'weixin'),
  }
})

const sessionGroups = computed(() => {
  const groups: Array<{ label: string; options: Array<{ label: string; value: string }> }> = []
  if (sessions.value.feishu.length > 0) {
    groups.push({
      label: '飞书会话',
      options: sessions.value.feishu.map(s => ({
        label: `${s.title} (${s.chatId})`,
        value: s.chatId || '',
      })),
    })
  }
  if (sessions.value.discord.length > 0) {
    groups.push({
      label: 'Discord 频道',
      options: sessions.value.discord.map(s => ({
        label: `${s.title} (${s.conversationId})`,
        value: s.conversationId || '',
      })),
    })
  }
  if (sessions.value.wecom.length > 0) {
    groups.push({
      label: '企业微信会话',
      options: sessions.value.wecom.map(s => ({
        label: `${s.title} (${s.conversationId || s.chatId})`,
        value: s.conversationId || s.chatId || '',
      })),
    })
  }
  if (sessions.value.telegram.length > 0) {
    groups.push({
      label: 'Telegram 会话',
      options: sessions.value.telegram.map(s => ({
        label: `${s.title} (${s.chatId})`,
        value: s.chatId || '',
      })),
    })
  }
  if (sessions.value.qq.length > 0) {
    groups.push({
      label: 'QQ 会话',
      options: sessions.value.qq.map(s => ({
        label: `${s.title} (${s.chatId})`,
        value: s.chatId || '',
      })),
    })
  }
  if (sessions.value.whatsapp.length > 0) {
    groups.push({
      label: 'WhatsApp 会话',
      options: sessions.value.whatsapp.map(s => ({
        label: `${s.title} (${s.chatId})`,
        value: s.chatId || '',
      })),
    })
  }
  if (sessions.value.weixin.length > 0) {
    groups.push({
      label: '微信会话',
      options: sessions.value.weixin.map(s => ({
        label: `${s.title} (${s.chatId})`,
        value: s.chatId || '',
      })),
    })
  }
  return groups
})

// Telegram 状态
const telegramStatusType = computed(() => {
  if (!telegramEnabled.value) return 'info'
  if (form.TELEGRAM_BOT_TOKEN) return 'success'
  return 'warning'
})

const telegramStatusText = computed(() => {
  if (!telegramEnabled.value) return '未启用'
  if (form.TELEGRAM_BOT_TOKEN) return '已配置'
  return '待配置'
})

// QQ 状态
const qqStatusType = computed(() => {
  if (!qqEnabled.value) return 'info'
  if (form.QQ_PROTOCOL === 'official') {
    if (form.QQ_APP_ID && form.QQ_SECRET) return 'success'
  } else {
    if (form.QQ_ONEBOT_WS_URL) return 'success'
  }
  return 'warning'
})

const qqStatusText = computed(() => {
  if (!qqEnabled.value) return '未启用'
  if (form.QQ_PROTOCOL === 'official') {
    if (form.QQ_APP_ID && form.QQ_SECRET) return '已配置 (官方 API)'
    return '待配置 (官方 API)'
  } else {
    if (form.QQ_ONEBOT_WS_URL) return '已配置 (OneBot)'
    return '待配置 (OneBot)'
  }
})

// WhatsApp 状态
const whatsappStatusType = computed(() => {
  if (!whatsappEnabled.value) return 'info'
  if (form.WHATSAPP_MODE === 'business') {
    if (form.WHATSAPP_BUSINESS_PHONE_ID && form.WHATSAPP_BUSINESS_ACCESS_TOKEN) return 'success'
  } else {
    if (form.WHATSAPP_SESSION_PATH) return 'success'
  }
  return 'warning'
})

const whatsappStatusText = computed(() => {
  if (!whatsappEnabled.value) return '未启用'
  if (form.WHATSAPP_MODE === 'business') {
    if (form.WHATSAPP_BUSINESS_PHONE_ID && form.WHATSAPP_BUSINESS_ACCESS_TOKEN) return '已配置 (Business API)'
    return '待配置 (Business API)'
  } else {
    if (form.WHATSAPP_SESSION_PATH) return '已配置 (个人版)'
    return '待配置 (个人版)'
  }
})

const form = reactive({
  FEISHU_ENABLED: 'false',
  FEISHU_APP_ID: '',
  FEISHU_APP_SECRET: '',
  FEISHU_ENCRYPT_KEY: '',
  FEISHU_VERIFICATION_TOKEN: '',
  DISCORD_ENABLED: 'false',
  DISCORD_TOKEN: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_ALLOWED_BOT_IDS: '',
  WECOM_ENABLED: 'false',
  WECOM_BOT_ID: '',
  WECOM_SECRET: '',
  WEIXIN_ENABLED: 'false',
  TELEGRAM_ENABLED: 'false',
  TELEGRAM_BOT_TOKEN: '',
  QQ_ENABLED: 'false',
  QQ_PROTOCOL: 'onebot',
  QQ_ONEBOT_WS_URL: '',
  QQ_APP_ID: '',
  QQ_SECRET: '',
  WHATSAPP_ENABLED: 'false',
  WHATSAPP_MODE: 'personal',
  WHATSAPP_SESSION_PATH: '',
  WHATSAPP_BUSINESS_PHONE_ID: '',
  WHATSAPP_BUSINESS_ACCESS_TOKEN: '',
  ENABLED_PLATFORMS: '',
  ALLOWED_USERS: '',
  GROUP_REQUIRE_MENTION: 'false',
})

watch(() => store.settings, () => syncFromStore(), { deep: true })

function syncFromStore() {
  const s = store.settings
  Object.assign(form, {
    FEISHU_ENABLED: s.FEISHU_ENABLED || 'false',
    FEISHU_APP_ID: s.FEISHU_APP_ID || '',
    FEISHU_APP_SECRET: s.FEISHU_APP_SECRET || '',
    FEISHU_ENCRYPT_KEY: s.FEISHU_ENCRYPT_KEY || '',
    FEISHU_VERIFICATION_TOKEN: s.FEISHU_VERIFICATION_TOKEN || '',
    DISCORD_ENABLED: s.DISCORD_ENABLED || 'false',
    DISCORD_TOKEN: s.DISCORD_TOKEN || '',
    DISCORD_CLIENT_ID: s.DISCORD_CLIENT_ID || '',
    DISCORD_ALLOWED_BOT_IDS: s.DISCORD_ALLOWED_BOT_IDS || '',
    WECOM_ENABLED: s.WECOM_ENABLED || 'false',
    WECOM_BOT_ID: s.WECOM_BOT_ID || '',
    WECOM_SECRET: s.WECOM_SECRET || '',
    WEIXIN_ENABLED: s.WEIXIN_ENABLED || 'false',
    TELEGRAM_ENABLED: s.TELEGRAM_ENABLED || 'false',
    TELEGRAM_BOT_TOKEN: s.TELEGRAM_BOT_TOKEN || '',
    QQ_ENABLED: s.QQ_ENABLED || 'false',
    QQ_PROTOCOL: s.QQ_PROTOCOL || 'onebot',
    QQ_ONEBOT_WS_URL: s.QQ_ONEBOT_WS_URL || '',
    QQ_APP_ID: s.QQ_APP_ID || '',
    QQ_SECRET: s.QQ_SECRET || '',
    WHATSAPP_ENABLED: s.WHATSAPP_ENABLED || 'false',
    WHATSAPP_MODE: s.WHATSAPP_MODE || 'personal',
    WHATSAPP_SESSION_PATH: s.WHATSAPP_SESSION_PATH || '',
    WHATSAPP_BUSINESS_PHONE_ID: s.WHATSAPP_BUSINESS_PHONE_ID || '',
    WHATSAPP_BUSINESS_ACCESS_TOKEN: s.WHATSAPP_BUSINESS_ACCESS_TOKEN || '',
    ENABLED_PLATFORMS: s.ENABLED_PLATFORMS || '',
    ALLOWED_USERS: s.ALLOWED_USERS || '',
    GROUP_REQUIRE_MENTION: s.GROUP_REQUIRE_MENTION || 'false',
  })
  feishuEnabled.value = form.FEISHU_ENABLED === 'true'
  discordEnabled.value = form.DISCORD_ENABLED === 'true'
  wecomEnabled.value = form.WECOM_ENABLED === 'true'
  weixinEnabled.value = form.WEIXIN_ENABLED === 'true'
  telegramEnabled.value = form.TELEGRAM_ENABLED === 'true'
  qqEnabled.value = form.QQ_ENABLED === 'true'
  whatsappEnabled.value = form.WHATSAPP_ENABLED === 'true'
  groupRequireMention.value = form.GROUP_REQUIRE_MENTION === 'true'
  enabledPlatforms.value = form.ENABLED_PLATFORMS
    ? form.ENABLED_PLATFORMS.split(',').map(s => s.trim()).filter(Boolean)
    : []
  allowedUsers.value = form.ALLOWED_USERS
    ? form.ALLOWED_USERS.split(',').map(s => s.trim()).filter(Boolean)
    : []
}

function onPlatformsChange(val: string[]) {
  form.ENABLED_PLATFORMS = val.join(',')
}

function onAllowedUsersChange(val: string[]) {
  form.ALLOWED_USERS = val.join(',')
}

async function handleSave() {
  // 检查是否至少配置了一个平台
  const hasFeishu = feishuEnabled.value && form.FEISHU_APP_ID && form.FEISHU_APP_SECRET
  const hasDiscord = discordEnabled.value && form.DISCORD_TOKEN
  const hasWecom = wecomEnabled.value && form.WECOM_BOT_ID && form.WECOM_SECRET
  const hasWeixin = weixinEnabled.value && weixinAccounts.value.some(a => a.enabled)
  const hasTelegram = telegramEnabled.value && form.TELEGRAM_BOT_TOKEN
  const hasQQ = qqEnabled.value && (
    (form.QQ_PROTOCOL === 'official' && form.QQ_APP_ID && form.QQ_SECRET) ||
    (form.QQ_PROTOCOL === 'onebot' && form.QQ_ONEBOT_WS_URL)
  )
  const hasWhatsApp = whatsappEnabled.value && (
    (form.WHATSAPP_MODE === 'business' && form.WHATSAPP_BUSINESS_PHONE_ID && form.WHATSAPP_BUSINESS_ACCESS_TOKEN) ||
    (form.WHATSAPP_MODE === 'personal' && form.WHATSAPP_SESSION_PATH)
  )

  if (!hasFeishu && !hasDiscord && !hasWecom && !hasWeixin && !hasTelegram && !hasQQ && !hasWhatsApp) {
    ElMessage.warning('建议至少启用并配置一个平台')
  }

  saving.value = true
  try {
    const result = await store.saveConfig({ ...form })
    if (result.needRestart) {
      ElMessageBox.confirm(
        `以下配置需要重启才能生效：${result.changedKeys.join('、')}`,
        '配置已保存',
        { confirmButtonText: '立即重启', cancelButtonText: '稍后手动重启', type: 'warning' }
      ).then(() => store.restart()).catch(() => {})
    } else {
      ElMessage.success('配置已保存')
    }
  } finally {
    saving.value = false
  }
}

function handleImportConfig(config: typeof form) {
  Object.assign(form, config)
  // 同步开关状态
  feishuEnabled.value = form.FEISHU_ENABLED === 'true'
  discordEnabled.value = form.DISCORD_ENABLED === 'true'
  wecomEnabled.value = form.WECOM_ENABLED === 'true'
  weixinEnabled.value = form.WEIXIN_ENABLED === 'true'
  telegramEnabled.value = form.TELEGRAM_ENABLED === 'true'
  qqEnabled.value = form.QQ_ENABLED === 'true'
  whatsappEnabled.value = form.WHATSAPP_ENABLED === 'true'
  groupRequireMention.value = form.GROUP_REQUIRE_MENTION === 'true'
  enabledPlatforms.value = form.ENABLED_PLATFORMS
    ? form.ENABLED_PLATFORMS.split(',').map(s => s.trim()).filter(Boolean)
    : []
  allowedUsers.value = form.ALLOWED_USERS
    ? form.ALLOWED_USERS.split(',').map(s => s.trim()).filter(Boolean)
    : []
}

// 微信账号管理
async function loadWeixinAccounts() {
  try {
    weixinAccounts.value = await weixinApi.getAccounts()
  } catch (e) {
    console.error('加载微信账号失败', e)
  }
}

async function toggleWeixinAccount(id: string, enabled: boolean) {
  try {
    await weixinApi.toggleAccount(id, enabled)
    await loadWeixinAccounts()
    ElMessage.success(enabled ? '账号已启用' : '账号已禁用')
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

async function deleteWeixinAccount(id: string) {
  try {
    await weixinApi.deleteAccount(id)
    await loadWeixinAccounts()
    ElMessage.success('账号已删除')
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

let weixinPollTimer: ReturnType<typeof setInterval> | null = null
let weixinPolling = false // 防止并发轮询

async function startWeixinLogin() {
  weixinLoginLoading.value = true
  weixinPolling = false
  try {
    const result = await weixinApi.startLogin()
    weixinQrSessionId.value = result.sessionId
    weixinQrImage.value = result.qrImage
    weixinQrStatus.value = 'waiting'
    weixinQrDialogVisible.value = true

    // 串行轮询登录状态（避免请求堆积）
    const doPoll = async () => {
      if (weixinPolling) return
      weixinPolling = true
      try {
        const status = await weixinApi.waitLogin(weixinQrSessionId.value)
        weixinQrStatus.value = status.status
        if (status.status === 'confirmed' && status.account) {
          stopWeixinPoll()
          weixinQrDialogVisible.value = false
          await loadWeixinAccounts()
          ElMessage.success('登录成功')
        } else if (status.status === 'expired' || status.status === 'error' || status.status === 'cancelled') {
          stopWeixinPoll()
          if (status.error) {
            ElMessage.error(status.error)
          }
        }
      } catch (e) {
        console.error('轮询登录状态失败', e)
      } finally {
        weixinPolling = false
      }
    }

    // 启动轮询（3秒间隔，串行执行）
    weixinPollTimer = setInterval(doPoll, 3000)
    // 立即执行一次
    doPoll()
  } catch (e) {
    ElMessage.error('获取二维码失败')
  } finally {
    weixinLoginLoading.value = false
  }
}

function stopWeixinPoll() {
  if (weixinPollTimer) {
    clearInterval(weixinPollTimer)
    weixinPollTimer = null
  }
  weixinPolling = false
}

async function cancelWeixinLogin() {
  stopWeixinPoll()
  if (weixinQrSessionId.value) {
    try {
      await weixinApi.cancelLogin(weixinQrSessionId.value)
    } catch (e) {
      // ignore
    }
  }
  weixinQrDialogVisible.value = false
  weixinQrStatus.value = 'waiting'
}

// 初始化加载微信账号
onMounted(() => {
  syncFromStore()
  loadWeixinAccounts()
})
</script>

<style scoped>
.page { max-width: 1100px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 22px; font-weight: 600; color: #1a1a2e; }
.desc { color: #666; margin-top: 6px; }

.page-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.form-area {
  flex: 1;
  min-width: 0;
}

.sidebar {
  width: 160px;
  flex-shrink: 0;
  position: sticky;
  top: 20px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  padding: 16px;
}

.config-card { margin-bottom: 20px; }
.card-title { font-weight: 600; font-size: 15px; }
.card-header-row { display: flex; align-items: center; justify-content: space-between; }
.inline-switch { display: flex; align-items: center; gap: 10px; }
.field-tip { font-size: 12px; color: #999; margin-top: 4px; line-height: 1.4; }

.weixin-accounts { margin-bottom: 16px; }
.account-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 8px;
}
.account-info { display: flex; align-items: center; gap: 12px; }
.account-meta { display: flex; flex-direction: column; }
.nickname { font-weight: 500; font-size: 14px; }
.wxid { font-size: 12px; color: #909399; }
.account-actions { display: flex; align-items: center; gap: 8px; }
.qr-login-section { margin-top: 16px; }
.qr-dialog-content { text-align: center; }
.qr-image img { max-width: 200px; border-radius: 8px; }
.qr-status { margin: 16px 0; }

@media (max-width: 900px) {
  .page-layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    position: static;
    order: -1;
  }
}
</style>
