export type ProviderId = "stripe" | "airwallex";

export interface CredentialCheck {
  ok: boolean;
  livemode: boolean;
  /** Human-readable label, e.g. account name or last4 of the key. */
  label?: string;
  error?: string;
}

export interface WebhookRegistration {
  endpointId: string;
  signingSecret: string;
}

export interface CreateCheckoutInput {
  amountCents: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  /** Bounds price drift between session creation and completion. */
  expiresAt?: number; // unix seconds
  metadata: Record<string, string>;
}

export interface CreateCheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

/** Normalized "a payment completed" event, provider-agnostic. */
export interface NormalizedEvent {
  type: "checkout.completed";
  sessionId: string;
  paymentRef: string;
  buyerEmail: string;
  buyerName?: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface PaymentProvider {
  id: ProviderId;
  validateCredentials(secretKey: string): Promise<CredentialCheck>;
  registerWebhook(secretKey: string, url: string): Promise<WebhookRegistration>;
  deregisterWebhook(secretKey: string, endpointId: string): Promise<void>;
  createCheckout(
    secretKey: string,
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult>;
  /**
   * Verify the signature and parse the raw request body.
   * Returns null for valid-but-irrelevant events; throws on bad signature.
   */
  verifyAndParseWebhook(
    rawBody: string,
    headers: Headers,
    signingSecret: string,
  ): Promise<NormalizedEvent | null>;
}
