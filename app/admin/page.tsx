"use client";

import { useCallback, useEffect, useState } from "react";
import Guard from "@/components/Guard";
import { api } from "@/lib/client";
import { useAuth } from "@/lib/auth";
import type { Lead, Role, TeamMember } from "@/lib/types";

function useGuarded() {
  const [error, setError] = useState("");
  const run = useCallback(async (action: () => Promise<void>) => {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  return { error, run };
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

function Leads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const { error, run } = useGuarded();
  const load = useCallback(() => run(async () => setLeads((await api<{ leads: Lead[] }>("/api/leads")).leads)), [run]);
  useEffect(() => { load(); }, [load]);

  const download = () => {
    const rows = [["Date", "Email", "Website", "Brand name", "URLs", "Claims", "Positioning doc"],
      ...(leads ?? []).map((l) => [l.created_at, l.email ?? "", l.domain, l.brand_hint, l.urls.join(" "), l.claims.join(" | "), l.positioning_doc])];
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Every audit started by a visitor who was not logged in, with what they entered. Team audits are not listed here.
        </p>
        <button className="btn" disabled={!leads?.length} onClick={download}>Download CSV</button>
      </div>
      {error && <div className="mt-4 rounded-lg border border-high p-3 text-sm text-high">{error}</div>}
      {leads === null && !error && <p className="mt-4 text-sm text-muted">Loading…</p>}
      {leads?.length === 0 && <p className="mt-4 text-sm text-muted">No visitor audits yet.</p>}
      <ul className="mt-4 space-y-2">
        {leads?.map((l) => (
          <li key={l.id} className="card text-sm">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 p-3">
                <span className="font-medium">{l.domain}</span>
                <span className={l.email ? "" : "text-muted"}>{l.email ?? "No email given"}</span>
                <span className="hint ml-auto">{new Date(l.created_at).toLocaleString()}</span>
              </summary>
              <div className="space-y-3 border-t border-line p-3">
                {l.brand_hint && <div><div className="eyebrow">Brand name</div><p className="mt-1">{l.brand_hint}</p></div>}
                <div>
                  <div className="eyebrow">URLs</div>
                  <ul className="mt-1 space-y-0.5">{l.urls.map((u, i) => <li key={i} className="[overflow-wrap:anywhere]">{u}</li>)}</ul>
                </div>
                {l.claims.length > 0 && (
                  <div><div className="eyebrow">Claims to check</div><ul className="mt-1 list-disc space-y-0.5 pl-4">{l.claims.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
                )}
                <div>
                  <div className="eyebrow">Positioning doc</div>
                  {l.positioning_doc
                    ? <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-xs">{l.positioning_doc}</pre>
                    : <p className="mt-1 text-muted">None provided</p>}
                </div>
                <button className="btn" onClick={() => { if (confirm(`Delete this record for ${l.domain}?`)) run(async () => { await api(`/api/leads?id=${l.id}`, undefined, "DELETE"); await load(); }); }}>
                  Delete record
                </button>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Team() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("team");
  const [done, setDone] = useState("");
  const { error, run } = useGuarded();
  useEffect(() => { run(async () => setMembers((await api<{ members: TeamMember[] }>("/api/team")).members)); }, [run]);

  return (
    <div className="space-y-6">
      <form className="card space-y-3 p-5"
        onSubmit={(e) => { e.preventDefault(); setDone(""); run(async () => {
          setMembers((await api<{ members: TeamMember[] }>("/api/team", { email, password, role })).members);
          setDone(`${email} can now log in with that password. Send it to them; they can change it after logging in.`);
          setEmail(""); setPassword("");
        }); }}>
        <h2 className="font-semibold">Add a team member</h2>
        <p className="hint">Nobody can sign themselves up. An account exists only once you add it here.</p>
        <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
          <div><label className="label" htmlFor="m-email">Email</label>
            <input id="m-email" className="input" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label" htmlFor="m-password">Temporary password</label>
            <input id="m-password" className="input font-mono" type="text" required minLength={8} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div><label className="label" htmlFor="m-role">Role</label>
            <select id="m-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="team">Team</option><option value="admin">Admin</option>
            </select></div>
        </div>
        <button className="btn btn-primary">Add member</button>
        {done && <p className="text-sm text-chatgpt">{done}</p>}
      </form>
      {error && <div className="rounded-lg border border-high p-3 text-sm text-high">{error}</div>}
      <ul className="space-y-2">
        {members?.map((m) => (
          <li key={m.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{m.email}{m.id === user?.id && <span className="font-normal text-muted"> (you)</span>}</span>
            <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{m.role === "admin" ? "Admin" : "Team"}</span>
            <button className="btn py-1.5" onClick={() => {
              const next = prompt(`New password for ${m.email} (at least 8 characters)`);
              if (next) { setDone(""); run(async () => { await api("/api/team", { id: m.id, password: next }, "PATCH"); setDone(`Password changed for ${m.email}.`); }); }
            }}>Set password</button>
            {m.id !== user?.id && (
              <button className="btn py-1.5" onClick={() => {
                if (confirm(`Remove ${m.email}? They will no longer be able to log in. Reports they saved are kept.`)) run(async () => setMembers((await api<{ members: TeamMember[] }>(`/api/team?id=${m.id}`, undefined, "DELETE")).members));
              }}>Remove</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Admin() {
  const [tab, setTab] = useState<"leads" | "team">("leads");
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <div role="tablist" className="mt-4 flex gap-1 border-b border-line">
        {([["leads", "Visitor audits"], ["team", "Team"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">{tab === "leads" ? <Leads /> : <Team />}</div>
    </div>
  );
}

export default function AdminPage() {
  return <Guard admin><Admin /></Guard>;
}
