/**
 * vision-ocr.ts
 *
 * 非多模态主模型的图片预处理服务。
 *
 * 流程：
 *   1. 借用 opencode 已配置的多模态 model（见 VISION_OCR_MODEL）
 *   2. 创建临时 session（复用调用方 workspace/directory）
 *   3. 发送图片 + 引导提示词（VISION_OCR_PROMPT），指定 model override
 *   4. 提取 assistant 回复中所有 text part，拼接为 OCR/描述文本
 *   5. 删除临时 session（OCR 无需保留历史）
 *
 * 任何阶段失败均返回 null，调用方据此回退到 "直发图片" 原路径。
 */

import { opencodeClient } from '../opencode/client.js';
import { visionPreprocessConfig } from '../config/platform.js';
import type { Part } from '@opencode-ai/sdk';

/**
 * OCR 单张图片的请求参数。
 */
export interface OcrImageRequest {
  /** 图片内容（dataURL，如 `data:image/png;base64,...`） */
  imageDataUrl: string;
  /** 图片 MIME 类型，如 `image/png` */
  mime: string;
  /** 原始文件名（用于日志和提示词） */
  filename: string;
  /** 来源消息的 workspace 目录；用于临时 session 的上下文对齐 */
  directory?: string;
  /** 单次调用超时（毫秒）。默认 60s，GLM-4.5V 等 vision 模型在大图场景耗时可能接近 30s */
  timeoutMs?: number;
}

/**
 * 通过 opencode 内的多模态 model 对图片做 OCR / 内容描述。
 *
 * @returns 成功时返回描述文本；任何失败 / 降级场景返回 `null`
 */
export async function ocrImageViaOpencode(req: OcrImageRequest): Promise<string | null> {
  const model = visionPreprocessConfig.model;
  if (!model) {
    console.warn('[vision-ocr] VISION_OCR_MODEL 未配置，跳过 OCR');
    return null;
  }

  const prompt = visionPreprocessConfig.prompt;
  const timeoutMs = Math.max(5_000, req.timeoutMs ?? 60_000);

  // 1) 创建临时 session
  let sessionId: string | undefined;
  try {
    const session = await opencodeClient.createSession(
      `[vision-ocr] ${req.filename}`,
      req.directory,
    );
    sessionId = session?.id;
  } catch (error) {
    console.warn('[vision-ocr] 创建临时 session 失败', error instanceof Error ? error.message : error);
    return null;
  }

  if (!sessionId) {
    console.warn('[vision-ocr] 临时 session id 为空');
    return null;
  }

  // 2) 发送 prompt（带 model override 与图片 part），3) 提取文字
  let ocrText: string | null = null;
  try {
    ocrText = await withTimeout(
      callPromptAndExtract(sessionId, model, prompt, req),
      timeoutMs,
      `vision-ocr timeout after ${timeoutMs}ms`,
    );
  } catch (error) {
    console.warn('[vision-ocr] OCR 调用失败', error instanceof Error ? error.message : error);
    ocrText = null;
  }

  // 4) 无论成败都删除临时 session
  try {
    await opencodeClient.deleteSession(sessionId, { directory: req.directory });
  } catch (error) {
    // 删除失败不影响主流程，仅日志
    console.debug('[vision-ocr] 删除临时 session 失败', error instanceof Error ? error.message : error);
  }

  return ocrText;
}

/**
 * 调 session.prompt 并从响应 parts 中拼出 text。
 *
 * 这里直接用 SDK 底层接口而不是 opencodeClient.sendMessageParts，
 * 因为后者不支持单次 model override 传递（bridge 内部封装的 `options.providerId/modelId`
 * 会被 resolveModelOption 再次覆盖为 default），也不便禁用 tools。
 */
async function callPromptAndExtract(
  sessionId: string,
  model: { providerID: string; modelID: string },
  systemPrompt: string,
  req: OcrImageRequest,
): Promise<string | null> {
  const sdkClient = opencodeClient.getClient();

  const response = await sdkClient.session.prompt({
    path: { id: sessionId },
    body: {
      model,
      system: systemPrompt,
      // 禁用所有工具：OCR 纯描述任务，禁止模型调用 bash / read 等工具消耗额度
      tools: {},
      parts: [
        {
          type: 'file',
          mime: req.mime,
          url: req.imageDataUrl,
          filename: req.filename,
        },
      ],
    },
    ...(req.directory ? { query: { directory: req.directory } } : {}),
  });

  const parts = response?.data?.parts as Part[] | undefined;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const pieces: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if ((part as { type?: string }).type !== 'text') continue;
    const text = (part as { text?: unknown }).text;
    if (typeof text !== 'string') continue;
    const trimmed = text.trim();
    if (!trimmed) continue;
    if ((part as { synthetic?: boolean }).synthetic) continue;
    if ((part as { ignored?: boolean }).ignored) continue;
    pieces.push(trimmed);
  }

  if (pieces.length === 0) return null;
  return pieces.join('\n\n');
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
