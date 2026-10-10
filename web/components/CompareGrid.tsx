"use client";

import { Fragment } from "react";
import { TONE_CLASS, tone, type Criterion } from "@/lib/compete";

export interface GridCol { key: string; head: React.ReactNode; anchor?: boolean }
export interface ExtraRow<T> { label: string; help?: string; render: (x: T) => React.ReactNode; has?: (x: T) => boolean }

/** Criteria down the side, one column per brand or product. Each rival cell is shaded by how the anchor
 *  compares with it on that row (green: anchor ahead, red: anchor behind, grey: on par). */
export default function CompareGrid<T>({ cols, items, criteria, extra = [], groups }: {
  cols: GridCol[]; items: (T | null)[]; criteria: Criterion<T>[]; extra?: ExtraRow<T>[];
  /** optional section labels: criterion key -> heading shown above it */
  groups?: Record<string, string>;
}) {
  const ai = cols.findIndex((c) => c.anchor);
  const anchor = ai >= 0 ? items[ai] : null;
  const grid = { gridTemplateColumns: `150px repeat(${cols.length}, minmax(132px, 1fr))` };
  const live = items.filter((x): x is T => x !== null);
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card ring-1 ring-line">
      <div style={{ minWidth: 150 + cols.length * 140 }}>
        <div className="grid border-b border-line" style={grid}>
          <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            <span className="flex flex-wrap gap-1.5 normal-case tracking-normal">
              <Key cls={TONE_CLASS.ahead} t="ahead" /><Key cls={TONE_CLASS.behind} t="behind" /><Key cls={TONE_CLASS.par} t="par" />
            </span>
          </div>
          {cols.map((c) => <div key={c.key} className={`border-l border-line px-3 py-3 ${c.anchor ? "bg-page/70" : ""}`}>{c.head}</div>)}
        </div>
        {criteria.map((cr) => {
          const kind = cr.key.includes("rank") ? "rank" : "ratio";
          const a = anchor ? cr.value(anchor) : null;
          return (
            <Fragment key={cr.key}>
              {groups?.[cr.key] && <div className="border-b border-line bg-page/40 px-4 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{groups[cr.key]}</div>}
              <div className="grid items-center border-b border-line last:border-0" style={grid}>
                <div className="px-4 py-2.5 text-[12.5px] text-ink-2" title={cr.help}>{cr.label}</div>
                {items.map((x, i) => {
                  if (!x) return <div key={i} className="border-l border-line px-3 py-2.5 text-[12px] text-muted">—</div>;
                  const t = i === ai ? null : tone(a, cr.value(x), cr.better, kind);
                  const sub = cr.sub?.(x);
                  return (
                    <div key={i} className={`border-l border-line px-3 py-2 ${i === ai ? "bg-page/70" : ""}`}>
                      <span className={`inline-block rounded-md px-1.5 py-0.5 text-[13px] font-semibold tabular ${t ? TONE_CLASS[t] : ""}`}>{cr.show(x)}</span>
                      {sub && <div className="mt-0.5 text-[11px] leading-tight text-muted">{sub}</div>}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
        {extra.filter((r) => !r.has || live.some(r.has)).map((r) => (
          <div key={r.label} className="grid border-b border-line last:border-0" style={grid}>
            <div className="px-4 py-2.5 text-[12.5px] text-ink-2" title={r.help}>{r.label}</div>
            {items.map((x, i) => (
              <div key={i} className={`border-l border-line px-3 py-2.5 ${i === ai ? "bg-page/70" : ""}`}>
                {!x ? <span className="text-[12px] text-muted">—</span> : r.has && !r.has(x) ? <span className="text-[11.5px] text-muted">–</span> : r.render(x)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Key({ cls, t }: { cls: string; t: string }) {
  const word = t === "ahead" ? "Innisfree ahead" : t === "behind" ? "behind" : "on par";
  return <span className={`rounded px-1.5 py-px text-[10.5px] font-medium ${cls}`}>{word}</span>;
}

/** Small rounded tag. */
export function Chip({ children, tone: t, title }: { children: React.ReactNode; tone?: "good" | "bad" | "plain"; title?: string }) {
  const cls = t === "good" ? "bg-[#eaf6ee] text-good" : t === "bad" ? "bg-[#fbecea] text-bad" : t === "plain" ? "text-ink-2 ring-1 ring-line" : "bg-sunken text-ink-2";
  return <span title={title} className={`inline-block rounded-full px-2 py-0.5 text-[11.5px] leading-snug ${cls}`}>{children}</span>;
}
