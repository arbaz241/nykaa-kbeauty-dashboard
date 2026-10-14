import type React from "react";
/** One set of comparison criteria, used by both the brand view and the product view of Competitive Analysis,
 *  so the two always read the same way. Tones are from the anchor's side: "ahead" means Innisfree does better
 *  than that rival on the criterion. Price carries no tone: cheaper is a position, not a win. */

import { labels, tr } from "./i18n";

export type Tone = "ahead" | "behind" | "par" | null;
export type Better = "high" | "low" | null;

export interface Criterion<T> {
  key: string;
  label: string;
  help: string;
  better: Better;
  value: (x: T) => number | null;
  /** short display value, e.g. "₹1,250" or "#12" */
  show: (x: T) => string;
  /** smaller second line, e.g. "₹420 / 100ml" */
  sub?: (x: T) => string | null;
  /** draw a bar scaled to the row's largest value */
  bar?: boolean;
  /** custom cell (e.g. a sparkline) instead of the value text; shading and LEAD still apply */
  cell?: (x: T) => React.ReactNode;
  /** when the value is genuinely absent: the reason, shown instead of a dash (null = value present) */
  missing?: (x: T) => string | null;
  /** plain-language strength/gap wording: "<up> 3 of 4 rivals" */
  up?: string; down?: string;
}

type Pair = readonly [string, string];
/** A criterion whose wording follows the language: label, help and the strength/gap phrases are [English, Korean]. */
export function crit<T>(c: Omit<Criterion<T>, "label" | "help" | "up" | "down"> & { label: Pair; help: Pair | (() => string); up?: Pair; down?: Pair }): Criterion<T> {
  const { label, help, up, down, ...rest } = c;
  return { ...rest, get label() { return tr(...label); }, get help() { return typeof help === "function" ? help() : tr(...help); },
    get up() { return up && tr(...up); }, get down() { return down && tr(...down); } } as Criterion<T>;
}

/** Within 5% (or 3 rank places) counts as on par. */
export function tone(anchor: number | null, other: number | null, better: Better, kind: "rank" | "ratio" = "ratio"): Tone {
  if (!better || anchor === null || other === null) return null;
  const diff = better === "high" ? anchor - other : other - anchor;
  const tol = kind === "rank" ? 3 : Math.max(Math.abs(anchor), Math.abs(other)) * 0.05;
  if (Math.abs(diff) <= tol) return "par";
  return diff > 0 ? "ahead" : "behind";
}

export const TONE_CLASS: Record<Exclude<Tone, null>, string> = {
  ahead: "bg-[#eaf6ee] text-good",
  behind: "bg-[#fbecea] text-bad",
  par: "bg-sunken text-ink-2",
};
export const TONE_WORD: Record<Exclude<Tone, null>, string> = labels({ ahead: ["Innisfree ahead", "Innisfree 우위"], behind: ["Innisfree behind", "Innisfree 열세"], par: ["On par", "비슷함"] });

export interface Standing { key: string; label: string; ahead: number; behind: number; of: number }

/** How the anchor fares on each criterion across all rivals; strongest and weakest are read from this. */
export function standings<T>(anchor: T, rivals: T[], criteria: Criterion<T>[]): Standing[] {
  return criteria.filter((c) => c.better).map((c) => {
    const a = c.value(anchor);
    const ts = rivals.map((r) => tone(a, c.value(r), c.better, c.key.includes("rank") ? "rank" : "ratio")).filter((t): t is Exclude<Tone, null> => t !== null);
    return { key: c.key, label: c.label, ahead: ts.filter((t) => t === "ahead").length, behind: ts.filter((t) => t === "behind").length, of: ts.length };
  }).filter((s) => s.of > 0);
}

export function strongestWeakest(s: Standing[], n = 3) {
  const net = (x: Standing) => (x.ahead - x.behind) / x.of;
  const strong = [...s].filter((x) => x.ahead > x.behind).sort((a, b) => net(b) - net(a) || b.of - a.of).slice(0, n);
  const weak = [...s].filter((x) => x.behind > x.ahead).sort((a, b) => net(a) - net(b) || b.of - a.of).slice(0, n);
  return { strong, weak };
}
