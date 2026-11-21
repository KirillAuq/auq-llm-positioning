"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReportView from "@/components/ReportView";
import { claimScore, deleteReport, loadReports, loadSettings, parseClaims, runAudit, STEPS } from "@/lib/client";
import type { Progress } from "@/lib/client";
import { MAX_CLAIMS, MAX_URLS } from "@/lib/defaults";
import type { Report } from "@/lib/types";

const URL_LABELS = ["Brand URL", ...Array.from({ length: MAX_URLS - 1 }, (_, i) => `Brand URL ${i + 2}`)];

export default function Home() {
  const [urls, setUrls] = useState<string[]>(Array(MAX_URLS).fill(""));
  const [doc, setDoc] = useState("");
  const [brandHint, setBrandHint] = useState("");
  const [tab, setTab] = useState<"positioning" | "claims">("positioning");
  const [claimsText, setClaimsText] = useState("");
  const claims = parseClaims(claimsText);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<Report[]>([]);

  useEffect(() => setHistory(loadReports()), [report]);

  const running = progress !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!urls[0].trim()) {
      setTab("positioning");
      setError("Add the brand URL before running the audit.");
      return;
    }
    setProgress({ step: "scrape", detail: "", done: 0, total: 1 });
    try {
      const input = { urls: urls.map((u) => u.trim()).filter(Boolean), positioningDoc: doc, brandHint, claims };
      setReport(await runAudit(input, loadSettings(), setProgress));
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }

  if (report) return <ReportView report={report} onClose={() => setReport(null)} />;

  if (running) {
    const steps = STEPS.filter((s) => s.id !== "claims" || claims.length > 0);
    const at = steps.findIndex((s) => s.id === progress.step);
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Running the audit</h1>
        <p className="mt-1 text-sm text-muted">This usually takes a few minutes. Keep this tab open.</p>
        <ol className="card mt-6 divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.id} className={`flex items-start gap-3 p-4 text-sm ${i > at ? "text-muted" : ""}`}>
              <span className="mt-0.5 w-4 text-center">{i < at ? "✓" : i === at ? <span className="inline-block animate-pulse text-accent">●</span> : "○"}</span>
              <div className="min-w-0 flex-1">
                <div className={i === at ? "font-medium" : ""}>{s.label}</div>
                {i === at && (
                  <div className="hint mt-1 truncate">
                    {progress.total > 1 && `${progress.done}/${progress.total} `}
                    {progress.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <form onSubmit={submit} className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Find the gap between your positioning and what LLMs say</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Give the tool your pages and positioning doc. It asks ChatGPT, Claude and Gemini about the brand, then reports
            where their picture differs from yours. Optionally, add specific claims to have each LLM confirm or deny.
          </p>
        </div>

        {error && <div className="rounded-lg border border-high p-3 text-sm text-high">{error}</div>}

        <div role="tablist" aria-label="Audit inputs" className="flex gap-1 border-b border-line">
          {([["positioning", "Positioning"], ["claims", `Claims check${claims.length ? ` (${claims.length})` : ""}`]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
              {label}{id === "claims" && <span className="ml-1 font-normal text-muted">optional</span>}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="panel-claims" aria-labelledby="tab-claims" hidden={tab !== "claims"} className="card p-5">
          <label className="label" htmlFor="claims">Claims to check</label>
          <p className="hint mb-2">
            One per line: specific things the brand believes are true about itself. Each claim is put to every LLM as a
            direct true/false question, and the report scores how many they confirm. Short, factual, single-point claims
            work best; a claim with two parts is marked false if either part is wrong. Up to {MAX_CLAIMS}.
          </p>
          <textarea id="claims" className="input min-h-72" value={claimsText} onChange={(e) => setClaimsText(e.target.value)}
            placeholder={"Acme integrates with Salesforce and HubSpot\nAcme is SOC 2 Type II certified\nAcme has a free plan\nAcme is built for teams of under 50 people"} />
          <div className="hint mt-1 text-right">{claims.length} claim{claims.length === 1 ? "" : "s"}</div>
        </div>

        <div role="tabpanel" id="panel-positioning" aria-labelledby="tab-positioning" hidden={tab !== "positioning"} className="space-y-6">
        <fieldset className="card space-y-3 p-5">
          <legend className="sr-only">Brand URLs</legend>
          {URL_LABELS.map((label, i) => (
            <div key={i}>
              <label className="label" htmlFor={`url${i}`}>
                {label} {i === 0 ? <span className="text-high">*</span> : <span className="font-normal text-muted">(optional, e.g. a service page)</span>}
              </label>
              <input id={`url${i}`} className="input" type="text" inputMode="url"
                placeholder={i === 0 ? "https://yourbrand.com" : "https://yourbrand.com/product/..."}
                value={urls[i]} onChange={(e) => setUrls(urls.map((u, j) => (j === i ? e.target.value : u)))} />
            </div>
          ))}
        </fieldset>

        <div className="card p-5">
          <label className="label" htmlFor="doc">Positioning doc</label>
          <p className="hint mb-2">
            Markdown preferred. Paste your positioning, messaging or ICP document. Together with the URLs above, this is
            the only source used to describe how the brand sees itself.
          </p>
          <textarea id="doc" className="input min-h-72 font-mono" value={doc} onChange={(e) => setDoc(e.target.value)}
            placeholder={"# Positioning\n\n## Who we're for\n...\n\n## What we do\n...\n\n## Why us\n..."} />
          <div className="hint mt-1 text-right">{doc.length.toLocaleString()} characters</div>
        </div>

        <div className="card p-5">
          <label className="label" htmlFor="brand">Brand name <span className="font-normal text-muted">(optional)</span></label>
          <p className="hint mb-2">Leave blank to detect it from your material. Set it if the detected name would be wrong or ambiguous.</p>
          <input id="brand" className="input max-w-sm" value={brandHint} onChange={(e) => setBrandHint(e.target.value)} placeholder="Detected automatically" />
        </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="btn btn-primary px-5 py-2.5" type="submit">Run audit</button>
          <span className="hint">
            Questions, models and API keys are in <Link href="/settings" className="underline">Settings</Link>.
          </span>
        </div>
      </form>

      <aside>
        <div className="eyebrow">Past audits (this browser)</div>
        {history.length === 0 && <p className="mt-2 text-sm text-muted">None yet.</p>}
        <ul className="mt-2 space-y-2">
          {history.map((r) => (
            <li key={r.id} className="card flex items-center justify-between gap-2 p-3 text-sm">
              <button className="min-w-0 text-left" onClick={() => setReport(r)}>
                <div className="truncate font-medium">{r.brandName}</div>
                <div className="hint">{new Date(r.createdAt).toLocaleDateString()} · {r.gapReport?.gaps.length ?? 0} gaps{r.claims?.length ? ` · claims ${claimScore(r.claims).pct ?? "–"}%` : ""}</div>
              </button>
              <button className="text-muted hover:text-high" aria-label={`Delete audit of ${r.brandName}`}
                onClick={() => { if (confirm(`Delete the audit of ${r.brandName}?`)) { deleteReport(r.id); setHistory(loadReports()); } }}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
