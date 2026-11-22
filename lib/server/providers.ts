import Anthropic from "@anthropic-ai/sdk";
import type { Answer, Citation, KeyName, Provider } from "../types";
import { HttpError } from "./http";

interface AskArgs {
  key: string;
  model: string;
  question: string;
  webSearch: boolean;
}

const TIMEOUT_MS = 240_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const detail = json?.error?.message ?? json?.detail?.error ?? json?.detail ?? text.slice(0, 300);
    throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502, `${res.status}: ${detail}`);
  }
  return json;
}

function dedupe(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
}

// The questions go out bare, with no system prompt, so each model answers the way
// it would for an ordinary person asking in its own app.

async function askChatGPT({ key, model, question, webSearch }: AskArgs): Promise<Answer> {
  const json = await postJson(
    "https://api.openai.com/v1/responses",
    { authorization: `Bearer ${key}` },
    { model, input: question, ...(webSearch ? { tools: [{ type: "web_search" }] } : {}) },
  );
  const parts: string[] = [];
  const citations: Citation[] = [];
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "refusal") parts.push(c.refusal);
      if (c.type !== "output_text") continue;
      parts.push(c.text);
      for (const a of c.annotations ?? []) {
        if (a.type === "url_citation") citations.push({ title: a.title, url: a.url });
      }
    }
  }
  return finish(parts.join("\n"), json.model ?? model, citations);
}

async function askClaude({ key, model, question, webSearch }: AskArgs): Promise<Answer> {
  const client = new Anthropic({ apiKey: key, timeout: TIMEOUT_MS });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
  const parts: string[] = [];
  const citations: Citation[] = [];
  let servedBy = model;

  // With web search the server runs its own tool loop and may hand back a paused
  // turn; resend the assistant content as-is and it resumes where it stopped.
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      messages,
      // If a safety classifier declines, retry on the default fallback model
      // instead of returning an empty answer.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(webSearch ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }] } : {}),
    });
    servedBy = res.model;
    for (const block of res.content) {
      if (block.type !== "text") continue;
      parts.push(block.text);
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") citations.push({ title: c.title ?? undefined, url: c.url });
      }
    }
    if (res.stop_reason === "refusal") {
      const why = res.stop_details?.explanation ?? "no explanation given";
      return { ok: false, model: servedBy, error: `Claude declined to answer (${why})` };
    }
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return finish(parts.join(""), servedBy, citations);
}

async function askGemini({ key, model, question, webSearch }: AskArgs): Promise<Answer> {
  const json = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": key },
    {
      contents: [{ role: "user", parts: [{ text: question }] }],
      ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
    },
  );
  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p: any) => typeof p.text === "string" && !p.thought)
    .map((p: any) => p.text)
    .join("");
  if (!text) {
    const reason = json.promptFeedback?.blockReason ?? candidate?.finishReason ?? "empty response";
    return { ok: false, model, error: `Gemini returned no text (${reason})` };
  }
  const citations: Citation[] = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((c: any) => c.web?.uri)
    .map((c: any) => ({ title: c.web.title, url: c.web.uri }));
  return finish(text, json.modelVersion ?? model, citations);
}

function finish(text: string, model: string, citations: Citation[]): Answer {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, model, error: "The model returned an empty answer" };
  return { ok: true, text: trimmed, model, citations: dedupe(citations) };
}

export function ask(provider: Provider, args: AskArgs): Promise<Answer> {
  if (provider === "chatgpt") return askChatGPT(args);
  if (provider === "claude") return askClaude(args);
  return askGemini(args);
}

/** Pulls the first JSON object out of a reply that may carry reasoning tags or code fences. */
function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** One analyst call on DeepInfra. Returns parsed JSON; retries once if the reply isn't valid JSON. */
export async function analyst<T>(key: string, model: string, system: string, user: string): Promise<T> {
  let lastError = "";
  // Reasoning models spend the same token budget on thinking as on the reply, and a
  // long think can leave no room for the JSON. Keep thinking light, and switch it off
  // for the retry. Models without reasoning ignore the setting.
  let effort = "low";
  for (let attempt = 0; attempt < 2; attempt++) {
    const json = await postJson(
      "https://api.deepinfra.com/v1/openai/chat/completions",
      { authorization: `Bearer ${key}` },
      {
        model,
        temperature: 0.2,
        max_tokens: 24000,
        reasoning_effort: effort,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
    );
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length") {
      lastError = "the reply was cut off at the token limit";
      effort = "none";
      continue;
    }
    try {
      return parseJson(choice?.message?.content ?? "") as T;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      effort = "none";
    }
  }
  throw new HttpError(502, `The analyst model (${model}) did not return usable JSON: ${lastError}`);
}

/** Model IDs the key can use — powers the pickers and the "test connection" check on Settings. */
export async function listModels(name: KeyName, key: string): Promise<string[]> {
  if (name === "claude") {
    const client = new Anthropic({ apiKey: key });
    const ids: string[] = [];
    for await (const m of client.models.list()) ids.push(m.id);
    return ids;
  }
  const get = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502, `${res.status}: ${json?.error?.message ?? "request failed"}`);
    return json;
  };
  if (name === "gemini") {
    const json = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { "x-goog-api-key": key });
    return (json.models ?? [])
      .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: any) => String(m.name).replace(/^models\//, ""));
  }
  const base = name === "chatgpt" ? "https://api.openai.com/v1" : "https://api.deepinfra.com/v1/openai";
  const json = await get(`${base}/models`, { authorization: `Bearer ${key}` });
  return (json.data ?? []).map((m: any) => String(m.id)).sort();
}
