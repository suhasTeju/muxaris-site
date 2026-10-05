import { describe, expect, it } from "vitest";
import {
  channelFlagsFromEnv,
  clinicNotificationSettings,
  clinicSettingsPatchBody,
  maskEmail,
  NOTIFICATION_KINDS,
  patientPatchBody,
} from "./index.js";

describe("notification contracts", () => {
  it("lists the five template kinds", () => {
    expect(NOTIFICATION_KINDS).toEqual([
      "appointment_confirmed",
      "appointment_rescheduled",
      "appointment_cancelled",
      "reminder_24h",
      "reminder_2h",
    ]);
  });
  it("channel flags default to off and accept 1/true", () => {
    expect(channelFlagsFromEnv({})).toEqual({ sms: false, whatsapp: false });
    expect(channelFlagsFromEnv({ SMS_ENABLED: "1", WHATSAPP_ENABLED: "true" })).toEqual({
      sms: true,
      whatsapp: true,
    });
    expect(channelFlagsFromEnv({ SMS_ENABLED: "0" })).toEqual({ sms: false, whatsapp: false });
  });
  it("masks emails to first letter + domain", () => {
    expect(maskEmail("ravi.kumar@gmail.com")).toBe("r•••@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
    expect(maskEmail("nonsense")).toBe("•••");
  });
  it("notification settings default to on", () => {
    expect(clinicNotificationSettings(null)).toEqual({ confirmations: true, reminders: true });
    expect(clinicNotificationSettings({ notifications: { reminders: false } })).toEqual({
      confirmations: true,
      reminders: false,
    });
  });
  it("settings patch accepts nested notification toggles", () => {
    const r = clinicSettingsPatchBody.safeParse({
      settings: { notifications: { confirmations: false } },
    });
    expect(r.success).toBe(true);
    expect(
      clinicSettingsPatchBody.safeParse({ settings: { notifications: { x: 1 } } }).success,
    ).toBe(false);
  });
  it("patient patch requires at least one field, trims and validates email", () => {
    expect(patientPatchBody.safeParse({}).success).toBe(false);
    const ok = patientPatchBody.safeParse({ email: " a@b.co " });
    expect(ok.success && ok.data.email).toBe("a@b.co");
    expect(patientPatchBody.safeParse({ email: "bad" }).success).toBe(false);
    expect(patientPatchBody.safeParse({ email: null }).success).toBe(true);
    expect(patientPatchBody.safeParse({ phone: "+919876543210" }).success).toBe(false);
  });
});
