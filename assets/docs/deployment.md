# 部署与运维指南

本文档详细说明 OpenCode Bridge 的部署、升级和运维方法。

---

## 1. 环境要求

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | 运行环境 |
| npm | >= 9.0.0 | 包管理器 |
| OpenCode | 最新版 | AI 编程助手 |
| 操作系统 | Linux / macOS / Windows | 支持的平台 |

---

## 2. 快速部署

### 2.1 一键部署脚本

**Linux/macOS:**

```bash
# 克隆项目
git clone https://github.com/HNGM-HP/opencode-bridge.git
cd opencode-bridge

# 执行部署脚本
chmod +x ./scripts/deploy.sh
./scripts/deploy.sh guide
```

**Windows PowerShell:**

```powershell
# 执行部署脚本
.\scripts\deploy.ps1 guide
```

部署脚本会自动完成：
- ✅ 检测并引导安装 Node.js
- ✅ 检测并引导安装 OpenCode
- ✅ 安装项目依赖并编译
- ✅ 生成初始配置文件

### 2.2 手动部署

```bash
# 1. 安装依赖
npm install

# 2. 编译项目
npm run build

# 3. 复制配置示例
cp .env.example .env

# 4. 编辑配置
vim .env
```

---

## 3. 启动服务

### 3.1 标准启动

**Linux/macOS:**

```bash
# 后台启动
./scripts/start.sh

# 前台运行（开发模式）
npm run dev
```

**Windows:**

```powershell
# 后台启动
.\scripts\start.ps1

# 前台运行（开发模式）
npm run dev
```

### 3.2 systemd 常驻运行（Linux）

通过管理菜单安装 systemd 服务：

```bash
npm run manage:bridge
# 选择"安装并启动 systemd 服务"
```

手动配置服务文件 `/etc/systemd/system/opencode-bridge.service`:

```ini
[Unit]
Description=OpenCode Bridge Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/opencode-bridge
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable opencode-bridge
sudo systemctl start opencode-bridge
```

---

## 4. Web 配置面板

### 4.1 访问地址

服务启动后，通过浏览器访问：

```
http://localhost:4098
```

### 4.2 面板功能

| 功能模块 | 说明 |
|----------|------|
| 配置管理 | 实时修改平台配置、可靠性配置等 |
| Cron 管理 | 创建、启用/禁用、删除定时任务 |
| 服务状态 | 查看运行时长、版本、数据库路径 |
| 模型列表 | 获取 OpenCode 可用模型 |
| 服务控制 | 远程重启服务 |
| 平台状态 | 查看各平台连接状态 |

### 4.3 访问密码

- 首次访问时在 Web 面板设置
- 存储在 SQLite 数据库中
- 可在 Web 面板中修改

---

## 5. 配置存储

### 5.1 SQLite 数据库

配置参数存储在 SQLite 数据库中：

- **数据库路径**: `data/config.db`
- **首次迁移**: 启动时自动从 `.env` 迁移
- **备份位置**: 原 `.env` 备份为 `.env.backup`

### 5.2 配置修改方式

| 方式 | 说明 |
|------|------|
| Web 面板 | 访问 `http://localhost:4098` 可视化修改 |
| SQLite 工具 | 直接编辑 `data/config.db` 数据库 |
| 配置文件 | 首次启动前在 `.env` 中配置（会自动迁移） |

---

## 6. 平台配置

完成基础部署后，需要在 Web 面板中配置各平台参数：

| 平台 | 配置文档 |
|------|----------|
| 飞书 | [飞书配置指南](feishu-config.md) |
| Discord | [Discord 配置指南](discord-config.md) |
| 企业微信 | [企业微信配置指南](wecom-config.md) |
| Telegram | [Telegram 配置指南](telegram-config.md) |
| QQ | [QQ 配置指南](qq-config.md) |
| WhatsApp | [WhatsApp 配置指南](whatsapp-config.md) |
| 微信个人号 | [微信个人号配置指南](weixin-config.md) |

---

## 7. 可靠性配置

