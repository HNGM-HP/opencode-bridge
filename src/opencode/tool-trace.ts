export type ToolTraceStatus = 'pending' | 'running' | 'completed' | 'failed';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isDisplayableToolInput(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return true;
}

function getFirstDisplayableToolInput(...values: unknown[]): unknown {
  for (const value of values) {
    if (isDisplayableToolInput(value)) {
      return value;
    }
  }
  return undefined;
}

function stringifyToolValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function pickFirstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

export function shouldIncludeToolInput(previousOutput?: string): boolean {
  return !previousOutput || !previousOutput.includes('调用参数:');
}

export function buildToolTraceOutput(
  part: Record<string, unknown>,
  status: ToolTraceStatus,
  withInput: boolean,
  getToolStatusText: (status: ToolTraceStatus) => string
): string | undefined {
  const state = asRecord(part.state);
  const inputValue = withInput
    ? getFirstDisplayableToolInput(
        part.input,
        part.args,
        part.arguments,
        part.raw,
        part.rawInput,
        state?.input,
        state?.args,
        state?.arguments,
        state?.raw
      )
    : undefined;
  const outputValue = status === 'failed'
    ? pickFirstDefined(state?.error, state?.output, part.error)
    : pickFirstDefined(state?.output, state?.result, state?.message, part.output, part.result);

  const inputText = stringifyToolValue(inputValue);
  const outputText = stringifyToolValue(outputValue);
  const blocks: string[] = [];

  if (inputText && inputText.trim()) {
    blocks.push(`调用参数:\n${inputText.trim()}`);
  }

  if (outputText && outputText.trim()) {
    blocks.push(`${status === 'failed' ? '错误输出' : '执行输出'}:\n${outputText.trim()}`);
  }

  if (blocks.length === 0) {
    return `状态更新：${getToolStatusText(status)}`;
  }

  return blocks.join('\n\n');
}
