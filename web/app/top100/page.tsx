"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { useOpenProduct, type ProductRef } from "@/components/ProductDrawer";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead } from "@/components/ui";
import { Missing, Points } from "@/components/Detail";
import { ORIGIN_LABEL, marketSet, norm } from "@/lib/brands";
import { useTiers } from "@/lib/tiers";
import { useNykaaShelf } from "@/lib/data";
import { countsIn } from "@/lib/market";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_URL, PER_SHEET, compact, inr, median, packMl, sheetCount, shortName } from "@/lib/format";
import type { ShelfRow } from "@/lib/types";
import { push } from "@/lib/group";
import { onePerRatingPool } from "@/lib/pools";
import { dayMonth, josa, tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";

type OriginKey = "all" | "kbeauty" | "local" | "global";
type Badge = "all" | "bestseller" | "new" | "paid";
const ORIGIN_CARDS = () => [
  { key: "kbeauty", title: tr("K-beauty brands", "K-뷰티 브랜드"), short: tr("K-beauty brands", "K-뷰티 브랜드"), tone: "#2c6e5a", chip: "bg-[#e4f0eb] text-[#1f5646]" },
  { key: "local", title: tr("Indian brands", "인도 브랜드"), short: tr("Indian brands", "인도 브랜드"), tone: "#e3b27c", chip: "bg-[#faefe2] text-[#8a5a22]" },
  { key: "global", title: tr("Global brands", "글로벌 브랜드"), short: tr("global brands", "글로벌 브랜드"), tone: "#a7b9cc", chip: "bg-[#e9eff5] text-[#3d5670]" },
] as const;
/** The tier tag's id (used in logic) and its wording. */
const TAG_WORD = (t: string) => tr(t, ({ Anchor: "기준", Focus: "주요", "Rival in its categories": "동일 카테고리 경쟁사", "Other K-beauty": "기타 K-뷰티" } as Record<string, string>)[t] ?? t);
const ORIGIN_CHIP: Record<string, string> = { kbeauty: "bg-[#e4f0eb] text-[#1f5646]", local: "bg-[#faefe2] text-[#8a5a22]", global: "bg-[#e9eff5] text-[#3d5670]", unknown: "bg-sunken text-muted" };
const spf = (name: string) => { const m = name.match(/SPF\s*(\d{2,3})/i); return m ? Number(m[1]) : null; };
const page = (rank: number) => Math.ceil(rank / 20);
/** MRP per 100 ml/g (per sheet for sheet masks), from the pack size, or from the name when Nykaa's listing leaves the
 *  size out (owner 20 Oct 2026: the sizes come from each product's own page from the 21 Oct run). */
const unit = (r: ShelfRow) => {
  const p = r.mrp ?? r.price; if (!p) return null;
  if (PER_SHEET.has(r.subcategory)) { const c = sheetCount(r.pack_size, r.name); return { v: p / c.n, per: tr("sheet", "장"), est: c.est }; }
  const ml = packMl(r.pack_size) ?? packMl(r.name); return ml ? { v: (p / ml) * 100, per: "100 ml/g", est: !packMl(r.pack_size) } : null;
};
const ref = (r: ShelfRow): ProductRef => ({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url, image: r.image_url, price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count, usp: r.usp_summary, phrases: r.review_key_phrases, splitup: r.review_splitup, madeIn: r.country_name });

function Stars({ v }: { v: number | null }) {
  if (v === null) return <Missing>{tr("no rating", "평점 없음")}</Missing>;
  return <span className="whitespace-nowrap tabular"><span className="text-[#d49a00]">★</span> {v.toFixed(1)}</span>;
}

/** Summary of one origin group within a category: the reference dashboard's three cards, in English and from our data. */
function originSummary(rs: ShelfRow[], total: number, isSunscreen: boolean) {
  if (!rs.length) return null;
  const prices = rs.map((r) => r.price ?? 0).filter((p) => p > 0).sort((a, b) => a - b);
  const q = (f: number) => prices[Math.min(prices.length - 1, Math.floor(f * (prices.length - 1)))];
  const byBrand = new Map<string, ShelfRow[]>(); rs.forEach((r) => push(byBrand, r.brand, r));
  const brands = [...byBrand.entries()].map(([b, g]) => ({ b, n: g.length, ratings: onePerRatingPool(g).reduce((a, r) => a + (r.rating_count ?? 0), 0), ranks: g.map((r) => r.rank).sort((x, y) => x - y) }));
  const mostReviewed = [...brands].sort((a, b) => b.ratings - a.ratings)[0];
  const mostListed = [...brands].sort((a, b) => b.n - a.n || a.ranks[0] - b.ranks[0])[0];
  const rated = rs.filter((r) => r.rating !== null);
  const spfs = isSunscreen ? rs.map((r) => spf(r.name)).filter((x): x is number => x !== null) : [];
  const spfMode = spfs.length ? [...new Set(spfs)].map((v) => ({ v, n: spfs.filter((x) => x === v).length })).sort((a, b) => b.n - a.n)[0] : null;
  const discounts = rs.map((r) => r.discount_pct ?? 0);
  return {
    n: rs.length, share: rs.length / Math.max(1, total), top20: rs.filter((r) => r.rank <= 20).length, best: Math.min(...rs.map((r) => r.rank)),
    band: prices.length ? [q(0.25), q(0.75)] as const : null, median: median(prices),
    mostReviewed, mostListed, avgRating: rated.length ? rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length : null,
    avgDiscount: discounts.reduce((a, b) => a + b, 0) / discounts.length, paid: rs.filter((r) => r.is_ad).length,
    spf: spfMode ? { ...spfMode, of: spfs.length } : null,
  };
}

/** Top 100 (owner 20 Oct 2026: "include the tab that contains the top 100 in every category… it was there before").
 *  The Round 1–4 "Top by category" page brought back as its own tab: each list exactly as the Nykaa app shows it,
 *  every one of its 100 places. Listings Nykaa files under another category stay in place, marked; one click hides them
 *  and renumbers, which is the ranking the Market tab's shares use. */
function TopPage() {
  const shelf = useNykaaShelf(); const open = useOpenProduct();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const set = useMemo(() => marketSet(rows), [rows]);
  const tiers = useTiers(useMemo(() => [...new Set(rows.map((r) => r.brand))], [rows]));
  // the shared tiering: anchor, focus brand, another tracked Korean brand, or a rival holding many places in the anchor's categories
  const tagOf = (b: string) => (tiers.isPinned(b) ? "Anchor" : tiers.isFocus(b) ? "Focus" : set.tier(b) === "rival" ? "Rival in its categories" : set.tier(b) ? "Other K-beauty" : null);
  const [cat, setCat] = useState<string>(() => { const c = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("cat"); return c && CATEGORIES.includes(c) ? c : CATEGORIES[0]; });
  useEffect(() => { window.history.replaceState(null, "", `?cat=${cat}`); }, [cat]);
  const [ownOnly, setOwnOnly] = useState(false);
  const [noAds, setNoAds] = useState(false);
  const [origin, setOrigin] = useState<OriginKey>("all");
  const [badge, setBadge] = useState<Badge>("all");
  const [concern, setConcern] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [inView, setInView] = useState(false);

  const catRows = useMemo(() => rows.filter((r) => r.subcategory === cat).sort((a, b) => a.rank - b.rank), [rows, cat]);
  // with ads hidden, positions are renumbered so they read as the order a shopper sees without sponsored slots
  const base = useMemo(() => {
    const list = catRows.filter((r) => (!noAds || !r.is_ad) && (!ownOnly || countsIn(r.subcategory, r.nykaa_l3)));
    return list.map((r, i) => ({ r, pos: noAds || ownOnly ? i + 1 : r.rank }));
  }, [catRows, noAds, ownOnly]);
  const elsewhere = catRows.filter((r) => !countsIn(r.subcategory, r.nykaa_l3)).length;
  const concerns = useMemo(() => {
    const c = new Map<string, number>(); catRows.forEach((r) => (r.concerns ?? []).forEach((x) => c.set(x, (c.get(x) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k]) => k);
  }, [catRows]);
  const shown = base.filter(({ r }) =>
    (origin === "all" || r.origin === origin) &&
    (badge === "all" || (badge === "bestseller" ? r.is_bestseller : badge === "new" ? r.is_new_tag : r.is_ad)) &&
    (!concern || (r.concerns ?? []).includes(concern)) &&
    (!inView || tiers.inSet(r.brand)) &&
    (!q || `${r.brand} ${r.name}`.toLowerCase().includes(q.toLowerCase())));
  const summaryRows = base.map((b) => b.r);
  const isSun = cat === "sunscreen";
  const anchorRows = catRows.filter((r) => norm(r.brand) === norm(set.anchor));

  const exportCsv = () => {
    const head = ["position", "nykaa_rank", "page", "origin", "brand", "product", "badges", "concerns", "mrp", "price", "discount_pct", "pack_size", "mrp_per_unit", "unit", "ratings", "rating", "url"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = shown.map(({ r, pos }) => [pos, r.rank, `P${page(r.rank)}`, ORIGIN_LABEL[r.origin], r.brand, r.name,
      [r.is_ad && "AD", r.is_bestseller && "BESTSELLER", r.is_new_tag && "NEW"].filter(Boolean).join(" "), (r.concerns ?? []).join("; "),
      r.mrp, r.price, r.discount_pct, r.pack_size, unit(r) ? Math.round(unit(r)!.v) : "", unit(r)?.per ?? "", r.rating_count, r.rating, r.url].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `nykaa-top100-${cat}-${rows[0]?.scrape_date ?? ""}.csv`; a.click();
  };

  const asOf = rows[0] ? dayMonth(rows[0].scrape_date) : undefined;
  return (
    <Shell active="Top 100" asOf={asOf}>
      <PageHead eyebrow={tr("Top 100", "상위 100위")} title={tr("Every list's top 100, as Nykaa shows it", "목록별 상위 100위 (Nykaa 노출 순서)")} sub={tr("Each tracked list's top 100 on Nykaa, in the order the Nykaa app shows them tonight, with who holds it by origin. Who is winning on buying is on the Market tab.", "추적 중인 목록별 Nykaa 상위 100위. 오늘 밤 Nykaa 앱 순서 그대로, 브랜드 국적별 점유 포함. 판매 기준 승자는 시장 탭.")} />
      {!shelf.data ? <Loading what={tr("the shelves", "랭킹 데이터")} /> : (
        <>
          <div className="mt-7 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => { setCat(c); setConcern(null); }} aria-pressed={cat === c}
                className={`rounded-full px-4 py-2 text-[13.5px] transition ${cat === c ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>{CATEGORY_LABEL[c]}</button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{CATEGORY_LABEL[cat]} · {tr("who holds the top 100", "상위 100위 점유")}{noAds ? tr(", sponsored slots removed", ", 광고 구좌 제외") : ""}{ownOnly ? tr(", other categories' listings removed", ", 다른 카테고리 제품 제외") : ""}</div>
              <h2 className="mt-2 font-display text-[22px] font-semibold leading-snug tracking-[-0.015em] md:text-[25px]">{(() => {
                const by = ORIGIN_CARDS().map((o) => ({ o, n: summaryRows.filter((r) => r.origin === o.key).length })).sort((a, b) => b.n - a.n);
                const best = summaryRows.find((r) => r.origin === "kbeauty");
                const fN = summaryRows.filter((r) => tiers.inSet(r.brand)).length;
                const bestPos = best ? base.find((b) => b.r === best)?.pos : null;
                const anchorPos = anchorRows.length ? base.find((b) => b.r === anchorRows[0])?.pos ?? anchorRows[0].rank : null;
                return tr(`${by[0].o.title} hold ${by[0].n} of the ${summaryRows.length} places (the ${tiers.focus.length + 1} focus brands hold ${fN})${best ? `; the top K-beauty product is ${best.brand} at #${bestPos}` : "; no K-beauty product ranks"}${anchorPos ? `, and ${set.anchor}'s best is #${anchorPos}` : `, and ${set.anchor} is not in this top 100`}.`,
                  `${summaryRows.length}자리 중 ${by[0].n}자리가 ${by[0].o.title} (주요 브랜드 ${tiers.focus.length + 1}곳은 ${fN}자리)${best ? `. K-뷰티 최고 순위 제품은 ${best.brand} (#${bestPos})` : ". 순위에 든 K-뷰티 제품 없음"}${anchorPos ? `, ${set.anchor} 최고 순위는 #${anchorPos}` : `, ${josa(set.anchor, "은/는")} 이 상위 100위에 없음`}`);
              })()}</h2>
            </div>
            <a href={CATEGORY_URL[cat]} target="_blank" rel="noreferrer" className="text-[12.5px] text-ink-2 underline underline-offset-4 hover:text-ink">{tr("This listing on Nykaa ↗", "Nykaa에서 이 목록 보기 ↗")}</a>
          </div>
          <section className="mt-3 grid gap-3 lg:grid-cols-3">
            {ORIGIN_CARDS().map((o) => {
              const g = summaryRows.filter((r) => r.origin === o.key); const s = originSummary(g, summaryRows.length, isSun);
              const anchorHere = o.key === "kbeauty" ? anchorRows.filter((r) => !noAds || !r.is_ad) : [];
              return (
                <div key={o.key} className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line" style={{ borderTop: `3px solid ${o.tone}` }}>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[16px] font-semibold">{o.title}</span>
                    {s && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.chip}`}>{tr(`${s.n} listings`, `${s.n}개`)} · {Math.round(s.share * 100)}%</span>}
                  </div>
                  {!s ? <p className="mt-3 text-[13px] text-muted">{tr(`No ${o.short} in this top 100.`, `이 상위 100위에 ${o.short} 없음.`)}</p> : (
                    <>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                        <div><dt className="text-muted">{tr("Price band", "가격대")}</dt><dd className="font-display text-[17px] font-semibold tabular">{s.band ? `${inr(s.band[0])}–${inr(s.band[1])}` : <Missing>{tr("no prices", "가격 없음")}</Missing>}</dd><dd className="text-[11px] text-muted">{tr("middle half of listings", "제품 중간 50%")}</dd></div>
                        <div><dt className="text-muted">{tr("Placement", "순위")}</dt><dd className="font-display text-[17px] font-semibold tabular">{tr(`${s.top20} in top 20`, `상위 20위 ${s.top20}개`)}</dd><dd className="text-[11px] text-muted">{tr("best", "최고")} #{s.best}{s.paid ? tr(` · ${s.paid} paid slot${s.paid === 1 ? "" : "s"}`, ` · 광고 ${s.paid}자리`) : ""}</dd></div>
                        <div><dt className="text-muted">{tr("Most reviewed", "리뷰 최다")}</dt><dd className="font-display text-[15px] font-semibold">{s.mostReviewed.b}</dd><dd className="text-[11px] text-muted">{tr(`${compact(s.mostReviewed.ratings)} ratings across ${s.mostReviewed.n} (sizes counted once)`, `${s.mostReviewed.n}개 제품 평가 ${compact(s.mostReviewed.ratings)}건 (용량별 중복 제외)`)}</dd></div>
                        <div><dt className="text-muted">{tr("Most listings", "제품 수 최다")}</dt><dd className="font-display text-[15px] font-semibold">{s.mostListed.b}</dd><dd className="text-[11px] text-muted">{tr(`${s.mostListed.n} of ${s.n}`, `${s.n}개 중 ${s.mostListed.n}개`)} · {tr("ranks", "순위")} {s.mostListed.ranks.slice(0, 4).map((x) => `#${x}`).join(", ")}</dd></div>
                        <div><dt className="text-muted">{tr("Avg rating · discount", "평균 별점 · 할인율")}</dt><dd className="font-display text-[15px] font-semibold tabular">{s.avgRating ? `★ ${s.avgRating.toFixed(2)}` : tr("no rating", "평점 없음")} · {Math.round(s.avgDiscount)}%</dd></div>
                        {s.spf ? <div><dt className="text-muted">{tr("Usual SPF", "주된 SPF")}</dt><dd className="font-display text-[15px] font-semibold tabular">SPF {s.spf.v}</dd><dd className="text-[11px] text-muted">{tr(`${s.spf.n} of ${s.spf.of} that state one`, `SPF 표기 제품 ${s.spf.of}개 중 ${s.spf.n}개`)}</dd></div>
                          : <div><dt className="text-muted">{tr("Typical price", "보통 가격")}</dt><dd className="font-display text-[15px] font-semibold tabular">{inr(s.median)}</dd></div>}
                      </dl>
                      <Points className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-2" items={[
                        <><b className="text-ink">{s.mostReviewed.b}</b>: {tr(`most ratings (${compact(s.mostReviewed.ratings)}, ranks ${s.mostReviewed.ranks.slice(0, 3).map((x) => `#${x}`).join(", ")})`, `평가 최다 (${compact(s.mostReviewed.ratings)}건, 순위 ${s.mostReviewed.ranks.slice(0, 3).map((x) => `#${x}`).join(", ")})`)}</>,
                        ...(s.mostListed.b !== s.mostReviewed.b ? [<><b className="text-ink">{s.mostListed.b}</b>: {tr(`most listings (${s.mostListed.n})`, `제품 수 최다 (${s.mostListed.n}개)`)}</>] : []),
                        (() => { const fb = new Map<string, number[]>(); g.filter((r) => tiers.inSet(r.brand) && !tiers.isPinned(r.brand)).forEach((r) => push(fb, r.brand, r.rank));
                          const xs = [...fb.entries()].sort((a, b) => b[1].length - a[1].length || Math.min(...a[1]) - Math.min(...b[1]));
                          return <><b className="text-ink">{tr("Focus brands here", "이 그룹의 주요 브랜드")}</b>: {xs.length ? xs.slice(0, 4).map(([b, rk]) => tr(`${b} ${rk.length} (best #${Math.min(...rk)})`, `${b} ${rk.length}개 (최고 #${Math.min(...rk)})`)).join(" · ") : tr("none", "없음")}{xs.length > 4 ? tr(` · +${xs.length - 4} more`, ` · +${xs.length - 4}곳`) : ""}</>; })(),
                        ...(o.key === "kbeauty" ? [<><b className="text-ink">{set.anchor}</b>: {anchorHere.length ? tr(`${anchorHere.length} listing${anchorHere.length === 1 ? "" : "s"}, ${anchorHere.map((r) => `#${r.rank}`).join(", ")}`, `${anchorHere.length}개, ${anchorHere.map((r) => `#${r.rank}`).join(", ")}`) : tr("not in this top 100", "이 상위 100위에 없음")}</>] : []),
                      ]} />
                    </>
                  )}
                </div>
              );
            })}
          </section>

          <Card className="mt-5">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search brand or product", "브랜드 또는 제품 검색")} className="w-64 rounded-xl border border-line bg-page px-3.5 py-2 text-[13px] outline-none focus:border-accent-strong" />
              <button onClick={() => setNoAds(!noAds)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] ring-1 transition ${noAds ? "bg-[#fbecea] text-bad ring-bad/40" : "text-ink-2 ring-line hover:bg-sunken"}`}>⊘ {tr("Hide sponsored slots", "광고 구좌 숨기기")}</button>
              {elsewhere > 0 && <button onClick={() => setOwnOnly(!ownOnly)} title={tr("Nykaa files these products under another category; the Market tab counts them there", "Nykaa가 다른 카테고리로 분류한 제품. 시장 탭은 그 카테고리에서 집계")} className={`rounded-full px-3.5 py-1.5 text-[12.5px] ring-1 transition ${ownOnly ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:bg-sunken"}`}>{tr(`Hide ${elsewhere} filed under another category`, `다른 카테고리 ${elsewhere}개 숨기기`)}</button>}
              <Chips value={origin} onChange={setOrigin} options={[["all", tr("All origins", "전체 국적")], ["kbeauty", tr("K-beauty", "K-뷰티")], ["local", tr("Indian", "인도")], ["global", tr("Global", "글로벌")]]} />
              <Chips value={badge} onChange={setBadge} options={[["all", tr("All", "전체")], ["bestseller", tr("Bestseller", "베스트셀러")], ["new", tr("New", "신상품")], ["paid", tr("Sponsored", "광고")]]} />
              <button onClick={() => setInView(!inView)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] ring-1 transition ${inView ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:bg-sunken"}`}>{tr("Focus brands only", "주요 브랜드만")}</button>
              <span className="ml-auto text-[12.5px] text-muted tabular"><b className="text-ink">{shown.length}</b> / {base.length} {tr("shown", "표시")}</span>
              <button onClick={exportCsv} className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-sunken">⇩ CSV</button>
            </div>
            {concerns.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5 text-[12px]">
                <span className="mr-1 text-muted">{tr("Targets:", "타깃 고민:")}</span>
                {concerns.map((c) => <button key={c} onClick={() => setConcern(concern === c ? null : c)} className={`rounded-full px-2.5 py-1 ring-1 transition ${concern === c ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:bg-sunken"}`}>{tx(c)}</button>)}
                <span className="ml-2 text-[11px] text-muted">{tr("from Nykaa’s product pages; products without them never match", "Nykaa 상품 페이지 표기 기준. 표기 없는 제품은 해당 없음")}</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] text-[13px]">
                <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted [&>th]:whitespace-nowrap">
                  <th className="px-4 py-3 text-right">#</th><th className="px-2 py-3">{tr("Page", "페이지")}</th><th className="px-2 py-3">{tr("Origin", "국적")}</th><th className="px-3 py-3">{tr("Brand", "브랜드")}</th>
                  <th className="px-3 py-3">{tr("Product", "제품")}</th><th className="px-2 py-3">{tr("Badge", "배지")}</th>{isSun && <th className="px-2 py-3 text-right">SPF</th>}<th className="px-3 py-3">{tr("Targets", "타깃 고민")}</th>
                  <th className="px-2 py-3 text-right">{tr("MRP", "정가")}</th><th className="px-2 py-3 text-right">{tr("Sells at", "판매가")}</th><th className="px-2 py-3 text-right">{tr("Off", "할인")}</th>
                  <th className="px-2 py-3 text-right">{tr("Size", "용량")}</th><th className="px-2 py-3 text-right">{tr("MRP per unit", "단위 정가")}</th><th className="px-2 py-3 text-right">{tr("Ratings", "평가 수")}</th><th className="px-4 py-3 text-right">{tr("Rating", "별점")}</th>
                </tr></thead>
                <tbody>
                  {shown.map(({ r, pos }) => {
                    const tag = tagOf(r.brand); const anchor = tag === "Anchor";
                    return (
                      <tr key={r.product_id} onClick={() => open(ref(r))} className={`cursor-pointer border-b border-line/70 align-top hover:bg-page ${anchor ? "bg-[#f3f7fd]" : ""}`}>
                        <td className="px-4 py-2.5 text-right tabular"><b>{pos}</b>{pos !== r.rank && <div className="text-[10.5px] text-muted">Nykaa #{r.rank}</div>}</td>
                        <td className="px-2 py-2.5"><span className="rounded border border-line px-1.5 text-[11px] text-muted tabular">P{page(r.rank)}</span></td>
                        <td className="px-2 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORIGIN_CHIP[r.origin]}`}>{ORIGIN_LABEL[r.origin]}</span></td>
                        <td className="px-3 py-2.5 font-medium">{r.brand}{tag && <div className={`text-[10px] font-semibold uppercase tracking-[0.05em] ${tag === "Focus" || tag === "Anchor" ? "text-accent-strong" : "text-muted"}`}>{TAG_WORD(tag)}</div>}</td>
                        <td className="max-w-[340px] px-3 py-2.5 leading-snug">{shortName(r.name, r.brand)}{!countsIn(r.subcategory, r.nykaa_l3) && <div className="text-[11px] text-muted">{tr(`Nykaa files it under ${r.nykaa_l3}`, `Nykaa 분류: ${r.nykaa_l3}`)}</div>}</td>
                        <td className="px-2 py-2.5"><div className="flex flex-col items-start gap-1">
                          {r.is_ad && <span className="rounded bg-[#fff4d6] px-1.5 text-[10.5px] font-semibold text-[#8a6100]">{tr("SPONSORED", "광고")}</span>}
                          {r.is_bestseller && <span className="rounded bg-[#fce8f1] px-1.5 text-[10.5px] font-semibold text-[#b03a72]">{tr("BESTSELLER", "베스트셀러")}</span>}
                          {r.is_new_tag && <span className="rounded bg-[#e6effb] px-1.5 text-[10.5px] font-semibold text-[#1f5fae]">{tr("NEW", "신상품")}</span>}
                          {!r.is_ad && !r.is_bestseller && !r.is_new_tag && <span className="text-[11px] text-muted">{tr("none", "없음")}</span>}
                        </div></td>
                        {isSun && <td className="px-2 py-2.5 text-right tabular">{spf(r.name) ?? <Missing>{tr("not stated", "표기 없음")}</Missing>}</td>}
                        <td className="px-3 py-2.5"><div className="flex max-w-[220px] flex-wrap gap-1">{(r.concerns ?? []).slice(0, 3).map((c) => <span key={c} className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">{tx(c)}</span>)}{!r.concerns?.length && <Missing>{tr("not listed", "표기 없음")}</Missing>}</div></td>
                        <td className="px-2 py-2.5 text-right font-medium tabular">{r.mrp ? inr(r.mrp) : inr(r.price)}</td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-2">{r.price && r.mrp && r.price < r.mrp ? inr(r.price) : <span className="text-[11px] text-muted">{tr("same", "동일")}</span>}</td>
                        <td className="px-2 py-2.5 text-right tabular">{r.discount_pct ? <span className="text-good">{Math.round(r.discount_pct)}%</span> : <span className="text-[11px] text-muted">{tr("none", "없음")}</span>}</td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-2">{r.pack_size ?? (packMl(r.name) ? <span title={tr("Read from the product name; Nykaa's listing leaves the size out", "상품명 기준 용량 (Nykaa 목록에 미표기)")}>{packMl(r.name)} ml/g*</span> : <Missing>{tr("not on Nykaa's list", "Nykaa 목록에 없음")}</Missing>)}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right tabular text-ink-2">{(() => { const u = unit(r); return u ? <>₹{Math.round(u.v).toLocaleString("en-IN")}<span className="text-[10.5px] text-muted">/{u.per}{u.est ? "*" : ""}</span></> : <Missing>{tr("no size", "용량 없음")}</Missing>; })()}</td>
                        <td className="px-2 py-2.5 text-right tabular">{r.rating_count ? r.rating_count.toLocaleString("en-US") : <Missing>{tr("none yet", "아직 없음")}</Missing>}</td>
                        <td className="px-4 py-2.5 text-right"><Stars v={r.rating} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!shown.length && <p className="px-5 py-6 text-[13px] text-muted">{tr("Nothing matches these filters.", "필터에 맞는 제품 없음")}</p>}
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-3 text-[11.5px] text-muted">
              <span>{tr(`Nykaa app ranking, top 100, collected ${asOf}. Positions are Nykaa's own; with a "hide" switch on, the list is renumbered and Nykaa's position shows underneath. Click a row for its rank history, demand and reviews.`, `Nykaa 앱 순위 상위 100위, ${asOf} 수집. 순위는 Nykaa 기준, 숨기기를 켜면 다시 번호를 매기고 Nykaa 순위는 아래 표시. 행을 누르면 순위 이력·수요·리뷰`)}</span>
              <span>{tr("Origin: brand classification · Badges: Nykaa’s own tags on the listing · * size read from the product name (Nykaa’s list leaves it out; from 21 Oct it comes from each product’s own page)", "국적: 브랜드 분류 · 배지: 상품에 붙은 Nykaa 태그 · * 상품명에서 읽은 용량 (Nykaa 목록에 없음, 10월 21일부터 상품 페이지에서 채움)")}</span>
            </div>
          </Card>
        </>
      )}
    </Shell>
  );
}

function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-full bg-sunken p-0.5 ring-1 ring-line">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-full px-3 py-1 text-[12.5px] transition ${value === v ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

export default function Page() {
  return <AuthGate><TopPage /></AuthGate>;
}
