"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "");

    const res =
      mode === "signup"
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password });

    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
      <h1 className="text-xl font-bold">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>

      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input" required />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          minLength={8}
          required
        />
        {mode === "signup" && (
          <p className="hint">At least 8 characters.</p>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : "Log in"}
      </button>

      <p className="text-sm text-[var(--muted)] text-center">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--primary)] font-medium">
              Log in
            </Link>
          </>
        ) : (
          <>
            No account?{" "}
            <Link href="/signup" className="text-[var(--primary)] font-medium">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
