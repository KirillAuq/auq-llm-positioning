import { ENV_VAR } from "@/lib/defaults";

export const dynamic = "force-dynamic";

/** Tells the UI which keys the server already has, without revealing them. */
export async function GET() {
  const serverKeys = Object.fromEntries(
    Object.entries(ENV_VAR).map(([name, env]) => [name, !!process.env[env]?.trim()]),
  );
  return Response.json({ serverKeys, passwordRequired: !!process.env.APP_PASSWORD });
}
