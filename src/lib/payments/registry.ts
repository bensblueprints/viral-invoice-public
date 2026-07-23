import "server-only";
import type { PaymentProvider, ProviderId } from "./types";
import { stripeProvider } from "./stripe";

const providers: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
  // airwallex: airwallexProvider, // future — implement the same interface
};

export function getProvider(id: ProviderId | string): PaymentProvider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown payment provider: ${id}`);
  return p;
}
