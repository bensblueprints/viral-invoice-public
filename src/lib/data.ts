import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  invoices,
  products,
  payments,
  paymentAccounts,
  deliveryJobs,
} from "@/db/schema";

export async function getPaymentAccount(userId: string) {
  const [row] = await db
    .select()
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.userId, userId),
        eq(paymentAccounts.provider, "stripe"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listProducts(userId: string) {
  return db
    .select()
    .from(products)
    .where(eq(products.userId, userId))
    .orderBy(desc(products.createdAt));
}

export async function getProduct(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listInvoices(userId: string) {
  return db
    .select({
      invoice: invoices,
      productName: products.name,
    })
    .from(invoices)
    .innerJoin(products, eq(products.id, invoices.productId))
    .where(eq(invoices.userId, userId))
    .orderBy(desc(invoices.createdAt));
}

export async function getInvoice(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getInvoiceBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function listInvoicePayments(invoiceId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(desc(payments.createdAt));
}

/** Completed payments for the public social-proof feed (most recent first). */
export async function recentCompletedPayments(invoiceId: string, limit = 10) {
  return db
    .select({
      buyerName: payments.buyerName,
      buyerEmail: payments.buyerEmail,
      amountCents: payments.amountCents,
      completedAt: payments.completedAt,
    })
    .from(payments)
    .where(
      and(
        eq(payments.invoiceId, invoiceId),
        eq(payments.status, "completed"),
      ),
    )
    .orderBy(desc(payments.completedAt))
    .limit(limit);
}

export async function getPaymentByToken(token: string) {
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.accessToken, token))
    .limit(1);
  return row ?? null;
}

export async function listDeliveryJobsForPayments(paymentIds: string[]) {
  if (paymentIds.length === 0) return [];
  return db
    .select()
    .from(deliveryJobs)
    .where(sql`${deliveryJobs.paymentId} = ANY(${paymentIds})`)
    .orderBy(desc(deliveryJobs.createdAt));
}

/** Aggregate dashboard stats for a tenant. */
export async function getDashboardStats(userId: string) {
  const [revenue] = await db
    .select({
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(eq(invoices.userId, userId), eq(payments.status, "completed")),
    );

  const [active] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), eq(invoices.status, "active")));

  return {
    revenueCents: Number(revenue?.total ?? 0),
    paymentCount: Number(revenue?.count ?? 0),
    activeInvoices: Number(active?.count ?? 0),
  };
}
