import {
  type PermissionCardData,
  type StatusCardData,
  type MarkdownCardPage,
  type HelpShortcutAction,
  type ShortcutCardData,
  type HelpCardData,
  type ControlCardData,
  type SessionCtlSessionOption,
  type SessionControlCardData,
  type SessionListActionCardData,
  type SessionListCardEntry,
  type SessionListCardData,
  type QuestionOption,
  type QuestionInfo,
  type QuestionCardData,
  type CreateChatSessionOption,
  type CreateChatCardData,
  SESSION_CTL_CURRENT_VALUE,
  SESSION_CTL_NEW_VALUE,
  QUESTION_OPTION_PAGE_SIZE,
  CREATE_CHAT_NEW_SESSION_VALUE,
} from './cards-types.js';

import {
  wrapText,
  formatOptionDescription,
  resolveCreateChatCardState,
  buildCreateChatSelectorElements,
} from './cards-utils.js';



export function buildPermissionCard(data: PermissionCardData): object {
  const riskColor = data.risk === 'high' ? 'red' : data.risk === 'medium' ? 'orange' : 'green';
  const riskText = data.risk === 'high' ? '⚠️ 高风险' : data.risk === 'medium' ? '⚡ 中等风险' : '✅ 低风险';

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '🔐 权限确认请求',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**工具名称**: ${data.tool}`,
        },
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**操作描述**: ${data.description}`,
        },
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**风险等级**: <font color="${riskColor}">${riskText}</font>`,
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '✅ 允许',
            },
            type: 'primary',
            value: {
              action: 'permission_allow',
              sessionId: data.sessionId,
              permissionId: data.permissionId,
              remember: false,
              ...(data.parentSessionId ? { parentSessionId: data.parentSessionId } : {}),
              ...(data.relatedSessionId ? { relatedSessionId: data.relatedSessionId } : {}),
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '❌ 拒绝',
            },
            type: 'danger',
            value: {
              action: 'permission_deny',
              sessionId: data.sessionId,
              permissionId: data.permissionId,
              ...(data.parentSessionId ? { parentSessionId: data.parentSessionId } : {}),
              ...(data.relatedSessionId ? { relatedSessionId: data.relatedSessionId } : {}),
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '📝 始终允许此工具',
            },
            type: 'default',
            value: {
              action: 'permission_allow',
              sessionId: data.sessionId,
              permissionId: data.permissionId,
              remember: true,
              ...(data.parentSessionId ? { parentSessionId: data.parentSessionId } : {}),
              ...(data.relatedSessionId ? { relatedSessionId: data.relatedSessionId } : {}),
            },
          },
        ],
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: '也可以直接回复 y 或 n 来确认',
          },
        ],
      },
    ],
  };
}


export function buildStatusCard(data: StatusCardData): object {
  const statusMap = {
    running: { text: '⏳ 执行中', color: 'blue' },
    completed: { text: '✅ 已完成', color: 'green' },
    failed: { text: '❌ 执行失败', color: 'red' },
    aborted: { text: '⏹️ 已中断', color: 'orange' },
  };

  const status = statusMap[data.status];

  const elements: object[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**状态**: <font color="${status.color}">${status.text}</font>`,
      },
    },
  ];

  if (data.currentTool) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**当前工具**: ${data.currentTool}`,
      },
    });
  }

  if (data.progress) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**进度**: ${data.progress}`,
      },
    });
  }

  if (data.output) {
    elements.push({
      tag: 'hr',
    });
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: data.output.slice(0, 2000), // 飞书卡片内容限制
      },
    });
  }

  // 运行中时显示中断按钮
  if (data.status === 'running') {
    elements.push({
      tag: 'hr',
    });
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '⏹️ 中断执行',
          },
          type: 'danger',
          value: {
            action: 'abort',
            sessionId: data.sessionId,
          },
        },
      ],
    });
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '🤖 OpenCode 执行状态',
      },
      template: status.color,
    },
    elements,
  };
}


