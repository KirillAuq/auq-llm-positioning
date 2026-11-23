import { MAX_URLS } from "@/lib/defaults";
import { handle, HttpError } from "@/lib/server/http";
import { scrape, scrapeLlmsTxt } from "@/lib/server/scrape";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { urls, llmsTxt } = await req.json();
    if (!Array.isArray(urls) || !urls.length || urls.length > MAX_URLS) {
      throw new HttpError(400, `Provide between 1 and ${MAX_URLS} URLs`);
    }
    const wantsLlms = typeof llmsTxt === "string" && llmsTxt.trim().length > 0 && llmsTxt.length <= 500;
    const [pages, llms] = await Promise.all([
      Promise.all(urls.map((u) => scrape(String(u)))),
      wantsLlms ? scrapeLlmsTxt(llmsTxt) : undefined,
    ]);
    return { pages, llmsTxt: llms };
  });
}
