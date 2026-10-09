import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@muxaris/db";

const core = vi.hoisted(() => ({
  role: "owner" as "owner" | "front_desk",
  updateDoctor: vi.fn(),
  updateService: vi.fn(),
  updateClinicProfile: vi.fn(),
}));

vi.mock("@muxaris/core", async (orig) => ({
  ...(await orig<typeof import("@muxaris/core")>()),
  upsertUser: vi.fn(async () => ({ id: "u1", email: "o@test.example", cognitoSub: "s1" })),
  getMembership: vi.fn(async () => ({ role: core.role })),
  updateDoctor: core.updateDoctor,
  updateService: core.updateService,
  updateClinicProfile: core.updateClinicProfile,
}));

import { CoreError, createDevVerifier } from "@muxaris/core";
import { createApp } from "../app.js";

const app = createApp({ version: "test", db: {} as Db, verifier: createDevVerifier() });
const patch = (path: string, body: unknown) =>
  app.request(`/v1${path}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer dev:s1:o@test.example",
      "X-Clinic-Id": "cl_1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

afterEach(() => {
  core.role = "owner";
  core.updateDoctor.mockReset();
  core.updateService.mockReset();
  core.updateClinicProfile.mockReset();
});

describe("PATCH /doctors/:id", () => {
  it("passes the clinic, actor and only the sent fields to updateDoctor", async () => {
    core.updateDoctor.mockResolvedValue({ id: "doc_1", name: "Dr. Meera Rao", active: false });
    const res = await patch("/doctors/doc_1", {
      name: "Dr. Meera Rao",
      specialties: ["General Dentistry"],
      active: false,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).doctor).toMatchObject({ id: "doc_1", active: false });
    expect(core.updateDoctor).toHaveBeenCalledWith(expect.anything(), {
      clinicId: "cl_1",
      doctorId: "doc_1",
      actorUserId: "u1",
      patch: { name: "Dr. Meera Rao", specialties: ["General Dentistry"], active: false },
    });
  });

  it("is owner-only", async () => {
    core.role = "front_desk";
    const res = await patch("/doctors/doc_1", { active: false });
    expect(res.status).toBe(403);
    expect(core.updateDoctor).not.toHaveBeenCalled();
  });

  it("rejects an empty body, unknown fields and bad values", async () => {
    expect((await patch("/doctors/doc_1", {})).status).toBe(400);
    expect((await patch("/doctors/doc_1", { clinicId: "other" })).status).toBe(400);
    expect((await patch("/doctors/doc_1", { name: "" })).status).toBe(400);
    expect((await patch("/doctors/doc_1", { languages: ["fr-FR"] })).status).toBe(400);
    expect((await patch("/doctors/doc_1", { color: "red" })).status).toBe(400);
    expect(core.updateDoctor).not.toHaveBeenCalled();
  });

  it("maps a doctor from another clinic to 404", async () => {
    core.updateDoctor.mockRejectedValue(new CoreError("not_found", "doctor not found"));
    expect((await patch("/doctors/doc_x", { active: true })).status).toBe(404);
  });
});

describe("PATCH /services/:id", () => {
  it("edits or deactivates a service in place", async () => {
    core.updateService.mockResolvedValue({ id: "svc_1", active: false });
    const res = await patch("/services/svc_1", { active: false });
    expect(res.status).toBe(200);
    expect((await res.json()).service).toEqual({ id: "svc_1", active: false });
    expect(core.updateService).toHaveBeenCalledWith(expect.anything(), {
      clinicId: "cl_1",
      serviceId: "svc_1",
      actorUserId: "u1",
      patch: { active: false },
    });
  });

  it("is owner-only and validates like the create body", async () => {
    expect((await patch("/services/svc_1", { durationMin: 2 })).status).toBe(400);
    expect((await patch("/services/svc_1", { priceInr: -1 })).status).toBe(400);
    expect((await patch("/services/svc_1", {})).status).toBe(400);
    core.role = "front_desk";
    expect((await patch("/services/svc_1", { bookableByAi: false })).status).toBe(403);
    expect(core.updateService).not.toHaveBeenCalled();
  });
});

describe("PATCH /clinic", () => {
  it("normalises the phone and passes the clinic details through", async () => {
    core.updateClinicProfile.mockResolvedValue({ id: "cl_1", name: "Sunrise Dental Care" });
    const res = await patch("/clinic", {
      name: "Sunrise Dental Care",
      city: "Bengaluru",
      address: null,
      phone: "080 4123 4567",
      languages: ["en-IN", "kn-IN"],
    });
    expect(res.status).toBe(200);
    expect(core.updateClinicProfile).toHaveBeenCalledWith(expect.anything(), {
      clinicId: "cl_1",
      actorUserId: "u1",
      patch: {
        name: "Sunrise Dental Care",
        city: "Bengaluru",
        address: null,
        phone: "+918041234567",
        languages: ["en-IN", "kn-IN"],
      },
    });
  });

  it("refuses settings, timezone and plan here, empty bodies and non-owners", async () => {
    expect((await patch("/clinic", { settings: { recordCalls: false } })).status).toBe(400);
    expect((await patch("/clinic", { timezone: "UTC" })).status).toBe(400);
    expect((await patch("/clinic", { plan: "standard" })).status).toBe(400);
    expect((await patch("/clinic", { languages: [] })).status).toBe(400);
    expect((await patch("/clinic", { phone: "12345" })).status).toBe(400);
    expect((await patch("/clinic", {})).status).toBe(400);
    core.role = "front_desk";
    expect((await patch("/clinic", { name: "X" })).status).toBe(403);
    expect(core.updateClinicProfile).not.toHaveBeenCalled();
  });
});
