# 可靠性能力指南

本文档详细说明 OpenCode Bridge 的可靠性保障机制，包括心跳监控、Cron 任务和宕机救援。

---

## 1. 概述

OpenCode Bridge 提供多层可靠性保障机制：

| 机制 | 说明 | 触发方式 |
|------|------|----------|
| **心跳监控** | 定时探测 OpenCode 健康状态 | 定时器/入站消息 |
| **Cron 任务** | 运行时定时任务调度 | 预设调度表达式 |
| **宕机救援** | OpenCode 故障时自动修复 | 健康探针连续失败 |
| **日志审计** | 完整操作记录与追踪 | 事件触发 |

---

## 2. 默认行为

启动桥接服务后会自动初始化可靠性生命周期：

### 2.1 内置 Cron 任务

| 任务名称 | 调度频率 | 说明 |
|----------|----------|------|
| `watchdog-probe` | 每 30 秒 | OpenCode 健康探针 |
| `process-consistency-check` | 每 60 秒 | 进程一致性检查 |
| `stale-cleanup` | 每 5 分钟 | 清理过期资源 |
| `budget-reset` | 每天 0 点 | 重置救援预算 |

### 2.2 主动心跳

默认关闭（`RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED=false`）。

开启后由 Bridge 定时器触发，不依赖平台入站消息。

---

## 3. Cron 运行时管理

### 3.1 管理入口

| 入口 | 格式 | 说明 |
|------|------|------|
| HTTP API | `/cron/list`、`/cron/add`、`/cron/update`、`/cron/remove` | REST API 管理 |
| 飞书 | `/cron ...` | 飞书命令管理 |
| Discord | `///cron ...` | Discord 命令管理 |
| Web 面板 | `http://localhost:4098` | 可视化管理 |

### 3.2 默认行为

Cron 任务会绑定**创建它的聊天窗口 + 当时绑定的 OpenCode 会话**，到点时：

1. 优先在原 OpenCode 会话执行
2. 结果回推到原聊天窗口
3. 若原窗口失效，根据配置决定是否转发

### 3.3 自然语言创建

支持自然语言创建 Cron 任务：

```text
/cron 添加个定时任务，每天早上 8 点向我发送一份 AI 简报
///cron 生产 AI 简报，工作日记得发我
/cron 暂停任务 <jobId>
```

### 3.4 API 调用示例

```bash
# 列出任务
curl http://127.0.0.1:4097/cron/list

# 新增任务
curl -X POST http://127.0.0.1:4097/cron/add \
  -H "Content-Type: application/json" \
  -d '{
    "name": "daily-check",
    "schedule": { "kind": "cron", "expr": "0 * * * * *" },
    "payload": {
      "kind": "systemEvent",
      "text": "执行例行检查",
      "sessionId": "ses_xxx",
      "delivery": {
        "platform": "feishu",
        "conversationId": "oc_xxx"
      }
    },
    "enabled": true
  }'

# 更新任务（禁用）
curl -X POST http://127.0.0.1:4097/cron/update \
  -H "Content-Type: application/json" \
  -d '{ "id": "<job-id>", "enabled": false }'

# 删除任务
curl -X POST http://127.0.0.1:4097/cron/remove \
  -H "Content-Type: application/json" \
  -d '{ "id": "<job-id>" }'
```

### 3.5 认证

如果配置了 `RELIABILITY_CRON_API_TOKEN`，请求需携带：

```bash
-H "Authorization: Bearer <token>"
```

---

## 4. 心跳使用指南

### 4.1 启用心跳

设置 `RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED=true` 并重启服务。

### 4.2 心跳流程

```
Bridge 定时器按间隔触发
    │
    ▼
发送心跳提示到 Agent Session
    │
    ▼
Agent 读取 HEARTBEAT.md 并执行检查
    │
    ▼
检查结果
    │
    ├─ 无异常 → 回复 HEARTBEAT_OK → 桥接静默记录
    │
    └─ 有异常 → 回复告警内容 → 桥接记录并可推送告警
```

### 4.3 HEARTBEAT.md 格式

```markdown
- [ ] failure_type: 描述  # 启用
- [x] failure_type: 描述  # 停用
```

### 4.4 状态文件

- 心跳 session 状态：`memory/heartbeat-session.json`
- 审计日志：`logs/reliability-audit.jsonl`

---

## 5. 自动救援

### 5.1 触发条件

健康探针持续失败，且满足：

- 连续失败次数 `>= RELIABILITY_FAILURE_THRESHOLD`
- 失败窗口时长 `>= RELIABILITY_WINDOW_MS`

### 5.2 守卫条件

