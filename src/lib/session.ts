import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Returns the current session or null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Returns the authenticated user id, or redirects to /login. */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user.id;
}
