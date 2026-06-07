/**
 * User Message ID Cache
 *
 * Tracks which message IDs belong to user messages within each session.
 * Used by OpenCodeEventHub to skip processing of user messages during
 * message-part-update events (so only assistant/tool parts are rendered).
 *
 * The cache is bounded at 20 entries per session to prevent unbounded growth.
 */

export class UserMessageIdCache {
  private userMessageIdsBySession = new Map<string, Set<string>>();

  /**
   * Remember a user message ID for the given session.
   * Caps the per-session set at 20 entries by evicting the oldest entry.
   */
  remember(sessionId: string, messageId: string): void {
    const normalizedMessageId = messageId.trim();
    if (!normalizedMessageId) {
      return;
    }

    const existing = this.userMessageIdsBySession.get(sessionId) || new Set<string>();
    existing.add(normalizedMessageId);
    if (existing.size > 20) {
      const oldest = existing.values().next().value;
      if (typeof oldest === 'string') {
        existing.delete(oldest);
      }
    }
    this.userMessageIdsBySession.set(sessionId, existing);
  }

  /**
   * Check whether a given message/part ID belongs to a user message
   * that was previously recorded for this session.
   */
  isUserMessage(sessionId: string, messageId: string): boolean {
    const existing = this.userMessageIdsBySession.get(sessionId);
    if (!existing) {
      return false;
    }
    return existing.has(messageId);
  }

  /**
   * Remove all tracked message IDs for the given session.
   */
  clear(sessionId: string): void {
    this.userMessageIdsBySession.delete(sessionId);
  }
}
