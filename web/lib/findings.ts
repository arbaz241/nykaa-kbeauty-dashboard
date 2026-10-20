import { CATEGORY_LABEL } from "./format";
import { norm } from "./brands";
import type { Availability, BrandShare, Movement, ProductDemand } from "./types";
import { push } from "@/lib/group";
import { josa, tr } from "./i18n";

/** A finding is a sentence the data supports, plus the numbers that support it.
 *  Rules are deliberately conservative: each one states its own threshold, and anything that
 *  cannot be told apart from a listing artefact (a pack swap, a thin review base) never fires. */
export interface Finding {
  id: string;
  tone: "threat" | "opening" | "watch";
  /** Sorting weight: bigger = more worth the reader's attention. */
  weight: number;
  headline: string;
  detail: string;
  /** One line: why this matters for the anchor. */
  soWhat: string;
  evidence: { label: string; value: string }[];
  brand?: string;
  category?: string | null;
  /** Enough for the product drawer to open without another lookup. */
  product?: { product_id: string; name: string; brand: string; url?: string | null; price?: number | null };
  /** Which page backs this up. */
  source: "Market" | "Demand" | "Search & Ads" | "Compare";
}

const pct = (v: number, d = 0) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const cat = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? c : tr("across categories", "전체 카테고리"));
const n0 = (v: number) => v.toLocaleString("en-IN");
const same = (a: string, b: string) => norm(a) === norm(b);

interface Input {
  anchor: string;
  movement: Movement[];
  shares: BrandShare[];
  demand: ProductDemand[];
  availability: Availability[];
  /** Days each shelf has been tracked. A shelf added yesterday has no past to compare against. */
  coverage: { category: string; days_tracked: number }[];
  /** Products whose review history covers both 3-month windows; others never fire a demand rule. */
  complete?: Set<string>;
}

