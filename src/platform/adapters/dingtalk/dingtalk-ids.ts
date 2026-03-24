/**
 * 钉钉 ChatId 编解码
 *
 * ChatId 格式: dingtalk::<accountId>::<conversationId>
 * - 单聊: dingtalk::default::userStaffId
 * - 群聊: dingtalk::default::cidXXX
 */

/**
 * 编码钉钉 ChatId
 */
export function encodeDingtalkChatId(accountId: string, conversationId: string): string {
  return `dingtalk::${accountId}::${conversationId}`;
}

/**
 * 解码钉钉 ChatId
 */
export function decodeDingtalkChatId(chatId: string): { accountId: string; conversationId: string } | null {
  if (!chatId || typeof chatId !== 'string') return null;

  const parts = chatId.split('::');
  if (parts.length !== 3 || parts[0] !== 'dingtalk') return null;

  const [, accountId, conversationId] = parts;
  if (!accountId || !conversationId) return null;

  return { accountId, conversationId };
}

/**
 * 判断是否为群聊（以 cid 开头）
 */
export function isDingtalkGroupChat(conversationId: string): boolean {
  return conversationId.startsWith('cid');
}

/**
 * 从原始消息构建 conversationId
 * - 单聊：使用 senderStaffId 或 senderId
 * - 群聊：使用 conversationId
 */
export function buildDingtalkConversationId(
  rawMsg: { conversationType: string; conversationId: string; senderStaffId?: string; senderId?: string }
): string {
  // 群聊
  if (rawMsg.conversationType === '2') {
    return rawMsg.conversationId;
  }
  // 单聊：优先使用 senderStaffId
  return rawMsg.senderStaffId || rawMsg.senderId || '';
}