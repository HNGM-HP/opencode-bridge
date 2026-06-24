import { VERSION } from '../utils/version.js';
import { initLogger } from '../utils/logger.js';
import { logStore } from '../store/log-store.js';
import { createAdminServer } from '../admin/admin-server.js';
import { feishuClient } from '../feishu/client.js';
import { loadAllConfigured, getSenderByPlatform, getCachedAdapter, getConfiguredPlatforms, clearCache } from '../platform/loader.js';
import { opencodeClient, type PermissionRequestEvent } from '../opencode/client.js';
import { streamStateManager, type ToolRuntimeState, type TimelineSegment, type StreamTimelineState } from '../store/stream-state.js';
import { buildPortableUpdatePayload } from '../utils/text-builder.js';

import { outputBuffer } from '../opencode/output-buffer.js';
import { delayedResponseHandler } from '../opencode/delayed-handler.js';
import { questionHandler } from '../opencode/question-handler.js';
import { permissionHandler } from '../permissions/handler.js';
import { chatSessionStore, type InteractionRecord } from '../store/chat-session.js';
import { validateConfig, routerConfig, opencodeConfig } from '../config.js';
import { rootRouter } from '../router/root-router.js';
import { bootstrapReliabilityLifecycle, type ReliabilityLifecycle } from '../reliability/bootstrap.js';
import { createGracefulShutdown } from './shutdown.js';
import { setupPlatformListeners, startPlatformAdapters } from './platform-setup.js';
import { registerBufferCallback, type BufferCallbackDependencies } from './buffer-callback.js';
import { createPermissionActionCallbacks, createQuestionActionCallbacks } from '../router/action-handlers.js';
import { openCodeEventHub } from '../router/opencode-event-hub.js';
import {
  buildStreamCards,
  type StreamCardData,
  type StreamCardSegment,
  type StreamCardPendingPermission,
  type StreamCardPendingQuestion,
} from '../feishu/cards-stream.js';
import {
  getPendingPermissionForChat,
  getOrCreateTimelineState,
  trimTimeline,
  upsertTimelineSegment,
  appendTimelineText,
  setTimelineText,
  upsertTimelineTool,
  upsertTimelineNote,
  getTimelineSegments,
  getPendingQuestionForBuffer,
  toSessionId,
  toNonEmptyString,
  setToolCallCorrelation,
  setMessageCorrelation,
  getToolCallCorrelation,
  getMessageCorrelation,
  setCorrelationChatRef,
  getCorrelationChatRef,
  resolvePermissionChat,
  resolveSessionConversation,
  buildBufferKeyBySession,
  buildPermissionQueueKeyBySession,
  normalizeToolStatus,
  getToolStatusText,
  stringifyToolOutput,
  asRecord,
  pickFirstDefined,
  buildToolTraceOutput,
  clipToolTrace,
  mergeToolOutput,
  getOrCreateToolStateBucket,
  syncToolsToBuffer,
  upsertToolState,
  markActiveToolsCompleted,
  appendTextFromPart,
  appendReasoningFromPart,
  clearPartSnapshotsForSession,
  formatProviderError,
  upsertLiveCardInteraction,
  applyFailureToSession,
} from './main-helpers.js';

