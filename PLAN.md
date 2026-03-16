# BUG修复方案

## 当前状态

基于用户提供的截图和代码审查，发现以下三个待修复BUG：

---

## 问题分析

### Bug 1: 偶发性双重回复 (图1)

**现象**: 消息内容重复显示两次（”哥，收到。我在。” 和 “有什么需要我帮你处理的？” 各出现两次）

**根因分析**:
在 `opencode-event-hub.ts` 的 `handleMessagePartUpdated` 方法中，当 `delta` 为空字符串但 `part.text` 有值时（line 691-698），会调用 `appendTextFromPart`。这个方法内部会再次调用 `outputBuffer.append`，导致同一文本被追加两次。

代码路径:
1. line 659-669: delta是字符串且有内容时，正常追加到buffer
2. line 691-698: delta为空但part.type是'reasoning'时，调用 `appendReasoningFromPart`
3. `appendReasoningFromPart` 内部再次调用 `outputBuffer.appendThinking`

**这导致同一文本被追加两次**。

### Bug 2: 工具调用没有正确显示调用参数 (图2、图3)

**现象**: 工具调用只显示 `{}` 而不是实际的命令参数（如 `ls -la /Users/kvnew/work/test`）

**根因分析**:
在 `index.ts` 的 `buildToolTraceOutput` 函数 (line 1114-1151) 和 `tool-trace.ts` 中，提取工具输入参数的逻辑不完整。

当前代码只检查:
- `part.input`
- `part.args`
- `part.arguments`
- `state.input`
- `state.args`
- `state.arguments`

**缺少对以下字段的检查**:
- `part.raw`
- `part.rawInput`
- `state.raw`

从测试用例 `tool-trace.test.ts` 可以看出，OpenCode SDK 实际发送的数据结构包含 `state.raw` 字段，但代码没有提取这个字段。

### Bug 3: 权限请求”允许”偶发性失效

**现象**: 用户回复”允许”但权限没有正确响应

**根因分析**:
在 `action-handlers.ts` 的 `handlePermissionAction` 函数中 (line 141-218)，处理卡片点击”允许/拒绝”时，**只使用了一个固定的 sessionId**，没有考虑子会话的情况。

对比 `opencode-event-hub.ts` 中的权限处理 (line 331-361)，可以看到它尝试了多个候选 session:
```typescript
const candidateSessionIds = Array.from(
  new Set(
    [event.sessionId, event.parentSessionId, event.relatedSessionId]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  )
);
```

但 `action-handlers.ts` 中的卡片响应只使用了 actionValue 中传递的 sessionId，没有尝试父会话或相关会话。

此外，在 `tryHandlePendingPermissionByText` (line 221-281) 中，**当 respondToPermission 返回 false 时没有重试其他候选 session**。

---

## 修复方案

### 修复1: 双重回复问题

**文件**: `src/router/opencode-event-hub.ts`

**修改点**: 在 `handleMessagePartUpdated` 方法中，当 delta 为空字符串时，不应该再调用 `appendTextFromPart` 或 `appendReasoningFromPart`，因为这两个方法内部会再次调用 `outputBuffer.append`。

**修复策略**:
- 当 delta 是空字符串时，不再调用 `appendReasoningFromPart` 或 `appendTextFromPart`
- 这两个方法仅在 part 有实际内容变化时才应该被调用

### 修复2: 工具调用参数显示

**文件**: `src/opencode/tool-trace.ts` 和 `src/index.ts`

**修改点**: 在 `buildToolTraceOutput` 函数中，添加对 `raw` 和 `rawInput` 字段的提取。

**修复策略**:
在 `getFirstDisplayableToolInput` 调用链中增加:
- `part.raw`
- `part.rawInput`
- `state.raw`

### 修复3: 权限请求失效

**文件**: `src/router/action-handlers.ts`

**修改点1**: `handlePermissionAction` 函数需要像 `opencode-event-hub.ts` 那样尝试多个候选 session。

**修改点2**: `tryHandlePendingPermissionByText` 函数在 `respondToPermission` 失败时应该尝试其他候选 session。

**修复策略**:
1. 从 chatSessionStore 获取与当前会话相关的候选 session IDs
2. 依次尝试每个候选 session，直到成功
3. 如果所有候选都失败，再返回错误

---

## 实现步骤

### Phase 1: 修复工具调用参数显示 (最简单)
- [ ] 修改 `src/opencode/tool-trace.ts`
- [ ] 修改 `src/index.ts` 中的 `buildToolTraceOutput`

### Phase 2: 修复权限请求失效
- [ ] 修改 `src/router/action-handlers.ts`
- [ ] 添加候选 session 重试逻辑

### Phase 3: 修复双重回复问题
- [ ] 修改 `src/router/opencode-event-hub.ts`
- [ ] 移除 delta 为空时的重复追加逻辑

### Phase 4: 验证
- [ ] 运行测试确保修复有效
- [ ] 检查是否有回归问题

