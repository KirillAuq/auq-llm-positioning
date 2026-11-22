import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "../types";
import { HttpError } from "./http";

// Both the current key names and the older anon / service_role names are accepted.
const url = () => process.env.SUPABASE_URL?.trim();
const publishableKey = () => (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim();
const secretKey = () => (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();

/** Without Supabase the app still runs audits, with no accounts, saved settings or leads. */
export const supabaseConfigured = () => !!(url() && publishableKey() && secretKey());

/** What the browser needs to sign in. The publishable key is safe to expose; the secret key never leaves the server. */
export const publicSupabase = () => (supabaseConfigured() ? { url: url()!, publishableKey: publishableKey()! } : null);

let client: SupabaseClient | undefined;

/** Server-only client using the secret key, which bypasses row level security. */
export function db(): SupabaseClient {
  if (!supabaseConfigured()) throw new HttpError(503, "Accounts are not set up on this deployment (Supabase is not configured).");
  client ??= createClient(url()!, secretKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Throws a readable error when a query fails, and returns its data otherwise. */
export function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new HttpError(502, `Database error: ${res.error.message}`);
  return res.data;
}

const adminEmails = () =>
  (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** The signed-in team member or admin making this request, or null for a visitor. */
export async function getUser(req: Request): Promise<User | null> {
  if (!supabaseConfigured()) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user?.email) return null;
  const { id } = data.user;
  const email = data.user.email.toLowerCase();
  const profile = ok(await db().from("profiles").select("role").eq("id", id).maybeSingle());
  // ADMIN_EMAIL is how the first admin gets in: that account is an admin as soon as it signs in.
  if (adminEmails().includes(email)) {
    if (profile?.role !== "admin") ok(await db().from("profiles").upsert({ id, email, role: "admin" }));
    return { id, email, role: "admin" };
  }
  // An account nobody added to the team has no access, even with a valid login.
  if (!profile) return null;
  return { id, email, role: profile.role };
}

export async function requireUser(req: Request, role?: "admin"): Promise<User> {
  const user = await getUser(req);
  if (!user) throw new HttpError(401, "Sign in to do this.");
  if (role === "admin" && user.role !== "admin") throw new HttpError(403, "Only an admin can do this.");
  return user;
}
