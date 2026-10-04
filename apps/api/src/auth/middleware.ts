import { createMiddleware } from "hono/factory";
import type { Db } from "@muxaris/db";
import {
  AuthUnavailableError,
  CoreError,
  getMembership,
  upsertUser,
  type TokenVerifier,
} from "@muxaris/core";
import type { AppEnv, ClinicRole } from "../deps.js";

const unauthenticated = (message: string) => ({ error: { code: "unauthenticated", message } });

export function requireUser(db: Db, verifier: TokenVerifier) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const m = /^Bearer\s+(\S+)$/i.exec(c.req.header("Authorization") ?? "");
    if (!m) return c.json(unauthenticated("missing bearer token"), 401);
    let verified;
    try {
      verified = await verifier.verify(m[1]!);
    } catch (e) {
      if (e instanceof AuthUnavailableError) {
        return c.json(
          { error: { code: "auth_unavailable", message: "authentication service unavailable" } },
          503,
        );
      }
      return c.json(unauthenticated("invalid token"), 401);
    }
    let user;
    try {
      user = await upsertUser(db, { cognitoSub: verified.sub, email: verified.email });
    } catch (e) {
      if (e instanceof CoreError && e.code === "validation")
        return c.json(unauthenticated("verified email required"), 401);
      throw e;
    }
    c.set("user", { id: user.id, email: user.email, cognitoSub: user.cognitoSub });
    await next();
  });
}

/** Requires `X-Clinic-Id` naming a clinic the user is an active member of (owner satisfies front_desk). */
export function requireClinic(db: Db, role?: ClinicRole) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const clinicId = c.req.header("X-Clinic-Id")?.trim();
    const forbidden = (message: string) => c.json({ error: { code: "forbidden", message } }, 403);
    if (!clinicId) return forbidden("X-Clinic-Id header is required");
    const membership = await getMembership(db, { userId: c.get("user").id, clinicId });
    if (!membership) return forbidden("not a member of this clinic");
    if (role === "owner" && membership.role !== "owner") return forbidden("owner role required");
    c.set("clinic", { id: clinicId, role: membership.role });
    await next();
  });
}
