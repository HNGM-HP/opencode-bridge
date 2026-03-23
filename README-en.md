# OpenCode Bridge

[![v2.9.5](https://img.shields.io/badge/v2.9.5-3178C6)]()
[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**[中文](README.md) | [English](README-en.md)**

---

> **OpenCode Bridge** is an enterprise-grade AI programming collaboration bridge service that seamlessly integrates OpenCode (AI coding assistant) with mainstream instant messaging platforms, enabling cross-platform, cross-device intelligent programming collaboration.

---

## 📱 Supported Platforms

| Platform | Status | Core Features |
|----------|--------|---------------|
| Feishu (Lark) | ✅ Full Support | Card interaction, streaming output, permission confirmation, file transfer, recall sync |
| Discord | ✅ Full Support | Component interaction, Embed messages, Slash commands, channel management |
| WeCom (Enterprise WeChat) | ✅ Full Support | Text interaction, message sending/receiving |
| Telegram | ✅ Full Support | Text interaction, Inline keyboard |
| QQ (OneBot) | ✅ Full Support | Text interaction, group chat support |
| WhatsApp | ✅ Full Support | Text interaction, media messages |
| WeChat (Personal) | ✅ Full Support | QR code login, text interaction |

---

## ✨ Key Features

### 🔄 Smart Session Management
- **Independent Session Binding**: Each group/private chat binds to an independent OpenCode session with isolated context
- **Session Migration**: Support session binding, migration, and renaming with context preserved across devices
- **Multi-Project Support**: Multiple project directory switching with alias configuration
- **Auto Cleanup**: Automatic cleanup of invalid sessions to prevent resource leaks

### 🤖 AI Interaction Capabilities
- **Streaming Output**: Real-time AI response display with thinking chain support
- **Permission Interaction**: AI permission requests confirmed within the chat platform
- **Question Answering**: AI questions answered within the chat platform
- **File Transfer**: AI can send files/screenshots to the chat platform
- **Shell Passthrough**: Whitelisted commands can be executed directly in chat

### 🛡️ Reliability Assurance
- **Heartbeat Monitoring**: Periodic OpenCode health probing
- **Auto Rescue**: Automatic restart and recovery when OpenCode crashes
- **Cron Tasks**: Runtime dynamic management of scheduled tasks
- **Log Auditing**: Complete operation logs and error tracking

### 🎛️ Web Management Panel
- **Visual Configuration**: Real-time modification of all configuration parameters in browser
- **Platform Management**: View connection status of each platform
- **Cron Management**: Create, enable/disable, delete scheduled tasks
- **Service Control**: View service status and remote restart

---

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/HNGM-HP/opencode-bridge.git
cd opencode-bridge
```

### 2. One-Click Deployment

**Linux/macOS:**
```bash
chmod +x ./scripts/deploy.sh
./scripts/deploy.sh guide
```

**Windows PowerShell:**
```powershell
.\scripts\deploy.ps1 guide
```

This command will automatically:
- Detect and guide Node.js installation
- Detect and guide OpenCode installation
- Install project dependencies and compile
- Generate initial configuration file

### 3. Start Service

**Linux/macOS:**
```bash
./scripts/start.sh
```

**Windows PowerShell:**
```powershell
.\scripts\start.ps1
```

**Development Mode:**
```bash
npm run dev
```

### 4. Configure Platform

After service starts, access the Web configuration panel:

```
http://localhost:4098
```

You will be prompted to set an administrator password on first access.

---

## 📝 Command Reference

### Feishu Commands

| Command | Description |
|---------|-------------|
| `/help` | View help |
| `/panel` | Open control panel (model, agent, effort) |
| `/model <provider:model>` | Switch model |
| `/agent <name>` | Switch Agent |
| `/effort <level>` | Set reasoning effort |
| `/session new` | Start new topic |
| `/session <sessionId>` | Bind existing session |
| `/undo` | Undo last interaction |
| `/compact` | Compress context |
| `/project list` | List available projects |
| `/send <path>` | Send file to group |
| `/cron ...` | Manage Cron tasks |
| `!<shell-cmd>` | Passthrough Shell command |

### Discord Commands

| Command | Description |
|---------|-------------|
| `///session` | View bound session |
| `///new` | Create and bind new session |
| `///bind <sessionId>` | Bind existing session |
| `///undo` | Undo last round |
| `///compact` | Compress context |
| `///workdir` | Set working directory |
| `///cron ...` | Manage Cron tasks |

### WeCom Commands

| Command | Description |
|---------|-------------|
| `/help` | View help |
| `/panel` | Open control panel |
| `/model <provider:model>` | Switch model |
| `/agent <name>` | Switch Agent |
| `/session new` | Start new topic |
| `/undo` | Undo last interaction |
| `/compact` | Compress context |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Platform Adapter Layer                    │
│  Feishu │ Discord │ WeCom │ Telegram │ QQ │ WhatsApp │ Weixin │
└────┬────────┬────────┬────────┬────────┬────────┬──────────┘
     │        │        │        │        │        │
     └────────┴────────┴────────┴────────┴────────┘
                        │
              ┌─────────▼─────────┐
              │     Router Layer      │
              │   RootRouter      │
              └─────────┬─────────┘
                        │
     ┌──────────────────┼──────────────────┐
     │                  │                  │
┌────▼────┐      ┌─────▼─────┐      ┌─────▼─────┐
│Permission│     │ Question  │      │ Output    │
│ Handler │      │ Handler   │      │ Buffer    │
└────┬────┘      └─────┬─────┘      └─────┬─────┘
     │                 │                  │
     └─────────────────┼──────────────────┘
                       │
             ┌─────────▼─────────┐
             │   OpenCode Integration   │
             │  OpencodeClient   │
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │   OpenCode CLI    │
             └───────────────────┘
```

---

## 📚 Documentation

### Core Documentation

| Document | Description |
|----------|-------------|
| [Architecture](assets/docs/architecture-en.md) | Project layered design and core module responsibilities |
| [Configuration](assets/docs/environment-en.md) | Complete configuration parameter reference |
| [Deployment](assets/docs/deployment-en.md) | Deployment, upgrade and systemd configuration |
| [Commands](assets/docs/commands-en.md) | Complete command list and usage |
| [Reliability](assets/docs/reliability-en.md) | Heartbeat, Cron and crash rescue configuration |
| [Troubleshooting](assets/docs/troubleshooting-en.md) | Common issues and solutions |

### Platform Configuration Documentation

| Document | Description |
|----------|-------------|
| [Feishu Config](assets/docs/feishu-config-en.md) | Feishu event subscription and permission configuration |
| [Discord Config](assets/docs/discord-config-en.md) | Discord bot configuration guide |
| [WeCom Config](assets/docs/wecom-config-en.md) | Enterprise WeChat bot configuration guide |
| [Telegram Config](assets/docs/telegram-config-en.md) | Telegram Bot configuration guide |
| [QQ Config](assets/docs/qq-config-en.md) | QQ Official/OneBot protocol configuration guide |
| [WhatsApp Config](assets/docs/whatsapp-config-en.md) | WhatsApp Personal/Business configuration guide |
| [WeChat Personal Config](assets/docs/weixin-config-en.md) | WeChat personal account configuration guide |

### Extended Documentation

| Document | Description |
|----------|-------------|
| [Agent Usage](assets/docs/agent-en.md) | Role configuration and custom Agent |
| [Implementation](assets/docs/implementation-en.md) | Key feature implementation details |
| [SDK API](assets/docs/sdk-api-en.md) | OpenCode SDK integration guide |
| [Workspace Guide](assets/docs/workspace-guide-en.md) | Working directory strategy and project configuration |
| [Rollout](assets/docs/rollout-en.md) | Router mode rollout and rollback |

---

## 📋 Requirements

- **Node.js**: >= 18.0.0
- **Operating System**: Linux / macOS / Windows
- **OpenCode**: Must be installed and running

---

## 🔧 Configuration

### Configuration Methods

| Method | Description |
|--------|-------------|
| Web Panel (Recommended) | Access `http://localhost:4098` for visual configuration |
| SQLite Database | Configuration stored in `data/config.db` |
| .env File | Only stores Admin panel startup parameters |

### Core Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `FEISHU_ENABLED` | `false` | Enable Feishu adapter |
| `DISCORD_ENABLED` | `false` | Enable Discord adapter |
| `OPENCODE_HOST` | `localhost` | OpenCode host address |
| `OPENCODE_PORT` | `4096` | OpenCode port |
| `ADMIN_PORT` | `4098` | Web configuration panel port |

For complete configuration parameters, refer to the [Configuration Center Documentation](assets/docs/environment-en.md).

---

## 📄 License

This project is licensed under [GNU General Public License v3.0](LICENSE)

**GPL v3 means:**
- ✅ Free to use, modify and distribute
- ✅ Can be used for commercial purposes
- ✅ Must open source modified versions
- ✅ Must retain original author copyright
- ✅ Derivative works must use GPL v3 license

---

## 🌟 Contributing

If this project helps you, please give it a Star!

For issues or suggestions, feel free to submit an [Issue](https://github.com/HNGM-HP/opencode-bridge/issues) or [Pull Request](https://github.com/HNGM-HP/opencode-bridge/pulls).

---

## 📞 Support

- **GitHub Issues**: [Report Issues](https://github.com/HNGM-HP/opencode-bridge/issues)
- **Project Home**: [GitHub Repository](https://github.com/HNGM-HP/opencode-bridge)
