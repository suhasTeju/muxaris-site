import { Hono } from "hono";
import type { Db } from "@muxaris/db";
import {
  createClinicForUser,
  getMembership,
  listMemberships,
  usageMonth,
  getPlanForClinic,
  pilotEndsAt,
  CoreError,
} from "@muxaris/core";
import { schema } from "@muxaris/db";
import { and, eq } from "drizzle-orm";
import { clinicSettingsPatchBody, createClinicBody, type UsageSummary } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { v } from "../validate.js";
import { requireClinic } from "../auth/middleware.js";

export function meRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/me", async (c) => {
    const user = c.get("user");
    const memberships = await listMemberships(db, user.id);
    return c.json({
      user,
      memberships: memberships.map(({ clinic, role }) => ({
        clinicId: clinic.id,
        role,
        clinic: {
          id: clinic.id,
          name: clinic.name,
          slug: clinic.slug,
          city: clinic.city,
          onboardingStep: clinic.onboardingStep,
        },
      })),
    });
  });

  r.post("/clinics", v("json", createClinicBody), async (c) => {
    const body = c.req.valid("json");
    const { clinic, membership } = await createClinicForUser(db, {
      userId: c.get("user").id,
      name: body.name,
      city: body.city,
      specialty: body.specialty ?? "dental",
      ...(body.languages ? { languages: body.languages } : {}),
      ...(body.address ? { address: body.address } : {}),
      ...(body.phone ? { phone: body.phone } : {}),
    });
    return c.json({ clinic, membership }, 201);
  });

  // Non-members get 403 (not 404) here and on X-Clinic-Id routes: the id is not a secret to the
  // caller and nothing about the clinic leaks. Resource ids inside a clinic return 404.
  r.get("/clinics/:id", async (c) => {
    const id = c.req.param("id");
    const membership = await getMembership(db, { userId: c.get("user").id, clinicId: id });
    if (!membership) throw new CoreError("forbidden", "not a member of this clinic");
    const [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, id));
    if (!clinic) throw new CoreError("not_found", "clinic not found");
    return c.json({ clinic, role: membership.role });
  });

  r.patch("/clinics/:id", v("json", clinicSettingsPatchBody), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const membership = await getMembership(db, { userId: c.get("user").id, clinicId: id });
    if (!membership) throw new CoreError("forbidden", "not a member of this clinic");
    if (membership.role !== "owner")
      return c.json(
        { error: { code: "owner_required", message: "owner role required to change settings" } },
        403,
      );
    const { settings } = body;
    const clinic = await db.transaction(async (tx) => {
      const [cur] = await tx
        .select({ settings: schema.clinics.settings })
        .from(schema.clinics)
        .where(eq(schema.clinics.id, id))
        .for("update");
      if (!cur) throw new CoreError("not_found", "clinic not found");
      const prev = (cur.settings ?? {}) as Record<string, unknown>;
      const prevN = (prev["notifications"] ?? {}) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...prev, ...settings };
      if (settings.notifications) next["notifications"] = { ...prevN, ...settings.notifications };
      const [row] = await tx
        .update(schema.clinics)
        .set({ settings: next, updatedAt: new Date() })
        .where(eq(schema.clinics.id, id))
        .returning();
      return row!;
    });
    return c.json({ clinic });
  });

  r.get("/usage", requireClinic(db), async (c) => {
    const clinicId = c.get("clinic").id;
    const [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, clinicId));
    if (!clinic) throw new CoreError("not_found", "clinic not found");
    const month = usageMonth(clinic.timezone);
    const [[ledger], plan] = await Promise.all([
      db
        .select()
        .from(schema.usageLedger)
        .where(and(eq(schema.usageLedger.clinicId, clinicId), eq(schema.usageLedger.month, month))),
      getPlanForClinic(db, clinicId),
    ]);
    const callSeconds = ledger?.callSeconds ?? 0;
    const body: UsageSummary = {
      month,
      callSeconds,
      calls: ledger?.calls ?? 0,
      llmInputTokens: ledger?.llmInputTokens ?? 0,
      llmOutputTokens: ledger?.llmOutputTokens ?? 0,
      includedCallMinutes: plan.includedCallMinutes,
      overageSeconds: Math.max(0, callSeconds - plan.includedCallMinutes * 60),
      plan: clinic.plan,
      planName: plan.name,
      priceInrMonthly: plan.priceInrMonthly,
      maxConcurrentCalls: plan.maxConcurrentCalls,
      pilotEndsAt: clinic.plan === "pilot" ? pilotEndsAt(clinic.createdAt).toISOString() : null,
    };
    return c.json(body);
  });
  return r;
}
