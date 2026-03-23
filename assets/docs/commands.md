# 命令速查手册

本文档列出所有平台支持的命令及其详细说明。

---

## 飞书命令

### 基础命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助信息 | `/help` |
| `/panel` | 打开控制面板（模型、角色、强度） | `/panel` |
| `/status` | 查看当前群绑定状态 | `/status` |

### 模型与角色

| 命令 | 说明 | 示例 |
|------|------|------|
| `/model` | 查看当前使用的模型 | `/model` |
| `/model <provider:model>` | 切换模型 | `/model anthropic/claude-sonnet-4-5-20250929` |
| `/effort` | 查看当前会话推理强度 | `/effort` |
| `/effort <档位>` | 设置会话默认强度 | `/effort high` |
| `/effort default` | 清除会话强度，回到模型默认 | `/effort default` |
| `/fast` | 强度快捷命令（low） | `/fast` |
| `/balanced` | 强度快捷命令（medium） | `/balanced` |
| `/deep` | 强度快捷命令（high） | `/deep` |
| `/agent` | 查看当前 Agent | `/agent` |
| `/agent <name>` | 切换 Agent | `/agent general` |
| `/agent off` | 关闭 Agent，回到默认 | `/agent off` |
| `/role create <规格>` | 斜杠形式创建自定义角色 | `/role create 名称=助手` |
| `创建角色 名称=...; 描述=...` | 自然语言创建自定义角色 | `创建角色 名称=旅行助手; 描述=擅长制定旅行计划` |

### 会话管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `/stop` | 中断当前会话执行 | `/stop` |
| `/undo` | 撤回上一轮交互（OpenCode + 飞书同步） | `/undo` |
| `/compact` | 压缩当前会话上下文 | `/compact` |
| `/sessions` | 列出当前项目会话 | `/sessions` |
| `/sessions all` | 列出所有项目的全部会话 | `/sessions all` |
| `/session new` | 开启新话题（重置上下文） | `/session new` |
| `/session new <路径或别名>` | 在指定项目/目录中新建会话 | `/session new /home/user/project` |
| `/session new --name <名称>` | 创建会话时直接命名 | `/session new --name 需求分析` |
| `/session <sessionId>` | 手动绑定已有 OpenCode 会话 | `/session ses_xxx` |
| `/rename <新名称>` | 重命名当前会话 | `/rename 新功能开发` |
| `/clear` | 等价于 `/session new` | `/clear` |
| `/clear free session` | 手动触发清理扫描 | `/clear free session` |
| `/clear free session <sessionId>` | 删除指定会话 | `/clear free session ses_xxx` |

### 项目与目录

| 命令 | 说明 | 示例 |
|------|------|------|
| `/project list` | 列出可用项目（别名 + 历史目录） | `/project list` |
| `/project default` | 查看当前群默认项目 | `/project default` |
| `/project default set <路径或别名>` | 设置当前群的默认工作项目 | `/project default set frontend` |
| `/project default clear` | 清除当前群默认项目 | `/project default clear` |

### 文件与 Shell

| 命令 | 说明 | 示例 |
|------|------|------|
| `/send <绝对路径>` | 发送指定路径的文件到当前群聊 | `/send /home/user/report.pdf` |
| `!<shell 命令>` | 透传白名单 shell 命令 | `!ls -la`、`!pwd`、`!git status` |

### 群组管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `/create_chat` / `/建群` | 私聊中调出建群卡片 | `/create_chat` |
| `/restart opencode` | 重启本地 OpenCode 进程（仅 loopback） | `/restart opencode` |

### Cron 管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `/cron list` | 列出所有运行时 Cron 任务 | `/cron list` |
| `/cron add <规格>` | 添加 Cron 任务 | `/cron add 每天早上 8 点发送日报` |
| `/cron remove <jobId>` | 删除 Cron 任务 | `/cron remove job_123` |
| `/cron pause <jobId>` | 暂停 Cron 任务 | `/cron pause job_123` |
| `/cron resume <jobId>` | 恢复 Cron 任务 | `/cron resume job_123` |

### 命名空间命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `//<命令名>` | 透传命名空间 slash 命令 | `//superpowers:brainstorming` |
| `/commands` | 生成并发送最新命令清单文件 | `/commands` |

---

## Discord 命令

> 推荐使用 `///` 前缀避免与原生 Slash 命令冲突。

### 会话管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `///session` | 查看当前频道绑定的 OpenCode 会话 | `///session` |
| `///new [名称]` | 新建并绑定会话 | `///new 需求讨论` |
| `///new --dir <路径/别名>` | 在指定目录新建会话 | `///new --dir frontend` |
| `///new-channel [名称]` | 新建会话频道并绑定 | `///new-channel ai-chat` |
| `///bind <sessionId>` | 绑定已有会话 | `///bind ses_xxx` |
| `///unbind` | 仅解绑当前频道会话 | `///unbind` |
| `///rename <新名称>` | 重命名当前会话 | `///rename 新功能` |
| `///sessions` | 查看最近可绑定会话 | `///sessions` |
| `///undo` | 回撤上一轮 | `///undo` |
| `///compact` / `///compat` | 压缩上下文 | `///compact` |
| `///clear` | 删除并解绑当前频道会话 | `///clear` |

