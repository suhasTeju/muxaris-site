import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { CoreError } from "@muxaris/core";
import type { AppDeps, AppEnv } from "./deps.js";
import { requestLog } from "./request-log.js";
import { requireUser } from "./auth/middleware.js";
import { meRoutes } from "./routes/me.js";
import { catalogRoutes } from "./routes/catalog.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { callRoutes } from "./routes/calls.js";
import { callbackRoutes } from "./routes/callbacks.js";
import { patientRoutes } from "./routes/patients.js";
import { notificationRoutes } from "./routes/notifications.js";
import { statsRoutes } from "./routes/stats.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { demoRequestRoutes } from "./routes/demo-requests.js";

export type { AppDeps } from "./deps.js";

const CORE_STATUS = {
  not_found: 404,
  conflict: 409,
  forbidden: 403,
  validation: 400,
  slot_unavailable: 409,
  clinic_limit: 409,
} as const;

const tooLarge = (c: Context) =>
  c.json({ error: { code: "payload_too_large", message: "request body too large" } }, 413);
/** Authenticated /v1 bodies (64 KiB) and public unauthenticated routes (16 KiB). */
const V1_BODY_MAX = 64 * 1024;
const PUBLIC_BODY_MAX = 16 * 1024;

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const channels = deps.channels ?? { sms: false, whatsapp: false };
  if (process.env.NODE_ENV !== "test") app.use(requestLog());
  app.use(
    "*",
    cors({
      origin: deps.corsOrigins ?? [],
      allowHeaders: ["Authorization", "Content-Type", "X-Clinic-Id"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.get("/healthz", (c) => c.json({ ok: true, service: "api", version: deps.version }));

  // Public intake route: registered before the authenticated v1 group.
  app.use("/v1/demo-requests", bodyLimit({ maxSize: PUBLIC_BODY_MAX, onError: tooLarge }));
  app.route("/v1", demoRequestRoutes(deps.db));

  const v1 = new Hono<AppEnv>();
  v1.use("*", bodyLimit({ maxSize: V1_BODY_MAX, onError: tooLarge }));
  v1.use("*", requireUser(deps.db, deps.verifier));
  v1.route("/", meRoutes(deps.db));
  v1.route("/", catalogRoutes(deps.db));
  v1.route("/", appointmentRoutes(deps.db, channels));
  v1.route("/", patientRoutes(deps.db));
  v1.route("/", notificationRoutes(deps.db, channels));
  v1.route("/", onboardingRoutes(deps.db));
  v1.route("/", callRoutes(deps.db, { blobs: deps.blobs ?? null }));
  v1.route("/", callbackRoutes(deps.db));
  v1.route("/", statsRoutes(deps.db));
  app.route("/v1", v1);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "route not found" } }, 404));
  app.onError((err, c) => {
    if (err instanceof CoreError) {
      return c.json(
        {
          error: {
            code: err.code,
            message: err.message,
            ...(err.reason ? { reason: err.reason } : {}),
          },
          // also top-level so clients can branch on `reason` without digging into the envelope
          ...(err.reason ? { reason: err.reason } : {}),
        },
        CORE_STATUS[err.code],
      );
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
