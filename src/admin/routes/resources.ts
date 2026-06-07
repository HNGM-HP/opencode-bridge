/**
 * Resources Management API Routes
 *
 * REST API endpoints for managing Skills, MCP Servers, Agents, and Providers.
 * Provides CRUD operations, enable/disable toggles, and SSE event streaming.
 *
 * Routes:
 *   Skills:  /api/resources/skills
 *   MCP:     /api/resources/mcp
 *   Agents:  /api/resources/agents
 *   Providers: /api/resources/providers
 *   Events:  /api/resources/events (SSE)
 */

import express from 'express';
import { skillRegistry } from '../../services/resources/skills/registry.js';
import { getMCPRegistry } from '../../services/resources/mcp/manager.js';
import { getAgentRegistry } from '../../services/resources/agents/manager.js';
import { getProviderRegistry } from '../../services/resources/providers/manager.js';
import { onResourceChange } from '../../services/resources/events.js';
import { opencodeConfig } from '../../config.js';
import type { ResourceScope } from '../../services/resources/types.js';
import type { SkillSlashCommand } from '../../services/resources/skills/registry.js';
import type { MCPServerConfig, MCPInput, MCPServerSummary } from '../../services/resources/mcp/types.js';
import type { AgentConfig, AgentInput } from '../../services/resources/agents/types.js';
import type { ProviderConfig } from '../../services/resources/providers/types.js';

type OpenCodeMCPStatus =
  | { status: 'connected' }
  | { status: 'disabled' }
  | { status: 'failed'; error: string }
  | { status: 'needs_auth' }
  | { status: 'needs_client_registration'; error: string };

interface OpenCodeProviderModel {
  id: string;
  name: string;
}

interface OpenCodeProviderSummary {
  id: string;
  name: string;
  source?: string;
  models: OpenCodeProviderModel[];
  connected: boolean;
}

interface OpenCodeProviderList {
  providers: OpenCodeProviderSummary[];
  connected: Set<string>;
}

