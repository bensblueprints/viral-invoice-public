import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { verifyApiKey } from "@/lib/api-auth";

const webhookSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("https://"), "URL must be https"),
  secret: z.string().min(16, "Secret must be at least 16 characters"),
});

export async function PUT(
  req: Request,
  ctx: RouteContext<"/api/v1/invoices/[id]/webhook">,
) {
  const auth = await verifyApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid body" },
      { status: 400 },
    );
  }

  const updated = await db
    .update(invoices)
    .set({
      externalWebhookUrl: parsed.data.url,
      externalWebhookSecret: parsed.data.secret,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, id), eq(invoices.userId, auth.userId)))
    .returning({ id: invoices.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  ctx: RouteContext<"/api/v1/invoices/[id]/webhook">,
) {
  const auth = await verifyApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const updated = await db
    .update(invoices)
    .set({
      externalWebhookUrl: null,
      externalWebhookSecret: null,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, id), eq(invoices.userId, auth.userId)))
    .returning({ id: invoices.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
