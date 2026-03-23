import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { opencodeClient } from '../src/opencode/client.js';

type InternalOpencodeClient = {
  handleEvent: (event: { type: string; properties?: Record<string, unknown> }) => void;
};

describe('OpencodeClient event handling', () => {
  const internalClient = opencodeClient as unknown as InternalOpencodeClient;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    opencodeClient.removeAllListeners('permissionRequest');
    opencodeClient.removeAllListeners('messagePartUpdated');
    opencodeClient.removeAllListeners('messageUpdated');
    opencodeClient.removeAllListeners('sessionIdle');
    opencodeClient.removeAllListeners('sessionError');
  });

  it('permission 事件应正确分发', () => {
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

    expect(permissionSpy).toHaveBeenCalledTimes(1);
    expect(permissionSpy).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'ses-1',
      permissionId: 'per-1',
    }));
  });

  it('messagePartUpdated 事件应正确分发', () => {
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
          text: 'Hello',
          time: { start: 1 },
        },
        delta: 'Hello',
      },
    });

    expect(partSpy).toHaveBeenCalledTimes(1);
    expect(partSpy).toHaveBeenCalledWith(expect.objectContaining({
      part: expect.objectContaining({
        id: 'part-1',
      }),
    }));
  });

  it('sessionIdle 事件应正确分发', () => {
    const idleSpy = vi.fn();
    opencodeClient.on('sessionIdle', idleSpy);

    internalClient.handleEvent({
      type: 'session.idle',
      properties: {
        sessionID: 'ses-1',
      },
    });

    expect(idleSpy).toHaveBeenCalledTimes(1);
  });

  it('sessionError 事件应正确分发', () => {
    const errorSpy = vi.fn();
    opencodeClient.on('sessionError', errorSpy);

    internalClient.handleEvent({
      type: 'session.error',
      properties: {
        sessionID: 'ses-1',
        error: 'Something went wrong',
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});