function opencodeAuthHeaders(headers?: Record<string, string>): Record<string, string> {
  const merged = { ...(headers || {}) };
  const password = opencodeConfig.serverPassword;
  if (password) {
    const username = opencodeConfig.serverUsername || 'opencode';
    merged.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  return merged;
}

function appendDirectoryParam(url: URL, directory: unknown): void {
  if (typeof directory === 'string' && directory.trim()) {
    url.searchParams.set('directory', directory.trim());
    return;
  }
  url.searchParams.set('directory', process.cwd());
}

async function requestOpenCodeMCPStatus(directory?: unknown): Promise<Record<string, OpenCodeMCPStatus>> {
  const url = new URL('/mcp', opencodeConfig.baseUrl);
  appendDirectoryParam(url, directory);
  const response = await fetch(url, { headers: opencodeAuthHeaders() });
  if (!response.ok) {
    throw new Error(`OpenCode MCP status failed: HTTP ${response.status}`);
  }
  return await response.json() as Record<string, OpenCodeMCPStatus>;
}

async function requestOpenCodeMCPToggle(name: string, action: 'connect' | 'disconnect', directory?: unknown): Promise<boolean> {
  const url = new URL(`/mcp/${encodeURIComponent(name)}/${action}`, opencodeConfig.baseUrl);
  appendDirectoryParam(url, directory);
  const response = await fetch(url, { method: 'POST', headers: opencodeAuthHeaders() });
  if (!response.ok) {
    throw new Error(`OpenCode MCP ${action} failed: HTTP ${response.status}`);
  }
  return await response.json() as boolean;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function extractOpenCodeModels(provider: Record<string, unknown>): OpenCodeProviderModel[] {
  const models: OpenCodeProviderModel[] = [];
  const seen = new Set<string>();
  const rawModels = provider.models;

  const pushModel = (rawModel: unknown, fallbackId?: string): void => {
    const modelRecord = toRecord(rawModel);
    const fallback = typeof fallbackId === 'string' ? fallbackId.trim() : '';
    const id = typeof modelRecord?.id === 'string' && modelRecord.id.trim()
      ? modelRecord.id.trim()
      : fallback;
    if (!id || seen.has(id.toLowerCase())) return;
    seen.add(id.toLowerCase());
    const name = typeof modelRecord?.name === 'string' && modelRecord.name.trim()
      ? modelRecord.name.trim()
      : id;
    models.push({ id, name });
  };

  if (Array.isArray(rawModels)) {
    for (const rawModel of rawModels) pushModel(rawModel);
  } else {
    const modelMap = toRecord(rawModels);
    if (modelMap) {
      for (const [modelId, rawModel] of Object.entries(modelMap)) pushModel(rawModel, modelId);
    }
  }

  return models.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
}

async function requestOpenCodeProviders(): Promise<OpenCodeProviderList> {
  const url = new URL('/provider', opencodeConfig.baseUrl);
  const response = await fetch(url, { headers: opencodeAuthHeaders() });
  if (!response.ok) {
    throw new Error(`OpenCode provider list failed: HTTP ${response.status}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const rawProviders = Array.isArray(data.all)
    ? data.all
    : (Array.isArray(data.providers) ? data.providers : []);
  const connected = new Set((Array.isArray(data.connected) ? data.connected : [])
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0));

  const providerEntries = rawProviders
    .map((rawProvider): OpenCodeProviderSummary | null => {
      const provider = toRecord(rawProvider);
      const id = typeof provider?.id === 'string' && provider.id.trim() ? provider.id.trim() : '';
      if (!provider || !id) return null;
      const name = typeof provider.name === 'string' && provider.name.trim() ? provider.name.trim() : id;
      const source = typeof provider.source === 'string' ? provider.source : undefined;
      return {
        id,
        name,
        source,
        connected: connected.has(id),
        models: extractOpenCodeModels(provider),
      };
    })
    .filter((provider): provider is OpenCodeProviderSummary => Boolean(provider));

  const providerById = new Map<string, OpenCodeProviderSummary>();
  for (const provider of providerEntries) {
    const existing = providerById.get(provider.id);
    if (!existing) {
      providerById.set(provider.id, provider);
      continue;
    }
    const models = new Map(existing.models.map(model => [model.id, model]));
    for (const model of provider.models) models.set(model.id, model);
    providerById.set(provider.id, {
      ...existing,
      ...provider,
      connected: existing.connected || provider.connected,
      models: Array.from(models.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN')),
    });
  }

  const providers = Array.from(providerById.values())
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));

  return { providers, connected };
}

export function createResourcesRoutes(): express.Router {
  const router = express.Router();

  // ============================================================================
  // STATS ROUTE
  // ============================================================================

  // GET /api/resources/stats - Get resource statistics
  router.get('/stats', (_req, res) => {
    try {
      const skills = skillRegistry.list();
      const mcpRegistry = getMCPRegistry();
      const agentRegistry = getAgentRegistry();
      const providerRegistry = getProviderRegistry();

      const servers = mcpRegistry.list();
      const agents = agentRegistry.list();
      const providers = providerRegistry.list();

      res.json({
        skills: skills.length,
        mcp: servers.length,
        agents: agents.length,
        providers: providers.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get stats:', message);
      res.status(500).json({ error: `Failed to retrieve resource statistics: ${message}` });
    }
  });

  // ============================================================================
  // SKILLS ROUTES
  // ============================================================================

  // GET /api/resources/skills - List all skills
  router.get('/skills', (req, res) => {
    try {
      const scope = req.query.scope as ResourceScope | undefined;
      let skills = skillRegistry.list();

      // Filter by scope if provided
      if (scope === 'project' || scope === 'user') {
        skills = skills.filter((s) => s.scope === scope);
      }

      // Map to frontend-expected format
      const resources = skills.map(skill => ({
        name: skill.name,
        scope: skill.scope,
        description: skill.description,
        enabled: skill.enabled,
        builtIn: false,
        status: skill.status === 'loaded' || skill.status === undefined ? (skill.enabled ? 'enabled' : 'disabled') : skill.status,
        error: skill.error,
        lastModified: skill.lastReloadAt,
      }));

      res.json({ resources });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to list skills:', message);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/resources/skills/:name - Get skill details
  router.get('/skills/slash', (_req, res) => {
    try {
      const commands: SkillSlashCommand[] = skillRegistry.listSlashCommands();
      res.json({ commands });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to list slash commands:', message);
      res.status(500).json({ error: message });
    }
  });

  router.get('/skills/:name', (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as ResourceScope | undefined;
      const skill = skillRegistry.get(name, scope);

      if (!skill) {
        res.status(404).json({ error: `Skill not found: ${name}` });
        return;
      }

      res.json({ skill });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get skill:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/resources/skills - Create new skill
  router.post('/skills', (req, res) => {
    try {
      const { name, content, scope } = req.body;
      const markdown = req.body.markdown ?? content;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Missing or invalid field: name (string required)' });
        return;
      }

      if (!markdown || typeof markdown !== 'string') {
        res.status(400).json({ error: 'Missing or invalid field: markdown (string required)' });
        return;
      }

      const resourceScope: ResourceScope = scope === 'user' ? 'user' : 'project';

      // Parse markdown to extract frontmatter
      const frontmatterMatch = markdown.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
      let frontmatter: Record<string, string | string[] | boolean> = {};
      let body = markdown;

      if (frontmatterMatch) {
        try {
          // Parse YAML frontmatter (simple key-value pairs)
          const fmLines = frontmatterMatch[1].split('\n');
          for (const line of fmLines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.slice(0, colonIndex).trim();
              let value: string = line.slice(colonIndex + 1).trim();

              // Parse boolean values
              if (value === 'true') {
                frontmatter[key] = true;
                continue;
              } else if (value === 'false') {
                frontmatter[key] = false;
                continue;
              }
              // Parse array values
              if (value.startsWith('[') && value.endsWith(']')) {
                const arrValue = value.slice(1, -1).split(',').map((v: string) => v.trim());
                frontmatter[key] = arrValue;
                continue;
              }

              frontmatter[key] = value;
            }
          }
        } catch (e) {
          console.warn('[Resources API] Failed to parse frontmatter, using defaults');
        }
        body = frontmatterMatch[2];
      }

      const skill = skillRegistry.create({
        name,
        scope: resourceScope,
        frontmatter: {
          description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
          version: typeof frontmatter.version === 'string' ? frontmatter.version : undefined,
          allowedTools: Array.isArray(frontmatter.allowedTools) ? frontmatter.allowedTools : undefined,
          enabled: typeof frontmatter.enabled === 'boolean' ? frontmatter.enabled : true,
          extra: frontmatter,
        },
        body,
      });

      res.status(201).json({ skill });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to create skill:', message);
      const skillName = req.body.name as string | undefined;
      if (message.includes('already exists') || message.includes('duplicate')) {
        res.status(409).json({ error: `Skill "${skillName || 'unknown'}" already exists` });
      } else {
        res.status(500).json({ error: `Failed to create skill: ${message}` });
      }
    }
  });

  // PUT /api/resources/skills/:name - Update skill
  router.put('/skills/:name', (req, res) => {
    try {
      const { name } = req.params;
      const { content, scope } = req.body;
      const markdown = req.body.markdown ?? content;

      if (!markdown || typeof markdown !== 'string') {
        res.status(400).json({ error: 'Missing or invalid field: markdown (string required)' });
        return;
      }

      const resourceScope: ResourceScope | undefined = scope === 'user' || scope === 'project' ? scope : undefined;

      // Parse markdown to extract frontmatter
      const frontmatterMatch = markdown.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
      let frontmatter: Record<string, string | string[] | boolean> = {};
      let body = markdown;

      if (frontmatterMatch) {
        try {
          const fmLines = frontmatterMatch[1].split('\n');
          for (const line of fmLines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.slice(0, colonIndex).trim();
              let value: string = line.slice(colonIndex + 1).trim();

              if (value === 'true') {
                frontmatter[key] = true;
                continue;
              } else if (value === 'false') {
                frontmatter[key] = false;
                continue;
              }
              if (value.startsWith('[') && value.endsWith(']')) {
                const arrValue = value.slice(1, -1).split(',').map((v: string) => v.trim());
                frontmatter[key] = arrValue;
                continue;
              }

              frontmatter[key] = value;
            }
          }
        } catch (e) {
          console.warn('[Resources API] Failed to parse frontmatter');
        }
        body = frontmatterMatch[2];
      }

      const skill = skillRegistry.update({
        name,
        scope: resourceScope,
        frontmatter: {
          description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
          version: typeof frontmatter.version === 'string' ? frontmatter.version : undefined,
          allowedTools: Array.isArray(frontmatter.allowedTools) ? frontmatter.allowedTools : undefined,
          enabled: typeof frontmatter.enabled === 'boolean' ? frontmatter.enabled : undefined,
          extra: frontmatter,
        },
        body,
      });

      res.json({ skill });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to update skill:', message);
      const skillName = req.params.name;
      if (message.includes('not found')) {
        res.status(404).json({ error: `Skill "${skillName}" not found` });
      } else {
        res.status(500).json({ error: `Failed to update skill: ${message}` });
      }
    }
  });

  // DELETE /api/resources/skills/:name - Delete skill
  router.delete('/skills/:name', (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as ResourceScope | undefined;

      skillRegistry.delete(name, scope);

      res.json({ ok: true, message: `Skill "${name}" deleted` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to delete skill:', message);
      const skillName = req.params.name;
      if (message.includes('not found')) {
        res.status(404).json({ error: `Skill "${skillName}" not found` });
      } else if (message.includes('built-in') || message.includes('system')) {
        res.status(403).json({ error: `Cannot delete built-in skill "${skillName}"` });
      } else {
        res.status(500).json({ error: `Failed to delete skill: ${message}` });
      }
    }
  });

  // POST /api/resources/skills/:name/toggle - Enable/disable skill
  router.post('/skills/:name/toggle', (req, res) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;
      const scope = req.query.scope as ResourceScope | undefined;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'Missing or invalid field: enabled (boolean required)' });
        return;
      }

      const skill = skillRegistry.toggle(name, enabled, scope);

      res.json({ skill, message: `Skill "${name}" ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to toggle skill:', message);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/resources/skills/slash - List all slash commands
  router.get('/skills/slash', (_req, res) => {
    try {
      const commands: SkillSlashCommand[] = skillRegistry.listSlashCommands();
      res.json({ commands });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to list slash commands:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // MCP ROUTES
  // ============================================================================

  // GET /api/resources/mcp - List all MCP servers
  router.get('/mcp', async (req, res) => {
    try {
      const scope = req.query.scope as ResourceScope | undefined;
      const mcpRegistry = getMCPRegistry();
      let servers = mcpRegistry.list();
      let liveStatus: Record<string, OpenCodeMCPStatus> = {};
      let liveStatusError: string | undefined;

      try {
        liveStatus = await requestOpenCodeMCPStatus(req.query.directory);
      } catch (error: unknown) {
        liveStatusError = error instanceof Error ? error.message : String(error);
      }

      // Filter by scope if provided
      if (scope === 'project' || scope === 'user') {
        servers = servers.filter((s) => s.scope === scope);
      }

      // Map to frontend-expected format
      const resourceNames = new Set(servers.map(server => server.name));
      const liveOnlyServers: MCPServerSummary[] = req.query.includeLiveOnly === 'true'
        ? Object.keys(liveStatus)
        .filter(name => !resourceNames.has(name))
        .map(name => ({
          name,
          scope: 'project' as const,
          transport: 'http' as const,
          description: undefined,
          enabled: liveStatus[name].status === 'connected',
          order: Number.MAX_SAFE_INTEGER,
          valid: true,
          error: undefined,
          shadowed: false,
        }))
        : [];

      const resources = [...servers, ...liveOnlyServers].map(server => {
        const runtime = liveStatus[server.name];
        const runtimeStatus = runtime?.status;
        return {
          name: server.name,
          scope: server.scope,
          description: server.description,
          enabled: runtimeStatus ? runtimeStatus === 'connected' : server.enabled,
          builtIn: false,
          status: server.valid === false ? 'error' : (runtimeStatus || (server.enabled ? 'enabled' : 'disabled')),
          runtimeStatus,
          runtimeError: runtime && 'error' in runtime ? runtime.error : undefined,
          statusSource: runtimeStatus ? 'opencode' : 'config',
          error: server.error || (runtime && 'error' in runtime ? runtime.error : undefined),
          command: server.transport === 'stdio' ? 'stdio' : server.transport,
          toolCount: 0,
          transport: server.transport,
        };
      });

      res.json({ resources, liveStatus, liveStatusError });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to list MCP servers:', message);
      res.status(500).json({ error: message });
    }
  });

  router.get('/mcp/status', async (req, res) => {
    try {
      res.json({ status: await requestOpenCodeMCPStatus(req.query.directory) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get OpenCode MCP status:', message);
      res.status(502).json({ error: message });
    }
  });

  router.post('/mcp/:name/connect', async (req, res) => {
    try {
      const ok = await requestOpenCodeMCPToggle(req.params.name, 'connect', req.query.directory ?? req.body?.directory);
      res.json({ ok });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to connect OpenCode MCP server:', message);
      res.status(502).json({ error: message });
    }
  });

  router.post('/mcp/:name/disconnect', async (req, res) => {
    try {
      const ok = await requestOpenCodeMCPToggle(req.params.name, 'disconnect', req.query.directory ?? req.body?.directory);
      res.json({ ok });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to disconnect OpenCode MCP server:', message);
      res.status(502).json({ error: message });
    }
  });

  // GET /api/resources/mcp/:name - Get MCP server details
  router.get('/mcp/:name', (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as ResourceScope | undefined;

      const mcpRegistry = getMCPRegistry();
      const server = mcpRegistry.get(name, scope);

      if (!server) {
        res.status(404).json({ error: `MCP server not found: ${name}` });
        return;
      }

      res.json({ server });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get MCP server:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/resources/mcp - Create MCP server
  router.post('/mcp', async (req, res) => {
    try {
      const { name, transport, description, enabled, scope } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Missing or invalid field: name (string required)' });
        return;
      }

      if (!transport || !['stdio', 'sse', 'http'].includes(transport)) {
        res.status(400).json({ error: 'Missing or invalid field: transport (must be stdio, sse, or http)' });
        return;
      }

      const resourceScope: ResourceScope = scope === 'user' ? 'user' : 'project';

      const mcpRegistry = getMCPRegistry();

      // Add transport-specific fields
      let input: MCPInput;

      if (transport === 'stdio') {
        if (!req.body.command || typeof req.body.command !== 'string') {
          res.status(400).json({ error: 'Missing or invalid field: command (required for stdio transport)' });
          return;
        }
        input = {
          transport,
          command: req.body.command,
          args: req.body.args,
          cwd: req.body.cwd,
          env: req.body.env,
          description,
          enabled: enabled !== undefined ? enabled : true,
        } as MCPInput;
      } else if (transport === 'sse') {
        if (!req.body.url || typeof req.body.url !== 'string') {
          res.status(400).json({ error: 'Missing or invalid field: url (required for sse transport)' });
          return;
        }
        input = {
          transport,
          url: req.body.url,
          headers: req.body.headers,
          description,
          enabled: enabled !== undefined ? enabled : true,
        } as MCPInput;
      } else {
        if (!req.body.url || typeof req.body.url !== 'string') {
          res.status(400).json({ error: 'Missing or invalid field: url (required for http transport)' });
          return;
        }
        input = {
          transport,
          url: req.body.url,
          headers: req.body.headers,
          description,
          enabled: enabled !== undefined ? enabled : true,
        } as MCPInput;
      }

      const server = await mcpRegistry.create(name, input, resourceScope);

      res.status(201).json({ server });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to create MCP server:', message);
      res.status(500).json({ error: message });
    }
  });

  // PUT /api/resources/mcp/:name - Update MCP server
  router.put('/mcp/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const { transport, description, enabled, scope } = req.body;
      const resourceScope: ResourceScope = scope === 'user' ? 'user' : 'project';

      const mcpRegistry = getMCPRegistry();

      // Build input based on transport type
      let input: Partial<MCPInput>;

      if (transport === 'stdio') {
        input = {
          transport,
          command: req.body.command,
          args: req.body.args,
          cwd: req.body.cwd,
          env: req.body.env,
          description,
          enabled,
        } as Partial<MCPInput>;
      } else if (transport === 'sse') {
        input = {
          transport,
          url: req.body.url,
          headers: req.body.headers,
          description,
          enabled,
        } as Partial<MCPInput>;
      } else if (transport === 'http') {
        input = {
          transport,
          url: req.body.url,
          headers: req.body.headers,
          description,
          enabled,
        } as Partial<MCPInput>;
      } else {
        input = {
          description,
          enabled,
        };
      }

      const server = await mcpRegistry.update(name, input, resourceScope);

      res.json({ server });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to update MCP server:', message);
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/resources/mcp/:name - Delete MCP server
  router.delete('/mcp/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as ResourceScope | undefined;
      const resourceScope: ResourceScope = scope === 'user' ? 'user' : 'project';

      const mcpRegistry = getMCPRegistry();
      await mcpRegistry.delete(name, resourceScope);

      res.json({ ok: true, message: `MCP server "${name}" deleted` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to delete MCP server:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/resources/mcp/:name/toggle - Enable/disable MCP server
  router.post('/mcp/:name/toggle', async (req, res) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;
      const scope = req.query.scope as ResourceScope | undefined;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'Missing or invalid field: enabled (boolean required)' });
        return;
      }

      const mcpRegistry = getMCPRegistry();
      const server = await mcpRegistry.toggle(name, enabled, scope);

      res.json({ server, message: `MCP server "${name}" ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to toggle MCP server:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // AGENTS ROUTES
  // ============================================================================

  // GET /api/resources/agents - List all agents
  router.get('/agents', (req, res) => {
    try {
      const scope = req.query.scope as ResourceScope | undefined;
      const agentRegistry = getAgentRegistry();
      let agents = agentRegistry.list();

      // Filter by scope if provided
      if (scope === 'project' || scope === 'user') {
        agents = agents.filter((a) => a.scope === scope);
      }

      // Map to frontend-expected format
      const resources = agents.map(agent => ({
        name: agent.name,
        scope: agent.scope,
        description: agent.description,
        enabled: agent.enabled,
        builtIn: false,
        mode: agent.mode,
        status: agent.valid === false ? 'error' : (agent.enabled ? 'enabled' : 'disabled'),
        error: agent.error,
      }));

      res.json({ resources });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to list agents:', message);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/resources/agents/:name - Get agent details
  router.get('/agents/:name', (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as ResourceScope | undefined;

      const agentRegistry = getAgentRegistry();
      const agent = agentRegistry.get(name, scope);

      if (!agent) {
        res.status(404).json({ error: `Agent not found: ${name}` });
        return;
      }

      res.json({ agent });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get agent:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/resources/agents - Create agent
  router.post('/agents', async (req, res) => {
    try {
      const { name, description, mode, prompt, tools, model, enabled, scope } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Missing or invalid field: name (string required)' });
        return;
      }

      const resourceScope: ResourceScope = scope === 'user' ? 'user' : 'project';

      const agentRegistry = getAgentRegistry();
      const input: AgentInput = {
        description,
        mode,
        prompt,
        tools,
        model,
        enabled: enabled !== undefined ? enabled : true,
      };

      const agent = await agentRegistry.create(name, input, resourceScope);

      res.status(201).json({ agent });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to create agent:', message);
      res.status(500).json({ error: message });
    }
  });

  // PUT /api/resources/agents/:name - Update agent
  router.put('/agents/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const { description, mode, prompt, tools, model, enabled, scope } = req.body;
      const resourceScope: ResourceScope = scope === 'user' ? 'user' : 'project';

      const agentRegistry = getAgentRegistry();
      const input: Partial<AgentInput> = {
        description,
        mode,
        prompt,
        tools,
        model,
        enabled,
      };

      const agent = await agentRegistry.update(name, input, resourceScope);

      res.json({ agent });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to update agent:', message);
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/resources/agents/:name - Delete agent
  router.delete('/agents/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as ResourceScope | undefined;
      const resourceScope: ResourceScope = scope === 'user' ? 'user' : 'project';

      const agentRegistry = getAgentRegistry();
      await agentRegistry.delete(name, resourceScope);

      res.json({ ok: true, message: `Agent "${name}" deleted` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to delete agent:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/resources/agents/:name/toggle - Enable/disable agent
  router.post('/agents/:name/toggle', async (req, res) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;
      const scope = req.query.scope as ResourceScope | undefined;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'Missing or invalid field: enabled (boolean required)' });
        return;
      }

      const agentRegistry = getAgentRegistry();
      const agent = await agentRegistry.toggle(name, enabled, scope);

      res.json({ agent, message: `Agent "${name}" ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to toggle agent:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // PROVIDERS ROUTES
  // ============================================================================

  // GET /api/resources/providers - List all providers
  router.get('/providers', async (_req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      const localProviders = providerRegistry.list();
      const localById = new Map(localProviders.map(provider => [provider.providerId, provider]));

      let providers: OpenCodeProviderSummary[];
      try {
        providers = (await requestOpenCodeProviders()).providers;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Resources API] OpenCode provider list unavailable, using local cache:', message);
        providers = localProviders.map(provider => ({
          id: provider.providerId,
          name: provider.displayName || provider.providerId,
          source: provider.source,
          connected: provider.configured,
          models: (provider.models || providerRegistry.getModels(provider.providerId) || []).map(model => ({ id: model, name: model })),
        }));
      }

      // Map to frontend-expected format
      const resources = providers.map(provider => ({
        id: provider.id,
        name: provider.id,
        displayName: provider.name,
        type: localById.get(provider.id)?.type || 'api',
        configured: provider.connected || !!localById.get(provider.id)?.configured,
        editable: localById.get(provider.id)?.editable ?? true,
        description: provider.name,
        source: localById.get(provider.id)?.source || provider.source || (provider.connected ? 'config' : 'models'),
        disabled: localById.get(provider.id)?.disabled || false,
        enabled: !(localById.get(provider.id)?.disabled || false) && (provider.connected || !!localById.get(provider.id)?.configured),
        builtIn: false,
        status: localById.get(provider.id)?.disabled ? 'disabled' : ((provider.connected || localById.get(provider.id)?.configured) ? 'enabled' : 'not_configured'),
        models: provider.models.map(model => model.id),
        modelCount: provider.models.length,
      }));

      res.json({ resources });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to list providers:', message);
      res.status(500).json({ error: message });
    }
  });

  router.get('/models', async (_req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      try {
        const providerList = await requestOpenCodeProviders();
        const models = providerList.providers.flatMap(provider => provider.models.map(model => ({
          providerId: provider.id,
          providerName: provider.name,
          modelId: model.id,
          name: model.name,
          visible: providerRegistry.isModelVisible(provider.id, model.id),
          custom: provider.source === 'custom' || provider.source === 'config',
          fullName: `${provider.id}/${model.id}`,
        })));
        res.json({ models });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Resources API] OpenCode model list unavailable, using local cache:', message);
      }

      res.json({ models: providerRegistry.getAllModels() });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get models:', message);
      res.status(500).json({ error: message });
    }
  });

  router.post('/models/:providerId/:modelId/visibility', async (req, res) => {
    try {
      const { providerId, modelId } = req.params;
      const { visible } = req.body;
      if (typeof visible !== 'boolean') {
        res.status(400).json({ error: 'Missing or invalid field: visible (boolean required)' });
        return;
      }
      const providerRegistry = getProviderRegistry();
      await providerRegistry.setModelVisibility(providerId, modelId, visible);
      res.json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to update model visibility:', message);
      res.status(500).json({ error: message });
    }
  });

  router.get('/providers/models', (_req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      const models = providerRegistry.getAllModels();

      res.json({ models });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get all models:', message);
      res.status(500).json({ error: message });
    }
  });

  router.post('/providers/custom', async (req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      await providerRegistry.upsertCustomProvider(req.body);
      res.status(201).json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to create custom provider:', message);
      res.status(400).json({ error: message });
    }
  });

  router.put('/providers/custom/:id', async (req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      await providerRegistry.upsertCustomProvider({ ...req.body, providerId: req.params.id });
      res.json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to update custom provider:', message);
      res.status(400).json({ error: message });
    }
  });

  router.delete('/providers/custom/:id', async (req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      await providerRegistry.disconnect(req.params.id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to delete custom provider:', message);
      res.status(500).json({ error: message });
    }
  });

  router.post('/providers/:id/disconnect', async (req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      await providerRegistry.disconnect(req.params.id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to disconnect provider:', message);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/resources/providers/:id - Get provider config

  router.get('/providers/:id', (req, res) => {
    try {
      const { id } = req.params;

      const providerRegistry = getProviderRegistry();
      const provider = providerRegistry.get(id);
      const custom = providerRegistry.getCustom?.(id);

      if (!provider && !custom) {
        res.status(404).json({ error: `Provider not found: ${id}` });
        return;
      }

      // Don't expose the actual API key
      const sanitized = provider
        ? (provider.type === 'api'
          ? { type: 'api', key: provider.key ? '••••••••' : '' }
          : provider)
        : undefined;

      res.json({ provider: { ...custom, ...sanitized, auth: sanitized } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get provider:', message);
      res.status(500).json({ error: message });
    }
  });

  // PUT /api/resources/providers/:id - Set API key
  router.put('/providers/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const key = req.body.apiKey ?? req.body.key;

      if (!key || typeof key !== 'string') {
        res.status(400).json({ error: 'Missing or invalid field: apiKey/key (string required)' });
        return;
      }

      const providerRegistry = getProviderRegistry();
      await providerRegistry.setKey(id, key);

      res.json({ ok: true, message: `Provider "${id}" API key updated` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to set provider key:', message);
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/resources/providers/:id - Remove provider
  router.delete('/providers/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const providerRegistry = getProviderRegistry();
      await providerRegistry.removeKey(id);

      res.json({ ok: true, message: `Provider "${id}" removed` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to remove provider:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/resources/providers/refresh - Refresh models cache
  router.post('/providers/refresh', async (req, res) => {
    try {
      const providerRegistry = getProviderRegistry();
      await providerRegistry.refreshModels();

      res.json({ ok: true, message: 'Provider models cache refreshed' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to refresh provider models:', message);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/resources/providers/:id/models - Get models for provider
  router.get('/providers/:id/models', (req, res) => {
    try {
      const { id } = req.params;

      const providerRegistry = getProviderRegistry();
      const models = providerRegistry.getModels(id);

      res.json({ providerId: id, models });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to get provider models:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // EVENTS ROUTE (SSE)
  // ============================================================================

  // GET /api/resources/events - SSE endpoint for resource change notifications
  router.get('/events', (req, res) => {
    try {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: 'connected', at: Date.now() })}\n\n`);

      let keepalive: ReturnType<typeof setInterval> | null = null;

      // Unified cleanup function
      const cleanup = () => {
        if (keepalive) {
          clearInterval(keepalive);
          keepalive = null;
        }
        res.end();
      };

      // Subscribe to resource changes
      const unsubscribe = onResourceChange((event) => {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
          // Client disconnected
          console.error('[Resources API] SSE write error:', err);
          unsubscribe();
          cleanup();
        }
      });

      // Handle client disconnect (single event handler)
      req.on('close', () => {
        unsubscribe();
        cleanup();
      });

      // Send keepalive comments every 30 seconds
      keepalive = setInterval(() => {
        try {
          res.write(': keepalive\n\n');
        } catch (err) {
          console.error('[Resources API] SSE keepalive error:', err);
          unsubscribe();
          cleanup();
        }
      }, 30000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Resources API] Failed to setup SSE:', message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
