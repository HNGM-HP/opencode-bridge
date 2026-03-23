# 飞书后台配置指南

本文档说明如何配置飞书应用以接入 OpenCode Bridge。

---

## 1. 配置概览

配置飞书应用需要完成以下步骤：

1. 创建飞书自建应用
2. 配置事件订阅
3. 配置应用权限
4. 配置加密设置
5. 在 Bridge 中填写配置参数

---

## 2. 事件订阅

建议使用长连接模式（WebSocket 事件）。

### 2.1 必需事件

| 事件 | 必需 | 用途 |
|------|------|------|
| `im.message.receive_v1` | ✅ | 接收群聊/私聊消息 |
| `im.message.recalled_v1` | ✅ | 用户撤回触发 `/undo` 回滚 |
| `im.chat.member.user.deleted_v1` | ✅ | 成员退群后触发生命周期清理 |
| `im.chat.disbanded_v1` | ✅ | 群解散后清理本地会话映射 |
| `card.action.trigger_v1` | ✅ | 处理控制面板、权限确认、提问卡片回调 |

### 2.2 可选事件

| 事件 | 必需 | 用途 |
|------|------|------|
| `im.message.message_read_v1` | ❌ | 已读回执兼容 |

---

## 3. 应用权限

### 3.1 权限分组

| 能力分组 | 调用的 API | 用途 |
|----------|------------|------|
| 消息读写与撤回 | `im:message:p2p_msg:readonly`、`im:message:group_at_msg:readonly`、`im:message:group_msg`、`im:message:reactions:read`、`im:message:reactions:write_only` | 发送文本/卡片、流式更新卡片、撤回消息 |
| 群与成员管理 | `im:chat`、`im:chat.members:read`、`im:chat.members:write_only` | 私聊建群、拉人进群、查群成员、自动清理无效群 |
| 消息资源下载 | `im:resource` | 下载图片/文件附件并转发给 OpenCode |

### 3.2 批量导入权限配置

复制以下 JSON 保存至 `acc.json`，然后在飞书开发者后台 → 权限管理 → 批量导入/导出权限：

```json
{
  "scopes": {
    "tenant": [
      "im:message.p2p_msg:readonly",
      "im:chat",
      "im:chat.members:read",
      "im:chat.members:write_only",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.group_msg",
      "im:message.reactions:read",
      "im:message.reactions:write_only",
      "im:resource"
    ],
    "user": []
  }
}
```

---

## 4. 配置步骤

### 步骤 1：创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 进入"企业自建" → "创建应用"
3. 选择"机器人"应用类型
4. 记录 **App ID** 和 **App Secret**

### 步骤 2：配置事件订阅

1. 在应用设置中找到"事件订阅"
2. 建议使用"长连接"模式（WebSocket）
3. 添加上述必需事件
4. 记录 **Verification Token**

### 步骤 3：配置权限

1. 在应用设置中找到"权限管理"
2. 添加上述所需权限
3. 或使用上方 JSON 批量导入
4. 发布应用使权限生效

### 步骤 4：配置加密

1. 在应用设置中找到"加密"配置
2. 设置加密密钥
3. 记录 **Encrypt Key** 和 **Verification Token**

### 步骤 5：发布应用

1. 在应用设置中找到"版本管理与发布"
2. 创建版本并发布
3. 确保应用状态为"已启用"

---

## 5. Bridge 配置

在 Web 面板或 `.env` 中配置以下参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `FEISHU_ENABLED` | ✅ | 设置为 `true` 启用飞书 |
| `FEISHU_APP_ID` | ✅ | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | ✅ | 飞书应用 App Secret |
| `FEISHU_ENCRYPT_KEY` | ✅ | 飞书 Encrypt Key |
| `FEISHU_VERIFICATION_TOKEN` | ✅ | 飞书 Verification Token |

---

## 6. 验证

配置完成后，在飞书中验证：

1. 在私聊中向机器人发送消息
2. 如果配置正确，机器人应该会响应
3. 在群聊中 @机器人 测试群聊功能
4. 测试卡片交互（如 `/panel` 命令）

---

## 7. 故障排查

### 机器人无响应

1. 检查 `FEISHU_ENABLED` 是否为 `true`
2. 检查 App ID 和 App Secret 是否正确
3. 检查事件订阅是否正确配置
4. 检查权限是否已授予
5. 查看飞书后台的事件订阅日志

### 权限不足

1. 检查所有必需权限是否已授予
2. 等待权限变更生效（可能需要几分钟）
3. 确认应用已发布

### 卡片操作不生效

1. 检查 `card.action.trigger_v1` 事件是否订阅
2. 检查卡片回调 URL 是否可访问
3. 查看 Bridge 服务日志

### 加密/解密失败

1. 检查 Encrypt Key 是否正确配置
2. 检查 Verification Token 是否正确
3. 确认飞书后台与 Bridge 配置一致

---

## 8. 安全建议

1. **权限最小化**: 只授予必要的权限
2. **密钥保护**: 妥善保管 App Secret 和 Encrypt Key
3. **IP 白名单**: 如可能，配置 IP 白名单限制访问
4. **定期审计**: 定期检查应用权限和使用情况
