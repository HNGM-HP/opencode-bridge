# OpenCode Bridge 桌面应用开发计划

## 项目目标
将 OpenCode Bridge 从 CLI 应用转换为完整的桌面应用（Electron），支持 Windows 和 macOS。

## 架构设计

```
最终产物:
├── OpenCode Bridge Setup.exe    # Windows 安装器 (~100MB)
├── OpenCode Bridge.dmg          # macOS 磁盘镜像 (~120MB)
└── 或便携版 ZIP/文件夹

应用结构:
/opencode-bridge-desktop/
├── electron/                    # Electron 专用代码
│   ├── main.ts                 # 主进程入口
│   ├── preload.ts              # 渲染进程桥接
│   ├── tray.ts                 # 托盘图标管理
│   ├── updater.ts              # 自动更新逻辑
│   └── menu.ts                 # 应用菜单
├── src/                        # 原有后端代码（保持不变）
├── web/                        # 原有前端代码（保持不变）
├── electron-builder.yml        # 打包配置
└── package.json                # 更新后的依赖
```

---

## Phase 1: 初始化 Electron 项目结构 ✅

### 1.1 添加 Electron 依赖
- [x] 安装 electron, electron-builder, electron-rebuild
- [x] 配置 package.json build 字段

### 1.2 创建主进程入口
- [x] 创建 electron/main.ts
  - 启动 Express 服务器（复用现有 admin-server）
  - 创建 BrowserWindow 加载 Web 面板
  - 管理窗口生命周期
- [x] 创建 electron/preload.ts
  - 暴露安全 API 给渲染进程
  - 文件对话框、系统通知等

### 1.3 调整构建流程
- [x] 添加 npm scripts: dev:electron, build:electron, dist, dist:win, dist:mac
- [x] 配置 tsconfig.electron.json
- [x] 创建 installer.nsh (Windows 安装器自定义)

### 1.4 CI/CD 配置
- [x] 创建 .github/workflows/build-release.yml

### 完成标准
- [x] 项目结构已建立
- [ ] electron:dev 可以启动开发模式（待安装依赖后验证）
- [ ] 窗口正常显示 Web 面板（待验证）

---

## Phase 2: 原生模块适配 (better-sqlite3) ✅

### 2.1 配置 electron-rebuild
- [x] 添加 npm run rebuild 脚本
- [x] 配置 package.json rebuild 命令

### 2.2 数据目录适配
- [x] 使用 app.getPath('userData') 作为数据目录
- [x] 通过 OPENCODE_BRIDGE_CONFIG_DIR 环境变量传递给后端
- [x] 设置后端进程的 cwd 为用户数据目录

### 完成标准
- [x] 数据目录已正确配置
- [ ] 应用启动时 SQLite 数据库正常初始化（待验证）
- [ ] 无原生模块加载错误（待验证）

---

## Phase 3: 托盘图标 + 窗口管理 + 系统集成 ✅

### 3.1 系统托盘
- [x] 创建托盘图标 (assets/icon.png)
- [x] 托盘菜单：显示窗口、打开数据目录、重启服务、退出
- [x] 最小化到托盘行为

### 3.2 窗口管理
- [x] 单实例锁（防止多开）
- [x] 关闭按钮行为：最小化到托盘
- [x] 点击托盘显示窗口

### 3.3 系统集成
- [x] 开机自启选项（installer.nsh）
- [x] 用户数据目录隔离
- [x] 打开数据目录菜单项

### 完成标准
- [x] 托盘图标已配置
- [x] 窗口行为已配置
- [x] 单实例锁已实现

---

## Phase 4: 安装器 + 自动更新 ✅

### 4.1 Windows 安装器
- [x] 配置 NSIS 安装脚本 (package.json build.nsis)
- [x] 安装向导界面（非一键安装）
- [x] 开始菜单快捷方式
- [x] 卸载程序
- [x] 开机自启选项 (installer.nsh)

### 4.2 自动更新
- [x] 集成 electron-updater
- [x] 配置 GitHub Releases 发布源
- [x] 更新检查逻辑（启动时检查）
- [x] 更新提示和下载进度

### 4.3 构建流程
- [x] CI/CD 配置（GitHub Actions）
- [x] 自动构建 Windows/macOS/Linux
- [x] 版本号管理（使用 package.json version）

### 完成标准
- [x] NSIS 配置完成
- [x] electron-updater 已配置
- [x] GitHub Actions 工作流已创建

---

## Phase 5: macOS 适配 ✅

### 5.1 macOS 特定配置
- [x] DMG 打包配置 (package.json build.mac/build.dmg)
- [x] 应用图标 (assets/icon-1024.png → 自动转换为 .icns)
- [x] Info.plist 配置 (extendInfo)

### 5.2 macOS 行为适配
- [x] 关闭窗口时不退出应用（隐藏到 Dock）
- [x] 支持 Apple Silicon (arm64) 和 Intel (x64)

### 完成标准
- [x] DMG 配置完成
- [x] 支持 x64 和 arm64 架构
- [ ] 用户可以右键打开（未签名提示）- 需在 macOS 上测试

---

## 技术决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 打包工具 | electron-builder | 成熟、社区活跃、支持双平台 |
| 更新机制 | electron-updater + GitHub Releases | 免费、简单、无需自建服务器 |
| 安装器 (Windows) | NSIS | electron-builder 内置、功能完整 |
| 安装器 (macOS) | DMG | macOS 标准、无需签名 |

---

## 依赖清单

```json
{
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "@electron/rebuild": "^3.6.0"
  },
  "dependencies": {
    "electron-updater": "^6.3.0"
  }
}
```

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| package.json | 修改 | 添加 Electron 依赖和脚本 |
| electron/main.ts | 新建 | 主进程入口 |
| electron/preload.ts | 新建 | 渲染进程桥接 |
| electron/tray.ts | 新建 | 托盘管理 |
| electron-builder.yml | 新建 | 打包配置 |
| assets/icon.png | 新建 | 应用图标 |
| .github/workflows/build.yml | 新建 | CI/CD 配置 |