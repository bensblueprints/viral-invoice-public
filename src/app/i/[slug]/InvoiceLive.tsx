"use client";
import { useEffect, useState, useCallback } from "react";
import { formatMoney } from "@/lib/pricing";

interface Recent {
  name: string;
  amountCents: number;
  at: string | null;
}
export interface InvoiceStateDTO {
  priceCents: number;
  nextPriceCents: number;
  currency: string;
  spotsLeftInBatch: number;
  effectiveBatchSize: number;
  paidCount: number;
  soldOut: boolean;
  capped: boolean;
  priceCapCents: number;
  status: string;
  recent: Recent[];
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function InvoiceLive({
  slug,
  title,
  description,
  initial,
}: {
  slug: string;
  title: string;
  description: string;
  initial: InvoiceStateDTO;
}) {
  const [state, setState] = useState<InvoiceStateDTO>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${slug}/state`, {
        cache: "no-store",
      });
      if (res.ok) setState(await res.json());
    } catch {
      /* keep last state */
    }
  }, [slug]);

  useEffect(() => {
    const t = setInterval(refresh, 7000);
    return () => clearInterval(t);
  }, [refresh]);

  async function buy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout.");
        setLoading(false);
        await refresh();
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  const spotsWord =
    state.effectiveBatchSize === 1
      ? null
      : `${state.spotsLeftInBatch} of ${state.effectiveBatchSize} spots left at this price`;

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="card space-y-5 text-center">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
          )}
        </div>

        {state.soldOut ? (
          <div className="py-6">
            <div className="text-3xl font-bold text-red-500">Sold out</div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This invoice has closed. {state.paidCount} people paid.
            </p>
          </div>
        ) : (
          <>
            <div>
              <div className="text-5xl font-bold tabular-nums">
                {formatMoney(state.priceCents, state.currency)}
              </div>
              {spotsWord && (
                <p className="mt-2 text-sm font-medium text-[var(--primary)]">
                  {spotsWord}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--muted)]">
                Price rises to{" "}
                {formatMoney(state.nextPriceCents, state.currency)}
                {state.effectiveBatchSize === 1
                  ? " after the next payment"
                  : " once these spots fill"}
                . {state.paidCount} paid so far.
              </p>
            </div>

            <button
              className="btn-primary w-full py-3 text-base"
              onClick={buy}
              disabled={loading}
            >
              {loading
                ? "Starting checkout…"
                : `Pay ${formatMoney(state.priceCents, state.currency)}`}
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </>
        )}
      </div>

      {state.recent.length > 0 && (
        <div className="card">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent buyers
          </div>
          <ul className="space-y-1.5">
            {state.recent.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  <span className="font-medium">{r.name}</span> paid{" "}
                  {formatMoney(r.amountCents, state.currency)}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {relTime(r.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
