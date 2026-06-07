/**
 * Cron 自然语言语义解析器
 *
 * 职责：
 * 1. 解析中文自然语言描述的定时任务（如"每天早上8点发送AI简报"）
 * 2. 提取 cron 表达式 + 任务名称 + 执行内容
 * 3. 支持每天/每周/每N分钟/每N小时等多种模式
 */
import type { CronIntent, CronIntentSource } from './cron-control-types.js';

// ──────────────────────────────────────────────
// 内部常量
// ──────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

// ──────────────────────────────────────────────
// 导出函数
// ──────────────────────────────────────────────

/**
 * 解析自然语言 / 结构化格式的定时任务描述文本，
 * 返回可直接用于创建或提示的 CronIntent。
 */
export function parseCronBodyIntent(bodyText: string, source: CronIntentSource): CronIntent {
  const body = bodyText.trim();
  if (!body) {
    return {
      action: 'help',
      source,
      argsText: '',
    };
  }

  if (/^(help|帮助|说明)$/iu.test(body)) {
    return {
      action: 'help',
      source,
      argsText: '',
    };
  }

  if (/^(list|列表|查看)$/iu.test(body)) {
    return {
      action: 'list',
      source,
      argsText: '',
    };
  }

  const removeMatch = body.match(/^(?:删除任务|删除|移除|remove)\s+(.+)$/iu);
  if (removeMatch) {
    return {
      action: 'remove',
      source,
      argsText: '',
      preset: { id: removeMatch[1].trim() },
    };
  }

  const pauseMatch = body.match(/^(?:暂停任务|暂停|停用|pause)\s+(.+)$/iu);
  if (pauseMatch) {
    return {
      action: 'pause',
      source,
      argsText: '',
      preset: { id: pauseMatch[1].trim() },
    };
  }

  const resumeMatch = body.match(/^(?:恢复任务|恢复|启用|resume)\s+(.+)$/iu);
  if (resumeMatch) {
    return {
      action: 'resume',
      source,
      argsText: '',
      preset: { id: resumeMatch[1].trim() },
    };
  }

  const normalizedBody = stripCreateTaskPrefix(body);

  const everyMinutesMatch = normalizedBody.match(/^(?:每|每隔)\s*(\d{1,2})\s*分钟\s*(?:执行|做|处理)?\s*(.+)$/u);
  if (everyMinutesMatch) {
    const minutes = Number.parseInt(everyMinutesMatch[1], 10);
    if (minutes < 1 || minutes > 59) {
      return {
        action: 'help',
        source,
        argsText: '',
      };
    }
    const textValue = everyMinutesMatch[2].trim();
    if (!textValue) {
      return {
        action: 'help',
        source,
        argsText: body,
      };
    }
    return {
      action: 'add',
      source,
      argsText: '',
      preset: {
        expr: `0 */${minutes} * * * *`,
        text: textValue,
        name: buildNaturalJobName(textValue),
      },
    };
  }

  const everyHoursMatch = normalizedBody.match(/^(?:每|每隔)\s*(\d{1,2})\s*小时\s*(?:执行|做|处理)?\s*(.+)$/u);
  if (everyHoursMatch) {
    const hours = Number.parseInt(everyHoursMatch[1], 10);
    if (hours < 1 || hours > 23) {
      return {
        action: 'help',
        source,
        argsText: '',
      };
    }
    const textValue = everyHoursMatch[2].trim();
    if (!textValue) {
      return {
        action: 'help',
        source,
        argsText: body,
      };
    }
    return {
      action: 'add',
      source,
      argsText: '',
      preset: {
        expr: `0 0 */${hours} * * *`,
        text: textValue,
        name: buildNaturalJobName(textValue),
      },
    };
  }

  const dailyMatch = normalizedBody.match(/^每天\s*(\d{1,2})[:：](\d{2})\s*(?:执行|做|处理)?\s*(.+)$/u);
  if (dailyMatch) {
    const hour = Number.parseInt(dailyMatch[1], 10);
    const minute = Number.parseInt(dailyMatch[2], 10);
    if (!isValidHourMinute(hour, minute)) {
      return {
        action: 'help',
        source,
        argsText: '',
      };
    }
    const textValue = dailyMatch[3].trim();
    if (!textValue) {
      return {
        action: 'help',
        source,
        argsText: body,
      };
    }
    return {
      action: 'add',
      source,
      argsText: '',
      preset: {
        expr: `0 ${minute} ${hour} * * *`,
        text: textValue,
        name: buildNaturalJobName(textValue),
      },
    };
  }

  const dailyChineseMatch = normalizedBody.match(
    /^每天\s*(早上|上午|中午|下午|晚上)?\s*(\d{1,2})(?:[:：](\d{1,2})|点(?:(\d{1,2})分?)?)?\s*(?:执行|做|处理)?\s*(.+)$/u
  );
  if (dailyChineseMatch) {
    const period = dailyChineseMatch[1]?.trim();
    const baseHour = Number.parseInt(dailyChineseMatch[2], 10);
    const minuteRaw = dailyChineseMatch[3] ?? dailyChineseMatch[4] ?? '0';
    const minute = Number.parseInt(minuteRaw, 10);
    const hour = normalizeHourByPeriod(baseHour, period);
    if (!isValidHourMinute(hour, minute)) {
      return {
        action: 'help',
        source,
        argsText: '',
      };
    }

    const rawTextValue = dailyChineseMatch[5].trim();
    const textValue = stripActionPrefix(rawTextValue);
    if (!textValue) {
      return {
        action: 'help',
        source,
        argsText: body,
      };
    }
    return {
      action: 'add',
      source,
      argsText: '',
      preset: {
        expr: `0 ${minute} ${hour} * * *`,
        text: textValue,
        name: buildNaturalJobName(textValue),
      },
    };
  }

  const weeklyMatch = normalizedBody.match(/^每周([一二三四五六日天])\s*(\d{1,2})[:：](\d{2})\s*(?:执行|做|处理)?\s*(.+)$/u);
  if (weeklyMatch) {
    const weekday = WEEKDAY_MAP[weeklyMatch[1]];
    const hour = Number.parseInt(weeklyMatch[2], 10);
    const minute = Number.parseInt(weeklyMatch[3], 10);
    if (typeof weekday !== 'number' || !isValidHourMinute(hour, minute)) {
      return {
        action: 'help',
        source,
        argsText: '',
      };
    }
    const textValue = weeklyMatch[4].trim();
    if (!textValue) {
      return {
        action: 'help',
        source,
        argsText: body,
      };
    }
    return {
      action: 'add',
      source,
      argsText: '',
      preset: {
        expr: `0 ${minute} ${hour} * * ${weekday}`,
        text: textValue,
        name: buildNaturalJobName(textValue),
      },
    };
  }

  return {
    action: 'help',
    source,
    argsText: body,
  };
}

