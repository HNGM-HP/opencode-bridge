import { opencodeClient } from '../opencode/client.js';
import type { CronIntent, CronIntentAction, CronIntentSource } from './cron-control.js';

interface CronSemanticResult {
  action: 'help' | 'list' | 'add' | 'update' | 'remove' | 'pause' | 'resume';
  id?: string;
  name?: string;
  expr?: string;
  text?: string;
  enabled?: boolean;
}

export interface ParseCronIntentWithOpenCodeOptions {
  argsText: string;
  source: CronIntentSource;
  actionHint?: CronIntentAction;
  directory?: string;
}

export async function parseCronIntentWithOpenCode(
  options: ParseCronIntentWithOpenCodeOptions
): Promise<CronIntent | null> {
  const argsText = options.argsText.trim();
  if (!argsText) {
    return null;
  }

  let semanticSessionId: string | null = null;
  try {
    const created = await opencodeClient.createSession('Cron Semantic Parser', options.directory);
    semanticSessionId = created.id;
    const response = await opencodeClient.sendMessage(
      semanticSessionId,
      buildSemanticPrompt(argsText, options.source, options.actionHint),
      options.directory ? { directory: options.directory } : undefined
    );
    const text = extractTextFromParts(response.parts);
    const structured = parseSemanticResponse(text);
    if (!structured) {
      return null;
    }
    return toCronIntent(structured, options.source);
  } catch (error) {
    console.warn('[CronSemantic] parse failed, fallback to local parser:', error);
    return null;
  } finally {
    if (semanticSessionId) {
      await opencodeClient.deleteSession(
        semanticSessionId,
        options.directory ? { directory: options.directory } : undefined
      ).catch(() => undefined);
    }
  }
}

function buildSemanticPrompt(argsText: string, source: CronIntentSource, actionHint?: CronIntentAction): string {
  return [
    'You are a strict cron intent parser for a bot command.',
    'Parse the user input into ONE JSON object and output JSON only (no markdown, no explanation).',
    'Timezone default: Asia/Shanghai.',
    'Cron expression must use 6 fields: second minute hour day month weekday.',
    'Allowed action: help, list, add, update, remove, pause, resume.',
    'JSON schema:',
    '{"action":"add|update|remove|pause|resume|list|help","id":"...","name":"...","expr":"...","text":"...","enabled":true}',
    'Rules:',
    '- For remove/pause/resume, fill id.',
    '- For add, fill expr and text. name optional.',
    '- For update, fill id; optionally expr/text/name/enabled.',
    '- If actionHint is provided and input is consistent with it, prefer that action.',
    '- If cannot infer confidently, return {"action":"help"}.',
    `Source: ${source}`,
    actionHint ? `Action hint: ${actionHint}` : 'Action hint: none',
    `User text: ${argsText}`,
  ].join('\n');
}

function extractTextFromParts(parts: unknown[]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) {
      chunks.push(record.text.trim());
    }
  }
  return chunks.join('\n').trim();
}

function parseSemanticResponse(rawText: string): CronSemanticResult | null {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const action = normalizeAction(parsed.action);
    if (!action) {
      return null;
    }

    const result: CronSemanticResult = { action };
    const id = toTrimmedString(parsed.id);
    const name = toTrimmedString(parsed.name);
    const expr = toTrimmedString(parsed.expr);
    const text = toTrimmedString(parsed.text);
    if (id) {
      result.id = id;
    }
    if (name) {
      result.name = name;
    }
    if (expr) {
      result.expr = expr;
    }
    if (text) {
      result.text = text;
    }
    if (typeof parsed.enabled === 'boolean') {
      result.enabled = parsed.enabled;
    }

    return result;
  } catch {
    return null;
  }
}

function toCronIntent(result: CronSemanticResult, source: CronIntentSource): CronIntent {
  switch (result.action) {
    case 'list':
    case 'help':
      return {
        action: result.action,
        source,
        argsText: '',
      };

    case 'remove':
    case 'pause':
    case 'resume': {
      if (!result.id) {
        return { action: 'help', source, argsText: '' };
      }
      return {
        action: result.action,
        source,
        argsText: `--id ${quoteArg(result.id)}`,
      };
    }

    case 'add': {
      if (!result.expr || !result.text) {
        return { action: 'help', source, argsText: '' };
      }
      const args: string[] = [
        `--expr ${quoteArg(result.expr)}`,
        `--text ${quoteArg(result.text)}`,
      ];
      if (result.name) {
        args.push(`--name ${quoteArg(result.name)}`);
      }
      return {
        action: 'add',
        source,
        argsText: args.join(' '),
      };
    }

    case 'update': {
      if (!result.id) {
        return { action: 'help', source, argsText: '' };
      }
      const args: string[] = [`--id ${quoteArg(result.id)}`];
      if (result.expr) {
        args.push(`--expr ${quoteArg(result.expr)}`);
      }
      if (result.text) {
        args.push(`--text ${quoteArg(result.text)}`);
      }
      if (result.name) {
        args.push(`--name ${quoteArg(result.name)}`);
      }
      if (typeof result.enabled === 'boolean') {
        args.push(`--enabled ${result.enabled ? 'true' : 'false'}`);
      }
      return {
        action: 'update',
        source,
        argsText: args.join(' '),
      };
    }

    default:
      return {
        action: 'help',
        source,
        argsText: '',
      };
  }
}

function normalizeAction(value: unknown): CronSemanticResult['action'] | null {
  const normalized = toTrimmedString(value).toLowerCase();
  if (
    normalized === 'help'
    || normalized === 'list'
    || normalized === 'add'
    || normalized === 'update'
    || normalized === 'remove'
    || normalized === 'pause'
    || normalized === 'resume'
  ) {
    return normalized;
  }
  return null;
}

function extractJsonObject(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;
  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    return candidate;
  }

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function quoteArg(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function toTrimmedString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}
