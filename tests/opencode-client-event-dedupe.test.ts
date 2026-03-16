import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { opencodeClient } from '../src/opencode/client.js';

type InternalOpencodeClient = {
  handleEvent: (event: { type: string; properties?: Record<string, unknown> }) => void;
  recentEventFingerprintMap: Map<string, number>;
};

describe('OpencodeClient event dedupe', () => {
  const internalClient = opencodeClient as unknown as InternalOpencodeClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    internalClient.recentEventFingerprintMap.clear();
  });

  afterEach(() => {
    opencodeClient.removeAllListeners('permissionRequest');
    opencodeClient.removeAllListeners('messagePartUpdated');
    internalClient.recentEventFingerprintMap.clear();
  });

  it('重复 permission 事件只应分发一次', () => {
    const permissionSpy = vi.fn();
    opencodeClient.on('permissionRequest', permissionSpy);

    const event = {
      type: 'permission.asked',
      properties: {
        id: 'per-1',
        sessionID: 'ses-1',
        permission: 'external_directory',
        metadata: {
          filepath: '/tmp/demo',
        },
        tool: {
          messageID: 'msg-1',
          callID: 'call-1',
        },
      },
    };

    internalClient.handleEvent(event);
    internalClient.handleEvent(event);

    expect(permissionSpy).toHaveBeenCalledTimes(1);
  });

  it('重复文本 part 快照只应处理一次，但后续增长快照仍应处理', () => {
    const partSpy = vi.fn();
    opencodeClient.on('messagePartUpdated', partSpy);

    internalClient.handleEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part-1',
          sessionID: 'ses-1',
          messageID: 'msg-1',
          type: 'text',
          text: '哥，收到。',
          time: { start: 1 },
        },
        delta: '哥，收到。',
      },
    });
    internalClient.handleEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part-1',
          sessionID: 'ses-1',
          messageID: 'msg-1',
          type: 'text',
          text: '哥，收到。',
          time: { start: 1 },
        },
        delta: '哥，收到。',
      },
    });
    internalClient.handleEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part-1',
          sessionID: 'ses-1',
          messageID: 'msg-1',
          type: 'text',
          text: '哥，收到。我在。',
          time: { start: 1 },
        },
        delta: '我在。',
      },
    });

    expect(partSpy).toHaveBeenCalledTimes(2);
  });

  it('tool part 相同快照但不同 delta 时不应被误去重', () => {
    const partSpy = vi.fn();
    opencodeClient.on('messagePartUpdated', partSpy);

    internalClient.handleEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'tool-part-1',
          sessionID: 'ses-1',
          messageID: 'msg-1',
          callID: 'call-1',
          type: 'tool',
          tool: 'bash',
          state: {
            status: 'running',
            input: {
              command: 'ls',
            },
            time: { start: 1 },
          },
        },
        delta: 'step-1',
      },
    });
    internalClient.handleEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'tool-part-1',
          sessionID: 'ses-1',
          messageID: 'msg-1',
          callID: 'call-1',
          type: 'tool',
          tool: 'bash',
          state: {
            status: 'running',
            input: {
              command: 'ls',
            },
            time: { start: 1 },
          },
        },
        delta: 'step-2',
      },
    });

    expect(partSpy).toHaveBeenCalledTimes(2);
  });
});
