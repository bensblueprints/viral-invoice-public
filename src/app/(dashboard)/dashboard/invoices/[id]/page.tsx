import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import {
  getInvoice,
  listInvoicePayments,
  listDeliveryJobsForPayments,
} from "@/lib/data";
import { env } from "@/lib/env";
import { computeInvoiceState, formatMoney } from "@/lib/pricing";
import { setInvoiceStatus, retryDelivery } from "../../../actions";
import { CopyLink } from "./CopyLink";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const invoice = await getInvoice(userId, id);
  if (!invoice) notFound();

  const paymentsList = await listInvoicePayments(invoice.id);
  const completed = paymentsList.filter((p) => p.status === "completed");
  const jobs = await listDeliveryJobsForPayments(completed.map((p) => p.id));
  const jobsByPayment = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const arr = jobsByPayment.get(j.paymentId) ?? [];
    arr.push(j);
    jobsByPayment.set(j.paymentId, arr);
  }

  const state = computeInvoiceState(invoice, invoice.paidCount);
  const publicUrl = `${env.appUrl}/i/${invoice.slug}`;
  const revenue = completed.reduce((sum, p) => sum + p.amountCents, 0);

  const close = setInvoiceStatus.bind(null, invoice.id, "closed");
  const reopen = setInvoiceStatus.bind(null, invoice.id, "active");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/invoices"
            className="hint hover:underline"
          >
            ← Invoices
          </Link>
          <h1 className="text-2xl font-bold">{invoice.title}</h1>
          <p className="text-sm capitalize text-[var(--muted)]">
            {invoice.status.replace("_", " ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/i/${invoice.slug}`} className="btn-ghost text-sm">
            View public page
          </Link>
          {invoice.status === "closed" ? (
            <form action={reopen}>
              <button className="btn-ghost text-sm">Reopen</button>
            </form>
          ) : (
            <form action={close}>
              <button className="btn-ghost text-sm text-red-500">Close</button>
            </form>
          )}
        </div>
      </div>

      <div className="card space-y-2">
        <div className="label">Share this link</div>
        <CopyLink url={publicUrl} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Current price" value={formatMoney(state.priceCents, invoice.currency)} />
        <Stat label="Revenue" value={formatMoney(revenue, invoice.currency)} />
        <Stat label="Payments" value={String(completed.length)} />
        <Stat
          label="Base → cap"
          value={`${formatMoney(invoice.basePriceCents)}${
            invoice.priceCapCents > 0
              ? ` → ${formatMoney(invoice.priceCapCents)}`
              : ""
          }`}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">
          Mechanic:{" "}
          <span className="font-normal text-[var(--muted)]">
            {invoice.batchSize === 0
              ? `+${formatMoney(invoice.incrementCents)} every payment`
              : `${invoice.batchSize} buyers per price, then +${formatMoney(invoice.incrementCents)}`}
          </span>
        </h2>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Payments</h2>
        {paymentsList.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="py-2 pr-4 font-medium">Buyer</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {paymentsList.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="py-2 pr-4">
                      {p.buyerEmail || (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {formatMoney(p.amountCents, p.currency)}
                    </td>
                    <td className="py-2 pr-4 capitalize">{p.status}</td>
                    <td className="py-2 pr-4">
                      <DeliveryCell
                        jobs={jobsByPayment.get(p.id) ?? []}
                        invoiceId={invoice.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function DeliveryCell({
  jobs,
  invoiceId,
}: {
  jobs: Array<{ id: string; type: string; status: string; lastError: string | null }>;
  invoiceId: string;
}) {
  if (jobs.length === 0)
    return <span className="text-[var(--muted)]">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {jobs.map((j) => {
        const retry = retryDelivery.bind(null, j.id, invoiceId);
        const color =
          j.status === "succeeded"
            ? "text-green-600 dark:text-green-400"
            : j.status === "dead"
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400";
        return (
          <span key={j.id} className="inline-flex items-center gap-1">
            <span className={`text-xs ${color}`} title={j.lastError ?? ""}>
              {j.type}:{j.status}
            </span>
            {j.status !== "succeeded" && (
              <form action={retry}>
                <button className="text-xs underline text-[var(--primary)]">
                  retry
                </button>
              </form>
            )}
          </span>
        );
      })}
    </div>
  );
}
