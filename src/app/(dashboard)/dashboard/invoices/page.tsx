import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { listInvoices } from "@/lib/data";
import { computeInvoiceState, formatMoney } from "@/lib/pricing";

const statusColor: Record<string, string> = {
  active: "bg-green-500/15 text-green-600 dark:text-green-400",
  sold_out: "bg-red-500/15 text-red-600 dark:text-red-400",
  closed: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export default async function InvoicesPage() {
  const userId = await requireUserId();
  const rows = await listInvoices(userId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <Link href="/dashboard/invoices/new" className="btn-primary">
          New invoice
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card text-sm text-[var(--muted)]">
          No invoices yet. Create one to get a shareable link whose price climbs
          with every buyer.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ invoice, productName }) => {
            const state = computeInvoiceState(invoice, invoice.paidCount);
            return (
              <Link
                key={invoice.id}
                href={`/dashboard/invoices/${invoice.id}`}
                className="card flex items-center justify-between hover:border-[var(--primary)]"
              >
                <div>
                  <div className="font-medium">{invoice.title}</div>
                  <div className="hint">{productName}</div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="font-mono text-sm">
                      {formatMoney(state.priceCents, invoice.currency)}
                    </div>
                    <div className="hint">{invoice.paidCount} paid</div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                      statusColor[invoice.status] ?? ""
                    }`}
                  >
                    {invoice.status.replace("_", " ")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
