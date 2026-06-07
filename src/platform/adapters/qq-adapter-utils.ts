/**
 * QQ 适配器文本分割工具函数
 *
 * 从 qq-adapter.ts 提取，用于将长文本分割为符合 QQ 消息长度限制的片段。
 */

// ── 简单文本分割 ──────────────────────────────

export function splitText(text: string, limit: number): string[] {
  if (!text.trim()) return [];
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit);
    const breakAt = Math.max(
      candidate.lastIndexOf('\n'),
      candidate.lastIndexOf('。'),
      candidate.lastIndexOf('，'),
      candidate.lastIndexOf(' ')
    );
    const cut = breakAt > Math.floor(limit * 0.5) ? breakAt : limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

// ── Markdown 感知文本分割 ─────────────────────

export function splitMarkdownText(text: string, limit: number): string[] {
  if (!text.trim()) return [];
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  const safeLimit = Math.max(256, limit - 8);
  let current = '';
  let openFence: string | null = null;

  const getLastFenceLine = (value: string): string | null => {
    const matches = value.match(/(^|\n)(```[^\n]*)/g);
    if (!matches || matches.length === 0) return null;
    return matches[matches.length - 1].replace(/^\n/, '');
  };

  const fenceCount = (value: string): number => (value.match(/```/g) || []).length;

  const pushCurrent = (): void => {
    if (!current.trim()) return;
    let chunk = current;
    if (fenceCount(chunk) % 2 === 1) {
      openFence = getLastFenceLine(chunk) || '```';
      chunk = `${chunk}\n\`\`\``;
    } else {
      openFence = null;
    }
    chunks.push(chunk);
    current = openFence ? `${openFence}\n` : '';
  };

  for (const line of lines) {
    const candidate = current
      ? `${current}${current.endsWith('\n') ? '' : '\n'}${line}`
      : line;
    if (candidate.length <= safeLimit) {
      current = candidate;
      continue;
    }

    if (current) {
      pushCurrent();
    }

    if (line.length <= safeLimit) {
      current = line;
      continue;
    }

    const pieces = splitText(line, safeLimit);
    for (let i = 0; i < pieces.length - 1; i += 1) {
      current = pieces[i];
      pushCurrent();
    }
    current = pieces[pieces.length - 1] || '';
  }

  if (current.trim()) {
    pushCurrent();
  }

  return chunks;
}
