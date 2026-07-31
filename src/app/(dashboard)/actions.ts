"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  products,
  invoices,
  paymentAccounts,
  deliveryJobs,
  payments,
  apiKeys,
} from "@/db/schema";
import { requireUserId } from "@/lib/session";
import { newId, newSlug, newToken } from "@/lib/ids";
import { encrypt, sha256Hex } from "@/lib/crypto";
import { getProvider } from "@/lib/payments/registry";
import { env, isLocalAppUrl } from "@/lib/env";
import { getPaymentAccount, getInvoice } from "@/lib/data";
import { retryDeliveryJobNow } from "@/lib/delivery";

/* ----------------------------- Products ----------------------------- */

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
  deliveryWebhookUrl: z
    .string()
    .url("Must be a valid URL")
    .or(z.literal(""))
    .default(""),
  deliveryEmailEnabled: z.boolean().default(false),
  deliveryEmailSubject: z.string().default(""),
  deliveryEmailBody: z.string().default(""),
  accessContent: z.string().default(""),
  whopCheckoutUrl: z
    .string()
    .url("Must be a valid URL")
    .or(z.literal(""))
    .default(""),
});

function parseProductForm(formData: FormData) {
  return productSchema.parse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    deliveryWebhookUrl: formData.get("deliveryWebhookUrl") ?? "",
    deliveryEmailEnabled: formData.get("deliveryEmailEnabled") === "on",
    deliveryEmailSubject: formData.get("deliveryEmailSubject") ?? "",
    deliveryEmailBody: formData.get("deliveryEmailBody") ?? "",
    accessContent: formData.get("accessContent") ?? "",
    whopCheckoutUrl: formData.get("whopCheckoutUrl") ?? "",
  });
}

export async function createProduct(formData: FormData) {
  const userId = await requireUserId();
  const data = parseProductForm(formData);
  await db.insert(products).values({
    id: newId(),
    userId,
    name: data.name,
    description: data.description,
    deliveryWebhookUrl: data.deliveryWebhookUrl || null,
    deliveryEmailEnabled: data.deliveryEmailEnabled,
    deliveryEmailSubject: data.deliveryEmailSubject || null,
    deliveryEmailBody: data.deliveryEmailBody || null,
    accessContent: data.accessContent,
    whopCheckoutUrl: data.whopCheckoutUrl || null,
  });
  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const userId = await requireUserId();
  const data = parseProductForm(formData);
  await db
    .update(products)
    .set({
      name: data.name,
      description: data.description,
      deliveryWebhookUrl: data.deliveryWebhookUrl || null,
      deliveryEmailEnabled: data.deliveryEmailEnabled,
      deliveryEmailSubject: data.deliveryEmailSubject || null,
      deliveryEmailBody: data.deliveryEmailBody || null,
      accessContent: data.accessContent,
      whopCheckoutUrl: data.whopCheckoutUrl || null,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.userId, userId)));
  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function deleteProduct(id: string) {
  const userId = await requireUserId();
  await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.userId, userId)));
  revalidatePath("/dashboard/products");
}

/* ----------------------------- Invoices ----------------------------- */

const dollarsToCents = (v: FormDataEntryValue | null): number =>
  Math.round(parseFloat(String(v ?? "0")) * 100);

const invoiceSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  title: z.string().min(1, "Title is required"),
  basePriceCents: z.number().int().min(50, "Minimum price is $0.50"),
  incrementCents: z.number().int().min(0),
  batchSize: z.number().int().min(0),
  priceCapCents: z.number().int().min(0),
});

export async function createInvoice(formData: FormData) {
  const userId = await requireUserId();
  const data = invoiceSchema.parse({
    productId: String(formData.get("productId") ?? ""),
    title: String(formData.get("title") ?? ""),
    basePriceCents: dollarsToCents(formData.get("basePrice")),
    incrementCents: dollarsToCents(formData.get("increment")),
    batchSize: parseInt(String(formData.get("batchSize") ?? "0"), 10) || 0,
    priceCapCents: dollarsToCents(formData.get("priceCap")),
  });

  // Ownership check on the product.
  const [prod] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, data.productId), eq(products.userId, userId)))
    .limit(1);
  if (!prod) throw new Error("Product not found");

  const id = newId();
  await db.insert(invoices).values({
    id,
    userId,
    productId: data.productId,
    slug: newSlug(),
    title: data.title,
    basePriceCents: data.basePriceCents,
    incrementCents: data.incrementCents,
    batchSize: data.batchSize,
    priceCapCents: data.priceCapCents,
    status: "active",
  });
  revalidatePath("/dashboard/invoices");
  redirect(`/dashboard/invoices/${id}`);
}

