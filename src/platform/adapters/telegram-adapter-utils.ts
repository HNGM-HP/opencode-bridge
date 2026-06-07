/**
 * Telegram 适配器工具函数
 *
 * 从 telegram-adapter.ts 提取的模块级纯函数。
 */

export type GrammyModule = typeof import('grammy');

let _grammyModule: GrammyModule | null = null;
export async function getGrammyModule(): Promise<GrammyModule> {
  if (!_grammyModule) {
    _grammyModule = await import('grammy');
  }
  return _grammyModule;
}
