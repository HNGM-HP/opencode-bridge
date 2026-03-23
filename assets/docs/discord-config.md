# Discord 配置指南

本文档说明如何配置 Discord 机器人以接入 OpenCode Bridge。

---

## 1. 配置概览

配置 Discord 机器人需要完成以下步骤：

1. 创建 Discord 应用
2. 创建 Bot
3. 配置 Bot 权限
4. 启用必要 Intents
5. 获取 Token 和 Client ID
6. 在 Bridge 中填写配置参数

---

## 2. 创建 Discord 应用

### 步骤 1：访问开发者门户

访问 [Discord Developer Portal](https://discord.com/developers/applications)

### 步骤 2：创建新应用

1. 点击 "New Application"
2. 输入应用名称
3. 同意服务条款
4. 点击 "Create"

### 步骤 3：创建 Bot

1. 在左侧菜单选择 "Bot"
2. 点击 "Add Bot"
3. 确认添加

---

## 3. Bot 权限配置

### 3.1 Bot 权限

在 Bot 设置页面，配置以下权限：

| 权限 | 说明 |
|------|------|
| Send Messages | 发送消息 |
| Send Messages in Threads | 在主题频道中发送消息 |
| Embed Links | 发送嵌入消息 |
| Attach Files | 发送文件 |
| Read Message History | 读取消息历史（用于撤回） |
| Manage Channels | 管理频道（用于创建会话频道） |
| Manage Threads | 管理主题频道 |

### 3.2 启用 Intents

在 Bot 设置页面的 "Privileged Gateway Intents" 部分：

| Intent | 必需 | 说明 |
|--------|------|------|
| MESSAGE CONTENT INTENT | ✅ | 读取消息内容 |
| SERVER MEMBERS INTENT | ❌ | 服务器成员信息（可选） |
| PRESENCE INTENT | ❌ | 成员在线状态（可选） |

> **重要**: MESSAGE CONTENT INTENT 是必需的，否则机器人无法读取用户消息。

---

## 4. 邀请机器人

### 4.1 生成邀请链接

1. 在左侧菜单选择 "OAuth2" → "URL Generator"
2. 选择 SCOPES: `bot`、`applications.commands`
3. 选择 BOT PERMISSIONS: 选择上述配置的权限
4. 复制生成的 URL

### 4.2 添加到服务器

1. 在浏览器打开邀请链接
2. 选择要添加的服务器
3. 点击 "Authorize"

---

## 5. 获取配置信息

### 5.1 获取 Bot Token

1. 在 Bot 设置页面
2. 点击 "Reset Token"（首次需要重置）
3. 复制 Token（**只显示一次，请妥善保存**）

### 5.2 获取 Client ID

1. 在 "OAuth2" → "General" 页面
2. 复制 "Client ID"

---

## 6. Bridge 配置

在 Web 面板或 `.env` 中配置以下参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `DISCORD_ENABLED` | ✅ | 设置为 `true` 启用 Discord |
| `DISCORD_TOKEN` | ✅ | Discord Bot Token |
| `DISCORD_CLIENT_ID` | ✅ | Discord 应用 Client ID |

---

## 7. 验证

配置完成后，在 Discord 中验证：

1. 在服务器中向机器人发送 `///help`
2. 如果配置正确，机器人应该会响应
3. 测试其他命令如 `///session`、`///new`

---

## 8. 故障排查

### 机器人显示离线

1. 检查 Token 是否正确
2. 检查网络连接
3. 查看 Bridge 服务日志

### 命令不工作

1. 确认 MESSAGE CONTENT INTENT 已开启
2. 检查机器人权限
3. 确保使用 `///` 前缀（避免与原生 Slash 命令冲突）

### 文件发送失败

1. 检查文件大小是否超过 Discord 限制（8MB/50MB）
2. 检查机器人 Attach Files 权限

### 无法读取消息

1. 确认 MESSAGE CONTENT INTENT 已开启
2. 检查机器人是否有读取消息的权限

---

## 9. 安全建议

1. **Token 保护**: 不要泄露 Bot Token
2. **权限最小化**: 只授予必要的权限
3. **私有限制**: 如可能，限制机器人只能在特定服务器使用
4. **定期重置**: 定期重置 Bot Token
