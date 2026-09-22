"use client";

import { useMemo, useState } from "react";
import { MAX_COMPARE, SLOT_COLORS, resolveBrand } from "./brands";

const KEY = "nmi.brands";
const DEFAULT = ["Innisfree", "Beauty of Joseon", "Laneige", "The Face Shop"];

function readInitial(): string[] {
  if (typeof window === "undefined") return [];
  const url = new URLSearchParams(window.location.search).get("brands");
  if (url) return url.split(",").filter((b) => b.trim());
  try { const s = window.localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch { /* storage unavailable */ }
  return DEFAULT;
}

/** Brand selection shared across pages: URL first (shareable links), then the last selection, then the default set.
 *  Each selected brand keeps its colour slot until it is removed (colour follows the brand, not its position). */
export function useBrandSelection(known: string[]) {
  const [raw] = useState(readInitial);
  const [user, setUser] = useState<{ selected: string[]; slots: Record<string, number> } | null>(null);
  const initial = useMemo(() => {
    const sel = [...new Set(raw.map((b) => resolveBrand(b, known)).filter((b): b is string => !!b))].slice(0, MAX_COMPARE);
    return { selected: sel, slots: Object.fromEntries(sel.map((b, i) => [b, i])) };
  }, [raw, known]);
  const { selected, slots } = user ?? initial;
  const colors = useMemo(() => Object.fromEntries(selected.map((b) => [b, SLOT_COLORS[slots[b] ?? 0]])), [selected, slots]);

  function save(next: { selected: string[]; slots: Record<string, number> }) {
    setUser(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next.selected)); } catch { /* storage unavailable */ }
  }
  function toggle(b: string) {
    if (selected.includes(b)) return save({ selected: selected.filter((x) => x !== b), slots });
    if (selected.length >= MAX_COMPARE) return;
    const used = new Set(selected.map((x) => slots[x])); const free = SLOT_COLORS.findIndex((_, i) => !used.has(i));
    save({ selected: [...selected, b], slots: { ...slots, [b]: free } });
  }
  return { selected, colors, toggle };
}