### 模型与强度

| 命令 | 说明 | 示例 |
|------|------|------|
| `///effort` | 查看当前强度 | `///effort` |
| `///effort <档位>` | 设置会话默认强度 | `///effort high` |
| `///effort default` | 清除会话强度 | `///effort default` |

### 项目与文件

| 命令 | 说明 | 示例 |
|------|------|------|
| `///workdir` | 查看当前工作目录 | `///workdir` |
| `///workdir <路径/别名>` | 设置工作目录 | `///workdir /home/user/project` |
| `///workdir clear` | 清除工作目录 | `///workdir clear` |
| `///send <绝对路径>` | 发送白名单文件到当前频道 | `///send /home/user/report.pdf` |
| `发送文件 <绝对路径>` | 中文自然语言触发发送文件 | `发送文件 /home/user/doc.pdf` |

### 控制面板

| 命令 | 说明 | 示例 |
|------|------|------|
| `///create_chat` | 打开下拉会话控制面板 | `///create_chat` |
| `///create_chat model <页码>` | 打开模型分页面板 | `///create_chat model 1` |
| `///create_chat session/agent/effort` | 打开分类面板 | `///create_chat session` |
| `///restart opencode` | 重启本地 OpenCode 进程 | `///restart opencode` |

### Cron 管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `///cron ...` | 管理运行时 Cron 任务 | `///cron list` |

---

## 企业微信命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助 | `/help` |
| `/panel` | 打开控制面板 | `/panel` |
| `/model <provider:model>` | 切换模型 | `/model anthropic/claude-sonnet-4-5-20250929` |
| `/agent <name>` | 切换 Agent | `/agent general` |
| `/session new` | 开启新话题 | `/session new` |
| `/undo` | 撤回上一轮交互 | `/undo` |
| `/compact` | 压缩上下文 | `/compact` |

---

## Telegram 命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助 | `/help` |
| `/panel` | 打开控制面板 | `/panel` |
| `/model <provider:model>` | 切换模型 | `/model anthropic/claude-sonnet-4-5-20250929` |
| `/agent <name>` | 切换 Agent | `/agent general` |
| `/session new` | 开启新话题 | `/session new` |
| `/undo` | 撤回上一轮交互 | `/undo` |
| `/compact` | 压缩上下文 | `/compact` |

---

## QQ 命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助 | `/help` |
| `/panel` | 打开控制面板 | `/panel` |
| `/model <provider:model>` | 切换模型 | `/model anthropic/claude-sonnet-4-5-20250929` |
| `/agent <name>` | 切换 Agent | `/agent general` |
| `/session new` | 开启新话题 | `/session new` |
| `/undo` | 撤回上一轮交互 | `/undo` |
| `/compact` | 压缩上下文 | `/compact` |

---

## WhatsApp 命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助 | `/help` |
| `/panel` | 打开控制面板 | `/panel` |
| `/model <provider:model>` | 切换模型 | `/model anthropic/claude-sonnet-4-5-20250929` |
| `/agent <name>` | 切换 Agent | `/agent general` |
| `/session new` | 开启新话题 | `/session new` |
| `/undo` | 撤回上一轮交互 | `/undo` |
| `/compact` | 压缩上下文 | `/compact` |

---

## 微信个人号命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助 | `/help` |
| `/panel` | 打开控制面板 | `/panel` |
| `/model <provider:model>` | 切换模型 | `/model anthropic/claude-sonnet-4-5-20250929` |
| `/agent <name>` | 切换 Agent | `/agent general` |
| `/session new` | 开启新话题 | `/session new` |
| `/undo` | 撤回上一轮交互 | `/undo` |
| `/compact` | 压缩上下文 | `/compact` |

---

## 说明

### 兼容命令

已保留兼容命令：`/session`、`/new`、`/new-session`、`/clear`。

### Discord 特性

- `///create_chat` 使用 Discord 下拉菜单与弹窗（Modal），用于补齐会话控制体验
- `///clear` 在会话频道（topic 带 `oc-session:`）中会尝试直接删除频道；若权限不足则只解绑
- `!` 透传仅支持白名单命令；`vi`/`vim`/`nano` 等交互式编辑器不会透传

### 强度覆盖

- 单条临时覆盖可在消息开头使用 `#low` / `#high` / `#max` / `#xhigh`（仅当前条生效）
- 强度优先级：`#临时覆盖` > `///effort 会话默认` > 模型默认

### 列表格式

- `///sessions` 列表列顺序固定为：`工作区目录 | SessionID | OpenCode 侧会话名称 | 绑定群明细 | 当前会话状态`
- `///create_chat` 下拉标签顺序固定为：`工作区 / Session 短 ID / 简介`，并按工作区聚合展示
