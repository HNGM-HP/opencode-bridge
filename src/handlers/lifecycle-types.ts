/**
 * 生命周期处理器类型定义
 *
 * 从 lifecycle.ts 提取。
 */

export interface CleanupStats {
  scannedChats: number;
  disbandedChats: number;
  deletedSessions: number;
  skippedProtectedSessions: number;
  removedOrphanMappings: number;
  removedCronJobs: number;
}
