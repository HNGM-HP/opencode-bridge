import type { RuntimeCronManager } from './runtime-cron.js';

let runtimeCronManager: RuntimeCronManager | null = null;

export function setRuntimeCronManager(manager: RuntimeCronManager | null): void {
  runtimeCronManager = manager;
}

export function getRuntimeCronManager(): RuntimeCronManager | null {
  return runtimeCronManager;
}
