#!/usr/bin/env node

/**
 * 启动后台进程脚本
 *
 * 功能:
 * - 调用 process-manager.mjs 清理旧进程
 * - 构建项目（如果需要）
 * - 启动 Bridge 服务
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const rootDir = path.resolve(scriptDir, '..');
const logsDir = path.join(rootDir, 'logs');
const pidFile = path.join(logsDir, 'bridge.pid');
const outLog = path.join(logsDir, 'service.log');
const errLog = path.join(logsDir, 'service.err');
const entryFile = path.join(rootDir, 'dist', 'index.js');
const processManagerPath = path.join(rootDir, 'scripts', 'process-manager.mjs');

function isWindows() {
  return process.platform === 'win32';
}

function getNpmCommandVariants(args) {
  const variants = [];
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    variants.push({
      command: process.execPath,
      args: [npmExecPath, ...args],
    });
  }

  variants.push({ command: 'npm', args });

  if (isWindows()) {
    variants.push({ command: 'npm.cmd', args });
    variants.push({ command: 'npm.exe', args });
  }

  const seen = new Set();
  const uniqueVariants = [];

  for (const variant of variants) {
    const key = `${variant.command}::${variant.args.join('\u0000')}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueVariants.push(variant);
  }

  return uniqueVariants;
}

function runNpm(args) {
  const variants = getNpmCommandVariants(args);
  let lastResult = null;

  for (const variant of variants) {
    const result = spawnSync(variant.command, variant.args, {
      cwd: rootDir,
      stdio: 'inherit',
    });

    if (result.error) {
      lastResult = result;
      continue;
    }

    if (result.status === 0) {
      return result;
    }

    lastResult = result;
  }

  return lastResult;
}

function ensureLogDir() {
  fs.mkdirSync(logsDir, { recursive: true });
}

function ensureBuildIfMissing() {
  if (fs.existsSync(entryFile)) {
    return;
  }

  console.log('[start] 未检测到 dist/index.js，开始自动构建');
  const result = runNpm(['run', 'build']);

  if (!result || result.error || result.status !== 0) {
    console.error('[start] 构建失败，启动中止');
    process.exit(result?.status ?? 1);
  }
}

function startBridge() {
  const stdoutFd = fs.openSync(outLog, 'a');
  const stderrFd = fs.openSync(errLog, 'a');

  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: rootDir,
    detached: true,
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: isWindows(),
  });

  child.unref();
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  fs.writeFileSync(pidFile, String(child.pid), 'utf-8');
  console.log(`[start] 启动成功，PID=${child.pid}`);
  console.log(`[start] 日志文件：${outLog}`);
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // 忙等待
  }
}

function main() {
  ensureLogDir();

  // 1. 调用进程管理工具清理旧进程（不传递 --exclude-self，因为这是独立调用）
  console.log('[start] 清理旧进程...');
  const cleanupResult = spawnSync(process.execPath, [processManagerPath, 'kill-bridge'], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (cleanupResult.stdout) {
    console.log(cleanupResult.stdout.trim());
  }
  if (cleanupResult.stderr) {
    console.error(cleanupResult.stderr.trim());
  }

  // 2. 等待 3 秒，确保旧进程完全退出
  console.log('[start] 等待进程退出...');
  sleep(3000);

  ensureBuildIfMissing();

  // 3. 启动 Bridge 服务
  startBridge();
}

main();
