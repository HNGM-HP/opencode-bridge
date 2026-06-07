// ── Reliability system ─────────────────────────────
export { bootstrapReliabilityLifecycle } from './reliability/bootstrap.js';
export type {
  ReliabilityLifecycleDependencies,
  ReliabilityJobHandlers,
  ReliabilityScheduler,
  ReliabilityLifecycle,
} from './reliability/bootstrap.js';
export type { ReliabilityRescueOrchestrator } from './reliability/rescue-orchestrator.js';

// ── Handler types ──────────────────────────────────
export type { PermissionDecision as DiscordPermissionDecision } from './handlers/discord-types.js';
export type { PermissionDecision as DingtalkPermissionDecision } from './handlers/dingtalk-types.js';
export type { PermissionDecision as QqPermissionDecision } from './handlers/qq-types.js';
export type { PermissionDecision as TelegramPermissionDecision } from './handlers/telegram-types.js';
export type { PermissionDecision as WecomPermissionDecision } from './handlers/wecom-types.js';
export type { PermissionDecision as WeixinPermissionDecision } from './handlers/weixin-types.js';
export type { PermissionDecision as WhatsappPermissionDecision } from './handlers/whatsapp-types.js';
export type { OpencodeFilePartInput, OpencodePartInput } from './handlers/whatsapp-types.js';
export type { SendFileRequest, SendFileResult, FeishuFileType } from './handlers/file-sender-types.js';
export type { CleanupStats } from './handlers/lifecycle-types.js';
export type { QuestionSkipActionResult } from './handlers/group-types.js';
export type { EnsurePrivateSessionResult } from './handlers/p2p-types.js';
export type { ProviderModelMeta, EffortSupportInfo } from './handlers/command-types.js';

// ── Handler constants ──────────────────────────────
export { FEISHU_IMAGE_MAX_SIZE, FEISHU_FILE_MAX_SIZE } from './handlers/file-sender-types.js';
export { CREATE_CHAT_OPTION_LIMIT, CREATE_CHAT_EXISTING_LIMIT } from './handlers/p2p-types.js';

// ── Handler utils ──────────────────────────────────
export { parsePermissionDecision as parseDingtalkPermissionDecision } from './handlers/dingtalk-utils.js';
export { parsePermissionDecision as parseWhatsappPermissionDecision } from './handlers/whatsapp-utils.js';
export { validateFilePath, isImageExtension, getFeishuFileType } from './handlers/file-sender-utils.js';

// ── Adapter types / utils ──────────────────────────
export { mapMessageEvent, mapActionEvent } from './platform/adapters/feishu-adapter-utils.js';

// ── Bridge control（供进程合并模式使用）───────────────
import { main } from './lifecycle/main.js';

const runningInstanceRef: { current: { stop: () => Promise<void> } | null } = { current: null };

export async function startBridge(): Promise<{ stop: () => Promise<void> }> {
  if (runningInstanceRef.current) {
    console.log('[Bridge] Already running');
    return runningInstanceRef.current;
  }
  runningInstanceRef.current = await main(runningInstanceRef);
  return runningInstanceRef.current;
}

export async function stopBridge(): Promise<void> {
  if (runningInstanceRef.current) {
    await runningInstanceRef.current.stop();
    runningInstanceRef.current = null;
  }
}

if (
  process.env.VITEST !== 'true' &&
  process.env.BRIDGE_EMBEDDED_MODE !== '1' &&
  process.env.BRIDGE_CLI_MODE !== '1'
) {
  main(runningInstanceRef).catch(error => {
    console.error('Fatal Error:', error);
    process.exit(1);
  });
}