export function buildMarkdownCard(page: MarkdownCardPage): object {
  const content = page.markdown.trim() || '（无内容）';
  return {
    schema: '2.0',
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: page.title,
      },
      template: page.template || 'blue',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content,
        },
      ],
    },
  };
}


export function buildHelpCard(data: HelpCardData): object {
  const shortcutRows: HelpShortcutAction[][] = [];
  for (let index = 0; index < data.shortcuts.length; index += 3) {
    shortcutRows.push(data.shortcuts.slice(index, index + 3));
  }

  const elements: object[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: data.markdown.trim() || '（无内容）',
      },
    },
  ];

  if (shortcutRows.length > 0) {
    elements.push({
      tag: 'hr',
    });
    elements.push({
      tag: 'markdown',
      content: '**快捷命令**\n点击后会直接执行对应命令。',
    });

    for (const row of shortcutRows) {
      elements.push({
        tag: 'action',
        actions: row.map(item => ({
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: item.label,
          },
          type: 'default',
          value: {
            action: 'help_run_command',
            command: item.command,
            chatId: data.chatId,
            chatType: data.chatType,
          },
        })),
      });
    }
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: data.title,
      },
      template: data.template || 'blue',
    },
    elements,
  };
}

export function buildShortcutCommandCard(data: ShortcutCardData): object {
  const shortcutRows: HelpShortcutAction[][] = [];
  for (let index = 0; index < data.shortcuts.length; index += 3) {
    shortcutRows.push(data.shortcuts.slice(index, index + 3));
  }

  const resolveShortcutActionValue = (item: HelpShortcutAction): Record<string, unknown> => {
    if (item.command.trim() === '/create_chat') {
      return {
        action: 'create_chat',
        chatId: data.chatId,
        chatType: data.chatType,
      };
    }

    return {
      action: 'help_run_command',
      command: item.command,
      chatId: data.chatId,
      chatType: data.chatType,
    };
  };

  const elements: object[] = [];
  if (data.description?.trim()) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: data.description.trim(),
      },
    });
  }

  for (const row of shortcutRows) {
    elements.push({
      tag: 'action',
      actions: row.map(item => ({
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: item.label,
        },
        type: 'default',
        value: resolveShortcutActionValue(item),
      })),
    });
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: data.title,
      },
      template: data.template || 'blue',
    },
    elements,
  };
}

// 控制面板卡片


