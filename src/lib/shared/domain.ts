/** Shared domain vocabularies, labels, and workflow rules (client + server). */

export type Option<T extends string = string> = { value: T; label: string };
const opts = <T extends string>(pairs: readonly (readonly [T, string])[]): Option<T>[] =>
  pairs.map(([value, label]) => ({ value, label }));

// ---- driver applications ---------------------------------------------------------
export const DRIVER_APP_STATUSES = [
  "new",
  "reviewed",
  "info_requested",
  "approved",
  "rejected",
  "archived",
] as const;
export type DriverAppStatus = (typeof DRIVER_APP_STATUSES)[number];
export const DRIVER_APP_STATUS_OPTIONS = opts<DriverAppStatus>([
  ["new", "New"],
  ["reviewed", "Under review"],
  ["info_requested", "Info requested"],
  ["approved", "Approved"],
  ["rejected", "Not approved"],
  ["archived", "Archived"],
]);
/** Allowed review transitions. */
export const DRIVER_APP_TRANSITIONS: Record<DriverAppStatus, readonly DriverAppStatus[]> = {
  new: ["reviewed", "info_requested", "approved", "rejected", "archived"],
  reviewed: ["info_requested", "approved", "rejected", "archived"],
  info_requested: ["reviewed", "approved", "rejected", "archived"],
  approved: ["archived", "reviewed"],
  rejected: ["reviewed", "archived"],
  archived: ["reviewed"],
};
/** Applicant-facing wording (never exposes internal notes). */
export const DRIVER_APP_PUBLIC_LABEL: Record<DriverAppStatus, string> = {
  new: "Received",
  reviewed: "Under review",
  info_requested: "Additional information requested",
  approved: "Approved",
  rejected: "Not approved",
  archived: "Closed",
};

export const TRUCK_TYPES = opts([
  ["tandem", "Tandem"],
  ["tri-axle", "Tri-axle"],
  ["quad-axle", "Quad-axle"],
  ["side-dump", "Side dump"],
  ["super-dump", "Super dump"],
  ["end-dump", "End dump"],
  ["other", "Other"],
] as const);
/** Truck types accepted by the public registration form (unchanged from the original site). */
export const REGISTRATION_TRUCK_TYPES = [
  "tandem",
  "quad-axle",
  "side-dump",
  "super-dump",
  "other",
] as const;
export const AVAILABILITY = opts([
  ["full-time", "Full-time"],
  ["part-time", "Part-time"],
  ["on-call", "On-call / as-needed"],
] as const);

// ---- fleet ------------------------------------------------------------------------
export const TRUCK_AVAILABILITY = opts([
  ["available", "Available"],
  ["assigned", "Assigned"],
  ["maintenance", "Maintenance"],
  ["out_of_service", "Out of service"],
] as const);
export const DRIVER_STATUS = opts([
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["suspended", "Suspended"],
] as const);

