"use client";

import { useMemo, useState } from "react";
import { ANCHOR_BRAND, MAX_COMPARE, norm } from "@/lib/brands";

/** Focus brands as toggle chips, plus a type-to-add search for any other brand on the shelf. */
export default function BrandPicker({ focus, all, selected, colors, onToggle, max = MAX_COMPARE }: {
  focus: string[]; all: { brand: string; slots: number }[]; selected: string[]; colors: Record<string, string>; onToggle: (b: string) => void; max?: number;
}) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const k = norm(q);
    return all.filter((a) => !focus.includes(a.brand) && (!k || norm(a.brand).includes(k))).slice(0, 8);
  }, [q, all, focus]);
  const extra = selected.filter((b) => !focus.includes(b));
  const full = selected.length >= max;

  const Chip = ({ b, removable = false }: { b: string; removable?: boolean }) => {
    const on = selected.includes(b); const c = colors[b];
    return (
      <button onClick={() => onToggle(b)} disabled={!on && full} title={!on && full ? `Up to ${max} brands` : undefined}
        className={`group inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] transition ${on ? "bg-surface font-medium text-ink shadow-card ring-1" : "text-ink-2 ring-1 ring-line hover:bg-surface hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"}`}
        style={on ? { boxShadow: `inset 0 0 0 1.5px ${c}` } : undefined}>
        <span className="h-2 w-2 rounded-full" style={{ background: on ? c : "#d9d7cf" }} />
        {b}
        {b === ANCHOR_BRAND && <span className="rounded bg-sunken px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">anchor</span>}
        {removable && <span className="text-muted group-hover:text-ink">×</span>}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {focus.map((b) => <Chip key={b} b={b} />)}
      {extra.map((b) => <Chip key={b} b={b} removable />)}
      <div className="relative">
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="+ Add any brand" disabled={full}
          className="w-44 rounded-full bg-transparent px-3.5 py-1.5 text-[13px] ring-1 ring-dashed ring-line-2 outline-none placeholder:text-muted focus:bg-surface focus:ring-ink disabled:opacity-40" />
        {open && matches.length > 0 && (
          <div className="absolute left-0 top-10 z-20 w-64 overflow-hidden rounded-xl bg-surface shadow-pop ring-1 ring-line">
            {matches.map((m) => (
              <button key={m.brand} onMouseDown={() => { onToggle(m.brand); setQ(""); }} className="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] hover:bg-sunken">
                <span>{m.brand}</span><span className="text-[11.5px] text-muted">{m.slots} listings</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="ml-1 text-[12px] text-muted">{selected.length}/{max} selected</span>
    </div>
  );
}
