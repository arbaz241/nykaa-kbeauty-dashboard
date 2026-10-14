"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { labels, tr } from "@/lib/i18n";

/** Layered detail (docs/competitive-round2-plan.md): the first view is short and visual; everything behind it opens
 *  in one place, a panel from the right (a bottom sheet on phones). One pattern for the whole dashboard:
 *  click = detail panel, hover = one-line definition. */

export interface DetailContent { kicker?: string; title: React.ReactNode; body: React.ReactNode }

const Ctx = createContext<(d: DetailContent) => void>(() => {});
export const useDetail = () => useContext(Ctx);

export function DetailProvider({ children }: { children: React.ReactNode }) {
  const [d, setD] = useState<DetailContent | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setD(null);
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Ctx.Provider value={setD}>
      {children}
      {d && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={() => setD(null)} />
          <aside className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-page shadow-pop md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-full md:max-w-[560px] md:rounded-none">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-page/95 px-6 py-3 backdrop-blur">
              <div className="min-w-0">
                {d.kicker && <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{d.kicker}</div>}
                <div className="mt-0.5 text-[15px] font-semibold leading-snug">{d.title}</div>
              </div>
              <button onClick={() => setD(null)} className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">{tr("Close · Esc", "닫기 · Esc")}</button>
            </div>
            <div className="px-6 py-5 text-[13px] leading-relaxed">{d.body}</div>
          </aside>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Anything that opens detail: a quiet button with a chevron so it reads as clickable. */
export function Opens({ detail, children, className = "" }: { detail: DetailContent; children: React.ReactNode; className?: string }) {
  const open = useDetail();
  return (
    <button type="button" onClick={() => open(detail)} className={`group inline-flex max-w-full items-start gap-1 text-left ${className}`}>
      <span className="min-w-0">{children}</span><span className="shrink-0 text-[11px] leading-[1.6] text-muted group-hover:text-ink">›</span>
    </button>
  );
}

/* ---------------------------------------------------------------- levels: one scale everywhere */

export type Lvl = "strong" | "moderate" | "weak";
export const LEVEL_WORD: Record<Lvl, string> = labels({ strong: ["Strong", "강함"], moderate: ["Moderate", "보통"], weak: ["Weak", "약함"] });
const LEVEL_FILL: Record<Lvl, number> = { strong: 3, moderate: 2, weak: 1 };
const LEVEL_COLOR: Record<Lvl, string> = { strong: "bg-good", moderate: "bg-[#d99a1e]", weak: "bg-bad" };
export const LEVEL_SCORE: Record<Lvl, number> = { strong: 3, moderate: 2, weak: 1 };

export function Dots({ level }: { level: Lvl }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3].map((i) => <span key={i} className={`h-2 w-2 rounded-full ${i <= LEVEL_FILL[level] ? LEVEL_COLOR[level] : "bg-sunken ring-1 ring-line"}`} />)}
    </span>
  );
}

/** A level with its reasons one click away (2–4 short bullets). */
export function Level({ level, reasons, title, kicker, none }: { level: Lvl | null; reasons: string[]; title: string; kicker?: string; none?: string }) {
  if (!level) return <Missing>{none ?? tr("Not rated", "평가 없음")}</Missing>;
  return (
    <Opens detail={{ kicker, title: <span className="inline-flex items-center gap-2">{title}: <Dots level={level} /> {LEVEL_WORD[level]}</span>, body: <Points items={reasons} /> }}>
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"><Dots level={level} />{LEVEL_WORD[level]}</span>
    </Opens>
  );
}

/* ---------------------------------------------------------------- small text pieces */

/** Short bullet points. */
export function Points({ items, tone, className = "" }: { items: React.ReactNode[]; tone?: "good" | "bad"; className?: string }) {
  if (!items.length) return null;
  const dot = tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : "bg-line-2";
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((x, i) => <li key={i} className="flex gap-2 leading-snug"><span className={`mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} /><span className="min-w-0">{x}</span></li>)}
    </ul>
  );
}

/** A value we do not have, with the reason (never a bare dash). */
export function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-[11.5px] italic leading-snug text-muted">{children}</span>;
}

/** Heading inside a detail panel. */
export function DetailHead({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted first:mt-0">{children}</div>;
}

/** A label with its definition on hover (dotted underline). */
export function Term({ children, def }: { children: React.ReactNode; def: string }) {
  return <span title={def} className="cursor-help underline decoration-line-2 decoration-dotted underline-offset-2">{children}</span>;
}
