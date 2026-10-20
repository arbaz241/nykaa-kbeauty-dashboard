"use client";

import { useEffect, useState } from "react";
import { tr } from "@/lib/i18n";

/** Report-style page building blocks (docs/restructure-v2-plan.md): answer first, action-title sections,
 *  a sticky in-page menu, and lists that show the first few items with "show all" for the rest. */

export interface NavItem { id: string; label: string }

/** "On this page": a numbered contents list under the top bar (plan v3, owner 18 Oct 2026: the old menu looked like
 *  a second row of tabs and repeated the tabs' names). It reads as a table of contents, highlights the section in
 *  view, and never uses a main tab's name. */
export function SectionNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-120px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav data-section-nav aria-label={tr("On this page", "이 페이지 목차")} className="sticky top-16 z-20 -mx-6 mt-6 bg-page/95 px-6 py-2 backdrop-blur-md">
      <div className="flex items-center gap-3 overflow-x-auto rounded-xl bg-sunken px-3 py-1.5">
        <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{tr("On this page", "이 페이지")}</span>
        <ol className="flex gap-0.5">
          {items.map((i, n) => (
            <li key={i.id}><a href={`#${i.id}`} aria-current={active === i.id ? "true" : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12.5px] transition ${active === i.id ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] tabular ${active === i.id ? "bg-brand text-on-brand" : "bg-line text-ink-2"}`}>{n + 1}</span>{i.label}
            </a></li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

/** A section whose heading states its conclusion (an "action title"); the kicker names the topic. */
export function ActionSection({ id, kicker, title, note, children, right }: {
  id: string; kicker: string; title: React.ReactNode; note?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-32">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[920px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{kicker}</div>
          <h2 className="mt-2 font-display text-[22px] font-semibold leading-snug tracking-[-0.015em] md:text-[25px]">{title}</h2>
          {/* owner 21 Oct 2026: "too much information in every place… make it clickable, information when needed": the
              method note under every section title is one click away instead of always on the page */}
          {note && (
            <details className="group mt-1.5">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-muted hover:text-ink-2 [&::-webkit-details-marker]:hidden">
                <span className="grid h-4 w-4 place-items-center rounded-full text-[10px] ring-1 ring-line-2">i</span>{tr("How to read this", "읽는 법")}<span className="transition group-open:rotate-90">›</span>
              </summary>
              <p className="mt-1.5 max-w-[820px] rounded-lg bg-sunken/60 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">{note}</p>
            </details>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** One key finding: a labelled sentence, linking to the section that supports it. */
export function Finding({ label, children, tone, href }: { label: string; children: React.ReactNode; tone?: "good" | "bad"; href?: string }) {
  const bar = tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : "bg-line-2";
  const body = (
    <div className={`relative h-full overflow-hidden rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line ${href ? "lift" : ""}`}>
      <span className={`absolute left-0 top-0 h-full w-1 ${bar}`} />
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1.5 text-[14px] leading-snug">{children}</div>
      {href && <div className="mt-2 text-[12px] font-medium text-accent-strong">{tr("See section ↓", "해당 섹션 보기 ↓")}</div>}
    </div>
  );
  return href ? <a href={href} className="block">{body}</a> : body;
}

/** First `n` items, then a "show all" toggle. */
export function ShowAll<T>({ items, n = 3, render, empty, more }: { items: T[]; n?: number; render: (x: T, i: number) => React.ReactNode; empty?: React.ReactNode; more?: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <>{empty ?? null}</>;
  const shown = all ? items : items.slice(0, n);
  return (
    <>
      {shown.map(render)}
      {items.length > n && (
        <button onClick={() => setAll(!all)} className="mt-1 text-[12px] font-medium text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">
          {all ? tr("Show fewer", "접기") : tr(`Show ${items.length - n} ${more ?? "more"}`, more ? `${more} ${items.length - n}개 더 보기` : `${items.length - n}개 더 보기`)}
        </button>
      )}
    </>
  );
}

/** Thin horizontal bar, value relative to max. */
export function Bar({ v, max, color = "var(--color-brand)" }: { v: number | null; max: number; color?: string }) {
  if (v === null || max <= 0) return null;
  return <div className="mt-1.5 h-1 w-full max-w-[160px] rounded-full bg-sunken"><div className="h-1 rounded-full" style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, background: color }} /></div>;
}

export function Lead() {
  return <span className="ml-1.5 rounded-full bg-accent px-1.5 py-px align-middle text-[9.5px] font-semibold uppercase tracking-wide text-ink">{tr("lead", "선두")}</span>;
}

/** Long explanation: first sentence, the rest one click away in place (never cut mid-word). */
export function More({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = text.split(/(?<=[.!?])\s+/);
  if (!rest.length) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {open ? text : first}{" "}
      <button onClick={() => setOpen(!open)} className="whitespace-nowrap text-[11px] font-medium text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">{open ? tr("less", "접기") : tr("more", "더 보기")}</button>
    </span>
  );
}
