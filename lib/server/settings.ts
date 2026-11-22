import { DEFAULT_SETTINGS, ENV_VAR } from "../defaults";
import type { KeyName, KeySource, Settings } from "../types";
import { HttpError } from "./http";
import { db, ok, supabaseConfigured } from "./supabase";

export const KEY_NAMES: KeyName[] = ["chatgpt", "claude", "gemini", "deepinfra"];
type Keys = Partial<Record<KeyName, string>>;
interface App { settings: Settings; keys: Keys }

// Settings are read on every question of an audit, so keep them briefly in memory.
// A change saved by the admin reaches other server instances within this window.
const TTL_MS = 15_000;
let cache: { at: number; app: App } | undefined;

/** Coerces anything (a saved row, an admin's edit) into valid settings. */
export function cleanSettings(input: any): Settings {
  const d = DEFAULT_SETTINGS;
  const questions = Array.isArray(input?.fixedQuestions)
    ? input.fixedQuestions.filter((q: unknown): q is string => typeof q === "string").map((q: string) => q.trim().slice(0, 500)).filter(Boolean).slice(0, 30)
    : d.fixedQuestions;
  const count = Number(input?.autoQuestionCount);
  const models = { ...d.models };
  for (const k of KEY_NAMES) {
    const m = input?.models?.[k];
    if (typeof m === "string" && m.trim()) models[k] = m.trim().slice(0, 200);
  }
  return {
    fixedQuestions: questions.length ? questions : d.fixedQuestions,
    autoQuestionCount: Number.isFinite(count) ? Math.max(0, Math.min(12, Math.round(count))) : d.autoQuestionCount,
    models,
    webSearch: typeof input?.webSearch === "boolean" ? input.webSearch : d.webSearch,
    includeDomain: typeof input?.includeDomain === "boolean" ? input.includeDomain : d.includeDomain,
  };
}

function cleanKeys(input: any): Keys {
  const keys: Keys = {};
  for (const k of KEY_NAMES) if (typeof input?.[k] === "string" && input[k].trim()) keys[k] = input[k].trim();
  return keys;
}

/** The settings and saved keys every audit uses: the admin's if Supabase is set up, otherwise the defaults. */
export async function loadApp(): Promise<App> {
  if (!supabaseConfigured()) return { settings: DEFAULT_SETTINGS, keys: {} };
  if (cache && Date.now() - cache.at < TTL_MS) return cache.app;
  const row = ok(await db().from("app_settings").select("settings, keys").eq("id", 1).maybeSingle());
  const app = { settings: cleanSettings(row?.settings), keys: cleanKeys(row?.keys) };
  cache = { at: Date.now(), app };
  return app;
}

/** Saves settings, and applies key changes: a string sets a key, null removes it, a missing name leaves it alone. */
export async function saveApp(settings: unknown, keyChanges: Partial<Record<KeyName, string | null>> = {}) {
  cache = undefined;
  const keys = { ...(await loadApp()).keys };
  for (const k of KEY_NAMES) {
    const v = keyChanges[k];
    if (v === null) delete keys[k];
    else if (typeof v === "string" && v.trim()) keys[k] = v.trim();
  }
  const clean = cleanSettings(settings);
  ok(await db().from("app_settings").upsert({ id: 1, settings: clean, keys, updated_at: new Date().toISOString() }));
  cache = undefined;
}

const envKey = (name: KeyName) => process.env[ENV_VAR[name]]?.trim();

/** A key saved by the admin wins; the server's environment variable is the fallback. */
export async function resolveKey(name: KeyName): Promise<string> {
  const key = (await loadApp()).keys[name] || envKey(name);
  if (!key) throw new HttpError(400, `No API key for ${name}. An admin can add one in Settings, or set ${ENV_VAR[name]} on the server.`);
  return key;
}

export async function keySources(): Promise<Record<KeyName, KeySource>> {
  const { keys } = await loadApp();
  return Object.fromEntries(KEY_NAMES.map((k) => [k, keys[k] ? "saved" : envKey(k) ? "env" : "missing"])) as Record<KeyName, KeySource>;
}
