"use client";

import { useEffect, useState } from "react";
import Guard from "@/components/Guard";
import { api } from "@/lib/client";
import { DEFAULT_FIXED_QUESTIONS, DEFAULT_SETTINGS, ENV_VAR } from "@/lib/defaults";
import type { KeyName, KeySource, Settings } from "@/lib/types";

const ROWS: { name: KeyName; label: string; role: string }[] = [
  { name: "chatgpt", label: "ChatGPT (OpenAI)", role: "Audited model" },
  { name: "claude", label: "Claude (Anthropic)", role: "Audited model" },
  { name: "gemini", label: "Gemini (Google)", role: "Audited model" },
  { name: "deepinfra", label: "DeepInfra", role: "Generates follow-up questions and writes the report" },
];

type Test = { state: "idle" | "busy" | "ok" | "fail"; message?: string; models?: string[] };
type Saved = { settings: Settings; keys: Record<KeyName, KeySource> };
const NO_KEYS: Record<KeyName, string> = { chatgpt: "", claude: "", gemini: "", deepinfra: "" };

function SettingsForm() {
  const [s, setS] = useState<Settings | null>(null);
  const [sources, setSources] = useState<Record<KeyName, KeySource> | null>(null);
  // Keys typed but not yet saved. A saved key is never sent back to the browser.
  const [typed, setTyped] = useState(NO_KEYS);
  const [removed, setRemoved] = useState<KeyName[]>([]);
  const [tests, setTests] = useState<Partial<Record<KeyName, Test>>>({});
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "fail" | "busy"; text: string } | null>(null);

  const apply = (r: Saved) => {
    setS(r.settings);
    setSources(r.keys);
    setTyped(NO_KEYS);
    setRemoved([]);
    setDirty(false);
  };

  useEffect(() => {
    api<Saved>("/api/settings").then(apply).catch((err) => setStatus({ kind: "fail", text: err instanceof Error ? err.message : String(err) }));
  }, []);

  if (!s || !sources) return status ? <p className="text-sm text-high">{status.text}</p> : null;

  const update = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setDirty(true);
    setStatus(null);
  };
  const setQuestion = (i: number, v: string) => update({ fixedQuestions: s.fixedQuestions.map((q, j) => (j === i ? v : q)) });

  async function save() {
    setStatus({ kind: "busy", text: "Saving…" });
    try {
      const keys: Partial<Record<KeyName, string | null>> = {};
      for (const { name } of ROWS) {
        if (typed[name].trim()) keys[name] = typed[name].trim();
        else if (removed.includes(name)) keys[name] = null;
      }
      apply(await api<Saved>("/api/settings", { settings: s, keys }, "PUT"));
      setStatus({ kind: "ok", text: "Saved. Every audit now uses these settings." });
    } catch (err) {
      setStatus({ kind: "fail", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function test(name: KeyName) {
    setTests((t) => ({ ...t, [name]: { state: "busy" } }));
    try {
      const { models } = await api<{ models: string[] }>("/api/models", { name, key: typed[name] });
      const found = models.includes(s!.models[name]);
      setTests((t) => ({
        ...t,
        [name]: {
          state: found ? "ok" : "fail",
          models,
          message: found
            ? `Key works and "${s!.models[name]}" is available.`
            : `Key works, but "${s!.models[name]}" is not in this account's model list. Pick one from the suggestions.`,
        },
      }));
    } catch (err) {
      setTests((t) => ({ ...t, [name]: { state: "fail", message: err instanceof Error ? err.message : String(err) } }));
    }
  }

  const keyHint = (name: KeyName) => {
    if (removed.includes(name)) return sourcesAfterRemoval(name);
    if (sources[name] === "saved") return "A key is saved. Type a new one to replace it.";
    if (sources[name] === "env") return `Using the server's ${ENV_VAR[name]}. Type a key to use that instead.`;
    return "No key yet. Audits skip this provider until one is added.";
  };
  const sourcesAfterRemoval = (name: KeyName) => `The saved key will be removed when you save. ${ENV_VAR[name]} on the server is used if it is set.`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-end justify-between gap-3 border-b border-line bg-bg px-4 py-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">These apply to every audit, for the team and for visitors.</p>
        </div>
        <div className="flex items-center gap-3">
          {status && <span className={`text-sm ${status.kind === "fail" ? "text-high" : status.kind === "ok" ? "text-chatgpt" : "text-muted"}`}>{status.text}</span>}
          {dirty && !status && <span className="text-sm text-medium">Unsaved changes</span>}
          <button className="btn btn-primary" disabled={!dirty || status?.kind === "busy"} onClick={save}>Save settings</button>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Fixed questions</h2>
        <p className="hint mt-1">Asked to every LLM on every audit. <code>[brand]</code> is replaced with the brand name.</p>
        <div className="mt-4 space-y-2">
          {s.fixedQuestions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" value={q} onChange={(e) => setQuestion(i, e.target.value)} aria-label={`Question ${i + 1}`} />
              <button className="btn" aria-label={`Remove question ${i + 1}`}
                onClick={() => update({ fixedQuestions: s.fixedQuestions.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn" onClick={() => update({ fixedQuestions: [...s.fixedQuestions, "[brand] "] })}>Add question</button>
          <button className="btn" onClick={() => update({ fixedQuestions: DEFAULT_FIXED_QUESTIONS })}>Reset to defaults</button>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Follow-up questions and how questions are asked</h2>
        <div>
          <label className="label" htmlFor="count">Auto-generated follow-up questions</label>
          <p className="hint mb-2">
            Written by the DeepInfra model after reading the LLMs&apos; answers to the fixed questions, to probe what they
            were vague or disagreed about. 0 turns them off.
          </p>
          <input id="count" type="number" min={0} max={12} className="input w-24" value={s.autoQuestionCount}
            onChange={(e) => update({ autoQuestionCount: Math.max(0, Math.min(12, Number(e.target.value) || 0)) })} />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={s.includeDomain} onChange={(e) => update({ includeDomain: e.target.checked })} />
          <span>
            <span className="font-medium">Add the domain to the brand name in questions</span>
            <span className="hint block">Asks &ldquo;What is Acme (acme.com)?&rdquo; so a common or shared name resolves to the right company.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={s.webSearch} onChange={(e) => update({ webSearch: e.target.checked })} />
          <span>
            <span className="font-medium">Let the LLMs search the web</span>
            <span className="hint block">
              On by default: closer to what people see in the consumer apps, though slower and more expensive, and
              answers will often repeat your own site. Turn it off to measure only what each model learned in training.
            </span>
          </span>
        </label>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Models and API keys</h2>
        <p className="hint mt-1">
          Keys saved here are used for everyone&apos;s audits and are kept on the server. They are never shown again, to you
          or to anyone else, and never reach a visitor&apos;s browser.
        </p>
        <div className="mt-4 space-y-6">
          {ROWS.map(({ name, label, role }) => {
            const t = tests[name];
            return (
              <div key={name} className="border-t border-line pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{label}</div>
                  <div className="hint">{role}</div>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`model-${name}`}>Model ID</label>
                    <input id={`model-${name}`} className="input font-mono" list={`models-${name}`} value={s.models[name]}
                      onChange={(e) => update({ models: { ...s.models, [name]: e.target.value.trim() } })} />
                    <datalist id={`models-${name}`}>{t?.models?.map((m) => <option key={m} value={m} />)}</datalist>
                    {s.models[name] !== DEFAULT_SETTINGS.models[name] && (
                      <button className="hint mt-1 underline" onClick={() => update({ models: { ...s.models, [name]: DEFAULT_SETTINGS.models[name] } })}>
                        Reset to {DEFAULT_SETTINGS.models[name]}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="label" htmlFor={`key-${name}`}>API key</label>
                    <input id={`key-${name}`} className="input font-mono" type="password" autoComplete="off" value={typed[name]}
                      placeholder={sources[name] === "saved" && !removed.includes(name) ? "••••••••  saved" : "Paste a key"}
                      onChange={(e) => { setTyped({ ...typed, [name]: e.target.value }); setDirty(true); setStatus(null); }} />
                    <p className="hint mt-1">
                      {keyHint(name)}{" "}
                      {sources[name] === "saved" && !removed.includes(name) && !typed[name] && (
                        <button className="underline" onClick={() => { setRemoved([...removed, name]); setDirty(true); setStatus(null); }}>Remove saved key</button>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button className="btn" disabled={t?.state === "busy"} onClick={() => test(name)}>
                    {t?.state === "busy" ? "Checking…" : typed[name] ? "Test this key and load models" : "Test key and load models"}
                  </button>
                  {t?.message && <span className={`text-sm ${t.state === "ok" ? "text-chatgpt" : "text-high"}`}>{t.message}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}

export default function SettingsPage() {
  return <Guard admin><SettingsForm /></Guard>;
}