- 目标主机为 loopback（`localhost/127.0.0.1/::1`）
- 修复预算未耗尽
- 距离上次修复已过冷却窗口

### 5.3 救援流程

```
触发救援
    │
    ▼
加锁与单实例检查
    │
    ▼
环境诊断
    │
    ▼
配置备份与两级回退
    │
    ▼
启动 OpenCode
    │
    ▼
健康复检
    │
    ▼
自动下发修复上下文
```

---

## 6. 最小可用配置

```env
# OpenCode 连接（建议本地运行才能触发自动救援）
OPENCODE_HOST=localhost
OPENCODE_PORT=4096

# Cron 基础开关
RELIABILITY_CRON_ENABLED=true
RELIABILITY_CRON_API_ENABLED=true
RELIABILITY_CRON_API_HOST=127.0.0.1
RELIABILITY_CRON_API_PORT=4097

# 可选：Cron API Token
# RELIABILITY_CRON_API_TOKEN=your-token

# 可选：任务持久化文件
# RELIABILITY_CRON_JOBS_FILE=/absolute/path/jobs.json

# 可选：僵尸任务自动清理
# RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP=false

# 可选：转发到私聊
# RELIABILITY_CRON_FORWARD_TO_PRIVATE=false

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

## 7. 执行流程

### 7.1 Cron 执行流程

```
Bridge 启动
    │
    ▼
加载内置 Cron 任务
    │
    ▼
加载持久化 jobs.json
    │
    ▼
注册到 CronScheduler
    │
    ▼
按 cron expr 定时触发
    │
    ▼
检查原聊天窗口与原会话绑定
    │
    ├─ 绑定仍有效 → 在原 OpenCode 会话执行 → 结果回推原聊天窗口
    │
    ├─ 原窗口失效且允许转发 → 执行后转发到私聊/备用窗口
    │
    └─ 原窗口失效且禁止转发 → 跳过或清理僵尸任务
```

### 7.2 心跳执行流程

```
Bridge 定时器每 N 分钟
    │
    ▼
发送心跳提示到 Agent Session
    │
    ▼
Agent 读取 HEARTBEAT.md
    │
    ▼
检查结果
    │
    ├─ 无异常 → 回复 HEARTBEAT_OK → 桥接静默记录
    │
    └─ 有异常 → 回复告警内容 → 桥接记录并可推送告警
```

---

## 8. 产物与审计位置

| 文件 | 说明 |
|------|------|
| `memory/heartbeat-session.json` | 心跳 session 状态 |
| `logs/reliability-audit.jsonl` | 可靠性审计日志 |
| `<OPENCODE_CONFIG_FILE>.bak.<timestamp>.<sha256>` | 配置备份 |

---

## 9. 僵尸 Cron 与回退策略

### 9.1 RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP=false（默认）

- 不在启动时自动扫描 Cron 孤儿任务
- 不在群解散/频道删除时自动删除对应 Cron
- 任务执行时若绑定失效，会直接跳过并记录日志

### 9.2 RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP=true

- 启动时扫描并删除缺少原窗口绑定或缺少原 session 的僵尸 Cron
- 群解散、频道删除时，联动删除绑定到该窗口的 Cron
- `stale-cleanup` 周期任务也会继续扫描僵尸 Cron

### 9.3 RELIABILITY_CRON_FORWARD_TO_PRIVATE=true

当原聊天窗口失效、但原 session 仍可执行且未绑定到别的活动窗口时：

- 可把结果转发到私聊/备用窗口
- 备用目标优先级：任务显式 fallback > env fallback id > 同平台创建者私聊

---

## 10. 常用自检命令

```bash
# 检查 OpenCode 本地环境
node scripts/deploy.mjs opencode-check

# 核验可靠性启动/清理链路
npm test -- tests/reliability-bootstrap.test.ts

# 核验救援端到端场景
npm test -- tests/reliability-rescue.e2e.test.ts
```

---

## 11. 故障排查

| 现象 | 检查项 |
|------|--------|
| 心跳似乎没有执行 | 检查 `HEARTBEAT.md` 是否把检查项标记为 `- [ ]`；检查 `memory/heartbeat-state.json` 的 `lastRunAt` 是否更新 |
| 自动救援没有触发 | 检查 `OPENCODE_HOST` 是否为 loopback、`RELIABILITY_LOOPBACK_ONLY` 是否开启、失败次数/窗口是否达到阈值 |
| 自动救援被拒绝 | 检查 `logs/reliability-audit.jsonl` 的 `reason` 字段 |
| 找不到备份配置 | 检查 `logs/reliability-audit.jsonl` 的 `backupPath` |
| Cron 任务不执行 | 检查 `RELIABILITY_CRON_ENABLED` 和任务状态 |
