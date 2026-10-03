/** Owner's Korean brand set (widened 2026-09-27). Innisfree is the anchor. Keep in sync with scraper/config.py KBEAUTY_CORE. */
export const FOCUS_BRANDS = ["Innisfree", "Laneige", "Etude", "Beauty of Joseon", "SKIN1004", "TIRTIR", "Anua",
  "The Face Shop", "Sulwhasoo", "Mamonde", "COSRX", "Klairs", "Dr.Althea", "Celimax", "d'Alba Piedmont",
  "Numbuzin", "Round Lab", "Torriden", "Biodance", "Medicube", "Skinfood", "TONYMOLY"];
export const ANCHOR_BRAND = "Innisfree";
export const MAX_COMPARE = 5;

/** Validated categorical slots (adjacent-pair CVD-safe in this order). Colour follows the brand, not its position. */
export const SLOT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];

export const ORIGIN_LABEL: Record<string, string> = { kbeauty: "K-beauty", local: "Indian", global: "Global", unknown: "Unclassified" };

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Resolve a focus-brand name to the exact spelling Nykaa uses in the data (e.g. 'Laneige' -> 'LANEIGE'). */
export function resolveBrand(name: string, known: string[]): string | null {
  const k = norm(name);
  if (!k) return null;
  return known.find((b) => norm(b) === k) ?? known.find((b) => norm(b).startsWith(k)) ?? null;
}

/** Smaller / newer Korean brands tracked more lightly. Keep in sync with scraper/config.py KBEAUTY_WATCH. */
export const WATCH_BRANDS = ["Aestura", "Arencia", "Mixsoon", "La'dor", "Rom&nd", "Illiyoon", "belif", "RYO",
  "mise en scene", "Parnell", "Mirabelle Korea", "Moira"];

export type Tier = "anchor" | "kbeauty" | "watch" | "rival";
export const TIER_LABEL: Record<Tier, string> = { anchor: "Anchor", kbeauty: "Focus K-beauty", watch: "K-beauty watch", rival: "Rival" };

export interface MarketSet {
  anchor: string;
  /** Indian and global brands that compete with the anchor, strongest first. */
  rivals: { brand: string; origin: string; slots: number }[];
  tier: (brand: string) => Tier | null;
  has: (brand: string) => boolean;
}

/** The brands that matter for a reader defending the anchor: the anchor, the Korean brand set, and the
 *  Indian/global brands holding the most top-100 slots in the anchor's own categories today (the same rule
 *  the collector uses to choose whose reviews to track). Everything else is market noise for this purpose. */
export function marketSet(rows: { brand: string; origin: string; subcategory: string }[], anchorName = ANCHOR_BRAND,
                          nLocal = 6, nGlobal = 4): MarketSet {
  const known = [...new Set(rows.map((r) => r.brand))];
  const anchor = resolveBrand(anchorName, known) ?? anchorName;
  const korean = new Set([...FOCUS_BRANDS, ...WATCH_BRANDS].map(norm));
  const watch = new Set(WATCH_BRANDS.map(norm));
  const cats = new Set(rows.filter((r) => norm(r.brand) === norm(anchor)).map((r) => r.subcategory));
  const slots = new Map<string, { brand: string; origin: string; slots: number }>();
  for (const r of rows) {
    if (!cats.has(r.subcategory) || korean.has(norm(r.brand)) || (r.origin !== "local" && r.origin !== "global")) continue;
    const s = slots.get(r.brand) ?? { brand: r.brand, origin: r.origin, slots: 0 }; s.slots++; slots.set(r.brand, s);
  }
  const ranked = [...slots.values()].sort((a, b) => b.slots - a.slots || a.brand.localeCompare(b.brand));
  const rivals = [...ranked.filter((r) => r.origin === "local").slice(0, nLocal), ...ranked.filter((r) => r.origin === "global").slice(0, nGlobal)]
    .sort((a, b) => b.slots - a.slots);
  const rivalSet = new Set(rivals.map((r) => norm(r.brand)));
  const tier = (b: string): Tier | null => {
    const k = norm(b);
    if (k === norm(anchor)) return "anchor";
    if (korean.has(k)) return watch.has(k) ? "watch" : "kbeauty";
    return rivalSet.has(k) ? "rival" : null;
  };
  return { anchor, rivals, tier, has: (b) => tier(b) !== null };
}
