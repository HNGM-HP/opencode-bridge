/**
 * WeChat ChatId 编解码
 *
 * 格式: weixin::<accountId>::<peerUserId>
 * 确保每个 (账号, 对端用户) 对应唯一的会话标识
 */

const WEIXIN_PREFIX = 'weixin::';
const SEPARATOR = '::';

/**
 * 编码 ChatId
 */
export function encodeWeixinChatId(accountId: string, peerUserId: string): string {
  return `${WEIXIN_PREFIX}${accountId}${SEPARATOR}${peerUserId}`;
}

/**
 * 解码 ChatId
 */
export function decodeWeixinChatId(chatId: string): { accountId: string; peerUserId: string } | null {
  if (!chatId.startsWith(WEIXIN_PREFIX)) return null;
  const rest = chatId.slice(WEIXIN_PREFIX.length);
  const sepIdx = rest.indexOf(SEPARATOR);
  if (sepIdx < 0) return null;
  const accountId = rest.slice(0, sepIdx);
  const peerUserId = rest.slice(sepIdx + SEPARATOR.length);
  if (!accountId || !peerUserId) return null;
  return { accountId, peerUserId };
}

/**
 * 判断是否为 Weixin ChatId
 */
export function isWeixinChatId(chatId: string): boolean {
  return chatId.startsWith(WEIXIN_PREFIX) && decodeWeixinChatId(chatId) !== null;
}