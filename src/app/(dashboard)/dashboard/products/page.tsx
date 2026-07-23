import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { listProducts } from "@/lib/data";

export default async function ProductsPage() {
  const userId = await requireUserId();
  const rows = await listProducts(userId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link href="/dashboard/products/new" className="btn-primary">
          New product
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card text-sm text-[var(--muted)]">
          No products yet. A product defines what buyers receive and how it&apos;s
          delivered. Create one, then attach an invoice to it.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/products/${p.id}`}
              className="card flex items-center justify-between hover:border-[var(--primary)]"
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="hint line-clamp-1">
                  {p.description || "No description"}
                </div>
              </div>
              <div className="flex gap-1.5 text-xs">
                {p.deliveryWebhookUrl && (
                  <span className="rounded bg-black/5 px-2 py-0.5 dark:bg-white/10">
                    webhook
                  </span>
                )}
                {p.deliveryEmailEnabled && (
                  <span className="rounded bg-black/5 px-2 py-0.5 dark:bg-white/10">
                    email
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
