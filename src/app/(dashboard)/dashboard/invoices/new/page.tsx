import { requireUserId } from "@/lib/session";
import { listProducts, getPaymentAccount } from "@/lib/data";
import { NewInvoiceForm } from "../NewInvoiceForm";
import Link from "next/link";

export default async function NewInvoicePage() {
  const userId = await requireUserId();
  const [products, account] = await Promise.all([
    listProducts(userId),
    getPaymentAccount(userId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New invoice</h1>
      {!account && (
        <div className="card border-amber-400/40 bg-amber-400/10 text-sm">
          Connect Stripe in{" "}
          <Link href="/dashboard/settings" className="underline">
            Settings
          </Link>{" "}
          before buyers can pay this invoice.
        </div>
      )}
      <NewInvoiceForm
        products={products.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
