export const inr = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "–" : `₹${Math.round(v).toLocaleString("en-IN")}`);
export const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(d)}%`);
export const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Math.round(v).toLocaleString("en-IN"));
export const compact = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  // one scale everywhere: a "3.4 L" next to "66.4k" reads as the smaller number
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k`;
  return String(Math.round(v));
};
export const signed = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);

export const CATEGORY_LABEL: Record<string, string> = {
  face_moisturizer: "Moisturiser", serum: "Serum & essence", sunscreen: "Sunscreen", face_wash: "Face wash",
  toner: "Toner & mist", sheet_mask: "Sheet mask", cleansing_balm: "Cleansing balm", eye_care: "Eye care",
  masks: "Masks & peels", lip_tint: "Lip tint", lipstick: "Lipstick", foundation: "Foundation",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL);
/** The Nykaa listing each shelf is read from (scraper/config.py CATEGORIES). */
export const CATEGORY_URL: Record<string, string> = {
  face_moisturizer: "https://www.nykaa.com/skin/moisturizers/face-moisturizer-day-cream/c/8394",
  serum: "https://www.nykaa.com/skin/serums/serums-essence/c/8397",
  sunscreen: "https://www.nykaa.com/skin/sun-care/face-sunscreen/c/8429",
  face_wash: "https://www.nykaa.com/skin/cleansers/face-wash/c/8379",
  masks: "https://www.nykaa.com/skin/masks/masks-peels/c/8400",
  lipstick: "https://www.nykaa.com/makeup/lips/lipstick/c/249",
  foundation: "https://www.nykaa.com/makeup/face/face-foundation/c/228",
  toner: "https://www.nykaa.com/skin/toners-mists/c/8391",
  sheet_mask: "https://www.nykaa.com/skin/masks/face-masks/c/8401",
  cleansing_balm: "https://www.nykaa.com/skin/cleansers/cleansing-balm-oil/c/8383",
  eye_care: "https://www.nykaa.com/skin/eye-care/under-eye-cream-serums/c/8403",
  lip_tint: "https://www.nykaa.com/makeup/lips/lip-stain/c/253",
};

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
