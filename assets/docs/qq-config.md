# QQ 配置指南

本文档说明如何配置 QQ 机器人以接入 OpenCode Bridge。

---

## 1. 配置概览

QQ 适配器支持两种协议：

| 协议 | 说明 | 适用场景 |
|------|------|----------|
| **official** | QQ 官方频道机器人 API | 生产环境、QQ 频道 |
| **onebot** | OneBot 协议（NapCat/go-cqhttp） | 传统 QQ 群、快速测试 |

---

## 2. Official 协议（QQ 官方频道机器人）

### 2.1 创建机器人

1. 访问 [QQ 开放平台](https://bot.q.qq.com/)
2. 创建机器人应用
3. 获取 App ID 和 Secret
4. 配置事件订阅（如需要）

### 2.2 配置示例

```bash
# .env 文件
QQ_ENABLED=true
QQ_PROTOCOL=official
QQ_APP_ID=123456789
QQ_SECRET=your-app-secret
QQ_CALLBACK_URL=https://your-domain.com/qq/webhook
QQ_ENCRYPT_KEY=your-encrypt-key
```

### 2.3 配置参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `QQ_ENABLED` | ✅ | 设置为 `true` 启用 QQ |
| `QQ_PROTOCOL` | ✅ | 设置为 `official` |
| `QQ_APP_ID` | ✅ | QQ 机器人 App ID |
| `QQ_SECRET` | ✅ | QQ 机器人 Secret |
| `QQ_CALLBACK_URL` | ❌ | 回调地址（用于 Webhook） |
| `QQ_ENCRYPT_KEY` | ❌ | 消息加密密钥 |

### 2.4 特点

- 官方 API，稳定可靠
- 支持私聊和频道消息
- 支持消息加密
- 不支持消息撤回
- 消息限制 3000 字符，自动移除 Markdown 格式

---

## 3. OneBot 协议

### 3.1 前置条件

需要部署 OneBot 实现：

| 实现 | 说明 |
|------|------|
| **NapCat** | 基于 QQ NT 的现代化实现（推荐） |
| **go-cqhttp** | 经典实现（已停止维护） |
| **LLOneBot** | 基于 LiteLoaderQQNT 的实现 |

### 3.2 配置示例

```bash
# .env 文件
QQ_ENABLED=true
QQ_PROTOCOL=onebot
QQ_ONEBOT_WS_URL=ws://127.0.0.1:3001
```

### 3.3 配置参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `QQ_ENABLED` | ✅ | 设置为 `true` 启用 QQ |
| `QQ_PROTOCOL` | ✅ | 设置为 `onebot` |
| `QQ_ONEBOT_WS_URL` | ✅ | OneBot WebSocket 地址 |
| `QQ_ONEBOT_HTTP_URL` | ❌ | OneBot HTTP API 地址 |

### 3.4 OneBot 配置

以 NapCat 为例，配置 `napcat.json`：

```json
{
  "http": {
    "enable": false
  },
  "ws": {
    "enable": true,
    "host": "0.0.0.0",
    "port": 3001
  }
}
```

### 3.5 特点

- 社区方案，功能丰富
- 支持传统 QQ 群和私聊
- 支持消息撤回
- 需要自行部署 OneBot 实现

---

## 4. 消息类型支持

### 4.1 Official 协议

| 消息类型 | 发送 | 接收 | 说明 |
|----------|------|------|------|
| 文本 | ✅ | ✅ | 支持，最长 3000 字符 |
| 图片 | ❌ | ✅ | 仅支持接收 |
| 文件 | ❌ | ✅ | 仅支持接收 |
| 卡片 | ⚠️ | ❌ | 降级为纯文本 |

### 4.2 OneBot 协议

| 消息类型 | 发送 | 接收 | 说明 |
|----------|------|------|------|
| 文本 | ✅ | ✅ | 支持，最长 3000 字符 |
| 图片 | ❌ | ✅ | 仅支持接收 |
| 文件 | ❌ | ✅ | 仅支持接收 |
| 视频 | ❌ | ✅ | 仅支持接收 |
| 语音 | ❌ | ✅ | 仅支持接收 |
| 卡片 | ⚠️ | ❌ | 降级为纯文本 |

---

## 5. ChatId 格式

### 5.1 Official 协议

- **私聊**: `c2c_<user_openid>`
- **频道**: `group_<group_openid>`

### 5.2 OneBot 协议

- **私聊**: `<user_id>`
- **群聊**: `<group_id>_group_`

---

## 6. 验证

配置完成后，在 QQ 中验证：

1. 向机器人发送消息
2. 如果配置正确，机器人应该会响应
3. 测试命令如 `/help`、`/panel`

---

## 7. 故障排查

### 7.1 Official 协议

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| Access Token 获取失败 | App ID 或 Secret 错误 | 检查配置 |
| 收不到消息 | 未配置事件订阅 | 在开放平台配置回调 |
| 消息加密失败 | Encrypt Key 错误 | 检查加密密钥 |

### 7.2 OneBot 协议

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| WebSocket 连接失败 | OneBot 未启动 | 启动 OneBot 服务 |
| 发送消息失败 | 未连接或权限不足 | 检查连接状态和权限 |
| 收不到群消息 | 未加群或被禁言 | 检查机器人群状态 |

---

## 8. 协议选择建议

| 场景 | 推荐协议 | 原因 |
|------|----------|------|
| 生产环境 | Official | 官方支持，稳定可靠 |
| 频道机器人 | Official | 原生支持 QQ 频道 |
| 传统 QQ 群 | OneBot | 官方 API 不支持传统群 |
| 快速测试 | OneBot | 部署简单，无需审核 |

---

## 9. 安全建议

1. **Secret 保护**: 不要泄露 Secret
2. **HTTPS**: 回调地址应使用 HTTPS
3. **权限控制**: 定期检查机器人权限配置
4. **日志监控**: 监控异常消息发送行为
