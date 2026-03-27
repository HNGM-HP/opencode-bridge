/**
 * Electron Preload 脚本
 *
 * 在渲染进程中安全地暴露 Node.js API
 */

import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,

  // 应用版本
  version: process.env.npm_package_version || 'unknown',

  // 系统操作
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // 应用控制
  quit: () => ipcRenderer.invoke('app-quit'),
  restart: () => ipcRenderer.invoke('app-restart'),

  // 更新相关
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // 事件监听
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-downloaded', (_, info) => callback(info));
  },
});

// 类型声明
export interface ElectronAPI {
  platform: NodeJS.Platform;
  version: string;
  openExternal: (url: string) => Promise<void>;
  quit: () => Promise<void>;
  restart: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}