export function buildFindings({ anchor, movement, shares, demand: demandAll, availability, coverage, complete }: Input): Finding[] {
  const out: Finding[] = [];
  // One row per review pool: a product and its variants serve the same reviews, so reporting both
  // would state the same demand twice. Keep the listing with the most reviews of its own pool.
  const demand = dedupePools(demandAll).filter((d) => !complete || complete.has(d.product_id));
  // Rules that compare today against two weeks ago can only run on shelves that existed two weeks ago —
  // otherwise every product on a newly added shelf reads as a new entrant.
  const settled = new Set(coverage.filter((c) => c.days_tracked >= 15).map((c) => c.category));
  const hasPast = (category: string | null | undefined) => !!category && settled.has(category);
  const days = [...new Set(shares.map((s) => s.scrape_date))].sort();
  const today = days.at(-1);
  const twoWeeksAgo = days.length > 14 ? days.at(-15) : days[0];
  const anchorRows = movement.filter((m) => same(m.brand, anchor));
  const anchorCats = new Set(anchorRows.map((m) => m.category));

  /* 1. A rival climbing hard in a category the anchor sells in. */
  for (const m of movement) {
    if (!hasPast(m.category)) continue;
    if (same(m.brand, anchor) || !m.gain_14d || m.gain_14d < 25 || m.rank > 30) continue;
    if (!anchorCats.has(m.category) && anchorCats.size > 0) continue;
    const anchorBest = Math.min(...anchorRows.filter((a) => a.category === m.category).map((a) => a.rank), Infinity);
    const passed = anchorBest !== Infinity && m.rank < anchorBest;
    out.push({
      id: `climb-${m.product_id}-${m.category}`,
      soWhat: passed ? tr(`A rival now outranks ${anchor}'s best product in ${cat(m.category)}, so shoppers browsing that list reach it first.`, `${cat(m.category)}에서 경쟁 제품이 ${anchor}의 최고 순위 제품을 앞지름 → 목록을 보는 소비자가 경쟁 제품을 먼저 봄.`)
        : tr(`A rival is gaining visibility in a category ${anchor} sells in.`, `${josa(anchor, "이/가")} 판매 중인 카테고리에서 경쟁 제품 노출 증가 중.`),
      tone: passed ? "threat" : "watch",
      weight: m.gain_14d + (passed ? 40 : 0),
      headline: tr(`${m.brand} climbed ${m.gain_14d} places in ${cat(m.category)}${passed ? ` — now ahead of ${anchor}` : ""}`,
        `${m.brand}, ${cat(m.category)}에서 ${m.gain_14d}계단 상승${passed ? ` — ${anchor} 추월` : ""}`),
      detail: passed
        ? tr(`${shorten(m.name, m.brand)} moved from rank ${m.rank_14d} to ${m.rank} in two weeks. ${anchor}'s best product in ${cat(m.category)} sits at ${anchorBest}.`,
          `${shorten(m.name, m.brand)}: 2주 만에 ${m.rank_14d}위 → ${m.rank}위. ${cat(m.category)}에서 ${anchor} 최고 순위 제품은 ${anchorBest}위.`)
        : tr(`${shorten(m.name, m.brand)} moved from rank ${m.rank_14d} to ${m.rank} in two weeks.`, `${shorten(m.name, m.brand)}: 2주 만에 ${m.rank_14d}위 → ${m.rank}위.`),
      evidence: [
        { label: tr("Rank now", "현재 순위"), value: `${m.rank}` },
        { label: tr("14 days ago", "14일 전"), value: `${m.rank_14d}` },
        ...(anchorBest !== Infinity ? [{ label: tr(`${anchor} best`, `${anchor} 최고 순위`), value: `${anchorBest}` }] : []),
      ],
      brand: m.brand, category: m.category, product: ref(m), source: "Market",
    });
  }

  /* 2. The anchor losing ground. */
  for (const m of anchorRows) {
    if (!hasPast(m.category) || !m.gain_14d || m.gain_14d > -20) continue;
    out.push({
      id: `slip-${m.product_id}-${m.category}`,
      soWhat: tr(`${anchor} is losing visibility in ${cat(m.category)}; check this product's price, stock and offers.`, `${cat(m.category)}에서 ${anchor} 노출 감소 중. 이 제품의 가격·재고·프로모션 확인 필요.`),
      tone: "threat",
      weight: Math.abs(m.gain_14d) + 30,
      headline: tr(`${anchor} fell ${Math.abs(m.gain_14d)} places in ${cat(m.category)}`, `${anchor}, ${cat(m.category)}에서 ${Math.abs(m.gain_14d)}계단 하락`),
      detail: tr(`${shorten(m.name, m.brand)} went from rank ${m.rank_14d} to ${m.rank}. Nothing in the price or discount data changed, so this is Nykaa's ranking moving, not a promotion ending.`,
        `${shorten(m.name, m.brand)}: ${m.rank_14d}위 → ${m.rank}위. 가격·할인 변화가 없어 프로모션 종료가 아니라 Nykaa 순위 자체가 움직인 것.`),
      evidence: [{ label: tr("Rank now", "현재 순위"), value: `${m.rank}` }, { label: tr("14 days ago", "14일 전"), value: `${m.rank_14d}` }],
      brand: m.brand, category: m.category, product: ref(m), source: "Market",
    });
  }

  /* 3. Demand inflection — only where the review base is thick enough to mean something. */
  for (const d of demand) {
    if (d.momentum === null || d.momentum < 0.5 || d.recent < 60) continue;
    const isAnchor = same(d.brand, anchor);
    out.push({
      id: `demand-${d.product_id}`,
      soWhat: isAnchor ? tr(`A product to back: buying is accelerating.`, `육성 후보: 판매 속도 증가 중.`)
        : tr(`A rival is winning buyers in ${cat(d.category)}; compare its price and claims with ${anchor}'s nearest product.`, `${cat(d.category)}에서 경쟁 제품이 구매자를 모으는 중. ${anchor}의 가장 가까운 제품과 가격·소구점 비교 필요.`),
      tone: isAnchor ? "opening" : "threat",
      weight: 60 + Math.min(d.momentum, 8) * 12 + (isAnchor ? 0 : 15),
      headline: tr(`${d.brand}\u2019s ${shorten(d.name, d.brand)} is converting — reviews up ${pct(d.momentum)}`, `${d.brand} ${shorten(d.name, d.brand)}: 판매 증가 (리뷰 ${pct(d.momentum)})`),
      detail: tr(`${d.recent} reviews in the last three months against ${d.prior} in the three before — ${cat(d.category)}. Review count is the only public proxy for purchases, so this is demand moving, not visibility.`,
        `최근 3개월 리뷰 ${d.recent}건, 직전 3개월 ${d.prior}건 — ${cat(d.category)}. 리뷰 수는 판매를 가늠할 수 있는 공개 지표 → 노출보다 수요 변화로 읽음.`),
      evidence: [
        { label: tr("Last 3 months", "최근 3개월"), value: `${d.recent}` },
        { label: tr("Prior 3 months", "직전 3개월"), value: `${d.prior}` },
        { label: tr("Change", "변화"), value: pct(d.momentum) },
      ],
      brand: d.brand, category: d.category, product: ref(d), source: "Demand",
    });
  }

  /* 4. Demand draining away. */
  for (const d of demand) {
    if (d.momentum === null || d.momentum > -0.45 || d.prior < 80) continue;
    out.push({
      id: `fade-${d.product_id}`,
      soWhat: same(d.brand, anchor) ? tr(`Find out why buying is falling (price, stock or a rival) before it shows on the shelf.`, `랭킹 순위에 드러나기 전에 판매가 줄어드는 이유(가격, 재고, 경쟁 제품) 확인 필요.`)
        : tr(`A rival is losing buyers in ${cat(d.category)}.`, `${cat(d.category)}에서 경쟁 제품 판매 둔화.`),
      tone: same(d.brand, anchor) ? "threat" : "opening",
      weight: 55 + Math.abs(d.momentum) * 20,
      headline: tr(`${d.brand}\u2019s ${shorten(d.name, d.brand)} is fading — reviews down ${pct(d.momentum)}`, `${d.brand} ${shorten(d.name, d.brand)}: 판매 감소 (리뷰 ${pct(d.momentum)})`),
      detail: tr(`${d.prior} reviews three-to-six months ago, ${d.recent} since. ${
        same(d.brand, anchor) ? "This is the anchor losing purchase volume." : "A rival losing volume in a category you sell in."
      }`, `3–6개월 전 리뷰 ${d.prior}건, 이후 ${d.recent}건. ${same(d.brand, anchor) ? "기준 브랜드 판매량 감소 중." : "자사가 판매하는 카테고리에서 경쟁 제품 판매량 감소 중."}`),
      evidence: [
        { label: tr("Prior 3 months", "직전 3개월"), value: `${d.prior}` },
        { label: tr("Last 3 months", "최근 3개월"), value: `${d.recent}` },
        { label: tr("Change", "변화"), value: pct(d.momentum) },
      ],
      brand: d.brand, category: d.category, product: ref(d), source: "Demand",
    });
  }

  /* 5. Paid dependency: who is renting their visibility. Needs a week of appearances to judge. */
  const weekShares = shares.filter((s) => s.scrape_date >= (days.at(-7) ?? ""));
  const byBrand = new Map<string, { earned: number; paid: number }>();
  for (const s of weekShares) {
    const b = byBrand.get(s.brand) ?? { earned: 0, paid: 0 };
    b.earned += s.search_earned; b.paid += s.search_paid;
    byBrand.set(s.brand, b);
  }
  for (const [brand, v] of byBrand) {
    const total = v.earned + v.paid;
    if (total < 25) continue;
    const dep = v.paid / total;
    if (dep < 0.45) continue;
    out.push({
      id: `paid-${brand}`,
      soWhat: same(brand, anchor) ? tr(`${anchor}'s search visibility depends on spend.`, `${anchor} 검색 노출이 광고비에 의존.`)
        : tr(`Most of its search presence is paid, so it lasts as long as the spend.`, `검색 노출 대부분이 광고 → 광고 집행 기간에 한정.`),
      tone: same(brand, anchor) ? "watch" : "opening",
      weight: 50 + dep * 40,
      headline: tr(`${brand} is paying for ${Math.round(dep * 100)}% of its search presence`, `${brand}, 검색 노출의 ${Math.round(dep * 100)}%가 광고`),
      detail: tr(`${v.paid} of ${total} appearances across the tracked Korean-intent queries this week were paid slots. Its earned position is ${
        v.earned === 0 ? "nothing at all" : `just ${v.earned} results`
      } — the visibility stops the day the spend does.`,
        `이번 주 K-뷰티 관련 추적 검색어 노출 ${total}회 중 ${v.paid}회가 광고 구좌. 자연 노출은 ${v.earned === 0 ? "전혀 없음" : `${v.earned}건뿐`}. 광고를 멈추는 날 노출도 사라짐.`),
      evidence: [
        { label: tr("Paid slots", "광고 구좌"), value: `${v.paid}` },
        { label: tr("Earned slots", "자연 노출"), value: `${v.earned}` },
        { label: tr("Paid share", "광고 의존도"), value: `${Math.round(dep * 100)}%` },
      ],
      brand, source: "Search & Ads",
    });
  }

  /* 6. A deeper discount at the same MRP (never a pack swap). Owner 21 Oct 2026: LANEIGE's "12 price cuts" were all
     10-20% off with the MRP unchanged, i.e. a promotion that ends, so it is a watch item, not a threat. */
  for (const m of movement) {
    if (!hasPast(m.category)) continue;
    if (m.price_change_14d === null || m.price_change_14d > -0.1 || !m.same_pack) continue;
    if (!anchorCats.has(m.category) && anchorCats.size > 0) continue;
    out.push({
      id: `price-${m.product_id}-${m.category}`,
      soWhat: same(m.brand, anchor) ? tr(`A discount, not a new MRP.`, `정가 변경이 아닌 할인.`)
        : tr(`A discount with the MRP unchanged: a promotion to watch, not a new price.`, `정가는 그대로인 할인: 새 가격이 아니라 지켜볼 프로모션.`),
      tone: "watch",
      weight: 45 + Math.abs(m.price_change_14d) * 100,
      headline: tr(`${m.brand} is selling ${shorten(m.name, m.brand)} ${Math.round(Math.abs(m.price_change_14d) * 100)}% cheaper (MRP unchanged)`, `${m.brand} ${shorten(m.name, m.brand)} ${Math.round(Math.abs(m.price_change_14d) * 100)}% 할인 판매 (정가 그대로)`),
      detail: tr(`₹${m.price_14d} to ₹${m.price} at the same MRP: a discount, not a change of price list or pack size.`,
        `정가(MRP)는 그대로인데 ₹${m.price_14d} → ₹${m.price}. 가격표·용량 변경이 아닌 할인.`),
      evidence: [
        { label: tr("Was", "이전"), value: `₹${m.price_14d}` },
        { label: tr("Now", "현재"), value: `₹${m.price}` },
        { label: tr("Discount now", "현재 할인율"), value: `${m.discount_pct}%` },
      ],
      brand: m.brand, category: m.category, product: ref(m), source: "Compare",
    });
  }

  /* 7. Anchor products out of stock — invisible on shelves, which only list what Nykaa can sell. */
  for (const a of availability) {
    const isAnchor = same(a.brand, anchor);
    if (!isAnchor && (a.rating_count ?? 0) < 5000) continue;
    out.push({
      id: `oos-${a.product_id}`,
      soWhat: isAnchor ? tr(`While out of stock, its buyers may turn to rivals.`, `품절 기간 중 구매 수요가 경쟁 제품으로 이동할 수 있음.`)
        : tr(`Its buyers may look for a substitute meanwhile.`, `품절 기간 중 구매자가 대체품을 찾을 수 있음.`),
      tone: isAnchor ? "threat" : "opening",
      weight: isAnchor ? 70 + Math.min((a.rating_count ?? 0) / 1000, 30) : 40 + Math.min((a.rating_count ?? 0) / 2000, 25),
      headline: isAnchor
        ? tr(`${anchor} is out of stock on ${shorten(a.name, a.brand)}`, `${anchor} ${shorten(a.name, a.brand)} 품절`)
        : tr(`${a.brand} is out of stock on ${shorten(a.name, a.brand)}`, `${a.brand} ${shorten(a.name, a.brand)} 품절`),
      detail: isAnchor
        ? tr(`${n0(a.rating_count ?? 0)} ratings of demand with nothing to sell. Shelf rankings never show this — Nykaa only lists what it can ship.`,
          `평가 ${n0(a.rating_count ?? 0)}건만큼 수요가 있는데 팔 물건이 없음. Nykaa는 배송 가능한 제품만 진열하므로 랭킹 순위엔 드러나지 않음.`)
        : tr(`A rival's product with ${n0(a.rating_count ?? 0)} ratings is unavailable. Its buyers are shopping for a substitute right now.`,
          `평가 ${n0(a.rating_count ?? 0)}건의 경쟁 제품 품절. 구매자들이 지금 대체품을 찾는 중.`),
      evidence: [
        { label: tr("Ratings", "평가 수"), value: n0(a.rating_count ?? 0) },
        { label: tr("Price", "가격"), value: a.price ? `₹${a.price}` : "–" },
      ],
      brand: a.brand, product: ref(a), source: "Compare",
    });
  }

  /* 8. New arrivals from brands that matter. */
  const entrants = new Map<string, Movement[]>();
  for (const m of movement) {
    if (!hasPast(m.category) || !m.new_since_14d || m.rank > 60) continue;
    push(entrants, m.brand, m);
  }
  for (const [brand, list] of entrants) {
    if (list.length < 2 || same(brand, anchor)) continue;
    const cats = [...new Set(list.map((m) => cat(m.category)))];
    out.push({
      id: `entry-${brand}`,
      soWhat: tr(`Several launches entered the top lists at once.`, `단기간 다수 신제품 상위 목록 진입.`),
      tone: "watch",
      weight: 35 + list.length * 8,
      headline: tr(`${brand} put ${list.length} new products into the top 60 in two weeks`, `${brand}, 2주 만에 신제품 ${list.length}개 상위 60위 진입`),
      detail: tr(`Across ${cats.join(", ")}. Best new entry is rank ${Math.min(...list.map((m) => m.rank))}.`,
        `카테고리: ${cats.join(", ")}. 신규 진입 최고 순위 ${Math.min(...list.map((m) => m.rank))}위.`),
      evidence: [
        { label: tr("New entries", "신규 진입"), value: `${list.length}` },
        { label: tr("Best rank", "최고 순위"), value: `${Math.min(...list.map((m) => m.rank))}` },
      ],
      brand, source: "Market",
    });
  }

  /* 9. Shelf composition shifting under the anchor's feet. */
  if (today && twoWeeksAgo && today !== twoWeeksAgo) {
    const sumShare = (day: string, origin: string) =>
      shares.filter((s) => s.scrape_date === day && s.origin === origin).reduce((n, s) => n + s.slots, 0);
    const totalOn = (day: string) => shares.filter((s) => s.scrape_date === day).reduce((n, s) => n + s.slots, 0);
    const nowShare = sumShare(today, "kbeauty") / (totalOn(today) || 1);
    const thenShare = sumShare(twoWeeksAgo, "kbeauty") / (totalOn(twoWeeksAgo) || 1);
    const delta = nowShare - thenShare;
    if (Math.abs(delta) >= 0.005) {
      out.push({
        id: "origin-shift",
      soWhat: tr(`The bar any claim about Korean brands has to beat.`, `K-뷰티 브랜드 관련 모든 판단의 기준선.`),
        tone: delta > 0 ? "opening" : "watch",
        weight: 30 + Math.abs(delta) * 400,
        headline: tr(`K-beauty's share of shelf ${delta > 0 ? "rose" : "slipped"} to ${(nowShare * 100).toFixed(1)}%`, `K-뷰티 상위 100위 점유율 ${(nowShare * 100).toFixed(1)}%로 ${delta > 0 ? "상승" : "하락"}`),
        detail: tr(`From ${(thenShare * 100).toFixed(1)}% two weeks ago, across every tracked shelf. This is the baseline any claim about Korean brands has to beat.`,
          `추적 중인 전체 카테고리 기준, 2주 전 ${(thenShare * 100).toFixed(1)}%에서 변화. K-뷰티 브랜드 관련 모든 판단의 기준선.`),
        evidence: [
          { label: tr("Now", "현재"), value: `${(nowShare * 100).toFixed(1)}%` },
          { label: tr("2 weeks ago", "2주 전"), value: `${(thenShare * 100).toFixed(1)}%` },
        ],
        source: "Market",
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** Three shares for one brand on the latest day: what Nykaa gives it, what shoppers' searches give it,
 *  and what buyers give it. A brand can lead one and lose the others. */
export function threeShares(brand: string, shares: BrandShare[], demand: ProductDemand[]) {
  const days = [...new Set(shares.map((s) => s.scrape_date))].sort();
  const today = days.at(-1);
  const row = shares.find((s) => s.scrape_date === today && same(s.brand, brand));
  const recentAll = demand.reduce((n, d) => n + d.recent, 0);
  const recentBrand = demand.filter((d) => same(d.brand, brand)).reduce((n, d) => n + d.recent, 0);
  return {
    shelf: row?.share_of_shelf ?? 0,
    voice: row?.share_of_voice ?? 0,
    demand: recentAll ? recentBrand / recentAll : 0,
    slots: row?.slots ?? 0,
    bestRank: row?.best_rank ?? null,
    paidDependency: row?.paid_dependency ?? null,
    demandMeasured: demand.filter((d) => same(d.brand, brand)).length,
  };
}

/** Where rivals sell and the anchor does not: category × price band, from the brands' own catalogues. */
export function portfolioGaps(anchor: string, rows: { brand: string; category: string | null; price: number | null }[]) {
  const BANDS: [string, number, number][] = [["Under ₹500", 0, 500], ["₹500–999", 500, 1000], ["₹1,000–1,999", 1000, 2000], ["₹2,000+", 2000, Infinity]];
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))] as string[];
  return cats.map((c) => ({
    category: c,
    bands: BANDS.map(([label, lo, hi]) => {
      const inCell = rows.filter((r) => r.category === c && (r.price ?? 0) >= lo && (r.price ?? 0) < hi);
      const anchorHas = inCell.filter((r) => same(r.brand, anchor)).length;
      const rivals = new Set(inCell.filter((r) => !same(r.brand, anchor)).map((r) => r.brand));
      return { label, anchorHas, rivalBrands: rivals.size, rivalProducts: inCell.length - anchorHas };
    }),
  }));
}

/** Nykaa serves one review pool per product family; keep the strongest listing of each. */
function dedupePools(rows: ProductDemand[]): ProductDemand[] {
  const best = new Map<string, ProductDemand>();
  for (const r of rows) {
    const key = r.pool_id || r.product_id;
    const cur = best.get(key);
    if (!cur || r.lifetime > cur.lifetime) best.set(key, r);
  }
  return [...best.values()];
}

const ref = (r: { product_id: string; name: string; brand: string; url?: string | null; price?: number | null }) =>
  ({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url ?? null, price: r.price ?? null });

function shorten(name: string, brand?: string) {
  let n = name.replace(/\s*[-–,]\s*(with|for|featuring).*$/i, "").trim();
  if (brand && norm(n).startsWith(norm(brand))) n = n.slice(brand.length).replace(/^[\s-–:]+/, "");
  return n.length > 64 ? `${n.slice(0, 64).replace(/\s+\S*$/, "")}…` : n;
}
