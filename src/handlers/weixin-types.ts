/**
 * 微信处理器类型定义与常量
 *
 * 从 weixin.ts 提取。
 */

export const WEIXIN_MESSAGE_LIMIT = 1800;

export const WEIXIN_HELP_TEXT = `📖 **微信 × OpenCode 机器人指南**

**基础操作**
- 可以直接在聊天窗口发送消息与 AI 对话
- 发送 /help 获取本帮助

**常用命令**
\`/model\` - 查看当前模型
\`/model <名称>\` - 切换模型
\`/models\` - 列出所有可用模型
\`/agent\` - 查看当前角色
\`/agent <名称>\` - 切换角色
\`/agents\` - 列出所有可用角色
\`/status\` - 查看当前状态
\`/session\` - 列出当前项目的会话
\`/session new\` - 开启新话题
\`/sessions all\` - 列出所有会话
\`/clear\` - 清空对话上下文
\`/stop\` - 停止当前生成
\`/help\` - 显示此帮助

**权限确认**
当 AI 需要执行敏感操作时，会回复一条带按钮的消息。
点击 ✅ 允许 或 ❌ 拒绝 即可快速确认。`;

export type ParsedQuestionAnswer = { type: 'skip' | 'custom' | 'selection'; values?: string[]; custom?: string };

export type OpencodeFilePartInput = { type: 'file'; mime: string; url: string; filename?: string };
export type OpencodePartInput = { type: 'text'; text: string } | OpencodeFilePartInput;

export type PermissionDecision = {
  allow: boolean;
  remember: boolean;
};
