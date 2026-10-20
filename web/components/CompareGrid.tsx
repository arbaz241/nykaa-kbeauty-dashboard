"use client";

import { Fragment, useEffect, useRef } from "react";
import { TONE_CLASS, tone, type Criterion } from "@/lib/compete";
import { Missing } from "./Detail";
import { tr } from "@/lib/i18n";

export interface GridCol { key: string; head: React.ReactNode; anchor?: boolean;
  /** one-line name for the header that stays in view while the table scrolls (defaults to `key`) */
  short?: React.ReactNode }
export interface GridGroup { label: string; title?: React.ReactNode; id?: string }
export interface ExtraRow<T> { label: React.ReactNode; help?: string; render: (x: T) => React.ReactNode; has?: (x: T) => boolean;
  /** why a cell has no value (shown instead of a dash) */
  missing?: (x: T) => string;
  /** place right after this criterion (by key) instead of at the end */
  after?: string; key?: string }

/** Criteria down the side, one column per brand or product. Each rival cell is shaded by how the anchor
 *  compares with it on that row (green: anchor ahead, red: anchor behind, grey: on par). */
export default function CompareGrid<T>({ cols, items, criteria, extra = [], groups, colors, labelWidth = 150 }: {
  cols: GridCol[]; items: (T | null)[]; criteria: Criterion<T>[]; extra?: ExtraRow<T>[];
  /** bar colour per column */
  colors?: string[]; labelWidth?: number;
  /** optional section labels: criterion key -> heading shown above it (with an optional headline and anchor) */
  groups?: Record<string, string | GridGroup>;
}) {
  const ai = cols.findIndex((c) => c.anchor);
  const anchor = ai >= 0 ? items[ai] : null;
  const grid = { gridTemplateColumns: `${labelWidth}px repeat(${cols.length}, minmax(150px, 1fr))` };
  const live = items.filter((x): x is T => x !== null);
  const extraRow = (r: ExtraRow<T>) => (
    <div key={String(r.key ?? r.label)} className="grid border-b border-line last:border-0" style={grid}>
      <div className="px-4 py-2.5 text-[12.5px] text-ink-2" title={r.help}>{r.label}</div>
      {items.map((x, i) => (
        <div key={i} className={`border-l border-line px-3 py-2.5 ${i === ai ? "bg-page/70" : ""}`}>
          {!x ? <Missing>{tr("Not available", "자료 없음")}</Missing> : r.has && !r.has(x) ? <Missing>{r.missing?.(x) ?? tr("No data collected", "수집된 데이터 없음")}</Missing> : r.render(x)}
        </div>
      ))}
    </div>
  );
  const shownExtra = extra.filter((r) => !r.has || live.some(r.has));
  // owner 20 Oct 2026: in a long table the brand or product names scroll away and the columns get lost. Once the header
  // row leaves the screen, a slim copy stays pinned under the page menu, following the table's sideways scroll.
  // It is moved by hand (no re-render), so scrolling stays smooth.
  const box = useRef<HTMLDivElement>(null); const head = useRef<HTMLDivElement>(null); const pin = useRef<HTMLDivElement>(null); const pinRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = box.current, h = head.current, f = pin.current, fr = pinRow.current; if (!b || !h || !f || !fr) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const bar = document.querySelector<HTMLElement>("header.sticky"); const nav = document.querySelector<HTMLElement>("nav[data-section-nav]");
      const top = Math.max(bar?.getBoundingClientRect().bottom ?? 0, nav && nav.getBoundingClientRect().top < 90 ? nav.getBoundingClientRect().bottom : 0);
      const r = b.getBoundingClientRect(); const hr = h.getBoundingClientRect();
      const on = hr.bottom < top && r.bottom > top + 60;
      f.style.display = on ? "block" : "none";
      if (on) { f.style.top = `${top}px`; f.style.left = `${r.left}px`; f.style.width = `${r.width}px`; fr.style.transform = `translateX(${-b.scrollLeft}px)`; }
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(place); };
    window.addEventListener("scroll", ask, { passive: true }); window.addEventListener("resize", ask); b.addEventListener("scroll", ask, { passive: true });
    place();
    return () => { window.removeEventListener("scroll", ask); window.removeEventListener("resize", ask); b.removeEventListener("scroll", ask); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={box} className="overflow-x-auto rounded-2xl bg-surface shadow-card ring-1 ring-line">
      <div ref={pin} aria-hidden className="fixed z-[19] hidden overflow-hidden rounded-b-xl border-b-2 border-ink/70 bg-surface/95 shadow-pop backdrop-blur-md">
        <div ref={pinRow} className="grid" style={{ ...grid, minWidth: labelWidth + cols.length * 158 }}>
          <div className="px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Columns", "열")}</div>
          {cols.map((c, i) => <div key={c.key} className={`truncate border-l border-line px-3 py-2 text-[12.5px] font-semibold ${c.anchor ? "bg-page/70" : ""}`}>
            {colors?.[i] && <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={{ background: colors[i] }} />}{c.short ?? c.key}</div>)}
        </div>
      </div>
      <div style={{ minWidth: labelWidth + cols.length * 158 }}>
        <div ref={head} className="grid border-b border-line" style={grid}>
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
          const vals = items.map((x) => (x ? cr.value(x) : null)).filter((v): v is number => v !== null);
          const top = cr.better && vals.length > 1 ? (cr.better === "high" ? Math.max(...vals) : Math.min(...vals)) : null;
          // LEAD only for a clear leader: not when several share the best value (e.g. everyone at 0)
          const best = top !== null && vals.filter((v) => v === top).length === 1 ? top : null;
          const max = vals.length ? Math.max(...vals.map(Math.abs)) : 0;
          return (
            <Fragment key={cr.key}>
              {groups?.[cr.key] && (() => { const g = groups[cr.key]; const G = typeof g === "string" ? { label: g } : g; return (
                <div id={G.id} className="scroll-mt-32 border-b border-line bg-page/40 px-4 pb-1.5 pt-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{G.label}</div>
                  {G.title && <div className="mt-0.5 max-w-[900px] text-[14px] font-medium leading-snug text-ink">{G.title}</div>}
                </div>); })()}
              <div className="grid items-center border-b border-line last:border-0" style={grid}>
                <div className="px-4 py-2.5 text-[12.5px] text-ink-2" title={cr.help}>{cr.label}</div>
                {items.map((x, i) => {
                  if (!x) return <div key={i} className="border-l border-line px-3 py-2.5"><Missing>{tr("Not available", "자료 없음")}</Missing></div>;
                  const v = cr.value(x);
                  const t = i === ai ? null : tone(a, v, cr.better, kind);
                  const sub = cr.sub?.(x);
                  const why = cr.missing?.(x);
                  if (why) return <div key={i} className={`border-l border-line px-3 py-2.5 ${i === ai ? "bg-page/70" : ""}`}><Missing>{why}</Missing></div>;
                  return (
                    <div key={i} className={`border-l border-line px-3 py-2 ${i === ai ? "bg-page/70" : ""}`}>
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[13px] font-semibold tabular ${t ? TONE_CLASS[t] : ""}`}>{cr.cell ? cr.cell(x) : cr.show(x)}</span>
                      {best !== null && v === best && <span className="ml-1.5 rounded-full bg-accent px-1.5 py-px align-middle text-[9.5px] font-semibold uppercase tracking-wide text-ink">{tr("lead", "선두")}</span>}
                      {sub && <div className="mt-0.5 text-[11px] leading-tight text-muted">{sub}</div>}
                      {cr.bar && v !== null && max > 0 && <div className="mt-1.5 h-1 w-full max-w-[150px] rounded-full bg-sunken"><div className="h-1 rounded-full" style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, background: colors?.[i] ?? "#8a8880" }} /></div>}
                    </div>
                  );
                })}
              </div>
              {shownExtra.filter((r) => r.after === cr.key).map(extraRow)}
            </Fragment>
          );
        })}
        {shownExtra.filter((r) => !r.after).map(extraRow)}
      </div>
    </div>
  );
}

function Key({ cls, t }: { cls: string; t: string }) {
  const word = t === "ahead" ? tr("Innisfree ahead", "Innisfree 우위") : t === "behind" ? tr("behind", "열세") : tr("on par", "비슷함");
  return <span className={`rounded px-1.5 py-px text-[10.5px] font-medium ${cls}`}>{word}</span>;
}

/** Small rounded tag. */
export function Chip({ children, tone: t, title }: { children: React.ReactNode; tone?: "good" | "bad" | "plain"; title?: string }) {
  const cls = t === "good" ? "bg-[#eaf6ee] text-good" : t === "bad" ? "bg-[#fbecea] text-bad" : t === "plain" ? "text-ink-2 ring-1 ring-line" : "bg-sunken text-ink-2";
  return <span title={title} className={`inline-block max-w-full whitespace-normal break-words rounded-full px-2 py-0.5 text-[11.5px] leading-snug ${cls}`}>{children}</span>;
}
