import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { CoreError } from "@muxaris/core";
import type { AppDeps, AppEnv } from "./deps.js";
import { requireUser } from "./auth/middleware.js";
import { meRoutes } from "./routes/me.js";
import { catalogRoutes } from "./routes/catalog.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { onboardingRoutes } from "./routes/onboarding.js";

export type { AppDeps } from "./deps.js";

const CORE_STATUS = { not_found: 404, conflict: 409, forbidden: 403, validation: 400 } as const;

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  if (process.env.NODE_ENV !== "test") app.use(logger());
  app.use(
    "*",
    cors({
      origin: deps.corsOrigins ?? [],
      allowHeaders: ["Authorization", "Content-Type", "X-Clinic-Id"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.get("/healthz", (c) => c.json({ ok: true, service: "api", version: deps.version }));

  const v1 = new Hono<AppEnv>();
  v1.use("*", requireUser(deps.db, deps.verifier));
  v1.route("/", meRoutes(deps.db));
  v1.route("/", catalogRoutes(deps.db));
  v1.route("/", appointmentRoutes(deps.db));
  v1.route("/", onboardingRoutes(deps.db));
  app.route("/v1", v1);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "route not found" } }, 404));
  app.onError((err, c) => {
    if (err instanceof CoreError) {
      return c.json({ error: { code: err.code, message: err.message } }, CORE_STATUS[err.code]);
    }
    if (err instanceof HTTPException && err.status < 500) {
      return c.json(
        {
          error: { code: err.status === 400 ? "validation" : "bad_request", message: err.message },
        },
        err.status,
      );
    }
    // Log only non-sensitive fields: never the request body or the Drizzle query/params
    // (both can contain patient data).
    console.error("unhandled error", {
      method: c.req.method,
      route: c.req.routePath,
      name: err.name,
      message: err.message.split("\n")[0]?.slice(0, 200),
      code: (err as { cause?: { code?: string } }).cause?.code,
    });
    return c.json({ error: { code: "internal", message: "internal error" } }, 500);
  });
  return app;
}
