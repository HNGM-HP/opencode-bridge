/**
 * 从 cards.ts 提取的纯辅助函数
 *
 * 这些函数不依赖 cards.ts 中的构建函数，仅依赖 cards-types.ts 中的类型定义。
 */

import {
  type CreateChatCardData,
  type CreateChatSessionOption,
  CREATE_CHAT_NEW_SESSION_VALUE,
} from './cards-types.js';

// ── 提问卡片文本格式化 ───────────────────────

const QUESTION_DESCRIPTION_MAX_LENGTH = 120;
const QUESTION_DESCRIPTION_LINE_LENGTH = 40;

function wrapText(text: string, lineLength: number): string {
  if (text.length <= lineLength) return text;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += lineLength) {
    parts.push(text.slice(i, i + lineLength));
  }
  return parts.join('\n    ');
}

function formatOptionDescription(description: string): string {
  const trimmed = description.trim().slice(0, QUESTION_DESCRIPTION_MAX_LENGTH);
  return wrapText(trimmed, QUESTION_DESCRIPTION_LINE_LENGTH);
}

// ── 创建群聊卡片辅助 ──────────────────────────

function resolveCreateChatCardState(data: CreateChatCardData): {
  options: CreateChatSessionOption[];
  selected: CreateChatSessionOption;
  shownExistingCount: number;
  totalSessionCount: number;
} {
  const options = data.sessionOptions.length > 0
    ? data.sessionOptions
    : [{ label: '新建 OpenCode 会话', value: CREATE_CHAT_NEW_SESSION_VALUE }];

  const selected = options.find(option => option.value === data.selectedSessionId) || options[0];
  const shownExistingCount = options.filter(option => option.value !== CREATE_CHAT_NEW_SESSION_VALUE).length;
  const totalSessionCount = typeof data.totalSessionCount === 'number' && data.totalSessionCount >= shownExistingCount
    ? data.totalSessionCount
    : shownExistingCount;

  return {
    options,
    selected,
    shownExistingCount,
    totalSessionCount,
  };
}

function buildCreateChatSelectorElements(data: CreateChatCardData): object[] {
  const state = resolveCreateChatCardState(data);
  const noteLines: string[] = [
    '请先在下拉中选择会话来源，再点击"创建群聊"。',
    `未主动选择时默认：${state.selected.label}`,
  ];

  if (!data.manualBindEnabled) {
    noteLines.push('当前环境已禁用"绑定已有会话"，仅可新建会话。');
  }

  if (state.totalSessionCount > state.shownExistingCount) {
    noteLines.push(`已展示最近 ${state.shownExistingCount} 个会话（总计 ${state.totalSessionCount} 个）。`);
  }

  // 所有交互元素放入同一个 form 容器，确保 input 值能通过 form_value 传递
  // 顺序：群名 → 会话来源 → 工作项目 → 自定义工作目录 → 提交按钮
  const formElements: object[] = [];

  // 1. 群名称输入框
  formElements.push({
    tag: 'input',
    name: 'chat_name',
    placeholder: { tag: 'plain_text', content: '群名称（可选，留空自动生成）' },
    ...(data.chatNameInput ? { default_value: data.chatNameInput } : {}),
  });

  // 2. 会话来源选择器（select_static 在 form 内直接使用，不包 action 容器）
  formElements.push({
    tag: 'select_static',
    name: 'session_source',
    placeholder: { tag: 'plain_text', content: '选择会话来源' },
    value: { action: 'create_chat_select' },
    options: state.options.map(option => ({
      text: { tag: 'plain_text', content: option.label },
      value: option.value,
    })),
  });

  // 3. 工作项目选择器（可选）
  const projectCandidates = data.projectOptions || [];
  const projectOpts = [
    { text: { tag: 'plain_text', content: '跟随默认项目' }, value: '__default__' },
    ...projectCandidates.map(project => ({
      text: {
        tag: 'plain_text',
        content: `${project.name}（${project.directory.length > 40 ? '...' + project.directory.slice(-37) : project.directory}）`,
      },
      value: project.directory,
    })),
  ];
  formElements.push({
    tag: 'select_static',
    name: 'project_source',
    placeholder: { tag: 'plain_text', content: '选择工作项目（可选）' },
    value: { action: 'create_chat_project_select' },
    options: projectOpts,
  });

  // 4. 自定义工作目录输入框（可选）
  if (data.allowCustomPath) {
    formElements.push({
      tag: 'input',
      name: 'custom_directory',
      placeholder: { tag: 'plain_text', content: '手动输入工作目录绝对路径（可选）' },
    });
  }

  // 5. 提交按钮
  formElements.push({
    tag: 'button',
    text: { tag: 'plain_text', content: '➕ 创建群聊' },
    type: 'primary',
    action_type: 'form_submit',
    name: 'create_chat_submit',
    value: {
      action: 'create_chat_submit',
      selectedSessionId: state.selected.value,
    },
  });

  const elements: object[] = [];
  elements.push({
    tag: 'form',
    name: 'create_chat_form',
    elements: formElements,
  });

  noteLines.push('工作项目决定 AI 在哪份代码上工作。未选择时使用默认项目。');
  elements.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content: noteLines.join('\n'),
      },
    ],
  });

  return elements;
}

export {
  wrapText,
  formatOptionDescription,
  resolveCreateChatCardState,
  buildCreateChatSelectorElements,
};
