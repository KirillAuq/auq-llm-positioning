"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: Promise<SupabaseClient | null> | undefined;

/** The browser's Supabase client, used only for signing in. Null when the deployment has no accounts. */
export function supabase(): Promise<SupabaseClient | null> {
  client ??= fetch("/api/config")
    .then((r) => r.json())
    .then((c) => (c.supabase ? createClient(c.supabase.url, c.supabase.publishableKey) : null))
    .catch(() => null);
  return client;
}

/** The signed-in user's token for API calls, or null for a visitor. */
export async function accessToken(): Promise<string | null> {
  const c = await supabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.access_token ?? null;
}
