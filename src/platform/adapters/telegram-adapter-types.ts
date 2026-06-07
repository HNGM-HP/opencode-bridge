/**
 * Telegram 适配器类型定义与常量
 *
 * 从 telegram-adapter.ts 提取。
 */

export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const TELEGRAM_FILE_BASE_URL = 'https://api.telegram.org/file/bot';

export type TelegramCardPayload = {
  text?: string;
  markdown?: string;
  telegramText?: string;
  parse_mode?: 'MarkdownV2' | 'HTML';
  buttons?: Array<{ text: string; callback_data: string }>;
};
