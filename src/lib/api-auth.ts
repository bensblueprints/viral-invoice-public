import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { sha256Hex } from "./crypto";

/**
 * Verifies an `Authorization: Bearer vi_…` API key. Returns the owning userId,
 * or null when the header is missing/malformed or the key is unknown/revoked.
 */
export async function verifyApiKey(
  req: Request,
): Promise<{ userId: string } | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, sha256Hex(token)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!key) return null;

  // Bookkeeping only — never block (or fail) the request on it.
  void Promise.resolve(
    db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id)),
  ).catch(() => {});

  return { userId: key.userId };
}
