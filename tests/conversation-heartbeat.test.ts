import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ConversationHeartbeatEngine,
  parseHeartbeatChecklist,
  type HeartbeatCheckDefinition,
} from '../src/reliability/conversation-heartbeat.js';

describe('ConversationHeartbeatEngine', () => {
  const createSandbox = (): {
    root: string;
    checklistPath: string;
    statePath: string;
    cleanup: () => void;
  } => {
    const tempParent = path.join(process.cwd(), '.tmp');
    fs.mkdirSync(tempParent, { recursive: true });
    const root = fs.mkdtempSync(path.join(tempParent, 'conversation-heartbeat-test-'));
    const checklistPath = path.join(root, 'HEARTBEAT.md');
    const statePath = path.join(root, 'memory', 'heartbeat-state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    return {
      root,
      checklistPath,
      statePath,
      cleanup: () => {
        if (fs.existsSync(root)) {
          fs.rmSync(root, { recursive: true, force: true });
        }
      },
    };
  };

  it('无入站消息触发时不执行检查', () => {
    const sandbox = createSandbox();
    const executed: string[] = [];
    const engine = new ConversationHeartbeatEngine({
      heartbeatFilePath: sandbox.checklistPath,
      stateFilePath: sandbox.statePath,
      executeCheck: async (check: HeartbeatCheckDefinition) => {
        executed.push(check.id);
      },
    });

    expect(engine).toBeDefined();
    expect(executed).toEqual([]);
    expect(fs.existsSync(sandbox.statePath)).toBe(false);
    sandbox.cleanup();
  });

  it('到窗口时应批量执行 HEARTBEAT 检查并写入状态', async () => {
    const sandbox = createSandbox();
    fs.writeFileSync(
      sandbox.checklistPath,
      [
        '# HEARTBEAT',
        '',
        '- [ ] bridge_stale: 检查桥接状态陈旧',
        '- [ ] opencode_http_down: 检查 OpenCode HTTP 可达性',
      ].join('\n'),
      'utf-8'
    );

    const executed: string[] = [];
    const now = 1_700_000_000_000;
    const engine = new ConversationHeartbeatEngine({
      heartbeatFilePath: sandbox.checklistPath,
      stateFilePath: sandbox.statePath,
      windowMs: 30 * 60 * 1000,
      now: () => now,
      executeCheck: async (check: HeartbeatCheckDefinition) => {
        executed.push(check.id);
      },
    });

    const result = await engine.onInboundMessage();
    expect(result.executed).toBe(true);
    expect(result.executedCheckIds).toEqual(['bridge_stale', 'opencode_http_down']);
    expect(executed).toEqual(['bridge_stale', 'opencode_http_down']);

    const persisted = JSON.parse(fs.readFileSync(sandbox.statePath, 'utf-8')) as {
      lastRunAt: number;
      lastWindowKey: string;
      lastExecutedCheckIds: string[];
    };

    expect(persisted.lastRunAt).toBe(now);
    expect(persisted.lastWindowKey).toBe(String(Math.floor(now / (30 * 60 * 1000))));
    expect(persisted.lastExecutedCheckIds).toEqual(['bridge_stale', 'opencode_http_down']);
    sandbox.cleanup();
  });

  it('窗口内重复触发应去重，窗口到期后再执行', async () => {
    const sandbox = createSandbox();
    fs.writeFileSync(
      sandbox.checklistPath,
      ['# HEARTBEAT', '', '- [ ] bridge_stale: 检查桥接状态陈旧'].join('\n'),
      'utf-8'
    );

    let now = 1_700_000_000_000;
    const executed: string[] = [];
    const engine = new ConversationHeartbeatEngine({
      heartbeatFilePath: sandbox.checklistPath,
      stateFilePath: sandbox.statePath,
      windowMs: 30 * 60 * 1000,
      now: () => now,
      executeCheck: async (check: HeartbeatCheckDefinition) => {
        executed.push(`${check.id}@${now}`);
      },
    });

    const first = await engine.onInboundMessage();
    expect(first.executed).toBe(true);
    expect(executed.length).toBe(1);

    now += 5 * 60 * 1000;
    const deduped = await engine.onInboundMessage();
    expect(deduped.executed).toBe(false);
    expect(executed.length).toBe(1);

    now += 31 * 60 * 1000;
    const secondWindow = await engine.onInboundMessage();
    expect(secondWindow.executed).toBe(true);
    expect(executed.length).toBe(2);
    sandbox.cleanup();
  });

  it('状态文件损坏时应降级恢复并继续执行', async () => {
    const sandbox = createSandbox();
    fs.writeFileSync(
      sandbox.checklistPath,
      ['# HEARTBEAT', '', '- [ ] event_stream_stale: 检查事件流停滞'].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(sandbox.statePath, '{broken json', 'utf-8');

    const now = 1_800_000_000_000;
    const executed: string[] = [];
    const engine = new ConversationHeartbeatEngine({
      heartbeatFilePath: sandbox.checklistPath,
      stateFilePath: sandbox.statePath,
      now: () => now,
      executeCheck: async (check: HeartbeatCheckDefinition) => {
        executed.push(check.id);
      },
    });

    const result = await engine.onInboundMessage();
    expect(result.executed).toBe(true);
    expect(executed).toEqual(['event_stream_stale']);

    const recovered = JSON.parse(fs.readFileSync(sandbox.statePath, 'utf-8')) as {
      lastRunAt: number;
      lastExecutedCheckIds: string[];
    };
    expect(recovered.lastRunAt).toBe(now);
    expect(recovered.lastExecutedCheckIds).toEqual(['event_stream_stale']);
    sandbox.cleanup();
  });
});

describe('parseHeartbeatChecklist', () => {
  it('应仅解析合法的故障类型检查项', () => {
    const checks = parseHeartbeatChecklist([
      '# HEARTBEAT',
      '- [ ] bridge_stale: 检查桥接状态',
      '- [ ] unknown_type: 非法类型',
      '- [x] opencode_http_down: 已关闭项',
      '- [ ] event_stream_stale: 检查事件流',
    ].join('\n'));

    expect(checks.map(item => item.id)).toEqual(['bridge_stale', 'event_stream_stale']);
  });
});
