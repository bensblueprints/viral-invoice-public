import { NextResponse } from "next/server";
import { getInvoiceBySlug, recentCompletedPayments } from "@/lib/data";
import { computeInvoiceState } from "@/lib/pricing";

/** Public, cache-free price/progress feed polled by the invoice page. */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/invoices/[slug]/state">,
) {
  const { slug } = await ctx.params;
  const invoice = await getInvoiceBySlug(slug);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const state = computeInvoiceState(invoice, invoice.paidCount);
  const recent = await recentCompletedPayments(invoice.id, 10);

  const soldOut = state.soldOut || invoice.status !== "active";

  return NextResponse.json(
    {
      priceCents: state.priceCents,
      nextPriceCents: state.nextPriceCents,
      currency: invoice.currency,
      spotsLeftInBatch: state.spotsLeftInBatch,
      effectiveBatchSize: state.effectiveBatchSize,
      paidCount: invoice.paidCount,
      soldOut,
      capped: state.capped,
      priceCapCents: invoice.priceCapCents,
      status: invoice.status,
      recent: recent.map((r) => ({
        name: maskBuyer(r.buyerName, r.buyerEmail),
        amountCents: r.amountCents,
        at: r.completedAt?.toISOString() ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function maskBuyer(name: string | null, email: string | null): string {
  if (name && name.trim()) return name.trim().split(/\s+/)[0];
  if (email) {
    const [local] = email.split("@");
    return local.slice(0, 2) + "•••";
  }
  return "Someone";
}
