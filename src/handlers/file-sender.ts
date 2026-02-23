import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { feishuClient } from '../feishu/client.js';

// 敏感文件黑名单（禁止发送）
const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\..+$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /credentials/i,
  /\.key$/i,
  /secrets?\./i,
];

// 路径安全校验
export function validateFilePath(filePath: string): { safe: boolean; reason?: string } {
  const basename = path.basename(path.resolve(filePath));
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(basename)) {
      return { safe: false, reason: `拒绝发送敏感文件: ${basename}` };
    }
  }
  return { safe: true };
}

// 飞书官方上传限制
const FEISHU_IMAGE_MAX_SIZE = 10 * 1024 * 1024;  // 10MB
const FEISHU_FILE_MAX_SIZE = 30 * 1024 * 1024;    // 30MB

// 图片扩展名集合
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.ico',
]);

// 飞书文件类型映射
type FeishuFileType = 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream';

const FILE_TYPE_MAP: Record<string, FeishuFileType> = {
  '.pdf': 'pdf',
  '.mp4': 'mp4',
  '.opus': 'opus',
  '.ogg': 'opus',
  '.doc': 'doc',
  '.docx': 'doc',
  '.xls': 'xls',
  '.xlsx': 'xls',
  '.ppt': 'ppt',
  '.pptx': 'ppt',
};

export interface SendFileRequest {
  filePath: string;
  chatId: string;
}

export interface SendFileResult {
  success: boolean;
  messageId?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
  sendType?: 'image' | 'file';
}

// 判断是否为图片类型
function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

// 获取飞书文件类型
function getFeishuFileType(ext: string): FeishuFileType {
  return FILE_TYPE_MAP[ext.toLowerCase()] || 'stream';
}

// 发送文件到飞书群聊
export async function sendFileToFeishu(request: SendFileRequest): Promise<SendFileResult> {
  const { filePath, chatId } = request;

  // 1. 路径标准化
  const resolvedPath = path.resolve(filePath);
  const fileName = path.basename(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();

  // 2. 存在性检查
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(resolvedPath);
  } catch {
    return { success: false, error: `文件不存在: ${resolvedPath}` };
  }

  if (!stat.isFile()) {
    return { success: false, error: `路径不是文件: ${resolvedPath}` };
  }

  const fileSize = stat.size;
  if (fileSize === 0) {
    return { success: false, error: '不允许上传空文件' };
  }

  // 3. 判断通道类型并检查大小限制
  const isImage = isImageExtension(ext);
  const maxSize = isImage ? FEISHU_IMAGE_MAX_SIZE : FEISHU_FILE_MAX_SIZE;
  if (fileSize > maxSize) {
    const limitMB = maxSize / (1024 * 1024);
    return {
      success: false,
      error: `文件大小 ${(fileSize / (1024 * 1024)).toFixed(1)}MB 超过飞书${isImage ? '图片' : '文件'}上传限制 ${limitMB}MB`,
    };
  }

  // 内部安全校验（最后防线，即使调用方遗漏也能拦截）
  const validation = validateFilePath(resolvedPath);
  if (!validation.safe) {
    return { success: false, error: validation.reason, fileName, fileSize };
  }

  if (isImage) {
    // 4a. 图片通道：上传 → 发送图片消息
    const imageStream = fs.createReadStream(resolvedPath);
    try {
      const imageKey = await feishuClient.uploadImage(imageStream);
      if (!imageKey) {
        return { success: false, error: '图片上传失败', fileName, fileSize };
      }

      const messageId = await feishuClient.sendImageMessage(chatId, imageKey);
      if (!messageId) {
        return { success: false, error: '图片消息发送失败', fileName, fileSize, sendType: 'image' };
      }

      return { success: true, messageId, fileName, fileSize, sendType: 'image' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FileSender] 图片发送异常: ${message}`);
      return { success: false, error: `发送异常: ${message}`, fileName, fileSize };
    } finally {
      imageStream.destroy();
    }
  } else {
    // 4b. 文件通道：上传 → 发送文件消息
    const fileType = getFeishuFileType(ext);
    const fileStream = fs.createReadStream(resolvedPath);
    try {
      const fileKey = await feishuClient.uploadFile(fileStream, fileName, fileType);
      if (!fileKey) {
        return { success: false, error: '文件上传失败', fileName, fileSize };
      }

      const messageId = await feishuClient.sendFileMessage(chatId, fileKey);
      if (!messageId) {
        return { success: false, error: '文件消息发送失败', fileName, fileSize, sendType: 'file' };
      }

      return { success: true, messageId, fileName, fileSize, sendType: 'file' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FileSender] 文件发送异常: ${message}`);
      return { success: false, error: `发送异常: ${message}`, fileName, fileSize };
    } finally {
      fileStream.destroy();
    }
  }
}
