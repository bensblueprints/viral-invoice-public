import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, invoices, products } from "@/db/schema";

export interface AccessData {
  status: "pending" | "completed";
  productName: string;
  accessContent: string;
  amountCents: number;
  currency: string;
  /** Pre-filled Whop (or other) checkout link to activate the membership. */
  activationUrl: string | null;
}

/** Append the buyer's email to a checkout URL so it's pre-filled on Whop. */
export function buildActivationUrl(
  checkoutUrl: string,
  buyerEmail: string | null,
): string {
  if (!buyerEmail) return checkoutUrl;
  const sep = checkoutUrl.includes("?") ? "&" : "?";
  return `${checkoutUrl}${sep}email=${encodeURIComponent(buyerEmail)}`;
}

/** Resolve a buyer access token into what the access page should show.
 *  accessContent and the activation link are only revealed once paid. */
export async function getAccessData(token: string): Promise<AccessData | null> {
  const [row] = await db
    .select({
      status: payments.status,
      amountCents: payments.amountCents,
      currency: payments.currency,
      buyerEmail: payments.buyerEmail,
      productName: products.name,
      accessContent: products.accessContent,
      whopCheckoutUrl: products.whopCheckoutUrl,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(products, eq(products.id, invoices.productId))
    .where(eq(payments.accessToken, token))
    .limit(1);

  if (!row) return null;

  const completed = row.status === "completed";
  return {
    status: completed ? "completed" : "pending",
    productName: row.productName,
    accessContent: completed ? row.accessContent : "",
    amountCents: row.amountCents,
    currency: row.currency,
    activationUrl:
      completed && row.whopCheckoutUrl
        ? buildActivationUrl(row.whopCheckoutUrl, row.buyerEmail)
        : null,
  };
}
