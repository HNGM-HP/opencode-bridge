#!/usr/bin/env node

/**
 * 跨平台进程管理工具
 *
 * 用法:
 *   node process-manager.mjs kill-bridge      # 终止所有 Bridge 进程
 *   node process-manager.mjs kill-opencode    # 终止所有 OpenCode 进程
 *   node process-manager.mjs list-bridge      # 列出所有 Bridge 进程
 *   node process-manager.mjs list-opencode    # 列出所有 OpenCode 进程
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

// ==================== 平台检测 ====================

function isWindows() {
  return process.platform === 'win32';
}

function isUnix() {
  return process.platform === 'linux' || process.platform === 'darwin';
}

// ==================== 进程扫描 ====================

/**
 * 扫描 Bridge 进程
 * @param {boolean} excludeSelf - 是否排除当前进程
 * @param {number} excludePid - 要排除的指定 PID
 * @returns {number[]} 进程 PID 列表
 */
function findBridgeProcesses(excludeSelf = false, excludePid = null) {
  const pids = [];
  const currentPid = process.pid;

  if (isWindows()) {
    // Windows: 使用 tasklist
    const result = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], {
      encoding: 'utf-8',
      windowsHide: true,
    });

    if (!result.error && result.status === 0) {
      const lines = result.stdout.split('\r\n').filter(line => line.trim());
      for (const line of lines) {
        // CSV 格式："Image Name","PID","Session Name","Session#","Mem Usage"
        const match = line.match(/"node\.exe","(\d+)"/);
        if (match) {
          const pid = parseInt(match[1], 10);
          if (excludeSelf && pid === currentPid) {
            continue; // 排除当前进程
          }
          if (excludePid && pid === excludePid) {
            continue; // 排除指定 PID
          }
          // 进一步检查命令行参数
          if (isBridgeProcessByCommand(pid)) {
            pids.push(pid);
          }
        }
      }
    }
  } else if (isUnix()) {
    // Unix: 使用 ps aux
    const result = spawnSync('ps', ['aux'], {
      encoding: 'utf-8',
    });

    if (!result.error && result.status === 0) {
      const lines = result.stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 11) continue;

        const pid = parseInt(parts[1], 10);
        if (isNaN(pid) || pid === currentPid || pid === 1) continue;
        if (excludePid && pid === excludePid) continue;

        const command = parts.slice(10).join(' ');

        // 匹配 Bridge 进程
        if (isBridgeCommand(command)) {
          pids.push(pid);
        }
      }
    }
  }

  return pids;
}

/**
 * 扫描 OpenCode 进程
 * @param {boolean} excludeSelf - 是否排除当前进程
 * @param {number} excludePid - 要排除的指定 PID
 * @returns {number[]} 进程 PID 列表
 */
function findOpenCodeProcesses(excludeSelf = false, excludePid = null) {
  const pids = [];
  const currentPid = process.pid;

  if (isWindows()) {
    const result = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], {
      encoding: 'utf-8',
      windowsHide: true,
    });

    if (!result.error && result.status === 0) {
      const lines = result.stdout.split('\r\n').filter(line => line.trim());
      for (const line of lines) {
        // 匹配 node.exe 或 opencode.exe 进程
        const match = line.match(/"(node\.exe|opencode\.exe)","(\d+)"/);
        if (match) {
          const pid = parseInt(match[2], 10);
          if (excludeSelf && pid === currentPid) {
            continue;
          }
          if (excludePid && pid === excludePid) {
            continue;
          }
          // opencode.exe 直接就是目标进程
          if (match[1] === 'opencode.exe') {
            pids.push(pid);
          } else if (isOpenCodeProcessByCommand(pid)) {
            pids.push(pid);
          }
        }
      }
    }
  } else if (isUnix()) {
    const result = spawnSync('ps', ['aux'], {
      encoding: 'utf-8',
    });

    if (!result.error && result.status === 0) {
      const lines = result.stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 11) continue;

        const pid = parseInt(parts[1], 10);
        if (isNaN(pid) || pid === currentPid || pid === 1) continue;
        if (excludePid && pid === excludePid) continue;

        const command = parts.slice(10).join(' ');

        // 匹配 OpenCode 进程
        if (isOpenCodeCommand(command)) {
          pids.push(pid);
        }
      }
    }
  }

  return pids;
}

// ==================== 进程判断逻辑 ====================

