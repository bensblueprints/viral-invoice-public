import "server-only";
import { Resend } from "resend";
import { env } from "../env";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string; // plain text / simple HTML
}

/**
 * Sends a fulfillment email via Resend. Throws on failure so the caller can
 * schedule a retry. No-ops loudly if RESEND_API_KEY is unset (dev).
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!env.resendApiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const resend = new Resend(env.resendApiKey);
  const html = payload.body
    .split("\n\n")
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to: payload.to,
    subject: payload.subject,
    html,
    text: payload.body,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message ?? String(error)}`);
  }
}

/** Fill {{name}}, {{product}}, {{access_url}} placeholders. */
export function renderTemplate(
  template: string,
  vars: { name: string; product: string; access_url: string },
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/g, vars.name)
    .replace(/\{\{\s*product\s*\}\}/g, vars.product)
    .replace(/\{\{\s*access_url\s*\}\}/g, vars.access_url);
}
