import "server-only";
import { signPayload } from "../crypto";

/**
 * POSTs a JSON payload to a tenant-configured delivery webhook (e.g.
 * GoHighLevel, Zapier). Signs the body with HMAC-SHA256 in X-Signature.
 * Throws on non-2xx or timeout so the caller can schedule a retry.
 */
export async function postWebhook(
  url: string,
  payload: unknown,
): Promise<void> {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signPayload(body),
        "User-Agent": "ViralInvoice-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Webhook responded ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
