import { describe, expect, it } from "vitest";
import {
  ContactSchema,
  DriverRegistrationSchema,
  QuoteRequestSchema,
} from "@/lib/shared/validation";

const ts = Date.now() - 10_000;

describe("public form contracts", () => {
  it("contact accepts legacy payloads (backward compatible)", () => {
    expect(
      ContactSchema.safeParse({
        name: "A",
        email: "a@example.com",
        phone: "",
        message: "hello",
        website: "",
        ts,
      }).success,
    ).toBe(true);
  });
  it("contact rejects bad email and oversize message", () => {
    expect(ContactSchema.safeParse({ name: "A", email: "nope", message: "x", ts }).success).toBe(
      false,
    );
    expect(
      ContactSchema.safeParse({ name: "A", email: "a@example.com", message: "x".repeat(2001), ts })
        .success,
    ).toBe(false);
  });
  it("honeypot must be empty", () => {
    expect(
      ContactSchema.safeParse({
        name: "A",
        email: "a@example.com",
        message: "x",
        website: "spam",
        ts,
      }).success,
    ).toBe(false);
  });
  it("driver registration (Georgia): required dispatch fields, multi-selects, attestation", () => {
    const base = {
      ownerName: "Sam",
      email: "s@example.com",
      phone: "4045551234",
      dotNumber: "1234567",
      truckCount: "2",
      truckTypes: ["tandem", "tri-axle"],
      payloadCapacity: "15",
      payloadUnit: "tons",
      serviceArea: "Fulton, DeKalb",
      currentLocation: "Marietta",
      availability: ["weekdays", "weekends"],
      attestGeorgia: true,
      ts,
    };
    const ok = DriverRegistrationSchema.safeParse(base);
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.truckCount).toBe(2);
    expect(ok.success && ok.data.payloadCapacity).toBe(15);
    expect(ok.success && ok.data.materials).toEqual([]);
    const bad = (patch: object) =>
      DriverRegistrationSchema.safeParse({ ...base, ...patch }).success;
    // USDOT is now required, digits only
    expect(bad({ dotNumber: "" })).toBe(false);
    expect(bad({ dotNumber: "12AB" })).toBe(false);
    // dispatch essentials
    expect(bad({ currentLocation: "" })).toBe(false);
    expect(bad({ payloadCapacity: "" })).toBe(false);
    expect(bad({ payloadCapacity: "0" })).toBe(false);
    expect(bad({ payloadUnit: "pounds" })).toBe(false);
    expect(bad({ truckTypes: [] })).toBe(false);
    expect(bad({ truckTypes: ["bulldozer"] })).toBe(false);
    expect(bad({ availability: [] })).toBe(false);
    expect(bad({ availability: ["full-time"] })).toBe(false); // legacy value no longer offered
    // attestation must be checked
    expect(bad({ attestGeorgia: false })).toBe(false);
    // a single value (not an array) is accepted for multi-selects; duplicates collapse
    const one = DriverRegistrationSchema.safeParse({
      ...base,
      truckTypes: "quad-axle",
      availability: ["today", "today"],
    });
    expect(one.success && one.data.truckTypes).toEqual(["quad-axle"]);
    expect(one.success && one.data.availability).toEqual(["today"]);
    // recommended fields
    const rec = DriverRegistrationSchema.safeParse({
      ...base,
      cdlClass: "A",
      insuranceActive: "yes",
      materials: ["gravel", "crush-and-run"],
      travelRadius: "statewide",
    });
    expect(rec.success && rec.data.insuranceActive).toBe(true);
    expect(bad({ cdlClass: "C" })).toBe(false);
    expect(bad({ travelRadius: "500" })).toBe(false);
    expect(bad({ materials: ["uranium"] })).toBe(false);
  });
  it("quote request requires consent and a known service", () => {
    const base = {
      name: "Pat",
      email: "p@example.com",
      serviceType: "hauling-logistics",
      pickupLocation: "123 Main St",
      ts,
    };
    expect(QuoteRequestSchema.safeParse(base).success).toBe(false);
    expect(QuoteRequestSchema.safeParse({ ...base, consentPrivacy: true }).success).toBe(true);
    expect(
      QuoteRequestSchema.safeParse({ ...base, consentPrivacy: true, serviceType: "x" }).success,
    ).toBe(false);
  });
});
