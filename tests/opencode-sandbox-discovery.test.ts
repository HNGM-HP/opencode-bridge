import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpencodeClient as SdkOpencodeClient, Project, Session } from '@opencode-ai/sdk';
import { SessionsManager } from '../src/opencode/sessions.js';
import { CommandHandler } from '../src/handlers/command.js';
import { opencodeClient } from '../src/opencode/client.js';
import { chatSessionStore } from '../src/store/chat-session.js';
import { DirectoryPolicy } from '../src/utils/directory-policy.js';

const worktree = '/missing-worktree';
const sandbox = '/workspace/sandbox';
const project = { worktree, sandboxes: [sandbox] } as Project;
const sandboxSession = {
  id: 'ses_sandbox',
  title: 'Sandbox session',
  directory: sandbox,
  time: { created: 1, updated: 1 },
} as Session;

function createSessionsManager() {
  const sessionList = vi.fn(async (options?: { query?: { directory?: string } }) => ({
    data: options?.query?.directory === sandbox ? [sandboxSession] : [],
  }));
  const sessionGet = vi.fn(async (options: { path: { id: string }; query?: { directory?: string } }) => {
    if (options.query?.directory === sandbox && options.path.id === sandboxSession.id) {
      return { data: sandboxSession };
    }
    return { error: { message: 'not found' }, response: { status: 404 } };
  });
  const client = {
    project: { list: vi.fn(async () => ({ data: [project] })) },
    session: { list: sessionList, get: sessionGet },
  } as unknown as SdkOpencodeClient;
  const knownSessionDirectoriesRef = { current: new Set<string>() };
  const manager = new SessionsManager({
    getClient: () => client,
    normalizeDirectory: directory => directory,
    rememberDirectory: directory => {
      if (directory) knownSessionDirectoriesRef.current.add(directory);
      return directory;
    },
    ensureDirectoryEventStream: vi.fn(async () => undefined),
    knownSessionDirectoriesRef,
  });
  return { manager, sessionList };
}

describe('OpenCode 附加工作目录发现', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('跨项目会话列表应包含 sandbox 中的会话', async () => {
    const { manager, sessionList } = createSessionsManager();

    const sessions = await manager.listSessionsAcrossProjects();

    expect(sessions).toEqual([sandboxSession]);
    expect(sessionList).toHaveBeenCalledWith({ query: { directory: sandbox } });
  });

  it('按 ID 查找应能定位仅存在于 sandbox 中的会话', async () => {
    const { manager } = createSessionsManager();

    const session = await manager.findSessionAcrossProjects(sandboxSession.id);

    expect(session).toEqual(sandboxSession);
  });

  it('项目列表应包含没有会话的 sandbox', async () => {
    const handler = new CommandHandler();
    const internal = handler as unknown as {
      handleProjectList: (chatId: string, messageId: string) => Promise<void>;
      replyProjectMarkdown: (
        messageId: string,
        chatId: string,
        title: string,
        markdown: string,
        template: 'blue' | 'green' | 'red' | 'orange' | 'grey'
      ) => Promise<void>;
    };
    vi.spyOn(internal, 'replyProjectMarkdown').mockResolvedValue(undefined);
    vi.spyOn(chatSessionStore, 'getKnownDirectories').mockReturnValue([]);
    vi.spyOn(opencodeClient, 'listSessionsAcrossProjects').mockResolvedValue([]);
    const listProjects = vi.spyOn(opencodeClient, 'listProjects').mockResolvedValue([project]);
    const listAvailableProjects = vi.spyOn(DirectoryPolicy, 'listAvailableProjects').mockReturnValue([]);

    await internal.handleProjectList('chat_sandbox', 'message_sandbox');

    expect(listProjects).toHaveBeenCalledOnce();
    expect(listAvailableProjects).toHaveBeenCalledWith(expect.arrayContaining([worktree, sandbox]));
  });
});
