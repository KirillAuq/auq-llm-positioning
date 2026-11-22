import { handle, HttpError } from "@/lib/server/http";
import { db, ok, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;
const members = async () => ok(await db().from("profiles").select("id, email, role, created_at").order("created_at")) ?? [];

function password(v: unknown) {
  if (typeof v !== "string" || v.length < MIN_PASSWORD) throw new HttpError(400, `The password must be at least ${MIN_PASSWORD} characters.`);
  return v;
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    return { members: await members() };
  });
}

/** Adds a team member. There is no public sign-up; this is the only way an account is created from the app. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    const role = body.role === "admin" ? "admin" : "team";
    const { data, error } = await db().auth.admin.createUser({ email, password: password(body.password), email_confirm: true });
    if (error || !data.user) throw new HttpError(400, error?.message ?? "Could not create the account.");
    ok(await db().from("profiles").upsert({ id: data.user.id, email, role }));
    return { members: await members() };
  });
}

/** Sets a new password for a member, since there is no emailed reset. */
export async function PATCH(req: Request) {
  return handle(async () => {
    await requireUser(req, "admin");
    const body = await req.json();
    if (typeof body.id !== "string") throw new HttpError(400, "Missing id");
    const { error } = await db().auth.admin.updateUserById(body.id, { password: password(body.password) });
    if (error) throw new HttpError(400, error.message);
    return { updated: true };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const me = await requireUser(req, "admin");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Missing id");
    if (id === me.id) throw new HttpError(400, "You can't remove your own account.");
    const { error } = await db().auth.admin.deleteUser(id);
    if (error) throw new HttpError(400, error.message);
    // The profile goes with the account (cascade); this covers a profile whose account was already gone.
    ok(await db().from("profiles").delete().eq("id", id));
    return { members: await members() };
  });
}
