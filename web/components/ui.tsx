export function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-[20px] font-semibold tracking-tight">{title}</h2>
      {note && <p className="max-w-[720px] text-[12.5px] text-muted">{note}</p>}
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        <p className="mt-1.5 max-w-[720px] text-[15px] text-ink-2">{sub}</p>
      </div>
      {right}
    </div>
  );
}

export function Stat({ value, label, sub, tone }: { value: string; label: string; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-4 shadow-card ring-1 ring-line">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-[30px] font-semibold leading-none tracking-tight tabular ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      {sub && <div className="mt-2 text-[12.5px] leading-snug text-ink-2">{sub}</div>}
    </div>
  );
}

export function Insight({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-surface px-5 py-4 text-[14px] leading-relaxed shadow-card ring-1 ring-line">{children}</div>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface shadow-card ring-1 ring-line ${className}`}>{children}</div>;
}

export const Loading = ({ what }: { what: string }) => <div className="mt-10 text-[14px] text-muted">Loading {what}…</div>;
