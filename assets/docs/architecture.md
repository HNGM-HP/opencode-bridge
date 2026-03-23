# OpenCode Bridge 架构设计

本文档详细描述 OpenCode Bridge 的系统架构、核心模块职责和关键链路。

---

## 1. 架构目标

- **一致的任务闭环体验**：在多个即时通讯平台提供一致的消息、权限、提问、流式输出、回滚能力
- **保持平台能力边界**：不强行复用不适配的交互范式，尊重各平台特性
- **会话与目录一致性**：保证会话绑定与工作目录的一致性，降低状态错位风险
- **分层架构设计**：用分层结构替代入口堆逻辑，支持后续平台扩展与灰度演进

---

## 2. 分层架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        平台适配层                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Feishu  │ │ Discord │ │  WeCom  │ │Telegram │ │   QQ    │   │
│  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       │           │           │           │           │         │
│  ┌─────────┐ ┌─────────┐                                            │
│  │WhatsApp │ │  WeChat │                                            │
│  │ Adapter │ │ Adapter │                                            │
│  └────┬────┘ └────┬────┘                                            │
└───────┼───────────┼───────────────────────────────────────────────┘
        │           │
        └─────┬─────┘
              │
┌─────────────▼─────────────────────────────────────────────────────┐
│                        入口路由层                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐     │
│  │    RootRouter    │───▶│      Platform Handlers           │     │
│  │  (消息路由分发)   │    │  p2p | group | lifecycle | card  │     │
│  └──────────────────┘    └──────────────────────────────────┘     │
└─────────────┬─────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────────┐
│                        领域处理层                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │ Permission  │ │  Question   │ │   Output    │ │    Chat     │  │
│  │  Handler    │ │  Handler    │ │   Buffer    │ │SessionStore │  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘  │
│         │               │               │               │         │
│  ┌─────────────┐ ┌─────────────┐                                  │
│  │  Directory  │ │  Lifecycle  │                                  │
│  │   Policy    │ │   Handler   │                                  │
│  └─────────────┘ └─────────────┘                                  │
└─────────────┬─────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────────┐
│                      OpenCode 集成层                              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐       │
│  │  OpencodeClientWrapper   │  │   OpenCodeEventHub       │       │
│  │  (SDK 封装与会话管理)     │  │   (事件分发与订阅)        │       │
│  └──────────────────────────┘  └──────────────────────────┘       │
└─────────────┬─────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────────┐
│                        可靠性层                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │    Cron     │ │  Runtime    │ │   Rescue    │ │  Heartbeat  │  │
│  │  Scheduler  │ │CronManager  │ │ Orchestrator│ │   Engine    │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────────┐
│                        管理层                                      │
│  ┌──────────────────────────┐  ┌──────────────────────────┐       │
│  │      AdminServer         │  │     BridgeManager        │       │
│  │   (Web 配置中心服务)      │  │    (服务生命周期管理)     │       │
│  └──────────────────────────┘  └──────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块职责

### 3.1 平台适配层

平台适配层负责将各平台的原始事件转换为统一的内部事件模型。

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| Feishu Adapter | `src/platform/adapters/feishu-adapter.ts` | 飞书事件接收、消息归一化、卡片交互 |
| Discord Adapter | `src/platform/adapters/discord-adapter.ts` | Discord 网关消息、组件交互、Slash 命令 |
| WeCom Adapter | `src/platform/adapters/wecom-adapter.ts` | 企业微信事件接收、消息收发 |
| Telegram Adapter | `src/platform/adapters/telegram-adapter.ts` | Telegram Bot API、Inline 键盘 |
| QQ Adapter | `src/platform/adapters/qq-adapter.ts` | OneBot 协议、群聊消息 |
| WhatsApp Adapter | `src/platform/adapters/whatsapp-adapter.ts` | WhatsApp 消息收发 |
| WeChat Adapter | `src/platform/adapters/weixin-adapter.ts` | 个人微信扫码登录、消息收发 |

**统一事件模型：**

```typescript
interface PlatformMessageEvent {
  platform: PlatformId;        // 平台标识
  conversationId: string;      // 会话 ID
  messageId: string;           // 消息 ID
  senderId: string;            // 发送者 ID
  senderType: SenderType;      // user | bot
  content: string;             // 消息内容
  msgType: string;             // text | image | file
  attachments?: PlatformAttachment[];
  mentions?: PlatformMention[];
  rawEvent: unknown;           // 原始事件
}
```

