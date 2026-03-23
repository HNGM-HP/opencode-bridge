# OpenCode SDK 集成说明

本文档描述 `src/opencode/client.ts` 中的 SDK 集成方式。

---

## 1. 集成原则

- **桥接稳定性优先**：统一错误处理、日志、重试策略
- **统一接口**：会话、消息、权限、问题都通过 `OpencodeClientWrapper` 暴露
- **抽象封装**：业务层不直接调用底层 SDK

---

## 2. 关键类型

### 权限事件

```typescript
interface PermissionRequestEvent {
  sessionId: string;
  permissionId: string;
  tool: string;
  description: string;
  risk?: string;
  parentSessionId?: string;
  relatedSessionId?: string;
  messageId?: string;
  callId?: string;
}
```

### 权限回传选项

```typescript
interface PermissionResponseOptions {
  directory?: string;
  fallbackDirectories?: string[];
}
```

用于目录感知的权限回传，支持候选目录回退。

---

## 3. API 概览

### 连接与事件

| 方法 | 说明 |
|------|------|
| `connect()` | 初始化 SDK 客户端并验证可用性 |
| `disconnect()` | 关闭事件流与重连定时器 |
| `startEventListener()` | 启动全局事件订阅 |

### 会话与项目

| 方法 | 说明 |
|------|------|
| `listProjects(directory?)` | 列出项目 |
| `listSessions(directory?)` | 列出会话 |
| `createSession(title?, directory?)` | 创建新会话 |
| `updateSession(sessionId, title)` | 更新会话标题 |
| `deleteSession(sessionId, directory?)` | 删除会话 |
| `getSessionById(sessionId)` | 按 ID 获取会话 |

### 消息与命令

| 方法 | 说明 |
|------|------|
| `sendMessage(sessionId, text, options)` | 发送消息 |
| `sendMessageAsync(sessionId, text, options)` | 发送消息（异步） |
| `sendCommand(sessionId, command, args?)` | 发送命令 |
| `sendShellCommand(sessionId, command, options)` | 发送 Shell 命令 |

### 权限与问题

| 方法 | 说明 |
|------|------|
| `respondToPermission(sessionId, permissionId, allow, remember?, options?)` | 响应权限 |
| `replyQuestion(sessionId, questionId, answers)` | 回答问题 |
| `rejectQuestion(sessionId, questionId)` | 拒绝问题 |

### 会话控制

| 方法 | 说明 |
|------|------|
| `abortSession(sessionId)` | 中止会话 |
| `revertMessage(sessionId, messageId)` | 撤回消息 |
| `summarizeSession(sessionId, providerId, modelId)` | 压缩会话 |

---

## 4. 目录感知权限回传

`respondToPermission()` 方法支持目录感知：

```typescript
await opencodeClient.respondToPermission(sessionId, permissionId, true, false, {
  directory: resolvedDirectory,
  fallbackDirectories: knownDirectories,
});
```

### 行为

1. 按顺序尝试每个目录候选
2. 命中即返回成功
3. 失败记录日志并继续尝试下一个
4. 最后回退到默认目录实例

这能显著降低"权限已允许但任务卡住"的问题。

---

## 5. 事件分发

事件通过 `OpenCodeEventHub` 消费：

| 事件 | 说明 |
|------|------|
| `permissionRequest` | 收到权限请求 |
| `questionAsked` | 收到问题 |
| `messagePartUpdated` | 消息片段更新 |
| `messageUpdated` | 消息更新 |
| `sessionStatus` | 会话状态变化 |
| `sessionIdle` | 会话空闲 |
| `sessionError` | 会话错误 |

### 最佳实践

- 在事件层只做路由与状态变更
- 不在事件处理器中拼装平台 UI
- 由各平台的渲染层处理 UI

---

## 6. 常见模式

### 发送消息（带选项）

```typescript
await opencodeClient.sendMessage(sessionId, prompt, {
  providerId,
  modelId,
  directory,
  agent,
  variant,
});
```

### 响应权限（目录感知）

```typescript
await opencodeClient.respondToPermission(sessionId, permissionId, true, false, {
  directory: resolvedDirectory,
  fallbackDirectories: knownDirectories,
});
```

### 回答问题

```typescript
await opencodeClient.replyQuestion(sessionId, requestId, answers);
```

---

## 7. 故障排查

| 问题 | 检查项 |
|------|--------|
| 401/403 | 核对 `OPENCODE_SERVER_USERNAME`/`OPENCODE_SERVER_PASSWORD` |
| 会话找不到 | 检查 `sessionId` 是否跨目录，尝试 `findSessionAcrossProjects` |
| 权限卡住 | 检查权限回传是否带目录候选 |
| 流式无输出 | 检查事件监听是否已启动、OutputBuffer 是否触发更新 |

---

## 8. 升级注意事项

- 升级 SDK 前先跑全量测试
- 观察 `PermissionRequestEvent` 字段兼容性
- 保持桥接封装层稳定
- 避免业务层直接耦合 SDK 原始字段
- 任何权限/目录相关改动都需要补回归测试