/** 从任务内容文本生成简短的任务名称 */
export function buildNaturalJobName(text: string): string {
  const candidate = text.trim().slice(0, 24);
  return candidate || `cron-${Date.now()}`;
}

// ──────────────────────────────────────────────
// 内部辅助函数
// ──────────────────────────────────────────────

function stripCreateTaskPrefix(text: string): string {
  return text
    .replace(/^(?:请|请你|帮我)?\s*(?:添加|新增|创建)(?:一个|个)?\s*定时任务[，,:\s]*/u, '')
    .trim();
}

function stripActionPrefix(text: string): string {
  return text
    .replace(/^(?:执行|做|处理)\s*/u, '')
    .trim();
}

function normalizeHourByPeriod(hour: number, period?: string): number {
  if (!Number.isFinite(hour)) {
    return hour;
  }
  const normalizedPeriod = (period || '').trim();
  if (!normalizedPeriod) {
    return hour;
  }

  if (normalizedPeriod === '早上' || normalizedPeriod === '上午') {
    return hour === 12 ? 0 : hour;
  }
  if (normalizedPeriod === '中午') {
    if (hour >= 1 && hour <= 10) {
      return hour + 12;
    }
    return hour;
  }
  if (normalizedPeriod === '下午' || normalizedPeriod === '晚上') {
    if (hour >= 1 && hour <= 11) {
      return hour + 12;
    }
    return hour;
  }
  return hour;
}

function isValidHourMinute(hour: number, minute: number): boolean {
  return Number.isInteger(hour)
    && Number.isInteger(minute)
    && hour >= 0
    && hour <= 23
    && minute >= 0
    && minute <= 59;
}
