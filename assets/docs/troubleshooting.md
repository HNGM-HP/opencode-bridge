# 故障排查指南

本文档提供 OpenCode Bridge 常见问题的解决方案。

---

## 快速诊断流程

```
问题发生
    │
    ▼
1. 查看服务日志 → logs/service.log, logs/service.err
    │
    ▼
2. 检查配置 → Web 面板或 data/config.db
    │
    ▼
3. 检查平台状态 → 各平台机器人/应用状态
    │
    ▼
4. 检查 OpenCode → 是否运行、是否可访问
    │
    ▼
5. 重启服务 → 多数问题可临时解决
```

---

## 1. 飞书相关

| 现象 | 优先检查 |
|------|----------|
| 飞书发送消息后 OpenCode 无反应 | 检查飞书权限；确认 [飞书后台配置](feishu-config.md) 正确 |
| 点权限卡片后 OpenCode 无反应 | 日志是否出现权限回传失败；确认回传值是 `once/always/reject` |
| 权限卡或提问卡发不到群 | `.chat-sessions.json` 中 `sessionId -> chatId` 映射是否存在 |
| 卡片更新失败 | 消息类型是否匹配；失败后是否降级为重发卡片 |

---

## 2. Discord 相关

| 现象 | 优先检查 |
|------|----------|
| Discord 发送消息后 OpenCode 无反应 | 检查 `DISCORD_ENABLED` 是否为 `true`；检查 `DISCORD_TOKEN` 是否正确 |
| 机器人显示离线 | 检查 Bot Token 是否有效；检查网络连接 |
| 命令不工作 | 确保 Message Content Intent 已开启；检查机器人权限 |
| 文件发送失败 | 检查文件大小是否超过 Discord 限制（8MB/50MB） |

---

## 3. 企业微信相关

| 现象 | 优先检查 |
|------|----------|
| 企业微信发送消息后 OpenCode 无反应 | 检查 `WECOM_ENABLED` 是否为 `true`；检查 `WECOM_BOT_ID` 和 `WECOM_SECRET` 是否正确 |
| 消息接收地址配置错误 | 确认 Webhook URL 配置正确 |
| 应用权限不足 | 检查企业微信应用权限设置 |

---

## 4. Telegram 相关

| 现象 | 优先检查 |
|------|----------|
| 发送消息后无响应 | 检查 `TELEGRAM_ENABLED` 是否为 `true`；检查 `TELEGRAM_BOT_TOKEN` |
| 机器人显示离线 | 检查 Bot Token 是否有效；检查网络连接 |

---

## 5. QQ 相关

| 现象 | 优先检查 |
|------|----------|
| 发送消息后无响应 | 检查 `QQ_ENABLED` 是否为 `true`；检查 OneBot 连接 |
| OneBot 连接失败 | 检查 `QQ_ONEBOT_HTTP_URL` 和 `QQ_ONEBOT_WS_URL` |

---

## 6. WhatsApp 相关

| 现象 | 优先检查 |
|------|----------|
| 无法生成二维码 | 网络问题；检查网络连接 |
| 登录后立即断开 | 账号被限制；等待一段时间后重试 |
| 会话失效 | 长时间未活动；重新扫码登录 |

---

## 7. 微信个人号相关

| 现象 | 优先检查 |
|------|----------|
| 账号自动暂停 | 会话过期（errcode -14）；检查 Token 是否有效 |
| 消息发送失败 | context_token 失效；确保接收过对方消息以获取 token |
| 收不到消息 | 账号未启用；检查 `enabled` 字段是否为 1 |

---

## 8. OpenCode 相关

| 现象 | 优先检查 |
|------|----------|
| `/compact` 失败 | OpenCode 可用模型是否正常；必要时先 `/model <provider:model>` 再重试 |
| `!ls` 等 shell 命令失败 | 当前会话 Agent 是否可用；可先执行 `/agent general` 再重试 |
| OpenCode 连接失败 | 检查 `OPENCODE_HOST` 和 `OPENCODE_PORT` 配置；检查 OpenCode 是否运行 |
| 认证失败（401/403） | 检查 `OPENCODE_SERVER_USERNAME` 和 `OPENCODE_SERVER_PASSWORD` 配置 |
| OpenCode 大于 `v1.2.15` 版本发消息无响应 | 检查 `~/.config/opencode/opencode.json` 是否有 `"default_agent": "companion"`，有请删除 |

