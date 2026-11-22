import { handle, HttpError } from "@/lib/server/http";
import { db, ok, requireUser } from "@/lib/server/supabase";
import type { Report } from "@/lib/types";

export const dynamic = "force-dynamic";

const LIST = "id, created_at, brand_name, domain, client_id, created_by_email, summary";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idParam = (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !UUID.test(id)) throw new HttpError(400, "Missing or invalid report id");
  return id;
};

function claimsPct(report: Report): number | null {
  let answered = 0;
  let confirmed = 0;
  for (const c of report.claims ?? []) {
    for (const r of Object.values(c.results ?? {})) {
      if (!r?.verdict) continue;
      answered++;
      if (r.verdict === "true") confirmed++;
    }
  }
  return answered ? Math.round((confirmed / answered) * 100) : null;
}

/** Team reports are shared: every team member sees all of them. With ?id= returns one report in full. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req);
    if (new URL(req.url).searchParams.has("id")) {
      const row = ok(await db().from("reports").select("data").eq("id", idParam(req)).maybeSingle());
      if (!row) throw new HttpError(404, "That report no longer exists.");
      return { report: row.data as Report };
    }
    return { reports: ok(await db().from("reports").select(LIST).order("created_at", { ascending: false }).limit(1000)) ?? [] };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await req.json();
    const report = body.report as Report;
    if (!report || !UUID.test(report.id ?? "") || !Array.isArray(report.questions)) throw new HttpError(400, "That doesn't look like a report.");
    const clientId = typeof body.clientId === "string" && UUID.test(body.clientId) ? body.clientId : null;
    ok(await db().from("reports").upsert({
      id: report.id,
      client_id: clientId,
      created_by: user.id,
      created_by_email: user.email,
      brand_name: String(report.brandName ?? "").slice(0, 200),
      domain: String(report.domain ?? "").slice(0, 200),
      summary: { gaps: report.gapReport?.gaps?.length ?? 0, claimsPct: claimsPct(report) },
      data: report,
      created_at: report.createdAt,
    }));
    return { saved: true };
  });
}

/** Moves a report to another client, or to no client. */
export async function PATCH(req: Request) {
  return handle(async () => {
    await requireUser(req);
    const body = await req.json();
    const clientId = typeof body.clientId === "string" && UUID.test(body.clientId) ? body.clientId : null;
    ok(await db().from("reports").update({ client_id: clientId }).eq("id", idParam(req)));
    return { updated: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await requireUser(req);
    ok(await db().from("reports").delete().eq("id", idParam(req)));
    return { deleted: true };
  });
}
