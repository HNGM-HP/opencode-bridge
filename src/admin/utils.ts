/**
 * Admin 模块共享工具函数
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}

// ── TCP 端口探测函数
export async function probeTcpPort(host: string, port: number, timeoutMs = 2000): Promise<{ isOpen: boolean; reason?: string }> {
  const net = await import('node:net');
  return new Promise(resolve => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ isOpen: false, reason: 'timeout' });
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ isOpen: true });
    });

    socket.once('error', (err: Error & { code?: string }) => {
      clearTimeout(timer);
      resolve({ isOpen: false, reason: err.code || err.message });
    });

    socket.connect(port, host);
  });
}

// 开发模式检测（process.resourcesPath 是 Electron 特有属性）
const isDev = process.env.NODE_ENV === 'development' || !(process as any).resourcesPath;

/**
 * 获取 process-manager.mjs 的绝对路径
 * 兼容：开发环境 / 源码部署 / Electron 打包后
 */
export function resolveProcessManagerPath(): string {
  if ((process as any).resourcesPath && !isDev) {
    // Electron 打包：scripts 在 resources/app/scripts/
    return path.join((process as any).resourcesPath, 'app', 'scripts', 'process-manager.mjs');
  }
  // 开发 / 源码部署：从 dist/admin/ 向上两级到项目根
  return path.resolve(__dirname, '../../scripts/process-manager.mjs');
}

export function buildOpencodeAuthHeaders(): Record<string, string> {
  // We need opencodeConfig, but importing it here would create circular deps
  // Instead, use process.env directly since it's synced from config
  const password = process.env.OPENCODE_SERVER_PASSWORD || '';
  if (!password) {
    return {};
  }

  const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  const authorization = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${authorization}` };
}
