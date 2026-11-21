"use client";

import { DEFAULT_SETTINGS } from "./defaults";
import { PROVIDER_LABEL, PROVIDERS } from "./types";
import type {
  Answer, BrandSelf, GapReport, KeyName, LlmView, Provider, Question, Report, ScrapedPage, Settings,
} from "./types";

const SETTINGS_KEY = "lpa.settings.v1";
const REPORTS_KEY = "lpa.reports.v1";
const MAX_SAVED = 15;

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      models: { ...DEFAULT_SETTINGS.models, ...saved.models },
      keys: { ...DEFAULT_SETTINGS.keys, ...saved.keys },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadReports(): Report[] {
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveReport(report: Report) {
  let all = [report, ...loadReports().filter((r) => r.id !== report.id)].slice(0, MAX_SAVED);
  // Browsers cap localStorage at a few MB; drop the oldest reports until it fits.
  while (all.length) {
    try {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
      return;
    } catch {
      all = all.slice(0, -1);
    }
  }
}

export function deleteReport(id: string) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(loadReports().filter((r) => r.id !== id)));
}

function authOf(s: Settings) {
  return { keys: s.keys, appPassword: s.appPassword };
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export interface ServerConfig {
  serverKeys: Record<KeyName, boolean>;
  passwordRequired: boolean;
}

export const getConfig = () => api<ServerConfig>("/api/config");
export const fetchModels = (name: KeyName, s: Settings) =>
  api<{ models: string[] }>("/api/models", { name, auth: authOf(s) }).then((r) => r.models);

export function domainOf(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type StepId = "scrape" | "self" | "fixed" | "generate" | "generated" | "analyze" | "gaps";
export interface Progress {
  step: StepId;
  detail: string;
  done: number;
  total: number;
}

export const STEPS: { id: StepId; label: string }[] = [
  { id: "scrape", label: "Read the brand's pages" },
  { id: "self", label: "Extract how the brand describes itself" },
  { id: "fixed", label: "Ask the fixed questions" },
  { id: "generate", label: "Generate follow-up questions" },
  { id: "generated", label: "Ask the follow-up questions" },
  { id: "analyze", label: "Summarise each LLM's view" },
  { id: "gaps", label: "Find the positioning gaps" },
];

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export interface AuditInput {
  urls: string[];
  positioningDoc: string;
  brandHint: string;
}

/**
 * Runs the whole audit from the browser as a series of short API calls, so no
 * single serverless invocation has to outlive the platform's time limit and the
 * UI can show progress as answers arrive.
 */
export async function runAudit(
  input: AuditInput,
  settings: Settings,
  onProgress: (p: Progress) => void,
): Promise<Report> {
  const auth = authOf(settings);
  const notes: string[] = [];
  const config = await getConfig();
  const hasKey = (k: KeyName) => !!settings.keys[k].trim() || config.serverKeys[k];

  if (!hasKey("deepinfra")) {
    throw new Error("A DeepInfra API key is required to build the report. Add one on the Settings page or set DEEPINFRA_API_KEY.");
  }
  let providers: Provider[] = PROVIDERS.filter(hasKey);
  if (!providers.length) throw new Error("No API key found for ChatGPT, Claude or Gemini. Add at least one on the Settings page.");
  for (const p of PROVIDERS) {
    if (!providers.includes(p)) notes.push(`${PROVIDER_LABEL[p]} was skipped: no API key configured.`);
  }

  // 1. Brand material
  onProgress({ step: "scrape", detail: `${input.urls.length} URL(s)`, done: 0, total: 1 });
  const { pages } = await api<{ pages: ScrapedPage[] }>("/api/scrape", { urls: input.urls, auth });
  for (const p of pages) {
    if (!p.ok) notes.push(`Could not read ${p.url}: ${p.error}`);
    else if (p.warning) notes.push(`${p.url}: ${p.warning}`);
  }

  // 2. (c) Self-description, from the supplied material only
  onProgress({ step: "self", detail: settings.models.deepinfra, done: 0, total: 1 });
  const { self } = await api<{ self: BrandSelf }>("/api/analyze", {
    step: "self", pages, positioningDoc: input.positioningDoc, brandHint: input.brandHint,
    model: settings.models.deepinfra, auth,
  });

  const domain = domainOf(input.urls[0]);
  const brandName = input.brandHint.trim() || self.brandName.trim() || domain;
  const brandInQuestion = settings.includeDomain ? `${brandName} (${domain})` : brandName;
  const fill = (q: string) => q.replace(/\[brand\]/gi, brandInQuestion);

  const report: Report = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    urls: input.urls,
    positioningDoc: input.positioningDoc,
    brandName,
    domain,
    settings: { models: settings.models, webSearch: settings.webSearch, includeDomain: settings.includeDomain },
    pages,
    self,
    questions: [],
    views: {},
    notes,
  };

  const askAll = async (questions: Question[], step: StepId) => {
    const jobs = questions.flatMap((q) => providers.map((p) => ({ q, p })));
    let done = 0;
    onProgress({ step, detail: "", done, total: jobs.length });
    await pool(jobs, 6, async ({ q, p }) => {
      let answer: Answer;
      try {
        answer = await api<Answer>("/api/ask", {
          provider: p, question: q.text, model: settings.models[p], webSearch: settings.webSearch, auth,
        });
      } catch (err) {
        answer = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      q.answers[p] = answer;
      onProgress({ step, detail: `${PROVIDER_LABEL[p]}: ${q.text}`, done: ++done, total: jobs.length });
    });
  };

  // 3. Fixed questions
  const fixed: Question[] = settings.fixedQuestions
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q, i) => ({ id: `f${i}`, kind: "fixed", text: fill(q), answers: {} }));
  await askAll(fixed, "fixed");
  report.questions.push(...fixed);

  // A provider that failed every question (bad key, wrong model ID) has nothing to analyse.
  for (const p of [...providers]) {
    const answers = fixed.map((q) => q.answers[p]);
    if (answers.every((a) => !a?.ok)) {
      providers = providers.filter((x) => x !== p);
      notes.push(`${PROVIDER_LABEL[p]} failed every question and was left out of the analysis: ${answers[0]?.error ?? "unknown error"}`);
    }
  }
  if (!providers.length) throw new Error(`None of the LLMs returned an answer. ${notes.at(-1) ?? ""}`);

  // 4-5. Follow-ups generated from what the LLMs just said
  if (settings.autoQuestionCount > 0) {
    onProgress({ step: "generate", detail: settings.models.deepinfra, done: 0, total: 1 });
    try {
      const { questions } = await api<{ questions: { question: string; rationale: string }[] }>("/api/analyze", {
        step: "questions", brand: brandInQuestion, questions: fixed, count: settings.autoQuestionCount,
        model: settings.models.deepinfra, auth,
      });
      const generated: Question[] = questions.map((q, i) => ({
        id: `g${i}`, kind: "generated", text: fill(q.question), rationale: q.rationale, answers: {},
      }));
      await askAll(generated, "generated");
      report.questions.push(...generated);
    } catch (err) {
      notes.push(`Follow-up questions could not be generated: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 6. (a) per-LLM views, in parallel
  const analyze = { brand: brandName, questions: report.questions, model: settings.models.deepinfra, auth };
  let done = 0;
  const total = providers.length;
  onProgress({ step: "analyze", detail: "", done, total });
  const tick = (detail: string) => onProgress({ step: "analyze", detail, done: ++done, total });
  await Promise.all(
    providers.map(async (p) => {
      const { view } = await api<{ view: LlmView }>("/api/analyze", { ...analyze, step: "view", provider: p });
      report.views[p] = view;
      tick(`${PROVIDER_LABEL[p]} summarised`);
    }),
  );

  // 7. (d) Brand vs LLMs
  onProgress({ step: "gaps", detail: settings.models.deepinfra, done: 0, total: 1 });
  const { gapReport } = await api<{ gapReport: GapReport }>("/api/analyze", {
    ...analyze, step: "gaps", self, positioningDoc: input.positioningDoc, views: report.views, providers,
  });
  report.gapReport = gapReport;

  saveReport(report);
  return report;
}

export function reportToMarkdown(r: Report): string {
  const L: string[] = [];
  const present = PROVIDERS.filter((p) => r.views[p]);
  const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- _None_");
  L.push(`# LLM positioning audit: ${r.brandName}`, "");
  L.push(`${r.domain} · ${new Date(r.createdAt).toLocaleString()} · web search ${r.settings.webSearch ? "on" : "off"}`, "");
  L.push(`Models: ${present.map((p) => `${PROVIDER_LABEL[p]} \`${r.settings.models[p]}\``).join(", ")}; analyst \`${r.settings.models.deepinfra}\``, "");
  if (r.notes.length) L.push("## Notes", bullets(r.notes), "");

  if (r.gapReport) {
    const g = r.gapReport;
    L.push("## Brand vs LLMs: positioning gaps", "", g.headline, "");
    for (const p of present) if (g.perLlm[p]) L.push(`- **${PROVIDER_LABEL[p]}** (${g.perLlm[p]!.rating}): ${g.perLlm[p]!.note}`);
    L.push("");
    g.gaps.forEach((gap, i) => {
      L.push(`### ${i + 1}. ${gap.topic} (${gap.severity}, ${gap.type})`, "");
      L.push(`**Brand says:** ${gap.brandSays}${gap.brandSource ? ` _(${gap.brandSource})_` : ""}`, "");
      for (const p of PROVIDERS) if (gap.llmSays[p]) L.push(`**${PROVIDER_LABEL[p]} says:** ${gap.llmSays[p]}`, "");
      L.push(`**Why it matters:** ${gap.whyItMatters}`, "", `**Suggested fix:** ${gap.suggestedFix}`, "");
    });
    L.push("### Where the LLMs match the brand", bullets(g.aligned), "");
  }

  L.push("## How each LLM sees the brand", "");
  for (const p of present) {
    const v = r.views[p]!;
    L.push(`### ${PROVIDER_LABEL[p]}`, "", v.summary, "", `- **Category:** ${v.category}`, `- **Recognition:** ${v.recognition}. ${v.recognitionNote}`);
    const rows: [string, string[]][] = [
      ["Best for", v.targetUsers], ["Not for", v.notFor], ["Use cases", v.useCases],
      ["Features", v.features], ["Advantages", v.advantages], ["Competitors named", v.competitors],
    ];
    for (const [label, items] of rows) L.push(`- **${label}:** ${items.join("; ") || "none given"}`);
    L.push("");
  }

  if (r.self) {
    const s = r.self;
    const claims = (items: { claim: string; source: string }[]) =>
      bullets(items.map((c) => `${c.claim}${c.source ? ` _(${c.source})_` : ""}`));
    L.push("## How the brand describes itself", "", "_From the supplied URLs and positioning doc only._", "", `**${s.oneLiner}**`, "", s.summary, "");
    L.push(`**Category:** ${s.category}`, "", "### Target users", claims(s.targetUsers), "", "### Not for", claims(s.notFor), "");
    L.push("### Use cases", claims(s.useCases), "", "### Features", claims(s.features), "", "### Differentiators", claims(s.differentiators), "");
    L.push(`**Competitors named:** ${s.competitorsMentioned.join(", ") || "none"}`, "", "### Not stated in the material", bullets(s.notStated), "");
  }

  L.push("## Questions and raw answers", "");
  for (const q of r.questions) {
    L.push(`### ${q.text}`, "", q.kind === "generated" ? `_Generated follow-up. ${q.rationale ?? ""}_` : "_Fixed question_", "");
    for (const p of PROVIDERS) {
      const a = q.answers[p];
      if (!a) continue;
      L.push(`#### ${PROVIDER_LABEL[p]}`, "", a.ok ? a.text! : `_No answer: ${a.error}_`, "");
      if (a.citations?.length) L.push("Sources: " + a.citations.map((c) => `[${c.title || c.url}](${c.url})`).join(", "), "");
    }
  }
  return L.join("\n");
}
