import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_HOURS,
  isoWeekday,
  slotsForDate,
  zonedTimeToUtc,
} from "@/lib/shared/slots";

const NOW = new Date("2030-03-01T12:00:00Z");

describe("appointment slots", () => {
  it("converts New York wall time to UTC across DST", () => {
    expect(zonedTimeToUtc("2030-01-15", "09:00", "America/New_York").toISOString()).toBe(
      "2030-01-15T14:00:00.000Z",
    );
    expect(zonedTimeToUtc("2030-07-15", "09:00", "America/New_York").toISOString()).toBe(
      "2030-07-15T13:00:00.000Z",
    );
  });
  it("computes ISO weekdays", () => {
    expect(isoWeekday("2030-03-04")).toBe(1); // Monday
    expect(isoWeekday("2030-03-10")).toBe(7); // Sunday
  });
  it("produces 30-minute slots within business hours and none on weekends", () => {
    const slots = slotsForDate("2030-03-04", DEFAULT_BUSINESS_HOURS, [], NOW);
    expect(slots).toHaveLength(16);
    expect(slots[0].start).toBe("2030-03-04T14:00:00.000Z");
    expect(slotsForDate("2030-03-09", DEFAULT_BUSINESS_HOURS, [], NOW)).toHaveLength(0);
  });
  it("excludes busy times and enforces minimum notice / horizon", () => {
    const busy = [{ start: "2030-03-04T14:00:00.000Z", end: "2030-03-04T15:00:00.000Z" }];
    expect(slotsForDate("2030-03-04", DEFAULT_BUSINESS_HOURS, busy, NOW)).toHaveLength(14);
    expect(slotsForDate("2030-03-01", DEFAULT_BUSINESS_HOURS, [], NOW)).toHaveLength(0);
    expect(slotsForDate("2031-03-03", DEFAULT_BUSINESS_HOURS, [], NOW)).toHaveLength(0);
    expect(slotsForDate("not-a-date", DEFAULT_BUSINESS_HOURS, [], NOW)).toHaveLength(0);
  });
});
