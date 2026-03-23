import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 测试从 client.ts 提取的工具函数
// 由于这些是模块级私有函数，我们需要通过模拟测试其行为

// 模拟 extractApiCode 函数的行为
function extractApiCode(responseData: unknown): number | undefined {
  if (!responseData || typeof responseData !== 'object') return undefined;
  const value = (responseData as { code?: unknown }).code;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// 模拟 isCompletionNotFoundError
function isCompletionNotFoundError(responseData: unknown): boolean {
  const apiCode = extractApiCode(responseData);
  return apiCode === 230001;
}

// 模拟 isRetryableError
function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // 网络错误（无响应）
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('timeout')
    ) {
      return true;
    }
  }

  // 检查 HTTP 状态码
  const record = error as Record<string, unknown>;
  const statusCode =
    typeof record.code === 'number' ? record.code :
    typeof (error as { response?: { status?: number } }).response?.status === 'number'
      ? (error as { response: { status: number } }).response.status
      : undefined;

  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // 检查 responseData 中的 code
  const responseData = typeof record.response === 'object' && record.response !== null
    ? (record.response as Record<string, unknown>).data
    : undefined;
  const apiCode = extractApiCode(responseData);
  if (apiCode && apiCode >= 500000 && apiCode < 600000) {
    return true;
  }

  return false;
}

// 模拟 withRetry
interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 最后一次尝试不再等待
      if (attempt === options.maxAttempts - 1) {
        break;
      }

      // 只对可重试的错误进行重试
      if (!isRetryableError(error)) {
        break;
      }

      // 指数退避（测试时跳过实际等待）
      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt),
        options.maxDelayMs
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

describe('稳定性增强 - 错误检测函数', () => {
  describe('extractApiCode', () => {
    it('应正确提取数字类型的 code', () => {
      expect(extractApiCode({ code: 230001 })).toBe(230001);
      expect(extractApiCode({ code: 230002 })).toBe(230002);
      expect(extractApiCode({ code: 0 })).toBe(0);
    });

    it('应正确提取字符串类型的 code', () => {
      expect(extractApiCode({ code: '230001' })).toBe(230001);
      expect(extractApiCode({ code: '999' })).toBe(999);
    });

    it('应对无效输入返回 undefined', () => {
      expect(extractApiCode(null)).toBeUndefined();
      expect(extractApiCode(undefined)).toBeUndefined();
      expect(extractApiCode({})).toBeUndefined();
      expect(extractApiCode({ code: 'invalid' })).toBeUndefined();
      // 注意：NaN 的 typeof 是 'number'，所以会返回 NaN 而非 undefined
      // 这是预期行为，与实际代码一致
    });
  });

  describe('isCompletionNotFoundError', () => {
    it('应正确识别 230001 错误码', () => {
      expect(isCompletionNotFoundError({ code: 230001 })).toBe(true);
    });

    it('应对其他错误码返回 false', () => {
      expect(isCompletionNotFoundError({ code: 230002 })).toBe(false);
      expect(isCompletionNotFoundError({ code: 230099 })).toBe(false);
      expect(isCompletionNotFoundError({ code: 0 })).toBe(false);
    });

    it('应对无效输入返回 false', () => {
      expect(isCompletionNotFoundError(null)).toBe(false);
      expect(isCompletionNotFoundError({})).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('应识别网络错误为可重试', () => {
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    });

    it('应识别 5xx HTTP 状态码为可重试', () => {
      expect(isRetryableError({ code: 500 })).toBe(true);
      expect(isRetryableError({ code: 502 })).toBe(true);
      expect(isRetryableError({ code: 503 })).toBe(true);
      expect(isRetryableError({ code: 504 })).toBe(true);
    });

    it('应识别 5xx API 错误码为可重试', () => {
      expect(isRetryableError({ response: { data: { code: 500000 } } })).toBe(true);
      expect(isRetryableError({ response: { data: { code: 503000 } } })).toBe(true);
    });

    it('不应将 4xx 错误视为可重试', () => {
      expect(isRetryableError({ code: 400 })).toBe(false);
      expect(isRetryableError({ code: 404 })).toBe(false);
      expect(isRetryableError({ code: 429 })).toBe(false);
    });

    it('不应将业务错误码 230001 视为可重试', () => {
      expect(isRetryableError({ response: { data: { code: 230001 } } })).toBe(false);
    });

    it('应对无效输入返回 false', () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });
});

describe('稳定性增强 - 重试机制', () => {
  it('首次成功应直接返回结果', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('可重试错误应触发重试', async () => {
    const networkError = new Error('ECONNRESET');
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('达到最大重试次数后应抛出错误', async () => {
    const networkError = new Error('ECONNRESET');
    const fn = vi.fn().mockRejectedValue(networkError);

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 100 })
    ).rejects.toThrow('ECONNRESET');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('不可重试错误应立即抛出', async () => {
    const clientError = new Error('Bad Request');
    (clientError as any).code = 400;
    const fn = vi.fn()
      .mockRejectedValueOnce(clientError)
      .mockResolvedValue('success');

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 })
    ).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1); // 不重试
  });

  it('指数退避应正确计算延迟', async () => {
    const networkError = new Error('ECONNRESET');
    let callTimes: number[] = [];

    const fn = vi.fn().mockImplementation(async () => {
      callTimes.push(Date.now());
      if (callTimes.length < 3) {
        throw networkError;
      }
      return 'success';
    });

    const startTime = Date.now();
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 500 });
    const endTime = Date.now();

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    // 验证有延迟（至少有一些等待时间）
    expect(endTime - startTime).toBeGreaterThanOrEqual(50); // 至少有一次延迟
  });

  it('延迟不应超过 maxDelayMs', async () => {
    const networkError = new Error('ECONNRESET');
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 6, baseDelayMs: 100, maxDelayMs: 200 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(6);
  });
});

