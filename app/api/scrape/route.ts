import { MAX_URLS } from "@/lib/defaults";
import { handle, HttpError } from "@/lib/server/http";
import { scrape } from "@/lib/server/scrape";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { urls } = await req.json();
    if (!Array.isArray(urls) || !urls.length || urls.length > MAX_URLS) {
      throw new HttpError(400, `Provide between 1 and ${MAX_URLS} URLs`);
    }
    return { pages: await Promise.all(urls.map((u) => scrape(String(u)))) };
  });
}
