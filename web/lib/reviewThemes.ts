/** Review themes counted from review text we already store: the same method for every product, no AI cost
 *  (docs/competitive-round2-plan.md §5). Tested by hand on the toner group:
 *  - praise themes, all reviews: ~95% of matches right;
 *  - complaint themes in 1–3★ reviews: ~85% right;
 *  - texture / scent / price / no-result complaints in 4–5★ reviews, only inside a "but / though / a bit" clause: ~70%
 *    right, shown as "mild";
 *  - breakouts / irritation from 4–5★ reviews were almost always "it did NOT irritate me", so they count from 1–3★ only. */

import { tr } from "./i18n";

export interface ReviewLite { rating: number | null; title: string | null; body: string | null; aspects: { displayText: string; sentimentValue: string }[] | null }

type Theme = { key: string; label: string; kind: "praise" | "complaint"; rx: RegExp; mildOk?: boolean };
export const THEMES: Theme[] = [
  { key: "hydrating", get label() { return tr("Hydrating", "보습"); }, kind: "praise", rx: /hydrat|moistur|plump|supple|dewy/ },
  { key: "light", get label() { return tr("Lightweight", "가벼운 사용감"); }, kind: "praise", rx: /light ?weight|absorbs? (quick|fast|easil)|non[- ]?greasy|not greasy|non[- ]?sticky|not sticky/ },
  { key: "gentle", get label() { return tr("Gentle, soothing", "순함·진정"); }, kind: "praise", rx: /gentle|sooth|calm|no irritation|doesn'?t irritate|suits? sensitive/ },
  { key: "glow", get label() { return tr("Glow, brightening", "광채·브라이트닝"); }, kind: "praise", rx: /glow|bright|radian|luminous/ },
  { key: "smooth", get label() { return tr("Smooth, soft skin", "매끄럽고 부드러운 피부"); }, kind: "praise", rx: /smooth|soft skin|skin (feels|is) soft/ },
  { key: "clear", get label() { return tr("Clearer skin, fewer pimples", "맑은 피부·트러블 감소"); }, kind: "praise", rx: /(reduced|less|fewer|cleared?|controls?) (my )?(acne|pimples?|breakouts?|oil)|oil control|clear skin/ },
  { key: "value", get label() { return tr("Good value", "가성비"); }, kind: "praise", rx: /value for money|worth (it|the|every)|affordable|reasonabl/ },
  { key: "scent_ok", get label() { return tr("Pleasant scent", "좋은 향"); }, kind: "praise", rx: /(nice|good|pleasant|lovely|mild|subtle) (smell|fragrance|scent)|smells (nice|good|amazing)/ },
  { key: "sticky", get label() { return tr("Sticky, greasy or heavy", "끈적임·번들거림·무거움"); }, kind: "complaint", mildOk: true, rx: /\bsticky|greasy|oily (after|finish)|heavy|white cast/ },
  { key: "breakout", get label() { return tr("Breakouts, irritation", "트러블·자극"); }, kind: "complaint", rx: /break ?out|pimple|acne|rash|itch|burn|irritat/ },
  { key: "scent_bad", get label() { return tr("Strong or odd scent", "강하거나 이상한 향"); }, kind: "complaint", mildOk: true, rx: /(strong|bad|weird|chemical|overpowering|pungent) (smell|fragrance|scent)|smells (bad|weird|strange)|perfumed/ },
  { key: "pricey", get label() { return tr("Pricey or small pack", "비싼 가격·적은 용량"); }, kind: "complaint", mildOk: true, rx: /costly|expensive|pricey|overpriced|quantity is (less|small)|small (quantity|bottle|pack)/ },
  { key: "noresult", get label() { return tr("No visible result", "효과 없음"); }, kind: "complaint", mildOk: true, rx: /no (result|difference|change)|didn'?t (work|see)|not (effective|worth)|waste|does nothing/ },
  { key: "pack", get label() { return tr("Packaging problems", "포장 문제"); }, kind: "complaint", mildOk: true, rx: /leak|broken|damaged|pump (doesn'?t|not)|spill/ },
];
const NEG = /\b(not|no|never|didn'?t|doesn'?t|don'?t|isn'?t|wasn'?t|without|nor|zero|less)\b[^.]{0,20}$/;
const CONTRAST = /\b(but|however|though|although|only (issue|problem|con|thing|drawback)|downside|cons?:|except|wish|a bit|bit|slightly|little|too)\b/;
const OTHER = /\b(other|previous|earlier|before|used to|tried)\b/;

function hits(text: string, t: Theme): boolean {
  for (const m of text.matchAll(new RegExp(t.rx, "g"))) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (NEG.test(before)) continue;
    return true;
  }
  return false;
}

export interface ThemeCount { key: string; label: string; kind: "praise" | "complaint"; n: number; share: number; mild: number; quotes: string[] }
export interface ReviewThemes {
  n: number; low: number; praise: ThemeCount[]; complaints: ThemeCount[];
  /** Nykaa's reviewer-picked tags, % of tagged reviews */
  tags: { label: string; share: number; negative: number }[]; tagged: number;
}

export function reviewThemes(reviews: ReviewLite[]): ReviewThemes {
  const by = new Map<string, ThemeCount>();
  const get = (t: Theme) => by.get(t.key) ?? by.set(t.key, { key: t.key, label: t.label, kind: t.kind, n: 0, share: 0, mild: 0, quotes: [] }).get(t.key)!;
  let low = 0; let tagged = 0; const tag = new Map<string, { n: number; neg: number }>();
  for (const r of reviews) {
    const raw = `${r.title ?? ""}. ${r.body ?? ""}`; const text = raw.toLowerCase(); const star = r.rating ?? 5;
    if (star <= 3) low++;
    for (const t of THEMES) {
      let hit = false; let mild = false;
      if (t.kind === "praise") hit = hits(text, t);
      else if (star <= 3) hit = hits(text, t);
      else if (t.mildOk) {
        // 4–5★: only a complaint inside a contrast clause, and not about some other product
        hit = text.split(/[.!?\n]/).some((s) => CONTRAST.test(s) && !OTHER.test(s) && hits(s, t)); mild = hit;
      }
      if (!hit) continue;
      const c = get(t); c.n++; if (mild) c.mild++;
      if (c.quotes.length < 3 && raw.length < 260) c.quotes.push(raw.replace(/^\.\s*/, "").trim());
    }
    if (r.aspects?.length) {
      tagged++;
      for (const a of r.aspects) { const x = tag.get(a.displayText) ?? { n: 0, neg: 0 }; x.n++; if (/^neg/i.test(a.sentimentValue)) x.neg++; tag.set(a.displayText, x); }
    }
  }
  const n = reviews.length;
  const all = [...by.values()].map((c) => ({ ...c, share: n ? c.n / n : 0 })).sort((a, b) => b.n - a.n);
  return {
    n, low, praise: all.filter((c) => c.kind === "praise"), complaints: all.filter((c) => c.kind === "complaint"),
    tags: [...tag.entries()].map(([label, x]) => ({ label, share: x.n / tagged, negative: x.neg })).sort((a, b) => b.share - a.share), tagged,
  };
}

/** Which counted theme a claimed benefit is about ("Deep hydration" -> hydrating), if any. */
export function themeFor(benefit: string): Theme | undefined {
  const b = benefit.toLowerCase();
  return THEMES.filter((t) => t.kind === "praise").find((t) => t.rx.test(b));
}
