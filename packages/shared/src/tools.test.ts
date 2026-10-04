import { describe, expect, it } from "vitest";
import { ASSISTANT_TOOLS, toolInputSchemas } from "./tools.js";

describe("assistant tools", () => {
  it("defines the nine receptionist tools with snake_case names", () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "get_clinic_info",
      "find_slots",
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "lookup_patient",
      "request_callback",
      "transfer_to_staff",
      "end_call",
    ]);
    for (const n of names) expect(n).toMatch(/^[a-z_]+$/);
  });

  it("validates book_appointment input", () => {
    const ok = toolInputSchemas.book_appointment.safeParse({
      patient_name: "Asha",
      patient_phone: "+919876543210",
      doctor_id: "doc_1",
      service_id: "svc_1",
      starts_at: "2026-10-05T11:00:00+05:30",
    });
    expect(ok.success).toBe(true);
    const bad = toolInputSchemas.book_appointment.safeParse({ patient_name: "Asha" });
    expect(bad.success).toBe(false);
  });

  it("exposes JSON schema usable by Bedrock toolSpec", () => {
    const t = ASSISTANT_TOOLS.find((x) => x.name === "find_slots")!;
    expect(t.inputSchema.type).toBe("object");
    expect(Object.keys(t.inputSchema.properties ?? {})).toContain("date");
  });

  it("marks defaulted fields optional in request_callback input schema", () => {
    const t = ASSISTANT_TOOLS.find((x) => x.name === "request_callback")!;
    const required = (t.inputSchema.required ?? []) as string[];
    expect(required).not.toContain("priority");
    expect(required).toContain("patient_phone");
    expect(required).toContain("reason");
  });

  it("emits clean object schemas with descriptions for all tools", () => {
    expect(ASSISTANT_TOOLS).toHaveLength(9);
    for (const t of ASSISTANT_TOOLS) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema).not.toHaveProperty("$schema");
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});
