/**
 * P2P 处理器类型定义与常量
 *
 * 从 p2p.ts 提取。
 */

export const CREATE_CHAT_OPTION_LIMIT = 100;
export const CREATE_CHAT_EXISTING_LIMIT = CREATE_CHAT_OPTION_LIMIT - 1;

export interface EnsurePrivateSessionResult {
  firstBinding: boolean;
}

export type OpencodeSession = Awaited<ReturnType<typeof import('../opencode/client.js').opencodeClient.listSessions>>[number];
