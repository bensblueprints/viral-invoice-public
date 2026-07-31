import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  paymentAccounts,
  payments,
  invoices,
  products,
  deliveryJobs,
} from "@/db/schema";
import { getProvider } from "@/lib/payments/registry";
import { decrypt } from "@/lib/crypto";
import { computeInvoiceState } from "@/lib/pricing";
import { renderTemplate } from "@/lib/delivery/email";
import { processDeliveryJob } from "@/lib/delivery";
import { newId } from "@/lib/ids";
import { env } from "@/lib/env";

const DEFAULT_SUBJECT = "Your access to {{product}}";
const DEFAULT_BODY =
  "Hi {{name}},\n\nThanks for your purchase of {{product}}! Here's your access link:\n\n{{access_url}}\n\nEnjoy!";

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/webhooks/[provider]/[accountId]">,
) {
  const { provider: providerId, accountId } = await ctx.params;

  const [account] = await db
    .select()
    .from(paymentAccounts)
    .where(eq(paymentAccounts.id, accountId))
    .limit(1);
  if (!account || account.provider !== providerId) {
    return NextResponse.json({ error: "Unknown account" }, { status: 404 });
  }
  if (!account.encryptedWebhookSecret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  const provider = getProvider(providerId);
  const signingSecret = decrypt(account.encryptedWebhookSecret);

  let event;
  try {
    event = await provider.verifyAndParseWebhook(
      rawBody,
      req.headers,
      signingSecret,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad signature" },
      { status: 400 },
    );
  }
  if (!event) return NextResponse.json({ received: true }); // irrelevant event

  // Find the pending payment for this session.
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.providerSessionId, event.sessionId))
    .limit(1);
  if (!payment) return NextResponse.json({ received: true }); // not ours
  if (payment.status === "completed") {
    return NextResponse.json({ received: true }); // idempotent replay
  }

  const jobIds: string[] = [];

  await db.transaction(async (tx) => {
    // Serialize concurrent webhooks on the same invoice.
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, payment.invoiceId))
      .for("update")
      .limit(1);
    if (!invoice) return;

    // Re-check inside the lock: another concurrent webhook may have completed it.
    const [fresh] = await tx
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.id, payment.id))
      .limit(1);
    if (fresh?.status === "completed") return;

    await tx
      .update(payments)
      .set({
        status: "completed",
        buyerEmail: event.buyerEmail || null,
        buyerName: event.buyerName || null,
        providerPaymentRef: event.paymentRef,
        completedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    const newPaidCount = invoice.paidCount + 1;
    const nextState = computeInvoiceState(invoice, newPaidCount);
    await tx
      .update(invoices)
      .set({
        paidCount: newPaidCount,
        status: nextState.soldOut ? "sold_out" : invoice.status,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    // Load the product for fulfillment config.
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, invoice.productId))
      .limit(1);
    if (!product) return;

    const accessUrl = `${env.appUrl}/access/${payment.accessToken}`;
    const buyerName = event.buyerName || "there";

    // Outbound webhook job.
    if (product.deliveryWebhookUrl) {
      const id = newId();
      await tx.insert(deliveryJobs).values({
        id,
        paymentId: payment.id,
        type: "webhook",
        status: "pending",
        payloadJson: {
          url: product.deliveryWebhookUrl,
          body: {
            event: "payment.completed",
            buyer: { email: event.buyerEmail, name: event.buyerName ?? null },
            payment: {
              amountCents: payment.amountCents,
              currency: payment.currency,
              paidAt: new Date().toISOString(),
            },
            invoice: {
              id: invoice.id,
              slug: invoice.slug,
              title: invoice.title,
            },
            product: { id: product.id, name: product.name },
            accessUrl,
          },
        },
      });
      jobIds.push(id);
    }

    // Email job.
    if (product.deliveryEmailEnabled && event.buyerEmail) {
      const id = newId();
      const subject = renderTemplate(
        product.deliveryEmailSubject || DEFAULT_SUBJECT,
        { name: buyerName, product: product.name, access_url: accessUrl },
      );
      const body = renderTemplate(product.deliveryEmailBody || DEFAULT_BODY, {
        name: buyerName,
        product: product.name,
        access_url: accessUrl,
      });
      await tx.insert(deliveryJobs).values({
        id,
        paymentId: payment.id,
        type: "email",
        status: "pending",
        payloadJson: { to: event.buyerEmail, subject, body },
      });
      jobIds.push(id);
    }

    // Seller's own purchase notification (configured via the v1 API).
    if (invoice.externalWebhookUrl) {
      const id = newId();
      await tx.insert(deliveryJobs).values({
        id,
        paymentId: payment.id,
        type: "external_purchase",
        status: "pending",
        payloadJson: {
          url: invoice.externalWebhookUrl,
          body: {
            secret: invoice.externalWebhookSecret,
            amountCents: payment.amountCents,
            externalRef: payment.id, // stable + unique → receiver-side idempotency
            email: event.buyerEmail ?? null,
          },
        },
      });
      jobIds.push(id);
    }
  });

  // Fire deliveries after the response; the cron route is the retry safety net.
  if (jobIds.length > 0) {
    after(async () => {
      for (const id of jobIds) {
        await processDeliveryJob(id);
      }
    });
  }

  return NextResponse.json({ received: true });
}
