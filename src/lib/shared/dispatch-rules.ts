import { DISPATCH_TRANSITIONS, type DispatchStatus } from "./domain";

export function canTransitionDispatch(from: DispatchStatus, to: DispatchStatus): boolean {
  return from === to || DISPATCH_TRANSITIONS[from].includes(to);
}

export type Interval = { start: Date | string; end: Date | string };
const t = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Half-open interval overlap: [a.start, a.end) ∩ [b.start, b.end) ≠ ∅. Back-to-back is not a conflict. */
export function overlaps(a: Interval, b: Interval): boolean {
  return t(a.start) < t(b.end) && t(b.start) < t(a.end);
}

export type JobLike = {
  id?: string;
  driver_id?: string | null;
  truck_id?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  dispatch_number?: string;
};

export type Conflict = {
  resource: "driver" | "truck";
  jobId?: string;
  dispatchNumber?: string;
  start: string;
  end: string;
};

/** Finds scheduling conflicts for `job` among `others` (cancelled jobs never conflict). */
export function findConflicts(job: JobLike, others: readonly JobLike[]): Conflict[] {
  if (job.status === "cancelled") return [];
  const out: Conflict[] = [];
  for (const o of others) {
    if (o.id && job.id && o.id === job.id) continue;
    if (o.status === "cancelled") continue;
    if (
      !overlaps(
        { start: job.scheduled_start, end: job.scheduled_end },
        { start: o.scheduled_start, end: o.scheduled_end },
      )
    )
      continue;
    const base = {
      jobId: o.id,
      dispatchNumber: o.dispatch_number,
      start: o.scheduled_start,
      end: o.scheduled_end,
    };
    if (job.driver_id && o.driver_id === job.driver_id) out.push({ resource: "driver", ...base });
    if (job.truck_id && o.truck_id === job.truck_id) out.push({ resource: "truck", ...base });
  }
  return out;
}

/** Status a job should move to automatically when a driver is (un)assigned, if any. */
export function impliedStatusOnAssignment(
  status: DispatchStatus,
  hasDriver: boolean,
): DispatchStatus {
  if (hasDriver && (status === "new" || status === "scheduled")) return "assigned";
  if (!hasDriver && status === "assigned") return "scheduled";
  return status;
}
