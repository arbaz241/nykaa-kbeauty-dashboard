export const inr = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "–" : `₹${Math.round(v).toLocaleString("en-IN")}`);
export const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(d)}%`);
export const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Math.round(v).toLocaleString("en-IN"));
export const compact = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
};
export const signed = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);

export const CATEGORY_LABEL: Record<string, string> = {
  face_moisturizer: "Moisturiser", serum: "Serum", sunscreen: "Sunscreen", face_wash: "Face wash",
  masks: "Masks & peels", lipstick: "Lipstick", foundation: "Foundation",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL);

/** Drop a leading brand name from a product title. */
export function shortName(name: string, brand: string) {
  const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const n = name.replace(new RegExp(`^\\s*${esc}[\\s:\\-–·,]*`, "i"), "").trim();
  return n || name;
}

/** '50ml' -> 50, '100 g' -> 100, '1.7 oz' -> 50.3 */
export function packMl(pack: string | null | undefined): number | null {
  const m = pack?.match(/(\d+(?:\.\d+)?)\s*(ml|g|gm|gms|oz|l)\b/i);
  if (!m) return null;
  const v = parseFloat(m[1]); const u = m[2].toLowerCase();
  return u === "l" ? v * 1000 : u === "oz" ? v * 29.57 : v;
}

export const median = (xs: number[]) => {
  const s = xs.filter((x) => x !== null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (xs: (number | null)[]) => {
  const s = xs.filter((x): x is number => x !== null && !Number.isNaN(x));
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
};
