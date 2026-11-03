import { z } from "zod";
import {
  APPOINTMENT_TOPICS,
  PRIVACY_REQUEST_TYPES,
  REGISTRATION_TRUCK_TYPES,
  SERVICE_TYPES,
  US_STATES,
} from "./domain";

/** Public form contracts shared by the browser (UX validation) and server (authoritative). */

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

export const DriverRegistrationSchema = z.object({
  ownerName: z.string().trim().min(1, "Owner name is required").max(100),
  companyName: optionalText(150),
  email: z.string().trim().email("Invalid email").max(255),
  phone: phone.min(7, "Phone is required"),
  // USDOT/MC are collected "where applicable" — not every owner-operator has their own authority.
  dotNumber: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9]*$/, "USDOT number must be digits only")
    .optional()
    .or(z.literal("")),
  mcNumber: z
    .string()
    .trim()
    .max(20)
    .regex(/^(MC-?)?[0-9]*$/i, "MC number must be digits (optionally prefixed with MC)")
    .optional()
    .or(z.literal("")),
  truckType: z.enum(REGISTRATION_TRUCK_TYPES, {
    errorMap: () => ({ message: "Select a truck type" }),
  }),
  truckCount: z.coerce.number().int().min(1, "At least 1 truck").max(500),
  serviceArea: z.string().trim().min(2, "Service area is required").max(200),
  availability: z.enum(["full-time", "part-time", "on-call"], {
    errorMap: () => ({ message: "Select availability" }),
  }),
  notes: optionalText(1500),
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
  serviceType: z.enum(serviceValues, { errorMap: () => ({ message: "Select a service" }) }),
  pickupLocation: z.string().trim().min(3, "Jobsite / pickup location is required").max(300),
  destination: optionalText(300),
  truckType: optionalText(40),
  truckCount: z.coerce.number().int().min(1).max(500).optional(),
  material: optionalText(120),
  estimatedDuration: optionalText(120),
  preferredDate: isoDate.optional().or(z.literal("")),
  details: optionalText(3000),
  consentPrivacy: z.literal(true, {
    errorMap: () => ({ message: "Please acknowledge the privacy notice" }),
  }),
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
  consentPrivacy: z.literal(true, {
    errorMap: () => ({ message: "Please acknowledge the privacy notice" }),
  }),
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
