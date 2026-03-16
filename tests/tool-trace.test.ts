import { describe, expect, it } from 'vitest';
import { buildToolTraceOutput, shouldIncludeToolInput } from '../src/opencode/tool-trace.js';

describe('tool trace output', () => {
  const getToolStatusText = (status: 'pending' | 'running' | 'completed' | 'failed'): string => {
    if (status === 'pending') return '等待中';
    if (status === 'running') return '执行中';
    if (status === 'completed') return '已完成';
    return '失败';
  };

  it('state.input 为空对象时应回退到 raw 参数', () => {
    const output = buildToolTraceOutput(
      {
        state: {
          status: 'pending',
          input: {},
          raw: '$ ls -la /Users/kvnew/work/test',
        },
      },
      'pending',
      true,
      getToolStatusText
    );

    expect(output).toContain('$ ls -la /Users/kvnew/work/test');
    expect(output).not.toContain('调用参数:\n{}');
  });

  it('顶层 raw 参数也应作为兜底调用参数显示', () => {
    const output = buildToolTraceOutput(
      {
        raw: 'ls -la /tmp/demo',
        state: {
          status: 'running',
          input: {},
        },
      },
      'running',
      true,
      getToolStatusText
    );

    expect(output).toContain('ls -la /tmp/demo');
    expect(output).not.toContain('调用参数:\n{}');
  });

  it('空对象参数不应显示为调用参数', () => {
    const output = buildToolTraceOutput(
      {
        state: {
          status: 'running',
          input: {},
        },
      },
      'running',
      true,
      getToolStatusText
    );

    expect(output).toBe('状态更新：执行中');
  });

  it('已有有效调用参数时不应再次补写', () => {
    expect(shouldIncludeToolInput('调用参数:\n{"command":"ls"}\n\n---\n状态更新：执行中')).toBe(false);
    expect(shouldIncludeToolInput('状态更新：执行中')).toBe(true);
  });
});
