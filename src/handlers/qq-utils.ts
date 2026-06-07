/**
 * QQ 处理器工具函数
 *
 * 从 qq.ts 提取的模块级纯函数。
 */

import path from 'node:path';
import type { PermissionDecision } from './qq-types.js';

// ── 文件类型检测 ──────────────────────────────

export function extractExtension(name: string): string {
  return path.extname(name).toLowerCase();
}

export function normalizeExtension(ext: string): string {
  if (!ext) return '';
  const withDot = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (withDot === '.jpeg' || withDot === '.pjpeg' || withDot === '.pjp' || withDot === '.jpe' || withDot === '.jfif') {
    return '.jpg';
  }
  return withDot;
}

export function extensionFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
  };
  return map[ct] || '';
}

export function mimeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 200);
}

// ── 权限决策解析 ──────────────────────────────

export function parsePermissionDecision(raw: string): PermissionDecision | null {
  const normalized = raw.normalize('NFKC').trim().toLowerCase();
  if (!normalized) return null;

  const compact = normalized
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。！!,.，；;:：\-]/g, '');

  const hasAlways =
    compact.includes('始终') ||
    compact.includes('永久') ||
    compact.includes('always') ||
    compact.includes('记住') ||
    compact.includes('总是');

  const containsAny = (words: string[]): boolean => {
    return words.some(word => compact === word || compact.includes(word));
  };

  // 数字快捷回复：1=允许，2=拒绝，3=始终允许
  if (compact === '1') return { allow: true, remember: false };
  if (compact === '2') return { allow: false, remember: false };
  if (compact === '3') return { allow: true, remember: true };

  const isDeny =
    compact === 'n' ||
    compact === 'no' ||
    compact === '否' ||
    compact === '拒绝' ||
    containsAny(['拒绝', '不同意', '不允许', 'deny']);
  if (isDeny) {
    return { allow: false, remember: false };
  }

  const isAllow =
    compact === 'y' ||
    compact === 'yes' ||
    compact === 'ok' ||
    compact === 'always' ||
    compact === '允许' ||
    compact === '始终允许' ||
    containsAny(['允许', '同意', '通过', '批准', 'allow']);
  if (isAllow) {
    return { allow: true, remember: hasAlways };
  }

  return null;
}

// ── QQ 帮助文本 ──────────────────────────────

export function buildQQCmdInput(text: string, show?: string): string {
  const encodedText = encodeURIComponent(text);
  const encodedShow = encodeURIComponent(show || text);
  return `<qqbot-cmd-input text="${encodedText}" show="${encodedShow}" reference="false" />`;
}

export function getQQHelpText(): string {
  return `QQ × OpenCode 机器人指南

如何对话
直接发送消息即可与 AI 对话。

常用命令
/model - 查看当前模型
/model <名称> - 切换模型
/models - 列出所有可用模型
/agent - 查看当前角色
/agent <名称> - 切换角色
/agents - 列出所有可用角色
/agent off - 切回默认角色
/status - 查看当前状态
/session - 列出当前项目的会话
/session new - 开启新话题
/sessions all - 列出所有会话
/config session order - 查看当前会话排序模式
/config session order default - 使用默认排序
/config session order last_time - 按最后修改时间倒序
/config output onlyText - 查看 QQ 纯文本输出模式
/config output onlyText true - 启用 QQ 纯文本输出
/config output onlyText false - 恢复 QQ Markdown 输出
/clear - 清空对话上下文
/stop - 停止当前生成
/help - 显示此帮助

权限确认
当 AI 需要执行敏感操作时，会发送权限确认消息。
回复 1 或 允许 - 同意执行
回复 2 或 拒绝 - 不同意执行
回复 3 或 始终允许 - 同意并记住此工具

问答互动
当 AI 需要您的反馈时，会发送问答消息。
回复选项编号（如 1、2）选择对应选项
回复多个编号（如 1 3）可多选
直接输入文字可提交自定义答案
回复"跳过"可跳过当前问题

提示
切换的模型/角色仅对当前会话生效。
当前版本电脑 QQ 的 Markdown 渲染可能不稳定；如出现内容被吞或显示异常，可使用 /config output onlyText true 切换为纯文本输出。`;
}

export function getQQHelpMarkdown(): string {
  const commandLines = [
    `${buildQQCmdInput('/model')} - 查看当前模型`,
    `${buildQQCmdInput('/model ', '/model <名称>')} - 切换模型`,
    `${buildQQCmdInput('/models')} - 列出所有可用模型`,
    `${buildQQCmdInput('/agent')} - 查看当前角色`,
    `${buildQQCmdInput('/agent ', '/agent <名称>')} - 切换角色`,
    `${buildQQCmdInput('/agents')} - 列出所有可用角色`,
    `${buildQQCmdInput('/agent off')} - 切回默认角色`,
    `${buildQQCmdInput('/status')} - 查看当前状态`,
    `${buildQQCmdInput('/session')} - 列出当前项目的会话`,
    `${buildQQCmdInput('/session new')} - 开启新话题`,
    `${buildQQCmdInput('/sessions all')} - 列出所有会话`,
    `${buildQQCmdInput('/config session order')} - 查看当前会话排序模式`,
    `${buildQQCmdInput('/config session order default')} - 使用默认排序`,
    `${buildQQCmdInput('/config session order last_time')} - 按最后修改时间倒序`,
    `${buildQQCmdInput('/config output onlyText')} - 查看 QQ 纯文本输出模式`,
    `${buildQQCmdInput('/config output onlyText true')} - 启用 QQ 纯文本输出`,
    `${buildQQCmdInput('/config output onlyText false')} - 恢复 QQ Markdown 输出`,
    `${buildQQCmdInput('/clear')} - 清空对话上下文`,
    `${buildQQCmdInput('/stop')} - 停止当前生成`,
    `${buildQQCmdInput('/help')} - 显示此帮助`,
  ];

  const note =
    '当前版本电脑 QQ 的 Markdown 渲染可能不稳定；如出现内容被吞或显示异常，可使用 '
    + `${buildQQCmdInput('/config output onlyText true')} 切换为纯文本输出。`;

  return `${commandLines.join('\n')}\n\n${note}`;
}
