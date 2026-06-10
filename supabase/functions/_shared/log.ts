// Structured JSON logging with trace ids, plus sanitized client errors.
// Full error details stay in server logs; clients get a generic message
// and the traceId to report.

export interface LogContext {
  fn: string;
  traceId: string;
}

export function newTrace(fn: string, req?: Request): LogContext {
  const traceId = req?.headers.get('x-trace-id') ?? crypto.randomUUID();
  return { fn, traceId };
}

export function logEvent(
  ctx: LogContext,
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      fn: ctx.fn,
      traceId: ctx.traceId,
      event,
      ...fields,
    }),
  );
}

/** Logs the full error server-side and returns a safe client-facing message. */
export function sanitizeError(ctx: LogContext, error: unknown): string {
  const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  logEvent(ctx, 'error', 'unhandled_error', { detail });
  return `Internal error (trace ${ctx.traceId})`;
}
