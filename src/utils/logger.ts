/**
 * 日志收集器
 * 拦截 console 方法并收集日志到内存缓冲
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: Date
  level: LogLevel
  source: string
  message: string
  raw: string[]
}

interface LogStore {
  add(entry: LogEntry): void
  getAll(): LogEntry[]
  getCount(): number
  clear(): void
}

let store: LogStore | null = null
let originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

/**
 * 从日志消息中提取来源标签
 * 例如: "[Config] 路由器模式: router" -> "Config"
 */
function extractSource(args: unknown[]): string {
  if (args.length === 0) return 'app'

  const first = args[0]
  if (typeof first === 'string') {
    const match = first.match(/^\[([^\]]+)\]/)
    if (match) return match[1]
  }

  return 'app'
}

/**
 * 格式化日志参数为字符串
 */
function formatArgs(args: unknown[]): string[] {
  return args.map(arg => {
    if (typeof arg === 'string') return arg
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
    try {
      return JSON.stringify(arg, null, 2)
    } catch {
      return String(arg)
    }
  })
}

/**
 * 创建日志条目
 */
function createEntry(level: LogLevel, args: unknown[]): LogEntry {
  const formatted = formatArgs(args)
  const source = extractSource(args)
  const message = formatted.join(' ')

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    level,
    source,
    message,
    raw: formatted,
  }
}

/**
 * 拦截 console 方法
 */
function interceptConsole(level: LogLevel, original: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    // 先调用原始方法
    original(...args)

    // 收集到存储
    if (store) {
      const entry = createEntry(level, args)
      store.add(entry)
    }
  }
}

/**
 * 初始化日志收集器
 */
export function initLogger(logStore: LogStore) {
  store = logStore

  // 拦截 console 方法
  console.log = interceptConsole('info', originalConsole.log)
  console.info = interceptConsole('info', originalConsole.info)
  console.warn = interceptConsole('warn', originalConsole.warn)
  console.error = interceptConsole('error', originalConsole.error)
  console.debug = interceptConsole('debug', originalConsole.debug)
}

/**
 * 恢复原始 console 方法
 */
export function restoreConsole() {
  console.log = originalConsole.log
  console.info = originalConsole.info
  console.warn = originalConsole.warn
  console.error = originalConsole.error
  console.debug = originalConsole.debug
}

/**
 * 手动添加日志条目（用于特殊场景）
 */
export function log(level: LogLevel, source: string, ...args: unknown[]) {
  if (store) {
    const entry = createEntry(level, [source, ...args])
    entry.source = source
    store.add(entry)
  }
}