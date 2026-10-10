"use client";

import { useEffect, useState } from "react";

/** Report-style page building blocks (docs/restructure-v2-plan.md): answer first, action-title sections,
 *  a sticky in-page menu, and lists that show the first few items with "show all" for the rest. */

export interface NavItem { id: string; label: string }

/** Sticky section menu under the top bar; highlights the section in view. */
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
    <nav className="sticky top-14 z-20 -mx-6 mt-6 border-b border-line bg-page/90 px-6 backdrop-blur-md">
      <div className="flex gap-1 overflow-x-auto py-2">
        {items.map((i) => (
          <a key={i.id} href={`#${i.id}`}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[12.5px] transition ${active === i.id ? "bg-surface font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:text-ink"}`}>
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** A section whose heading states its conclusion (an "action title"); the kicker names the topic. */
export function ActionSection({ id, kicker, title, note, children, right }: {
  id: string; kicker: string; title: React.ReactNode; note?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-32">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[900px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{kicker}</div>
          <h2 className="mt-1 font-display text-[21px] font-semibold leading-snug tracking-tight">{title}</h2>
          {note && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{note}</p>}
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
    <div className="relative h-full overflow-hidden rounded-2xl bg-surface px-5 py-4 shadow-card ring-1 ring-line transition hover:ring-line-2">
      <span className={`absolute left-0 top-0 h-full w-1 ${bar}`} />
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1.5 text-[14px] leading-snug">{children}</div>
      {href && <div className="mt-2 text-[12px] text-muted">See section ↓</div>}
    </div>
  );
  return href ? <a href={href} className="block">{body}</a> : body;
}

/** First `n` items, then a "show all" toggle. */
export function ShowAll<T>({ items, n = 3, render, empty, more = "more" }: { items: T[]; n?: number; render: (x: T, i: number) => React.ReactNode; empty?: React.ReactNode; more?: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <>{empty ?? null}</>;
  const shown = all ? items : items.slice(0, n);
  return (
    <>
      {shown.map(render)}
      {items.length > n && (
        <button onClick={() => setAll(!all)} className="mt-1 text-[12px] font-medium text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">
          {all ? "Show fewer" : `Show ${items.length - n} ${more}`}
        </button>
      )}
    </>
  );
}

/** Thin horizontal bar, value relative to max. */
export function Bar({ v, max, color = "#121211" }: { v: number | null; max: number; color?: string }) {
  if (v === null || max <= 0) return null;
  return <div className="mt-1.5 h-1 w-full max-w-[160px] rounded-full bg-sunken"><div className="h-1 rounded-full" style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, background: color }} /></div>;
}

export function Lead() {
  return <span className="ml-1.5 rounded-full bg-ink px-1.5 py-px align-middle text-[9.5px] font-semibold uppercase tracking-wide text-white">lead</span>;
}
