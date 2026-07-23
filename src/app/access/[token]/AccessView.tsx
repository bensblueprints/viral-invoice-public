"use client";
import { useEffect, useState } from "react";

interface AccessData {
  status: "pending" | "completed";
  productName: string;
  accessContent: string;
  amountCents: number;
  currency: string;
  activationUrl: string | null;
}

export function AccessView({
  token,
  initial,
}: {
  token: string;
  initial: AccessData;
}) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    if (data.status === "completed") return;
    const t = setInterval(async () => {
      const res = await fetch(`/access/${token}/status`, {
        cache: "no-store",
      });
      if (res.ok) {
        const next = await res.json();
        setData(next);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [data.status, token]);

  if (data.status !== "completed") {
    return (
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
        <h1 className="text-lg font-semibold">Confirming your payment…</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This usually takes a few seconds. This page will update automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-md space-y-4 text-center">
      <div className="text-4xl">✓</div>
      <h1 className="text-xl font-bold">You&apos;re in!</h1>
      <p className="text-sm text-[var(--muted)]">
        Payment confirmed for {data.productName}.
      </p>

      {data.activationUrl && (
        <div className="space-y-2">
          <a
            href={data.activationUrl}
            className="btn-primary w-full py-3 text-base"
            target="_blank"
            rel="noopener noreferrer"
          >
            Activate your access →
          </a>
          <p className="hint">
            One click — your email is already filled in. This unlocks your
            membership.
          </p>
        </div>
      )}

      {data.accessContent ? (
        <div className="rounded-lg border border-[var(--border)] bg-black/5 p-4 text-left text-sm whitespace-pre-wrap dark:bg-white/5">
          {data.accessContent}
        </div>
      ) : (
        !data.activationUrl && (
          <p className="text-sm text-[var(--muted)]">
            Check your email for access details.
          </p>
        )
      )}
    </div>
  );
}
