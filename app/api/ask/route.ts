import { handle, HttpError } from "@/lib/server/http";
import { ask } from "@/lib/server/providers";
import { loadApp, resolveKey } from "@/lib/server/settings";
import { PROVIDERS } from "@/lib/types";
import type { Answer, Provider } from "@/lib/types";

export const maxDuration = 300;

// The model, key and web-search setting always come from the server, so a visitor
// cannot pick a different model or see a key.
export async function POST(req: Request) {
  return handle(async (): Promise<Answer> => {
    const body = await req.json();
    const provider = body.provider as Provider;
    const question = body.question;
    if (!PROVIDERS.includes(provider)) throw new HttpError(400, "Unknown provider");
    if (typeof question !== "string" || !question.trim() || question.length > 2000) {
      throw new HttpError(400, "Question must be 1-2000 characters");
    }
    const { settings } = await loadApp();
    return ask(provider, { key: await resolveKey(provider), model: settings.models[provider], question, webSearch: settings.webSearch });
  });
}
