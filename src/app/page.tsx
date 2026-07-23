import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TIERS, feePercentLabel, tierPriceLabel } from "@/lib/tiers";

export default async function Home() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex-1">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Viral Invoice"
            className="h-9 w-auto rounded-md bg-white px-1.5 py-0.5"
          />
          <nav className="flex items-center gap-2">
            <Link href="#pricing" className="btn-ghost text-sm">
              Pricing
            </Link>
            <Link href="/login" className="btn-ghost text-sm">
              Log in
            </Link>
            <Link href="#pricing" className="btn-primary text-sm">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Viral Invoice"
          className="mx-auto mb-8 h-20 w-auto"
        />
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">
          The invoice that sells itself
        </p>
        <h1 className="mt-3 text-4xl font-bold sm:text-6xl">
          The price goes up with every buyer.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--muted)]">
          Set a base price, an increment, and a cap. Early buyers pay less, late
          buyers pay more — and everyone watches the price climb live. Payments
          land in your own Stripe. It spreads on its own.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="#pricing" className="btn-primary px-6 py-3 text-base">
            Start free
          </Link>
          <Link href="/login" className="btn-ghost px-6 py-3 text-base">
            Log in
          </Link>
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Own OneTime Suite? You get Pro free — just log in with your purchase
          email.
        </p>
      </section>

      {/* How it works */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "Connect Stripe",
              d: "Link your Stripe in one click. Payouts go straight to your account — we never hold your money.",
            },
            {
              n: "2",
              t: "Create a viral invoice",
              d: "Pick a base price, how much it rises, batch size, and a cap. Share the link anywhere.",
            },
            {
              n: "3",
              t: "Watch it climb",
              d: "Each sale bumps the price and instantly grants the buyer access. Sold-out closes it automatically.",
            },
          ].map((s) => (
            <div key={s.n}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--primary-fg)]">
                {s.n}
              </div>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold">Simple pricing</h2>
          <p className="mt-2 text-[var(--muted)]">
            Pick a plan, connect Stripe, start selling. The more you pay
            monthly, the lower your per-sale fee.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={`card flex flex-col ${
                tier.highlighted
                  ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/20"
                  : ""
              }`}
            >
              {tier.highlighted && (
                <span className="mb-3 w-fit rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary-fg)]">
                  Best value
                </span>
              )}
              <h3 className="text-lg font-bold">{tier.name}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{tier.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">
                  {tierPriceLabel(tier.monthlyPriceCents)}
                </span>
                {tier.monthlyPriceCents > 0 && (
                  <span className="text-sm text-[var(--muted)]">/month</span>
                )}
              </div>
              <div className="mt-1 text-sm font-medium text-[var(--primary)]">
                + {feePercentLabel(tier.feeBps)} per sale
              </div>

              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-[var(--primary)]">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href={tier.whopCheckoutUrl}
                className={`mt-6 ${tier.highlighted ? "btn-primary" : "btn-ghost"} w-full`}
              >
                {tier.monthlyPriceCents === 0 ? "Start free" : `Choose ${tier.name}`}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          <strong>Own OneTime Suite or the Master?</strong> You get the Pro
          plan (1% per sale) free — no monthly. Just log in with the email you
          purchased with.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-[var(--muted)] sm:flex-row">
          <span>
            Viral<span className="text-[var(--primary)]">Invoice</span> — an
            OneTime Suite product
          </span>
          <div className="flex gap-4">
            <Link href="#pricing">Pricing</Link>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
