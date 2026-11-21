import { handle, HttpError, requirePassword, resolveKey } from "@/lib/server/auth";
import { listModels } from "@/lib/server/providers";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { name, auth } = await req.json();
    requirePassword(auth);
    if (!["chatgpt", "claude", "gemini", "deepinfra"].includes(name)) throw new HttpError(400, "Unknown provider");
    return { models: await listModels(name, resolveKey(name, auth)) };
  });
}
