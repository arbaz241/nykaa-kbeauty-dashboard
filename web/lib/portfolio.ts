import { norm } from "./brands";
import type { CatalogRow, ProductDemand, ShelfRow } from "./types";
import { push } from "@/lib/group";
import { tr } from "./i18n";

/** BCG growth-share matrix (Henderson, BCG 1970) on Nykaa data, per category:
 *  - market growth = tracked reviews in the last 3 complete months vs the 3 before (reviews stand in for sales);
 *  - relative share = the anchor's recent reviews ÷ the largest other brand's in that category (1.0 = level with the leader).
 *  Growth is split at the median category, share at 1.0 (leadership), as in the original matrix.
 *  Indicative: demand covers the tracked products (focus brands' leaders + the most visible rivals), not every listing. */

export type Quadrant = "star" | "cash_cow" | "question" | "dog";
const quad = (label: [string, string], read: [string, string], action: [string, string], tone: "good" | "bad" | undefined) =>
  ({ get label() { return tr(...label); }, get read() { return tr(...read); }, get action() { return tr(...action); }, tone });
export const QUADRANT: Record<Quadrant, { label: string; read: string; action: string; tone: "good" | "bad" | undefined }> = {
  star: quad(["Star", "스타"], ["Growing category, Innisfree leads", "성장 카테고리, Innisfree 선두"], ["Invest to keep the lead: it is where growth and position meet.", "선두를 지키도록 투자: 성장과 위치가 만나는 곳."], "good"),
  cash_cow: quad(["Cash cow", "캐시카우"], ["Slower category, Innisfree leads", "저성장 카테고리, Innisfree 선두"], ["Defend the position at the lowest cost; it funds the rest.", "최소 비용으로 위치 방어: 다른 곳에 쓸 재원 확보."], "good"),
  question: quad(["Question mark", "물음표"], ["Growing category, Innisfree trails", "성장 카테고리, Innisfree 열세"], ["Decide: push hard enough to become a leader, or step back.", "결정 필요: 선두가 될 만큼 밀어붙일지, 물러설지."], undefined),
  dog: quad(["Dog", "도그"], ["Slower category, Innisfree trails", "저성장 카테고리, Innisfree 열세"], ["Hold spend; keep the hero visible only if it earns its place.", "지출 유지: 히어로 제품은 제 몫을 할 때만 노출을 유지."], "bad"),
};

export interface CategoryPosition {
  category: string; growth: number; total: number; prior: number; products: number; brands: number;
  anchorRecent: number; anchorRank: number | null; leader: { brand: string; recent: number };
  relShare: number; quadrant: Quadrant | null;
}

export function categoryPortfolio(anchor: string, demand: ProductDemand[], shelf: ShelfRow[], catalog: CatalogRow[]): { rows: CategoryPosition[]; growthSplit: number } {
  // one row per review pool (a product and its variants share reviews)
  const best = new Map<string, ProductDemand>();
  // prefer the listing with a category (a combo sharing the pool would otherwise hide the single product)
  const score = (d: ProductDemand) => (d.category ? 1e9 : 0) + d.lifetime;
  for (const d of demand) { const k = d.pool_id || d.product_id; const c = best.get(k); if (!c || score(d) > score(c)) best.set(k, d); }
  // some tracked products carry no category: place them by their shelf or catalogue category
  const catOf = (d: ProductDemand) => d.category ?? shelf.find((r) => r.product_id === d.product_id && r.subcategory !== "kbeauty_store")?.subcategory ?? catalog.find((r) => r.product_id === d.product_id)?.subcategories[0] ?? null;
  const by = new Map<string, ProductDemand[]>();
  for (const d of best.values()) { const c = catOf(d); if (c && c !== "kbeauty_store") push(by, c, d); }
  const rows: CategoryPosition[] = [];
  for (const [category, ds] of by) {
    const total = ds.reduce((a, d) => a + d.recent, 0); const prior = ds.reduce((a, d) => a + d.prior, 0);
    if (total < 100 || prior <= 0) continue; // too thin to read a growth rate
    const brand = new Map<string, number>(); ds.forEach((d) => brand.set(d.brand, (brand.get(d.brand) ?? 0) + d.recent));
    const ranked = [...brand.entries()].sort((a, b) => b[1] - a[1]);
    const anchorRecent = ranked.find(([b]) => norm(b) === norm(anchor))?.[1] ?? 0;
    const lead = ranked.find(([b]) => norm(b) !== norm(anchor)) ?? ["", 0];
    const pos = ranked.findIndex(([b]) => norm(b) === norm(anchor));
    rows.push({ category, growth: (total - prior) / prior, total, prior, products: ds.length, brands: brand.size,
      anchorRecent, anchorRank: pos >= 0 && anchorRecent > 0 ? pos + 1 : null, leader: { brand: lead[0], recent: lead[1] },
      relShare: lead[1] ? anchorRecent / lead[1] : 0, quadrant: null });
  }
  const gs = rows.map((r) => r.growth).sort((a, b) => a - b);
  const growthSplit = gs.length ? gs[Math.floor(gs.length / 2)] : 0;
  for (const r of rows) {
    if (!r.anchorRecent) continue;
    const fast = r.growth >= growthSplit; const lead = r.relShare >= 1;
    r.quadrant = lead ? (fast ? "star" : "cash_cow") : fast ? "question" : "dog";
  }
  return { rows: rows.sort((a, b) => b.total - a.total), growthSplit };
}
