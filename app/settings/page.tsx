"use client";

import { useEffect, useState } from "react";
import { fetchModels, getConfig, loadSettings, saveSettings } from "@/lib/client";
import type { ServerConfig } from "@/lib/client";
import { DEFAULT_FIXED_QUESTIONS, DEFAULT_SETTINGS, ENV_VAR } from "@/lib/defaults";
import type { KeyName, Settings } from "@/lib/types";

const ROWS: { name: KeyName; label: string; role: string }[] = [
  { name: "chatgpt", label: "ChatGPT (OpenAI)", role: "Audited model" },
  { name: "claude", label: "Claude (Anthropic)", role: "Audited model" },
  { name: "gemini", label: "Gemini (Google)", role: "Audited model" },
  { name: "deepinfra", label: "DeepInfra", role: "Generates follow-up questions and writes the report" },
];

type Test = { state: "idle" | "busy" | "ok" | "fail"; message?: string; models?: string[] };

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [tests, setTests] = useState<Partial<Record<KeyName, Test>>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setS(loadSettings());
    getConfig().then(setConfig).catch(() => {});
  }, []);

  if (!s) return null;

  // Every edit is saved straight away; there is no separate save step to forget.
  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };
  const setQuestion = (i: number, v: string) => update({ fixedQuestions: s.fixedQuestions.map((q, j) => (j === i ? v : q)) });

  async function test(name: KeyName) {
    setTests((t) => ({ ...t, [name]: { state: "busy" } }));
    try {
      const models = await fetchModels(name, s!);
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

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">Saved automatically in this browser.</p>
        </div>
        <span className={`text-sm text-chatgpt transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Saved</span>
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
          Keys set as environment variables on the server are used by default. A key entered here is stored in this
          browser only and overrides the server&apos;s for your audits.
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
                    <input id={`key-${name}`} className="input font-mono" type="password" autoComplete="off" value={s.keys[name]}
                      placeholder={config?.serverKeys[name] ? `Using server's ${ENV_VAR[name]}` : `Not set on server (${ENV_VAR[name]})`}
                      onChange={(e) => update({ keys: { ...s.keys, [name]: e.target.value.trim() } })} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button className="btn" disabled={t?.state === "busy"} onClick={() => test(name)}>
                    {t?.state === "busy" ? "Checking…" : "Test key and load models"}
                  </button>
                  {t?.message && <span className={`text-sm ${t.state === "ok" ? "text-chatgpt" : "text-high"}`}>{t.message}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {config?.passwordRequired && (
        <section className="card p-5">
          <h2 className="font-semibold">App password</h2>
          <p className="hint mt-1">This deployment requires a password (the server&apos;s APP_PASSWORD) to run audits.</p>
          <input className="input mt-3 max-w-sm" type="password" autoComplete="off" value={s.appPassword}
            onChange={(e) => update({ appPassword: e.target.value })} aria-label="App password" />
        </section>
      )}
    </div>
  );
}