export async function setInvoiceStatus(
  id: string,
  status: "active" | "closed",
) {
  const userId = await requireUserId();
  await db
    .update(invoices)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/dashboard/invoices");
}

/* --------------------------- Stripe settings ------------------------ */

export async function connectStripe(formData: FormData) {
  const userId = await requireUserId();
  const secretKey = String(formData.get("secretKey") ?? "").trim();
  const manualWebhookSecret = String(
    formData.get("webhookSecret") ?? "",
  ).trim();

  if (!secretKey.startsWith("sk_")) {
    return { error: "That doesn't look like a Stripe secret key (sk_...)." };
  }

  const provider = getProvider("stripe");
  const check = await provider.validateCredentials(secretKey);
  if (!check.ok) {
    return { error: check.error ?? "Stripe rejected that key." };
  }

  const existing = await getPaymentAccount(userId);
  const accountId = existing?.id ?? newId();

  // Deregister any prior endpoint before re-registering (key rotation).
  // Best-effort, using the new key (same Stripe account).
  if (existing?.webhookEndpointId) {
    await provider.deregisterWebhook(secretKey, existing.webhookEndpointId);
  }

  let webhookEndpointId: string | null = null;
  let encryptedWebhookSecret: string | null = null;

  if (isLocalAppUrl()) {
    // Stripe can't reach localhost — require a manually pasted `whsec_`.
    if (!manualWebhookSecret.startsWith("whsec_")) {
      return {
        error:
          "APP_URL is local, so auto-registration is off. Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe/" +
          accountId +
          "` and paste the whsec_… it prints.",
      };
    }
    encryptedWebhookSecret = encrypt(manualWebhookSecret);
  } else {
    const url = `${env.appUrl}/api/webhooks/stripe/${accountId}`;
    const reg = await provider.registerWebhook(secretKey, url);
    webhookEndpointId = reg.endpointId;
    encryptedWebhookSecret = encrypt(reg.signingSecret);
  }

  const values = {
    id: accountId,
    userId,
    provider: "stripe" as const,
    encryptedSecretKey: encrypt(secretKey),
    keyLast4: secretKey.slice(-4),
    livemode: check.livemode,
    webhookEndpointId,
    encryptedWebhookSecret,
    status: "active" as const,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(paymentAccounts)
      .set(values)
      .where(eq(paymentAccounts.id, accountId));
  } else {
    await db.insert(paymentAccounts).values(values);
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, livemode: check.livemode, label: check.label };
}

export async function disconnectStripe() {
  const userId = await requireUserId();
  const acct = await getPaymentAccount(userId);
  if (!acct) return;
  revalidatePath("/dashboard/settings");
  await db
    .delete(paymentAccounts)
    .where(eq(paymentAccounts.id, acct.id));
}

/* ------------------------------ API keys ---------------------------- */

const apiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

/** Creates an API key. The raw key is returned once and never stored. */
export async function createApiKey(formData: FormData) {
  const userId = await requireUserId();
  const parsed = apiKeySchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }

  const key = `vi_${newToken()}`;
  await db.insert(apiKeys).values({
    id: newId(),
    userId,
    name: parsed.data.name,
    prefix: key.slice(0, 12),
    keyHash: sha256Hex(key),
  });

  revalidatePath("/dashboard/settings");
  return { ok: true, key };
}

export async function revokeApiKey(id: string) {
  const userId = await requireUserId();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)),
    );
  revalidatePath("/dashboard/settings");
}

/* --------------------------- Delivery retry ------------------------- */

export async function retryDelivery(jobId: string, invoiceId: string) {
  const userId = await requireUserId();
  // Ownership: job -> payment -> invoice -> user.
  const [row] = await db
    .select({ ownerId: invoices.userId })
    .from(deliveryJobs)
    .innerJoin(payments, eq(payments.id, deliveryJobs.paymentId))
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(eq(deliveryJobs.id, jobId))
    .limit(1);
  if (!row || row.ownerId !== userId) throw new Error("Not found");

  await retryDeliveryJobNow(jobId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
}

/** Guard used by invoice detail page to confirm ownership before rendering. */
export async function assertInvoiceOwner(id: string) {
  const userId = await requireUserId();
  const inv = await getInvoice(userId, id);
  if (!inv) redirect("/dashboard/invoices");
  return inv;
}
