"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReportView from "@/components/ReportView";
import VisitorHome from "@/components/VisitorHome";
import type { Visitor } from "@/components/VisitorHome";
import { api, claimScore, deleteReport, loadReports, parseClaims, runAudit, saveReport, STEPS } from "@/lib/client";
import { useAuth } from "@/lib/auth";
import type { AuditInput, Progress } from "@/lib/client";
import { MAX_CLAIMS, MAX_URLS } from "@/lib/defaults";
import type { Client, Report, ReportSummary } from "@/lib/types";

const NEW_CLIENT = "__new__";

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
  const { ready, enabled, user } = useAuth();
  // Whether the audit in progress includes a claims check, so the progress list shows that step.
  const [hasClaims, setHasClaims] = useState(false);
  // Team: which client the report is filed under.
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const [recent, setRecent] = useState<ReportSummary[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => setHistory(loadReports()), [report]);
  useEffect(() => {
    if (!user) return;
    api<{ clients: Client[] }>("/api/clients").then((r) => setClients(r.clients)).catch(() => {});
    api<{ reports: ReportSummary[] }>("/api/reports").then((r) => setRecent(r.reports.slice(0, 8))).catch(() => {});
  }, [user, report]);

  const running = progress !== null;

  // Leaving mid-audit throws the work away, so the browser asks before closing or reloading.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  /** Runs an audit. `visitor` is set for someone not logged in, whose request is recorded for the admin. */
  async function start(input: AuditInput, visitor?: Visitor) {
    setError("");
    setNotice("");
    setHasClaims(input.claims.length > 0);
    setProgress({ step: "scrape", detail: "", done: 0, total: 1 });
    window.scrollTo(0, 0);
    try {
      if (visitor) {
        // Recorded before the audit starts, so it is kept even if they leave midway. A rejected
        // entry (a bad email) stops here; a recording failure on our side does not cost them the audit.
        try {
          await api("/api/leads", { ...input, llmsTxt: input.llmsTxtGiven ? input.llmsTxt : "", ...visitor });
        } catch (err) {
          if ((err as { status?: number }).status === 400) throw err;
        }
      }
      const result = await runAudit(input, setProgress);
      if (user) {
        // The report is shown either way; a failed save is said plainly rather than losing the audit.
        try {
          let id = clientId;
          if (id === NEW_CLIENT) {
            id = (await api<{ client: Client }>("/api/clients", { name: newClient })).client.id;
            setClientId(id);
            setNewClient("");
          }
          await api("/api/reports", { report: result, clientId: id || null });
        } catch (err) {
          saveReport(result);
          setNotice(`This report could not be saved to the team's reports (${err instanceof Error ? err.message : err}). It is kept in this browser instead.`);
        }
      } else {
        saveReport(result);
      }
      setReport(result);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!urls[0].trim()) {
      setTab("positioning");
      setError("Add the brand URL before running the audit.");
      return;
    }
    if (clientId === NEW_CLIENT && !newClient.trim()) {
      setError("Name the new client, or pick an existing one.");
      return;
    }
    start({ urls: urls.map((u) => u.trim()).filter(Boolean), positioningDoc: doc, brandHint, claims });
  }

  if (report) {
    return (
      <>
        {notice && <div className="no-print mb-6 rounded-lg border border-medium p-3 text-sm text-medium">{notice}</div>}
        <ReportView report={report} onClose={() => { setReport(null); setNotice(""); }} />
      </>
    );
  }

  if (running) {
    const steps = STEPS.filter((s) => s.id !== "claims" || hasClaims);
    const at = steps.findIndex((s) => s.id === progress.step);
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="display-md">Running your audit</h1>
        <div role="status" className="mt-4 flex items-start gap-3 rounded-lg border border-cta bg-cta/10 p-4">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-cta" />
          <div>
            <div className="font-display font-medium">Don&apos;t close this window</div>
            <p className="mt-1 text-sm text-body">
              The audit runs in this tab and usually takes a few minutes. If you close or reload it, the audit stops and
              you&apos;ll have to start again. Your report appears here as soon as it&apos;s ready.
            </p>
          </div>
        </div>
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

  // Until we know whether someone is logged in, show nothing, so the two homepages don't flash past each other.
  if (!ready) return null;

  if (!user) {
    return (
      <div className="space-y-12">
        <VisitorHome onRun={start} error={error} recordsNotice={enabled} />
        {history.length > 0 && (
          <section>
            <div className="eyebrow text-muted">Your past audits (this browser)</div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {history.map((r) => (
                <li key={r.id} className="card flex items-center justify-between gap-2 p-3 text-sm">
                  <button className="min-w-0 text-left" onClick={() => { setReport(r); window.scrollTo(0, 0); }}>
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
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <form onSubmit={submit} className="space-y-6">
        <div>
          <h1 className="display-lg max-w-2xl">Find the gap between your positioning and <span className="highlight">what LLMs say</span></h1>
          <p className="mt-4 max-w-2xl text-base text-body">
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

        {(
          <div className="card p-5">
            <label className="label" htmlFor="client">Client</label>
            <p className="hint mb-2">The report is saved to the team&apos;s reports under this client. You can move it later.</p>
            <div className="flex flex-wrap gap-2">
              <select id="client" className="input max-w-xs" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={NEW_CLIENT}>New client…</option>
              </select>
              {clientId === NEW_CLIENT && (
                <input className="input max-w-xs" aria-label="New client name" placeholder="Client name" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button className="btn btn-primary px-5 py-2.5" type="submit">Run audit</button>
          {user?.role === "admin" && (
            <span className="hint">
              Questions, models and API keys are in <Link href="/settings" className="underline">Settings</Link>.
            </span>
          )}
        </div>
      </form>

      <aside>
        <div className="flex items-baseline justify-between">
          <div className="eyebrow">Recent team reports</div>
          <Link href="/reports" className="hint underline">All reports</Link>
        </div>
        {recent.length === 0 && <p className="mt-2 text-sm text-muted">None yet.</p>}
        <ul className="mt-2 space-y-2">
          {recent.map((r) => (
            <li key={r.id}>
              <Link href={`/reports?open=${r.id}`} className="card block p-3 text-sm hover:border-muted">
                <div className="truncate font-medium">{r.brand_name}</div>
                <div className="hint">
                  {new Date(r.created_at).toLocaleDateString()} · {clients.find((c) => c.id === r.client_id)?.name ?? "No client"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
