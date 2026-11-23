// A drawn sample of the finished report, used as the picture beside the homepage headline.
// It is decoration, not data: the brand and numbers are invented and hidden from screen readers.

const BADGE = {
  high: "border-chatgpt text-chatgpt",
  medium: "border-medium text-medium",
  low: "border-high text-high",
};
const LABEL = { high: "High", medium: "Medium", low: "Low" };
type Level = keyof typeof BADGE;

const ROWS: [string, Level, Level, Level][] = [
  ["What is Acme?", "high", "high", "medium"],
  ["Who is it best for?", "medium", "low", "high"],
  ["Main features?", "high", "medium", "medium"],
  ["Advantages over competitors?", "low", "low", "medium"],
];

function Pill({ level }: { level: Level }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE[level]}`}>{LABEL[level]}</span>;
}

export default function ReportPreview() {
  return (
    <div aria-hidden="true" className="relative min-w-0 select-none">
      <div className="absolute inset-0 -z-10 rounded-[2rem] bg-accent/10 blur-3xl sm:-inset-6" />
      <div className="card p-5 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">LLM positioning audit</div>
            <div className="mt-1 font-display text-2xl">Acme</div>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl">67%</div>
            <div className="hint">claims confirmed</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-line">
          <div className="grid grid-cols-[1fr_repeat(3,4.25rem)] items-center gap-2 border-b border-line bg-bg px-3 py-2 text-[11px] text-muted">
            <span>Question</span>
            <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-chatgpt" />ChatGPT</span>
            <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-claude" />Claude</span>
            <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-gemini" />Gemini</span>
          </div>
          {ROWS.map(([q, a, b, c]) => (
            <div key={q} className="grid grid-cols-[1fr_repeat(3,4.25rem)] items-center gap-2 border-b border-line px-3 py-2 text-xs last:border-0">
              <span className="truncate">{q}</span>
              <Pill level={a} /><Pill level={b} /><Pill level={c} />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-md bg-bg p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-high px-2 py-0.5 text-[10px] font-semibold uppercase text-high">High</span>
            <span className="text-xs font-medium">Who the product is for</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] leading-4">
            <div><div className="eyebrow !text-[9px]">The brand says</div><p className="mt-1 text-body">Built for in-house finance teams of 5 to 50.</p></div>
            <div><div className="eyebrow !text-[9px]">Claude says</div><p className="mt-1 text-body">Best suited to freelancers and solo founders.</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