---

## 9. 可靠性相关

| 现象 | 优先检查 |
|------|----------|
| 心跳似乎没有执行 | 检查 `HEARTBEAT.md` 是否把检查项标记为 `- [ ]`；检查 `memory/heartbeat-state.json` 的 `lastRunAt` 是否更新 |
| 自动救援没有触发 | 检查 `OPENCODE_HOST` 是否为 loopback、`RELIABILITY_LOOPBACK_ONLY` 是否开启、失败次数/窗口是否达到阈值 |
| 自动救援被拒绝 | 检查 `logs/reliability-audit.jsonl` 的 `reason` 字段 |
| 找不到备份配置 | 检查 `logs/reliability-audit.jsonl` 的 `backupPath` |
| Cron 任务不执行 | 检查 `RELIABILITY_CRON_ENABLED` 是否为 `true`；检查 Cron 任务状态 |

---

## 10. Web 配置面板相关

| 现象 | 优先检查 |
|------|----------|
| Web 配置面板无法访问 | 检查 `ADMIN_PORT` 配置；检查防火墙设置；检查服务是否启动 |
| 配置修改后不生效 | 检查是否为敏感配置（需重启服务）；查看服务日志 |
| 密码错误 | 检查 Web 面板密码是否正确设置 |
| 配置丢失 | 检查 `data/config.db` 是否存在；检查是否有备份文件 |

---

## 11. 会话相关

| 现象 | 优先检查 |
|------|----------|
| 私聊首次会推送多条引导消息 | 这是首次流程（建群卡片 + `/help` + `/panel`）；后续会按已绑定会话正常对话 |
| `/send <路径>` 报"文件不存在" | 确认路径正确且为绝对路径；Windows 路径用 `\` 或 `/` 均可 |
| `/send` 报"拒绝发送敏感文件" | 内置安全黑名单拦截了 .env、密钥等敏感文件 |
| 文件发送失败提示大小超限 | 飞书图片上限 10MB、文件上限 30MB；压缩后重试 |
| 会话绑定失败 | 检查 `ENABLE_MANUAL_SESSION_BIND` 配置；检查会话 ID 是否正确 |

---

## 12. 后台服务相关

| 现象 | 优先检查 |
|------|----------|
| 后台模式无法停止 | `logs/bridge.pid` 是否残留；使用 `node scripts/stop.mjs` 清理 |
| 服务启动失败 | 检查端口占用；查看 `logs/service.err` |
| 日志文件过大 | 定期清理 `logs/` 目录；配置日志轮转 |

---

## 13. 通用排查步骤

### 13.1 查看服务日志

```bash
# 查看标准输出日志
tail -f logs/service.log

# 查看错误日志
tail -f logs/service.err

# 查看可靠性审计日志
tail -f logs/reliability-audit.jsonl
```

### 13.2 检查配置

通过 Web 面板 `http://localhost:4098` 或 SQLite 数据库检查配置：

```bash
# 使用 SQLite 查看配置
sqlite3 data/config.db "SELECT * FROM config_store;"
```

### 13.3 重启服务

```bash
# 停止服务
node scripts/stop.mjs

# 启动服务
npm run start
```

### 13.4 检查网络

```bash
# 检查 OpenCode 是否可访问
curl http://localhost:4096

# 检查各平台 API 连通性
ping api.feishu.cn
ping discord.com
```

### 13.5 检查进程

```bash
# 查看 Bridge 进程
ps aux | grep opencode-bridge

# 查看 OpenCode 进程
ps aux | grep opencode
```

---

## 14. 获取帮助

如以上方法无法解决问题：

1. 查看详细日志，寻找错误信息
2. 访问 [GitHub Issues](https://github.com/HNGM-HP/opencode-bridge/issues) 搜索类似问题
3. 提交新 Issue，附上：
   - 问题描述
   - 相关日志
   - 配置信息（隐藏敏感数据）
   - 复现步骤
