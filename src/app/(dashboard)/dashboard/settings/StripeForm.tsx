"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectStripe, disconnectStripe } from "../../actions";

interface Props {
  connected: boolean;
  keyLast4?: string;
  livemode?: boolean;
  webhookRegistered?: boolean;
  isLocal: boolean;
  accountId?: string;
}

export function StripeForm({
  connected,
  keyLast4,
  livemode,
  webhookRegistered,
  isLocal,
  accountId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await connectStripe(formData);
      if (res?.error) {
        setError(res.error);
      } else if (res?.ok) {
        setOk(
          `Connected in ${res.livemode ? "LIVE" : "TEST"} mode${res.label ? ` — ${res.label}` : ""}.`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stripe</h2>
        {connected && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              livemode
                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`}
          >
            {livemode ? "LIVE" : "TEST"} · ••••{keyLast4}
          </span>
        )}
      </div>

      {connected ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Webhook:{" "}
            {webhookRegistered ? (
              <span className="text-green-600 dark:text-green-400">
                registered
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                manual (dev)
              </span>
            )}
          </p>
          <p className="text-sm">
            Rotate your key by pasting a new one below, or disconnect.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Paste your Stripe secret key. It is encrypted at rest and never shown
          again.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="secretKey">
            Stripe secret key
          </label>
          <input
            id="secretKey"
            name="secretKey"
            className="input font-mono"
            placeholder="sk_test_…"
            autoComplete="off"
            required
          />
        </div>

        {isLocal && (
          <div>
            <label className="label" htmlFor="webhookSecret">
              Webhook signing secret (dev only)
            </label>
            <input
              id="webhookSecret"
              name="webhookSecret"
              className="input font-mono"
              placeholder="whsec_…"
              autoComplete="off"
            />
            <p className="hint">
              APP_URL is local, so Stripe can&apos;t auto-register a webhook.
              Run{" "}
              <code className="rounded bg-black/10 px-1 dark:bg-white/10">
                stripe listen --forward-to
                localhost:3000/api/webhooks/stripe/{accountId ?? "<id>"}
              </code>{" "}
              and paste the whsec_… it prints.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        {ok && <p className="text-sm text-green-600">{ok}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Validating…" : connected ? "Update key" : "Connect Stripe"}
          </button>
          {connected && (
            <button
              type="button"
              className="btn-ghost text-red-500"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await disconnectStripe();
                  router.refresh();
                })
              }
            >
              Disconnect
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
