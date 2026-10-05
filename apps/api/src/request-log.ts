import type { MiddlewareHandler } from "hono";

/**
 * One line per request: `METHOD /path STATUS 12ms`. Logs the pathname only, never the query
 * string, which can carry a patient's phone number, email or name (e.g. `/v1/patients?q=…`).
 */
export function requestLog(print: (line: string) => void = console.log): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const path = new URL(c.req.url).pathname;
    print(`${c.req.method} ${path} ${c.res.status} ${Date.now() - start}ms`);
  };
}
