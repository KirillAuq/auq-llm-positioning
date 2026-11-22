import { MAX_CLAIM_CHARS, MAX_CLAIMS, MAX_URLS } from "@/lib/defaults";
import { handle, HttpError } from "@/lib/server/http";
import { db, getUser, ok, requireUser, supabaseConfigured } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const texts = (v: unknown, count: number, max: number) =>
  (Array.isArray(v) ? v : []).map((x) => text(x, max)).filter(Boolean).slice(0, count);

function domainOf(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Records what a visitor asked to have audited. Signed-in team members are not leads. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!supabaseConfigured() || (await getUser(req))) return { saved: false };
    const body = await req.json();
    const urls = texts(body.urls, MAX_URLS, 500);
    if (!urls.length) throw new HttpError(400, "A brand URL is required");
    const email = text(body.email, 254).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "That email address doesn't look right. Fix it or leave it blank.");
    ok(await db().from("leads").insert({
      email: email || null,
      domain: domainOf(urls[0]),
      urls,
      brand_hint: text(body.brandHint, 200),
      positioning_doc: text(body.positioningDoc, 200_000),
      claims: texts(body.claims, MAX_CLAIMS, MAX_CLAIM_CHARS),
      user_agent: text(req.headers.get("user-agent"), 400) || null,
    }));
    return { saved: true };
  });
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    const leads = ok(await db().from("leads")
      .select("id, created_at, email, domain, urls, brand_hint, positioning_doc, claims")
      .order("created_at", { ascending: false }).limit(1000)) ?? [];
    return { leads };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Missing id");
    ok(await db().from("leads").delete().eq("id", id));
    return { deleted: true };
  });
}
