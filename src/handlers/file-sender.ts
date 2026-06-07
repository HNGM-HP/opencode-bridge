import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { feishuClient } from '../feishu/client.js';
import { FEISHU_IMAGE_MAX_SIZE, FEISHU_FILE_MAX_SIZE } from './file-sender-types.js';
import type { SendFileRequest, SendFileResult } from './file-sender-types.js';
import { validateFilePath, isImageExtension, getFeishuFileType } from './file-sender-utils.js';

// 发送文件到飞书群聊
export async function sendFileToFeishu(request: SendFileRequest): Promise<SendFileResult> {
  const { filePath, chatId } = request;

  // 1. 路径标准化（统一 resolve，后续所有操作均基于 resolvedPath）
  const resolvedPath = path.resolve(filePath);
  const fileName = path.basename(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();

  // 2. 安全校验（优先于 IO 操作，避免通过文件不存在报错来探测系统文件）
  const validation = validateFilePath(resolvedPath);
  if (!validation.safe) {
    return { success: false, error: validation.reason, fileName };
  }

  // 3. 存在性检查（错误信息只显示文件名，不暴露服务器完整路径）
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(resolvedPath);
  } catch {
    return { success: false, error: `文件不存在: ${fileName}` };
  }

  if (!stat.isFile()) {
    return { success: false, error: `路径不是文件: ${fileName}` };
  }

  const fileSize = stat.size;
  if (fileSize === 0) {
    return { success: false, error: '不允许上传空文件' };
  }

  // 4. 读取权限检查（stat 成功不代表进程有读权限）
  try {
    await fsp.access(resolvedPath, fs.constants.R_OK);
  } catch {
    return { success: false, error: `无权限读取文件: ${fileName}` };
  }

  // 5. 判断通道类型并检查大小限制
  const isImage = isImageExtension(ext);
  const maxSize = isImage ? FEISHU_IMAGE_MAX_SIZE : FEISHU_FILE_MAX_SIZE;
  if (fileSize > maxSize) {
    const limitMB = maxSize / (1024 * 1024);
    return {
      success: false,
      error: `文件大小 ${(fileSize / (1024 * 1024)).toFixed(1)}MB 超过飞书${isImage ? '图片' : '文件'}上传限制 ${limitMB}MB`,
    };
  }

  if (isImage) {
    // 6a. 图片通道：上传 → 发送图片消息
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
    // 6b. 文件通道：上传 → 发送文件消息
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

// Re-exports for backward compatibility
export type { SendFileRequest, SendFileResult } from './file-sender-types.js';
export { validateFilePath, isImageExtension, getFeishuFileType } from './file-sender-utils.js';
