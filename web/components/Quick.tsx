"use client";

import { useMemo } from "react";
import Link from "next/link";
import Sparkline from "./Sparkline";
import { brandHref, productHref } from "./Links";
import { ORIGIN_LABEL, norm } from "@/lib/brands";
import { useBrandOffers, useEvents, useHomepage } from "@/lib/data";
import { CATEGORY_LABEL, inr, pct, shortName } from "@/lib/format";
import { classifyOffer, isCombo, REASON_COLOR } from "@/lib/market";
import { brandShareIn, homepageDays, latestOffers, listingMove, listingMoves, runsFrom, shareIn, type Context } from "@/lib/profile";
import { spanLabel } from "@/lib/period";
import { useMarket } from "@/lib/useMarket";
import ExternalNewsList from "./External";
import { dayMonth, tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";

/** Details that open in place (plan v3, owner 18 Oct 2026: "if I never click, I will never know there is more", and
 *  clicking a name must not jump to another page without warning). Every row with more to show carries a visible
 *  "Details ›" button; the panel opens under the row; only its labelled buttons go to another page. */

export function DetailsButton({ open, onClick, label }: { open: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 transition ${open ? "bg-brand text-on-brand ring-brand" : "text-accent-strong ring-line hover:bg-sunken"}`}>
      {label ?? tr("Details", "자세히")}<span aria-hidden className={`transition ${open ? "rotate-90" : ""}`}>›</span>
    </button>
  );
}

/** The shared context for moves and reasons in the chosen period. */
export function useMoveContext(): Context | null {
  const m = useMarket(); const events = useEvents(); const home = useHomepage(); const offers = useBrandOffers();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  return useMemo(() => (m.win ? { ix: m.ix, dims: m.dims, start: m.win.start, end: m.win.end, events: events.data ?? [], runs, offers: offers.data ?? [] } : null),
    [m.win, m.ix, m.dims, events.data, runs, offers.data]);
}

function Panel({ children, links }: { children: React.ReactNode; links: React.ReactNode }) {
  return (
    <div className="rise mt-2 rounded-2xl bg-page px-4 py-3.5 ring-1 ring-line">
      {children}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{links}</div>
    </div>
  );
}
// links are outlined, never filled: a filled pill means "open now" (the Details button), plan v4
const goBtn = "rounded-full px-3 py-1 text-[12.5px] font-medium text-accent-strong ring-1 ring-accent-strong/50 hover:bg-accent-soft";
const goBtn2 = "rounded-full px-3 py-1 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-sunken";

/** One product, in place: its rank line over the period, price and offer, why it moved, its slice of buying and what
 *  buyers praise. */
export function ProductQuick({ pid, cat }: { pid: string; cat: string }) {
  const m = useMarket(); const ctx = useMoveContext();
  const mv = useMemo(() => (ctx ? listingMove(ctx, cat, pid) : null), [ctx, cat, pid]);
  const row = m.shelf.find((r) => r.product_id === pid && r.subcategory === cat) ?? m.shelf.find((r) => r.product_id === pid) ?? null;
  const dim = m.dims.get(pid);
  const brand = row?.brand ?? dim?.brand ?? ""; const name = row?.name ?? dim?.name ?? pid;
  const share = shareIn(m.flow, cat).of(pid);
  const days = m.win ? m.ix.days.filter((d) => d >= m.win!.start && d <= m.win!.end) : [];
  const spark = days.map((d) => m.ix.byDay.get(d)?.get(`${cat}|${pid}`)?.rank ?? null).map((v) => (v === null ? null : 101 - v));
  const last = mv?.series[mv.series.length - 1];
  const price = row?.price ?? last?.price ?? null; const mrp = row?.mrp ?? last?.mrp ?? null;
  const praise = (row?.review_key_phrases ?? []).filter((p) => p.sentiment === "Positive").slice(0, 3).map((p) => tx(p.text));
  const minus = (row?.review_key_phrases ?? []).filter((p) => p.sentiment === "Negative").slice(0, 2).map((p) => tx(p.text));
  return (
    <Panel links={<><Link href={productHref(pid, cat)} className={goBtn}>{tr("Full product page →", "제품 전체 페이지 →")}</Link>{brand && <Link href={brandHref(brand)} className={goBtn2}>{tr(`Full ${brand} page →`, `${brand} 전체 페이지 →`)}</Link>}</>}>
      <div className="grid gap-4 text-[13px] sm:grid-cols-[auto_1fr]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{tr(`Rank, ${spanLabel(m.period.days)}`, `순위, ${spanLabel(m.period.days)}`)}</div>
          <Sparkline values={spark} color="#0e3b2e" width={170} height={40} />
          <div className="mt-1 tabular text-ink-2">{mv && mv.from !== null && mv.to !== null ? <>#{mv.from} → <b className="text-ink">#{mv.to}</b></> : mv?.entered ? tr(`new in the top 100 at #${mv.to}`, `상위 100위 신규 진입 #${mv.to}`) : row ? `#${row.rank}` : tr("not on the list now", "현재 목록 밖")}</div>
          {row?.nykaa_rank && row.nykaa_rank !== row.rank ? <div className="text-[11.5px] text-muted">{tr(`#${row.nykaa_rank} on Nykaa's page`, `Nykaa 페이지 #${row.nykaa_rank}`)}</div> : null}
        </div>
        <ul className="min-w-0 space-y-1.5 text-ink-2">
          <li><b className="text-ink">{shortName(name, brand)}</b> · {brand} · {CATEGORY_LABEL[cat] ?? cat}</li>
          <li>{tr("Price: ", "가격: ")}<b className="text-ink">{inr(price)}</b>{mrp && price && mrp > price ? tr(` (${Math.round((1 - price / mrp) * 100)}% off the printed price ${inr(mrp)})`, ` (정가 ${inr(mrp)}에서 ${Math.round((1 - price / mrp) * 100)}% 할인)`) : tr(" (no discount)", " (할인 없음)")}{row?.offer_message ? <> · {tr("offer: ", "프로모션: ")}{row.offer_message}</> : null}{row?.is_ad ? tr(" · sponsored spot", " · 광고 자리") : ""}</li>
          <li>{isCombo(name) ? tr("A combo pack: not counted in buying shares (Nykaa gives it its contents' ratings).", "콤보 제품: 구매 점유에서 제외 (Nykaa가 구성품 평가를 합쳐 표시).")
            : share ? <>{tr(<><b className="text-ink">{pct(share.share, 1)}</b> of all {(CATEGORY_LABEL[cat] ?? cat).toLowerCase()} buying · {pct(share.units, 1)} of units · #{share.place} of {share.of} products{m.flowSpan ? ` (to ${dayMonth(m.flowSpan.end)})` : ""}.</>, <>{CATEGORY_LABEL[cat] ?? cat} 구매 전체의 <b className="text-ink">{pct(share.share, 1)}</b> · 수량의 {pct(share.units, 1)} · 제품 {share.of}개 중 {share.place}위{m.flowSpan ? ` (${dayMonth(m.flowSpan.end)}까지)` : ""}.</>)}
              {share.poolSize > 1 ? <span className="text-muted">{tr(` Nykaa shows one rating count for ${share.poolSize} of ${brand}'s products; it is counted once, at their median price.`, ` Nykaa가 ${brand} 제품 ${share.poolSize}개에 하나의 평가 수를 보여주므로, 중간 가격으로 한 번만 집계.`)}</span> : null}</>
            : tr("No new ratings counted in the period.", "기간 중 집계된 신규 평가 없음.")}</li>
          {mv && Math.abs(mv.gain) >= 5 && !mv.entered && !mv.left && <li className="flex flex-wrap items-center gap-1">{tr("Why it moved: ", "변화 이유: ")}{mv.why.length ? mv.why.slice(0, 3).map((w) => <span key={w.text} className="rounded-full px-2 py-0.5 text-[11.5px] text-white" style={{ background: REASON_COLOR[w.kind] }}>{w.text}</span>) : <span className="text-muted">{tr("nothing we track changed (price, offers, sponsored spots, stock, homepage, sales)", "추적 항목(가격·프로모션·광고·재고·홈페이지·세일) 변화 없음")}</span>}</li>}
          {(praise.length > 0 || minus.length > 0) && <li>{praise.length ? tr(`Buyers praise ${praise.join(", ").toLowerCase()}`, `호평: ${praise.join(", ")}`) : ""}{minus.length ? tr(`${praise.length ? "; " : ""}complain about ${minus.join(", ").toLowerCase()}`, `${praise.length ? " · " : ""}불만: ${minus.join(", ")}`) : ""}.</li>}
        </ul>
      </div>
    </Panel>
  );
}

/** One brand, in place (within a category when given): its slice of buying, places, best products and offers. */
export function BrandQuick({ brand, cat }: { brand: string; cat?: string | null }) {
  const m = useMarket(); const ctx = useMoveContext(); const offers = useBrandOffers(); const home = useHomepage();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  const moves = useMemo(() => (ctx ? listingMoves(ctx, brand).filter((x) => !cat || x.subcategory === cat) : []), [ctx, brand, cat]);
  const today = m.shelf.filter((r) => norm(r.brand) === norm(brand) && (!cat || r.subcategory === cat)).sort((a, b) => a.rank - b.rank);
  const cats = cat ? [cat] : [...new Set(m.shelf.filter((r) => norm(r.brand) === norm(brand)).map((r) => r.subcategory))];
  const shares = cats.map((c) => ({ c, s: brandShareIn(m.flow, c, brand) })).filter((x) => x.s).sort((a, b) => b.s!.share - a.s!.share);
  const own = latestOffers(offers.data ?? [], brand);
  const brandOwn = own.offers.filter((o) => classifyOffer(o).brandOwn);
  const hp = m.win ? homepageDays(runs, brand, m.win.start, m.win.end) : 0;
  const up = moves.filter((x) => x.gain >= 5 && !x.entered).sort((a, b) => b.gain - a.gain)[0];
  const down = moves.filter((x) => x.gain <= -5 && !x.left).sort((a, b) => a.gain - b.gain)[0];
  const origin = m.originOf(brand);
  // best seller = the product with the most buying (plan v4: not the best rank), within the category when given
  const bestSeller = shares.length ? m.flow.filter((r) => norm(r.brand) === norm(brand) && r.value > 0 && (!cat || r.subcategory === cat)).sort((a, b) => b.value - a.value)[0] ?? null : null;
  return (
    <Panel links={<><Link href={brandHref(brand)} className={goBtn}>{tr(`Full ${brand} page →`, `${brand} 전체 페이지 →`)}</Link>{bestSeller && <Link href={productHref(bestSeller.product_id, bestSeller.subcategory)} className={goBtn2}>{tr("Its best seller →", "베스트셀러 →")}</Link>}</>}>
      <ul className="space-y-1.5 text-[13px] text-ink-2">
        <li><b className="text-ink">{brand}</b> · {ORIGIN_LABEL[origin] ?? origin} · {tr(`${today.length} product${today.length === 1 ? "" : "s"} in ${cat ? `the ${(CATEGORY_LABEL[cat] ?? cat).toLowerCase()}` : `${cats.length} categories'`} top 100 today`, `오늘 ${cat ? CATEGORY_LABEL[cat] ?? cat : `${cats.length}개 카테고리`} 상위 100위 제품 ${today.length}개`)}</li>
        {shares.length > 0 && <li>{tr("Share of buying: ", "구매 점유율: ")}{shares.slice(0, 4).map((x, i) => <span key={x.c}>{i ? " · " : ""}<b className="text-ink">{pct(x.s!.share, 1)}</b> {tr(`of all ${(CATEGORY_LABEL[x.c] ?? x.c).toLowerCase()} buying (${pct(x.s!.units, 0)} of units; #${x.s!.place} of ${x.s!.of} brands)`, `${CATEGORY_LABEL[x.c] ?? x.c} 구매 전체 (수량 ${pct(x.s!.units, 0)}; 브랜드 ${x.s!.of}개 중 ${x.s!.place}위)`)}</span>)}</li>}
        {bestSeller && <li>{tr("Best seller: ", "베스트셀러: ")}<b className="text-ink">{shortName(bestSeller.name, brand)}</b>{tr(` in ${(CATEGORY_LABEL[bestSeller.subcategory] ?? bestSeller.subcategory).toLowerCase()}, #${bestSeller.rankEnd ?? "–"} there, ${inr(bestSeller.price)}`, ` · ${CATEGORY_LABEL[bestSeller.subcategory] ?? bestSeller.subcategory} #${bestSeller.rankEnd ?? "–"}, ${inr(bestSeller.price)}`)}</li>}
        {(up || down) && <li>{up ? tr(`Rose: ${shortName(up.name, brand)} #${up.from} → #${up.to}${up.why[0] ? ` (${up.why[0].text})` : ""}`, `상승: ${shortName(up.name, brand)} #${up.from} → #${up.to}${up.why[0] ? ` (${up.why[0].text})` : ""}`) : ""}{up && down ? " · " : ""}{down ? tr(`Fell: ${shortName(down.name, brand)} #${down.from} → #${down.to}${down.why[0] ? ` (${down.why[0].text})` : ""}`, `하락: ${shortName(down.name, brand)} #${down.from} → #${down.to}${down.why[0] ? ` (${down.why[0].text})` : ""}`) : ""}</li>}
        <li>{brandOwn.length ? tr(`Own offer: ${(brandOwn[0].description || brandOwn[0].title || "").replace(/\s+/g, " ").slice(0, 90)}`, `자체 프로모션: ${(brandOwn[0].description || brandOwn[0].title || "").replace(/\s+/g, " ").slice(0, 90)}`) : own.day ? tr("No offer of its own on its pages", "자체 프로모션 없음") : tr("Offers not read for this brand", "이 브랜드는 프로모션 미수집")}{tr(` · on Nykaa's homepage ${hp} day${hp === 1 ? "" : "s"}`, ` · 홈페이지 ${hp}일`)}</li>
      </ul>
      <ExternalNewsList brand={brand} max={2} compact />
    </Panel>
  );
}
