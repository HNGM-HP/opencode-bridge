/**
 * Graceful Shutdown — 优雅退出处理器
 *
 * 封装服务关闭流程：可靠性资源清理、平台适配器停止、事件监听解除等。
 * 通过依赖注入解耦，方便测试和内嵌模式复用。
 */

export interface GracefulShutdownDependencies {
  reliabilityLifecycle: { cleanup: () => Promise<void> };
  feishuClient: { stop: () => void; off: (event: string, handler: (...args: any[]) => void) => void };
  opencodeClient: { disconnect: () => void };
  getCachedAdapter: (platform: string) => { stop: () => void } | null;
  clearCache: () => void;
  outputBuffer: { clearAll: () => void };
  delayedResponseHandler: { cleanupExpired: (ms: number) => void };
  questionHandler: { cleanupExpired: (ms: number) => void };
  onFeishuMessage: (...args: any[]) => void;
  onFeishuChatUnavailable: (...args: any[]) => void;
  runningInstanceRef: { current: { stop: () => Promise<void> } | null };
}

export interface GracefulShutdownResult {
  shutdown: (signal: string) => Promise<void>;
  signalHandlers: {
    sigintHandler: () => void;
    sigtermHandler: () => void;
    sigusr2Handler: () => void;
  };
}

export function createGracefulShutdown(
  deps: GracefulShutdownDependencies
): GracefulShutdownResult {
  const {
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
  } = deps;

  // 优雅退出处理
  let shuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    // 内嵌模式下（Admin 进程内 Bridge 重启）不能让整个进程退出，
    // 否则 Admin HTTP 服务一并被杀，导致"立即重启"实际只关闭不启动。
    const isEmbeddedStop = signal === 'EMBEDDED_STOP';

    console.log(`\n[${signal}] 正在关闭服务...`);

    // 1. OpenCode serve 由 process-manager 独立管理，Bridge 关闭时不自动终止它
    //    （如需完全关闭，可通过 Web 面板"终止服务"或 stop.mjs --with-opencode）

    // 2. 停止 reliability 调度和救援资源
    try {
      await reliabilityLifecycle.cleanup();
    } catch (e) {
      console.error('停止 reliability 资源失败:', e);
    }

    // 3. 停止各平台适配器（仅停止已加载的）
    const adaptersToStop = [
      { platform: 'discord', name: 'Discord' },
      { platform: 'wecom', name: '企业微信' },
      { platform: 'telegram', name: 'Telegram' },
      { platform: 'qq', name: 'QQ' },
      { platform: 'whatsapp', name: 'WhatsApp' },
      { platform: 'weixin', name: '个人微信' },
      { platform: 'dingtalk', name: '钉钉' },
    ];

    for (const { platform, name } of adaptersToStop) {
      const adapter = getCachedAdapter(platform);
      if (adapter) {
        try {
          adapter.stop();
        } catch (e) {
          console.error(`[${name}] 停止适配器失败:`, e);
        }
      }
    }

    // 4. 停止飞书连接
    try {
      feishuClient.stop();
    } catch (e) {
      console.error('[飞书] 停止连接失败:', e);
    }

    // 5. 断开 OpenCode 连接
    try {
      opencodeClient.disconnect();
    } catch (e) {
      console.error('[OpenCode] 断开连接失败:', e);
    }

    // 6. 清理所有缓冲区和定时器
    try {
      outputBuffer.clearAll();
      delayedResponseHandler.cleanupExpired(0);
      questionHandler.cleanupExpired(0);
    } catch (e) {
      console.error('[System] 清理资源失败:', e);
    }

    // 7. 清理本轮 main() 注册到 feishuClient 的 EventEmitter 监听，避免 embedded restart 叠加
    try {
      feishuClient.off('message', onFeishuMessage);
      feishuClient.off('chatUnavailable', onFeishuChatUnavailable);
    } catch (e) {
      console.error('[飞书] 清理事件监听失败:', e);
    }

    // 8. 清理平台适配器缓存，避免重启后复用旧实例导致 callback 累积
    try {
      clearCache();
    } catch (e) {
      console.error('[PlatformLoader] 清理适配器缓存失败:', e);
    }

    if (isEmbeddedStop) {
      // 内嵌模式：不退出进程，只清理本次 main() 注册的信号监听器，
      // 并重置 runningInstance，保证下一次 startBridge() 会真正重新启动。
      try {
        process.off('SIGINT', sigintHandler);
        process.off('SIGTERM', sigtermHandler);
        process.off('SIGUSR2', sigusr2Handler);
      } catch { /* ignore */ }
      runningInstanceRef.current = null;
      console.log('✅ 服务已安全关闭（内嵌模式，保留 Admin 进程）');
      return;
    }

    // 延迟退出以确保所有清理完成
    setTimeout(() => {
      console.log('✅ 服务已安全关闭');
      process.exit(0);
    }, 500);
  };

  const sigintHandler = () => { void gracefulShutdown('SIGINT'); };
  const sigtermHandler = () => { void gracefulShutdown('SIGTERM'); };
  const sigusr2Handler = () => { void gracefulShutdown('SIGUSR2'); }; // nodemon 重启信号

  return {
    shutdown: gracefulShutdown,
    signalHandlers: {
      sigintHandler,
      sigtermHandler,
      sigusr2Handler,
    },
  };
}
