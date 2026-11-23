"use client";

import { useEffect, useState } from "react";

// The picture beside the homepage headline: a product-led SaaS brand's own positioning set
// against what Claude says about it, revealed row by row with the differences marked.
// The brand and every line are invented for illustration, so it is hidden from screen readers.

type Part = string | { mark: string };
interface Row { topic: string; brand: Part[]; claude: Part[]; match: boolean }

const ROWS: Row[] = [
  { topic: "What it is", brand: ["Product analytics for ", { mark: "self-serve SaaS" }], claude: ["A ", { mark: "general web analytics" }, " tool"], match: false },
  { topic: "Who it's for", brand: [{ mark: "Product and growth teams" }, " at PLG companies"], claude: [{ mark: "Enterprise marketing" }, " departments"], match: false },
  { topic: "Pricing", brand: [{ mark: "Free plan" }, ", then pay as you grow"], claude: [{ mark: "No free tier" }, "; contact sales for a quote"], match: false },
  { topic: "Getting started", brand: ["Sign up and see data in five minutes"], claude: ["Self-serve signup, live within minutes"], match: true },
  { topic: "Best known for", brand: [{ mark: "Activation and free-to-paid" }, " funnels"], claude: [{ mark: "Page-view dashboards" }, " and traffic reports"], match: false },
];

// Each row takes three beats: the brand's line, then Claude's, then the verdict.
const BEAT_MS = 520;
const BEATS_PER_ROW = 3;
const END = ROWS.length * BEATS_PER_ROW;
const HOLD_BEATS = 9;

function Line({ parts, lit, tone }: { parts: Part[]; lit: boolean; tone: "brand" | "claude" }) {
  const on = tone === "brand" ? "bg-accent/20 text-accent" : "bg-high/20 text-high";
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? p : (
          <mark key={i} className={`rounded-sm px-0.5 transition-colors duration-500 ${lit ? on : "bg-transparent text-inherit"}`}>{p.mark}</mark>
        ),
      )}
    </>
  );
}

export default function BrandVsClaude() {
  // Starts complete, so the picture is whole before scripts run and for anyone who prefers no motion.
  const [beat, setBeat] = useState(END);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setBeat(0);
    const timer = setInterval(() => setBeat((b) => (b >= END + HOLD_BEATS ? 0 : b + 1)), BEAT_MS);
    return () => clearInterval(timer);
  }, []);

  const differing = ROWS.filter((r, i) => !r.match && beat >= i * BEATS_PER_ROW + 2).length;
  const done = beat >= END;

  return (
    <div aria-hidden="true" className="card min-w-0 select-none overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <div className="eyebrow">Example · PLG SaaS</div>
          <div className="mt-1 font-display text-lg">Acme Analytics</div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-500 ${differing ? "border-high text-high" : "border-line-strong text-muted"}`}>
          {differing} of {ROWS.length} differ
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 border-b border-line bg-bg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] sm:px-5">
        <span className="text-accent">Your site says</span>
        <span className="flex items-center gap-1.5 text-claude"><i className="h-1.5 w-1.5 rounded-full bg-claude" />Claude says</span>
      </div>

      <ul>
        {ROWS.map((r, i) => {
          const start = i * BEATS_PER_ROW;
          const shown = beat >= start;
          const answered = beat >= start + 1;
          const judged = beat >= start + 2;
          return (
            <li key={r.topic} className={`border-b border-line px-4 py-3 transition-opacity duration-500 last:border-0 sm:px-5 ${shown ? "opacity-100" : "opacity-0"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted">{r.topic}</span>
                <span className={`rounded-full border px-2 py-px text-[10px] font-semibold transition-opacity duration-300 ${judged ? "opacity-100" : "opacity-0"} ${r.match ? "border-chatgpt text-chatgpt" : "border-high text-high"}`}>
                  {r.match ? "Matches" : "Differs"}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 text-[13px] leading-5">
                <p><Line parts={r.brand} lit={judged && !r.match} tone="brand" /></p>
                <p className={`transition-all duration-500 ${answered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
                  <Line parts={r.claude} lit={judged && !r.match} tone="claude" />
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className={`border-t border-line bg-bg px-4 py-3 text-xs transition-opacity duration-500 sm:px-5 ${done ? "opacity-100" : "opacity-0"}`}>
        <span className="text-ink">A buyer asking Claude would hear about a different product.</span>{" "}
        <span className="text-muted">The audit shows each gap and how to close it.</span>
      </div>
    </div>
  );
}
