"use client";

import { Chip } from "@/components/CompareGrid";
import { DetailHead, LEVEL_SCORE, LEVEL_WORD, Opens, Points, useDetail, type DetailContent } from "@/components/Detail";
import { useOpenProduct } from "@/components/ProductDrawer";
import { Card, Verdict } from "@/components/ui";
import { TONE_CLASS, TONE_WORD, tone, type Criterion, type Standing } from "@/lib/compete";
import { ROLE_LABEL, shortTitle, type ProductFacts, type ProductOption } from "@/lib/competeData";
import { CATEGORY_LABEL, compact, inr, signed } from "@/lib/format";
import type { Bench } from "@/lib/price";
import type { UspComparison } from "@/lib/usp";
import { demandWindow } from "@/lib/analysis";
import { useTiers } from "@/lib/tiers";
import { crit } from "@/lib/compete";
import { josa, tr } from "@/lib/i18n";
import { tx, txs } from "@/lib/dict";

const DW = () => demandWindow();

/* ---------------------------------------------------------------- product measures, one set per section */

const rupee100 = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export const VIS_CRITERIA: Criterion<ProductFacts>[] = [
  crit({ key: "rank", label: ["Shelf position today", "오늘 진열 순위"], help: ["Position in this category's top 100 on Nykaa today (1 = top of the page)", "오늘 Nykaa 이 카테고리 상위 100위 안의 순위 (1 = 페이지 맨 위)"], better: "low", value: (p) => p.rank ?? 101,
    show: (p) => (p.rank ? `#${p.rank}` : tr("Not in top 100", "100위 밖")), sub: (p) => (p.paid ? tr("paid (ad) slot", "광고 자리") : p.rank ? tr("unpaid", "비광고") : null),
    up: ["Ranks higher on the shelf than", "진열 순위가 더 높음"], down: ["Ranks lower on the shelf than", "진열 순위가 더 낮음"] }),
  crit({ key: "rankmove", label: ["Change in 7 days", "7일 변화"], help: ["Places gained or lost on the shelf since a week ago", "일주일 전보다 오르거나 내린 순위"], better: "high", value: (p) => (p.rank && p.rank7 ? p.gain7 ?? 0 : null),
    show: (p) => (!p.gain7 ? tr("No change", "변화 없음") : tr(`${p.gain7 > 0 ? "▲" : "▼"} ${Math.abs(p.gain7)} place${Math.abs(p.gain7) === 1 ? "" : "s"}`, `${p.gain7 > 0 ? "▲" : "▼"} ${Math.abs(p.gain7)}계단`)),
    sub: (p) => (p.rank7 ? tr(`#${p.rank7} a week ago`, `일주일 전 #${p.rank7}`) : null),
    missing: (p) => (p.rank && p.rank7 ? null : p.rank ? tr("New in the top 100 this week", "이번 주 100위 신규 진입") : p.rank7 ? tr(`Dropped out (was #${p.rank7})`, `100위 밖으로 이탈 (이전 #${p.rank7})`) : tr("Not in the top 100 either week", "두 주 모두 100위 밖")),
    up: ["Climbing faster than", "더 빠르게 상승"], down: ["Slipping more than", "더 많이 하락"] }),
  crit({ key: "search", label: ["K-beauty searches", "K-뷰티 검색"], help: ["Tracked Korean-beauty searches where it shows in the first 10 unpaid results today", "오늘 비광고 상위 10개 결과에 나오는 추적 K-뷰티 검색어 수"], better: "high", value: (p) => p.search,
    show: (p) => (p.search ? tr(`${p.search} search${p.search === 1 ? "" : "es"}`, `검색어 ${p.search}개`) : tr("In none", "없음")), sub: (p) => (p.search ? tr("top 10, unpaid", "비광고 상위 10") : tr("of the tracked searches", "추적 검색어 중")),
    up: ["Shows up in more K-beauty searches than", "K-뷰티 검색 노출이 더 많음"], down: ["Shows up in fewer K-beauty searches than", "K-뷰티 검색 노출이 더 적음"] }),
];

