// Lightweight assertions for the pure pricing logic (no test runner needed).
import { computeInvoiceState } from "../src/lib/pricing.ts";

let passed = 0;
let failed = 0;
function eq(actual, expected, label) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

// Batch of 5: base $100, +$1/batch. First 5 buyers pay $100, next 5 pay $101.
const cfg = { basePriceCents: 10000, incrementCents: 100, batchSize: 5, priceCapCents: 0 };
eq(computeInvoiceState(cfg, 0).priceCents, 10000, "batch5 @0 price");
eq(computeInvoiceState(cfg, 0).spotsLeftInBatch, 5, "batch5 @0 spots");
eq(computeInvoiceState(cfg, 4).priceCents, 10000, "batch5 @4 price (5th buyer)");
eq(computeInvoiceState(cfg, 4).spotsLeftInBatch, 1, "batch5 @4 spots");
eq(computeInvoiceState(cfg, 5).priceCents, 10100, "batch5 @5 price (6th buyer -> $101)");
eq(computeInvoiceState(cfg, 5).spotsLeftInBatch, 5, "batch5 @5 spots reset");
eq(computeInvoiceState(cfg, 9).priceCents, 10100, "batch5 @9 price");
eq(computeInvoiceState(cfg, 10).priceCents, 10200, "batch5 @10 price ($102)");
eq(computeInvoiceState(cfg, 4).nextPriceCents, 10100, "batch5 @4 next price teaser");

// Batch of 0: bump every single payment.
const per = { basePriceCents: 10000, incrementCents: 100, batchSize: 0, priceCapCents: 0 };
eq(computeInvoiceState(per, 0).priceCents, 10000, "batch0 @0");
eq(computeInvoiceState(per, 1).priceCents, 10100, "batch0 @1");
eq(computeInvoiceState(per, 2).priceCents, 10200, "batch0 @2");
eq(computeInvoiceState(per, 0).spotsLeftInBatch, 1, "batch0 spots always 1");

// Cap: base $100 +$1 each, cap $103. Sold out once next price > cap.
const cap = { basePriceCents: 10000, incrementCents: 100, batchSize: 0, priceCapCents: 10300 };
eq(computeInvoiceState(cap, 0).soldOut, false, "cap @0 not sold out ($100)");
eq(computeInvoiceState(cap, 3).priceCents, 10300, "cap @3 price ($103 == cap)");
eq(computeInvoiceState(cap, 3).soldOut, false, "cap @3 at-cap still allowed");
eq(computeInvoiceState(cap, 4).priceCents, 10400, "cap @4 price ($104)");
eq(computeInvoiceState(cap, 4).soldOut, true, "cap @4 sold out (>cap)");

// Uncapped never sells out.
eq(computeInvoiceState(per, 100000).soldOut, false, "uncapped never sold out");

// User's headline example: $100 base, $1 inc, cap $997, batch 0.
// The invoice should shut off after price would exceed $997.
// price = 100 + n; > 997 at n=898 (buyer #899). So paidCount 897 -> $997 ok, 898 -> $998 sold out.
const headline = { basePriceCents: 10000, incrementCents: 100, batchSize: 0, priceCapCents: 99700 };
eq(computeInvoiceState(headline, 897).priceCents, 99700, "headline @897 == $997");
eq(computeInvoiceState(headline, 897).soldOut, false, "headline @897 not sold out");
eq(computeInvoiceState(headline, 898).soldOut, true, "headline @898 sold out");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
