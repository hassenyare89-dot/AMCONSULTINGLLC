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
  it("driver registration: USDOT optional but digits only", () => {
    const base = {
      ownerName: "Sam",
      email: "s@example.com",
      phone: "4045551234",
      truckType: "tandem",
      truckCount: "2",
      serviceArea: "Atlanta",
      availability: "full-time",
      ts,
    };
    expect(DriverRegistrationSchema.safeParse(base).success).toBe(true);
    expect(DriverRegistrationSchema.safeParse({ ...base, dotNumber: "12AB" }).success).toBe(false);
    expect(DriverRegistrationSchema.safeParse({ ...base, truckType: "bulldozer" }).success).toBe(
      false,
    );
    const r = DriverRegistrationSchema.safeParse(base);
    expect(r.success && r.data.truckCount).toBe(2);
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
