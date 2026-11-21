import { handle, HttpError, requirePassword, resolveKey } from "@/lib/server/auth";
import { ask } from "@/lib/server/providers";
import { PROVIDERS } from "@/lib/types";
import type { Answer } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(async (): Promise<Answer> => {
    const { provider, question, model, webSearch, auth } = await req.json();
    requirePassword(auth);
    if (!PROVIDERS.includes(provider)) throw new HttpError(400, "Unknown provider");
    if (typeof question !== "string" || !question.trim() || question.length > 2000) {
      throw new HttpError(400, "Question must be 1-2000 characters");
    }
    if (typeof model !== "string" || !model.trim()) throw new HttpError(400, "Missing model");
    return ask(provider, { key: resolveKey(provider, auth), model: model.trim(), question, webSearch: !!webSearch });
  });
}
