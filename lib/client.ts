"use client";

import { MAX_CLAIM_CHARS, MAX_CLAIMS } from "./defaults";
import { accessToken } from "./session";
import { PROVIDER_LABEL, PROVIDERS, SIMILARITY_LABEL, VERDICT_LABEL } from "./types";
import type {
  Answer, BrandSelf, ClaimCheck, ClaimResult, GapReport, KeyName, LlmView, Provider, Question, QuestionComparison, Report, ScrapedPage, Settings,
} from "./types";

const REPORTS_KEY = "lpa.reports.v1";
const MAX_SAVED = 15;

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

/** Calls one of the app's API routes, as the signed-in user when there is one. */
export async function api<T>(path: string, body?: unknown, method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"): Promise<T> {
  const token = await accessToken();
  const res = await fetch(path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export interface ServerConfig {
  /** The shared settings every audit runs with. Only an admin can change them. */
  settings: Settings;
  serverKeys: Record<KeyName, boolean>;
  supabase: { url: string; publishableKey: string } | null;
}

export const getConfig = () => api<ServerConfig>("/api/config");

export function domainOf(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type StepId = "scrape" | "self" | "fixed" | "generate" | "generated" | "claims" | "analyze" | "gaps";
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
  { id: "claims", label: "Check the brand's claims" },
  { id: "analyze", label: "Summarise each LLM and score every question" },
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
  /** Optional. Statements the brand believes about itself, each put to every LLM as true or false. */
  claims: string[];
}

/** One claim per line; bullets and numbering are stripped, duplicates and blanks dropped. */
export function parseClaims(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim().slice(0, MAX_CLAIM_CHARS))
    .filter((l) => l && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()))
    .slice(0, MAX_CLAIMS);
}

const claimQuestion = (brand: string, claim: string) =>
  `Here is a statement about ${brand}:

"${claim}"

From what you know, is this statement true? Start your reply with exactly one word on its own line: TRUE, FALSE or UNSURE. Use UNSURE if you do not know the brand well enough or cannot tell; do not guess. Use FALSE if any part of the statement is wrong. Then give your reason in no more than two sentences.`;

