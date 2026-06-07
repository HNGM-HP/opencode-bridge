/**
 * 企业微信适配器工具函数
 *
 * 从 wecom-adapter.ts 提取的模块级纯函数。
 */

// ── 动态导入缓存 ──────────────────────────────

type WecomModule = typeof import('@wecom/aibot-node-sdk');
let _wecomModule: WecomModule | null = null;
export async function getWecomModule(): Promise<WecomModule> {
  if (!_wecomModule) {
    _wecomModule = await import('@wecom/aibot-node-sdk');
  }
  return _wecomModule;
}

// ── 工具函数 ──────────────────────────────────

export function splitText(text: string): string[] {
  const WECOM_MESSAGE_LIMIT = 1800;
  if (!text.trim()) {
    return [];
  }
  if (text.length <= WECOM_MESSAGE_LIMIT) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > WECOM_MESSAGE_LIMIT) {
    const candidate = remaining.slice(0, WECOM_MESSAGE_LIMIT);
    const breakAt = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf(' '));
    const cut = breakAt > Math.floor(WECOM_MESSAGE_LIMIT * 0.5) ? breakAt : WECOM_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

export function guessFileTypeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
