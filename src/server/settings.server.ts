import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "@/lib/shared/slots";
import { db } from "./db.server";

export type SettingsShape = {
  "appointments.business_hours": BusinessHours;
  "notifications.recipients": {
    leads: string[];
    drivers: string[];
    quotes: string[];
    appointments: string[];
  };
  "quotes.defaults": { valid_days: number; tax_rate: number; terms: string };
  "retention.policy": Record<string, number>;
  "security.session": { idle_timeout_minutes: number };
};

export const SETTINGS_DEFAULTS: SettingsShape = {
  "appointments.business_hours": DEFAULT_BUSINESS_HOURS,
  "notifications.recipients": { leads: [], drivers: [], quotes: [], appointments: [] },
  "quotes.defaults": {
    valid_days: 30,
    tax_rate: 0,
    terms:
      "This estimate is for planning purposes only and is not a binding commitment until confirmed in writing by AM Consulting & Hauling.",
  },
  "retention.policy": {
    contact_submissions_days: 730,
    rejected_driver_applications_days: 365,
    login_audit_days: 365,
    privacy_requests_days: 730,
  },
  "security.session": { idle_timeout_minutes: 30 },
};

export async function getSetting<K extends keyof SettingsShape>(key: K): Promise<SettingsShape[K]> {
  const { data } = await db().from("system_settings").select("value").eq("key", key).maybeSingle();
  return { ...SETTINGS_DEFAULTS[key], ...((data?.value as object) ?? {}) } as SettingsShape[K];
}
