import { describe, expect, it } from "vitest";
import { clinicPhone, createClinicBody, maskPhone } from "./api.js";
import { formatIndianPhone } from "./phone.js";

describe("formatIndianPhone", () => {
  it("groups a mobile as 5 + 5", () => {
    expect(formatIndianPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatIndianPhone("+916398765432")).toBe("+91 63987 65432");
  });

  it("groups a two-digit metro landline as code + 4 + 4", () => {
    expect(formatIndianPhone("+918041234567")).toBe("+91 80 4123 4567");
    expect(formatIndianPhone("+911123456789")).toBe("+91 11 2345 6789");
    expect(formatIndianPhone("+917926543210")).toBe("+91 79 2654 3210");
  });

  it("groups a three-digit STD landline as code + 3 + 4", () => {
    expect(formatIndianPhone("+918212423456")).toBe("+91 821 242 3456");
    expect(formatIndianPhone("+918362234567")).toBe("+91 836 223 4567");
  });

  it("groups a four-digit STD landline as code + 2 + 4", () => {
    expect(formatIndianPhone("+918182271234")).toBe("+91 8182 27 1234");
    expect(formatIndianPhone("+918472245678")).toBe("+91 8472 24 5678");
  });

  it("keeps a mobile in a metro-coded series as a mobile", () => {
    // 80 is Bengaluru's code, but a subscriber number never starts with 9.
    expect(formatIndianPhone("+918095123456")).toBe("+91 80951 23456");
    expect(formatIndianPhone("+917975123456")).toBe("+91 79751 23456");
  });

  it("accepts an already spaced number", () => {
    expect(formatIndianPhone("+91 80412 34567")).toBe("+91 80 4123 4567");
    expect(formatIndianPhone("+91 98765-43210")).toBe("+91 98765 43210");
  });

  it("returns anything else unchanged", () => {
    expect(formatIndianPhone("+14155550100")).toBe("+14155550100");
    expect(formatIndianPhone("9876543210")).toBe("9876543210");
    expect(formatIndianPhone("+915012345678")).toBe("+915012345678");
    expect(formatIndianPhone("+9198765")).toBe("+9198765");
    expect(formatIndianPhone(null)).toBe("");
    expect(formatIndianPhone(undefined)).toBe("");
  });

  it("leaves the masked form to maskPhone", () => {
    expect(maskPhone("+919876543210")).toBe("+91 •••• ••3210");
    expect(formatIndianPhone(maskPhone("+919876543210"))).toBe("+91 •••• ••3210");
  });
});

describe("clinicPhone", () => {
  const ok = (v: string) => clinicPhone.parse(v);

  it("accepts a mobile or an STD landline and stores it as E.164", () => {
    expect(ok("98765 43210")).toBe("+919876543210");
    expect(ok("080 4123 4567")).toBe("+918041234567");
    expect(ok("011-2345 6789")).toBe("+911123456789");
    expect(ok("+91 22 2345 6789")).toBe("+912223456789");
    expect(ok("0821 242 3456")).toBe("+918212423456");
    expect(ok("(08182) 271234")).toBe("+918182271234");
    expect(
      createClinicBody.parse({ name: "Smile", city: "Delhi", phone: "011 2345 6789" }).phone,
    ).toBe("+911123456789");
  });

  it("rejects numbers that are neither", () => {
    for (const v of [
      "12345",
      "1234567890",
      "+91 50 1234 5678",
      "011 1234 5678",
      "+1 415 555 0100",
    ]) {
      expect(clinicPhone.safeParse(v).success, v).toBe(false);
    }
  });

  it("accepts only numbers the formatter can group", () => {
    for (const v of [
      "98765 43210",
      "080 4123 4567",
      "011 2345 6789",
      "0821 242 3456",
      "08182 271234",
    ]) {
      const e164 = ok(v);
      expect(formatIndianPhone(e164)).not.toBe(e164);
    }
  });
});
