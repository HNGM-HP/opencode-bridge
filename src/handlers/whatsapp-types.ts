/**
 * WhatsApp 处理器类型定义
 *
 * 从 whatsapp.ts 提取。
 */

export type OpencodeFilePartInput = { type: 'file'; mime: string; url: string; filename?: string };
export type OpencodePartInput = { type: 'text'; text: string } | OpencodeFilePartInput;

/**
 * 权限决策结果
 */
export type PermissionDecision = {
  allow: boolean;
  remember: boolean;
};