export function buildControlCard(data: ControlCardData): object {
  const modelOptions = data.models.map(item => ({
    text: { tag: 'plain_text', content: item.label },
    value: item.value,
  }));

  const agentOptions = data.agents.map(item => ({
    text: { tag: 'plain_text', content: item.label },
    value: item.value,
  }));

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '🎛️ 模型与角色面板',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**当前模型**: ${data.currentModel || '跟随默认'}\n**当前角色**: ${data.currentAgent || '默认角色'}\n**当前强度**: ${data.currentEffort || '默认（自动）'}（用 /effort 修改）`,
        },
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '⏹️ 停止' },
            type: 'danger',
            value: { action: 'stop', conversationKey: data.conversationKey, chatId: data.chatId, chatType: data.chatType },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '↩️ 撤回' },
            type: 'default',
            value: { action: 'undo', conversationKey: data.conversationKey, chatId: data.chatId, chatType: data.chatType },
          },
        ],
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'select_static',
            placeholder: { tag: 'plain_text', content: '选择模型' },
            value: { action: 'model_select', conversationKey: data.conversationKey, chatId: data.chatId, chatType: data.chatType },
            options: modelOptions,
          },
        ],
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'select_static',
            placeholder: { tag: 'plain_text', content: '选择角色' },
            value: { action: 'agent_select', conversationKey: data.conversationKey, chatId: data.chatId, chatType: data.chatType },
            options: agentOptions,
          },
        ],
      },
    ],
  };
}


export function buildSessionControlCard(data: SessionControlCardData): object {
  const shownExistingCount = data.sessionOptions.filter(option =>
    option.value !== SESSION_CTL_CURRENT_VALUE && option.value !== SESSION_CTL_NEW_VALUE
  ).length;
  const totalSessionCount = typeof data.totalSessionCount === 'number' && data.totalSessionCount >= shownExistingCount
    ? data.totalSessionCount
    : shownExistingCount;
  const selected = data.selectedSessionId || SESSION_CTL_CURRENT_VALUE;
  const formElements: object[] = [
    {
      tag: 'select_static',
      name: 'session_target',
      placeholder: { tag: 'plain_text', content: '选择会话' },
      options: data.sessionOptions.map(option => ({
        text: { tag: 'plain_text', content: option.label },
        value: option.value,
      })),
    },
    {
      tag: 'input',
      name: 'session_name',
      placeholder: {
        tag: 'plain_text',
        content: '会话名称（切换到其他会话时可留空）',
      },
    },
  ];

  formElements.push({
    tag: 'button',
    text: { tag: 'plain_text', content: '确认提交' },
    type: 'primary',
    action_type: 'form_submit',
    name: 'session_ctl_submit',
    value: {
      action: 'session_ctl_submit',
      chatId: data.chatId,
      chatType: data.chatType,
      selectedSessionId: selected,
    },
  });

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '🧭 会话控制面板',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: [
            `**当前会话工作区目录**: \`${data.currentDirectory}\``,
            `**SessionID**: \`${data.currentSessionId}\``,
            `**OpenCode侧会话名称**: ${data.currentSessionTitle}`,
          ].join('\n'),
        },
      },
      {
        tag: 'form',
        name: 'session_ctl_form',
        elements: formElements,
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: [
              '选择“当前会话”时：输入名称后提交，将修改当前会话名称。',
              '选择“新建 OpenCode 会话”时：名称可留空，留空则使用默认命名规则。',
              '选择其他会话时：将先切换到目标会话；若填写名称，则会在切换后顺带重命名该会话。',
              totalSessionCount > shownExistingCount
                ? `当前仅展示最近 ${shownExistingCount} 个可切换会话（总计 ${totalSessionCount} 个）。`
                : '未主动选择时默认按“当前会话”处理。',
            ].join('\n'),
          },
        ],
      },
    ],
  };
}


export function buildSessionListActionCard(data: SessionListActionCardData): object {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: data.title,
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: data.markdown,
        },
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '切换至此Session',
            },
            type: 'primary',
            value: {
              action: 'session_list_switch',
              sessionId: data.sessionId,
              chatId: data.chatId,
              chatType: data.chatType,
            },
          },
        ],
      },
    ],
  };
}


export function buildSessionListCard(data: SessionListCardData): object {
  const elements: object[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: data.summaryMarkdown.trim() || '（无内容）',
      },
    },
  ];

  data.entries.forEach((entry, index) => {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: entry.markdown,
      },
    });
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '切换至此Session',
          },
          type: 'primary',
          value: {
            action: 'session_list_switch',
            sessionId: entry.sessionId,
            chatId: data.chatId,
            chatType: data.chatType,
          },
        },
      ],
    });

    if (index < data.entries.length - 1) {
      elements.push({
        tag: 'hr',
      });
    }
  });

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: data.title,
      },
      template: 'blue',
    },
    elements,
  };
}

// AI 提问卡片 (question 工具)