function isBridgeCommand(command) {
  // 统一路径分隔符（Windows 使用反斜杠）
  const normalizedCmd = command.replace(/\\/g, '/');
  // 匹配生产模式: dist/index.js 或 dist/admin/index.js
  // 匹配开发模式: tsx watch src/index.ts 或 tsx src/index.ts
  // 注意：不能只匹配项目名，因为其他脚本也在同一目录下运行
  return normalizedCmd.includes('dist/index.js') ||
         normalizedCmd.includes('dist/admin/index.js') ||
         /tsx\s+(?:watch\s+)?src\/index\.ts/.test(normalizedCmd);
}

function isOpenCodeCommand(command) {
  // 统一路径分隔符
  const normalizedCmd = command.replace(/\\/g, '/');
  // 排除 bridge 进程本身
  if (isBridgeCommand(normalizedCmd)) {
    return false;
  }
  // 精确匹配 opencode 命令，避免项目名干扰
  return /\bopencode\b/.test(normalizedCmd) || normalizedCmd.includes('opencode-cli');
}

function getProcessCommandLine(pid) {
  if (!isWindows()) {
    return null;
  }

  try {
    // 优先使用 PowerShell（Windows 11 兼容）
    const psResult = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
    ], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });

    if (!psResult.error && psResult.status === 0) {
      const cmd = (psResult.stdout || '').trim();
      if (cmd) {
        return cmd;
      }
    }
  } catch (e) {
    // PowerShell 失败，尝试 wmic
  }

  try {
    // 回退到 wmic（旧版 Windows）
    const wmicResult = spawnSync('wmic', [
      'process', 'where', `ProcessId=${pid}`,
      'get', 'CommandLine', '/value'
    ], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });

    if (!wmicResult.error && wmicResult.status === 0) {
      const output = wmicResult.stdout || '';
      const match = output.match(/CommandLine=(.+)/);
      if (match) {
        return match[1].trim();
      }
    }
  } catch (e) {
    // wmic 也失败
  }

  return null;
}

function isBridgeProcessByCommand(pid) {
  if (!isWindows()) {
    return false;
  }
  const cmd = getProcessCommandLine(pid);
  if (!cmd) {
    return false;
  }
  return isBridgeCommand(cmd);
}

function isOpenCodeProcessByCommand(pid) {
  if (!isWindows()) {
    return false;
  }
  const cmd = getProcessCommandLine(pid);
  return cmd ? isOpenCodeCommand(cmd) : false;
}

// ==================== 进程终止 ====================

/**
 * 终止进程列表
 * @param {number[]} pids - 进程 PID 列表
 * @param {boolean} force - 是否强制终止 (SIGKILL)
 * @returns {{success: number[], failed: number[]}}
 */
function stopProcesses(pids, force = false) {
  const success = [];
  const failed = [];

  for (const pid of pids) {
    let stopped = false;

    if (isWindows()) {
      // Windows: 使用 taskkill
      const args = force
        ? ['/F', '/PID', String(pid)]
        : ['/PID', String(pid)];

      try {
        const result = spawnSync('taskkill', args, {
          encoding: 'utf-8',
          windowsHide: true,
          timeout: 10000, // 10 秒超时
        });
        stopped = !result.error && result.status === 0;
        if (!stopped && result.error) {
          console.log(`[process-manager] taskkill PID=${pid} 失败: ${result.error.message}`);
        }
      } catch (e) {
        console.log(`[process-manager] taskkill PID=${pid} 异常: ${e.message}`);
        stopped = false;
      }
    } else if (isUnix()) {
      // Unix: 使用 process.kill
      try {
        const signal = force ? 'SIGKILL' : 'SIGTERM';
        process.kill(pid, signal);
        stopped = true;
      } catch {
        stopped = false;
      }
    }

    if (stopped) {
      success.push(pid);
    } else {
      failed.push(pid);
    }
  }

  return { success, failed };
}

/**
 * 等待进程退出
 * @param {() => number[]} getProcesses - 获取进程列表的函数
 * @param {number} maxWaitMs - 最大等待时间 (毫秒)
 * @returns {boolean} - 是否全部退出
 */
function waitForExit(getProcesses, maxWaitMs = 10000) {
  const startTime = Date.now();
  let waitCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const remaining = getProcesses();
    if (remaining.length === 0) {
      return true;
    }

    waitCount++;
    const ms = Math.min(200 * Math.pow(1.5, waitCount), 3000);

    if (waitCount <= 5) {
      process.stdout.write(`等待进程退出... (${waitCount * 200}ms)\n`);
    }

    sleep(ms);
  }

  return false;
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // 忙等待
  }
}

