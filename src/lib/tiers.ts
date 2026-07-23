/**
 * Viral Invoice subscription tiers. The monthly price is billed via Whop;
 * `feeBps` is the platform application fee (basis points) taken from every
 * sale the seller processes through Viral Invoice via Stripe Connect.
 *
 * OneTime Suite / Master owners are granted the "pro" rate (1%) for free —
 * resolved at login by checking their Whop membership by email.
 *
 * whopCheckoutUrl: paste the Whop plan checkout link for each tier once the
 * Viral Invoice product + plans exist in Whop. Overridable via env
 * (WHOP_URL_FREE / WHOP_URL_GROWTH / WHOP_URL_PRO).
 */
export interface Tier {
  key: "free" | "growth" | "pro";
  name: string;
  monthlyPriceCents: number;
  feeBps: number; // 500 = 5%, 300 = 3%, 100 = 1%
  tagline: string;
  features: string[];
  highlighted?: boolean;
  whopCheckoutUrl: string;
}

const url = (envKey: string): string => process.env[envKey] || "#";

export const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    monthlyPriceCents: 0,
    feeBps: 500,
    tagline: "Launch your first escalating invoice at no monthly cost.",
    features: [
      "Unlimited viral invoices",
      "Live price ticker + social proof pages",
      "Stripe payouts to your own account",
      "Webhook, email & hosted access-page delivery",
      "5% platform fee per sale",
    ],
    whopCheckoutUrl: url("WHOP_URL_FREE"),
  },
  {
    key: "growth",
    name: "Growth",
    monthlyPriceCents: 2900,
    feeBps: 300,
    tagline: "For creators running campaigns every week.",
    features: [
      "Everything in Free",
      "Lower 3% platform fee per sale",
      "Priority delivery retries",
      "Custom branding on invoice pages",
    ],
    whopCheckoutUrl: url("WHOP_URL_GROWTH"),
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPriceCents: 9900,
    feeBps: 100,
    tagline: "Lowest fee. For serious volume.",
    features: [
      "Everything in Growth",
      "Lowest 1% platform fee per sale",
      "Remove Viral Invoice branding",
      "Included free for OneTime Suite owners",
    ],
    highlighted: true,
    whopCheckoutUrl: url("WHOP_URL_PRO"),
  },
];

export function feePercentLabel(feeBps: number): string {
  return `${feeBps / 100}%`;
}

export function tierPriceLabel(cents: number): string {
  return cents === 0 ? "Free" : `$${Math.round(cents / 100)}`;
}
