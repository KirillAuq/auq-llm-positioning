import { handle, HttpError } from "@/lib/server/http";
import { listModels } from "@/lib/server/providers";
import { KEY_NAMES, resolveKey } from "@/lib/server/settings";
import { requireUser } from "@/lib/server/supabase";

export const maxDuration = 60;

/** Admin only: checks a key (the one just typed, or the one in use) and lists the models it can reach. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    const { name, key } = await req.json();
    if (!KEY_NAMES.includes(name)) throw new HttpError(400, "Unknown provider");
    const typed = typeof key === "string" ? key.trim() : "";
    return { models: await listModels(name, typed || (await resolveKey(name))) };
  });
}
