/**
 * Consultation slot generation in the business's timezone without a date library dependency.
 * Uses Intl to find each wall-clock time's UTC offset (handles DST).
 */
export type BusinessHours = {
  timezone: string;
  slot_minutes: number;
  days: Record<string, [string, string]>; // ISO weekday 1..7 → ["09:00","17:00"]
  min_notice_hours: number;
  max_days_ahead: number;
  require_approval?: boolean;
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "America/New_York",
  slot_minutes: 30,
  days: {
    "1": ["09:00", "17:00"],
    "2": ["09:00", "17:00"],
    "3": ["09:00", "17:00"],
    "4": ["09:00", "17:00"],
    "5": ["09:00", "17:00"],
  },
  min_notice_hours: 24,
  max_days_ahead: 45,
  require_approval: true,
};

function tzOffsetMinutes(utc: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** Converts a wall-clock date/time in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(dateISO: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off1 = tzOffsetMinutes(guess, timeZone);
  const first = new Date(guess.getTime() - off1 * 60000);
  const off2 = tzOffsetMinutes(first, timeZone);
  return off1 === off2 ? first : new Date(guess.getTime() - off2 * 60000);
}

/** ISO weekday (1=Mon..7=Sun) of a calendar date. */
export function isoWeekday(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export type Slot = { start: string; end: string };

export function slotsForDate(
  dateISO: string,
  hours: BusinessHours,
  busy: readonly { start: string; end: string }[],
  now: Date = new Date(),
): Slot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return [];
  const window = hours.days[String(isoWeekday(dateISO))];
  if (!window) return [];
  const open = zonedTimeToUtc(dateISO, window[0], hours.timezone).getTime();
  const close = zonedTimeToUtc(dateISO, window[1], hours.timezone).getTime();
  const step = hours.slot_minutes * 60000;
  const earliest = now.getTime() + hours.min_notice_hours * 3600000;
  const latest = now.getTime() + hours.max_days_ahead * 86400000;
  const out: Slot[] = [];
  for (let s = open; s + step <= close; s += step) {
    const e = s + step;
    if (s < earliest || s > latest) continue;
    const clash = busy.some(
      (b) => s < new Date(b.end).getTime() && new Date(b.start).getTime() < e,
    );
    if (!clash) out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() });
  }
  return out;
}
