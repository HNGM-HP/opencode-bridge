/**
 * WeChat 媒体加解密
 *
 * AES-128-ECB 加密，用于 CDN 上传/下载
 */

import crypto from 'crypto';
import type { WeixinCredentials, MessageItem, CDNMedia } from './weixin-types.js';
import { MessageItemType } from './weixin-types.js';
import { getUploadUrl } from './weixin-api.js';

const MAX_MEDIA_SIZE = 100 * 1024 * 1024; // 100 MB

// ──────────────────────────────────────────────
// 加解密
// ──────────────────────────────────────────────

/**
 * 生成随机 16 字节 AES 密钥
 */
export function generateMediaKey(): Buffer {
  return crypto.randomBytes(16);
}

/**
 * AES-128-ECB 加密（PKCS7 填充）
 */
export function encryptMedia(data: Buffer, key: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * AES-128-ECB 解密（PKCS7 去填充）
 */
export function decryptMedia(data: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * 计算填充后密文大小
 */
export function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

// ──────────────────────────────────────────────
// 密钥解析
// ──────────────────────────────────────────────

/**
 * 从消息项解析 AES 密钥
 * 支持 hex (aeskey 字段) 和 base64 (media.aes_key 字段) 格式
 */
function parseAesKey(item: { aeskey?: string; media?: CDNMedia }): Buffer | null {
  // 优先使用 aeskey (hex 格式)
  if (item.aeskey && item.aeskey.length === 32) {
    return Buffer.from(item.aeskey, 'hex');
  }
  // 回退到 media.aes_key (base64 格式)
  if (item.media?.aes_key) {
    return Buffer.from(item.media.aes_key, 'base64');
  }
  return null;
}

// ──────────────────────────────────────────────
// 下载与解密
// ──────────────────────────────────────────────

/**
 * 从 CDN 下载并解密媒体
 */
export async function downloadAndDecryptMedia(
  cdnUrl: string,
  aesKey: Buffer,
  label: string = 'media',
): Promise<Buffer> {
  const res = await fetch(cdnUrl, {
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`CDN download failed for ${label}: ${res.status}`);
  }

  const encrypted = Buffer.from(await res.arrayBuffer());

  if (encrypted.length > MAX_MEDIA_SIZE) {
    throw new Error(`Media too large: ${encrypted.length} bytes (max ${MAX_MEDIA_SIZE})`);
  }

  return decryptMedia(encrypted, aesKey);
}

/**
 * 从消息项下载媒体
 */
export async function downloadMediaFromItem(
  item: MessageItem,
  cdnBaseUrl: string,
): Promise<{ data: Buffer; mimeType: string; filename: string } | null> {
  let encryptParam: string | undefined;
  let aesKey: Buffer | null = null;
  let mimeType = 'application/octet-stream';
  let filename = 'file';

  switch (item.type) {
    case MessageItemType.IMAGE:
      if (item.image_item) {
        encryptParam = item.image_item.media?.encrypt_query_param;
        aesKey = parseAesKey(item.image_item as { aeskey?: string; media?: CDNMedia });
        mimeType = 'image/jpeg';
        filename = `image_${Date.now()}.jpg`;
      }
      break;

    case MessageItemType.VOICE:
      if (item.voice_item) {
        encryptParam = item.voice_item.media?.encrypt_query_param;
        aesKey = parseAesKey(item.voice_item as { aeskey?: string; media?: CDNMedia });
        mimeType = 'audio/silk';
        filename = `voice_${Date.now()}.silk`;
      }
      break;

    case MessageItemType.FILE:
      if (item.file_item) {
        encryptParam = item.file_item.media?.encrypt_query_param;
        aesKey = parseAesKey(item.file_item as { aeskey?: string; media?: CDNMedia });
        filename = item.file_item.file_name || `file_${Date.now()}`;
        // 从文件名猜测 MIME 类型
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext) {
          const mimeMap: Record<string, string> = {
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            txt: 'text/plain',
            zip: 'application/zip',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
          };
          mimeType = mimeMap[ext] || mimeType;
        }
      }
      break;

    case MessageItemType.VIDEO:
      if (item.video_item) {
        encryptParam = item.video_item.media?.encrypt_query_param;
        aesKey = parseAesKey(item.video_item as { aeskey?: string; media?: CDNMedia });
        mimeType = 'video/mp4';
        filename = `video_${Date.now()}.mp4`;
      }
      break;
  }

  if (!encryptParam || !aesKey) return null;

  const cdnUrl = `${cdnBaseUrl}?${encryptParam}`;
  const data = await downloadAndDecryptMedia(cdnUrl, aesKey, filename);
  return { data, mimeType, filename };
}

// ──────────────────────────────────────────────
// 加密与上传
// ──────────────────────────────────────────────

/**
 * 加密并上传媒体到 CDN
 */
export async function uploadMediaToCdn(
  creds: WeixinCredentials,
  data: Buffer,
  filename: string,
  mediaType: number,
): Promise<{ encryptQueryParam: string; aesKeyBase64: string; cipherSize: number }> {
  const plainMd5 = crypto.createHash('md5').update(data).digest('hex');
  const aesKey = generateMediaKey();
  const fileKey = crypto.randomBytes(16).toString('hex');
  const cipherSize = aesEcbPaddedSize(data.length);

  // 获取预签名上传 URL
  const urlResp = await getUploadUrl(creds, fileKey, mediaType, data.length, plainMd5, cipherSize);
  if (!urlResp.upload_param) {
    throw new Error('Failed to get upload URL from WeChat');
  }

  // 加密
  const encrypted = encryptMedia(data, aesKey);

  // 上传到 CDN
  const cdnUrl = `${creds.cdnBaseUrl}?${urlResp.upload_param}`;
  const uploadRes = await fetch(cdnUrl, {
    method: 'PUT',
    body: new Uint8Array(encrypted),
    signal: AbortSignal.timeout(60_000),
  });

  if (!uploadRes.ok) {
    throw new Error(`CDN upload failed: ${uploadRes.status}`);
  }

  return {
    encryptQueryParam: urlResp.upload_param,
    aesKeyBase64: aesKey.toString('base64'),
    cipherSize: encrypted.length,
  };
}