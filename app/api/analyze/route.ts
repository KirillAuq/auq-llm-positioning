import { handle, HttpError, requirePassword, resolveKey } from "@/lib/server/auth";
import { comparePrompt, gapPrompt, questionsPrompt, selfPrompt, viewPrompt } from "@/lib/server/prompts";
import { analyst } from "@/lib/server/providers";
import { PROVIDERS } from "@/lib/types";
import type { BrandSelf, Gap, GapReport, LlmView, Provider, Question, QuestionComparison } from "@/lib/types";

export const maxDuration = 300;

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const strings = (v: unknown) => list<unknown>(v).map(str).filter(Boolean);
const claims = (v: unknown) =>
  list<any>(v)
    .map((c) => (typeof c === "string" ? { claim: c, source: "" } : { claim: str(c?.claim), source: str(c?.source) }))
    .filter((c) => c.claim);
const providersIn = (v: unknown) => strings(v).filter((p): p is Provider => PROVIDERS.includes(p as Provider));

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    requirePassword(body.auth);
    const key = resolveKey("deepinfra", body.auth);
    const model = str(body.model).trim();
    if (!model) throw new HttpError(400, "Missing analyst model");
    const run = <T>(p: { system: string; user: string }) => analyst<T>(key, model, p.system, p.user);

    switch (body.step) {
      case "self": {
        const pages = list<any>(body.pages);
        const doc = str(body.positioningDoc);
        if (!doc.trim() && !pages.some((p) => p.ok && p.text)) {
          throw new HttpError(400, "No brand material: none of the URLs could be read and the positioning doc is empty");
        }
        const r = await run<any>(selfPrompt(pages, doc, str(body.brandHint)));
        const self: BrandSelf = {
          brandName: str(r.brandName),
          category: str(r.category),
          oneLiner: str(r.oneLiner),
          summary: str(r.summary),
          targetUsers: claims(r.targetUsers),
          notFor: claims(r.notFor),
          useCases: claims(r.useCases),
          features: claims(r.features),
          differentiators: claims(r.differentiators),
          competitorsMentioned: strings(r.competitorsMentioned),
          notStated: strings(r.notStated),
        };
        return { self };
      }
      case "questions": {
        const count = Math.max(0, Math.min(12, Number(body.count) || 0));
        const r = await run<any>(questionsPrompt(str(body.brand), "[brand]", list(body.questions), count));
        const questions = list<any>(r.questions)
          .map((q) => ({ question: str(q?.question), rationale: str(q?.rationale) }))
          .filter((q) => q.question)
          .slice(0, count);
        return { questions };
      }
      case "view": {
        if (!PROVIDERS.includes(body.provider)) throw new HttpError(400, "Unknown provider");
        const r = await run<any>(viewPrompt(str(body.brand), body.provider, list(body.questions)));
        const view: LlmView = {
          summary: str(r.summary),
          category: str(r.category),
          recognition: ["strong", "partial", "weak", "none"].includes(r.recognition) ? r.recognition : "partial",
          recognitionNote: str(r.recognitionNote),
          targetUsers: strings(r.targetUsers),
          notFor: strings(r.notFor),
          useCases: strings(r.useCases),
          features: strings(r.features),
          advantages: strings(r.advantages),
          competitors: strings(r.competitors),
        };
        return { view };
      }
      case "compare": {
        const providers = providersIn(body.providers);
        const asked = list<Question>(body.questions);
        const r = await run<any>(comparePrompt(body.self, str(body.positioningDoc), asked, providers));
        const rows = list<any>(r.questions);
        const comparisons: QuestionComparison[] = asked.map((q, i) => {
          const row = rows.find((x) => Number(x?.n) === i + 1);
          const brandStated = row ? row.brandStated !== false : false;
          const llms: QuestionComparison["llms"] = {};
          for (const p of providers) {
            const e = row?.llms?.[p];
            const answered = !!q.answers?.[p]?.ok;
            // "n/a" is decided by the facts of the run, not left to the analyst.
            const comparable = !!e && brandStated && answered;
            llms[p] = {
              similarity: comparable && ["high", "medium", "low"].includes(e.similarity) ? e.similarity : "n/a",
              llmSays: answered ? str(e?.llmSays) : "",
              note: !answered ? "No answer from this LLM." : str(e?.note) || (e ? "" : "The analyst did not score this answer."),
            };
          }
          return {
            questionId: q.id,
            brandSays: (brandStated && str(row?.brandSays)) || "Not stated in the brand's material",
            brandStated,
            llms,
          };
        });
        return { comparisons };
      }
      case "gaps": {
        const providers = providersIn(body.providers);
        const r = await run<any>(gapPrompt(body.self, str(body.positioningDoc), body.views ?? {}, list(body.questions), providers));
        const rank = { high: 0, medium: 1, low: 2 };
        const gaps: Gap[] = list<any>(r.gaps)
          .map((g) => ({
            topic: str(g?.topic),
            type: ["contradiction", "omission", "unsupported", "emphasis", "audience"].includes(g?.type) ? g.type : "emphasis",
            severity: g?.severity in rank ? g.severity : "medium",
            brandSays: str(g?.brandSays),
            brandSource: str(g?.brandSource),
            llmSays: Object.fromEntries(providers.map((p) => [p, str(g?.llmSays?.[p])]).filter(([, v]) => v)),
            affected: providersIn(g?.affected),
            whyItMatters: str(g?.whyItMatters),
            suggestedFix: str(g?.suggestedFix),
          }))
          .sort((a, b) => rank[a.severity as keyof typeof rank] - rank[b.severity as keyof typeof rank]);
        const perLlm: GapReport["perLlm"] = {};
        for (const p of providers) {
          const e = r.perLlm?.[p];
          if (!e) continue;
          perLlm[p] = {
            rating: ["aligned", "partly aligned", "misaligned"].includes(e.rating) ? e.rating : "partly aligned",
            note: str(e.note),
          };
        }
        const gapReport: GapReport = { headline: str(r.headline), perLlm, gaps, aligned: strings(r.aligned) };
        return { gapReport };
      }
      default:
        throw new HttpError(400, "Unknown analysis step");
    }
  });
}
