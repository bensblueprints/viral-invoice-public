import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInvoiceBySlug, recentCompletedPayments } from "@/lib/data";
import { computeInvoiceState, formatMoney } from "@/lib/pricing";
import { InvoiceLive, type InvoiceStateDTO } from "./InvoiceLive";
import { db } from "@/db";
import { products as productsTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const invoice = await getInvoiceBySlug(slug);
  if (!invoice) return null;
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, invoice.productId))
    .limit(1);
  return { invoice, product };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Invoice not found" };
  const state = computeInvoiceState(data.invoice, data.invoice.paidCount);
  const priceStr = formatMoney(state.priceCents, data.invoice.currency);
  const title = `${data.invoice.title} — ${priceStr}`;
  const description = state.soldOut
    ? "Sold out."
    : `Currently ${priceStr}. The price goes up with every buyer — grab it before it rises.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { invoice, product } = data;

  const state = computeInvoiceState(invoice, invoice.paidCount);
  const recent = await recentCompletedPayments(invoice.id, 10);

  const initial: InvoiceStateDTO = {
    priceCents: state.priceCents,
    nextPriceCents: state.nextPriceCents,
    currency: invoice.currency,
    spotsLeftInBatch: state.spotsLeftInBatch,
    effectiveBatchSize: state.effectiveBatchSize,
    paidCount: invoice.paidCount,
    soldOut: state.soldOut || invoice.status !== "active",
    capped: state.capped,
    priceCapCents: invoice.priceCapCents,
    status: invoice.status,
    recent: recent.map((r) => ({
      name: r.buyerName?.split(/\s+/)[0] ?? (r.buyerEmail?.slice(0, 2) ?? "So") + "•••",
      amountCents: r.amountCents,
      at: r.completedAt?.toISOString() ?? null,
    })),
  };

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <InvoiceLive
        slug={invoice.slug}
        title={invoice.title}
        description={product?.description ?? ""}
        initial={initial}
      />
    </main>
  );
}
