"use client";

import useSWR from "swr";
import { norm } from "./brands";
import { supabase } from "./supabase";
import type { Marker } from "@/components/LineChart";

/** The data-quality log (Supabase `data_notes`, Admin › Data notes): every coverage change, sale, launch and
 *  known artifact, with its cause and status. Charts draw their markers from it so a jump never goes unexplained. */
export interface DataNote {
  id: number; starts_on: string; ends_on: string | null; kind: "coverage" | "sale" | "launch" | "artifact" | "method";
  scope: "shelf" | "demand" | "search" | "all"; brand: string | null; category: string | null;
  title: string; detail: string | null; status: "explained" | "probable" | "open";
}

export const NOTE_COLOR: Record<DataNote["kind"], string> = {
  coverage: "#7a6ff0", sale: "#d99a1e", launch: "#1b7f4b", artifact: "#b8382e", method: "#5f6b64",
};
export const NOTE_WORD: Record<DataNote["kind"], string> = {
  coverage: "Coverage change", sale: "Sale period", launch: "Launch", artifact: "Data artifact", method: "Method note",
};

export function useDataNotes() {
  return useSWR("data_notes", async () => {
    const { data, error } = await supabase().from("data_notes").select("*").order("starts_on");
    if (error) throw new Error(error.message);
    return (data ?? []) as DataNote[];
  }, { revalidateOnFocus: false });
}

/** Markers for a chart whose x-axis is a list of ISO dates (days or month starts). Brand notes only show when
 *  that brand is on the chart. Method notes never draw: they are read in the notes list. */
export function noteMarkers(notes: DataNote[] | undefined, axis: string[], scope: "shelf" | "demand" | "search", brands: string[] = [], monthly = false): Marker[] {
  if (!notes || !axis.length) return [];
  const key = (d: string) => (monthly ? d.slice(0, 7) : d.slice(0, 10));
  const idx = (d: string) => {
    const k = key(d); const i = axis.findIndex((a) => key(a) >= k);
    return i === -1 ? -1 : i;
  };
  const shown = new Set(brands.map(norm));
  const out: Marker[] = [];
  for (const n of notes) {
    if (n.kind === "method" || (n.scope !== "all" && n.scope !== scope)) continue;
    if (n.brand && !shown.has(norm(n.brand))) continue;
    const from = idx(n.starts_on); if (from < 0 || key(n.starts_on) > key(axis[axis.length - 1])) continue;
    const to = n.ends_on ? Math.max(from, idx(n.ends_on) === -1 ? axis.length - 1 : idx(n.ends_on)) : undefined;
    out.push({ from, to: to !== undefined && to > from ? to : undefined, label: `${NOTE_WORD[n.kind]}${n.status === "probable" && !/unconfirmed/i.test(n.title) ? " (unconfirmed)" : ""}: ${n.title}`, color: NOTE_COLOR[n.kind] });
  }
  return out;
}

/** Flags a point that jumps well above a series' own recent normal, naming any logged note that overlaps it. */
export function unusual(series: { name: string; values: (number | null)[] }[], axis: string[], markers: Marker[], minJump = 2, minValue = 60): Marker[] {
  const out: Marker[] = [];
  for (const s of series) {
    s.values.forEach((v, i) => {
      if (v === null || v < minValue || i < 3) return;
      const prev = s.values.slice(Math.max(0, i - 6), i).filter((x): x is number => x !== null);
      if (prev.length < 3) return;
      const med = [...prev].sort((a, b) => a - b)[Math.floor(prev.length / 2)];
      if (med <= 0 || v / med < minJump) return;
      const why = markers.find((m) => i >= m.from && i <= (m.to ?? m.from));
      out.push({ from: i, label: `Unusual jump: ${s.name} ${(v / med).toFixed(1)}× its recent normal${why ? ` · overlaps ${why.label.split(":")[0].toLowerCase()}` : " · cause unknown, possibly data"}`, color: "#b8382e" });
    });
  }
  return out;
}
