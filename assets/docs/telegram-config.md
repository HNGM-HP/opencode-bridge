# Telegram 配置指南

本文档说明如何配置 Telegram Bot 以接入 OpenCode Bridge。

---

## 1. 配置概览

配置 Telegram Bot 需要完成以下步骤：

1. 创建 Telegram Bot
2. 获取 Bot Token
3. 在 Bridge 中填写配置参数

---

## 2. 创建 Telegram Bot

### 步骤 1：联系 BotFather

1. 在 Telegram 中搜索 **@BotFather**
2. 发送 `/newbot` 命令
3. 按提示设置 Bot 名称和用户名
4. 保存返回的 Token（格式：`123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`）

### 步骤 2：配置 Bot

可以向 @BotFather 发送以下命令配置 Bot：

| 命令 | 说明 |
|------|------|
| `/setprivacy` | 设置群聊中 Bot 是否只能看到 @它的消息 |
| `/setcommands` | 设置 Bot 命令列表 |
| `/setdescription` | 设置 Bot 描述 |
| `/setabouttext` | 设置关于文本 |

---

## 3. Bridge 配置

在 Web 面板或 `.env` 中配置以下参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `TELEGRAM_ENABLED` | ✅ | 设置为 `true` 启用 Telegram |
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram Bot Token |

---

## 4. 验证

配置完成后，在 Telegram 中验证：

1. 搜索你的 Bot 用户名
2. 向机器人发送 `/start` 或 `/help`
3. 如果配置正确，机器人应该会响应
4. 测试其他命令如 `/panel`、`/session new`

---

## 5. 群聊配置

在群聊中，Bot 只会响应包含 @机器人的消息：

- ✅ `@mybot 你好` - 会响应
- ❌ `你好` - 不会响应

如需在群聊中正常使用，需要在 @BotFather 中设置隐私模式：

```
/setprivacy
选择你的 Bot
选择"Disable" - 让 Bot 可以看到所有群消息
```

---

## 6. 消息类型支持

| 消息类型 | 发送 | 接收 | 说明 |
|----------|------|------|------|
| 文本 | ✅ | ✅ | 支持，最长 4096 字符 |
| 图片 | ❌ | ✅ | 仅支持接收 |
| 文档 | ❌ | ✅ | 仅支持接收 |
| 视频 | ❌ | ✅ | 仅支持接收 |
| 音频 | ❌ | ✅ | 仅支持接收 |
| 语音 | ❌ | ✅ | 仅支持接收 |
| 卡片/按钮 | ⚠️ | ❌ | 使用内联按钮交互实现 |

---

## 7. 故障排查

### 机器人无响应

1. 检查 `TELEGRAM_ENABLED` 是否为 `true`
2. 检查 Bot Token 是否正确
3. 检查网络连接
4. 查看 Bridge 服务日志

### 群聊无响应

1. 确认消息中包含 @机器人
2. 检查隐私模式设置
3. 检查 Bot 在群中的权限

### 无法发送消息

1. 检查 Bot 是否被用户屏蔽
2. 检查网络连接
3. 查看错误日志

---

## 8. ChatId 格式

Telegram 的 ChatId 是数字格式的聊天 ID：

- **私聊**: 用户 ID（如 `123456789`）
- **群聊**: 群组 ID（如 `-1001234567890`）

---

## 9. 安全建议

1. **Token 保护**: 不要泄露 Bot Token
2. **权限最小化**: 只授予必要的权限
3. **私有限制**: 如可能，限制机器人只能在特定群组使用
4. **定期重置**: 定期重置 Bot Token
