import { handle } from "@/lib/server/http";
import { keySources, loadApp, saveApp } from "@/lib/server/settings";
import { requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const current = async () => ({ settings: (await loadApp()).settings, keys: await keySources() });

/** Admin only. Key values are never sent back, only where each one comes from. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    return current();
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    const body = await req.json();
    await saveApp(body.settings, body.keys ?? {});
    return current();
  });
}
