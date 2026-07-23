/**
 * Pure, dependency-free viral-invoice price computation.
 *
 * Rule (confirmed): "increment per batch". Each batch of `batchSize` buyers
 * pays the SAME price; once the batch fills, the price rises by `increment`.
 *   base 100, increment 1, batch 5 -> 5 pay $100, next 5 pay $101, ...
 *
 * batchSize === 0 means every single payment bumps the price (batch of 1).
 * priceCapCents === 0 (or negative) means uncapped.
 *
 * `paidCount` is the number of COMPLETED payments and is the sole source of
 * truth for the current price. Never derive price from pending sessions.
 */

export interface InvoicePricingConfig {
  basePriceCents: number;
  incrementCents: number;
  batchSize: number;
  priceCapCents: number;
}

export interface InvoiceState {
  /** Price the NEXT buyer would pay, in cents. */
  priceCents: number;
  /** True when the next price exceeds the cap — invoice is closed. */
  soldOut: boolean;
  /** Zero-based index of the current batch. */
  batchIndex: number;
  /** Spots remaining in the current batch at the current price. */
  spotsLeftInBatch: number;
  /** Batch size actually used (1 when configured as 0). */
  effectiveBatchSize: number;
  /** The price the batch AFTER this one would cost (for "then $X" teasers). */
  nextPriceCents: number;
  /** True when a finite cap is configured. */
  capped: boolean;
}

export function computeInvoiceState(
  cfg: InvoicePricingConfig,
  paidCount: number,
): InvoiceState {
  const effectiveBatchSize = cfg.batchSize <= 0 ? 1 : cfg.batchSize;
  const count = Math.max(0, Math.floor(paidCount));

  const batchIndex = Math.floor(count / effectiveBatchSize);
  const priceCents = cfg.basePriceCents + batchIndex * cfg.incrementCents;
  const nextPriceCents = priceCents + cfg.incrementCents;

  const capped = cfg.priceCapCents > 0;
  const soldOut = capped && priceCents > cfg.priceCapCents;

  const spotsLeftInBatch = effectiveBatchSize - (count % effectiveBatchSize);

  return {
    priceCents,
    soldOut,
    batchIndex,
    spotsLeftInBatch,
    effectiveBatchSize,
    nextPriceCents,
    capped,
  };
}

/** Format cents as a currency string, e.g. 10000 -> "$100.00". */
export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