详见 [可靠性指南](reliability.md)。

### 7.1 最小可用配置

```env
# OpenCode 连接（建议本地运行才能触发自动救援）
OPENCODE_HOST=localhost
OPENCODE_PORT=4096

# Cron 基础开关
RELIABILITY_CRON_ENABLED=true
RELIABILITY_CRON_API_ENABLED=true
RELIABILITY_CRON_API_HOST=127.0.0.1
RELIABILITY_CRON_API_PORT=4097

# 主动心跳开关（默认关闭）
RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED=false
RELIABILITY_INBOUND_HEARTBEAT_ENABLED=false

# 可靠性策略
RELIABILITY_LOOPBACK_ONLY=true
RELIABILITY_HEARTBEAT_INTERVAL_MS=1800000
RELIABILITY_FAILURE_THRESHOLD=3
RELIABILITY_WINDOW_MS=90000
RELIABILITY_COOLDOWN_MS=300000
RELIABILITY_REPAIR_BUDGET=3

# 宕机救援配置文件
OPENCODE_CONFIG_FILE=./opencode.json
```

---

## 8. 升级指南

### 8.1 源码部署升级

```bash
# 方式一：使用升级脚本
node scripts/deploy.mjs upgrade

# 方式二：手动升级
git pull origin main
npm install
npm run build
node scripts/stop.mjs
npm run start
```

### 8.2 npm 安装升级

```bash
npm update -g opencode-bridge
```

---

## 9. 日志管理

### 9.1 日志文件

| 文件 | 说明 |
|------|------|
| `logs/service.log` | 服务标准输出 |
| `logs/service.err` | 服务错误输出 |
| `logs/bridge.pid` | 后台进程 PID |
| `logs/reliability-audit.jsonl` | 可靠性审计日志 |

### 9.2 日志轮转

建议配置 logrotate 进行日志轮转：

```conf
# /etc/logrotate.d/opencode-bridge
/path/to/opencode-bridge/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

---

## 10. 备份与恢复

### 10.1 备份

```bash
# 备份数据目录
tar -czvf opencode-bridge-backup.tar.gz data/

# 备份配置
cp data/config.db data/config.db.backup
```

### 10.2 恢复

```bash
# 恢复数据目录
tar -xzvf opencode-bridge-backup.tar.gz

# 恢复配置
cp data/config.db.backup data/config.db
```

---

## 11. 故障排查

详见 [故障排查文档](troubleshooting.md)。

### 11.1 常见问题

| 问题 | 解决方案 |
|------|----------|
| 服务无法启动 | 检查端口占用，查看 `logs/service.err` |
| Web 面板无法访问 | 检查防火墙设置，确认服务已启动 |
| 平台无响应 | 检查平台配置，查看服务日志 |
| OpenCode 连接失败 | 检查 `OPENCODE_HOST` 和 `OPENCODE_PORT` 配置 |

### 11.2 诊断命令

```bash
# 检查 OpenCode 本地环境
node scripts/deploy.mjs opencode-check

# 查看服务日志
tail -f logs/service.log

# 查看错误日志
tail -f logs/service.err

# 检查进程状态
ps aux | grep opencode-bridge
```

---

## 12. 性能优化

### 12.1 资源建议

| 场景 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| 个人使用 | 2 核 | 2GB | 10GB |
| 小团队（<10 人） | 4 核 | 4GB | 20GB |
| 中型团队（<50 人） | 8 核 | 8GB | 50GB |

### 12.2 优化建议

1. **数据库优化**: 定期清理过期会话数据
2. **日志管理**: 配置日志轮转，避免磁盘占满
3. **会话清理**: 启用自动清理无效会话
4. **可靠性配置**: 根据实际需求调整心跳间隔

---

## 13. 安全建议

1. **访问控制**: 配置 Web 面板访问密码
2. **网络隔离**: 将服务部署在内网环境
3. **权限最小化**: 只授予必要的平台权限
4. **定期备份**: 定期备份配置数据库
5. **日志审计**: 定期检查操作日志