export const DEMAND_CRITERIA: Criterion<ProductFacts>[] = [
  crit({ key: "demand", label: ["Reviews, last 3 months", "최근 3개월 리뷰"], help: ["Dated reviews in the last 3 complete months (sizes of one product pooled): a stand-in for recent sales", "최근 완결된 3개월 동안 작성된 리뷰 (같은 제품의 다른 용량 합산). 최근 판매의 대리 지표"], better: "high", value: (p) => p.recent, show: (p) => compact(p.recent), sub: () => DW().recent, bar: true,
    missing: (p) => (p.recent === null ? tr("Not in review tracking", "리뷰 추적 대상 아님") : null), up: ["More recent reviews (a sales signal) than", "최근 리뷰가 더 많음 (판매 신호)"], down: ["Fewer recent reviews (a sales signal) than", "최근 리뷰가 더 적음 (판매 신호)"] }),
  crit({ key: "momentum", label: ["Review growth", "리뷰 성장률"], help: () => tr(`Reviews ${DW().recent} against ${DW().prior}; products with complete history only`, `${DW().recent} 리뷰 vs ${DW().prior} 리뷰. 이력이 완전한 제품만`), better: "high", value: (p) => p.momentum, show: (p) => signed(p.momentum),
    sub: () => tr(`vs ${DW().prior}`, `${DW().prior} 대비`), missing: (p) => (p.momentum === null ? (p.recent === null ? tr("Not in review tracking", "리뷰 추적 대상 아님") : tr("Too new to compare", "비교하기엔 너무 새 제품")) : null),
    up: ["Reviews growing faster than", "리뷰가 더 빠르게 증가"], down: ["Reviews growing slower than", "리뷰 증가가 더 느림"] }),
  crit({ key: "ratings", label: ["Ratings, all time", "누적 평가 수"], help: ["Number of star ratings: lifetime popularity", "별점 평가 수: 누적 인기도"], better: "high", value: (p) => p.ratings, show: (p) => compact(p.ratings), bar: true,
    sub: (p) => (p.reviewsTotal ? tr(`${compact(p.reviewsTotal)} written reviews`, `작성 리뷰 ${compact(p.reviewsTotal)}건`) : null), missing: (p) => (p.ratings === null ? tr("No ratings yet", "아직 평가 없음") : null),
    up: ["More lifetime ratings than", "누적 평가가 더 많음"], down: ["Fewer lifetime ratings than", "누적 평가가 더 적음"] }),
];

export const BUYER_CRITERIA: Criterion<ProductFacts>[] = [
  crit({ key: "rating", label: ["Star rating", "별점"], help: ["Nykaa star rating", "Nykaa 별점"], better: "high", value: (p) => p.rating, show: (p) => (p.rating ? `★ ${p.rating.toFixed(1)}` : ""),
    missing: (p) => (p.rating === null ? tr("No ratings yet", "아직 평가 없음") : null), up: ["Rated higher than", "평점이 더 높음"], down: ["Rated lower than", "평점이 더 낮음"] }),
];

/** Not shown as grid rows (they are levels in the Message section) but counted for strengths and gaps. */
const MESSAGE_CRITERIA: Criterion<ProductFacts>[] = [
  crit({ key: "proof", label: ["Proof of claims", "소구점 근거"], help: ["", ""], better: "high", value: (p) => (p.proof.level ? LEVEL_SCORE[p.proof.level] : null), show: (p) => (p.proof.level ? LEVEL_WORD[p.proof.level] : ""),
    up: ["Better-proven claims than", "소구점 근거가 더 탄탄함"], down: ["Less-proven claims than", "소구점 근거가 더 약함"] }),
  crit({ key: "echo", label: ["Buyers repeat its claims", "구매자의 소구점 공감"], help: ["", ""], better: "high", value: (p) => (p.echo.level ? LEVEL_SCORE[p.echo.level] : null), show: (p) => (p.echo.level ? LEVEL_WORD[p.echo.level] : ""),
    up: ["Buyers repeat its claims more than for", "구매자가 소구점을 더 많이 언급"], down: ["Buyers repeat its claims less than for", "구매자가 소구점을 덜 언급"] }),
];

