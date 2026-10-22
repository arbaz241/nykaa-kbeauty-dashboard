"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, Verdict } from "./ui";
import { ActionSection } from "./Report";
import { Def } from "./Tiered";
import { BrandQuick, DetailsButton, ProductQuick } from "./Quick";
import { TrackedLink } from "./TrackedProducts";
import { norm } from "@/lib/brands";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_URL, pct, shortName, signed } from "@/lib/format";
import { catsOn, placesOn, type FlowRow } from "@/lib/market";
import { reviewTrend } from "@/lib/profile";
import { brandGrowth, estNote, fillContext } from "@/lib/fill";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** K-beauty on Nykaa (owner 21 Oct 2026): the tab is about Korean brands as a whole, not a second comparison page.
 *  How big K-beauty is, where it sells, which Korean brand leads each category, then every Korean brand in one list.
 *  Brand-against-brand comparison lives on Competitive analysis; categories for every origin live on Market. */

const catName = (c: string) => CATEGORY_LABEL[c] ?? c;
const same = (a: string, b: string) => norm(a) === norm(b);
/** Skincare = the lists under Nykaa's Skin menu (lip care included); the rest are makeup. */
export const isSkin = (c: string) => (CATEGORY_URL[c] ?? "").includes("/skin/");
const short = (name: string, brand: string) => shortName(name, brand).split(/,| - | with |-(?=[A-Z])/)[0];

export interface KCat {
  cat: string; total: number; kValue: number; kShare: number;
  /** Korean products and brands in today's top 100 of the category (own-category listings) */
  products: number; brands: number;
  korean: { brand: string; value: number; share: number; ofKorean: number; best: FlowRow }[];
  anchor: { place: number | null; ofKorean: number; share: number; best: FlowRow | null; rank: number | null };
}
export interface KBrand {
  b: string; value: number; ofKorean: number; ofAll: number; skinValue: number; places: number; placesD: number; before: number; isNew: boolean;
  strong: { c: string; s: number } | null; best: FlowRow | null; bestShare: number; growth: number | null; estimated: number; estText: string;
}

