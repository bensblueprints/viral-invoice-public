import { requireUserId } from "@/lib/session";
import { getPaymentAccount, listApiKeys } from "@/lib/data";
import { isLocalAppUrl } from "@/lib/env";
import { StripeForm } from "./StripeForm";
import { ApiKeysForm } from "./ApiKeysForm";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [account, keys] = await Promise.all([
    getPaymentAccount(userId),
    listApiKeys(userId),
  ]);

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
      <ApiKeysForm
        keys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
