import { z } from "zod";
import {
  APPOINTMENT_TOPICS,
  PRIVACY_REQUEST_TYPES,
  MATERIALS,
  REGISTRATION_AVAILABILITY,
  REGISTRATION_TRUCK_TYPES,
  SERVICE_TYPES,
  US_STATES,
} from "./domain";

/** Public form contracts shared by the browser (UX validation) and server (authoritative). */
const MATERIAL_VALUES = MATERIALS.map((m) => m.value) as [string, ...string[]];

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+().\-\s x]*$/i, "Phone number contains invalid characters");

/** Spam controls carried by every public form. */
export const antiSpam = {
  website: z.string().max(0).optional().or(z.literal("")), // honeypot
  ts: z.number().int().nonnegative(), // form-mounted timestamp (time trap)
  turnstileToken: z.string().max(4096).optional(),
};

export const ContactSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  phone: phone.optional().or(z.literal("")),
  company: optionalText(120),
  address: optionalText(300),
  service: optionalText(120),
  message: z.string().trim().min(1, "Please include a message").max(2000),
  // Optional for backward compatibility with older clients; the current form always sends it.
  consentPrivacy: z.boolean().optional(),
  ...antiSpam,
});
export type ContactInput = z.infer<typeof ContactSchema>;

/** Accepts one value or several (checkbox groups) and de-duplicates. */
const multi = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess(
    (v) => [...new Set((Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(String))],
    z.array(z.enum(values, { error: message })).min(1, message),
  );
const optionalMulti = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => [...new Set((Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(String))],
    z.array(z.enum(values)),
  );
const yesNo = z
  .enum(["yes", "no", ""])
  .optional()
  .transform((v) => (v === "yes" ? true : v === "no" ? false : undefined));

/** Georgia dump truck owner-operator registration (public form). */
export const DriverRegistrationSchema = z.object({
  ownerName: z.string().trim().min(1, "Owner / driver name is required").max(100),
  companyName: optionalText(150),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: phone.min(7, "Phone is required"),
  dotNumber: z
    .string()
    .trim()
    .min(1, "USDOT number is required")
    .max(8, "USDOT numbers are up to 8 digits")
    .regex(/^[0-9]+$/, "USDOT number must be digits only"),
  mcNumber: z
    .string()
    .trim()
    .max(20)
    .regex(/^(MC-?)?[0-9]*$/i, "MC number must be digits (optionally prefixed with MC)")
    .optional()
    .or(z.literal("")),
  truckCount: z.coerce
    .number({ error: "Enter the number of dump trucks" })
    .int("Whole trucks only")
    .min(1, "At least 1 truck")
    .max(500),
  truckTypes: multi(REGISTRATION_TRUCK_TYPES, "Select at least one truck type"),
  payloadCapacity: z.coerce
    .number({ error: "Enter the payload capacity" })
    .positive("Enter the payload capacity")
    .max(200, "That looks too large — enter capacity per truck"),
  payloadUnit: z.enum(["tons", "cubic-yards"], { error: "Choose tons or cubic yards" }),
  serviceArea: z.string().trim().min(2, "Enter the Georgia counties or area you serve").max(300),
  currentLocation: z.string().trim().min(2, "Enter the city where the truck is now").max(120),
  availability: multi(REGISTRATION_AVAILABILITY, "Select your availability"),
  cdlClass: z.enum(["A", "B", ""]).optional(),
  insuranceActive: yesNo,
  materials: optionalMulti(MATERIAL_VALUES),
  travelRadius: z.enum(["25", "50", "100", "statewide", ""]).optional(),
  notes: optionalText(1500),
  attestGeorgia: z.literal(true, {
    error: "Please confirm your truck is insured, registered and authorized to operate in Georgia",
  }),
  consentPrivacy: z.boolean().optional(),
  consentContact: z.boolean().optional(),
  ...antiSpam,
});
export type DriverRegistrationInput = z.infer<typeof DriverRegistrationSchema>;

const serviceValues = SERVICE_TYPES.map((s) => s.value) as [string, ...string[]];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const QuoteRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  company: optionalText(150),
  email: z.string().trim().email("Please enter a valid email").max(255),
  phone: phone.optional().or(z.literal("")),
  serviceType: z.enum(serviceValues, { error: "Select a service" }),
  pickupLocation: z.string().trim().min(3, "Jobsite / pickup location is required").max(300),
  destination: optionalText(300),
  truckType: optionalText(40),
  truckCount: z.coerce.number().int().min(1).max(500).optional(),
  material: optionalText(120),
  estimatedDuration: optionalText(120),
  preferredDate: isoDate.optional().or(z.literal("")),
  details: optionalText(3000),
  consentPrivacy: z.literal(true, { error: "Please acknowledge the privacy notice" }),
  ...antiSpam,
});
export type QuoteRequestInput = z.infer<typeof QuoteRequestSchema>;

const topicValues = APPOINTMENT_TOPICS.map((t) => t.value) as [string, ...string[]];
export const AppointmentRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  phone: phone.optional().or(z.literal("")),
  company: optionalText(150),
  topic: z.enum(topicValues),
  notes: optionalText(1500),
  start: z.string().datetime({ message: "Pick a time slot" }),
  consentPrivacy: z.literal(true, { error: "Please acknowledge the privacy notice" }),
  ...antiSpam,
});
export type AppointmentRequestInput = z.infer<typeof AppointmentRequestSchema>;

const privacyTypes = PRIVACY_REQUEST_TYPES.map((t) => t.value) as [string, ...string[]];
export const PrivacyRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  stateOfResidence: z.enum(US_STATES).optional().or(z.literal("")),
  requestType: z.enum(privacyTypes),
  details: optionalText(3000),
  ...antiSpam,
});
export type PrivacyRequestInput = z.infer<typeof PrivacyRequestSchema>;

export const DriverStatusLookupSchema = z.object({
  id: z.string().uuid("That reference doesn't look right"),
  email: z.string().trim().email().max(255),
});