/** Everything the K-beauty tab shows, from the shared market data (same buying window and rules as every tab). */
export function useKBeauty(anchor: string) {
  const { ready, win, flow: allFlow, shelf: today, ix, dims, pool, latest, flowSpan, originOf } = useMarket();
  return useMemo(() => {
    if (!ready || !win) return null;
    const isK = (b: string) => originOf(b) === "kbeauty";
    const flow = allFlow.filter((r) => r.value > 0 && CATEGORIES.includes(r.subcategory));
    const shelf = today.filter((r) => CATEGORIES.includes(r.subcategory));
    const allValue = flow.reduce((a, r) => a + r.value, 0);
    const catTotal = new Map<string, number>(); for (const r of flow) catTotal.set(r.subcategory, (catTotal.get(r.subcategory) ?? 0) + r.value);

    const cats: KCat[] = CATEGORIES.map((cat) => {
      const rows = flow.filter((r) => r.subcategory === cat);
      const total = catTotal.get(cat) ?? 0;
      const by = new Map<string, { brand: string; v: number; best: FlowRow }>();
      for (const r of rows) {
        if (r.origin !== "kbeauty") continue;
        const k = norm(r.brand); const c = by.get(k);
        if (!c) by.set(k, { brand: r.brand, v: r.value, best: r }); else { c.v += r.value; if (r.value > c.best.value) c.best = r; }
      }
      const kValue = [...by.values()].reduce((a, x) => a + x.v, 0);
      const korean = [...by.values()].sort((a, b) => b.v - a.v).map((x) => ({ brand: x.brand, value: x.v, share: total ? x.v / total : 0, ofKorean: kValue ? x.v / kValue : 0, best: x.best }));
      const onList = shelf.filter((r) => r.subcategory === cat && r.origin === "kbeauty");
      const i = korean.findIndex((x) => same(x.brand, anchor));
      const rank = shelf.filter((r) => r.subcategory === cat && same(r.brand, anchor)).sort((a, b) => a.rank - b.rank)[0]?.rank ?? null;
      return { cat, total, kValue, kShare: total ? kValue / total : 0, products: new Set(onList.map((r) => r.product_id)).size, brands: new Set(onList.map((r) => norm(r.brand))).size, korean,
        anchor: { place: i >= 0 ? i + 1 : null, ofKorean: i >= 0 ? korean[i].ofKorean : 0, share: i >= 0 ? korean[i].share : 0, best: i >= 0 ? korean[i].best : null, rank } };
    }).sort((a, b) => b.kValue - a.kValue || b.products - a.products);

    const kValue = cats.reduce((a, c) => a + c.kValue, 0);
    const c0 = catsOn(ix, win.start); const c1 = catsOn(ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
    const p0 = placesOn(ix, dims, win.start, both); const p1 = placesOn(ix, dims, win.end, both); const pAll = placesOn(ix, dims, win.end);
    const pick = (p: Map<string, number>, b: string) => [...p.entries()].find(([k]) => same(k, b))?.[1] ?? 0;
    const fx = latest ? fillContext(pool, latest) : null;
    const names = new Map<string, string>();
    for (const r of shelf) if (r.origin === "kbeauty") names.set(norm(r.brand), r.brand);
    for (const r of flow) if (r.origin === "kbeauty" && !names.has(norm(r.brand))) names.set(norm(r.brand), r.brand);
    const brands: KBrand[] = [...names.values()].map((b) => {
      const own = flow.filter((r) => same(r.brand, b));
      const value = own.reduce((a, r) => a + r.value, 0);
      const byCat = new Map<string, number>(); for (const r of own) byCat.set(r.subcategory, (byCat.get(r.subcategory) ?? 0) + r.value);
      const strong = [...byCat.entries()].map(([c, v]) => ({ c, s: v / (catTotal.get(c) || 1) })).sort((x, y) => y.s - x.s)[0] ?? null;
      const best = [...own].sort((x, y) => y.value - x.value)[0] ?? null;
      // owner 21 Oct 2026, no blank growth: cut-off big sellers count at an estimated year-ago base (lib/fill)
      const t = fx ? brandGrowth(fx, pool, b) : null;
      const before = pick(p0, b); const now = pick(p1, b);
      return { b, value, ofKorean: kValue ? value / kValue : 0, ofAll: allValue ? value / allValue : 0, skinValue: own.filter((r) => isSkin(r.subcategory)).reduce((a, r) => a + r.value, 0), places: pick(pAll, b), placesD: now - before, before, isNew: before === 0 && now > 0 && value === 0, strong, best,
        bestShare: best ? best.value / (catTotal.get(best.subcategory) || 1) : 0, growth: t && t.products + t.estimated >= 2 && t.base >= 30 ? t.change : null, estimated: t?.estimated ?? 0, estText: t ? estNote(t) : "" };
    }).sort((a, b) => b.value - a.value || b.places - a.places);
    const kTrend = latest ? reviewTrend(pool.filter((p) => isK(p.brand)), latest) : null;
    const allTrend = latest ? reviewTrend(pool, latest) : null;
    const kSkin = brands.reduce((a, b) => a + b.skinValue, 0);
    return { cats, brands, allValue, kValue, kSkin, kShare: allValue ? kValue / allValue : 0,
      products: new Set(shelf.filter((r) => r.origin === "kbeauty").map((r) => r.product_id)).size,
      kGrowth: kTrend && kTrend.products ? kTrend.change : null, allGrowth: allTrend?.change ?? null, recentLabel: kTrend?.recentLabel ?? "",
      span: flowSpan ? `${dayMonth(flowSpan.start)}–${dayMonth(flowSpan.end)}` : "", start: win.start, isK };
  }, [ready, win, allFlow, today, ix, dims, pool, latest, flowSpan, originOf, anchor]);
}
export type KBeauty = NonNullable<ReturnType<typeof useKBeauty>>;

/** Where a brand ranks among the Korean brands, over every category or skincare only. */
export function kRank(k: KBeauty, brand: string, skin = false) {
  const v = (b: KBrand) => (skin ? b.skinValue : b.value);
  const ranked = k.brands.filter((b) => v(b) > 0).sort((a, b) => v(b) - v(a));
  const i = ranked.findIndex((b) => same(b.b, brand));
  return { place: i >= 0 ? i + 1 : null, of: ranked.length };
}

/** The green band: K-beauty on Nykaa in one sentence and four short points (owner 22 Oct: no frozen-ratings aside,
 *  no "Korean buying"; a brand's part of K-beauty is "of all K-beauty", defined once in the ranking's note). */
export function KSummary({ k, anchor }: { k: KBeauty; anchor: string }) {
  const biggest = k.cats.find((c) => c.kValue > 0);
  const lead = [...k.brands].sort((a, b) => b.value - a.value)[0];
  const me = k.brands.find((b) => same(b.b, anchor));
  const all = kRank(k, anchor); const skin = kRank(k, anchor, true);
  return (
    <Verdict eyebrow={tr("K-beauty on Nykaa", "Nykaa의 K-뷰티")}
      points={[
        tr(<><b className="text-on-brand">{k.brands.length} Korean brands</b> have {k.products} products in today&rsquo;s top 100s.</>, <><b className="text-on-brand">K-뷰티 브랜드 {k.brands.length}곳</b>, 오늘 상위 100위 제품 {k.products}개.</>),
        lead && tr(<><b className="text-on-brand">#1 Korean brand:</b> {lead.b}, {pct(lead.ofKorean, 0)} of all K-beauty{lead.best ? <>, led by {short(lead.best.name, lead.b)}</> : null}.</>, <><b className="text-on-brand">K-뷰티 1위:</b> {lead.b}, K-뷰티 전체의 {pct(lead.ofKorean, 0)}{lead.best ? <> · 대표 {short(lead.best.name, lead.b)}</> : null}.</>),
        k.kGrowth !== null && tr(<><b className="text-on-brand">Growth:</b> Korean products&rsquo; reviews {signed(k.kGrowth)} vs {signed(k.allGrowth)} for everything we follow ({k.recentLabel} vs a year earlier).</>, <><b className="text-on-brand">성장:</b> K-뷰티 제품 리뷰 {signed(k.kGrowth)}, 추적 제품 전체 {signed(k.allGrowth)} ({k.recentLabel}, 전년 대비).</>),
        me && all.place && tr(<><b className="text-on-brand">{anchor}:</b> #{all.place} of {all.of} Korean brands{skin.place ? ` (#${skin.place} of ${skin.of} in skincare)` : ""}, {pct(me.ofKorean, 1)} of all K-beauty.</>, <><b className="text-on-brand">{anchor}:</b> K-뷰티 브랜드 {all.of}곳 중 {all.place}위{skin.place ? ` (스킨케어 ${skin.of}곳 중 ${skin.place}위)` : ""}, K-뷰티 전체의 {pct(me.ofKorean, 1)}.</>),
      ].filter(Boolean) as React.ReactNode[]}>
      {tr(<>Korean brands take about {pct(k.kShare, 0)} of all buying in our {CATEGORIES.length} categories{biggest ? <>; {catName(biggest.cat).toLowerCase()} is their biggest category, {pct(biggest.kValue / (k.kValue || 1), 0)} of everything they sell here</> : null}.</>,
        <>추적 {CATEGORIES.length}개 카테고리 전체 판매 중 K-뷰티 약 {pct(k.kShare, 0)}{biggest ? <>. 최대 카테고리 {catName(biggest.cat)}, K-뷰티 판매의 {pct(biggest.kValue / (k.kValue || 1), 0)}</> : null}.</>)}
    </Verdict>
  );
}

/** Top 15 Korean brands in rank order (owner 22 Oct: a ranking first, the anchor in its real place, highlighted). */
export function KRanking({ k, anchor }: { k: KBeauty; anchor: string }) {
  const [skin, setSkin] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const v = (b: KBrand) => (skin ? b.skinValue : b.value);
  const tot = skin ? k.kSkin : k.kValue;
  const ranked = [...k.brands].filter((b) => v(b) > 0).sort((a, b) => v(b) - v(a));
  const unranked = k.brands.filter((b) => v(b) === 0 && (!skin || b.places > 0));
  const ai = ranked.findIndex((b) => same(b.b, anchor));
  const top = ranked.slice(0, 15);
  const shown = more ? ranked : ai >= 15 ? [...top, "gap" as const, ranked[ai]] : top;
  const maxOf = Math.max(1e-9, ...ranked.map((b) => v(b) / (tot || 1)));
  const top5 = ranked.slice(0, 5).reduce((a, b) => a + v(b), 0) / (tot || 1);
  const toggle = (
    <div className="flex rounded-full bg-sunken p-0.5 text-[12.5px] ring-1 ring-line">
      {([[false, tr("All categories", "전체 카테고리")], [true, tr("Skincare only", "스킨케어만")]] as const).map(([val, l]) => (
        <button key={String(val)} onClick={() => setSkin(val)} className={`rounded-full px-3.5 py-1 ${skin === val ? "bg-brand text-on-brand" : "text-ink-2"}`}>{l}</button>
      ))}
    </div>
  );
  const row = (r: KBrand, i: number) => {
    const share = v(r) / (tot || 1);
    return (
      <Fragment key={r.b}>
        <tr className={`border-b border-line/60 align-top ${same(r.b, anchor) ? "bg-accent-soft" : ""}`}>
          <td className="px-4 py-2.5 tabular text-muted">{i + 1}</td>
          <td className="px-2 py-2.5 font-medium">{r.b}{same(r.b, anchor) && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tr("ours", "자사")}</span>}</td>
          <td className="px-2 py-2.5"><span className="flex items-center gap-2"><b className="w-12 tabular">{pct(share, 1)}</b><span className="h-2 w-24 rounded-full bg-sunken"><span className="block h-2 rounded-full bg-brand/70" style={{ width: `${(share / maxOf) * 100}%` }} /></span></span></td>
          <td className="px-2 py-2.5 tabular text-ink-2">{pct(skin ? r.skinValue / (k.allValue || 1) : r.ofAll, 1)}</td>
          <td className="px-2 py-2.5 tabular">{r.places}</td>
          <td className="px-2 py-2.5">{r.strong ? <>{catName(r.strong.c)} <span className="tabular text-muted">{pct(r.strong.s, 0)}</span></> : <span className="text-muted">–</span>}</td>
          <td className="max-w-[240px] truncate px-2 py-2.5" title={r.best?.name}>{r.best ? short(r.best.name, r.b) : <span className="text-muted">–</span>}</td>
          <td className="px-2 py-2.5 tabular">{r.growth !== null ? <span className={r.growth >= (k.allGrowth ?? 0) ? "text-good" : "text-bad"} title={r.estimated ? r.estText : undefined}>{signed(r.growth)}{r.estimated ? <sup className="ml-0.5 text-[10px] text-muted">{tr("est.", "추정")}</sup> : null}</span> : <span className="text-muted">–</span>}</td>
          <td className="px-4 py-2.5 text-right"><DetailsButton open={open === r.b} onClick={() => setOpen(open === r.b ? null : r.b)} /></td>
        </tr>
        {open === r.b && <tr><td colSpan={9} className="px-4 pb-3"><BrandQuick brand={r.b} /></td></tr>}
      </Fragment>
    );
  };
  return (
    <ActionSection id="ranking" kicker={tr("K-beauty brand ranking", "K-뷰티 브랜드 순위")} right={toggle}
      title={ranked[0] ? tr(<>{ranked[0].b} is the #1 Korean brand{skin ? " in skincare" : ""} on Nykaa; the top 5 hold {pct(top5, 0)} of all K-beauty{ai >= 0 ? <>; {anchor} is #{ai + 1}</> : null}.</>, <>{skin ? "스킨케어 " : ""}K-뷰티 1위 {ranked[0].b}, 상위 5곳이 K-뷰티 전체의 {pct(top5, 0)}{ai >= 0 ? <>. {anchor} {ai + 1}위</> : null}.</>) : tr("K-beauty brand ranking", "K-뷰티 브랜드 순위")}
      note={tr(<>Ranked by <Def k="ratingFlow">share of buying</Def> ({k.span}), added up over every category{skin ? " under Nykaa's Skin menu" : ""}. <b>Of all K-beauty</b> = the brand&rsquo;s part of what all Korean brands sell together (= 100%). <b>Of all buying</b> = its part of everything sold in our {CATEGORIES.length} categories, every origin. Strongest category: where it takes the biggest share of that category. Review growth: latest 3 months vs a year earlier on the same products (est. = includes a big seller whose older reviews Nykaa no longer shows); green when faster than <TrackedLink /> ({signed(k.allGrowth)}).</>,
        <><Def k="ratingFlow">판매 점유율</Def>({k.span}) 순, {skin ? "Nykaa 스킨 메뉴 " : ""}카테고리 합산. <b>K-뷰티 중</b> = K-뷰티 브랜드 전체(= 100%) 중 비중. <b>전체 중</b> = 추적 {CATEGORIES.length}개 카테고리 전체 판매(모든 국적) 중 비중. 주력 카테고리: 카테고리 점유율이 가장 큰 곳. 리뷰 성장: 동일 제품 최근 3개월 vs 전년(추정 = 과거 리뷰가 안 보이는 대형 제품 포함). <TrackedLink />({signed(k.allGrowth)})보다 빠르면 초록.</>)}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">#</th><th className="px-2">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Of all K-beauty", "K-뷰티 중")}</th><th className="px-2">{tr("Of all buying", "전체 중")}</th><th className="px-2">{tr("Top-100 products", "상위 100위 제품")}</th><th className="px-2">{tr("Strongest category", "주력 카테고리")}</th><th className="px-2">{tr("Best seller", "베스트셀러")}</th><th className="px-2">{tr("Review growth", "리뷰 성장")}</th><th className="px-4" /></tr></thead>
          <tbody>
            {shown.map((r) => r === "gap"
              ? <tr key="gap" className="border-b border-line/60"><td colSpan={9} className="px-4 py-2"><button onClick={() => setMore(true)} className="text-[12.5px] font-medium text-accent-strong">{tr(`… #16–#${ai}: ${ai - 15} more brand${ai - 15 === 1 ? "" : "s"} (show)`, `… 16–${ai}위: ${ai - 15}곳 더 보기`)}</button></td></tr>
              : row(r, ranked.indexOf(r)))}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2">
          {ranked.length > 15 && <button onClick={() => setMore(!more)} className="font-medium text-accent-strong">{more ? tr("Show the top 15", "상위 15곳만") : tr(`Show all ${ranked.length} ranked Korean brands`, `순위 K-뷰티 브랜드 ${ranked.length}곳 모두 보기`)}</button>}
          {unranked.length > 0 && <span className="ml-3 text-muted">{tr(`${unranked.length} more Korean brand${unranked.length === 1 ? " has" : "s have"} top-100 products with no reviews read yet${skin ? " in skincare" : ""}: ${unranked.slice(0, 6).map((b) => b.b).join(", ")}${unranked.length > 6 ? "…" : ""}`, `리뷰 미수집 상위 100위 K-뷰티 브랜드 ${unranked.length}곳: ${unranked.slice(0, 6).map((b) => b.b).join(", ")}${unranked.length > 6 ? "…" : ""}`)}</span>}
        </div>
      </Card>
    </ActionSection>
  );
}

/** Where K-beauty sells, one row per category (was the "By category" side of a toggle; owner 22 Oct: two sections). */
export function KCategories({ k, anchor }: { k: KBeauty; anchor: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const withBuying = k.cats.filter((c) => c.total > 0);
  const top = [...withBuying].sort((a, b) => b.kShare - a.kShare)[0];
  const maxShare = Math.max(1e-9, ...withBuying.map((c) => c.kShare));
  return (
    <ActionSection id="where" kicker={tr("Where K-beauty sells", "K-뷰티 판매 분포")}
      title={tr(<>Korean brands are strongest in {top ? catName(top.cat).toLowerCase() : "–"}, with {top ? pct(top.kShare, 0) : "–"} of the category.</>, <>K-뷰티 강세 카테고리: {top ? catName(top.cat) : "–"} (카테고리의 {top ? pct(top.kShare, 0) : "–"}).</>)}
      note={tr(<><b>K-beauty share</b> = Korean brands&rsquo; part of all <Def k="ratingFlow">buying</Def> in the category ({k.span}; every brand in the category = 100%). Leading Korean brand: its share of the whole category. {anchor}: its place among the Korean brands in that category.</>,
        <><b>K-뷰티 점유율</b> = 카테고리 전체 <Def k="ratingFlow">판매</Def>(={k.span}, 모든 브랜드 100%) 중 K-뷰티 비중. K-뷰티 1위: 카테고리 전체 중 점유율. {anchor}: 그 카테고리 K-뷰티 브랜드 중 순위.</>)}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2">{tr("K-beauty share", "K-뷰티 점유율")}</th><th className="px-2">{tr("In the top 100", "상위 100위")}</th><th className="px-2">{tr("Leading Korean brand", "K-뷰티 1위")}</th><th className="px-2">{anchor}</th><th className="px-4" /></tr></thead>
          <tbody>{k.cats.map((c) => {
            const lead = c.korean[0]; const a = c.anchor;
            return (
              <Fragment key={c.cat}>
                <tr className="border-b border-line/60 align-top">
                  <td className="px-4 py-2.5 font-medium">{catName(c.cat)}</td>
                  <td className="px-2 py-2.5">{c.total ? <span className="flex items-center gap-2"><b className="w-11 tabular">{pct(c.kShare, 0)}</b><span className="h-2 w-28 rounded-full bg-sunken"><span className="block h-2 rounded-full bg-brand/70" style={{ width: `${(c.kShare / maxShare) * 100}%` }} /></span></span> : <span className="text-[12px] text-muted">{tr("no reviews read yet", "리뷰 미수집")}</span>}</td>
                  <td className="px-2 py-2.5 tabular">{c.products ? tr(`${c.products} products · ${c.brands} brands`, `제품 ${c.products}개 · 브랜드 ${c.brands}곳`) : <span className="text-muted">{tr("none", "없음")}</span>}</td>
                  <td className="max-w-[300px] px-2 py-2.5">{lead ? <><b className="font-medium">{lead.brand}</b> <span className="tabular text-muted">{pct(lead.share, 0)} {tr("of the category", "점유")}</span><div className="truncate text-[11.5px] text-muted" title={lead.best.name}>{short(lead.best.name, lead.brand)}</div></> : <span className="text-muted">–</span>}</td>
                  <td className="px-2 py-2.5 tabular">{a.place ? <>{tr(`#${a.place} of ${c.korean.length} Korean brands`, `K-뷰티 ${c.korean.length}곳 중 ${a.place}위`)}<div className="text-[11.5px] text-muted">{tr(`${pct(a.share, 1)} of the category`, `카테고리의 ${pct(a.share, 1)}`)}</div></> : <span className="text-[12px] text-muted">{a.rank ? tr(`on the list, #${a.rank}`, `목록 #${a.rank}`) : tr("not in the top 100", "상위 100위 밖")}</span>}</td>
                  <td className="px-4 py-2.5 text-right">{lead && <DetailsButton open={open === c.cat} onClick={() => setOpen(open === c.cat ? null : c.cat)} />}</td>
                </tr>
                {open === c.cat && lead && <tr><td colSpan={6} className="px-4 pb-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div><div className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr("Leading Korean product", "K-뷰티 1위 제품")}</div><ProductQuick pid={lead.best.product_id} cat={c.cat} /></div>
                    <div><div className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr(`${anchor}'s best here`, `${anchor} 대표 제품`)}</div>{a.best ? <ProductQuick pid={a.best.product_id} cat={c.cat} /> : <p className="mt-2 rounded-2xl bg-page px-4 py-3 text-[13px] text-muted ring-1 ring-line">{tr("No product with buying counted here.", "판매가 집계된 제품 없음.")}</p>}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-ink-2">{tr("Korean brands here (share of the category): ", "이 카테고리 K-뷰티 브랜드 (카테고리 점유율): ")}{c.korean.slice(0, 10).map((x, i) => <span key={x.brand}>{i ? " · " : ""}<b className={same(x.brand, anchor) ? "text-accent-strong" : "font-medium"}>{x.brand}</b> {pct(x.share, 1)}</span>)}</div>
                </td></tr>}
              </Fragment>);
          })}</tbody>
        </table>
      </Card>
    </ActionSection>
  );
}

export interface Good { what: string; why: string; href: string; tone?: "good" | "bad" }

/** "Good to know" (owner 21 Oct 2026, was "Worth a closer look"): what is new or worth watching in K-beauty. */
export function goodToKnow(k: KBeauty, anchor: string, extra: Good[]): Good[] {
  const out: Good[] = [];
  const growing = k.brands.filter((b) => b.growth !== null && b.value > 0 && k.allGrowth !== null && b.growth > k.allGrowth).sort((a, b) => b.growth! - a.growth!)[0];
  if (growing) out.push({ what: tr(`${growing.b} is the fastest-growing Korean brand`, `성장률 1위 K-뷰티 브랜드: ${growing.b}`), why: tr(`Written reviews ${signed(growing.growth)} vs ${signed(k.allGrowth)} for everything we follow.`, `리뷰 ${signed(growing.growth)}, 추적 제품 전체 ${signed(k.allGrowth)}.`), href: "#ranking", tone: "good" });
  const fresh = k.brands.filter((b) => b.isNew);
  if (fresh.length) out.push({ what: tr(`New in the top 100s: ${fresh.slice(0, 3).map((b) => b.b).join(", ")}${fresh.length > 3 ? ` and ${fresh.length - 3} more` : ""}`, `상위 100위 신규 진입: ${fresh.slice(0, 3).map((b) => b.b).join(", ")}${fresh.length > 3 ? ` 외 ${fresh.length - 3}곳` : ""}`), why: tr(`Korean brands with no top-100 product during ${k.span} and at least one today.`, `${k.span} 상위 100위 제품이 없다가 현재 진입한 K-뷰티 브랜드.`), href: "#ranking" });
  const climber = k.brands.filter((b) => b.placesD > 0 && !b.isNew).sort((a, b) => b.placesD - a.placesD)[0];
  // like for like (audit 21 Oct): both counts on the lists tracked on both days; today's total over every list is in the table
  if (climber) out.push({ what: tr(`${climber.b} gained ${climber.placesD} top-100 place${climber.placesD === 1 ? "" : "s"}`, `${climber.b} 상위 100위 제품 +${climber.placesD}개`), why: tr(`${climber.before} → ${climber.before + climber.placesD} since ${dayMonth(k.start)}, on the lists tracked since then.`, `${dayMonth(k.start)} 대비 ${climber.before}개 → ${climber.before + climber.placesD}개 (당시부터 추적한 목록 기준).`), href: "#ranking" });
  const strong = [...k.cats].filter((c) => c.total > 0 && c.korean[0]).sort((a, b) => b.kShare - a.kShare)[0];
  if (strong) out.push({ what: tr(`K-beauty holds ${pct(strong.kShare, 0)} of ${catName(strong.cat).toLowerCase()} buying`, `${catName(strong.cat)} 판매의 ${pct(strong.kShare, 0)}가 K-뷰티`), why: tr(`${strong.korean[0].brand} alone has ${pct(strong.korean[0].share, 0)}, through ${short(strong.korean[0].best.name, strong.korean[0].brand)}.`, `${strong.korean[0].brand} 단독 ${pct(strong.korean[0].share, 0)}, 대표 ${short(strong.korean[0].best.name, strong.korean[0].brand)}.`), href: "#where" });
  return [...extra, ...out].slice(0, 5);
}

export function GoodToKnow({ items }: { items: Good[] }) {
  return (
    <ActionSection id="good" kicker={tr("Good to know", "주목할 점")} title={items.length ? tr("What's new or worth watching in K-beauty.", "K-뷰티 신규·주목 동향.") : tr("Nothing new stands out today.", "오늘은 눈에 띄는 변화 없음.")}>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((s, i) => (
          <a key={i} href={s.href} className="lift relative block overflow-hidden rounded-[16px] bg-surface px-5 py-3.5 shadow-card ring-1 ring-line">
            <span className={`absolute left-0 top-0 h-full w-1 ${s.tone === "good" ? "bg-good" : s.tone === "bad" ? "bg-bad" : "bg-accent-strong"}`} />
            <div className="text-[14px] font-semibold leading-snug">{s.what}</div>
            <div className="mt-1 text-[12.5px] leading-snug text-ink-2">{s.why}</div>
          </a>
        ))}
      </div>
    </ActionSection>
  );
}
