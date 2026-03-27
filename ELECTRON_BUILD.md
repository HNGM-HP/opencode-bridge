# Electron 桌面应用构建指南

## 前置要求

### Windows 构建
- Node.js 20+
- Visual Studio Build Tools (用于编译原生模块)
- Python 3

### macOS 构建
- Node.js 20+
- Xcode Command Line Tools
- Python 3

### Linux 构建
- Node.js 20+
- build-essential
- Python 3

## 开发模式

```bash
# 1. 安装依赖
npm install

# 2. 构建后端
npm run build

# 3. 构建前端
npm run build:web

# 4. 构建 Electron 主进程
npm run build:electron

# 5. 重构原生模块
npm run rebuild

# 6. 启动 Electron 开发模式
npm run dev:electron
```

## 生产构建

### 本地构建

```bash
# 构建全部
npm run build:all

# 重构原生模块
npm run rebuild

# 打包 Windows
npm run dist:win

# 打包 macOS
npm run dist:mac

# 打包 Linux
npm run dist:linux
```

### CI/CD 构建 (GitHub Actions)

1. 创建并推送 Git 标签：
   ```bash
   git tag v2.9.53
   git push origin v2.9.53
   ```

2. GitHub Actions 会自动构建并发布到 Releases

## 文件结构

```
opencode-bridge/
├── electron/                 # Electron 专用代码
│   ├── main.ts              # 主进程
│   └── preload.ts           # 预加载脚本
├── src/                     # 后端源码
├── web/                     # 前端源码
├── assets/                  # 应用图标
│   ├── icon.png            # 512x512
│   ├── icon-256.png        # 256x256
│   ├── icon-1024.png       # 1024x1024 (macOS)
│   └── icon.ico            # Windows 图标
├── dist/                    # 后端构建产物
│   └── public/             # 前端构建产物
├── dist-electron/           # Electron 构建产物
└── release/                 # 最终安装包
```

## 用户数据目录

应用数据存储在系统用户数据目录：

- **Windows**: `%APPDATA%\opencode-bridge\`
- **macOS**: `~/Library/Application Support/opencode-bridge/`
- **Linux**: `~/.config/opencode-bridge/`

包含：
- `data/config.db` - 配置数据库
- 日志文件
- 会话数据

## 自动更新

应用启动时会自动检查更新。新版本会发布到 GitHub Releases。

## 注意事项

1. **原生模块**: `better-sqlite3` 需要针对目标平台重新编译
2. **macOS 签名**: 当前未签名，用户需要右键打开应用
3. **Windows Defender**: 可能提示"未识别的应用"，用户需选择"仍要运行"