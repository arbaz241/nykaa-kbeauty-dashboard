"use client";

import { useMemo, useState } from "react";
import { useDetail } from "./Detail";
import { norm } from "@/lib/brands";
import { GLOSSARY, def, type MetricKey } from "@/lib/glossary";
import { GROUP_LABEL, type Tiers, type TierGroup } from "@/lib/tiers";

/** Shared Round 3 pieces: the brand chooser (pinned, focus, search), basis captions, metric terms and the
 *  definitions panel. Built once, used on every tab. */

/** "Seen from" chooser: the pinned brand, the focus set in its groups, and a search box for every other brand.
 *  Never a long list. */
export function BrandSelect({ value, onChange, tiers, all, label = "Seen from" }: {
  value: string; onChange: (b: string) => void; tiers: Tiers; all: string[]; label?: string;
}) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  const others = useMemo(() => {
    const k = norm(q); if (!k) return [];
    return all.filter((b) => !tiers.inSet(b) && norm(b).includes(k)).slice(0, 8);
  }, [q, all, tiers]);
  const pick = (b: string) => { onChange(b); setOpen(false); setQ(""); };
  const groups = (["korean", "indian", "global"] as TierGroup[]).map((g) => ({ g, brands: tiers.focus.filter((b) => tiers.group(b) === g) })).filter((x) => x.brands.length);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-[13.5px] ring-1 ring-line hover:ring-line-2">
        <span className="text-muted">{label}</span><b className="font-semibold">{value}</b>
        {!tiers.inSet(value) && <span className="rounded bg-sunken px-1.5 text-[10.5px] font-semibold uppercase text-muted">scorecard</span>}
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[300px] rounded-2xl bg-surface p-3 shadow-pop ring-1 ring-line">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to find any brand"
            className="w-full rounded-xl border border-line bg-page px-3 py-2 text-[13px] outline-none focus:border-accent-strong" />
          {q ? (
            <div className="mt-2 max-h-[300px] overflow-y-auto">
              {[...tiers.focus, tiers.pinned].filter((b) => norm(b).includes(norm(q))).concat(others).map((b) => <Opt key={b} b={b} on={b === value} onPick={pick} tag={tiers.inSet(b) ? undefined : "scorecard depth"} />)}
              {!others.length && ![...tiers.focus, tiers.pinned].some((b) => norm(b).includes(norm(q))) && <p className="px-2 py-2 text-[12.5px] text-muted">No brand on today&rsquo;s shelves matches.</p>}
            </div>
          ) : (
            <div className="mt-2 max-h-[340px] overflow-y-auto">
              <Opt b={tiers.pinned} on={tiers.pinned === value} onPick={pick} tag="pinned" />
              {groups.map(({ g, brands }) => (
                <div key={g} className="mt-2">
                  <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Focus · {GROUP_LABEL[g]}</div>
                  {brands.map((b) => <Opt key={b} b={b} on={b === value} onPick={pick} />)}
                </div>
              ))}
              <p className="mt-2 px-2 text-[11.5px] text-muted">Other brands: type above. They get a lighter scorecard; sections without data say so.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Opt({ b, on, onPick, tag }: { b: string; on: boolean; onPick: (b: string) => void; tag?: string }) {
  return (
    <button onClick={() => onPick(b)} className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-sunken ${on ? "bg-sunken font-semibold" : ""}`}>
      <span>{b}</span>{tag && <span className="text-[11px] text-muted">{tag}</span>}
    </button>
  );
}

/** Pinned + focus list with a search box for everyone else. `rows` must already be sorted the way to show them. */
export function TieredList<T>({ rows, brandOf, tiers, render, top, noun = "brands" }: {
  rows: T[]; brandOf: (r: T) => string; tiers: Tiers; render: (r: T, i: number) => React.ReactNode; top?: number; noun?: string;
}) {
  const [q, setQ] = useState(""); const [more, setMore] = useState(false);
  const inSet = rows.filter((r) => tiers.inSet(brandOf(r)));
  const rest = rows.filter((r) => !tiers.inSet(brandOf(r)));
  const shown = top && !more ? inSet.slice(0, top) : inSet;
  const found = q ? rest.filter((r) => norm(brandOf(r)).includes(norm(q))).slice(0, 10) : [];
  return (
    <>
      {shown.map(render)}
      {found.map((r, i) => render(r, shown.length + i))}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        {top && inSet.length > top && <button onClick={() => setMore(!more)} className="text-[12px] font-medium text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">{more ? "Fewer focus brands" : `All ${inSet.length} focus brands`}</button>}
        {rest.length > 0 && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find one of ${rest.length} other ${noun}`}
            className="w-56 rounded-full border border-line bg-page px-3 py-1 text-[12.5px] outline-none focus:border-accent-strong" />
        )}
        {q && !found.length && <span className="text-[12px] text-muted">No match</span>}
      </div>
    </>
  );
}

/** What a number is compared against and computed from, right under it. */
export function Basis({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11.5px] leading-snug text-muted ${className}`}>{children}</div>;
}

/** A metric name with its glossary definition on hover. */
export function Def({ k, children }: { k: MetricKey; children?: React.ReactNode }) {
  return <span title={def(k)} className="cursor-help underline decoration-line-2 decoration-dotted underline-offset-2">{children ?? GLOSSARY[k].name}</span>;
}

/** Opens every metric definition in the side panel. */
export function DefinitionsButton({ className = "" }: { className?: string }) {
  const open = useDetail();
  return (
    <button onClick={() => open({ kicker: "Definitions", title: "How every measure is calculated", body: (
      <div className="space-y-5">
        {Object.values(GLOSSARY).map((m) => (
          <div key={m.name}>
            <div className="text-[14px] font-semibold">{m.name}</div>
            <p className="mt-0.5 text-ink-2">{m.plain}</p>
            <dl className="mt-1.5 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-[12.5px]">
              <dt className="text-muted">Formula</dt><dd>{m.formula}</dd>
              <dt className="text-muted">Source</dt><dd>{m.source}</dd>
              <dt className="text-muted">Window</dt><dd>{m.window}</dd>
            </dl>
          </div>
        ))}
      </div>
    ) })} className={className}>Definitions</button>
  );
}
