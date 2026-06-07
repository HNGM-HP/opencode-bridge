#!/usr/bin/env node

/**
 * 构建生产环境专用的 node_modules（仅含 dependencies）
 *
 * 为什么需要这个脚本？
 * -------------------------------------------------------------------
 * Electron 打包时，后端服务以 ELECTRON_RUN_AS_NODE 模式作为子进程运行，
 * 它读不到 asar 内的模块，因此 node_modules 必须通过 extraResources 放在
 * asar 外部。
 *
 * 如果直接把整个 node_modules（~846MB，含 devDeps）拷入 extraResources，
 * 安装包会膨胀到 400MB+。这个脚本在 electron-builder 之前执行，创建一个
 * 仅含 production 依赖的 node_modules_prod/ 目录（通常 ~80-120MB），
 * 大幅减小安装包体积。
 *
 * 用法: node scripts/prepare-prod-modules.mjs
 * 输出: ${rootDir}/node_modules_prod/
 */

import { mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const scriptFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(scriptFile), '..');
const tmpDir = resolve(rootDir, '.prod-build');
const prodModules = resolve(rootDir, 'node_modules_prod');

function log(msg) {
  console.log(`[prepare-prod-modules] ${msg}`);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, stdio: 'inherit', ...opts });
}

function main() {
  log('开始创建 production-only node_modules...');

  // 1. 清理旧的临时目录和生产目录
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(prodModules, { recursive: true, force: true });

  // 2. 创建临时目录
  mkdirSync(tmpDir, { recursive: true });

  // 3. 拷贝必要配置文件（preinstall 钩子、镜像源配置等）
  const copyIfExists = (src) => {
    if (existsSync(src)) {
      const rel = relative(rootDir, src);
      const dest = resolve(tmpDir, rel);
      cpSync(src, dest, { recursive: true });
    }
  };
  copyIfExists(resolve(rootDir, 'package.json'));
  copyIfExists(resolve(rootDir, 'package-lock.json'));
  copyIfExists(resolve(rootDir, '.npmrc'));
  copyIfExists(resolve(rootDir, 'scripts')); // preinstall 钩子需要

  // 4. 在临时目录安装 production 依赖
  //    --prefer-offline 利用父目录的 node_modules 缓存加速
  log('正在安装 production 依赖（仅 dependencies）...');
  run('npm install --production', { cwd: tmpDir });

  // 5. 将生产环境 node_modules 移到根目录
  const tmpNodeModules = resolve(tmpDir, 'node_modules');
  if (!existsSync(tmpNodeModules)) {
    throw new Error('生产环境 node_modules 创建失败：' + tmpNodeModules + ' 不存在');
  }

  // 使用重命名（跨设备时回退到拷贝）
  try {
    cpSync(tmpNodeModules, prodModules, { recursive: true });
    log('已复制到 node_modules_prod/');
  } catch (err) {
    log('复制失败: ' + err.message);
    process.exit(1);
  }

  // 6. 清理临时目录
  rmSync(tmpDir, { recursive: true, force: true });

  // 7. 统计大小
  log('✅ 完成！node_modules_prod/ 已就绪');
}

main();
