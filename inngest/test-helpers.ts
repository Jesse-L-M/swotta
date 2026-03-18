/**
 * Test helper types for Inngest function introspection.
 *
 * Inngest SDK v3 marks `fn` as private and omits `triggers` from `opts` type,
 * but both are accessible at runtime and needed for unit testing.
 * This helper provides a typed interface for test assertions without using `any`.
 */

interface InngestFunctionTrigger {
  event?: string;
  cron?: string;
}

export interface InngestFunctionTestView {
  opts: {
    id: string;
    triggers: InngestFunctionTrigger[];
    retries?: number;
  };
  fn: (ctx: unknown, opts: unknown) => Promise<unknown>;
}

/**
 * Cast an Inngest function to a test-friendly view that exposes
 * `opts.triggers` and the handler `fn` for unit testing.
 */
export function asTestable(fn: { opts: { id: string } }): InngestFunctionTestView {
  return fn as unknown as InngestFunctionTestView;
}
