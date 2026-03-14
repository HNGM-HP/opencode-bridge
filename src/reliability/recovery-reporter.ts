import { opencodeClient } from '../opencode/client.js';
import { generateIncidentId, redactSensitiveFields, type AuditLogger } from './audit-log.js';
import { FailureType } from './types.js';

export interface RecoveryReporterClient {
  sendMessageAsync(
    sessionId: string,
    text: string,
    options?: {
      providerId?: string;
      modelId?: string;
      agent?: string;
      variant?: string;
      directory?: string;
    }
  ): Promise<void>;
  createSession(title?: string, directory?: string): Promise<{ id: string }>;
}

export interface ReportRecoveryContextInput {
  failureType: FailureType;
  failureReason: string;
  backupPath: string;
  nextActions: string[];
  selfCheckCommands: string[];
  sessionId?: string;
  directory?: string;
  context?: Record<string, unknown>;
}

export interface ReportRecoveryContextResult {
  sent: boolean;
  sessionId: string;
  message: string;
  error?: string;
}

interface ReportRecoveryContextOptions {
  client?: RecoveryReporterClient;
  audit?: AuditLogger;
}

const noOpAuditLogger: AuditLogger = {
  async log(): Promise<void> {
    return;
  },
};

const REDACTION_PATTERNS: RegExp[] = [
  /(password\s*[:=]\s*)([^\s,;]+)/giu,
  /(passwd\s*[:=]\s*)([^\s,;]+)/giu,
  /(token\s*[:=]\s*)([^\s,;]+)/giu,
  /(secret\s*[:=]\s*)([^\s,;]+)/giu,
  /(api[_-]?key\s*[:=]\s*)([^\s,;]+)/giu,
  /(opencode_server_password\s*[:=]\s*)([^\s,;]+)/giu,
];

export async function reportRecoveryContext(
  input: ReportRecoveryContextInput,
  options?: ReportRecoveryContextOptions
): Promise<ReportRecoveryContextResult> {
  const client = options?.client ?? opencodeClient;
  const audit = options?.audit ?? noOpAuditLogger;

  const failureReason = redactText(input.failureReason);
  const backupPath = redactText(input.backupPath);
  const nextActions = sanitizeList(input.nextActions);
  const selfCheckCommands = sanitizeList(input.selfCheckCommands);
  const context = input.context ? redactSensitiveFields(input.context) : undefined;
  const message = buildRecoveryMessage({
    failureType: input.failureType,
    failureReason,
    backupPath,
    nextActions,
    selfCheckCommands,
    context,
  });

  let sessionId = (input.sessionId || '').trim();
  await logAuditSafe(audit, {
    action: 'recovery.report.attempt',
    result: 'success',
    metadata: {
      sessionId: sessionId || null,
      failureType: input.failureType,
      backupPath,
      hasContext: Boolean(context),
    },
  });

  if (!sessionId) {
    try {
      const session = await client.createSession(`Recovery ${input.failureType}`, input.directory);
      sessionId = session.id;
    } catch (error) {
      const errorMessage = normalizeErrorMessage(error);
      await logAuditSafe(audit, {
        action: 'recovery.report.failed',
        result: 'failed',
        metadata: {
          stage: 'create_session',
          failureType: input.failureType,
          error: errorMessage,
        },
      });
      return {
        sent: false,
        sessionId: '',
        message,
        error: errorMessage,
      };
    }
  }

  try {
    await client.sendMessageAsync(sessionId, message, input.directory ? { directory: input.directory } : undefined);
    await logAuditSafe(audit, {
      action: 'recovery.report.sent',
      result: 'success',
      metadata: {
        sessionId,
        failureType: input.failureType,
        backupPath,
      },
    });
    return {
      sent: true,
      sessionId,
      message,
    };
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    await logAuditSafe(audit, {
      action: 'recovery.report.failed',
      result: 'failed',
      metadata: {
        stage: 'send_message',
        sessionId,
        failureType: input.failureType,
        error: errorMessage,
      },
    });
    return {
      sent: false,
      sessionId,
      message,
      error: errorMessage,
    };
  }
}

function buildRecoveryMessage(input: {
  failureType: FailureType;
  failureReason: string;
  backupPath: string;
  nextActions: string[];
  selfCheckCommands: string[];
  context?: Record<string, unknown>;
}): string {
  const nextActionText = input.nextActions.length > 0
    ? input.nextActions.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '1. 使用备份配置恢复并重启服务';
  const selfCheckText = input.selfCheckCommands.length > 0
    ? input.selfCheckCommands.map(command => `- ${command}`).join('\n')
    : '- npm run build\n- npm test';
  const contextText = input.context
    ? `\n\n附加上下文（已脱敏）：\n${JSON.stringify(input.context, null, 2)}`
    : '';

  return [
    '恢复后修复上下文（自动下发）',
    '',
    `- failureType: ${input.failureType}`,
    `- 故障原因(failureReason): ${input.failureReason}`,
    `- 备份配置路径(backupPath): ${input.backupPath}`,
    '- nextAction（建议还原动作）:',
    nextActionText,
    '- 自检指令:',
    selfCheckText,
  ].join('\n') + contextText;
}

function sanitizeList(items: string[]): string[] {
  return items
    .map(item => redactText(item).trim())
    .filter(item => item.length > 0);
}

function redactText(input: string): string {
  let result = input;
  for (const pattern of REDACTION_PATTERNS) {
    result = result.replace(pattern, '$1***');
  }
  return result;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function logAuditSafe(
  audit: AuditLogger,
  input: {
    action: string;
    result: 'success' | 'failed';
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await audit.log({
      incidentId: generateIncidentId(),
      classification: 'system',
      decision: 'create',
      action: input.action,
      result: input.result,
      timestamp: new Date().toISOString(),
      metadata: input.metadata,
    });
  } catch (error) {
    console.error('[recovery-reporter] audit write failed:', error instanceof Error ? error.message : String(error));
    // 审计日志失败不应影响主流程。
  }
}
