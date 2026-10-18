"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, Stat } from "./ui";
import { ActionSection } from "./Report";
import { Basis, Def } from "./Tiered";
import { BrandQuick, DetailsButton, ProductQuick } from "./Quick";
import { norm } from "@/lib/brands";
import { useBrandOffers, useCategoryBrands, useHomepage } from "@/lib/data";
import { CATEGORY_LABEL, inr, pct, shortName, signed } from "@/lib/format";
import { catsOn, classifyOffer, homepageRuns, MAKEUP, placesOn, type FlowRow } from "@/lib/market";
import { reviewTrend } from "@/lib/profile";
import { spanLabel } from "@/lib/period";
import { LATEST_REPORTED, NYKAA_REPORTED } from "@/lib/reference";
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
  /** Korean brands ranked by their share of the category's buying. */
  korean: { brand: string; share: number; best: FlowRow }[];
  anchor: { share: number; place: number | null; best: FlowRow | null; rank: number | null };
}

/** Category by category: who leads among Korean brands, and where the anchor stands. */
export function useKFights(anchor: string, rivals: string[]) {
  const m = useMarket();
  return useMemo(() => {
    const cats = new Set<string>();
    for (const r of m.shelf) if (r.subcategory !== "kbeauty_store" && (same(r.brand, anchor) || rivals.some((b) => same(b, r.brand)))) cats.add(r.subcategory);
    const out: CatFight[] = [];
    for (const cat of cats) {
      const rows = m.flow.filter((r) => r.subcategory === cat && r.value > 0);
      const total = rows.reduce((a, r) => a + r.value, 0);
      const by = new Map<string, { brand: string; v: number; best: FlowRow }>();
      for (const r of rows) {
        if (r.origin !== "kbeauty") continue;
        const k = norm(r.brand); const c = by.get(k);
        if (!c) by.set(k, { brand: r.brand, v: r.value, best: r }); else { c.v += r.value; if (r.value > c.best.value) c.best = r; }
      }
      const korean = [...by.values()].sort((a, b) => b.v - a.v).map((x) => ({ brand: x.brand, share: total ? x.v / total : 0, best: x.best }));
      const i = korean.findIndex((x) => same(x.brand, anchor));
      const shelfBest = m.shelf.filter((r) => r.subcategory === cat && same(r.brand, anchor)).sort((a, b) => a.rank - b.rank)[0];
      out.push({ cat, total, korean, anchor: { share: i >= 0 ? korean[i].share : 0, place: i >= 0 ? i + 1 : null, best: i >= 0 ? korean[i].best : null, rank: shelfBest?.rank ?? null } });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [m.flow, m.shelf, anchor, rivals]);
}

/** Innisfree against the Korean rivals, one row per category. */
export function KFightsSection({ anchor, rivals }: { anchor: string; rivals: string[] }) {
  const m = useMarket(); const fights = useKFights(anchor, rivals); const [open, setOpen] = useState<string | null>(null);
  const span = m.flowSpan;
  const wins = fights.filter((f) => f.anchor.place === 1);
  const rivalSet = (b: string) => rivals.some((x) => same(x, b));
  return (
    <ActionSection id="fights" kicker={tr(`${anchor} against its Korean rivals`, `${anchor} vs 한국 경쟁사`)}
      title={tr(`${anchor} leads the Korean brands in ${wins.length} of the ${fights.length} categories where it or its rivals sell${wins.length ? ` (${wins.map((w) => catName(w.cat).toLowerCase()).join(", ")})` : ""}`,
        `${anchor}는 자신이나 경쟁사가 파는 ${fights.length}개 카테고리 중 ${wins.length}곳에서 한국 브랜드 1위${wins.length ? ` (${wins.map((w) => catName(w.cat)).join(", ")})` : ""}`)}
      note={tr(<>Share of each category&rsquo;s <Def k="ratingFlow">buying</Def>{span ? ` (${dayMonth(span.start)}–${dayMonth(span.end)})` : ""}, Korean brands only, single products. Rivals = the 10 Korean brands in Admin › Brand tiers; the leading Korean brand may be another one. Press Details for the products behind it.</>,
        <>카테고리별 <Def k="ratingFlow">구매</Def> 점유{span ? ` (${dayMonth(span.start)}–${dayMonth(span.end)})` : ""}, 한국 브랜드만, 단일 제품. 경쟁사 = 관리 › 브랜드 등급의 한국 브랜드 10곳. 한국 1위는 그 밖의 브랜드일 수 있습니다. 자세히를 누르면 제품이 보입니다.</>)}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Leading Korean brand", "한국 1위")}</th><th className="px-2">{tr(anchor, anchor)}</th><th className="px-2">{tr("What it means", "의미")}</th><th className="px-4" /></tr></thead>
          <tbody>{fights.map((f) => {
            const lead = f.korean[0]; const a = f.anchor; const isLead = a.place === 1;
            const nextRival = f.korean.find((k) => !same(k.brand, anchor) && rivalSet(k.brand));
            const ratio = lead && a.share > 0 ? lead.share / a.share : null;
            const says = !lead ? tr("No Korean brand's buying counted here.", "한국 브랜드 구매 집계 없음.")
              : isLead ? tr(`${anchor} leads; the nearest rival${nextRival ? `, ${nextRival.brand}, has ${pct(nextRival.share, 1)}` : " has none counted"}.`, `${anchor} 1위. 가장 가까운 경쟁사${nextRival ? ` ${nextRival.brand} ${pct(nextRival.share, 1)}` : " 없음"}.`)
              : a.share > 0 ? tr(`${lead.brand} sells ${ratio! >= 10 ? Math.round(ratio!) : ratio!.toFixed(1)}× more than ${anchor} here, through ${shortName(lead.best.name, lead.brand)} (#${lead.best.rankEnd}, ${inr(lead.best.price)}).`, `${lead.brand}가 ${anchor}보다 ${ratio! >= 10 ? Math.round(ratio!) : ratio!.toFixed(1)}배 더 팔림: ${shortName(lead.best.name, lead.brand)} (#${lead.best.rankEnd}, ${inr(lead.best.price)}).`)
              : a.rank ? tr(`${anchor} is on the list (best #${a.rank}) but no new ratings were counted for it.`, `${anchor}는 목록에 있으나(최고 #${a.rank}) 집계된 신규 평가 없음.`) : tr(`${anchor} has no product in this top 100.`, `${anchor} 제품이 이 상위 100위에 없음.`);
            return (
              <Fragment key={f.cat}>
                <tr className="border-b border-line/60 align-top">
                  <td className="px-4 py-2.5 font-medium">{catName(f.cat)}<div className="text-[11.5px] font-normal text-muted">{tr(`${f.korean.length} Korean brands`, `한국 브랜드 ${f.korean.length}곳`)}</div></td>
                  <td className="max-w-[260px] px-2 py-2.5">{lead ? <><b className="font-medium">{lead.brand}</b> <span className="tabular">{pct(lead.share, 1)}</span><div className="text-[11.5px] text-muted">{shortName(lead.best.name, lead.brand)}</div></> : "–"}</td>
                  <td className="px-2 py-2.5 tabular">{a.share > 0 ? <><b className={isLead ? "text-good" : ""}>{pct(a.share, 1)}</b><div className="text-[11.5px] text-muted">{tr(`#${a.place} of ${f.korean.length} Korean`, `한국 ${f.korean.length}곳 중 ${a.place}위`)}</div></> : <span className="text-muted">{a.rank ? tr(`on the list, #${a.rank}`, `목록 #${a.rank}`) : tr("not on the list", "목록 밖")}</span>}</td>
                  <td className="max-w-[380px] px-2 py-2.5 text-ink-2">{says}</td>
                  <td className="px-4 py-2.5 text-right">{lead && <DetailsButton open={open === f.cat} onClick={() => setOpen(open === f.cat ? null : f.cat)} />}</td>
                </tr>
                {open === f.cat && lead && <tr><td colSpan={5} className="px-4 pb-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div><div className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr(`The leader's product`, `1위 제품`)}</div><ProductQuick pid={lead.best.product_id} cat={f.cat} /></div>
                    <div><div className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr(`${anchor}'s best here`, `${anchor} 대표 제품`)}</div>{a.best ? <ProductQuick pid={a.best.product_id} cat={f.cat} /> : <p className="mt-2 rounded-2xl bg-page px-4 py-3 text-[13px] text-muted ring-1 ring-line">{tr("No product with buying counted here.", "구매가 집계된 제품 없음.")}</p>}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-ink-2">{tr("All Korean brands here: ", "이 카테고리 한국 브랜드: ")}{f.korean.slice(0, 10).map((k, i) => <span key={k.brand}>{i ? " · " : ""}<b className={same(k.brand, anchor) ? "text-accent-strong" : "font-medium"}>{k.brand}</b> {pct(k.share, 1)}</span>)}</div>
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
  const m = useMarket(); const cb = useCategoryBrands(); const offers = useBrandOffers(); const home = useHomepage();
  const [open, setOpen] = useState<string | null>(null);
  const rivals = useMemo(() => tiers.focus.filter((b) => tiers.group(b) === "korean"), [tiers]);
  const { win, ix, dims } = m;
  if (!m.ready || !win) return <div className="skeleton mt-8 h-48 rounded-[16px]" />;
  const flow = m.flow.filter((r) => r.value > 0);
  const nykaa = LATEST_REPORTED(); const reportedK = NYKAA_REPORTED()[2];
  const c0 = catsOn(ix, win.start); const c1 = catsOn(ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  const p0 = placesOn(ix, dims, win.start, both); const p1 = placesOn(ix, dims, win.end, both); const pAll = placesOn(ix, dims, win.end);
  const pick = (p: Map<string, number>, b: string) => [...p.entries()].find(([k]) => same(k, b))?.[1] ?? 0;
  const lastOfferDay = (offers.data ?? []).reduce((a, o) => (o.scrape_date > a ? o.scrape_date : a), "");
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
    const best = m.shelf.filter((r) => same(r.brand, b)).sort((x, y) => x.rank - y.rank)[0] ?? null;
    return { b, places: pick(pAll, b), placesD: pick(p1, b) - pick(p0, b), strong: strongest(b), best, reviews: tr12 && tr12.products >= 2 && tr12.base >= 30 ? tr12.change : null, offer: off[0]?.description ?? off[0]?.title ?? null, hp };
  };
  const set = [anchor, ...rivals.filter((b) => !same(b, anchor))].map(row).sort((a, b) => (same(a.b, anchor) ? -1 : same(b.b, anchor) ? 1 : (b.strong?.s ?? 0) - (a.strong?.s ?? 0)));
  const koreanOnShelf = [...new Set(m.shelf.filter((r) => r.origin === "kbeauty" && r.subcategory !== "kbeauty_store").map((r) => r.brand))];
  const others = koreanOnShelf.filter((b) => !same(b, anchor) && !rivals.some((x) => same(x, b))).map(row).sort((a, b) => (b.strong?.s ?? 0) - (a.strong?.s ?? 0) || b.places - a.places);
  const skin = flow.filter((r) => !MAKEUP.has(r.subcategory)); const mk = flow.filter((r) => MAKEUP.has(r.subcategory));
  const sh = (rs: FlowRow[]) => rs.filter((r) => r.origin === "kbeauty").reduce((a, r) => a + r.value, 0) / (rs.reduce((a, r) => a + r.value, 0) || 1);
  const latestBrands = (cb.data ?? []).reduce((a, b) => (b.last_seen > a ? b.last_seen : a), "");
  const kBrandsOnNykaa = new Set((cb.data ?? []).filter((b) => b.last_seen === latestBrands && b.origin === "kbeauty" && b.subcategory !== "kbeauty_store").map((b) => b.brand)).size;
  const kPlaces = [...pAll.entries()].filter(([b]) => m.originOf(b) === "kbeauty").reduce((a, [, n]) => a + n, 0); const allPlaces = [...pAll.values()].reduce((a, n) => a + n, 0) || 1;
  const kCats = [...catTotals.keys()].map((c) => ({ c, s: sh(flow.filter((r) => r.subcategory === c)) })).sort((a, b) => b.s - a.s);

  const table = (rows: ReturnType<typeof row>[], idp: string) => (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-[13px]">
        <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Strongest category", "가장 강한 카테고리")}</th><th className="px-2">{tr("Places", "자리")}</th><th className="px-2">{tr("Highest product", "최고 순위 제품")}</th><th className="px-2">{tr("Reviews vs a year earlier", "리뷰, 1년 전 대비")}</th><th className="px-2">{tr("Own offer", "자체 프로모션")}</th><th className="px-4" /></tr></thead>
        <tbody>{rows.map((r) => (
          <Fragment key={r.b}>
            <tr className={`border-b border-line/60 align-top ${same(r.b, anchor) ? "bg-accent-soft/40" : ""}`}>
              <td className="px-4 py-2.5 font-medium">{r.b}{same(r.b, anchor) && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tr("ours", "우리")}</span>}</td>
              <td className="px-2 py-2.5">{r.strong ? <>{catName(r.strong.c)} <b className="tabular">{pct(r.strong.s, 1)}</b></> : <span className="text-muted">{tr("no buying counted", "구매 집계 없음")}</span>}</td>
              <td className="px-2 py-2.5 tabular">{r.places}<span className={`ml-1 text-[11.5px] ${r.placesD > 0 ? "text-good" : r.placesD < 0 ? "text-bad" : "text-muted"}`}>{r.placesD > 0 ? `+${r.placesD}` : r.placesD < 0 ? r.placesD : "="}</span></td>
              <td className="max-w-[260px] px-2 py-2.5">{r.best ? <>{shortName(r.best.name, r.b)} <span className="text-muted">#{r.best.rank} {catName(r.best.subcategory).toLowerCase()}</span></> : <span className="text-muted">{tr("not in a top 100", "상위 100위 없음")}</span>}</td>
              <td className="px-2 py-2.5 tabular">{r.reviews !== null ? <span className={r.reviews >= (nykaa.value ?? 0) ? "text-good" : "text-bad"}>{signed(r.reviews)}</span> : <span className="text-[11.5px] text-muted">{tr("too few reviews", "리뷰 부족")}</span>}</td>
              <td className="max-w-[220px] px-2 py-2.5 text-[12px] text-ink-2">{r.offer ? r.offer.replace(/\s+/g, " ").slice(0, 70) : <span className="text-muted">{tr("none", "없음")}</span>}</td>
              <td className="px-4 py-2.5 text-right"><DetailsButton open={open === idp + r.b} onClick={() => setOpen(open === idp + r.b ? null : idp + r.b)} /></td>
            </tr>
            {open === idp + r.b && <tr><td colSpan={7} className="px-4 pb-3"><BrandQuick brand={r.b} /></td></tr>}
          </Fragment>))}</tbody>
      </table>
    </Card>
  );

  return (
    <>
      <KFightsSection anchor={anchor} rivals={rivals} />

      <ActionSection id="rivals" kicker={tr("K-beauty rivals scorecard", "K-뷰티 경쟁사 스코어카드")} title={tr(`${anchor} and its ${rivals.length} Korean rivals, side by side`, `${anchor}와 한국 경쟁사 ${rivals.length}곳 비교`)}
        note={tr(<>Strongest category: where the brand takes the biggest slice of <Def k="ratingFlow">buying</Def>. Places: top-100 places today, and the change over the {spanLabel(m.period.days)} on the {both.size} categories tracked throughout. Reviews: the brand&rsquo;s tracked products, latest 3 months vs a year earlier, green when faster than Nykaa beauty ({signed(nykaa.value)}).</>,
          <>가장 강한 카테고리: <Def k="ratingFlow">구매</Def> 점유가 가장 큰 곳. 자리: 오늘 상위 100위 자리와 {spanLabel(m.period.days)} 변화(내내 추적한 {both.size}개 카테고리). 리뷰: 추적 제품, 최근 3개월 vs 1년 전, Nykaa 뷰티({signed(nykaa.value)})보다 빠르면 초록.</>)}>
        {table(set, "r:")}
      </ActionSection>

      <ActionSection id="others" kicker={tr("Other Korean brands we monitor", "기타 한국 브랜드 모니터링")} title={tr(`${others.length} more Korean brands are on Nykaa's top 100s${others[0]?.strong ? `; ${others[0].b} is the strongest (${pct(others[0].strong.s, 1)} of ${catName(others[0].strong.c).toLowerCase()})` : ""}`, `한국 브랜드 ${others.length}곳 더 상위 100위에 있음${others[0]?.strong ? `. 가장 강한 곳은 ${others[0].b} (${catName(others[0].strong.c)} ${pct(others[0].strong.s, 1)})` : ""}`)}
        note={tr("Korean brands outside the rival list, watched for anyone breaking through. Add one to the rivals in Admin › Brand tiers.", "경쟁사 목록 밖의 한국 브랜드로, 급부상하는 브랜드를 지켜봅니다. 관리 › 브랜드 등급에서 경쟁사로 추가할 수 있습니다.")}>
        {table(others.slice(0, 25), "o:")}
      </ActionSection>

      <ActionSection id="kmarket" kicker={tr("K-beauty on Nykaa", "Nykaa의 K-뷰티")} title={tr(`Nykaa says Korean brands grew ${signed(reportedK.value)} last year; on the shelf they take ${pct(sh(skin), 0)} of skincare buying and ${pct(sh(mk), 1)} of makeup`, `Nykaa 발표: 한국 브랜드 지난해 ${signed(reportedK.value)} 성장. 진열에서는 스킨케어 구매의 ${pct(sh(skin), 0)}, 메이크업의 ${pct(sh(mk), 1)}`)}
        note={tr("Growth (Nykaa's figure) and size (our shelf) are different measures: a slice that is 11% today after growing 58% against beauty's 27% was about 9% a year ago.", "성장률(Nykaa)과 크기(진열)는 다른 지표입니다: 뷰티 전체 27% 대비 58% 성장해 지금 11%라면 1년 전에는 약 9%였습니다.")}>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label={tr("Korean brands' growth, Nykaa's figure", "한국 브랜드 성장률 (Nykaa)")} value={signed(reportedK.value)} tone="good" sub={tr(`${reportedK.period}; all beauty ${signed(nykaa.value)} (${nykaa.label})`, `${reportedK.period}; 뷰티 전체 ${signed(nykaa.value)} (${nykaa.label})`)} />
          <Stat label={tr("Slice of skincare buying", "스킨케어 구매 점유")} value={pct(sh(skin), 1)} sub={tr(`makeup: ${pct(sh(mk), 1)}`, `메이크업: ${pct(sh(mk), 1)}`)} />
          <Stat label={tr("Top-100 places", "상위 100위 자리")} value={`${kPlaces}`} sub={tr(`${pct(kPlaces / allPlaces)} of all places`, `전체 자리의 ${pct(kPlaces / allPlaces)}`)} />
          <Stat label={tr("Korean brands selling", "판매 중인 한국 브랜드")} value={kBrandsOnNykaa ? `${kBrandsOnNykaa}` : "–"} sub={tr("in the 13 tracked categories (Nykaa's brand filter); Nykaa says 70+ overall", "추적 13개 카테고리 (Nykaa 브랜드 필터). Nykaa 발표 전체 70개 이상")} />
        </div>
        <Card className="mt-3 px-5 py-4">
          <div className="text-[12.5px] font-semibold text-ink-2">{tr("Korean brands' slice of buying, by category", "카테고리별 한국 브랜드 구매 점유")}</div>
          <div className="mt-2 grid gap-x-8 gap-y-1 md:grid-cols-2">{kCats.map((x) => (
            <div key={x.c} className="grid grid-cols-[120px_1fr_48px] items-center gap-3 text-[12.5px]"><span className="truncate">{catName(x.c)}</span><span className="h-2 rounded-full bg-[#2f7a57]" style={{ width: `${Math.max(1, x.s * 100)}%` }} /><span className="text-right tabular">{pct(x.s, 0)}</span></div>))}</div>
        </Card>
        <Basis className="mt-2">{tr("Origin is where the brand is from. Indian brands \"formulated in Korea\" (Nykaa Naturals sheet masks, for example) count as Indian and are not on this tab.", "국적은 브랜드 본사 기준입니다. \"한국 제조\" 인도 브랜드(예: Nykaa Naturals 시트 마스크)는 인도로 분류되어 이 탭에 없습니다.")}</Basis>
      </ActionSection>
    </>
  );
}
