/**
 * 工作区 API（Git、终端、文件浏览器）
 */

import { http } from '../types'
import type {
  WorkspaceGitStatus,
  WorkspaceGitLogEntry,
  WorkspaceGitCommitDetail,
  WorkspaceTerminalSession,
  WorkspaceTerminalCommandResult,
  WorkspaceFileTree,
  WorkspaceFileContent,
} from '../types'

export const workspaceApi = {
  async getGitStatus(directory: string): Promise<WorkspaceGitStatus> {
    const res = await http.get<WorkspaceGitStatus>('/workspace/git/status', {
      params: { directory },
    })
    return res.data
  },

  async getGitDiff(payload: {
    directory: string
    filePath?: string
    staged?: boolean
  }): Promise<{ directory: string; filePath?: string; staged: boolean; diff: string }> {
    const res = await http.get<{ directory: string; filePath?: string; staged: boolean; diff: string }>('/workspace/git/diff', {
      params: {
        directory: payload.directory,
        filePath: payload.filePath,
        staged: payload.staged,
      },
    })
    return res.data
  },

  async commitAll(directory: string, message: string): Promise<void> {
    await http.post('/workspace/git/commit', { directory, message })
  },

  async pull(directory: string): Promise<void> {
    await http.post('/workspace/git/pull', { directory })
  },

  async push(directory: string): Promise<void> {
    await http.post('/workspace/git/push', { directory })
  },

  async checkout(directory: string, branch: string): Promise<void> {
    await http.post('/workspace/git/checkout', { directory, branch })
  },

  async checkoutCommit(directory: string, sha: string): Promise<void> {
    await http.post('/workspace/git/checkout', { directory, ref: sha, detach: true })
  },

  async createBranch(directory: string, branch: string, switchAfterCreate = true): Promise<{ branch: string; switched: boolean }> {
    const res = await http.post<{ ok: boolean; branch: string; switched: boolean }>('/workspace/git/branch/create', {
      directory,
      branch,
      switchAfterCreate,
    })
    return {
      branch: res.data.branch,
      switched: res.data.switched,
    }
  },

  async deleteBranch(directory: string, branch: string): Promise<void> {
    await http.post('/workspace/git/branch/delete', { directory, branch })
  },

  async getGitHistory(directory: string, limit = 30): Promise<WorkspaceGitLogEntry[]> {
    const res = await http.get<{ entries: WorkspaceGitLogEntry[] }>('/workspace/git/log', {
      params: { directory, limit },
    })
    return res.data.entries
  },

  async getGitCommitDetail(directory: string, sha: string): Promise<WorkspaceGitCommitDetail> {
    const res = await http.get<WorkspaceGitCommitDetail>('/workspace/git/log/detail', {
      params: { directory, sha },
    })
    return res.data
  },

  async initRepo(directory: string): Promise<void> {
    await http.post('/workspace/git/init', { directory })
  },

  async openTerminal(directory: string): Promise<WorkspaceTerminalSession> {
    const res = await http.post<{ ok: boolean; sessionId: string; shell: string; cwd: string }>('/workspace/terminal/open', {
      directory,
    })
    return {
      sessionId: res.data.sessionId,
      shell: res.data.shell,
      cwd: res.data.cwd,
    }
  },

  async executeCommand(payload: {
    sessionId: string
    command: string
  }): Promise<WorkspaceTerminalCommandResult> {
    const res = await http.post<WorkspaceTerminalCommandResult>('/workspace/terminal/execute', {
      sessionId: payload.sessionId,
      command: payload.command,
    })
    return res.data
  },

  async closeTerminal(sessionId: string): Promise<void> {
    await http.post('/workspace/terminal/close', { sessionId })
  },

  async listFiles(payload: {
    directory: string
    path?: string
    limit?: number
  }): Promise<WorkspaceFileTree> {
    const res = await http.get<WorkspaceFileTree>('/workspace/files/tree', {
      params: {
        directory: payload.directory,
        path: payload.path,
        limit: payload.limit,
      },
    })
    return res.data
  },

  async readFile(directory: string, filePath: string): Promise<WorkspaceFileContent> {
    const res = await http.get<WorkspaceFileContent>('/workspace/files/content', {
      params: {
        directory,
        path: filePath,
      },
    })
    return res.data
  },
}
