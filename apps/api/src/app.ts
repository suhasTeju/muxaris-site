import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export interface AppDeps {
  version: string;
  corsOrigins?: string[];
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use(logger());
  app.use(
    "*",
    cors({
      origin: deps.corsOrigins ?? "*",
      allowHeaders: ["Authorization", "Content-Type", "X-Clinic-Id"],
    }),
  );
  app.get("/healthz", (c) => c.json({ ok: true, service: "api", version: deps.version }));
  return app;
}
