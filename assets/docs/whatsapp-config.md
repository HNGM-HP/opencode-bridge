# WhatsApp 配置指南

本文档说明如何配置 WhatsApp 机器人以接入 OpenCode Bridge。

---

## 1. 配置概览

WhatsApp 适配器支持两种模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **Personal** | 使用 baileys 库（WhatsApp Web 协议） | 个人使用、快速测试 |
| **Business** | 使用 WhatsApp Business API | 企业应用、生产环境 |

---

## 2. Personal 模式

### 2.1 配置示例

```bash
# .env 文件
WHATSAPP_ENABLED=true
WHATSAPP_MODE=personal
WHATSAPP_SESSION_PATH=/var/lib/whatsapp-session
```

### 2.2 配置参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `WHATSAPP_ENABLED` | ✅ | `false` | 是否启用 WhatsApp |
| `WHATSAPP_MODE` | ❌ | `personal` | 运行模式：`personal` 或 `business` |
| `WHATSAPP_SESSION_PATH` | ❌ | `data/whatsapp-session` | 会话文件存储路径 |

### 2.3 扫码登录

Personal 模式启动时会生成二维码，需要使用手机 WhatsApp 扫码登录：

1. 启动服务后，查看日志中的二维码
2. 打开手机 WhatsApp → 设置 → 已关联的设备 → 关联设备
3. 扫描日志中的二维码
4. 登录成功后，会话会自动保存

### 2.4 特点

- 使用个人 WhatsApp 账号
- 支持私聊和群聊
- 无需商业账号审核
- 二维码登录，会话持久化

### 2.5 限制

- 需要定期扫码维持登录状态
- 官方不推荐使用第三方客户端
- 可能存在账号风险

---

## 3. Business 模式

### 3.1 前置条件

1. 拥有 WhatsApp Business 账号
2. 在 [Meta for Developers](https://developers.facebook.com/) 创建应用
3. 添加 WhatsApp Business API 产品
4. 获取 Phone ID 和 Access Token

### 3.2 配置示例

```bash
# .env 文件
WHATSAPP_ENABLED=true
WHATSAPP_MODE=business
WHATSAPP_BUSINESS_PHONE_ID=123456789012345
WHATSAPP_BUSINESS_ACCESS_TOKEN=EAAxxxxxxxxxxxx
WHATSAPP_BUSINESS_WEBHOOK_VERIFY_TOKEN=my_verify_token
```

### 3.3 配置参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `WHATSAPP_BUSINESS_PHONE_ID` | ✅ | Business Phone ID |
| `WHATSAPP_BUSINESS_ACCESS_TOKEN` | ✅ | Business Access Token |
| `WHATSAPP_BUSINESS_WEBHOOK_VERIFY_TOKEN` | ❌ | Webhook 验证 Token |

### 3.4 Webhook 配置

Business 模式需要配置 Webhook 接收消息：

1. 在 Meta 开发者后台设置 Webhook URL
2. 使用 `WHATSAPP_BUSINESS_WEBHOOK_VERIFY_TOKEN` 进行验证
3. 订阅 `messages` 事件

### 3.5 特点

- 官方 API，稳定可靠
- 支持消息模板
- 支持交互按钮（最多 3 个）
- 需要商业账号

---

## 4. 消息类型支持

### 4.1 Personal 模式

| 消息类型 | 发送 | 接收 | 说明 |
|----------|------|------|------|
| 文本 | ✅ | ✅ | 支持，最长 4096 字符 |
| 图片 | ❌ | ✅ | 仅支持接收 |
| 视频 | ❌ | ✅ | 仅支持接收 |
| 音频 | ❌ | ✅ | 仅支持接收 |
| 文档 | ❌ | ✅ | 仅支持接收 |
| 贴纸 | ❌ | ✅ | 仅支持接收 |
| 位置 | ❌ | ✅ | 仅支持接收 |
| 联系人 | ❌ | ✅ | 仅支持接收 |

### 4.2 Business 模式

| 消息类型 | 发送 | 接收 | 说明 |
|----------|------|------|------|
| 文本 | ✅ | ⚠️ | 需要 Webhook 接收 |
| 交互按钮 | ✅ | ⚠️ | 最多 3 个按钮 |

---

## 5. ChatId 格式

### 5.1 Personal 模式

- **私聊**: `<phone>@s.whatsapp.net`（如 `8613800138000@s.whatsapp.net`）
- **群聊**: `<groupId>@g.us`

### 5.2 Business 模式

使用纯手机号（不带后缀）

---

## 6. 验证

配置完成后，在 WhatsApp 中验证：

1. Personal 模式：扫码登录后发送测试消息
2. Business 模式：发送测试消息到配置的号码
3. 测试命令如 `/help`、`/panel`

---

## 7. 故障排查

### 7.1 Personal 模式

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 无法生成二维码 | 网络问题 | 检查网络连接 |
| 登录后立即断开 | 账号被限制 | 等待一段时间后重试 |
| 会话失效 | 长时间未活动 | 重新扫码登录 |
| 收不到消息 | Socket 断开 | 检查日志，重启服务 |

### 7.2 Business 模式

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 发送失败 | Token 无效 | 检查 Access Token |
| 收不到消息 | Webhook 未配置 | 配置 Webhook |
| API 错误 | 权限不足 | 检查应用权限 |

---

## 8. 安全建议

1. **会话文件保护**: Personal 模式的会话文件包含敏感信息，需妥善保管
2. **Token 管理**: Business 模式的 Access Token 应定期更换
3. **网络隔离**: 不要在公网暴露 Personal 模式的服务
4. **活动监控**: 监控异常登录活动
