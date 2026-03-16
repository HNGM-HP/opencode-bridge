import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outputBuffer } from '../src/opencode/output-buffer.js';

describe('OutputBuffer update serialization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    outputBuffer.clearAll();
  });

  afterEach(() => {
    outputBuffer.setUpdateCallback(async () => undefined);
    outputBuffer.clearAll();
    vi.useRealTimers();
  });

  it('同一 buffer 的更新回调应串行执行', async () => {
    let activeCount = 0;
    let maxActiveCount = 0;
    let callCount = 0;
    let releaseFirstRun!: () => void;
    const firstRunGate = new Promise<void>(resolve => {
      releaseFirstRun = resolve;
    });

    outputBuffer.setUpdateCallback(async () => {
      callCount += 1;
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);

      if (callCount === 1) {
        await firstRunGate;
      }

      activeCount -= 1;
    });

    outputBuffer.getOrCreate('chat:test', 'chat-test', 'ses-test', null);
    outputBuffer.append('chat:test', 'hello');
    await vi.advanceTimersByTimeAsync(5000);

    outputBuffer.touch('chat:test');
    await vi.advanceTimersByTimeAsync(5000);

    expect(callCount).toBe(1);
    expect(maxActiveCount).toBe(1);

    releaseFirstRun();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(callCount).toBe(2);
    expect(maxActiveCount).toBe(1);
  });
});
