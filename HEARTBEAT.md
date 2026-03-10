# HEARTBEAT Checklist

会话触发心跳检查清单（仅在入站消息触发且窗口到期时执行）。

格式说明：
- `- [ ] <failure_type>: <description>` 表示启用检查项。
- `- [x] <failure_type>: <description>` 表示暂时停用检查项。
- `<failure_type>` 必须是 `src/reliability/types.ts` 中的 `FailureType` 枚举值。

## Active Checks

- [ ] bridge_stale: 检查桥接会话映射/状态是否陈旧。
- [ ] opencode_tcp_down: 检查 OpenCode TCP 连通性异常信号。
- [ ] opencode_http_down: 检查 OpenCode HTTP 层可达性与响应。
- [ ] opencode_auth_invalid: 检查 OpenCode 鉴权异常（401/403）。
- [ ] event_stream_stale: 检查事件流停滞或心跳缺失。
