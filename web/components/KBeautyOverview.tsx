"use client";

import { TrackedLink } from "@/components/TrackedProducts";
import { Fragment, useMemo, useState } from "react";
import { Card } from "./ui";
import { ActionSection } from "./Report";
import { Def } from "./Tiered";
import { BrandQuick, DetailsButton, ProductQuick } from "./Quick";
import { norm } from "@/lib/brands";
import { useBrandOffers, useExternalNews, useHomepage } from "@/lib/data";
import { ExternalTag, isRelevant } from "./External";
import { CATEGORIES, CATEGORY_LABEL, inr, pct, shortName, signed } from "@/lib/format";
import { catsOn, classifyOffer, homepageRuns, placesOn, type FlowRow } from "@/lib/market";
import { reviewTrend } from "@/lib/profile";
import type { Tiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** K-beauty, brand against brand (plan v3, owner 18 Oct 2026: "I'm fighting with Beauty of Joseon, with Anua... only
 *  K-beauty brands... main comparison with the top 10 and monitoring of all others"). Innisfree against its 10 Korean
 *  rivals (Admin › Brand tiers, Korean group), category by category, on share of buying: the one measure that decides
 *  who is winning. Every other Korean brand on the shelf is monitored below. Indian brands "formulated in Korea" are
 *  Indian and never appear here. */

const catName = (c: string) => CATEGORY_LABEL[c] ?? c;
const same = (a: string, b: string) => norm(a) === norm(b);

export interface CatFight {
  cat: string; total: number;
  /** Korean brands' buying as a share of the whole category (all brands = 100%). */
  koreanShare: number;
  /** Korean brands ranked by their share of the category's buying (all brands = 100%); `ofKorean` = out of Korean
   *  brands only; `units` = share of new ratings. */
  korean: { brand: string; share: number; ofKorean: number; units: number; best: FlowRow }[];
  anchor: { share: number; ofKorean: number; units: number; place: number | null; best: FlowRow | null; rank: number | null; growth: number | null };
}

/** Category by category: who leads among Korean brands, and where the anchor stands. */
export function useKFights(anchor: string, rivals: string[]) {
  const m = useMarket();
  return useMemo(() => {
    const cats = new Set<string>();
    for (const r of m.shelf) if (CATEGORIES.includes(r.subcategory) && (same(r.brand, anchor) || rivals.some((b) => same(b, r.brand)))) cats.add(r.subcategory);
    const out: CatFight[] = [];
    for (const cat of cats) {
      const rows = m.flow.filter((r) => r.subcategory === cat && r.value > 0);
      const total = rows.reduce((a, r) => a + r.value, 0); const units = rows.reduce((a, r) => a + r.flow, 0);
      const by = new Map<string, { brand: string; v: number; u: number; best: FlowRow }>();
      for (const r of rows) {
        if (r.origin !== "kbeauty") continue;
        const k = norm(r.brand); const c = by.get(k);
        if (!c) by.set(k, { brand: r.brand, v: r.value, u: r.flow, best: r }); else { c.v += r.value; c.u += r.flow; if (r.value > c.best.value) c.best = r; }
      }
      const kTotal = [...by.values()].reduce((a, x) => a + x.v, 0);
      const korean = [...by.values()].sort((a, b) => b.v - a.v).map((x) => ({ brand: x.brand, share: total ? x.v / total : 0, ofKorean: kTotal ? x.v / kTotal : 0, units: units ? x.u / units : 0, best: x.best }));
      const i = korean.findIndex((x) => same(x.brand, anchor));
      const shelfBest = m.shelf.filter((r) => r.subcategory === cat && same(r.brand, anchor)).sort((a, b) => a.rank - b.rank)[0];
      // the standard growth (same products, written reviews, latest 3 months vs a year earlier) of the anchor here
      const g = m.latest ? reviewTrend(m.pool.filter((p) => same(p.brand, anchor) && p.category === cat), m.latest) : null;
      out.push({ cat, total, koreanShare: total ? kTotal / total : 0, korean, anchor: { share: i >= 0 ? korean[i].share : 0, ofKorean: i >= 0 ? korean[i].ofKorean : 0, units: i >= 0 ? korean[i].units : 0, place: i >= 0 ? i + 1 : null, best: i >= 0 ? korean[i].best : null, rank: shelfBest?.rank ?? null, growth: g && g.products ? g.change : null } });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [m.flow, m.shelf, m.pool, m.latest, anchor, rivals]);
}

/** Innisfree against the Korean rivals, one row per category. */
export function KFightsSection({ anchor, rivals }: { anchor: string; rivals: string[] }) {
  const m = useMarket(); const fights = useKFights(anchor, rivals); const [open, setOpen] = useState<string | null>(null);
  const span = m.flowSpan;
  const wins = fights.filter((f) => f.anchor.place === 1);
  const rivalSet = (b: string) => rivals.some((x) => same(x, b));
  return (
    <ActionSection id="fights" kicker={tr(`${anchor} against its Korean rivals`, `${anchor} vs K-뷰티 경쟁사`)}
      title={tr(`${anchor} leads the Korean brands in ${wins.length} of the ${fights.filter((f) => f.total > 0).length} categories with buying data where it or its rivals sell${wins.length ? ` (${wins.map((w) => catName(w.cat).toLowerCase()).join(", ")})` : ""}`,
        `${anchor}: 자신이나 경쟁사가 파는, 구매 데이터가 있는 ${fights.filter((f) => f.total > 0).length}개 카테고리 중 ${wins.length}곳에서 K-뷰티 1위${wins.length ? ` (${wins.map((w) => catName(w.cat)).join(", ")})` : ""}`)}
      note={tr(<>Every share is of <b>all</b> brands&rsquo; <Def k="ratingFlow">buying</Def> in the category (= 100%){span ? ` (${dayMonth(span.start)}–${dayMonth(span.end)})` : ""}, unless it says &ldquo;of Korean buying&rdquo; (Korean brands only = 100%). Only products Nykaa files under the category count. Rivals = the 10 Korean brands in Admin › Brand tiers; the leading Korean brand may be another one. Origin is where the brand is from: Indian brands &ldquo;formulated in Korea&rdquo; count as Indian. Nykaa&rsquo;s own figures for Korean brands are on the Brief; every origin side by side is on Market.</>,
        <>모든 점유율 = 해당 카테고리 <b>전체</b> 브랜드 <Def k="ratingFlow">구매</Def>(= 100%) 기준{span ? ` (${dayMonth(span.start)}–${dayMonth(span.end)})` : ""}. &ldquo;K-뷰티 구매 중&rdquo;이라고 쓴 경우만 K-뷰티 브랜드 = 100%. Nykaa가 해당 카테고리로 분류한 제품만 집계. 경쟁사 = 관리 › 브랜드 등급의 K-뷰티 브랜드 10곳. 국적 = 브랜드 본사 기준, &ldquo;한국 제조&rdquo; 인도 브랜드는 인도로 분류. K-뷰티에 대한 Nykaa 공식 수치는 브리핑, 국적별 비교는 시장 탭.</>)}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Leading Korean brand", "K-뷰티 1위")}</th><th className="px-2">{tr(`${anchor}: share of all buying`, `${anchor}: 전체 구매 점유율`)}</th><th className="px-2">{tr("Of Korean buying", "K-뷰티 구매 중")}</th><th className="px-2">{tr("What it means", "의미")}</th><th className="px-4" /></tr></thead>
          <tbody>{fights.map((f) => {
            const lead = f.korean[0]; const a = f.anchor; const isLead = a.place === 1;
            const nextRival = f.korean.find((k) => !same(k.brand, anchor) && rivalSet(k.brand));
            const ratio = lead && a.share > 0 ? lead.share / a.share : null;
            // a list added after Nykaa froze rating counts (10 Oct) has no buying for anyone yet, Korean or not
            const says = !f.total ? tr("No buying counted in this list yet: it was added after Nykaa stopped updating rating counts (10 Oct).", "이 목록은 아직 구매 집계 없음: Nykaa 평가 수 갱신 중단(10월 10일) 이후 추가된 목록.")
              : !lead ? tr("No Korean brand's buying counted here.", "K-뷰티 브랜드 구매 집계 없음.")
              : isLead ? tr(`${anchor} leads; the nearest rival${nextRival ? `, ${nextRival.brand}, has ${pct(nextRival.share, 1)}` : " has none counted"}.`, `${anchor} 1위. 가장 가까운 경쟁사${nextRival ? `: ${nextRival.brand} ${pct(nextRival.share, 1)}` : " 없음"}.`)
              : a.share > 0 ? tr(`${lead.brand} sells ${ratio! >= 10 ? Math.round(ratio!) : ratio!.toFixed(1)}× more than ${anchor} here, through ${shortName(lead.best.name, lead.brand)} (#${lead.best.rankEnd}, ${inr(lead.best.price)}).`, `${lead.brand}: ${anchor}보다 ${ratio! >= 10 ? Math.round(ratio!) : ratio!.toFixed(1)}배 더 판매 — ${shortName(lead.best.name, lead.brand)} (#${lead.best.rankEnd}, ${inr(lead.best.price)}).`)
              : a.rank ? tr(`${anchor} is on the list (best #${a.rank}) but no new ratings were counted for it.`, `${anchor}: 목록엔 있으나(최고 #${a.rank}) 집계된 신규 평가 없음.`) : tr(`${anchor} has no product in this top 100.`, `${anchor} 제품이 이 상위 100위에 없음.`);
            return (
              <Fragment key={f.cat}>
                <tr className="border-b border-line/60 align-top">
                  <td className="px-4 py-2.5 font-medium">{catName(f.cat)}<div className="text-[11.5px] font-normal text-muted">{!f.total ? tr("no buying counted yet", "구매 집계 아직 없음") : tr(`${f.korean.length} Korean brands, ${pct(f.koreanShare, 0)} of all buying`, `K-뷰티 브랜드 ${f.korean.length}곳, 전체 구매의 ${pct(f.koreanShare, 0)}`)}</div></td>
                  <td className="max-w-[260px] px-2 py-2.5">{lead ? <><b className="font-medium">{lead.brand}</b> <span className="tabular">{pct(lead.share, 1)}</span><div className="text-[11.5px] text-muted">{tr("best seller: ", "베스트셀러: ")}{shortName(lead.best.name, lead.brand)}</div></> : "–"}</td>
                  <td className="px-2 py-2.5 tabular">{a.share > 0 ? <><b className={isLead ? "text-good" : ""}>{pct(a.share, 1)}</b><div className="text-[11.5px] text-muted">{tr(`${pct(a.units, 1)} of units`, `수량 ${pct(a.units, 1)}`)}</div></> : <span className="text-muted">{a.rank ? tr(`on the list, #${a.rank}`, `목록 #${a.rank}`) : tr("not on the list", "목록 밖")}</span>}{a.growth !== null && <div className={`text-[11.5px] ${a.growth >= 0 ? "text-good" : "text-bad"}`}>{tr(`written reviews ${signed(a.growth)} vs a year earlier`, `작성 리뷰 전년 대비 ${signed(a.growth)}`)}</div>}</td>
                  <td className="px-2 py-2.5 tabular">{a.share > 0 ? <>{pct(a.ofKorean, 0)}<div className="text-[11.5px] text-muted">{tr(`#${a.place} of ${f.korean.length} Korean`, `K-뷰티 ${f.korean.length}곳 중 ${a.place}위`)}</div></> : <span className="text-muted">–</span>}</td>
                  <td className="max-w-[380px] px-2 py-2.5 text-ink-2">{says}</td>
                  <td className="px-4 py-2.5 text-right">{lead && <DetailsButton open={open === f.cat} onClick={() => setOpen(open === f.cat ? null : f.cat)} />}</td>
                </tr>
                {open === f.cat && lead && <tr><td colSpan={6} className="px-4 pb-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div><div className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr(`The leader's product`, `1위 제품`)}</div><ProductQuick pid={lead.best.product_id} cat={f.cat} /></div>
                    <div><div className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr(`${anchor}'s best here`, `${anchor} 대표 제품`)}</div>{a.best ? <ProductQuick pid={a.best.product_id} cat={f.cat} /> : <p className="mt-2 rounded-2xl bg-page px-4 py-3 text-[13px] text-muted ring-1 ring-line">{tr("No product with buying counted here.", "구매가 집계된 제품 없음.")}</p>}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-ink-2">{tr("All Korean brands here (share of all buying): ", "이 카테고리 K-뷰티 브랜드 (전체 구매 점유율): ")}{f.korean.slice(0, 10).map((k, i) => <span key={k.brand}>{i ? " · " : ""}<b className={same(k.brand, anchor) ? "text-accent-strong" : "font-medium"}>{k.brand}</b> {pct(k.share, 1)}</span>)}</div>
                </td></tr>}
              </Fragment>);
          })}</tbody>
        </table>
      </Card>
    </ActionSection>
  );
}

/** The anchor and its 10 Korean rivals, then every other Korean brand on the shelf (monitored), then K-beauty on Nykaa. */
export default function KBeautyOverview({ tiers, anchor }: { tiers: Tiers; anchor: string }) {
  const m = useMarket(); const offers = useBrandOffers(); const home = useHomepage(); const news = useExternalNews();
  const [open, setOpen] = useState<string | null>(null); const [showMore, setShowMore] = useState(false);
  const rivals = useMemo(() => tiers.focus.filter((b) => tiers.group(b) === "korean"), [tiers]);
  const { win, ix, dims } = m;
  if (!m.ready || !win) return <div className="skeleton mt-8 h-48 rounded-[16px]" />;
  const flow = m.flow.filter((r) => r.value > 0);

  // the brands' review growth is compared with every tracked product on the same rule and months, not with Nykaa's
  // reported quarter (audit 19 Oct: +28% was Apr–Jun GMV, the brands' figures are Jul–Sep reviews)
  const allTracked = m.latest ? reviewTrend(m.pool, m.latest).change : null;
  const c0 = catsOn(ix, win.start); const c1 = catsOn(ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  const p0 = placesOn(ix, dims, win.start, both); const p1 = placesOn(ix, dims, win.end, both); const pAll = placesOn(ix, dims, win.end);
  const pick = (p: Map<string, number>, b: string) => [...p.entries()].find(([k]) => same(k, b))?.[1] ?? 0;
  const lastOfferDay = (offers.data ?? []).reduce((a, o) => (o.scrape_date > a ? o.scrape_date : a), "");
  const newsDay = (news.data ?? []).reduce((a, n) => (n.first_seen > a ? n.first_seen : a), "");
  const runs = homepageRuns(home.data ?? []);
  const catTotals = new Map<string, number>(); for (const r of flow) catTotals.set(r.subcategory, (catTotals.get(r.subcategory) ?? 0) + r.value);
  const strongest = (b: string) => {
    const by = new Map<string, number>(); for (const r of flow) if (same(r.brand, b)) by.set(r.subcategory, (by.get(r.subcategory) ?? 0) + r.value);
    const best = [...by.entries()].map(([c, v]) => ({ c, s: v / (catTotals.get(c) || 1) })).sort((a, c) => c.s - a.s)[0];
    return best ?? null;
  };
  const row = (b: string) => {
    const tr12 = m.latest ? reviewTrend(m.pool.filter((p) => same(p.brand, b)), m.latest) : null;
    const off = (offers.data ?? []).filter((o) => o.scrape_date === lastOfferDay && same(o.brand, b) && o.offer_id !== "none").filter((o) => classifyOffer(o).brandOwn);
    const hp = runs.filter((r) => r.brand && same(r.brand, b) && r.end >= win.start).reduce((s, r) => s + r.days, 0);
    // best seller = the brand's product with the most buying (plan v4), with its share of that category
    const best = flow.filter((r) => same(r.brand, b)).sort((x, y) => y.value - x.value)[0] ?? null;
    const cut = newsDay ? new Date(+new Date(newsDay) - 30 * 864e5).toISOString().slice(0, 10) : "";
    const headlines = (news.data ?? []).filter((n) => same(n.brand, b) && (n.published_at ?? n.first_seen).slice(0, 10) >= cut && isRelevant(n)).length;
    return { b, places: pick(pAll, b), placesD: pick(p1, b) - pick(p0, b), strong: strongest(b), best, bestShare: best ? best.value / (catTotals.get(best.subcategory) || 1) : 0, reviews: tr12 && tr12.products >= 2 && tr12.base >= 30 ? tr12.change : null, offer: off[0]?.description ?? off[0]?.title ?? null, hp, headlines };
  };
  const set = [anchor, ...rivals.filter((b) => !same(b, anchor))].map(row).sort((a, b) => (same(a.b, anchor) ? -1 : same(b.b, anchor) ? 1 : (b.strong?.s ?? 0) - (a.strong?.s ?? 0)));
  const koreanOnShelf = [...new Set(m.shelf.filter((r) => r.origin === "kbeauty" && r.subcategory !== "kbeauty_store").map((r) => r.brand))];
  const others = koreanOnShelf.filter((b) => !same(b, anchor) && !rivals.some((x) => same(x, b))).map(row).sort((a, b) => (b.strong?.s ?? 0) - (a.strong?.s ?? 0) || b.places - a.places);

  const table = (rows: ReturnType<typeof row>[], idp: string, more: ReturnType<typeof row>[] = []) => (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-[13px]">
        <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Strongest category (share of all buying)", "가장 강한 카테고리 (전체 구매 점유율)")}</th><th className="px-2">{tr("Products in the top 100", "상위 100위 제품")}</th><th className="px-2">{tr("Best seller", "베스트셀러")}</th><th className="px-2">{tr("Reviews vs a year earlier", "리뷰, 1년 전 대비")}</th><th className="px-2">{tr("Own offer", "자체 프로모션")}</th><th className="px-4" /></tr></thead>
        <tbody>{rows.map((r) => (
          <Fragment key={r.b}>
            <tr className={`border-b border-line/60 align-top ${same(r.b, anchor) ? "bg-accent-soft/40" : ""}`}>
              <td className="px-4 py-2.5 font-medium">{r.b}{same(r.b, anchor) && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tr("ours", "우리")}</span>}{r.headlines > 0 && <div className="mt-1 text-[11px] font-normal text-ink-2"><ExternalTag />{tr(`${r.headlines} headline${r.headlines === 1 ? "" : "s"}, 30 days`, `헤드라인 ${r.headlines}건, 30일`)}</div>}</td>
              <td className="px-2 py-2.5">{r.strong ? <>{catName(r.strong.c)} <b className="tabular">{pct(r.strong.s, 1)}</b></> : <span className="text-muted">{tr("no buying counted", "구매 집계 없음")}</span>}</td>
              <td className="px-2 py-2.5"><b className="tabular">{r.places}</b><div className={`text-[11.5px] ${r.placesD > 0 ? "text-good" : r.placesD < 0 ? "text-bad" : "text-muted"}`}>{r.placesD === 0 ? tr(`same as on ${dayMonth(win.start)}`, `${dayMonth(win.start)}과 같음`) : tr(`${Math.abs(r.placesD)} ${r.placesD > 0 ? "more" : "fewer"} than on ${dayMonth(win.start)}`, `${dayMonth(win.start)} 대비 ${r.placesD > 0 ? "+" : ""}${r.placesD}`)}</div></td>
              <td className="max-w-[260px] px-2 py-2.5">{r.best ? <>{shortName(r.best.name, r.b)}<div className="text-[11.5px] text-muted">{tr(`${catName(r.best.subcategory)} · ${pct(r.bestShare, 1)} of all buying · #${r.best.rankEnd}`, `${catName(r.best.subcategory)} · 전체 구매의 ${pct(r.bestShare, 1)} · ${r.best.rankEnd}위`)}</div></> : <span className="text-muted">{tr("no buying counted", "구매 집계 없음")}</span>}</td>
              <td className="px-2 py-2.5 tabular">{r.reviews !== null ? <span className={r.reviews >= (allTracked ?? 0) ? "text-good" : "text-bad"}>{signed(r.reviews)}</span> : <span className="text-[11.5px] text-muted">{tr("too few reviews", "리뷰 부족")}</span>}</td>
              <td className="max-w-[220px] px-2 py-2.5 text-[12px] text-ink-2">{r.offer ? r.offer.replace(/\s+/g, " ").slice(0, 70) : <span className="text-muted">{tr("none", "없음")}</span>}</td>
              <td className="px-4 py-2.5 text-right"><DetailsButton open={open === idp + r.b} onClick={() => setOpen(open === idp + r.b ? null : idp + r.b)} /></td>
            </tr>
            {open === idp + r.b && <tr><td colSpan={7} className="px-4 pb-3"><BrandQuick brand={r.b} /></td></tr>}
          </Fragment>))}
          {more.length > 0 && <tr className="border-b border-line/60"><td colSpan={7} className="px-4 py-2.5">
            <button type="button" onClick={() => setShowMore(!showMore)} className="text-[12.5px] font-medium text-accent-strong hover:underline">
              {showMore ? tr("Hide the other Korean brands", "기타 K-뷰티 브랜드 숨기기") : tr(`Show the ${more.length} other Korean brands on the top 100s${more[0]?.strong ? ` (strongest: ${more[0].b}, ${pct(more[0].strong.s, 1)} of ${catName(more[0].strong.c).toLowerCase()} buying)` : ""}`, `상위 100위의 기타 K-뷰티 브랜드 ${more.length}곳 보기${more[0]?.strong ? ` (가장 강한 곳: ${more[0].b}, ${catName(more[0].strong.c)} 구매의 ${pct(more[0].strong.s, 1)})` : ""}`)}
            </button>
            {showMore && <span className="ml-2 text-[12px] text-muted">{tr("Outside the rival list, watched for anyone breaking through; add one to the rivals in Admin › Brand tiers.", "경쟁사 목록 밖, 급부상 감시용. 관리 › 브랜드 등급에서 경쟁사로 추가 가능.")}</span>}
          </td></tr>}
          {showMore && more.map((r) => (
          <Fragment key={"m" + r.b}>
            <tr className="border-b border-line/60 align-top text-ink-2">
              <td className="px-4 py-2 font-medium">{r.b}{r.headlines > 0 && <div className="mt-1 text-[11px] font-normal text-ink-2"><ExternalTag />{tr(`${r.headlines} headline${r.headlines === 1 ? "" : "s"}, 30 days`, `헤드라인 ${r.headlines}건, 30일`)}</div>}</td>
              <td className="px-2 py-2">{r.strong ? <>{catName(r.strong.c)} <b className="tabular">{pct(r.strong.s, 1)}</b></> : <span className="text-muted">{tr("no buying counted", "구매 집계 없음")}</span>}</td>
              <td className="px-2 py-2"><b className="tabular">{r.places}</b>{r.placesD !== 0 && <span className={`ml-1.5 text-[11.5px] ${r.placesD > 0 ? "text-good" : "text-bad"}`}>{r.placesD > 0 ? "+" : ""}{r.placesD}</span>}</td>
              <td className="max-w-[260px] px-2 py-2">{r.best ? <>{shortName(r.best.name, r.b)}<div className="text-[11.5px] text-muted">{catName(r.best.subcategory)} · {pct(r.bestShare, 1)} · #{r.best.rankEnd}</div></> : <span className="text-muted">–</span>}</td>
              <td className="px-2 py-2 tabular">{r.reviews !== null ? <span className={r.reviews >= (allTracked ?? 0) ? "text-good" : "text-bad"}>{signed(r.reviews)}</span> : <span className="text-[11.5px] text-muted">{tr("too few reviews", "리뷰 부족")}</span>}</td>
              <td className="max-w-[220px] px-2 py-2 text-[12px]">{r.offer ? r.offer.replace(/\s+/g, " ").slice(0, 70) : <span className="text-muted">{tr("none", "없음")}</span>}</td>
              <td className="px-4 py-2 text-right"><DetailsButton open={open === idp + r.b} onClick={() => setOpen(open === idp + r.b ? null : idp + r.b)} /></td>
            </tr>
            {open === idp + r.b && <tr><td colSpan={7} className="px-4 pb-3"><BrandQuick brand={r.b} /></td></tr>}
          </Fragment>))}
          </tbody>
      </table>
    </Card>
  );

  return (
    <>
      <KFightsSection anchor={anchor} rivals={rivals} />

      <ActionSection id="rivals" kicker={tr("K-beauty rivals scorecard", "K-뷰티 경쟁사 스코어카드")} title={tr(`${anchor} and its ${rivals.length} Korean rivals, side by side`, `${anchor}와 K-뷰티 경쟁사 ${rivals.length}곳 비교`)}
        note={tr(<>Strongest category: where the brand takes the biggest share of that category&rsquo;s <Def k="ratingFlow">buying</Def> (all brands = 100%). Products in the top 100: today, across all tracked categories; the change counts the {both.size} categories tracked since {dayMonth(win.start)}. Best seller: the brand&rsquo;s product with the most buying. Reviews: the brand&rsquo;s tracked products, latest 3 months vs a year earlier, green when faster than <TrackedLink /> ({signed(allTracked)}, same rule). External: headlines from outside Nykaa.</>,
          <>가장 강한 카테고리: 전체 브랜드 <Def k="ratingFlow">구매</Def> 중 점유율이 가장 큰 곳. 상위 100위 제품: 오늘 기준, 전체 추적 카테고리. 변화 = {dayMonth(win.start)}부터 추적한 {both.size}개 카테고리 기준. 베스트셀러: 구매가 가장 많은 제품. 리뷰: 최근 3개월 vs 1년 전, <TrackedLink />({signed(allTracked)}, 같은 기준)보다 빠르면 초록. 외부: 인도 관련 헤드라인.</>)}>
        {table(set, "r:", others.slice(0, 25))}
      </ActionSection>
    </>
  );
}
