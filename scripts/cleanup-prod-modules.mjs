#!/usr/bin/env node

/**
 * 清理打包时生成的 node_modules_prod 目录
 *
 * 可以手动执行: node scripts/cleanup-prod-modules.mjs
 * 打包流程中的 prepare:pack 脚本会在开始前自动清理旧目录，
 * 因此这个脚本主要用于开发环境的手动清理。
 */

import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(scriptFile), '..');
const prodModules = resolve(rootDir, 'node_modules_prod');

try {
  rmSync(prodModules, { recursive: true, force: true });
  console.log('[cleanup-prod-modules] node_modules_prod/ 已清理');
} catch (err) {
  // 目录不存在或无法删除时静默忽略
  if (err.code !== 'ENOENT') {
    console.warn('[cleanup-prod-modules] 清理失败:', err.message);
  }
}
