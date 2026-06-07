/**
 * 文件发送器工具函数
 *
 * 从 file-sender.ts 提取。
 */

import * as path from 'path';
import { DirectoryPolicy } from '../utils/directory-policy.js';
import {
  SYSTEM_GENERATED_PATHS,
  SENSITIVE_NAME_PATTERNS,
  SENSITIVE_EXACT_NAMES,
  SENSITIVE_PATH_PREFIXES,
  IMAGE_EXTENSIONS,
  FILE_TYPE_MAP,
  type FeishuFileType,
} from './file-sender-types.js';

/**
 * 路径安全校验。
 * 注意：resolvedPath 必须已经经过 path.resolve() 处理（绝对路径）。
 */
export function validateFilePath(resolvedPath: string): { safe: boolean; reason?: string } {
  // 0. 系统生成文件豁免（绕过白名单校验）
  if (SYSTEM_GENERATED_PATHS.has(resolvedPath)) {
    // 仍需检查敏感文件名
    const basename = path.basename(resolvedPath);
    for (const pattern of SENSITIVE_NAME_PATTERNS) {
      if (pattern.test(basename)) {
        return { safe: false, reason: `拒绝发送敏感文件: ${basename}` };
      }
    }
    return { safe: true };
  }

  // 1. 允许目录白名单校验（未配置时直接拒绝）
  if (!DirectoryPolicy.isAllowedPath(resolvedPath)) {
    return { safe: false, reason: '路径不在允许的工作目录范围内' };
  }

  const basename = path.basename(resolvedPath);

  // 2. 精确文件名匹配
  if (SENSITIVE_EXACT_NAMES.has(basename)) {
    return { safe: false, reason: `拒绝发送敏感文件: ${basename}` };
  }

  // 3. 文件名模式匹配
  for (const pattern of SENSITIVE_NAME_PATTERNS) {
    if (pattern.test(basename)) {
      return { safe: false, reason: `拒绝发送敏感文件: ${basename}` };
    }
  }

  // 4. 路径目录黑名单（统一转为正斜杠以兼容 Windows 路径格式）
  const normalizedPath = resolvedPath.replace(/\\/g, '/');
  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    if (normalizedPath.includes(prefix)) {
      return { safe: false, reason: `拒绝发送系统敏感目录下的文件: ${basename}` };
    }
  }

  return { safe: true };
}

/** 判断是否为图片类型 */
export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

/** 获取飞书文件类型 */
export function getFeishuFileType(ext: string): FeishuFileType {
  return FILE_TYPE_MAP[ext.toLowerCase()] || 'stream';
}
