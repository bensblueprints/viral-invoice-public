import { requireUserId } from "@/lib/session";
import { getPaymentAccount } from "@/lib/data";
import { isLocalAppUrl } from "@/lib/env";
import { StripeForm } from "./StripeForm";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const account = await getPaymentAccount(userId);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <StripeForm
        connected={!!account}
        keyLast4={account?.keyLast4}
        livemode={account?.livemode}
        webhookRegistered={!!account?.webhookEndpointId}
        isLocal={isLocalAppUrl()}
        accountId={account?.id}
      />
    </div>
  );
}