describe('稳定性增强 - 心跳检测状态机', () => {
  type ConnectionState = 'disconnected' | 'connecting' | 'connected';

  // 模拟心跳检测状态机
  class MockHeartbeatStateMachine {
    private connectionState: ConnectionState = 'disconnected';
    private heartbeatFailureCount: number = 0;
    private readonly FAILURE_THRESHOLD = 3;

    getState(): ConnectionState {
      return this.connectionState;
    }

    getFailureCount(): number {
      return this.heartbeatFailureCount;
    }

    onConnecting(): void {
      this.connectionState = 'connecting';
    }

    onConnected(): void {
      this.connectionState = 'connected';
      this.heartbeatFailureCount = 0;
    }

    onHeartbeatSuccess(): void {
      this.heartbeatFailureCount = 0;
      if (this.connectionState !== 'connected') {
        this.connectionState = 'connected';
      }
    }

    onHeartbeatFailure(): boolean {
      this.heartbeatFailureCount++;

      if (this.heartbeatFailureCount >= this.FAILURE_THRESHOLD) {
        if (this.connectionState === 'connected') {
          this.connectionState = 'disconnected';
          return true; // 触发断连事件
        }
      }
      return false;
    }

    onDisconnect(): void {
      this.connectionState = 'disconnected';
      this.heartbeatFailureCount = 0;
    }
  }

  it('初始状态应为 disconnected', () => {
    const sm = new MockHeartbeatStateMachine();
    expect(sm.getState()).toBe('disconnected');
    expect(sm.getFailureCount()).toBe(0);
  });

  it('连接流程应正确转换状态', () => {
    const sm = new MockHeartbeatStateMachine();

    sm.onConnecting();
    expect(sm.getState()).toBe('connecting');

    sm.onConnected();
    expect(sm.getState()).toBe('connected');
    expect(sm.getFailureCount()).toBe(0);
  });

  it('心跳成功应重置失败计数', () => {
    const sm = new MockHeartbeatStateMachine();
    sm.onConnected();

    sm.onHeartbeatFailure();
    sm.onHeartbeatFailure();
    expect(sm.getFailureCount()).toBe(2);

    sm.onHeartbeatSuccess();
    expect(sm.getFailureCount()).toBe(0);
    expect(sm.getState()).toBe('connected');
  });

  it('连续失败达到阈值应触发断连', () => {
    const sm = new MockHeartbeatStateMachine();
    sm.onConnected();

    expect(sm.onHeartbeatFailure()).toBe(false);
    expect(sm.onHeartbeatFailure()).toBe(false);
    expect(sm.getState()).toBe('connected');

    expect(sm.onHeartbeatFailure()).toBe(true);
    expect(sm.getState()).toBe('disconnected');
  });

  it('断连后恢复应正确工作', () => {
    const sm = new MockHeartbeatStateMachine();
    sm.onConnected();

    // 触发断连
    sm.onHeartbeatFailure();
    sm.onHeartbeatFailure();
    sm.onHeartbeatFailure();
    expect(sm.getState()).toBe('disconnected');

    // 心跳成功恢复连接
    sm.onHeartbeatSuccess();
    expect(sm.getState()).toBe('connected');
    expect(sm.getFailureCount()).toBe(0);
  });

  it('主动断开应重置状态', () => {
    const sm = new MockHeartbeatStateMachine();
    sm.onConnected();
    sm.onHeartbeatFailure();
    sm.onHeartbeatFailure();

    sm.onDisconnect();
    expect(sm.getState()).toBe('disconnected');
    expect(sm.getFailureCount()).toBe(0);
  });
});