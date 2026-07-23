import "server-only";
import Stripe from "stripe";
import type {
  PaymentProvider,
  CredentialCheck,
  WebhookRegistration,
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedEvent,
} from "./types";

const API_VERSION = "2026-06-24.dahlia" as Stripe.LatestApiVersion;

function client(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: API_VERSION });
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async validateCredentials(secretKey): Promise<CredentialCheck> {
    const livemode = secretKey.startsWith("sk_live_");
    try {
      // Pass null to retrieve the account tied to this key.
      const acct = await client(secretKey).accounts.retrieve(null);
      return {
        ok: true,
        livemode,
        label: acct.settings?.dashboard?.display_name ?? acct.id,
      };
    } catch (err) {
      return {
        ok: false,
        livemode,
        error: err instanceof Error ? err.message : "Invalid Stripe key",
      };
    }
  },

  async registerWebhook(secretKey, url): Promise<WebhookRegistration> {
    const endpoint = await client(secretKey).webhookEndpoints.create({
      url,
      enabled_events: ["checkout.session.completed"],
      description: "Viral Invoice — payment completion",
    });
    if (!endpoint.secret) {
      throw new Error("Stripe did not return a webhook signing secret");
    }
    return { endpointId: endpoint.id, signingSecret: endpoint.secret };
  },

  async deregisterWebhook(secretKey, endpointId): Promise<void> {
    try {
      await client(secretKey).webhookEndpoints.del(endpointId);
    } catch {
      // Endpoint may already be gone; deregistration is best-effort.
    }
  },

  async createCheckout(
    secretKey,
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    const session = await client(secretKey).checkout.sessions.create({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail,
      expires_at: input.expiresAt,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency,
            unit_amount: input.amountCents,
            product_data: { name: input.productName },
          },
        },
      ],
      metadata: input.metadata,
      payment_intent_data: { metadata: input.metadata },
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }
    return { sessionId: session.id, checkoutUrl: session.url };
  },

  async verifyAndParseWebhook(
    rawBody,
    headers,
    signingSecret,
  ): Promise<NormalizedEvent | null> {
    const sig = headers.get("stripe-signature");
    if (!sig) throw new Error("Missing stripe-signature header");

    // constructEventAsync uses WebCrypto and works in all runtimes.
    const event = await client("sk_verify_only").webhooks.constructEventAsync(
      rawBody,
      sig,
      signingSecret,
    );

    if (event.type !== "checkout.session.completed") return null;

    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status !== "paid") return null;

    return {
      type: "checkout.completed",
      sessionId: s.id,
      paymentRef:
        typeof s.payment_intent === "string"
          ? s.payment_intent
          : (s.payment_intent?.id ?? s.id),
      buyerEmail: s.customer_details?.email ?? s.customer_email ?? "",
      buyerName: s.customer_details?.name ?? undefined,
      amountCents: s.amount_total ?? 0,
      currency: s.currency ?? "usd",
      metadata: (s.metadata as Record<string, string>) ?? {},
    };
  },
};
