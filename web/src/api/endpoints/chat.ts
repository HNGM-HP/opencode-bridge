/**
 * 聊天（AI 工作区）API
 */

import { http } from '../types'
import type {
  ChatSessionSummary,
  ChatMessagePage,
  ChatWorkspaceOption,
  ChatAgentInfo,
  ChatModelProviderInfo,
  ChatVisionModelInfo,
  ChatCommandInfo,
} from '../types'

export const chatApi = {
  async listSessions(): Promise<ChatSessionSummary[]> {
    const res = await http.get<{ sessions: ChatSessionSummary[] }>('/chat/sessions')
    return res.data.sessions
  },

  async createSession(payload?: { title?: string; directory?: string }): Promise<ChatSessionSummary> {
    const res = await http.post<{ session: ChatSessionSummary | null; fallback?: boolean; error?: string }>('/chat/sessions', payload)
    if (!res.data.session) {
      throw new Error(res.data.error || '创建会话失败：OpenCode 未连接')
    }
    return res.data.session
  },

  async renameSession(sessionId: string, title: string): Promise<void> {
    await http.patch(`/chat/sessions/${encodeURIComponent(sessionId)}`, { title })
  },

  async deleteSession(sessionId: string): Promise<void> {
    await http.delete(`/chat/sessions/${encodeURIComponent(sessionId)}`)
  },

  async getMessages(sessionId: string, payload?: {
    limit?: number
    cursor?: string | null
  }): Promise<ChatMessagePage> {
    const res = await http.get<ChatMessagePage>(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
      params: {
        limit: payload?.limit,
        cursor: payload?.cursor ?? undefined,
      },
    })
    return {
      messages: Array.isArray(res.data.messages) ? res.data.messages : [],
      tasks: Array.isArray(res.data.tasks) ? res.data.tasks : [],
      total: typeof res.data.total === 'number' ? res.data.total : 0,
      hasMore: Boolean(res.data.hasMore),
      nextCursor: typeof res.data.nextCursor === 'string' ? res.data.nextCursor : null,
    }
  },

  async listWorkspaces(): Promise<ChatWorkspaceOption[]> {
    const res = await http.get<{ workspaces: ChatWorkspaceOption[] }>('/chat/workspaces')
    return Array.isArray(res.data.workspaces) ? res.data.workspaces : []
  },

  async listAgents(): Promise<ChatAgentInfo[]> {
    const res = await http.get<{ agents: ChatAgentInfo[] }>('/chat/agents')
    return Array.isArray(res.data.agents) ? res.data.agents : []
  },

  async listModels(): Promise<ChatModelProviderInfo[]> {
    const res = await http.get<{ providers: ChatModelProviderInfo[] }>('/chat/models')
    return Array.isArray(res.data.providers) ? res.data.providers : []
  },

  async listVisionModels(): Promise<ChatVisionModelInfo[]> {
    const res = await http.get<{ models: ChatVisionModelInfo[] }>('/chat/vision-models')
    return Array.isArray(res.data.models) ? res.data.models : []
  },

  async listCommands(): Promise<ChatCommandInfo[]> {
    const res = await http.get<{ commands: ChatCommandInfo[] }>('/chat/commands')
    return Array.isArray(res.data.commands) ? res.data.commands : []
  },

  async sendPrompt(payload: {
    sessionId: string
    text: string
    parts?: Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; url: string; filename?: string }>
    providerId?: string
    modelId?: string
    agent?: string
    variant?: string
    directory?: string
  }): Promise<void> {
    await http.post('/chat/prompt', {
      sessionId: payload.sessionId,
      parts: payload.parts || [{ type: 'text', text: payload.text }],
      providerId: payload.providerId,
      modelId: payload.modelId,
      agent: payload.agent,
      variant: payload.variant,
      directory: payload.directory,
    })
  },

  async uploadFile(file: File): Promise<{
    ok: boolean
    file: {
      url: string
      filename: string
      mime: string
      size: number
    }
  }> {
    const formData = new FormData()
    formData.append('file', file)

    const res = await http.post<{
      ok: boolean
      file: {
        url: string
        filename: string
        mime: string
        size: number
      }
    }>('/chat/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return res.data
  },

  async respondPermission(payload: {
    permissionId: string
    sessionId: string
    decision: 'allow' | 'reject' | 'always'
  }): Promise<void> {
    await http.post(`/chat/permissions/${encodeURIComponent(payload.permissionId)}`, {
      sessionId: payload.sessionId,
      decision: payload.decision,
    })
  },

  async abortSession(sessionId: string): Promise<void> {
    await http.post(`/chat/sessions/${encodeURIComponent(sessionId)}/abort`)
  },

  async undoSession(sessionId: string): Promise<{ messageId?: string }> {
    const res = await http.post<{ ok: boolean; messageId?: string }>(`/chat/sessions/${encodeURIComponent(sessionId)}/undo`)
    return { messageId: res.data.messageId }
  },

  async revertSession(sessionId: string, messageId: string): Promise<void> {
    await http.post(`/chat/sessions/${encodeURIComponent(sessionId)}/revert`, { messageId })
  },
}