### 3.2 入口路由层

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| RootRouter | `src/router/root-router.ts` | 多平台消息与卡片动作统一入口 |
| P2P Handler | `src/handlers/p2p.ts` | 私聊消息处理 |
| Group Handler | `src/handlers/group.ts` | 群聊消息处理 |
| Lifecycle Handler | `src/handlers/lifecycle.ts` | 生命周期事件处理 |
| Card Action Handler | `src/handlers/card-action.ts` | 卡片动作回调处理 |
| Command Handler | `src/handlers/command.ts` | 命令解析与执行 |

### 3.3 领域处理层

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| Permission Handler | `src/permissions/handler.ts` | 权限请求队列、白名单判定、超时清理 |
| Question Handler | `src/opencode/question-handler.ts` | 问题状态管理、多题推进、跳过、提交 |
| Output Buffer | `src/opencode/output-buffer.ts` | 流式片段聚合、节流触发、状态标记 |
| Chat Session Store | `src/store/chat-session.ts` | 会话映射存储、别名管理 |
| Directory Policy | `src/utils/directory-policy.ts` | 目录安全策略、白名单约束、Git 根归一化 |
| Lifecycle Handler | `src/handlers/lifecycle.ts` | 生命周期扫描、清理与解散逻辑 |

### 3.4 OpenCode 集成层

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| OpencodeClient | `src/opencode/client.ts` | SDK 封装、会话/消息/权限/问题统一接口 |
| OpenCodeEventHub | `src/router/opencode-event-hub.ts` | 事件单入口分发、权限/提问/输出路由 |
| Session Queue | `src/opencode/session-queue.ts` | 会话请求队列管理 |
| Streamer | `src/feishu/streamer.ts` | 流式输出处理 |

### 3.5 可靠性层

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| Cron Scheduler | `src/reliability/scheduler.ts` | Cron 调度器、定时任务管理 |
| Runtime Cron Manager | `src/reliability/runtime-cron.ts` | 运行时 Cron 动态管理 |
| Rescue Orchestrator | `src/reliability/rescue-executor.ts` | 宕机救援执行、自动修复 |
| Heartbeat Engine | `src/reliability/conversation-heartbeat.ts` | 会话心跳、保活检测 |
| Probe | `src/reliability/opencode-probe.ts` | OpenCode 健康探针 |

### 3.6 管理层

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| Admin Server | `src/admin/admin-server.ts` | Web 配置中心、REST API |
| Bridge Manager | `src/admin/bridge-manager.ts` | 服务生命周期控制 |
| Config Store | `src/store/config-store.ts` | 配置存储、SQLite 管理 |

---

## 4. 关键链路

### 4.1 消息入站链路

```
用户消息 → 平台适配器 → RootRouter → 命令解析 → 会话定位 → OpenCode
```

**详细流程：**

1. 平台适配器收到消息并归一化为 `PlatformMessageEvent`
2. RootRouter 根据平台和会话类型分发到对应 Handler
3. 命令解析器识别命令类型（/help, /panel, 普通消息等）
4. 会话存储定位或创建 OpenCode 会话
5. 调用 `opencodeClient.sendMessage*` 进入 OpenCode

### 4.2 事件出站链路

```
OpenCode 事件 → EventHub → 权限/提问/输出处理 → 平台发送器 → 用户
```

**详细流程：**

1. `opencodeClient` 监听 OpenCode 事件流
2. `OpenCodeEventHub` 处理 `messagePartUpdated/sessionStatus/...`
3. Timeline 与 OutputBuffer 聚合并节流
4. 平台 Sender 发送消息到用户

### 4.3 权限闭环链路

```
permission.asked → 白名单判定 → 卡片/文本确认 → 权限回传 → OpenCode
```

**详细流程：**

1. 收到 `permission.asked` 后先判定白名单
2. 命中白名单时自动允许；否则入队等待人工确认
3. 人工确认支持卡片动作和文本兜底两条路径
4. 权限回传支持目录感知与候选目录回退

### 4.4 可靠性链路

```
Cron 触发 → 健康探针 → 状态判定 → 救援执行 → 恢复通知
```