// ---- dispatch ---------------------------------------------------------------------
export const DISPATCH_STATUSES = [
  "new",
  "scheduled",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
  "on_hold",
] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];
export const DISPATCH_STATUS_OPTIONS = opts<DispatchStatus>([
  ["new", "New"],
  ["scheduled", "Scheduled"],
  ["assigned", "Assigned"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["on_hold", "On hold"],
]);
/** New → Scheduled → Assigned → In Progress → Completed, plus On Hold / Cancelled. */
export const DISPATCH_TRANSITIONS: Record<DispatchStatus, readonly DispatchStatus[]> = {
  new: ["scheduled", "assigned", "on_hold", "cancelled"],
  scheduled: ["assigned", "on_hold", "cancelled", "new"],
  assigned: ["in_progress", "scheduled", "on_hold", "cancelled"],
  in_progress: ["completed", "on_hold", "cancelled"],
  on_hold: ["scheduled", "assigned", "in_progress", "cancelled"],
  completed: [],
  cancelled: ["new"],
};

// ---- projects ---------------------------------------------------------------------
export const PROJECT_STATUS = opts([
  ["planning", "Planning"],
  ["scheduled", "Scheduled"],
  ["active", "Active"],
  ["on_hold", "On hold"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
] as const);

// ---- CRM --------------------------------------------------------------------------
export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_STAGE_OPTIONS = opts<LeadStage>([
  ["new", "New lead"],
  ["contacted", "Contacted"],
  ["qualified", "Qualified"],
  ["proposal_sent", "Proposal sent"],
  ["negotiation", "Negotiation"],
  ["won", "Won"],
  ["lost", "Lost"],
]);
export const LEAD_SOURCES = opts([
  ["manual", "Manual entry"],
  ["contact_form", "Website contact form"],
  ["quote_request", "Website quote request"],
  ["appointment", "Consultation booking"],
  ["referral", "Referral"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["other", "Other"],
] as const);
export const ACTIVITY_TYPES = opts([
  ["note", "Note"],
  ["call", "Call"],
  ["email", "Email"],
  ["meeting", "Meeting"],
] as const);
export const TASK_STATUS = opts([
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["done", "Done"],
  ["cancelled", "Cancelled"],
] as const);
export const PRIORITY = opts([
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const);

// ---- services ---------------------------------------------------------------------
export const SERVICE_TYPES = opts([
  ["dump-truck-dispatching", "Dump Truck Dispatching"],
  ["load-coordination", "Load Coordination"],
  ["project-scheduling", "Project Scheduling"],
  ["hauling-logistics", "Hauling Logistics"],
  ["transportation-consulting", "Transportation Consulting"],
  ["contractor-support", "Contractor Support"],
  ["other", "Other / not sure"],
] as const);

// ---- quotes -----------------------------------------------------------------------
export const ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];
export const ESTIMATE_STATUS_OPTIONS = opts<EstimateStatus>([
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["viewed", "Viewed"],
  ["accepted", "Accepted by customer"],
  ["declined", "Declined"],
  ["expired", "Expired"],
]);
export const QUOTE_REQUEST_STATUS = opts([
  ["new", "New"],
  ["reviewing", "Reviewing"],
  ["estimated", "Estimate created"],
  ["closed", "Closed"],
] as const);
export const PRICING_UNITS = opts([
  ["hour", "Per hour"],
  ["load", "Per load"],
  ["ton", "Per ton"],
  ["cubic_yard", "Per cubic yard"],
  ["day", "Per day"],
  ["mile", "Per mile"],
  ["flat", "Flat fee"],
] as const);

// ---- appointments -----------------------------------------------------------------
export const APPOINTMENT_STATUS = opts([
  ["requested", "Requested"],
  ["confirmed", "Confirmed"],
  ["cancelled", "Cancelled"],
  ["completed", "Completed"],
  ["no_show", "No-show"],
] as const);
export const APPOINTMENT_TOPICS = opts([
  ["dispatch-services", "Dispatch services for my trucks"],
  ["hauling-project", "Hauling for a construction project"],
  ["consulting", "Transportation / logistics consulting"],
  ["other", "Something else"],
] as const);

// ---- documents --------------------------------------------------------------------
export const DOCUMENT_CATEGORIES = opts([
  ["service_agreement", "Service agreement"],
  ["driver_registration", "Driver registration document"],
  ["insurance", "Insurance information"],
  ["vehicle_registration", "Vehicle registration"],
  ["project", "Project document"],
  ["customer_correspondence", "Customer correspondence"],
  ["policy", "Business policy"],
  ["other", "Other"],
] as const);
export const DOCUMENT_ENTITY_TYPES = opts([
  ["company", "Company (general)"],
  ["driver", "Driver"],
  ["driver_application", "Driver application"],
  ["truck", "Truck"],
  ["project", "Project"],
  ["customer", "Customer"],
] as const);
export const DOCUMENT_SENSITIVITY = opts([
  ["internal", "Internal"],
  ["confidential", "Confidential"],
  ["restricted", "Restricted (sensitive personal / vehicle data)"],
] as const);

// ---- privacy ----------------------------------------------------------------------
export const PRIVACY_REQUEST_TYPES = opts([
  ["access", "Access / know what data you hold"],
  ["delete", "Delete my data"],
  ["correct", "Correct my data"],
  ["opt_out", "Opt out of marketing / sale / sharing"],
  ["portability", "Get a copy of my data"],
  ["other", "Other"],
] as const);
export const PRIVACY_REQUEST_STATUS = opts([
  ["received", "Received"],
  ["verifying", "Verifying identity"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["denied", "Denied"],
] as const);

/** Version string recorded with every consent; bump when the privacy notice changes materially. */
export const PRIVACY_POLICY_VERSION = "2026-11-02-draft";

export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

export function labelFor(options: readonly Option[], value: string | null | undefined): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}
