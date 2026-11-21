"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { reportToMarkdown } from "@/lib/client";
import { PROVIDER_LABEL, PROVIDERS, SIMILARITY_LABEL } from "@/lib/types";
import type { Gap, Provider, Question, QuestionComparison, Report, SourcedClaim, Similarity } from "@/lib/types";

const DOT: Record<Provider, string> = { chatgpt: "bg-chatgpt", claude: "bg-claude", gemini: "bg-gemini" };
const SEVERITY = { high: "text-high border-high", medium: "text-medium border-medium", low: "text-low border-low" };
const SIMILARITY: Record<Similarity, string> = {
  high: "text-chatgpt border-chatgpt",
  medium: "text-medium border-medium",
  low: "text-high border-high",
  "n/a": "text-muted border-line",
};
const TYPE_LABEL: Record<Gap["type"], string> = {
  contradiction: "Contradicts the brand",
  omission: "Left out",
  unsupported: "Not in brand material",
  emphasis: "Different emphasis",
  audience: "Wrong audience",
};

function Llm({ p }: { p: Provider }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span className={`h-2 w-2 rounded-full ${DOT[p]}`} />
      {PROVIDER_LABEL[p]}
    </span>
  );
}

function Section({ id, eyebrow, title, intro, children }: {
  id: string; eyebrow: string; title: string; intro?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      {intro && <p className="mt-1 max-w-3xl text-sm text-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="eyebrow">{title}</div>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
          {items.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">Nothing given</p>
      )}
    </div>
  );
}

function Source({ source }: { source: string }) {
  if (!source) return null;
  const isUrl = /^https?:\/\//.test(source);
  return (
    <span className="ml-1 text-xs text-muted">
      ({isUrl ? <a className="underline" href={source} target="_blank" rel="noreferrer">{source.replace(/^https?:\/\/(www\.)?/, "")}</a> : source})
    </span>
  );
}

function Claims({ title, items }: { title: string; items: SourcedClaim[] }) {
  return (
    <div>
      <div className="eyebrow">{title}</div>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
          {items.map((c, i) => <li key={i}>{c.claim}<Source source={c.source} /></li>)}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">Not stated in the provided material</p>
      )}
    </div>
  );
}

function GapCard({ gap, n }: { gap: Gap; n: number }) {
  const shown = PROVIDERS.filter((p) => gap.llmSays[p]);
  return (
    <article className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${SEVERITY[gap.severity]}`}>{gap.severity}</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{TYPE_LABEL[gap.type]}</span>
        <span className="ml-auto flex gap-3 text-xs">{gap.affected.map((p) => <Llm key={p} p={p} />)}</span>
      </div>
      <h3 className="mt-3 font-semibold">{n}. {gap.topic}</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-bg p-3">
          <div className="eyebrow">The brand says</div>
          <p className="mt-1 text-sm">{gap.brandSays}<Source source={gap.brandSource} /></p>
        </div>
        <div className="rounded-lg bg-bg p-3">
          <div className="eyebrow">The LLMs say</div>
          <div className="mt-1 space-y-2 text-sm">
            {shown.map((p) => (
              <p key={p}><Llm p={p} />: {gap.llmSays[p]}</p>
            ))}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">Why it matters</dt><dd>{gap.whyItMatters}</dd>
        <dt className="text-muted">Suggested fix</dt><dd>{gap.suggestedFix}</dd>
      </dl>
    </article>
  );
}

function Kind() {
  return <span className="ml-2 whitespace-nowrap rounded border border-line px-1.5 py-0.5 align-middle text-xs font-normal text-muted">Follow-up</span>;
}

function Badge({ level }: { level: Similarity }) {
  return (
    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${SIMILARITY[level]}`}>
      {SIMILARITY_LABEL[level]}
    </span>
  );
}

