import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { getInvoiceBySlug, getPaymentAccount } from "@/lib/data";
import { getProvider } from "@/lib/payments/registry";
import { computeInvoiceState } from "@/lib/pricing";
import { decrypt } from "@/lib/crypto";
import { newId, newToken } from "@/lib/ids";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  let slug: string;
  try {
    const body = await req.json();
    slug = String(body.slug ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const invoice = await getInvoiceBySlug(slug);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status !== "active") {
    return NextResponse.json(
      { error: "This invoice is not accepting payments." },
      { status: 409 },
    );
  }

  const state = computeInvoiceState(invoice, invoice.paidCount);
  if (state.soldOut) {
    return NextResponse.json({ error: "Sold out" }, { status: 409 });
  }

  const account = await getPaymentAccount(invoice.userId);
  if (!account) {
    return NextResponse.json(
      { error: "The seller hasn't connected a payment account." },
      { status: 400 },
    );
  }

  const provider = getProvider(account.provider);
  const secretKey = decrypt(account.encryptedSecretKey);

  const paymentId = newId();
  const accessToken = newToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min

  let session;
  try {
    session = await provider.createCheckout(secretKey, {
      amountCents: state.priceCents,
      currency: invoice.currency,
      productName: invoice.title,
      successUrl: `${env.appUrl}/access/${accessToken}`,
      cancelUrl: `${env.appUrl}/i/${invoice.slug}`,
      expiresAt,
      metadata: { invoiceId: invoice.id, paymentId },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not start checkout.",
      },
      { status: 502 },
    );
  }

  await db.insert(payments).values({
    id: paymentId,
    invoiceId: invoice.id,
    provider: account.provider,
    providerSessionId: session.sessionId,
    amountCents: state.priceCents,
    currency: invoice.currency,
    status: "pending",
    accessToken,
  });

  // Touch updatedAt so listeners can notice activity (harmless no-op field set).
  await db
    .update(invoices)
    .set({ updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id));

  return NextResponse.json({ checkoutUrl: session.checkoutUrl });
}