**详细流程：**

1. CronScheduler 按配置调度定时任务
2. 探针检测 OpenCode 健康状态
3. 连续失败达到阈值后触发救援
4. 执行救援流水线：加锁 → 诊断 → 备份 → 重启 → 验证

---

## 5. 平台能力矩阵

| 能力 | 飞书 | Discord | 企业微信 | Telegram | QQ | WhatsApp | 微信 |
|------|------|---------|----------|----------|-----|----------|------|
| 文本消息 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 图片消息 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 文件消息 | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ |
| 卡片/组件 | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 流式输出 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 权限卡片 | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| 消息撤回 | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| Slash 命令 | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

**图例：** ✅ 完整支持 | ⚠️ 部分支持 | ❌ 不支持

---

## 6. 配置存储架构

```
┌─────────────────┐
│    .env 文件     │  仅存储 Admin 面板启动参数
│ ADMIN_PORT      │
│ ADMIN_PASSWORD  │
└────────┬────────┘
         │ 首次启动迁移
         ▼
┌─────────────────┐
│  SQLite 数据库   │  存储所有业务配置
│  data/config.db │  - 平台配置
│                 │  - 可靠性配置
│                 │  - 显示控制配置
│                 │  - 管理员密码
└─────────────────┘
```

**配置迁移流程：**

1. 首次启动时检测 `.env` 文件中的业务配置
2. 将配置写入 SQLite 数据库
3. 标记迁移完成，原 `.env` 备份为 `.env.backup`
4. 后续启动直接从数据库读取配置

---

## 7. 目录一致性策略

会话创建/切换统一经过目录策略校验：

```
┌─────────────────────────────────────────────────────────────┐
│                    目录决策优先级                            │
├─────────────────────────────────────────────────────────────┤
│ 1. 显式输入目录（命令参数）                                  │
│ 2. 项目别名（PROJECT_ALIASES）                              │
│ 3. 群默认目录（会话绑定存储）                                │
│ 4. 全局默认目录（DEFAULT_WORK_DIRECTORY）                   │
│ 5. OpenCode 服务端默认目录                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    目录校验流水线（9 阶段）                  │
├─────────────────────────────────────────────────────────────┤
│ 1. 优先级合并    → 合并各来源的目录候选                      │
│ 2. 格式校验      → 检查路径格式和长度                        │
│ 3. 路径规范化    → 统一分隔符、去除冗余                      │
│ 4. 危险路径拦截  → 拒绝 /etc, /root 等敏感路径               │
│ 5. 白名单校验    → 检查 ALLOWED_DIRECTORIES                  │
│ 6. 存在性预检    → 检查目录是否存在                          │
│ 7. realpath 解析 → 解析符号链接真实路径                      │
│ 8. Git 根归一化  → 归一到 Git 仓库根目录                     │
│ 9. 归一后复检    → 再次检查白名单                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 扩展指南

### 8.1 添加新平台

1. 创建适配器实现 `PlatformAdapter` 接口
2. 在 `src/platform/registry.ts` 注册适配器
3. 创建对应的 Handler 处理消息
4. 在配置中添加平台开关和参数

### 8.2 添加新命令

1. 在 `src/handlers/command.ts` 或对应平台 Handler 中添加命令解析
2. 实现命令执行逻辑
3. 更新命令文档

### 8.3 添加新 Cron 任务

1. 在 `src/reliability/job-registry.ts` 注册任务
2. 实现任务执行逻辑
3. 配置调度表达式

---

## 9. 运维建议

### 9.1 排障优先级

1. 先看路由模式和平台启用日志
2. 再看会话映射与权限队列状态
3. 权限问题优先核查：队列 key、session 绑定、目录候选
4. 卡片问题优先核查：路由动作是否进入对应 handler
5. 可靠性问题优先核查：Cron 任务状态、心跳配置

### 9.2 变更检查

修改核心链路后必须执行：

```bash
npm run build && npm test
```

---

## 10. 相关文档

| 文档 | 说明 |
|------|------|
| [配置中心](environment.md) | 完整配置参数说明 |
| [部署运维](deployment.md) | 部署与升级指南 |
| [可靠性指南](reliability.md) | 心跳与救援配置 |
| [SDK API](sdk-api.md) | OpenCode SDK 集成说明 |
