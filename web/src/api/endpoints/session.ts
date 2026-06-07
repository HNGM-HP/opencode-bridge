/**
 * Session 绑定管理 API
 */

import { http } from '../types'
import type {
  SessionBindingsResponse,
  SessionStats,
  CreateBindingRequest,
  UpdateBindingRequest,
  SessionBindingItem,
  OpenCodeSession,
  PlatformInfo,
  PlatformChat,
} from '../types'

export const sessionApi = {
  async getBindings(params?: {
    platform?: string
    chatType?: 'p2p' | 'group'
    creatorId?: string
    page?: number
    limit?: number
    search?: string
  }): Promise<SessionBindingsResponse> {
    const res = await http.get<SessionBindingsResponse>('/sessions/bindings', { params })
    return res.data
  },

  async getStats(): Promise<SessionStats> {
    const res = await http.get<SessionStats>('/sessions/bindings/stats')
    return res.data
  },

  async createBinding(data: CreateBindingRequest): Promise<{ ok: boolean; binding: SessionBindingItem }> {
    const res = await http.post<{ ok: boolean; binding: SessionBindingItem }>('/sessions/bindings', data)
    return res.data
  },

  async updateBinding(
    platform: string,
    conversationId: string,
    data: UpdateBindingRequest
  ): Promise<{ ok: boolean; message: string }> {
    const res = await http.put<{ ok: boolean; message: string }>(
      `/sessions/bindings/${platform}/${encodeURIComponent(conversationId)}`,
      data
    )
    return res.data
  },

  async deleteBinding(
    platform: string,
    conversationId: string,
    deleteOpenCode = false
  ): Promise<{ ok: boolean; message: string; openCodeDeleted: boolean }> {
    const res = await http.delete<{ ok: boolean; message: string; openCodeDeleted: boolean }>(
      `/sessions/bindings/${platform}/${encodeURIComponent(conversationId)}`,
      { params: { deleteOpenCode } }
    )
    return res.data
  },

  async batchOperation(
    action: 'unbind' | 'delete',
    bindings: Array<{ platform: string; conversationId: string }>
  ): Promise<{
    ok: boolean
    action: string
    total: number
    successCount: number
    failCount: number
    results: Array<{ platform: string; conversationId: string; success: boolean; error?: string }>
  }> {
    const res = await http.post('/sessions/bindings/batch', { action, bindings })
    return res.data
  },

  async getOpenCodeSessions(): Promise<{ sessions: OpenCodeSession[]; openCodeAvailable: boolean }> {
    const res = await http.get<{ sessions: OpenCodeSession[]; openCodeAvailable: boolean }>('/sessions/opencode/list')
    return res.data
  },

  async deleteOpenCodeSession(sessionId: string): Promise<{ ok: boolean; message: string }> {
    const res = await http.delete<{ ok: boolean; message: string }>(`/sessions/opencode/${encodeURIComponent(sessionId)}`)
    return res.data
  },

  async getPlatforms(): Promise<PlatformInfo[]> {
    const res = await http.get<{ platforms: PlatformInfo[] }>('/sessions/platforms')
    return res.data.platforms
  },

  async getPlatformChats(platform: string): Promise<{ chats: PlatformChat[]; platform: string }> {
    const res = await http.get<{ chats: PlatformChat[]; platform: string }>(`/sessions/platform-chats/${platform}`)
    return res.data
  },
}
