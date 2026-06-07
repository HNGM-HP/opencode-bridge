/**
 * 平台适配器 API（微信、钉钉、WhatsApp）
 */

import { http } from '../types'
import type {
  WeixinAccount,
  WeixinLoginSession,
  DingtalkAccount,
  WhatsAppStatus,
} from '../types'

export const weixinApi = {
  async getAccounts(): Promise<WeixinAccount[]> {
    const res = await http.get<{ accounts: WeixinAccount[] }>('/weixin/accounts')
    return res.data.accounts
  },

  async deleteAccount(id: string): Promise<{ ok: boolean }> {
    const res = await http.delete<{ ok: boolean }>(`/weixin/accounts/${id}`)
    return res.data
  },

  async toggleAccount(id: string, enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> {
    const res = await http.post<{ ok: boolean; enabled: boolean }>(`/weixin/accounts/${id}/toggle`, { enabled })
    return res.data
  },

  async startLogin(): Promise<{ ok: boolean; sessionId: string; qrImage: string }> {
    const res = await http.post<{ ok: boolean; sessionId: string; qrImage: string }>('/weixin/login/start')
    return res.data
  },

  async waitLogin(sessionId: string): Promise<WeixinLoginSession> {
    const res = await http.get<WeixinLoginSession>('/weixin/login/wait', { params: { sessionId } })
    return res.data
  },

  async cancelLogin(sessionId: string): Promise<{ ok: boolean }> {
    const res = await http.post<{ ok: boolean }>('/weixin/login/cancel', { sessionId })
    return res.data
  },
}

export const dingtalkApi = {
  async getAccounts(): Promise<DingtalkAccount[]> {
    const res = await http.get<{ accounts: DingtalkAccount[] }>('/dingtalk/accounts')
    return res.data.accounts
  },

  async createAccount(data: {
    accountId: string
    clientId: string
    clientSecret: string
    name?: string
    endpoint?: string
  }): Promise<{ ok: boolean; message: string }> {
    const res = await http.post<{ ok: boolean; message: string }>('/dingtalk/accounts', data)
    return res.data
  },

  async updateAccount(id: string, data: {
    clientId?: string
    clientSecret?: string
    name?: string
    endpoint?: string
  }): Promise<{ ok: boolean; message: string }> {
    const res = await http.put<{ ok: boolean; message: string }>(`/dingtalk/accounts/${id}`, data)
    return res.data
  },

  async deleteAccount(id: string): Promise<{ ok: boolean }> {
    const res = await http.delete<{ ok: boolean }>(`/dingtalk/accounts/${id}`)
    return res.data
  },

  async toggleAccount(id: string, enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> {
    const res = await http.post<{ ok: boolean; enabled: boolean }>(`/dingtalk/accounts/${id}/toggle`, { enabled })
    return res.data
  },
}

export const whatsappApi = {
  async getStatus(): Promise<WhatsAppStatus> {
    const res = await http.get<WhatsAppStatus>('/whatsapp/status')
    return res.data
  },
}
