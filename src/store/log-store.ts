/**
 * 日志存储
 * 内存环形缓冲，支持查询、统计
 */

import type { LogEntry, LogLevel } from '../utils/logger.js'

export interface LogQueryOptions {
  level?: LogLevel
  search?: string
  start?: Date
  end?: Date
  page?: number
  limit?: number
}

export interface LogStats {
  total: number
  debug: number
  info: number
  warn: number
  error: number
}

class LogStore {
  private buffer: LogEntry[] = []
  private maxSize: number
  private index: number = 0

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize
  }

  /**
   * 添加日志条目
   */
  add(entry: LogEntry): void {
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(entry)
    } else {
      // 环形缓冲
      this.buffer[this.index] = entry
      this.index = (this.index + 1) % this.maxSize
    }
  }

  /**
   * 获取所有日志（按时间倒序）
   */
  getAll(): LogEntry[] {
    // 如果是环形缓冲，需要重新排序
    if (this.buffer.length === this.maxSize && this.index > 0) {
      const sorted = [
        ...this.buffer.slice(this.index),
        ...this.buffer.slice(0, this.index),
      ]
      return sorted.reverse()
    }
    return [...this.buffer].reverse()
  }

  /**
   * 查询日志
   */
  query(options: LogQueryOptions = {}): { entries: LogEntry[]; total: number } {
    let entries = this.getAll()

    // 按级别过滤
    if (options.level) {
      entries = entries.filter(e => e.level === options.level)
    }

    // 按时间范围过滤
    if (options.start) {
      entries = entries.filter(e => e.timestamp >= options.start!)
    }
    if (options.end) {
      entries = entries.filter(e => e.timestamp <= options.end!)
    }

    // 关键词搜索
    if (options.search) {
      const search = options.search.toLowerCase()
      entries = entries.filter(e =>
        e.message.toLowerCase().includes(search) ||
        e.source.toLowerCase().includes(search)
      )
    }

    const total = entries.length

    // 分页
    const page = options.page || 1
    const limit = options.limit || 100
    const offset = (page - 1) * limit
    entries = entries.slice(offset, offset + limit)

    return { entries, total }
  }

  /**
   * 获取日志统计
   */
  getStats(): LogStats {
    const all = this.getAll()
    return {
      total: all.length,
      debug: all.filter(e => e.level === 'debug').length,
      info: all.filter(e => e.level === 'info').length,
      warn: all.filter(e => e.level === 'warn').length,
      error: all.filter(e => e.level === 'error').length,
    }
  }

  /**
   * 获取日志数量
   */
  getCount(): number {
    return this.buffer.length
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.buffer = []
    this.index = 0
  }
}

// 单例实例
export const logStore = new LogStore(1000)