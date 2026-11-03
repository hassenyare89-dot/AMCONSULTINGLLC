/** Error codes that are safe to show to clients. Anything else is reported as INTERNAL. */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "MFA_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BAD_REQUEST: 400,
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

/** Encodes an AppError into an Error message that survives server-function serialization. */
export const ERROR_PREFIX = "AMCMS:";
export function encodeError(e: AppError): string {
  return `${ERROR_PREFIX}${JSON.stringify({ code: e.code, message: e.message, details: e.details })}`;
}
export function decodeError(err: unknown): {
  code: AppErrorCode;
  message: string;
  details?: unknown;
} {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const idx = msg.indexOf(ERROR_PREFIX);
  if (idx >= 0) {
    try {
      return JSON.parse(msg.slice(idx + ERROR_PREFIX.length));
    } catch {
      /* fall through */
    }
  }
  if (/unauthori[sz]ed/i.test(msg))
    return { code: "UNAUTHENTICATED", message: "Please sign in again." };
  return { code: "INTERNAL", message: "Something went wrong. Please try again." };
}
