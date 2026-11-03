/** Password policy aligned with NIST SP 800-63B: length over composition rules, block obvious choices. */
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "123456789012",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "amconsulting",
  "dumptruck123",
  "iloveyou1234",
  "admin123456",
]);

export function passwordProblems(pw: string, email = ""): string[] {
  const out: string[] = [];
  if (pw.length < 12) out.push("Use at least 12 characters.");
  if (pw.length > 128) out.push("Use 128 characters or fewer.");
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) out.push("That password is too common.");
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local))
    out.push("Don't include your email name in the password.");
  if (/^(.)\1+$/.test(pw)) out.push("Avoid repeating a single character.");
  return out;
}