const ALL = [...BUYER_CRITERIA, ...MESSAGE_CRITERIA, ...VIS_CRITERIA, ...DEMAND_CRITERIA];

function standingsOf(a: ProductFacts, rivals: ProductFacts[]): (Standing & { c: Criterion<ProductFacts> })[] {
  return ALL.filter((c) => c.better && c.value(a) !== null).map((c) => {
    const ts = rivals.map((r) => tone(c.value(a), c.value(r), c.better, c.key.startsWith("rank") ? "rank" : "ratio")).filter((t) => t !== null);
    return { key: c.key, label: c.label, ahead: ts.filter((t) => t === "ahead").length, behind: ts.filter((t) => t === "behind").length, of: ts.length, c };
  }).filter((s) => s.of > 0);
}

/** Evidence behind a strength or gap: Innisfree's value against each rival's. */
function evidence(c: Criterion<ProductFacts>, a: ProductFacts, rivals: ProductFacts[]): DetailContent {
  const v = (p: ProductFacts) => c.missing?.(p) ?? c.show(p);
  return {
    kicker: tr("Strength or gap · evidence", "강점·약점 · 근거"), title: c.label,
    body: (<>
      <p className="text-muted">{c.help}</p>
      <DetailHead>Innisfree</DetailHead>
      <p><b>{shortTitle(a.name, a.brand)}</b>: {v(a)}</p>
      <DetailHead>{tr("Against each rival", "경쟁 제품별 비교")}</DetailHead>
      <ul className="space-y-1.5">{rivals.map((r) => { const t = tone(c.value(a), c.value(r), c.better, c.key.startsWith("rank") ? "rank" : "ratio"); return (
        <li key={r.pid} className="flex items-start justify-between gap-3"><span><b className="font-medium">{r.brand}</b> {shortTitle(r.name, r.brand)}: {v(r)}</span>
          {t && <span className={`shrink-0 rounded px-1.5 py-px text-[11px] ${TONE_CLASS[t]}`}>{TONE_WORD[t]}</span>}</li>); })}</ul>
      <p className="mt-4 text-[12px] text-muted">{tr("On par = within 5% (or 3 shelf places).", "비슷함 = 차이 5% 이내 (진열 순위는 3계단 이내).")}</p>
    </>),
  };
}


/* ---------------------------------------------------------------- §1 verdict, strengths and gaps */

type Dim = { id: string; label: string; href: string; tone?: "good" | "bad"; good?: string; bad?: string; point: React.ReactNode };

