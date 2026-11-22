import { handle } from "@/lib/server/http";
import { keySources, loadApp } from "@/lib/server/settings";
import { publicSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** What any browser needs to run an audit: the shared settings, which keys exist (never their values), and how to sign in. */
export async function GET() {
  return handle(async () => {
    const [{ settings }, sources] = await Promise.all([loadApp(), keySources()]);
    const serverKeys = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v !== "missing"]));
    return { settings, serverKeys, supabase: publicSupabase() };
  });
}
