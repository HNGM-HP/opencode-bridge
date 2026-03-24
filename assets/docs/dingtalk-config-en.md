# DingTalk Bot Configuration Guide

This document explains how to configure DingTalk bot integration with this system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Create DingTalk Application](#create-dingtalk-application)
- [Configure Bot Permissions](#configure-bot-permissions)
- [Obtain Credentials](#obtain-credentials)
- [Configure in System](#configure-in-system)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- DingTalk enterprise account (with admin privileges)
- Created DingTalk enterprise organization

---

## Create DingTalk Application

### Step 1: Access DingTalk Open Platform

1. Visit [DingTalk Open Platform](https://open-dev.dingtalk.com/)
2. Scan QR code with DingTalk App to login

### Step 2: Create Enterprise Internal Application

1. Click **「应用开发」** (Application Development) in the left menu
2. Select **「企业内部开发」** (Enterprise Internal Development)
3. Click **「创建应用」** (Create Application)
4. Fill in application information:
   - **Application Name**: e.g., `AI Assistant Bot`
   - **Application Description**: e.g., `Intelligent Conversation Assistant`
   - **Application Logo**: Upload an icon

### Step 3: Add Bot Capability

1. Go to application details page
2. Find **「机器人与消息推送」** (Bot & Message Push) in the left menu
3. Click **「机器人配置」** (Bot Configuration)
4. Fill in bot information:
   - **Bot Name**: e.g., `AI Assistant`
   - **Bot Description**: e.g., `Intelligent Conversation Assistant`
   - **Message Receive Mode**: Select **「Stream Mode」** (Important!)

---

## Configure Bot Permissions

### Required Permissions

In the application details page, click **「权限管理」** (Permission Management) and apply for the following permissions:

| Permission Name | Permission Code | Purpose |
|----------------|-----------------|---------|
| Enterprise Message Notification | `im:message` | Send and receive messages |
| Get and Update Group Conversation | `im:chat` | Group chat message processing |
| Contact Read-only Permission | `qyapi_get_member` | Get user information (optional) |
| Contact Department Member Read Permission | `qyapi_get_department_member` | Get department members (optional) |

### Permission Application Steps

1. Search for permission name in the "Permission Management" page
2. Click **「申请权限」** (Apply Permission)
3. Fill in the reason (e.g., for bot message sending and receiving)
4. Wait for admin approval (usually instant)

### Permission Scope Explanation

```
im:message
├── im:message:send_as_bot    # Send messages as bot
├── im:message:readonly        # Read message content
└── im:message.group_msg       # Group message permission

im:chat
├── im:chat:readonly           # Read group information
└── im:chat:write              # Create/modify group information
```

---

## Obtain Credentials

### Get AppKey and AppSecret

1. Go to application details page
2. Click **「凭证与基础信息」** (Credentials & Basic Info) in the left menu
3. Copy the following information:
   - **AppKey** (i.e., Client ID)
   - **AppSecret** (i.e., Client Secret)

> ⚠️ **Important**: AppSecret is only displayed once, please save it securely!

### Get CorpId (Optional)

For multi-enterprise support, you also need to get the enterprise CorpId:

1. Click on the enterprise name in the top left corner
2. Find **「CorpId」** in the enterprise information

---

## Configure in System

### Via Web Management Interface

1. Open Web Management Interface
2. Go to **「平台接入配置」** (Platform Configuration)
3. Find **「钉钉配置」** (DingTalk Configuration) card
4. Enable **「启用钉钉」** (Enable DingTalk) switch
5. Click **「添加钉钉账号」** (Add DingTalk Account)
6. Fill in the following information:

| Field | Description |
|-------|-------------|
| Account ID | Custom identifier (e.g., `default`), used to distinguish multiple bots |
| AppKey | AppKey from DingTalk application details page |
| AppSecret | AppSecret from DingTalk application details page |
| Name | Optional, for easy identification |
| API Endpoint | Default `https://api.dingtalk.com`, usually no need to modify |

7. Click **「保存」** (Save)
8. **Restart service** for configuration to take effect

### Via Database Configuration

Insert database record directly:

```sql
INSERT INTO dingtalk_accounts (account_id, client_id, client_secret, enabled)
VALUES ('default', 'dingxxxxxxxxx', 'your_app_secret', 1);
```

### Environment Variables

```bash
PLATFORM_DINGTALK_ENABLED=true
```

---

## Troubleshooting

### Q1: No response when sending messages, no logs output

**Possible causes and solutions**:

1. **Application not published**
   - Go to DingTalk Open Platform → Version Management → Publish Application
   - At least publish to "Development Version" or "Test Version"

2. **Bot message receive mode incorrect**
   - Confirm **「Stream Mode」** is selected, not "Webhook Mode"

3. **Permissions not applied or not effective**
   - Check if `im:message` and `im:chat` permissions are applied
   - Wait for permission approval to take effect (usually instant)

4. **Account not enabled**
   - Confirm account status is "Enabled" in Web Management Interface
   - Check database `dingtalk_accounts.enabled = 1`

5. **Service not restarted**
   - Configuration changes require service restart

### Q2: Connection failed, error 400

**Symptoms**: Log shows "Request failed with status code 400"

**Solutions**:
- Check if AppKey and AppSecret are correct
- Confirm no extra spaces or newlines
- Confirm AppKey starts with `ding`

### Q3: Connection failed, error 401

**Symptoms**: Log shows "401 Unauthorized"

**Solutions**:
- AppKey or AppSecret is incorrect
- Application has been deleted or disabled
- Re-obtain credentials and update configuration

### Q4: Stream connection successful but no messages received

**Checklist**:
1. Whether bot has been added to group or private chat
2. Whether messages are filtered by DingTalk (e.g., sensitive words)
3. Whether detailed logs are viewed in "Debug Mode"

### Q5: Bot doesn't reply in group chat

**Possible causes**:
- Group chat may require @bot to trigger (depending on configuration)
- Check `requireMention` configuration

---

## Debug Tips

### Enable Debug Logging

Enable debug mode in account configuration:

```sql
UPDATE dingtalk_accounts SET debug = 1 WHERE account_id = 'default';
```

### View Connection Status

```bash
# View service logs
tail -f logs/bridge.log | grep -i dingtalk
```

### Test Stream Connection

```bash
# Use curl to test API connectivity
curl -X POST https://api.dingtalk.com/v1.0/oauth2/accessToken \
  -H "Content-Type: application/json" \
  -d '{"appKey":"your_app_key","appSecret":"your_app_secret"}'
```

---

## Related Links

- [DingTalk Open Platform](https://open-dev.dingtalk.com/)
- [DingTalk Development Documentation](https://open.dingtalk.com/document/orgapp/overview-of-group-robots)
- [dingtalk-stream SDK](https://www.npmjs.com/package/dingtalk-stream)

---

## Update History

| Date | Version | Description |
|------|---------|-------------|
| 2026-03-24 | v1.0 | Initial version |