// ==================== 主程序 ====================

function printUsage() {
  console.log(`
跨平台进程管理工具

用法:
  node process-manager.mjs kill-bridge      # 终止所有 Bridge 进程
  node process-manager.mjs kill-opencode    # 终止所有 OpenCode 进程
  node process-manager.mjs list-bridge      # 列出所有 Bridge 进程
  node process-manager.mjs list-opencode    # 列出所有 OpenCode 进程
  node process-manager.mjs help             # 显示此帮助信息

选项:
  --exclude-pid <pid>  排除指定 PID（用于防止自杀）
`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const excludeSelf = args.includes('--exclude-self');

  // 解析 --exclude-pid 参数
  let excludePid = null;
  const excludePidIndex = args.indexOf('--exclude-pid');
  if (excludePidIndex !== -1 && args[excludePidIndex + 1]) {
    excludePid = parseInt(args[excludePidIndex + 1], 10);
  }

  switch (command) {
    case 'kill-bridge': {
      const pids = findBridgeProcesses(excludeSelf, excludePid);
      if (pids.length === 0) {
        console.log('[process-manager] 未检测到 Bridge 进程');
        console.log('[process-manager] 提示: Bridge 进程特征为 dist/index.js 或 dist/admin/index.js');
        return;
      }

      console.log(`[process-manager] 检测到 ${pids.length} 个 Bridge 进程：${pids.join(', ')}`);
      console.log('[process-manager] 发送 SIGTERM 信号...');

      const { success, failed } = stopProcesses(pids, false);
      for (const pid of success) {
        console.log(`[process-manager] 已终止 PID=${pid}`);
      }

      // 简单等待 2 秒让进程退出
      sleep(2000);

      // 检查是否有残留进程，强制终止
      const stillRemaining = findBridgeProcesses(excludeSelf, excludePid);
      if (stillRemaining.length > 0) {
        console.log(`[process-manager] 警告：${stillRemaining.length} 个进程未响应 SIGTERM，尝试强制终止...`);
        const forceResult = stopProcesses(stillRemaining, true);
        for (const pid of forceResult.success) {
          console.log(`[process-manager] 已强制终止 PID=${pid}`);
        }
        sleep(1000);
      }

      console.log('[process-manager] Bridge 进程清理完成');
      break;
    }

    case 'kill-opencode': {
      const pids = findOpenCodeProcesses(excludeSelf, excludePid);
      if (pids.length === 0) {
        console.log('[process-manager] 未检测到 OpenCode 进程');
        return;
      }

      console.log(`[process-manager] 检测到 ${pids.length} 个 OpenCode 进程：${pids.join(', ')}`);
      console.log('[process-manager] 发送 SIGTERM 信号...');

      const { success, failed } = stopProcesses(pids, false);
      for (const pid of success) {
        console.log(`[process-manager] 已终止 PID=${pid}`);
      }

      // 简单等待 2 秒让进程退出
      sleep(2000);

      // 检查是否有残留进程，强制终止
      const stillRemaining = findOpenCodeProcesses(excludeSelf, excludePid);
      if (stillRemaining.length > 0) {
        console.log(`[process-manager] 警告：${stillRemaining.length} 个进程未响应 SIGTERM，尝试强制终止...`);
        const forceResult = stopProcesses(stillRemaining, true);
        for (const pid of forceResult.success) {
          console.log(`[process-manager] 已强制终止 PID=${pid}`);
        }
        sleep(1000);
      }

      console.log('[process-manager] OpenCode 进程清理完成');
      break;
    }

    case 'list-bridge': {
      const pids = findBridgeProcesses();
      if (pids.length === 0) {
        console.log('[process-manager] 未检测到 Bridge 进程');
      } else {
        console.log(`[process-manager] Bridge 进程列表：${pids.join(', ')}`);
      }
      break;
    }

    case 'list-opencode': {
      const pids = findOpenCodeProcesses();
      if (pids.length === 0) {
        console.log('[process-manager] 未检测到 OpenCode 进程');
      } else {
        console.log(`[process-manager] OpenCode 进程列表：${pids.join(', ')}`);
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default:
      printUsage();
      break;
  }
}

// 导出供其他模块使用
export {
  isWindows,
  isUnix,
  findBridgeProcesses,
  findOpenCodeProcesses,
  stopProcesses,
  waitForExit,
};

// 作为 CLI 直接执行
main();
