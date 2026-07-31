"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createApiKey, revokeApiKey } from "../../actions";

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface Props {
  keys: ApiKeyItem[];
}

function fmt(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApiKeysForm({ keys }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNewKey(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await createApiKey(formData);
      if (res?.error) {
        setError(res.error);
      } else if (res?.ok) {
        form.reset();
        setNewKey(res.key ?? null);
        router.refresh();
      }
    });
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">API Keys</h2>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Keys authenticate the <code className="rounded bg-black/10 px-1 dark:bg-white/10">/api/v1</code>{" "}
        endpoints as <code className="rounded bg-black/10 px-1 dark:bg-white/10">Authorization: Bearer …</code>.
      </p>

      {keys.length > 0 && (
        <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {k.name}{" "}
                  <span className="font-mono text-[var(--muted)]">{k.prefix}…</span>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  created {fmt(k.createdAt)} · last used {fmt(k.lastUsedAt)}
                  {k.revokedAt && (
                    <span className="ml-1 rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-500">
                      revoked
                    </span>
                  )}
                </p>
              </div>
              {!k.revokedAt && (
                <button
                  type="button"
                  className="btn-ghost shrink-0 text-red-500"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await revokeApiKey(k.id);
                      router.refresh();
                    })
                  }
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="apiKeyName">
            New key name
          </label>
          <input
            id="apiKeyName"
            name="name"
            className="input"
            placeholder="e.g. Zapier, my server"
            autoComplete="off"
            required
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create API key"}
        </button>
      </form>

      {newKey && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            This key is shown once — copy it now.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-black/10 px-2 py-1 font-mono text-sm dark:bg-white/10">
              {newKey}
            </code>
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={copyKey}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
