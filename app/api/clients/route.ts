import { handle, HttpError } from "@/lib/server/http";
import { db, ok, requireUser } from "@/lib/server/supabase";
import type { Client } from "@/lib/types";

export const dynamic = "force-dynamic";

const clients = async (): Promise<Client[]> => ok(await db().from("clients").select("id, name, created_at").order("name")) ?? [];
const nameOf = (v: unknown) => {
  const name = typeof v === "string" ? v.trim().slice(0, 120) : "";
  if (!name) throw new HttpError(400, "Enter a client name.");
  return name;
};

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req);
    return { clients: await clients() };
  });
}

/** Creates a client, or returns the existing one with that name (names are unique, ignoring case). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(req);
    const name = nameOf((await req.json()).name);
    const all = await clients();
    const client: Client =
      all.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
      ok(await db().from("clients").insert({ name }).select("id, name, created_at").single())!;
    return { client, clients: await clients() };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    await requireUser(req);
    const body = await req.json();
    if (typeof body.id !== "string") throw new HttpError(400, "Missing id");
    const name = nameOf(body.name);
    if ((await clients()).some((c) => c.id !== body.id && c.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(400, `There is already a client called "${name}".`);
    }
    ok(await db().from("clients").update({ name }).eq("id", body.id));
    return { clients: await clients() };
  });
}

/** Deleting a client keeps its reports; they become unassigned. */
export async function DELETE(req: Request) {
  return handle(async () => {
    await requireUser(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Missing id");
    ok(await db().from("reports").update({ client_id: null }).eq("client_id", id));
    ok(await db().from("clients").delete().eq("id", id));
    return { clients: await clients() };
  });
}
