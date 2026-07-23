# Deploying to viralinvoice.onetimesuite.com

The repo is committed locally (branch `main`). Production secrets are in
`PRODUCTION_ENV.txt` (gitignored — never commit it). Follow these steps.

## 1. Push to GitHub

I couldn't run this from the agent (blocked by the permission classifier), so
run it yourself. A `gh` binary is already authenticated as `bensblueprints`:

```bash
cd /Users/benji/viral-invoice
GH=~/Downloads/gh_2.90.0_macOS_arm64/bin/gh
$GH repo create viral-invoice --private --source=. --remote=origin --push
```

Or, in the Claude Code prompt, run it with the `!` prefix so I can see the result:

```
! cd /Users/benji/viral-invoice && ~/Downloads/gh_2.90.0_macOS_arm64/bin/gh repo create viral-invoice --private --source=. --remote=origin --push
```

## 2. Coolify — Postgres

In your Coolify project (same one as onetimesuite.com):

1. **+ New → Database → PostgreSQL 18**. Name it e.g. `viral-invoice-db`.
2. After it starts, copy its **internal** connection URL (looks like
   `postgres://postgres:PASS@<service-name>:5432/postgres`).
3. Either create a `viral_invoice` database inside it, or just point
   `DATABASE_URL` at the default `postgres` db — migrations create the tables
   either way.

## 3. Coolify — the app

1. **+ New → Application → Public/Private Repository** → pick
   `bensblueprints/viral-invoice`, branch `main`.
2. **Build pack: Dockerfile** (the repo's `Dockerfile` handles build +
   migrate-on-boot; no build command needed).
3. **Port: 3000**.
4. **Environment variables** — paste everything from `PRODUCTION_ENV.txt`, then:
   - Set `DATABASE_URL` to the Postgres internal URL from step 2 (with
     `/viral_invoice` or `/postgres` as the db name).
   - Set `RESEND_API_KEY` if you want buyer emails (get one at resend.com; also
     set `EMAIL_FROM` to a verified sender). Leave blank to skip email — webhook
     + access-page delivery still work.
5. **Domain: `https://viralinvoice.onetimesuite.com`** in the app's domain
   field. Coolify provisions HTTPS via Let's Encrypt automatically.
6. **Deploy.**

## 4. DNS

Point `viralinvoice.onetimesuite.com` at the Contabo VPS:

- If you already have a wildcard `*.onetimesuite.com` A record → the VPS IP,
  nothing to do.
- Otherwise add an **A record**: host `viralinvoice`, value = the VPS IP
  (same IP onetimesuite.com resolves to: `dig +short onetimesuite.com`).

## 5. Cron for delivery retries

Add a **Scheduled Task** in Coolify (or a system cron) running every minute:

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET from PRODUCTION_ENV.txt>" \
  https://viralinvoice.onetimesuite.com/api/cron/deliveries
```

This retries any failed webhook/email deliveries. The happy path fires inline
after each payment, so this is just the safety net.

## 6. Verify live

1. Open `https://viralinvoice.onetimesuite.com` → sign up.
2. **Settings** → paste a Stripe **live** (or `sk_test_`) secret key. Because
   `APP_URL` is a real domain, the webhook auto-registers — you'll see it appear
   under Developers → Webhooks in your Stripe dashboard.
3. Create a product, then an invoice, open its public link, and run a test
   payment. Confirm the price advances and the buyer lands on the access page.

## Notes

- `ENCRYPTION_KEY` in `PRODUCTION_ENV.txt` encrypts every tenant's Stripe key at
  rest. If you ever change it, all stored keys become undecryptable and sellers
  must reconnect. Keep it stable and backed up.
- Updates: push to `main` and redeploy in Coolify. Migrations run automatically
  on every boot via `docker-entrypoint.sh`.
