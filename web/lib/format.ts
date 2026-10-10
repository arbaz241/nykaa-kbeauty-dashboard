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
  masks: "Masks & peels", lip_tint: "Lip tint", lip_care: "Lip care", lipstick: "Lipstick", foundation: "Foundation",
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
  lip_care: "https://www.nykaa.com/skin/lip-care/c/8408",
};

/** Drop a leading brand name from a product title. */
export function shortName(name: string, brand: string) {
  const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const n = name.replace(new RegExp(`^\\s*${esc}[\\s:\\-–·,]*`, "i"), "").trim();
  return n || name;
}

/** Pack size in ml or g: '50ml' -> 50, '100 g' / '100gm' / '100 gms' -> 100, '1.7 fl oz' -> 50.3, '1 L' / '1 ltr' -> 1000,
 *  '0.5 kg' -> 500. Pieces ('5 pcs', '10 sheets') have no ml and return null: see packPieces. */
export function packMl(pack: string | null | undefined): number | null {
  const m = pack?.match(/(\d+(?:\.\d+)?)\s*(ml|millilitre|g|gm|gms|gram|grams|gr|fl\.?\s*oz|oz|l|ltr|litre|liter|kg)\b/i);
  if (!m) return null;
  const v = parseFloat(m[1]); const u = m[2].toLowerCase().replace(/[\s.]/g, "");
  if (!v) return null;
  return ["l", "ltr", "litre", "liter", "kg"].includes(u) ? v * 1000 : u === "oz" || u === "floz" ? v * 29.57 : v;
}
/** '5 pcs' / 'Pack of 10 sheets' -> 5 / 10 (sheet masks and pads are priced per piece, not per 100 ml). */
export function packPieces(pack: string | null | undefined): number | null {
  const m = pack?.match(/(\d+)\s*(pcs|pc|pieces|sheets?|pads?|units?|n)\b/i);
  return m ? parseInt(m[1], 10) || null : null;
}

/** Sheet masks are compared per sheet: '5 pcs', 'Pack of 4', 'Set of 2' -> that count; a single sachet (20–60 ml/g) -> 1;
 *  a large pack with only a weight ('250 ml') -> weight ÷ 25 ml per sheet, flagged as an estimate. */
export const PER_SHEET = new Set(["sheet_mask"]);
export function sheetCount(pack: string | null | undefined, name: string): { n: number; est: boolean } {
  const n = packPieces(pack) ?? Number(name.match(/\b(?:pack|set|box) of (\d+)/i)?.[1] ?? 0);
  if (n) return { n, est: false };
  const ml = packMl(pack) ?? packMl(name);
  return ml && ml > 60 ? { n: Math.max(1, Math.round(ml / 25)), est: true } : { n: 1, est: false };
}

/** First clause of a long AI phrase, for a one-line first view (the full text is one click away). */
export function clause(text: string | null | undefined, maxWords = 10): string {
  if (!text) return "";
  const first = text.split(/;|:\s| \(| — | – |, (?=[a-z])|\. /)[0].trim().replace(/^['"‘“]|['"’”]$/g, "");
  const w = first.split(/\s+/);
  return w.length <= maxWords ? first : `${w.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}…`;
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
