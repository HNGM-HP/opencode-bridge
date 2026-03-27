/**
 * Electron 主进程
 *
 * 职责：
 * - 启动后端服务（作为子进程）
 * - 创建应用窗口
 * - 系统托盘图标
 * - 自动更新检查
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from 'electron';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { autoUpdater } from 'electron-updater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 后端服务进程
let backendProcess: ChildProcess | null = null;
// 主窗口
let mainWindow: BrowserWindow | null = null;
// 托盘图标
let tray: Tray | null = null;

// 开发模式检测
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 后端服务端口（默认 3000）
const BACKEND_PORT = parseInt(process.env.PORT || '3000', 10);

// 获取用户数据目录
function getUserDataPath(): string {
  // 在打包后，使用 Electron 的 userData 目录
  // Windows: %APPDATA%/opencode-bridge
  // macOS: ~/Library/Application Support/opencode-bridge
  // Linux: ~/.config/opencode-bridge
  return app.getPath('userData');
}

/**
 * 启动后端服务
 */
function startBackend() {
  if (backendProcess) {
    return;
  }

  const backendPath = isDev
    ? path.join(__dirname, '../../dist/index.js')
    : path.join(process.resourcesPath, 'app/dist/index.js');

  const dataPath = getUserDataPath();
  console.log('[Electron] Data directory:', dataPath);
  console.log('[Electron] Starting backend from:', backendPath);

  backendProcess = spawn(process.execPath, [backendPath], {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      ELECTRON_RUN_AS_NODE: '1',
      // 设置配置目录为用户数据目录
      OPENCODE_BRIDGE_CONFIG_DIR: dataPath,
      // 设置工作目录
      NODE_ENV: isDev ? 'development' : 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: dataPath, // 设置工作目录
  });

  backendProcess.stdout?.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    console.error(`[Backend Error] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] Exited with code ${code}`);
    backendProcess = null;
  });
}

/**
 * 停止后端服务
 */
function stopBackend() {
  if (backendProcess) {
    console.log('[Electron] Stopping backend...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'OpenCode Bridge',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // 先隐藏，加载完成后显示
  });

  // 开发模式下打开 DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 加载前端页面
  const frontendUrl = `http://localhost:${BACKEND_PORT}`;
  mainWindow.loadURL(frontendUrl);

  // 窗口准备就绪时显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 关闭窗口时最小化到托盘而非退出
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 创建托盘图标
 */
function createTray() {
  const iconPath = isDev
    ? path.join(__dirname, '../assets/icon-256.png')
    : path.join(process.resourcesPath, 'app/assets/icon-256.png');

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: '打开管理面板',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '重启服务',
      click: () => {
        stopBackend();
        setTimeout(() => startBackend(), 1000);
      },
    },
    {
      label: '打开数据目录',
      click: () => {
        shell.openPath(getUserDataPath());
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('OpenCode Bridge');
  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

/**
 * 检查更新
 */
function checkForUpdates() {
  if (isDev) {
    console.log('[Electron] Skipping update check in development mode');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否立即下载？`,
      buttons: ['下载', '稍后提醒'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '更新已下载',
      message: `版本 ${info.version} 已下载完成，是否立即安装？`,
      buttons: ['立即安装', '稍后安装'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('[Electron] Update error:', error);
  });

  // 启动时检查更新
  autoUpdater.checkForUpdates();
}

// 单实例锁：防止多开
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // 当运行第二个实例时，聚焦到已有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 应用就绪
  app.whenReady().then(() => {
    // 启动后端服务
    startBackend();

    // 等待后端启动后创建窗口
    setTimeout(() => {
      createWindow();
      createTray();

      // 检查更新（非开发模式）
      checkForUpdates();
    }, 2000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  app.isQuitting = true;
  stopBackend();
});

// 导出类型声明
declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}