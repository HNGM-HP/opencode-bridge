import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outputBuffer } from '../src/opencode/output-buffer.js';

describe('OutputBuffer update behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    outputBuffer.clearAll();
  });

  afterEach(() => {
    outputBuffer.setUpdateCallback(async () => undefined);
    outputBuffer.clearAll();
    vi.useRealTimers();
  });

  it('定时器触发后应调用更新回调', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    outputBuffer.setUpdateCallback(callback);

    outputBuffer.getOrCreate('chat:test', 'chat-test', 'ses-test', null);
    outputBuffer.append('chat:test', 'hello');

    // 推进时间让 timer 触发（updateInterval 默认 3000ms）
    await vi.advanceTimersByTimeAsync(3500);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('多个操作应合并为一次更新', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    outputBuffer.setUpdateCallback(callback);

    outputBuffer.getOrCreate('chat:test', 'chat-test', 'ses-test', null);

    // 在 timer 触发前进行多个操作
    outputBuffer.append('chat:test', 'hello');
    outputBuffer.append('chat:test', ' world');
    outputBuffer.append('chat:test', '!');

    // 推进时间让 timer 触发
    await vi.advanceTimersByTimeAsync(3500);

    // 所有操作应该合并为一次回调
    expect(callback).toHaveBeenCalledTimes(1);
    const buffer = callback.mock.calls[0][0];
    expect(buffer.content.join('')).toBe('hello world!');
  });

  it('不同 buffer 的更新应独立触发', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    outputBuffer.setUpdateCallback(callback);

    outputBuffer.getOrCreate('chat:test1', 'chat-test1', 'ses-test', null);
    outputBuffer.getOrCreate('chat:test2', 'chat-test2', 'ses-test', null);

    outputBuffer.append('chat:test1', 'hello');
    outputBuffer.append('chat:test2', 'world');

    // 推进时间让 timers 触发
    await vi.advanceTimersByTimeAsync(3500);

    // 两个 buffer 都应该触发回调
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('touch 应该标记 dirty 并触发更新', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    outputBuffer.setUpdateCallback(callback);

    outputBuffer.getOrCreate('chat:test', 'chat-test', 'ses-test', null);

    // touch 会标记 dirty
    outputBuffer.touch('chat:test');

    await vi.advanceTimersByTimeAsync(3500);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('clearAll 应该清除所有 buffer', async () => {
    outputBuffer.getOrCreate('chat:test1', 'chat-test1', 'ses-test', null);
    outputBuffer.getOrCreate('chat:test2', 'chat-test2', 'ses-test', null);

    outputBuffer.clearAll();

    expect(outputBuffer.get('chat:test1')).toBeUndefined();
    expect(outputBuffer.get('chat:test2')).toBeUndefined();
  });
});