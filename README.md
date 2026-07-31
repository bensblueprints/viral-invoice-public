# Viral Invoice

Multi-tenant SaaS for **escalating-price invoices**. Each buyer pays more than the
last: set a base price, an increment, a batch size, and a cap, and the invoice
gets more expensive as people pay — with a live public page showing the price
tick up and recent buyers, so it spreads on its own.

Sellers connect their **own Stripe account** (secret key, encrypted at rest),
create a product, and publish an invoice. When someone pays, a Stripe webhook
advances the price and fulfills the buyer via three configurable channels.

## The pricing mechanic

`base $100, increment $1, batch 5` → first 5 buyers pay **$100**, next 5 pay
**$101**, next 5 pay **$102**, … Each batch of `batchSize` buyers pays the same
price; then it rises by `increment`.

- `batchSize = 0` → the price bumps on **every** payment.
- `priceCap` → once the next price would exceed the cap, the invoice **sells out**
  and stops accepting payments (`0` = uncapped).

The pure logic lives in `src/lib/pricing.ts` (`computeInvoiceState`) and is unit
tested in `scripts/test-pricing.mjs`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Postgres +
Drizzle · better-auth · Stripe · Resend. Deploys as a standalone Docker image.

## Local development

No Docker or system Postgres required — `embedded-postgres` downloads a real
Postgres binary.

```bash
cp .env.example .env      # (an .env with generated secrets is already present)
npm install
npm run db:start          # starts Postgres on :5432 (leave running)
npm run db:migrate        # apply schema
npm run dev               # http://localhost:3000
```

### Connecting Stripe in dev

Because `APP_URL` is `localhost`, Stripe can't auto-register a webhook. Forward
events with the Stripe CLI and paste the printed `whsec_…` into **Settings**:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe/<accountId>
```

(`<accountId>` is shown in the Settings dev hint after you paste your `sk_test_` key.)
Pay a test invoice with card `4242 4242 4242 4242`.

In production (`APP_URL` is a real domain) the webhook is registered
automatically when the key is saved, and its signing secret is stored encrypted.

## Tests

```bash
npm run test:pricing                 # 22 pure pricing assertions
node scripts/test-core-loop.mjs      # 34 end-to-end webhook→price→delivery assertions
```

The core-loop test signs real Stripe events and drives the actual webhook route,
so it verifies signature checking, the price ladder, the sold-out flip,
idempotent replay, checkout rejection, and outbound delivery — no live Stripe
key needed.

## Delivery / fulfillment

Configured per product; all optional and independent:

1. **Outbound webhook** — signed (`X-Signature` HMAC) JSON POST to a tenant URL
   (e.g. GoHighLevel), retried with backoff (1m/5m/30m/2h/12h → dead).
2. **Email** — via Resend, with `{{name}}`/`{{product}}`/`{{access_url}}` template.
3. **Hosted access page** — `/access/[token]` reveals the product content once
   the payment is confirmed.

Deliveries fire inline after the webhook via `after()`; the cron route is the
retry safety net. Point a scheduler at it every minute:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/deliveries
```

## API

Create an API key in **Dashboard → Settings → API Keys**. The full key is shown
exactly once; only its SHA-256 hash is stored. Send it as a bearer token:

```bash
KEY=vi_…
curl -H "Authorization: Bearer $KEY" $APP_URL/api/v1/me
# → { "userId": "…", "email": "you@example.com" }

curl -H "Authorization: Bearer $KEY" $APP_URL/api/v1/invoices
# → { "invoices": [ { "id", "slug", "title", "status", "currency",
#                     "priceCents", "checkoutUrl" } ] }

# Register (or replace) a purchase webhook on one of your invoices:
curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/hook", "secret": "at-least-16-chars" }' \
  $APP_URL/api/v1/invoices/<invoiceId>/webhook
# → { "ok": true }   (DELETE on the same URL clears it)
```

Bad or revoked keys get `401 { "error": "unauthorized" }`.

### Purchase webhook payload

When a payment completes on an invoice with a webhook configured, the delivery
queue POSTs (any 2xx = success, retried with the usual backoff):

```json
{
  "secret": "at-least-16-chars",
  "amountCents": 10100,
  "externalRef": "<payment id — stable and unique, use for idempotency>",
  "email": "buyer@example.com"
}
```

## Deploying to Coolify

1. Provision a Postgres service; set `DATABASE_URL`.
2. Set the rest of the env vars (see `.env.example`) — notably a real `APP_URL`,
   `ENCRYPTION_KEY` (base64 of 32 bytes), `RESEND_API_KEY`, and `CRON_SECRET`.
3. Deploy the `Dockerfile`. The entrypoint runs `drizzle-kit migrate` before
   starting the server.
4. Add a scheduled task hitting `/api/cron/deliveries` every minute.

## Adding Airwallex later

Implement `PaymentProvider` (`src/lib/payments/types.ts`) in a new file and add
it to the registry (`src/lib/payments/registry.ts`). Nothing else changes — the
checkout route, webhook route, and pricing are provider-agnostic.
