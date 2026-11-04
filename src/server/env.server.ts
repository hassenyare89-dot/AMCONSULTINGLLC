/** Typed access to server environment variables. Never import from client code. */
const read = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export const env = {
  supabaseUrl: () => read("SUPABASE_URL"),
  supabasePublishableKey: () => read("SUPABASE_PUBLISHABLE_KEY"),
  resendApiKey: () => read("RESEND_API_KEY"),
  leadRecipient: () => read("LEAD_RECIPIENT_EMAIL") ?? "info@amconsultingllc.net",
  mailFrom: () => read("LEAD_FROM_EMAIL") ?? "AM Consulting LLC <onboarding@resend.dev>",
  publicSiteUrl: () => read("PUBLIC_SITE_URL"),
  ipHashSalt: () => read("IP_HASH_SALT") ?? "amcms-default-salt-change-me",
  /** MFA is enforced for staff unless explicitly disabled (local development only). */
  requireMfa: () => read("AMCMS_REQUIRE_MFA") !== "false",
  bootstrapSuperAdminEmail: () => read("BOOTSTRAP_SUPER_ADMIN_EMAIL")?.toLowerCase(),
  turnstileSecret: () => read("TURNSTILE_SECRET_KEY"),
  cronSecret: () => read("CRON_SECRET"),
  allowedOrigins: () =>
    (read("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
};