export function Summary({ hero, products, bench, cat }: { hero: UspComparison | null; products: ProductFacts[]; bench: Bench | null; cat: string }) {
  const open = useDetail();
  const a = products.find((p) => p.role === "anchor");
  const rivals = products.filter((p) => p !== a);
  if (!a) return (
    <section id="summary" className="mt-6 scroll-mt-32"><Card className="px-6 py-5">
      <p className="font-display text-[18px] font-medium">{tr(<>Innisfree sells nothing in {CATEGORY_LABEL[cat]} on Nykaa; the rivals are compared with each other below.</>, <>Innisfree는 Nykaa에서 {CATEGORY_LABEL[cat]} 제품을 팔지 않습니다. 아래에서는 경쟁 제품끼리 비교합니다.</>)}</p>
    </Card></section>
  );
  const name = shortTitle(a.name, a.brand);
  const st = standingsOf(a, rivals);
  const strong = st.filter((s) => s.ahead > s.behind).sort((x, y) => (y.ahead - y.behind) / y.of - (x.ahead - x.behind) / x.of).slice(0, 4);
  const weak = st.filter((s) => s.behind > s.ahead).sort((x, y) => (y.behind - y.ahead) / y.of - (x.behind - x.ahead) / x.of).slice(0, 4);
  const get = (k: string) => st.find((s) => s.key === k);
  const most = (s?: Standing) => (s ? (s.ahead > s.behind ? "ahead" : s.behind > s.ahead ? "behind" : null) : null);

  // price: position, not a win or a loss
  const unitRaw = bench?.unit ?? (cat === "sheet_mask" ? "sheet" : "100 ml/g");
  const unit = unitRaw === "sheet" ? tr("sheet", "매") : unitRaw;
  const diff = a.unit && bench ? a.unit / bench.value - 1 : null;
  const leader = bench ? tr(`${bench.leader.brand}'s ${shortTitle(bench.leader.name, bench.leader.brand)}`, `${bench.leader.brand} ${shortTitle(bench.leader.name, bench.leader.brand)}`) : "";
  const pricePhrase = diff === null ? null : Math.abs(diff) < 0.05 ? tr(`priced in line with the K-beauty leader (${leader})`, `K-뷰티 선두 제품(${leader})과 비슷한 가격`) : tr(`priced ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "above" : "below"} the K-beauty leader (${leader})`, `K-뷰티 선두 제품(${leader})보다 ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "비싼" : "저렴한"} 가격`);
  const cheaper = rivals.filter((r) => r.unit && a.unit && r.unit < a.unit * 0.95).length;
  const ps = a.proof.level ? LEVEL_SCORE[a.proof.level] : null; const es = a.echo.level ? LEVEL_SCORE[a.echo.level] : null;
  const unique = hero?.comparison.anchor_position.unique_to_anchor.length ?? 0;
  const msgScore = ps !== null && es !== null ? ps + es : null;
  const praise = a.themes?.praise[0]; const complaint = a.themes?.complaints[0];
  const rivalRatings = rivals.map((r) => r.rating).filter((x): x is number => x !== null).sort((x, y) => x - y);
  const rivalMed = rivalRatings.length ? rivalRatings[Math.floor(rivalRatings.length / 2)] : null;
  const rank = get("rank"); const dem = get("demand");

  const dims: Dim[] = [
    { id: "price", label: tr("Price", "가격"), href: "#price",
      point: a.mrp ? tr(<>MRP <b>{inr(a.mrp)}</b>{a.unit ? <> · {rupee100(a.unit)} per {unit}</> : null}{bench ? <> vs {rupee100(bench.value)} for the K-beauty leader</> : null}; {cheaper} of {rivals.length} rivals cost less</>,
        <>정가 <b>{inr(a.mrp)}</b>{a.unit ? <> · {unit}당 {rupee100(a.unit)}</> : null}{bench ? <> (K-뷰티 선두 {rupee100(bench.value)})</> : null}. 경쟁 제품 {rivals.length}개 중 {cheaper}개가 더 저렴</>) : tr(<>MRP not shown on Nykaa</>, <>Nykaa에 정가 표시 없음</>) },
    { id: "message", label: tr("Message", "메시지"), href: "#message",
      tone: msgScore === null ? undefined : msgScore >= 5 ? "good" : msgScore <= 3 ? "bad" : undefined,
      good: es === 3 ? tr("a message buyers repeat", "구매자가 따라 말하는 메시지") : tr("a well-proven message", "근거가 탄탄한 메시지"),
      bad: ps === 1 && es !== 3 ? tr("weakly proven claims", "근거가 약한 소구점") : tr("claims buyers rarely repeat", "구매자가 거의 언급하지 않는 소구점"),
      point: a.proof.level ? tr(<>Proof <b>{LEVEL_WORD[a.proof.level].toLowerCase()}</b> · buyer echo <b>{a.echo.level ? LEVEL_WORD[a.echo.level].toLowerCase() : "too few reviews"}</b>{hero ? <> · {unique} claim{unique === 1 ? "" : "s"} no rival makes</> : null}</>,
        <>근거 <b>{LEVEL_WORD[a.proof.level]}</b> · 구매자 공감 <b>{a.echo.level ? LEVEL_WORD[a.echo.level] : "리뷰 부족"}</b>{hero ? <> · 경쟁 제품에 없는 소구점 {unique}개</> : null}</>) : tr(<>No message analysis for this product</>, <>이 제품은 메시지 분석이 없습니다</>) },
    { id: "buyers", label: tr("Buyers", "구매자"), href: "#buyers",
      tone: most(get("rating")) === "ahead" ? "good" : most(get("rating")) === "behind" ? "bad" : undefined,
      good: tr("rated higher than most rivals", "대부분의 경쟁 제품보다 높은 평점"), bad: tr("rated lower than most rivals", "대부분의 경쟁 제품보다 낮은 평점"),
      point: tr(<>{a.rating ? <>★ <b>{a.rating.toFixed(1)}</b>{rivalMed ? <> (rivals ★ {rivalMed.toFixed(1)})</> : null}</> : "No rating yet"}{praise ? <> · most praised: {praise.label.toLowerCase()} ({Math.round(praise.share * 100)}%)</> : null}{complaint ? <> · top complaint: {complaint.label.toLowerCase()} ({Math.round(complaint.share * 100)}%)</> : null}</>,
        <>{a.rating ? <>★ <b>{a.rating.toFixed(1)}</b>{rivalMed ? <> (경쟁 ★ {rivalMed.toFixed(1)})</> : null}</> : "아직 평점 없음"}{praise ? <> · 최다 칭찬: {praise.label} ({Math.round(praise.share * 100)}%)</> : null}{complaint ? <> · 최다 불만: {complaint.label} ({Math.round(complaint.share * 100)}%)</> : null}</>) },
    { id: "reach", label: tr("Shelf and demand", "진열·수요"), href: "#visibility",
      tone: most(rank) === "ahead" && most(dem) !== "behind" ? "good" : most(rank) === "behind" && most(dem) !== "ahead" ? "bad" : undefined,
      good: (a.momentum ?? 0) > 0.05 ? tr("a strong shelf position and rising demand", "강한 진열 순위와 늘어나는 수요") : tr("a strong shelf position", "강한 진열 순위"),
      bad: (a.momentum ?? 0) < -0.05 ? tr("a weak shelf position and falling demand", "약한 진열 순위와 줄어드는 수요") : tr("a weak shelf position", "약한 진열 순위"),
      point: tr(<>{a.rank ? <>#{a.rank} on the shelf</> : <>Not in the top 100</>} ({rivals.filter((r) => r.rank && (!a.rank || r.rank < a.rank)).length} of {rivals.length} rivals higher){a.recent !== null ? <> · {compact(a.recent)} reviews in 3 months{a.momentum !== null ? <> ({signed(a.momentum)})</> : null}</> : null}</>,
        <>{a.rank ? <>진열 {a.rank}위</> : <>100위 밖</>} (경쟁 제품 {rivals.length}개 중 {rivals.filter((r) => r.rank && (!a.rank || r.rank < a.rank)).length}개가 더 높음){a.recent !== null ? <> · 3개월 리뷰 {compact(a.recent)}건{a.momentum !== null ? <> ({signed(a.momentum)})</> : null}</> : null}</>) },
  ];
  const goods = dims.filter((d) => d.tone === "good").map((d) => d.good!);
  const bads = dims.filter((d) => d.tone === "bad").map((d) => d.bad!);
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : tr(`${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`, `${xs.slice(0, -1).join(", ")}, ${xs[xs.length - 1]}`));
  const headline = tr(`${name} is ${pricePhrase ?? "priced without a comparable size"}${goods.length ? `, with ${join(goods)}` : ""}${bads.length ? `${goods.length ? ", but" : ", and"} has ${join(bads)}` : ""}.`,
    `${josa(name, "은/는")} ${pricePhrase ?? "비교할 만한 용량이 없어 가격 비교 불가"}${goods.length ? `이며, 강점은 ${join(goods)}` : ""}${bads.length ? `${goods.length ? "이지만" : "이고"}, 약점은 ${join(bads)}` : ""}입니다.`);

  const chip = (s: Standing & { c: Criterion<ProductFacts> }, good: boolean) => (
    <button key={s.key} onClick={() => open(evidence(s.c, a, rivals))} className="text-left">
      <Chip tone={good ? "good" : "bad"}>{tr(`${good ? s.c.up : s.c.down} ${good ? s.ahead : s.behind} of ${s.of} rival${s.of === 1 ? "" : "s"} ›`, `${good ? s.c.up : s.c.down} · 경쟁 제품 ${s.of}개 중 ${good ? s.ahead : s.behind}개보다 ›`)}</Chip>
    </button>
  );
  return (
    <section id="summary" className="mt-6 scroll-mt-32">
      <Verdict eyebrow={tr(<>Verdict for Innisfree · {name}</>, <>Innisfree 종합 판단 · {name}</>)}>{headline}</Verdict>
      <Card className="mt-3 px-6 py-4">
        {hero && (
          <Opens className="mb-3 text-[12.5px] font-medium text-accent-strong" detail={{ kicker: tr("AI read of the message, in full", "AI 메시지 분석 전문"), title: tr("Message verdict", "메시지 판단"), body: <Points items={tx(hero.comparison.anchor_position.verdict).split(/(?<=[.!?])\s+/)} /> }}>
            {tr("Read the full message verdict", "메시지 판단 전문 보기")}
          </Opens>
        )}
        <div className={`grid gap-3 md:grid-cols-2 ${hero ? "border-t border-line pt-3" : ""}`}>
          <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-good">{tr("Strengths", "강점")}</div>
            <div className="flex flex-wrap gap-1.5">{strong.length ? strong.map((s) => chip(s, true)) : <span className="text-[12px] text-muted">{tr("No measure where it beats most rivals", "대부분의 경쟁 제품을 앞서는 지표 없음")}</span>}</div></div>
          <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-bad">{tr("Gaps", "약점")}</div>
            <div className="flex flex-wrap gap-1.5">{weak.length ? weak.map((s) => chip(s, false)) : <span className="text-[12px] text-muted">{tr("No measure where it trails most rivals", "대부분의 경쟁 제품에 뒤지는 지표 없음")}</span>}</div></div>
        </div>
      </Card>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {dims.map((d) => (
          <a key={d.id} href={d.href} className="lift relative block overflow-hidden rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
            <span className={`absolute left-0 top-0 h-full w-1 ${d.tone === "good" ? "bg-good" : d.tone === "bad" ? "bg-bad" : "bg-line-2"}`} />
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"><span>{d.label}</span><span className="font-normal normal-case tracking-normal">{tr("see ↓", "보기 ↓")}</span></div>
            <div className="mt-1.5 text-[13.5px] leading-snug">{d.point}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- product column header (image opens the shelf read) */

const SHOT = (s: string | null) => (s === "pack_shot" ? tr("pack shot", "제품 단독 컷") : s === "flat_lay" ? tr("flat lay", "플랫레이") : (s ?? "").replaceAll("_", " "));

export function thumbDetail(p: ProductFacts): DetailContent {
  const t = p.thumb;
  return {
    kicker: tr(`${p.brand} · how it looks on the shelf`, `${p.brand} · 진열 화면에서 보이는 모습`), title: shortTitle(p.name, p.brand),
    body: (<>
      <div className="grid aspect-square w-full max-w-[360px] place-items-center overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
        {(t?.image_url ?? p.image) ? <img src={t?.image_url ?? p.image!} alt="" className="h-[88%] w-[88%] object-contain" /> : <span className="text-muted">{tr("No image", "이미지 없음")}</span>}
      </div>
      {t?.shot_type ? (<>
        <DetailHead>{tr("What the thumbnail shows", "썸네일 구성")}</DetailHead>
        <div className="flex flex-wrap gap-1">
          <Chip>{SHOT(t.shot_type)}</Chip><Chip>{t.model_present ? tr("shows a person", "인물 있음") : tr("no person", "인물 없음")}</Chip>
          <Chip>{t.text_density === "heavy" ? tr("text-heavy", "문구 많음") : t.text_density === "light" ? tr("light text", "문구 적음") : tr("no text", "문구 없음")}</Chip>
          {t.background && <Chip>{tr(`${t.background} background`, `배경: ${tx(t.background)}`)}</Chip>}{t.packaging_style && <Chip>{tx(t.packaging_style)}</Chip>}{t.mood && <Chip>{tx(t.mood)}</Chip>}
        </div>
        {!!t.dominant_colors?.length && <><DetailHead>{tr("Main colours", "주요 색상")}</DetailHead><div className="flex h-3 max-w-[360px] overflow-hidden rounded-full ring-1 ring-line">{t.dominant_colors.slice(0, 5).map((c) => <span key={c.hex} style={{ background: c.hex, width: `${c.share * 100}%` }} />)}</div></>}
        {!!t.on_image_claims?.length && <><DetailHead>{tr("Printed on the image", "이미지에 적힌 문구")}</DetailHead><Points items={txs(t.on_image_claims)} /></>}
        {t.summary && <><DetailHead>{tr("Summary", "요약")}</DetailHead><p className="text-ink-2">{tx(t.summary)}</p></>}
      </>) : <p className="mt-4 text-muted">{tr("This thumbnail has not been analysed yet (image analysis covers the focus brands and the analysed rival groups).", "이 썸네일은 아직 분석하지 않았습니다 (이미지 분석은 주요 브랜드와 분석된 경쟁 제품군만 대상).")}</p>}
    </>),
  };
}

export function ProductHead({ p, color, options, onSwap }: { p: ProductFacts; color?: string; options?: ProductOption[]; onSwap?: (pid: string) => void }) {
  const open = useOpenProduct(); const detail = useDetail(); const tiers = useTiers();
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}{ROLE_LABEL[p.role] ?? ""}
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <button onClick={() => detail(thumbDetail(p))} title={tr("Larger image and how it looks on the shelf", "큰 이미지와 진열 화면에서의 모습")}
          className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line transition hover:ring-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
          {p.image ? <img src={p.image} alt="" className="h-12 w-12 object-contain" /> : <span className="text-[10px] text-muted">{tr("No image", "이미지 없음")}</span>}
        </button>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-ink-2">{p.brand}{!tiers.inSet(p.brand) && <span className="ml-1.5 whitespace-nowrap rounded bg-sunken px-1 text-[10px] font-normal text-muted ring-1 ring-line">{tr("not in focus set", "주요 브랜드 외")}</span>}</span>
          <span className="block text-[12.5px] leading-snug" title={p.name}>{shortTitle(p.name, p.brand)}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="rounded-md px-1.5 py-0.5 text-ink-2 ring-1 ring-line hover:bg-sunken">Nykaa ↗</a>}
        <button onClick={() => open({ product_id: p.pid, name: p.name, brand: p.brand, url: p.url, image: p.image, price: p.price, mrp: p.mrp, rating: p.rating, rating_count: p.ratings, usp: p.whatItIs, phrases: p.phrases, splitup: p.split, madeIn: p.madeIn })}
          className="rounded-md px-1.5 py-0.5 text-ink-2 ring-1 ring-line hover:bg-sunken">{tr("History ›", "이력 ›")}</button>
      </div>
      {options && options.length > 1 && onSwap && (
        <select value={p.pid} onChange={(e) => onSwap(e.target.value)} className="mt-1.5 w-full rounded-md bg-surface px-1.5 py-1 text-[11px] text-ink-2 ring-1 ring-line">
          {options.map((o) => <option key={o.product_id} value={o.product_id}>{o.rank ? `#${o.rank} ` : ""}{shortTitle(o.name, o.brand).slice(0, 34)} · {inr(o.price)}</option>)}
        </select>
      )}
    </div>
  );
}

