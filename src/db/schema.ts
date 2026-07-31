import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* better-auth tables (email/password). Generated to match its schema. */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Domain tables. tenant = user; everything is scoped by userId.       */
/* ------------------------------------------------------------------ */

export const paymentAccounts = pgTable(
  "payment_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'stripe'
    encryptedSecretKey: text("encrypted_secret_key").notNull(), // iv.tag.ct base64
    keyLast4: text("key_last4").notNull(),
    livemode: boolean("livemode").notNull().default(false),
    webhookEndpointId: text("webhook_endpoint_id"),
    encryptedWebhookSecret: text("encrypted_webhook_secret"),
    status: text("status").notNull().default("active"), // 'active' | 'invalid'
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_accounts_user_provider_idx").on(t.userId, t.provider)],
);

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  deliveryWebhookUrl: text("delivery_webhook_url"),
  deliveryEmailEnabled: boolean("delivery_email_enabled").notNull().default(true),
  deliveryEmailSubject: text("delivery_email_subject"),
  deliveryEmailBody: text("delivery_email_body"),
  accessContent: text("access_content").notNull().default(""),
  // Whop (or any) product checkout link. On payment the buyer is sent here with
  // their email pre-filled to activate a membership (one-click access grant).
  whopCheckoutUrl: text("whop_checkout_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    currency: text("currency").notNull().default("usd"),
    basePriceCents: integer("base_price_cents").notNull(),
    incrementCents: integer("increment_cents").notNull(),
    batchSize: integer("batch_size").notNull().default(0), // 0 = bump every payment
    priceCapCents: integer("price_cap_cents").notNull().default(0), // 0 = uncapped
    status: text("status").notNull().default("draft"), // draft | active | sold_out | closed
    paidCount: integer("paid_count").notNull().default(0), // source of truth for pricing
    // Seller-configured purchase notification (set via the v1 API). On payment
    // completion an 'external_purchase' delivery job POSTs to this URL.
    externalWebhookUrl: text("external_webhook_url"),
    externalWebhookSecret: text("external_webhook_secret"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("invoices_user_idx").on(t.userId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // user-chosen label
    prefix: text("prefix").notNull(), // first 12 chars of the key, for display
    keyHash: text("key_hash").notNull().unique(), // sha256 hex of the full key
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSessionId: text("provider_session_id").notNull().unique(), // idempotency
    providerPaymentRef: text("provider_payment_ref"),
    buyerEmail: text("buyer_email"),
    buyerName: text("buyer_name"),
    amountCents: integer("amount_cents").notNull(), // honored session price
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull().default("pending"), // pending | completed | expired
    accessToken: text("access_token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

export const deliveryJobs = pgTable(
  "delivery_jobs",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'webhook' | 'email' | 'external_purchase'
    status: text("status").notNull().default("pending"), // pending | succeeded | failed | dead
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    payloadJson: jsonb("payload_json")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("delivery_jobs_due_idx").on(t.status, t.nextAttemptAt)],
);

export type Invoice = typeof invoices.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentAccount = typeof paymentAccounts.$inferSelect;
export type DeliveryJob = typeof deliveryJobs.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