export async function main(
  runningInstanceRef: { current: { stop: () => Promise<void> } | null }
): Promise<{ stop: () => Promise<void> }> {
  // 初始化日志收集器（最早执行，捕获所有后续日志）
  initLogger(logStore);

  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   飞书 × OpenCode 桥接服务 v' + VERSION + '     ║');
  console.log('╚════════════════════════════════════════════════╝');

  // 0. 动态加载已配置的平台适配器（避免全量加载 SDK）
  const configuredPlatforms = getConfiguredPlatforms();
  console.log(`[Platform] 已配置的平台: ${configuredPlatforms.join(', ') || '无'}`);
  await loadAllConfigured();

  // 1. 如果启用了 OpenCode 自动启动，通过 process-manager 幂等启动后台服务
  if (opencodeConfig.autoStart) {
    try {
      console.log('[Index] 正在启动 OpenCode serve（后台模式）...');
      const { spawnSync, spawn } = await import('node:child_process');
      const { fileURLToPath } = await import('node:url');
      const pathMod = await import('node:path');
      const isWindows = process.platform === 'win32';

      // 确定 process-manager 路径（兼容开发/打包两种环境）
      // 开发模式检测（process.resourcesPath 是 Electron 特有属性）
      const isDev = process.env.NODE_ENV === 'development' || !(process as any).resourcesPath;
      let processManagerPath: string;
      if ((process as any).resourcesPath && !isDev) {
        // Electron 打包后：scripts 在 resources/app/scripts/
        processManagerPath = pathMod.join((process as any).resourcesPath, 'app', 'scripts', 'process-manager.mjs');
      } else {
        // 开发环境：src/index.ts 位于项目根下的 src/；构建后：dist/index.js 位于项目根下的 dist/
        // 这两种布局到项目根的相对层级一致，因此统一回退一层即可定位 scripts/。
        const selfDir = pathMod.dirname(fileURLToPath(import.meta.url));
        processManagerPath = pathMod.resolve(selfDir, '../scripts/process-manager.mjs');
      }

      // 检查 process-manager 是否存在
      console.log(`[Index] process-manager 路径: ${processManagerPath}`);

      // 使用 start-opencode（幂等：已在运行则跳过）
      const startResult = spawnSync(process.execPath, [processManagerPath, 'start-opencode'], {
        encoding: 'utf-8',
        windowsHide: isWindows,
        timeout: 15000,
        stdio: 'pipe',
      });

      if (startResult.stdout?.trim()) {
        console.log('[Index] OpenCode 启动输出:', startResult.stdout.trim());
      }
      if (startResult.stderr?.trim()) {
        console.warn('[Index] OpenCode 启动错误:', startResult.stderr.trim());
      }

      if (startResult.status !== 0) {
        console.error(`[Index] OpenCode 自动启动失败，退出码: ${startResult.status}（将继续启动 Bridge）`);
        if (startResult.error) {
          console.error('[Index] 错误详情:', startResult.error.message);
        }
      } else {
        console.log('[Index] OpenCode serve 启动成功');
      }

      // 如果开启了前台模式，等待 opencode serve 的端口就绪后再弹出 attach 窗口（Windows 专用）
      // 做法：
      //   1. 轮询 TCP（最多 15s），等待 http://localhost:<port> 可连接
      //   2. 通过 PowerShell 的 Start-Process 拉起一个新的可见 CMD 控制台跑 opencode attach
      //      —— 不能再用 `cmd /c start ... + windowsHide:true`：父进程无 console 时
      //         CREATE_NO_WINDOW 会传染到 start，导致弹窗失败。
      //         核心约束：后台 opencode serve 由 process-manager 用 Start-Process -WindowStyle Hidden
      //         启动且不能弹任何 CMD，本块只影响"前台 attach 窗口"，与之相互独立。
      if (opencodeConfig.autoStartForeground && isWindows) {
        void (async () => {
          const { probeTcpPort } = await import('../reliability/process-guard.js');
          const host = opencodeConfig.host;
          const port = opencodeConfig.port;
          const attachUrl = `http://${host}:${port}`;
          const deadline = Date.now() + 15000;

          let ready = false;
          while (Date.now() < deadline) {
            const probe = await probeTcpPort(host, port, 1000);
            if (probe.isOpen) {
              ready = true;
              break;
            }
            await new Promise(r => setTimeout(r, 500));
          }

          if (!ready) {
            console.warn(`[Index] OpenCode serve 端口未就绪（${attachUrl}），跳过前台 attach 窗口`);
            return;
          }

          try {
            spawn(
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `Start-Process cmd -ArgumentList '/k opencode attach ${attachUrl}'`,
              ],
              {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
              }
            ).unref();
            console.log(`[Index] OpenCode 前台窗口已拉起（${attachUrl}）`);
          } catch (err) {
            console.warn('[Index] 拉起 OpenCode 前台窗口失败:', err);
          }
        })();
      }
    } catch (error) {
      console.warn('[Index] 启动 OpenCode 失败:', error);
    }
  }

  // 注册进程退出时的清理逻辑（后台 opencode serve 由 process-manager 独立管理，不在此清理）
  const cleanupChildProcess = () => {
    // 已迁移到 process-manager 管理，此处保留钩子供将来扩展
  };

  process.on('exit', cleanupChildProcess);
  // SIGINT/SIGTERM 由下方 gracefulShutdown 统一处理，不在此重复注册
  // （重复注册会导致 process.exit(0) 跳过异步清理）

  // 3. 验证配置
  try {
    validateConfig();
  } catch (error) {
    console.warn('[Config] ⚠️ 未检测到已配置的平台（可能是首次部署），机器人服务暂不拉起。');
    console.warn('[Config] 💡 核心管理后台即将启动，请前往 Web 控制台配置相关参数并按提示重启服务生效！');
    console.warn(`[Config] 详细信息: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 1.5. 路由器模式配置
  console.log(`[Config] 路由器模式: ${routerConfig.mode}`);
  if (routerConfig.enabledPlatforms.length > 0) {
    console.log(`[Config] 启用的平台: ${routerConfig.enabledPlatforms.join(', ')}`);
  } else {
    console.log(`[Config] 平台过滤: 未指定（所有平台可用）`);
  }
  if (routerConfig.mode === 'dual') {
    console.log(`[Config] ⚠️  双轨模式: 将记录新旧路由对比日志，不改变当前行为`);
    console.log(`[Config] 📝 如需回滚到旧版路由，设置 ROUTER_MODE=legacy 并重启服务`);
  }

  // 2. 先启动 Admin Server（确保管理面板可用，即使 OpenCode 未运行）
  // 若 TUI 配置 WEB_ADMIN_DISABLED=true 或运行时 env BRIDGE_DISABLE_ADMIN=1，
  // 则跳过 admin server 启动 —— 平台适配器仍会正常工作（仅 web 不可用）。
  const { configStore: _cs } = await import('../store/config-store.js');
  const _adminDisabledByCfg = (_cs.get().WEB_ADMIN_DISABLED ?? '') === 'true';
  const _adminDisabledByEnv = process.env.BRIDGE_DISABLE_ADMIN === '1';
  const adminDisabled = _adminDisabledByCfg || _adminDisabledByEnv;
  if (!process.env.BRIDGE_SPAWNED_BY_ADMIN && !adminDisabled) {
    const adminPort = parseInt(process.env.ADMIN_PORT ?? _cs.get().ADMIN_PORT ?? '4098', 10);
    const adminServer = createAdminServer({
      port: adminPort,
      cronManager: undefined, // cronManager 在后面初始化
      startedAt: new Date(),
      version: VERSION,
    });
    adminServer.start();
    console.log(`[Admin] 管理面板已启动: http://localhost:${adminPort}`);
  } else if (adminDisabled) {
    console.log('[Admin] Web 管理面板已通过配置禁用（接入平台仍正常运行）');
  }

  // 3. 连接 OpenCode（失败不退出，允许用户在管理面板中诊断）
  const connected = await opencodeClient.connect();
  if (!connected) {
    console.warn('[OpenCode] ⚠️ 无法连接到服务器，请确保 opencode serve 已运行');
    console.warn('[OpenCode] 💡 管理面板已启动，请在浏览器中配置并诊断');
  }

  // 注入动作处理回调到 RootRouter
  rootRouter.setPermissionCallbacks(createPermissionActionCallbacks(upsertTimelineNote));
  rootRouter.setQuestionCallbacks(createQuestionActionCallbacks());

  // 注册输出缓冲回调（委托给 buffer-callback 模块）
  const bufferCbDeps: BufferCallbackDependencies = {
    getTimelineSegments,
    resolveSessionConversation,
    buildPermissionQueueKeyBySession,
    getPendingPermissionForChat,
    getPendingQuestionForBuffer,
    clearPartSnapshotsForSession,
    upsertLiveCardInteraction,
  };
  registerBufferCallback(bufferCbDeps);

  // 3.5 初始化 Reliability 生命周期（heartbeat + scheduler + rescue orchestrator）
  const reliabilityLifecycle = bootstrapReliabilityLifecycle();

  // 4-7. 注册各平台事件监听器（委托给 platform-setup 模块）
  const { onFeishuMessage, onFeishuChatUnavailable } = setupPlatformListeners(reliabilityLifecycle);


  // 6. OpenCode 事件监听已移至 openCodeEventHub（单一入口）

  // 6.5 注入事件处理上下文到 OpenCode Event Hub
  openCodeEventHub.setContext({
    streamStateManager,
    toSessionId,
    toNonEmptyString,
    setToolCallCorrelation,
    setMessageCorrelation,
    getToolCallCorrelation,
    getMessageCorrelation,
    resolvePermissionChat,
    normalizeToolStatus,
    getToolStatusText,
    stringifyToolOutput,
    asRecord,
    pickFirstDefined,
    buildToolTraceOutput,
    clipToolTrace,
    mergeToolOutput,
    getOrCreateToolStateBucket,
    syncToolsToBuffer,
    upsertToolState,
    markActiveToolsCompleted,
    appendTextFromPart,
    appendReasoningFromPart,
    clearPartSnapshotsForSession,
    formatProviderError,
    upsertLiveCardInteraction,
    getTimelineSegments,
    getPendingPermissionForChat,
    getPendingQuestionForBuffer,
    applyFailureToSession,
    upsertTimelineNote,
    appendTimelineText,
    setTimelineText,
    upsertTimelineTool,
  });

  // 注册 OpenCode 事件监听器（单一入口）
  openCodeEventHub.register();

  // 7-9. 启动各平台适配器（委托给 platform-setup 模块）
  await startPlatformAdapters();

  console.log('✅ 服务已就绪');

  // 优雅退出处理（委托给 lifecycle/shutdown 模块）
  const { shutdown, signalHandlers } = createGracefulShutdown({
    reliabilityLifecycle,
    feishuClient,
    opencodeClient,
    getCachedAdapter,
    clearCache,
    outputBuffer,
    delayedResponseHandler,
    questionHandler,
    onFeishuMessage,
    onFeishuChatUnavailable,
    runningInstanceRef,
  });

  process.on('SIGINT', signalHandlers.sigintHandler);
  process.on('SIGTERM', signalHandlers.sigtermHandler);
  process.on('SIGUSR2', signalHandlers.sigusr2Handler);

  // 返回停止函数，供进程合并模式下使用
  return {
    stop: () => shutdown('EMBEDDED_STOP'),
  };
}
