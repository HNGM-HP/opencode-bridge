import { chatApi, type ChatCommandInfo } from '../../api'

let commandCache: ChatCommandInfo[] | null = null
let commandCachePromise: Promise<ChatCommandInfo[]> | null = null
let commandCacheVersion = 0
let resourceEventSource: EventSource | null = null

export async function getSlashCommands(): Promise<ChatCommandInfo[]> {
  subscribeResourceCommandInvalidation()

  if (commandCache) {
    return commandCache
  }

  if (!commandCachePromise) {
    const requestVersion = commandCacheVersion
    commandCachePromise = chatApi.listCommands()
      .then(result => {
        if (requestVersion === commandCacheVersion) {
          commandCache = result
        }
        return result
      })
      .finally(() => {
        commandCachePromise = null
      })
  }

  const commands = await commandCachePromise
  return Array.isArray(commands) ? commands : []
}

/**
 * Invalidate the commands cache.
 * Call this after creating, updating, or deleting skills that provide slash commands.
 */
export function invalidateCommandsCache(): void {
  commandCacheVersion += 1
  commandCache = null
  commandCachePromise = null
}

export function subscribeResourceCommandInvalidation(): void {
  if (resourceEventSource || typeof EventSource === 'undefined') return

  resourceEventSource = new EventSource('/api/resources/events')
  resourceEventSource.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data) as { kind?: string }
      if (['skill', 'mcp', 'agents', 'agent', 'provider'].includes(data.kind || '')) {
        invalidateCommandsCache()
      }
    } catch {
      invalidateCommandsCache()
    }
  })
  resourceEventSource.onerror = () => {
    resourceEventSource?.close()
    resourceEventSource = null
  }
}

export function unsubscribeResourceCommandInvalidation(): void {
  resourceEventSource?.close()
  resourceEventSource = null
}
