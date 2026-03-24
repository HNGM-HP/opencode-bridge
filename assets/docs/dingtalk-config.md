# 钉钉机器人配置指南

本文档说明如何配置钉钉机器人接入本系统。

## 目录

- [前置条件](#前置条件)
- [创建钉钉应用](#创建钉钉应用)
- [配置机器人权限](#配置机器人权限)
- [获取凭证](#获取凭证)
- [在系统中配置](#在系统中配置)
- [常见问题](#常见问题)

---

## 前置条件

- 钉钉企业账号（需要有管理员权限）
- 已创建的钉钉企业组织

---

## 创建钉钉应用

### 步骤 1：进入钉钉开放平台

1. 访问 [钉钉开放平台](https://open-dev.dingtalk.com/)
2. 使用钉钉 App 扫码登录

### 步骤 2：创建企业内部应用

1. 点击左侧菜单 **「应用开发」**
2. 选择 **「企业内部开发」**
3. 点击 **「创建应用」**
4. 填写应用信息：
   - **应用名称**：如 `AI 助手机器人`
   - **应用描述**：如 `智能对话助手`
   - **应用Logo**：上传应用图标

### 步骤 3：添加机器人能力

1. 进入应用详情页
2. 在左侧菜单找到 **「机器人与消息推送」**
3. 点击 **「机器人配置」**
4. 填写机器人信息：
   - **机器人名称**：如 `AI 助手`
   - **机器人描述**：如 `智能对话助手`
   - **消息接收模式**：选择 **「Stream 模式」**（重要！）

---

## 配置机器人权限

### 必需权限

在应用详情页，点击 **「权限管理」**，申请以下权限：

| 权限名称 | 权限码 | 用途 |
|---------|-------|------|
| 企业内消息通知 | `im:message` | 接收和发送消息 |
| 获取与更新群会话 | `im:chat` | 群聊消息处理 |
| 通讯录只读权限 | `qyapi_get_member` | 获取用户信息（可选） |
| 通讯录部门成员读权限 | `qyapi_get_department_member` | 获取部门成员（可选） |

### 权限申请步骤

1. 在「权限管理」页面搜索权限名称
2. 点击 **「申请权限」**
3. 填写申请理由（如：用于机器人消息收发）
4. 等待管理员审批（通常即时生效）

### 权限范围说明

```
im:message
├── im:message:send_as_bot    # 以机器人身份发送消息
├── im:message:readonly        # 读取消息内容
└── im:message.group_msg       # 群消息权限

im:chat
├── im:chat:readonly           # 读取群信息
└── im:chat:write              # 创建/修改群信息
```

---

## 获取凭证

### 获取 AppKey 和 AppSecret

1. 进入应用详情页
2. 点击左侧菜单 **「凭证与基础信息」**
3. 复制以下信息：
   - **AppKey**（即 Client ID）
   - **AppSecret**（即 Client Secret）

> ⚠️ **重要**：AppSecret 只显示一次，请妥善保存！

### 获取 CorpId（可选）

如需多企业支持，还需获取企业 CorpId：

1. 点击左上角企业名称
2. 在企业信息中找到 **「CorpId」**

---

## 在系统中配置

### 通过 Web 管理界面配置

1. 打开 Web 管理界面
2. 进入 **「平台接入配置」**
3. 找到 **「钉钉配置」** 卡片
4. 开启 **「启用钉钉」** 开关
5. 点击 **「添加钉钉账号」**
6. 填写以下信息：

| 字段 | 说明 |
|-----|------|
| 账号标识 | 自定义标识（如 `default`），用于区分多个机器人 |
| AppKey | 钉钉应用详情页的 AppKey |
| AppSecret | 钉钉应用详情页的 AppSecret |
| 名称 | 可选，方便识别 |
| API 端点 | 默认 `https://api.dingtalk.com`，通常无需修改 |

7. 点击 **「保存」**
8. **重启服务**使配置生效

### 通过数据库配置

直接插入数据库记录：

```sql
INSERT INTO dingtalk_accounts (account_id, client_id, client_secret, enabled)
VALUES ('default', 'dingxxxxxxxxx', 'your_app_secret', 1);
```

### 环境变量

```bash
PLATFORM_DINGTALK_ENABLED=true
```

---

## 常见问题

### Q1：发送消息无反应，日志也无输出

**可能原因及解决方案**：

1. **应用未发布**
   - 前往钉钉开放平台 → 版本管理 → 发布应用
   - 至少发布到「开发版」或「测试版」

2. **机器人消息接收模式错误**
   - 确认选择的是 **「Stream 模式」**，而非「Webhook 模式」

3. **权限未申请或未生效**
   - 检查 `im:message` 和 `im:chat` 权限是否已申请
   - 等待权限审批生效（通常即时）

4. **账号未启用**
   - 在 Web 管理界面确认账号状态为「已启用」
   - 检查数据库 `dingtalk_accounts.enabled = 1`

5. **服务未重启**
   - 配置修改后需要重启服务

### Q2：连接失败，报错 400

**症状**：日志显示 "Request failed with status code 400"

**解决方案**：
- 检查 AppKey 和 AppSecret 是否正确
- 确认没有多余的空格或换行符
- 确认 AppKey 以 `ding` 开头

### Q3：连接失败，报错 401

**症状**：日志显示 "401 Unauthorized"

**解决方案**：
- AppKey 或 AppSecret 错误
- 应用已被删除或禁用
- 重新获取凭证并更新配置

### Q4：Stream 连接成功但收不到消息

**检查清单**：
1. 机器人是否已添加到群聊或单聊
2. 发送的消息是否被钉钉过滤（如敏感词）
3. 是否在「调试模式」下查看详细日志

### Q5：群聊中机器人不回复

**可能原因**：
- 群聊需要 @机器人 才会触发（取决于配置）
- 检查 `requireMention` 配置

---

## 调试技巧

### 启用调试日志

在账号配置中启用调试模式：

```sql
UPDATE dingtalk_accounts SET debug = 1 WHERE account_id = 'default';
```

### 查看连接状态

```bash
# 查看服务日志
tail -f logs/bridge.log | grep -i dingtalk
```

### 测试 Stream 连接

```bash
# 使用 curl 测试 API 连通性
curl -X POST https://api.dingtalk.com/v1.0/oauth2/accessToken \
  -H "Content-Type: application/json" \
  -d '{"appKey":"your_app_key","appSecret":"your_app_secret"}'
```

---

## 相关链接

- [钉钉开放平台](https://open-dev.dingtalk.com/)
- [钉钉开发文档](https://open.dingtalk.com/document/orgapp/overview-of-group-robots)
- [dingtalk-stream SDK](https://www.npmjs.com/package/dingtalk-stream)

---

## 更新记录

| 日期 | 版本 | 说明 |
|-----|------|------|
| 2026-03-24 | v1.0 | 初始版本 |