import { Hono } from "hono";
import type { Db } from "@muxaris/db";
import { createClinicForUser, getMembership, listMemberships, CoreError } from "@muxaris/core";
import { schema } from "@muxaris/db";
import { eq } from "drizzle-orm";
import { createClinicBody } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { v } from "../validate.js";

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
    });
    let out = clinic;
    if (body.address !== undefined || body.phone !== undefined) {
      const [row] = await db
        .update(schema.clinics)
        .set({
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        })
        .where(eq(schema.clinics.id, clinic.id))
        .returning();
      out = row ?? clinic;
    }
    return c.json({ clinic: out, membership }, 201);
  });

  r.get("/clinics/:id", async (c) => {
    const id = c.req.param("id");
    const membership = await getMembership(db, { userId: c.get("user").id, clinicId: id });
    if (!membership) throw new CoreError("forbidden", "not a member of this clinic");
    const [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, id));
    if (!clinic) throw new CoreError("not_found", "clinic not found");
    return c.json({ clinic, role: membership.role });
  });
  return r;
}
