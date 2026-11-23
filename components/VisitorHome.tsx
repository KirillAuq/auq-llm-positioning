"use client";

import { useEffect, useRef, useState } from "react";
import ReportPreview from "@/components/ReportPreview";
import type { AuditInput } from "@/lib/client";

export interface Visitor { name: string; email: string }

const MAX_PAGES = 3;
const MAX_VISITOR_CLAIMS = 6;

const STEPS = [
  { title: "Your website", need: "Required", blurb: "The site you want audited." },
  { title: "About you", need: "Optional", blurb: "Your name and email, if you'd like us to follow up." },
  { title: "Reference pages", need: "Optional", blurb: "Your llms.txt and up to three solution pages." },
  { title: "Claims to verify", need: "Optional", blurb: "Up to six statements for the LLMs to confirm or deny." },
] as const;

const looksLikeUrl = (v: string) => {
  try {
    const u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);
    return u.hostname.includes(".") && !/\s/.test(v.trim());
  } catch {
    return false;
  }
};
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function VisitorHome({ onRun, error, recordsNotice }: {
  onRun: (input: AuditInput, visitor: Visitor) => void;
  /** A problem from the last attempt to run, shown above the form. */
  error: string;
  /** Whether submissions are being recorded, so the visitor can be told. */
  recordsNotice: boolean;
}) {
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [llms, setLlms] = useState("");
  const [pages, setPages] = useState<string[]>(Array(MAX_PAGES).fill(""));
  const [claims, setClaims] = useState<string[]>(Array(MAX_VISITOR_CLAIMS).fill(""));
  const [problem, setProblem] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const moved = useRef(false);

  // After moving between steps, put the cursor in the step's first field. Not on first
  // load: focusing the form then would scroll the page past the introduction.
  useEffect(() => {
    if (!moved.current) return;
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [step]);

  // What stands in the way of leaving a step. Only the website is required; the rest is checked only if filled in.
  function check(i: number): string {
    if (i === 0 && !url.trim()) return "Enter your website address to continue.";
    if (i === 0 && !looksLikeUrl(url)) return "That doesn't look like a website address. Try something like yourbrand.com.";
    if (i === 1 && email.trim() && !looksLikeEmail(email)) return "That email address doesn't look right. Fix it or leave it blank.";
    if (i === 2 && llms.trim() && !looksLikeUrl(llms)) return "The llms.txt address doesn't look right. Fix it or leave it blank.";
    if (i === 2) {
      const bad = pages.find((p) => p.trim() && !looksLikeUrl(p));
      if (bad) return `"${bad.trim()}" doesn't look like a page address. Fix it or clear it.`;
    }
    return "";
  }

  function go(to: number) {
    // Going back is always allowed; going forward needs every step on the way to be valid.
    for (let i = step; i < to; i++) {
      const p = check(i);
      if (p) {
        setStep(i);
        setProblem(p);
        return;
      }
    }
    setProblem("");
    moved.current = true;
    setStep(to);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) return go(step + 1);
    for (let i = 0; i < STEPS.length; i++) {
      const p = check(i);
      if (p) {
        setStep(i);
        setProblem(p);
        return;
      }
    }
    onRun(
      {
        urls: [url, ...pages].map((u) => u.trim()).filter(Boolean),
        positioningDoc: "",
        brandHint: "",
        claims: [...new Set(claims.map((c) => c.trim()).filter(Boolean))],
        // With no address given, look for the file at the root of their site.
        llmsTxt: llms.trim() || url.trim(),
        llmsTxtGiven: !!llms.trim(),
      },
      { name: name.trim(), email: email.trim() },
    );
  }

  const last = step === STEPS.length - 1;
  const shown = problem || error;

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="eyebrow">Free AI visibility check</div>
          <h1 className="display-lg mt-3">
            See how ChatGPT, Claude and Gemini <span className="highlight">describe your brand</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-body">
            Enter your website and we ask the three leading AI assistants about you, then show where their picture
            differs from what your own site says.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-body">
            {[
              "Question by question: how close each assistant is to your own answer",
              "The positioning gaps that matter, with a suggested fix for each",
              "A true or false verdict on the claims you care about",
            ].map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{t}</li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#start" className="btn btn-primary px-6 py-3">Start your audit</a>
            <span className="hint">Takes a few minutes. No account needed.</span>
          </div>
        </div>
        <ReportPreview />
      </section>

      <section id="start" className="scroll-mt-6">
        <h2 className="display-md">Set up your audit</h2>
        <p className="mt-2 max-w-2xl text-base text-body">Only your website is required. Everything else makes the report more useful, and you can skip any of it.</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
          <ol className="flex gap-2 overflow-x-auto lg:block lg:space-y-2 lg:overflow-visible">
            {STEPS.map((s, i) => (
              <li key={s.title} className="shrink-0 lg:shrink">
                <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${i === step ? "border-accent bg-surface" : "border-line hover:border-line-strong"}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i < step ? "bg-accent text-accent-ink" : i === step ? "border border-accent text-accent" : "border border-line-strong text-muted"}`}>
                    {i < step ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {s.title}
                      <span className={`rounded-full border px-1.5 py-px text-[10px] font-normal ${s.need === "Required" ? "border-cta text-cta" : "border-line-strong text-muted"}`}>{s.need}</span>
                    </span>
                    <span className="hint mt-0.5 hidden lg:block">{s.blurb}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <form ref={form} onSubmit={submit} noValidate className="card p-5 sm:p-7">
            <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
            <h3 className="display-sm mt-1">{STEPS[step].title}</h3>
            {shown && <div role="alert" className="mt-4 rounded-md border border-high p-3 text-sm text-high">{shown}</div>}

            <div className="mt-5 space-y-5">
              {step === 0 && (
                <div>
                  <label className="label" htmlFor="v-url">Website address <span className="text-cta">*</span></label>
                  <p className="hint mb-2">We read this page to learn how you describe yourself. Your homepage usually works best.</p>
                  <input id="v-url" className="input" type="text" inputMode="url" autoComplete="url" placeholder="yourbrand.com"
                    value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
              )}

              {step === 1 && (
                <>
                  <p className="text-sm text-body">Both are optional. Add them if you&apos;d like us to be able to follow up about your results.</p>
                  <div>
                    <label className="label" htmlFor="v-name">Your name <span className="font-normal text-muted">(optional)</span></label>
                    <input id="v-name" className="input max-w-md" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="v-email">Your email <span className="font-normal text-muted">(optional)</span></label>
                    <input id="v-email" className="input max-w-md" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <label className="label" htmlFor="v-llms">llms.txt <span className="font-normal text-muted">(optional)</span></label>
                    <p className="hint mb-2">
                      The plain-text summary some sites publish for AI models. Leave this blank and we&apos;ll look for one at
                      the root of your site. If we find it, it&apos;s used as part of your own description of the brand.
                    </p>
                    <input id="v-llms" className="input" type="text" inputMode="url" placeholder="yourbrand.com/llms.txt" value={llms} onChange={(e) => setLlms(e.target.value)} />
                  </div>
                  <fieldset>
                    <legend className="label">Solution pages <span className="font-normal text-muted">(optional, up to {MAX_PAGES})</span></legend>
                    <p className="hint mb-2">Pages that explain what you sell: a product, solution or use-case page. They add detail your homepage leaves out.</p>
                    <div className="space-y-2">
                      {pages.map((p, i) => (
                        <input key={i} className="input" type="text" inputMode="url" aria-label={`Solution page ${i + 1}`} placeholder={`yourbrand.com/solutions/…`}
                          value={p} onChange={(e) => setPages(pages.map((x, j) => (j === i ? e.target.value : x)))} />
                      ))}
                    </div>
                  </fieldset>
                </>
              )}

              {step === 3 && (
                <fieldset>
                  <legend className="label">Claims to verify <span className="font-normal text-muted">(optional, up to {MAX_VISITOR_CLAIMS})</span></legend>
                  <p className="hint mb-2">
                    Things you believe are true about your brand. Each one is put to every assistant as a true or false
                    question. Short, single-point claims work best.
                  </p>
                  <div className="space-y-2">
                    {claims.map((c, i) => (
                      <input key={i} className="input" aria-label={`Claim ${i + 1}`} maxLength={400}
                        placeholder={["We have a free plan", "We integrate with Salesforce", "We are SOC 2 certified", "", "", ""][i] && `e.g. ${["We have a free plan", "We integrate with Salesforce", "We are SOC 2 certified"][i]}`}
                        value={c} onChange={(e) => setClaims(claims.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
                  </div>
                </fieldset>
              )}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {step > 0 && <button type="button" className="btn" onClick={() => go(step - 1)}>Back</button>}
              <button type="submit" className="btn btn-primary px-6">{last ? "Run my audit" : "Next"}</button>
              {step > 0 && !last && <button type="button" className="hint underline" onClick={() => go(STEPS.length - 1)}>Skip to the last step</button>}
            </div>
            {last && <p className="hint mt-3">The audit takes a few minutes. You&apos;ll need to keep this window open until it finishes.</p>}
            {recordsNotice && <p className="hint mt-3">We keep a record of the websites and details submitted here.</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
