import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * 解析 opencode 可执行文件路径（跨平台）
 *
 * 优先级：
 * 1. OPENCODE_AUTO_START_CMD 环境变量（用户自定义绝对路径）
 * 2. 常见安装路径检查
 * 3. 回退到 'opencode'（依赖 PATH）
 *
 * 与 scripts/process-manager.mjs 的 resolveOpenCodeExecutable 保持一致逻辑。
 */
export function resolveOpencodeExecutable(): { exe: string; args: string[] } {
  // 1. 优先读 OPENCODE_AUTO_START_CMD（用户自定义绝对路径，可能含参数）
  const customCmd = process.env.OPENCODE_AUTO_START_CMD?.trim();
  if (customCmd) {
    const parts = customCmd.split(/\s+/);
    const exePath = parts[0];
    const extraArgs = parts.slice(1);
    if (fs.existsSync(exePath)) {
      return { exe: exePath, args: extraArgs };
    }
    // 路径不存在也返回，让 shell 尝试解析
    return { exe: customCmd, args: [] };
  }

  // 2. 检查常见安装路径
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, '.opencode', 'bin', 'opencode'),       // 官方脚本安装
    path.join(homeDir, '.local', 'bin', 'opencode'),           // npm i -g (用户级 prefix)
    '/usr/local/bin/opencode',                                  // npm i -g (root)
    '/usr/bin/opencode',                                        // 包管理器安装
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { exe: candidate, args: [] };
    }
  }

  // 3. 回退：让 shell 自行解析
  return { exe: 'opencode', args: [] };
}