// 文字选择方案：只读卡片 + 跳过按钮
export function buildQuestionCardV2(data: QuestionCardData): object {
  const elements: object[] = [];
  const totalQuestions = data.questions.length;
  const safeIndex = totalQuestions > 0
    ? Math.min(Math.max(data.currentQuestionIndex ?? 0, 0), totalQuestions - 1)
    : 0;
  const question = data.questions[safeIndex];

  const titleLines = [`**问题 ${safeIndex + 1}/${totalQuestions}**`];
  if (question.header) titleLines.push(question.header);
  if (question.question) titleLines.push(question.question);

  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: titleLines.join('\n'),
    },
  });

  if (question.options.length > 0) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const descriptionLines = question.options.map((opt, optIndex) => {
      const number = optIndex + 1;
      const letter = optIndex < letters.length ? letters[optIndex] : '';
      const prefix = letter ? `${letter}(${number}).` : `${number}.`;
      const desc = opt.description ? formatOptionDescription(opt.description) : '';
      return `${prefix} **${opt.label}**${desc ? `: ${desc}` : ''}`;
    }).join('\n');
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: descriptionLines,
      },
    });
  }

  const hint = question.multiple
    ? '多选请用逗号或空格分隔（如 A,C 或 1 3），或直接回复自定义内容；也可输入“跳过”或点击下方按钮'
    : '回复 A 或 1，或直接回复自定义内容（不匹配选项将按自定义处理）；也可输入“跳过”或点击下方按钮';
  elements.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content: hint,
      },
    ],
  });

  elements.push({
    tag: 'action',
    actions: [
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: '⏭️ 跳过本题',
        },
        type: 'default',
        value: {
          action: 'question_skip',
          requestId: data.requestId,
          chatId: data.chatId,
          questionIndex: safeIndex,
        },
      },
    ],
  });

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '🤔 AI 需要你的输入',
      },
      template: 'orange',
    },
    elements,
  };
}

// 已回答的问题卡片（更新后的状态）
export function buildQuestionAnsweredCard(answers: string[][]): object {
  // 格式化答案展示
  const answerTexts = answers.map((ans, i) => {
    const answerStr = ans.length > 0 ? ans.join(', ') : '(未回答)';
    return answers.length > 1 ? `**问题 ${i + 1}**: ${answerStr}` : `**你的回答**: ${answerStr}`;
  });

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '✅ 已回答',
      },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: answerTexts.join('\n'),
        },
      },
    ],
  };
}

// 兼容旧的单字符串调用
export function buildQuestionAnsweredCardSimple(answer: string): object {
  return buildQuestionAnsweredCard([[answer]]);
}


export function buildCreateChatCard(data: CreateChatCardData): object {
  const elements: object[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '选择新群要绑定的会话。你可以创建全新会话，也可以绑定已有会话继续上下文。',
      },
    },
    ...buildCreateChatSelectorElements(data),
  ];

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '🧭 新建会话群',
      },
      template: 'blue',
    },
    elements,
  };
}

// 欢迎卡片（引导创建群聊）
export function buildWelcomeCard(userName: string, createChatData?: CreateChatCardData): object {
  const baseElements: object[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `你好 **${userName}**，我是你的 AI 助手。\n\n你现在可以直接在私聊继续对话。\n\n如果你需要并行处理多个任务，建议创建专属会话群：每个群独立上下文，任务更清晰、不易串线。`,
      },
    },
  ];

  if (createChatData) {
    baseElements.push(...buildCreateChatSelectorElements(createChatData));
  } else {
    baseElements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '➕ 创建新会话群',
          },
          type: 'primary',
          value: {
            action: 'create_chat',
          },
        },
      ],
    });
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '👋 欢迎使用 OpenCode',
      },
      template: 'blue',
    },
    elements: baseElements,
  };
}

// ── 类型与常量重导出（向后兼容） ────────────

export type {
  PermissionCardData,
  StatusCardData,
  MarkdownCardPage,
  HelpShortcutAction,
  ShortcutCardData,
  HelpCardData,
  ControlCardData,
  SessionCtlSessionOption,
  SessionControlCardData,
  SessionListActionCardData,
  SessionListCardEntry,
  SessionListCardData,
  QuestionOption,
  QuestionInfo,
  QuestionCardData,
  CreateChatSessionOption,
  CreateChatCardData,
} from './cards-types.js';

export {
  SESSION_CTL_CURRENT_VALUE,
  SESSION_CTL_NEW_VALUE,
  QUESTION_OPTION_PAGE_SIZE,
  CREATE_CHAT_NEW_SESSION_VALUE,
} from './cards-types.js';
