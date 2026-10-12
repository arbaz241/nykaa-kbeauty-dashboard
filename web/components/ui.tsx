/* Shared building blocks (redesign v2): pages compose these rather than hand-rolling a header, card or callout. */

export function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-[22px] font-semibold tracking-tight">{title}</h2>
      {note && <p className="max-w-[720px] text-[13px] text-muted">{note}</p>}
    </div>
  );
}

/** Full-width hero band at the top of a page: eyebrow, headline, one sentence, key controls on the right.
 *  Must be the first child inside <Shell> so it can span the page edge to edge. */
export function PageHead({ title, sub, right, eyebrow }: { title: string; sub: React.ReactNode; right?: React.ReactNode; eyebrow?: string }) {
  return (
    <section className="bleed border-b border-line bg-hero">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-end justify-between gap-x-10 gap-y-5 px-6 pb-8 pt-10 md:pb-10 md:pt-12">
        <div className="rise max-w-[860px]">
          {eyebrow && <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{eyebrow}</div>}
          <h1 className="font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.025em] md:text-[44px]">{title}</h1>
          <p className="mt-3 max-w-[760px] text-[15px] leading-relaxed text-ink-2">{sub}</p>
        </div>
        {right}
      </div>
    </section>
  );
}

/** The page's single most important conclusion: a forest-green band. Children (points, links) sit under the headline. */
export function Verdict({ eyebrow, children, points, foot }: { eyebrow: React.ReactNode; children: React.ReactNode; points?: React.ReactNode[]; foot?: React.ReactNode }) {
  return (
    <section className="rise rounded-[20px] bg-brand px-6 py-7 text-on-brand md:px-9 md:py-8">
      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>
      <p className="mt-3 max-w-[110ch] font-display text-[20px] font-medium leading-snug tracking-[-0.01em] md:text-[23px]">{children}</p>
      {!!points?.length && (
        <ul className="mt-4 max-w-[110ch] space-y-1.5 text-[14px] leading-snug text-on-brand-muted">
          {points.map((x, i) => <li key={i} className="flex gap-2.5"><span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span className="min-w-0">{x}</span></li>)}
        </ul>
      )}
      {foot && <div className="mt-5 border-t border-on-brand/15 pt-4 text-[14px] leading-snug">{foot}</div>}
    </section>
  );
}

export function Stat({ value, label, sub, tone }: { value: string; label: string; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="h-full rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={`mt-2 font-display text-[30px] font-semibold leading-none tracking-tight tabular ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      {sub && <div className="mt-2.5 text-[12.5px] leading-snug text-ink-2">{sub}</div>}
    </div>
  );
}

export function Insight({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] bg-surface px-5 py-4 text-[14px] leading-relaxed shadow-card ring-1 ring-line">{children}</div>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[16px] bg-surface shadow-card ring-1 ring-line ${className}`}>{children}</div>;
}

/** Pill toggle used for every filter (categories, keywords, heroes). Selected = forest green. */
export function pill(on: boolean, size: "sm" | "md" = "md") {
  const pad = size === "sm" ? "px-3 py-1 text-[12.5px]" : "px-3.5 py-1.5 text-[13px]";
  return `press rounded-full transition ${pad} ${on ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink hover:ring-line-2"}`;
}

/** Skeleton blocks instead of a bare "Loading…" line. */
export const Loading = ({ what }: { what: string }) => (
  <div className="mt-8" role="status" aria-live="polite">
    <div className="skeleton h-28 rounded-[20px]" />
    <div className="mt-3 grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-[16px]" />)}</div>
    <div className="mt-3 text-[13px] text-muted">Loading {what}…</div>
  </div>
);
