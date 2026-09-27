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
