import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { verifyApiKey } from "@/lib/api-auth";
import { computeInvoiceState } from "@/lib/pricing";

export async function GET(req: Request) {
  const auth = await verifyApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.userId, auth.userId))
    .orderBy(desc(invoices.createdAt));

  const origin = new URL(req.url).origin;

  return NextResponse.json({
    invoices: rows.map((inv) => ({
      id: inv.id,
      slug: inv.slug,
      title: inv.title,
      status: inv.status,
      currency: inv.currency,
      priceCents: computeInvoiceState(inv, inv.paidCount).priceCents,
      checkoutUrl: `${origin}/i/${inv.slug}`,
    })),
  });
}
