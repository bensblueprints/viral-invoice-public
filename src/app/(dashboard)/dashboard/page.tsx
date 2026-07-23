import Link from "next/link";
import { requireUserId } from "@/lib/session";
import {
  getDashboardStats,
  getPaymentAccount,
  listInvoices,
} from "@/lib/data";
import { formatMoney } from "@/lib/pricing";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const [stats, account, invoiceRows] = await Promise.all([
    getDashboardStats(userId),
    getPaymentAccount(userId),
    listInvoices(userId),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <Link href="/dashboard/invoices/new" className="btn-primary">
          New invoice
        </Link>
      </div>

      {!account && (
        <div className="card border-amber-400/40 bg-amber-400/10">
          <p className="font-medium">Connect Stripe to start collecting.</p>
          <p className="hint">
            Add your Stripe secret key in{" "}
            <Link href="/dashboard/settings" className="underline">
              Settings
            </Link>{" "}
            before publishing an invoice.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Revenue" value={formatMoney(stats.revenueCents)} />
        <Stat label="Payments" value={String(stats.paymentCount)} />
        <Stat label="Active invoices" value={String(stats.activeInvoices)} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent invoices</h2>
        {invoiceRows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No invoices yet.{" "}
            <Link
              href="/dashboard/invoices/new"
              className="text-[var(--primary)]"
            >
              Create your first one.
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {invoiceRows.slice(0, 6).map(({ invoice, productName }) => (
              <Link
                key={invoice.id}
                href={`/dashboard/invoices/${invoice.id}`}
                className="card flex items-center justify-between hover:border-[var(--primary)]"
              >
                <div>
                  <div className="font-medium">{invoice.title}</div>
                  <div className="hint">{productName}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold capitalize">
                    {invoice.status.replace("_", " ")}
                  </div>
                  <div className="hint">{invoice.paidCount} paid</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
