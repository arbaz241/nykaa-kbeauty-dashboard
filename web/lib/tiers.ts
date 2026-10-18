"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { norm } from "./brands";
import { supabase } from "./supabase";
import { labels } from "./i18n";

/** One brand tiering for every tab (owner decision D1/D5, 12 Oct 2026), kept in Supabase `brand_tiers` and edited
 *  in Admin › Brand tiers. Pinned = the anchor, always first. Focus = the brands every tab leads with.
 *  Every other brand sits behind a search box and only surfaces in a headline as a tagged outlier. */
export type TierGroup = "korean" | "indian" | "global";
export interface TierRow { brand: string; tier: "pinned" | "focus"; grp: TierGroup; sort: number; note: string | null }

export const GROUP_LABEL: Record<TierGroup, string> = labels({ korean: ["Korean", "K-뷰티"], indian: ["Indian", "인도"], global: ["Global", "글로벌"] });

/** Used until the table answers (and if it cannot): the list the owner approved on 12 Oct 2026. */
const FALLBACK: TierRow[] = [
  ["Innisfree", "pinned", "korean"], ["Laneige", "focus", "korean"], ["Beauty of Joseon", "focus", "korean"], ["The Face Shop", "focus", "korean"],
  ["TONYMOLY", "focus", "korean"], ["COSRX", "focus", "korean"], ["Anua", "focus", "korean"], ["SKIN1004", "focus", "korean"], ["ETUDE", "focus", "korean"],
  ["Biodance", "focus", "korean"], ["Mamonde", "focus", "korean"], ["Dot & Key", "focus", "indian"], ["Minimalist", "focus", "indian"], ["Plum", "focus", "indian"],
  ["Foxtale", "focus", "indian"], ["Nykaa Skin", "focus", "indian"], ["Cetaphil", "focus", "global"], ["CeraVe", "focus", "global"], ["The Ordinary", "focus", "global"],
  ["Bioderma", "focus", "global"],
].map(([brand, tier, grp], i) => ({ brand, tier, grp, sort: i, note: null }) as TierRow);

export function useTierRows() {
  return useSWR("brand_tiers", async () => {
    const { data, error } = await supabase().from("brand_tiers").select("brand,tier,grp,sort,note").order("sort");
    if (error) throw new Error(error.message);
    return (data ?? []) as TierRow[];
  }, { revalidateOnFocus: false });
}

export interface Tiers {
  rows: TierRow[];
  /** The pinned brand's name as the data spells it (e.g. "Innisfree"). */
  pinned: string;
  /** Focus brands in their set order, as the data spells them when `known` is given. */
  focus: string[];
  isPinned: (b: string) => boolean;
  isFocus: (b: string) => boolean;
  /** Pinned or focus. */
  inSet: (b: string) => boolean;
  group: (b: string) => TierGroup | null;
  /** Sort key: pinned first, then focus order, then everyone else. */
  order: (b: string) => number;
}

/** The tiering, with names resolved to the spelling used in the data (`known`), e.g. "Laneige" → "LANEIGE". */
export function useTiers(known: string[] = []): Tiers {
  const { data } = useTierRows();
  return useMemo(() => {
    const rows = data?.length ? data : FALLBACK;
    const byKey = new Map(known.map((b) => [norm(b), b]));
    const spell = (b: string) => byKey.get(norm(b)) ?? b;
    const idx = new Map(rows.map((r, i) => [norm(r.brand), { r, i }]));
    const pinnedRow = rows.find((r) => r.tier === "pinned") ?? rows[0];
    return {
      rows,
      pinned: spell(pinnedRow.brand),
      focus: rows.filter((r) => r.tier === "focus").map((r) => spell(r.brand)),
      isPinned: (b) => idx.get(norm(b))?.r.tier === "pinned",
      isFocus: (b) => idx.get(norm(b))?.r.tier === "focus",
      inSet: (b) => idx.has(norm(b)),
      group: (b) => idx.get(norm(b))?.r.grp ?? null,
      order: (b) => idx.get(norm(b))?.i ?? 1000,
    };
  }, [data, known]);
}