/** The verdict is the LLM's own first word, read as-is, so no other model interprets the answer. */
export function readVerdict(answer: Answer): ClaimResult {
  if (!answer.ok || !answer.text) return { reason: `No answer: ${answer.error ?? "empty reply"}` };
  const lines = answer.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const m = /^[\s*_#>"'`]*(true|false|unsure)\b[\s*_"'`.:,;—–-]*/i.exec(lines[0] ?? "");
  if (!m) return { reason: `No verdict: the reply did not start with TRUE, FALSE or UNSURE. It said: ${answer.text}`, citations: answer.citations };
  const rest = [lines[0].slice(m[0].length), ...lines.slice(1)].join(" ").trim();
  return { verdict: m[1].toLowerCase() as ClaimResult["verdict"], reason: rest, citations: answer.citations };
}

export interface ClaimScore { confirmed: number; denied: number; unsure: number; answered: number; pct: number | null }

/** Share of answered checks where the LLM said TRUE. Pass a provider for that LLM's score alone. */
export function claimScore(claims: ClaimCheck[], provider?: Provider): ClaimScore {
  const s: ClaimScore = { confirmed: 0, denied: 0, unsure: 0, answered: 0, pct: null };
  for (const c of claims) {
    for (const p of provider ? [provider] : PROVIDERS) {
      const v = c.results[p]?.verdict;
      if (!v) continue;
      s.answered++;
      if (v === "true") s.confirmed++;
      else if (v === "false") s.denied++;
      else s.unsure++;
    }
  }
  s.pct = s.answered ? Math.round((s.confirmed / s.answered) * 100) : null;
  return s;
}

/**
 * Runs the whole audit from the browser as a series of short API calls, so no
 * single serverless invocation has to outlive the platform's time limit and the
 * UI can show progress as answers arrive.
 */
export async function runAudit(input: AuditInput, onProgress: (p: Progress) => void): Promise<Report> {
  const notes: string[] = [];
  const config = await getConfig();
  const settings = config.settings;
  const hasKey = (k: KeyName) => config.serverKeys[k];

  if (!hasKey("deepinfra")) {
    throw new Error("The audit can't run yet: no DeepInfra API key is set up. An admin can add one in Settings.");
  }
  let providers: Provider[] = PROVIDERS.filter(hasKey);
  if (!providers.length) throw new Error("The audit can't run yet: no API key is set up for ChatGPT, Claude or Gemini. An admin can add one in Settings.");
  for (const p of PROVIDERS) {
    if (!providers.includes(p)) notes.push(`${PROVIDER_LABEL[p]} was skipped: no API key configured.`);
  }

  // 1. Brand material
  onProgress({ step: "scrape", detail: `${input.urls.length} URL(s)`, done: 0, total: 1 });
  const { pages } = await api<{ pages: ScrapedPage[] }>("/api/scrape", { urls: input.urls });
  for (const p of pages) {
    if (!p.ok) notes.push(`Could not read ${p.url}: ${p.error}`);
    else if (p.warning) notes.push(`${p.url}: ${p.warning}`);
  }

  // 2. (c) Self-description, from the supplied material only
  onProgress({ step: "self", detail: settings.models.deepinfra, done: 0, total: 1 });
  const { self } = await api<{ self: BrandSelf }>("/api/analyze", {
    step: "self", pages, positioningDoc: input.positioningDoc, brandHint: input.brandHint,
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
          provider: p, question: q.text,
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

  // Optional claims check: each claim goes to each LLM as a direct true/false question.
  if (input.claims.length) {
    const checks: ClaimCheck[] = input.claims.map((claim, i) => ({ id: `c${i}`, claim, results: {} }));
    const jobs = checks.flatMap((c) => providers.map((p) => ({ c, p })));
    let asked = 0;
    onProgress({ step: "claims", detail: "", done: asked, total: jobs.length });
    await pool(jobs, 6, async ({ c, p }) => {
      let answer: Answer;
      try {
        answer = await api<Answer>("/api/ask", {
          provider: p, question: claimQuestion(brandInQuestion, c.claim),
        });
      } catch (err) {
        answer = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      c.results[p] = readVerdict(answer);
      onProgress({ step: "claims", detail: `${PROVIDER_LABEL[p]}: ${c.claim}`, done: ++asked, total: jobs.length });
    });
    report.claims = checks;
  }

  // 6. (a) per-LLM views and the question-by-question comparison, in parallel
  const analyze = { brand: brandName, questions: report.questions };
  let done = 0;
  // Scored a few questions per call so the analyst's reply stays well inside its token budget.
  const batches: Question[][] = [];
  for (let i = 0; i < report.questions.length; i += 6) batches.push(report.questions.slice(i, i + 6));
  const scored: QuestionComparison[][] = [];
  const total = providers.length + batches.length;
  onProgress({ step: "analyze", detail: "", done, total });
  const tick = (detail: string) => onProgress({ step: "analyze", detail, done: ++done, total });
  await Promise.all([
    ...providers.map(async (p) => {
      const { view } = await api<{ view: LlmView }>("/api/analyze", { ...analyze, step: "view", provider: p });
      report.views[p] = view;
      tick(`${PROVIDER_LABEL[p]} summarised`);
    }),
    // The rest of the report stands without this section, so a failed batch is a note, not a stop.
    ...batches.map((batch, i) =>
      api<{ comparisons: QuestionComparison[] }>("/api/analyze", {
        ...analyze, step: "compare", questions: batch, self, positioningDoc: input.positioningDoc, providers,
      })
        .then(({ comparisons }) => { scored[i] = comparisons; })
        .catch((err) => {
          notes.push(`${batch.length} question(s) are missing from the question-by-question comparison, starting with "${batch[0].text}": ${err instanceof Error ? err.message : err}`);
        })
        .finally(() => tick(`Questions scored (${i + 1} of ${batches.length})`)),
    ),
  ]);
  report.comparisons = scored.flat();

  // 7. (d) Brand vs LLMs
  onProgress({ step: "gaps", detail: settings.models.deepinfra, done: 0, total: 1 });
  const { gapReport } = await api<{ gapReport: GapReport }>("/api/analyze", {
    ...analyze, step: "gaps", self, positioningDoc: input.positioningDoc, views: report.views, providers,
  });
  report.gapReport = gapReport;

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

  if (r.claims?.length) {
    const fmt = (s: ClaimScore) => (s.pct === null ? "no answers" : `${s.pct}% (${s.confirmed} of ${s.answered} confirmed, ${s.denied} false, ${s.unsure} unsure)`);
    const asked = PROVIDERS.filter((p) => r.claims!.some((c) => c.results[p]));
    L.push("## Claims check", "", "_Each claim was put to each LLM as a direct true/false question. \"True\" means the LLM confirms the claim, not that it has been verified._", "");
    L.push(`**Overall score:** ${fmt(claimScore(r.claims))}`, "");
    for (const p of asked) L.push(`- **${PROVIDER_LABEL[p]}:** ${fmt(claimScore(r.claims, p))}`);
    L.push("", `| Claim | ${asked.map((p) => PROVIDER_LABEL[p]).join(" | ")} |`, `| --- | ${asked.map(() => "---").join(" | ")} |`);
    const cell = (x?: ClaimResult) => (x?.verdict ? VERDICT_LABEL[x.verdict] : "No answer");
    for (const c of r.claims) L.push(`| ${c.claim.replace(/\|/g, "\\|")} | ${asked.map((p) => cell(c.results[p])).join(" | ")} |`);
    L.push("");
    for (const c of r.claims) {
      L.push(`### ${c.claim}`, "");
      for (const p of asked) L.push(`- **${PROVIDER_LABEL[p]}** (${cell(c.results[p])}): ${c.results[p]?.reason ?? ""}`);
      L.push("");
    }
  }

  if (r.comparisons?.length) {
    L.push("## Question by question: brand vs LLMs", "");
    for (const c of r.comparisons) {
      const q = r.questions.find((x) => x.id === c.questionId);
      if (!q) continue;
      L.push(`### ${q.text}`, "", q.kind === "generated" ? "_Follow-up question_" : "_Fixed question_", "", `**What the brand says:** ${c.brandSays}`, "");
      for (const p of PROVIDERS) {
        const e = c.llms[p];
        if (e) L.push(`- **${PROVIDER_LABEL[p]}** (${SIMILARITY_LABEL[e.similarity]}): ${[e.llmSays, e.note].filter(Boolean).join(" — ")}`);
      }
      L.push("");
    }
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