function ComparisonCard({ c, q, n, present }: { c: QuestionComparison; q: Question; n: number; present: Provider[] }) {
  return (
    <article className="card p-4 sm:p-5">
      <h3 className="font-semibold">{n}. {q.text}{q.kind === "generated" && <Kind />}</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-[2fr_3fr]">
        <div className="rounded-lg bg-bg p-3">
          <div className="eyebrow">What the brand says</div>
          <p className={`mt-1 text-sm ${c.brandStated ? "" : "text-muted"}`}>{c.brandSays}</p>
        </div>
        <div className="space-y-3">
          {present.map((p) => {
            const e = c.llms[p];
            if (!e) return null;
            return (
              <div key={p} className="rounded-lg bg-bg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Llm p={p} />
                  <Badge level={e.similarity} />
                </div>
                {e.llmSays && <p className="mt-2 text-sm">{e.llmSays}</p>}
                {e.note && <p className="hint mt-1">{e.note}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

export default function ReportView({ report, onClose }: { report: Report; onClose: () => void }) {
  const [filter, setFilter] = useState<Provider | "all">("all");
  const present = PROVIDERS.filter((p) => report.views[p]);
  const g = report.gapReport;
  const gaps = (g?.gaps ?? []).filter((x) => filter === "all" || x.affected.includes(filter));
  const self = report.self;
  const compared = (report.comparisons ?? []).flatMap((c) => {
    const q = report.questions.find((x) => x.id === c.questionId);
    return q ? [{ c, q }] : [];
  });
  const cols = present.length === 3 ? "lg:grid-cols-3" : present.length === 2 ? "lg:grid-cols-2" : "";

  const download = () => {
    const blob = new Blob([reportToMarkdown(report)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `positioning-audit-${report.domain}-${report.createdAt.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-12">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">LLM positioning audit</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{report.brandName}</h1>
            <p className="mt-1 text-sm text-muted">
              {report.domain} · {new Date(report.createdAt).toLocaleString()} · web search {report.settings.webSearch ? "on" : "off"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {present.map((p) => `${PROVIDER_LABEL[p]}: ${report.settings.models[p]}`).join(" · ")} · analyst: {report.settings.models.deepinfra}
            </p>
          </div>
          <div className="no-print flex gap-2">
            <button className="btn" onClick={download}>Download Markdown</button>
            <button className="btn" onClick={() => window.print()}>Print / PDF</button>
            <button className="btn btn-primary" onClick={onClose}>New audit</button>
          </div>
        </div>
        <nav className="no-print mt-5 flex flex-wrap gap-x-5 gap-y-1 border-y border-line py-2 text-sm text-muted">
          {compared.length > 0 && <a href="#questions" className="hover:text-ink">Question by question</a>}
          <a href="#gaps" className="hover:text-ink">Positioning gaps</a>
          <a href="#views" className="hover:text-ink">Each LLM&apos;s view</a>
          <a href="#self" className="hover:text-ink">Brand&apos;s own description</a>
          <a href="#raw" className="hover:text-ink">Questions &amp; answers</a>
        </nav>
        {report.notes.length > 0 && (
          <div className="mt-4 rounded-lg border border-medium p-3 text-sm">
            <div className="font-medium text-medium">Things to know about this run</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{report.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}
      </div>

      {compared.length > 0 && (
        <Section id="questions" eyebrow="Question by question" title="How close each LLM is to the brand's own answer"
          intro="For every question asked, fixed and follow-up: the answer the brand's own material gives, and how similar each LLM's answer is to it. Similarity is about substance and emphasis, not wording. Where the brand's material doesn't answer a question, there is nothing to compare against.">
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-3 font-medium text-muted">Question</th>
                  {present.map((p) => <th key={p} className="p-3"><Llm p={p} /></th>)}
                </tr>
              </thead>
              <tbody>
                {compared.map(({ c, q }, i) => (
                  <tr key={c.questionId} className="border-b border-line last:border-0">
                    <td className="p-3">{i + 1}. {q.text}{q.kind === "generated" && <Kind />}</td>
                    {present.map((p) => <td key={p} className="p-3">{c.llms[p] && <Badge level={c.llms[p]!.similarity} />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-4">
            {compared.map(({ c, q }, i) => <ComparisonCard key={c.questionId} c={c} q={q} n={i + 1} present={present} />)}
          </div>
        </Section>
      )}

      {g && (
        <Section id="gaps" eyebrow="The main finding" title="Where the LLMs diverge from the brand's positioning"
          intro="Each gap sets what the brand says about itself against what the LLMs said. The brand side comes only from the URLs and positioning doc you supplied.">
          <p className="max-w-3xl text-base">{g.headline}</p>
          <div className={`mt-4 grid gap-3 ${cols}`}>
            {present.map((p) => g.perLlm[p] && (
              <div key={p} className="card p-4">
                <div className="flex items-center justify-between text-sm">
                  <Llm p={p} />
                  <span className={g.perLlm[p]!.rating === "aligned" ? "text-chatgpt" : g.perLlm[p]!.rating === "misaligned" ? "text-high" : "text-medium"}>
                    {g.perLlm[p]!.rating}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{g.perLlm[p]!.note}</p>
              </div>
            ))}
          </div>
          <div className="no-print mt-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{gaps.length} gap{gaps.length === 1 ? "" : "s"} affecting</span>
            {(["all", ...present] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 ${filter === f ? "border-accent text-accent" : "border-line text-muted"}`}>
                {f === "all" ? "Any LLM" : PROVIDER_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-4">
            {gaps.map((gap, i) => <GapCard key={i} gap={gap} n={i + 1} />)}
            {!gaps.length && <p className="text-sm text-muted">No gaps found for this selection.</p>}
          </div>
          {g.aligned.length > 0 && (
            <div className="card mt-4 p-4"><List title="Where the LLMs match the brand" items={g.aligned} /></div>
          )}
        </Section>
      )}

      <Section id="views" eyebrow="Per model" title="How each LLM sees the brand"
        intro="A summary of each model's answers across all questions, including how well it seems to know the brand at all.">
        <div className={`grid gap-4 ${cols}`}>
          {present.map((p) => {
            const v = report.views[p]!;
            return (
              <div key={p} className="card space-y-3 p-4">
                <div className="flex items-center justify-between text-sm">
                  <Llm p={p} />
                  <span className="text-muted">recognition: <span className="text-ink">{v.recognition}</span></span>
                </div>
                <p className="text-sm">{v.summary}</p>
                <p className="hint">{v.recognitionNote}</p>
                <div><div className="eyebrow">Category</div><p className="mt-1 text-sm">{v.category || "Not given"}</p></div>
                <List title="Best for" items={v.targetUsers} />
                <List title="Worst for" items={v.notFor} />
                <List title="Use cases" items={v.useCases} />
                <List title="Features" items={v.features} />
                <List title="Advantages" items={v.advantages} />
                <List title="Competitors named" items={v.competitors} />
              </div>
            );
          })}
        </div>
      </Section>

      {self && (
        <Section id="self" eyebrow="The reference" title="How the brand describes itself"
          intro="Extracted only from the URLs and positioning doc you supplied. Nothing here comes from the analyst model's general knowledge; anything the material doesn't say is listed as not stated.">
          <div className="card space-y-4 p-4 sm:p-5">
            <p className="text-base font-medium">{self.oneLiner}</p>
            <p className="text-sm">{self.summary}</p>
            <div><div className="eyebrow">Category</div><p className="mt-1 text-sm">{self.category || "Not stated"}</p></div>
            <div className="grid gap-5 md:grid-cols-2">
              <Claims title="Target users" items={self.targetUsers} />
              <Claims title="Not for" items={self.notFor} />
              <Claims title="Use cases" items={self.useCases} />
              <Claims title="Features" items={self.features} />
              <Claims title="Differentiators" items={self.differentiators} />
              <List title="Competitors it names" items={self.competitorsMentioned} />
            </div>
            {self.notStated.length > 0 && <List title="Not stated in the material" items={self.notStated} />}
            <div>
              <div className="eyebrow">Sources used</div>
              <ul className="mt-1 space-y-0.5 text-sm">
                {report.positioningDoc.trim() && <li>Positioning doc ({report.positioningDoc.length.toLocaleString()} characters)</li>}
                {report.pages.map((p, i) => (
                  <li key={i} className={p.ok ? "" : "text-high"}>
                    {p.url} {p.ok ? `(${p.chars?.toLocaleString()} characters)` : `— not read: ${p.error}`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}

      <Section id="raw" eyebrow="Evidence" title="Questions and raw answers">
        <div className="space-y-2">
          {report.questions.map((q) => (
            <details key={q.id} className="card group">
              <summary className="flex cursor-pointer items-start gap-3 p-4 text-sm">
                <span className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">{q.kind === "fixed" ? "Fixed" : "Follow-up"}</span>
                <span className="font-medium">{q.text}</span>
              </summary>
              <div className="border-t border-line p-4">
                {q.rationale && <p className="hint mb-3">Why this was asked: {q.rationale}</p>}
                <div className={`grid gap-4 ${cols}`}>
                  {PROVIDERS.map((p) => {
                    const a = q.answers[p];
                    if (!a) return null;
                    return (
                      <div key={p} className="min-w-0">
                        <div className="mb-2 text-sm"><Llm p={p} /></div>
                        {a.ok ? (
                          <div className="prose-answer"><Markdown remarkPlugins={[remarkGfm]}>{a.text}</Markdown></div>
                        ) : (
                          <p className="text-sm text-high">No answer: {a.error}</p>
                        )}
                        {!!a.citations?.length && (
                          <div className="hint mt-2">
                            Sources:{" "}
                            {a.citations.map((c, i) => (
                              <a key={i} href={c.url} target="_blank" rel="noreferrer" className="mr-2 underline">{c.title || new URL(c.url).hostname}</a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
