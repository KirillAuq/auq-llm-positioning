"use client";

import { useCallback, useEffect, useState } from "react";
import Guard from "@/components/Guard";
import ReportView from "@/components/ReportView";
import { api } from "@/lib/client";
import type { Client, Report, ReportSummary } from "@/lib/types";

const ALL = "all";
const NONE = "none";

function Reports() {
  const [clients, setClients] = useState<Client[]>([]);
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [filter, setFilter] = useState(ALL);
  const [open, setOpen] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  const guard = useCallback(async (action: () => Promise<void>) => {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const load = useCallback(() => guard(async () => {
    const [c, r] = await Promise.all([api<{ clients: Client[] }>("/api/clients"), api<{ reports: ReportSummary[] }>("/api/reports")]);
    setClients(c.clients);
    setReports(r.reports);
  }), [guard]);

  const view = useCallback((id: string) => guard(async () => {
    setOpen((await api<{ report: Report }>(`/api/reports?id=${id}`)).report);
    window.scrollTo(0, 0);
  }), [guard]);

  useEffect(() => {
    load();
    // A link from the audit page can ask for one report to be opened straight away.
    const id = new URLSearchParams(window.location.search).get("open");
    if (id) view(id);
  }, [load, view]);

  if (open) return <ReportView report={open} closeLabel="Back to reports" onClose={() => { setOpen(null); window.history.replaceState(null, "", "/reports"); }} />;

  const count = (id: string | null) => (reports ?? []).filter((r) => r.client_id === id).length;
  const shown = (reports ?? []).filter((r) => filter === ALL || (filter === NONE ? !r.client_id : r.client_id === filter));
  const selected = clients.find((c) => c.id === filter);
  const tab = (id: string, label: string, n: number) => (
    <button key={id} onClick={() => setFilter(id)}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${filter === id ? "bg-surface font-medium ring-1 ring-line" : "text-muted hover:text-ink"}`}>
      <span className="truncate">{label}</span><span className="hint">{n}</span>
    </button>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside>
        <div className="eyebrow mb-2">Clients</div>
        <div className="space-y-1">
          {tab(ALL, "All reports", reports?.length ?? 0)}
          {clients.map((c) => tab(c.id, c.name, count(c.id)))}
          {tab(NONE, "No client", count(null))}
        </div>
        <form className="mt-4 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); guard(async () => { setClients((await api<{ clients: Client[] }>("/api/clients", { name: newName })).clients); setNewName(""); }); }}>
          <input className="input" aria-label="New client name" placeholder="New client" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn" disabled={!newName.trim()}>Add</button>
        </form>
      </aside>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{selected?.name ?? (filter === NONE ? "No client" : "All reports")}</h1>
          {selected && (
            <div className="flex gap-2">
              <button className="btn" onClick={() => {
                const name = prompt("Rename client", selected.name);
                if (name?.trim()) guard(async () => setClients((await api<{ clients: Client[] }>("/api/clients", { id: selected.id, name }, "PATCH")).clients));
              }}>Rename</button>
              <button className="btn" onClick={() => {
                if (!confirm(`Delete the client "${selected.name}"? Its reports are kept and become unassigned.`)) return;
                guard(async () => { await api(`/api/clients?id=${selected.id}`, undefined, "DELETE"); setFilter(ALL); await load(); });
              }}>Delete client</button>
            </div>
          )}
        </div>
        {error && <div className="mt-4 rounded-lg border border-high p-3 text-sm text-high">{error}</div>}
        {reports === null && !error && <p className="mt-4 text-sm text-muted">Loading…</p>}
        {reports !== null && shown.length === 0 && <p className="mt-4 text-sm text-muted">No reports here yet. Run an audit and it will be saved automatically.</p>}
        <ul className="mt-4 space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-sm">
              <button className="min-w-0 flex-1 text-left" onClick={() => view(r.id)}>
                <div className="truncate font-medium">{r.brand_name} <span className="font-normal text-muted">· {r.domain}</span></div>
                <div className="hint">
                  {new Date(r.created_at).toLocaleDateString()} · {r.summary?.gaps ?? 0} gaps
                  {r.summary?.claimsPct != null && ` · claims ${r.summary.claimsPct}%`}
                  {r.created_by_email && ` · ${r.created_by_email}`}
                </div>
              </button>
              <select className="input w-auto max-w-[12rem] py-1.5" aria-label={`Client for ${r.brand_name}`} value={r.client_id ?? ""}
                onChange={(e) => guard(async () => { await api(`/api/reports?id=${r.id}`, { clientId: e.target.value || null }, "PATCH"); await load(); })}>
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="text-muted hover:text-high" aria-label={`Delete the report for ${r.brand_name}`}
                onClick={() => { if (confirm(`Delete the report for ${r.brand_name}? This can't be undone.`)) guard(async () => { await api(`/api/reports?id=${r.id}`, undefined, "DELETE"); await load(); }); }}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return <Guard><Reports /></Guard>;
}
