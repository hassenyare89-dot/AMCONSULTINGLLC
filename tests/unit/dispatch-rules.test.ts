import { describe, expect, it } from "vitest";
import {
  canTransitionDispatch,
  findConflicts,
  impliedStatusOnAssignment,
  overlaps,
} from "@/lib/shared/dispatch-rules";

const job = (o: Partial<Parameters<typeof findConflicts>[0]>) => ({
  scheduled_start: "2030-01-01T08:00:00Z",
  scheduled_end: "2030-01-01T12:00:00Z",
  status: "assigned",
  ...o,
});

describe("dispatch workflow", () => {
  it("follows New → Scheduled → Assigned → In Progress → Completed", () => {
    expect(canTransitionDispatch("new", "scheduled")).toBe(true);
    expect(canTransitionDispatch("scheduled", "assigned")).toBe(true);
    expect(canTransitionDispatch("assigned", "in_progress")).toBe(true);
    expect(canTransitionDispatch("in_progress", "completed")).toBe(true);
  });
  it("supports hold and cancel, blocks invalid jumps", () => {
    expect(canTransitionDispatch("in_progress", "on_hold")).toBe(true);
    expect(canTransitionDispatch("on_hold", "in_progress")).toBe(true);
    expect(canTransitionDispatch("new", "completed")).toBe(false);
    expect(canTransitionDispatch("completed", "in_progress")).toBe(false);
    expect(canTransitionDispatch("cancelled", "new")).toBe(true);
  });
  it("auto-assigns when a driver is set and reverts when removed", () => {
    expect(impliedStatusOnAssignment("new", true)).toBe("assigned");
    expect(impliedStatusOnAssignment("scheduled", true)).toBe("assigned");
    expect(impliedStatusOnAssignment("assigned", false)).toBe("scheduled");
    expect(impliedStatusOnAssignment("in_progress", true)).toBe("in_progress");
  });
});

describe("scheduling conflicts", () => {
  it("half-open overlap: back-to-back is fine", () => {
    expect(
      overlaps(
        { start: "2030-01-01T08:00Z", end: "2030-01-01T12:00Z" },
        { start: "2030-01-01T12:00Z", end: "2030-01-01T13:00Z" },
      ),
    ).toBe(false);
    expect(
      overlaps(
        { start: "2030-01-01T08:00Z", end: "2030-01-01T12:00Z" },
        { start: "2030-01-01T11:59Z", end: "2030-01-01T13:00Z" },
      ),
    ).toBe(true);
  });
  it("detects driver and truck double-booking", () => {
    const others = [
      job({ id: "a", driver_id: "d1", truck_id: "t9", dispatch_number: "D-1" }),
      job({ id: "b", truck_id: "t1", scheduled_start: "2030-01-01T10:00Z" }),
    ];
    const c = findConflicts(job({ id: "new", driver_id: "d1", truck_id: "t1" }), others);
    expect(c.map((x) => x.resource).sort()).toEqual(["driver", "truck"]);
  });
  it("ignores cancelled jobs and the job itself", () => {
    expect(
      findConflicts(job({ id: "x", driver_id: "d1" }), [
        job({ id: "x", driver_id: "d1" }),
        job({ id: "y", driver_id: "d1", status: "cancelled" }),
      ]),
    ).toEqual([]);
    expect(
      findConflicts(job({ driver_id: "d1", status: "cancelled" }), [job({ driver_id: "d1" })]),
    ).toEqual([]);
  });
});
