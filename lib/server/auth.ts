import { timingSafeEqual } from "node:crypto";
import { ENV_VAR } from "../defaults";
import type { KeyName } from "../types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Auth {
  keys?: Partial<Record<KeyName, string>>;
  appPassword?: string;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function requirePassword(auth: Auth | undefined) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return;
  if (!safeEqual(auth?.appPassword ?? "", expected)) {
    throw new HttpError(401, "Wrong or missing app password. Enter it on the Settings page.");
  }
}

export function resolveKey(name: KeyName, auth: Auth | undefined): string {
  const key = auth?.keys?.[name]?.trim() || process.env[ENV_VAR[name]]?.trim();
  if (!key) {
    throw new HttpError(
      400,
      `No API key for ${name}. Set ${ENV_VAR[name]} on the server or add a key on the Settings page.`,
    );
  }
  return key;
}

/** Wraps a route body so every failure becomes a JSON error with a useful status. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 502;
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status });
  }
}
