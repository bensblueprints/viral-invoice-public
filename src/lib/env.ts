import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  appUrl: required("APP_URL").replace(/\/$/, ""),
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  encryptionKey: required("ENCRYPTION_KEY"),
  resendApiKey: optional("RESEND_API_KEY"),
  emailFrom: optional("EMAIL_FROM", "Invoices <onboarding@resend.dev>"),
  cronSecret: required("CRON_SECRET"),
};

/** True when running against a local/dev APP_URL where Stripe cannot reach us. */
export function isLocalAppUrl(): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(env.appUrl);
}
