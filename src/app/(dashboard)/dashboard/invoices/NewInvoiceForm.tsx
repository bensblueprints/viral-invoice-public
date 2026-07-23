"use client";
import { useState } from "react";
import Link from "next/link";
import { createInvoice } from "../../actions";
import { computeInvoiceState, formatMoney } from "@/lib/pricing";

interface ProductOption {
  id: string;
  name: string;
}

export function NewInvoiceForm({ products }: { products: ProductOption[] }) {
  const [base, setBase] = useState(100);
  const [increment, setIncrement] = useState(1);
  const [batch, setBatch] = useState(5);
  const [cap, setCap] = useState(997);

  const cfg = {
    basePriceCents: Math.round(base * 100),
    incrementCents: Math.round(increment * 100),
    batchSize: batch,
    priceCapCents: Math.round(cap * 100),
  };

  // Preview the first several buyers' prices.
  const preview = Array.from({ length: 8 }, (_, i) => {
    const s = computeInvoiceState(cfg, i);
    return { buyer: i + 1, ...s };
  });
  const soldOutAt = (() => {
    if (cfg.priceCapCents <= 0) return null;
    for (let n = 0; n < 100000; n++) {
      if (computeInvoiceState(cfg, n).soldOut) return n;
    }
    return null;
  })();

  if (products.length === 0) {
    return (
      <div className="card text-sm text-[var(--muted)]">
        You need a product first.{" "}
        <Link href="/dashboard/products/new" className="text-[var(--primary)]">
          Create one
        </Link>{" "}
        — it defines what buyers receive.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form action={createInvoice} className="space-y-6">
        <div className="card space-y-4">
          <div>
            <label className="label" htmlFor="title">
              Invoice title
            </label>
            <input id="title" name="title" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="productId">
              Product
            </label>
            <select id="productId" name="productId" className="input" required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">Pricing mechanic</h2>
          <div className="grid grid-cols-2 gap-4">
            <Money label="Base price" name="basePrice" value={base} onChange={setBase} />
            <Money
              label="Increment"
              name="increment"
              value={increment}
              onChange={setIncrement}
            />
            <div>
              <label className="label" htmlFor="batchSize">
                Payments per price
              </label>
              <input
                id="batchSize"
                name="batchSize"
                type="number"
                min={0}
                className="input"
                value={batch}
                onChange={(e) => setBatch(parseInt(e.target.value || "0", 10))}
              />
              <p className="hint">
                How many buyers pay each price before it goes up. 0 = every
                payment bumps the price.
              </p>
            </div>
            <Money
              label="Price cap (0 = none)"
              name="priceCap"
              value={cap}
              onChange={setCap}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary">
            Create &amp; activate
          </button>
          <Link href="/dashboard/invoices" className="btn-ghost">
            Cancel
          </Link>
        </div>
      </form>

      <div className="card h-fit space-y-3">
        <h3 className="font-semibold">Preview</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)]">
              <th className="pb-1 font-medium">Buyer</th>
              <th className="pb-1 font-medium">Pays</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((p) => (
              <tr key={p.buyer} className={p.soldOut ? "opacity-40" : ""}>
                <td className="py-0.5">#{p.buyer}</td>
                <td className="py-0.5 font-mono">
                  {p.soldOut ? "— sold out —" : formatMoney(p.priceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {soldOutAt !== null && (
          <p className="hint">
            Shuts off after <strong>{soldOutAt}</strong> payments (once the
            price would exceed {formatMoney(cfg.priceCapCents)}).
          </p>
        )}
      </div>
    </div>
  );
}

function Money({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          $
        </span>
        <input
          id={name}
          name={name}
          type="number"
          min={0}
          step="0.01"
          className="input pl-6"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
        />
      </div>
    </div>
  );
}
