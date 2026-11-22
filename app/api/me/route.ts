import { handle } from "@/lib/server/http";
import { getUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => ({ user: await getUser(req) }));
}
