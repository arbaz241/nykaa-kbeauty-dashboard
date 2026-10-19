"use client";

import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { DetailHead, Level, Missing, Opens, Points, type DetailContent } from "@/components/Detail";
import { ActionSection } from "@/components/Report";
import { MonthOnMonth, latestMoM, momHelp } from "@/components/MonthOnMonth";
import { monthsWindow } from "@/lib/metrics";
import { shortTitle, type ProductFacts } from "@/lib/competeData";
import { CATEGORY_LABEL, signed } from "@/lib/format";
import type { ThemeCount } from "@/lib/reviewThemes";
import { VERDICT } from "@/lib/usp";
import { BUYER_CRITERIA, DEMAND_CRITERIA, ProductHead, VIS_CRITERIA } from "./Overview";
import { monthShort, tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";

const pc = (x: number) => `${Math.max(1, Math.round(x * 100))}%`;
const FEW = 30;

/* ---------------------------------------------------------------- §5 what buyers say */

function themesDetail(p: ProductFacts, kind: "praise" | "complaint"): DetailContent {
  const t = p.themes!; const xs = kind === "praise" ? t.praise : t.complaints;
  return {
    kicker: `${p.brand} · ${kind === "praise" ? tr("what buyers praise", "구매자가 칭찬하는 점") : tr("what buyers complain about", "구매자 불만")}`, title: shortTitle(p.name, p.brand),
    body: (<>
      <p className="text-muted">{tr(`Counted from the text of ${t.n} recent reviews (${t.low} rated 1–3★). `, `최근 리뷰 ${t.n}건(1–3★ ${t.low}건) 본문에서 집계. `)}{kind === "praise" ? tr("A theme counts when a review mentions it, e.g. “very hydrating”, and not “not hydrating”.", "리뷰가 그 주제를 언급할 때 집계. 예: “very hydrating”은 포함, “not hydrating”은 제외.") : tr("Complaints count from 1–3★ reviews; from 4–5★ reviews only texture, scent, price, packaging and no-result complaints after “but”, “though” or “a bit” (shown as mild). Breakouts count only from 1–3★ reviews.", "불만은 1–3★ 리뷰에서 집계. 4–5★ 리뷰에선 “but”, “though”, “a bit” 뒤에 나오는 제형·향·가격·포장·효과 불만만 집계(가벼운 불만으로 표시). 트러블은 1–3★ 리뷰에서만 집계.")}</p>
      {xs.length ? xs.map((x) => (
        <div key={x.key} className="mt-4">
          <div className="flex items-baseline justify-between gap-2"><b className="font-medium">{x.label}</b><span className="tabular text-ink-2">{tr(`${x.n} reviews`, `리뷰 ${x.n}건`)} · {pc(x.share)}{x.mild ? tr(` · ${x.mild} mild`, ` · 가벼운 불만 ${x.mild}`) : ""}</span></div>
          {x.quotes.length > 0 && <Points className="mt-1 text-[12px] text-ink-2" items={x.quotes.map((q) => <i key={q}>&ldquo;{q}&rdquo;</i>)} />}
        </div>
      )) : <p className="mt-3">{kind === "praise" ? tr("No praise theme found in these reviews.", "이 리뷰들에서 칭찬 주제 없음.") : tr("No complaint theme found in these reviews.", "이 리뷰들에서 불만 주제 없음.")}</p>}
    </>),
  };
}

function aiReadDetail(p: ProductFacts): DetailContent {
  const r = p.usp!.analysis.review_check;
  return {
    kicker: tr(`${p.brand} · paid review analysis`, `${p.brand} · AI 리뷰 분석`), title: shortTitle(p.name, p.brand),
    body: (<>
      <p className="text-muted">{tr(`AI read of ${r.reviews_considered} reviews (most-liked and most-recent), checking each claim the listing makes.`, `리뷰 ${r.reviews_considered}건(공감 많은 순·최신 순)을 AI가 읽고 상품 페이지 주장을 하나씩 확인. 인용문은 리뷰 원문.`)}</p>
      <DetailHead>{tr("Each claim, checked", "주장별 확인 결과")}</DetailHead>
      <Points items={r.benefit_verdicts.map((b) => { const v = VERDICT[b.verdict]; return <><b className="font-medium">{tx(b.benefit)}</b> <span className={`text-[12px] ${v.tone}`}>{v.label}</span>{b.quotes[0] && <span className="block text-[12px] italic text-muted">&ldquo;{b.quotes[0]}&rdquo;</span>}</>; })} />
      <DetailHead>{tr("Valued but not advertised", "광고하지 않았지만 구매자가 중시하는 점")}</DetailHead>
      {r.valued_but_not_advertised.length ? <Points tone="good" items={r.valued_but_not_advertised.map((x) => <>{tx(x.theme)} <span className="text-[12px] text-muted">({tx(x.how_often)})</span>{x.quotes[0] && <span className="block text-[12px] italic text-muted">&ldquo;{x.quotes[0]}&rdquo;</span>}</>)} /> : <Missing>{tr("Nothing beyond what the listing says", "상품 페이지 내용 외에는 없음")}</Missing>}
      <DetailHead>{tr("Recurring complaints", "반복되는 불만")}</DetailHead>
      {r.recurring_complaints.length ? <Points tone="bad" items={r.recurring_complaints.map((x) => <>{tx(x.theme)} <span className="text-[12px] text-muted">({tx(x.how_often)})</span>{x.quotes[0] && <span className="block text-[12px] italic text-muted">&ldquo;{x.quotes[0]}&rdquo;</span>}</>)} /> : <Missing>{tr("No recurring complaint", "반복되는 불만 없음")}</Missing>}
    </>),
  };
}

function StarSplit({ split }: { split: Record<string, number> }) {
  const tot = Object.values(split).reduce((x, y) => x + y, 0) || 1;
  const low = ((split["1"] ?? 0) + (split["2"] ?? 0)) / tot;
  return (
    <div className="w-full max-w-[150px]">
      <div className="flex h-2 overflow-hidden rounded-full">
        {["5", "4", "3", "2", "1"].map((k) => <span key={k} style={{ width: `${((split[k] ?? 0) / tot) * 100}%`, background: Number(k) >= 4 ? (k === "5" ? "#0e3b2e" : "#5c5b56") : k === "3" ? "#b9b7ae" : "#c0352b" }} />)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted tabular">{Math.round((((split["5"] ?? 0) + (split["4"] ?? 0)) / tot) * 100)}% 4–5★ · {Math.round(low * 100)}% 1–2★</div>
    </div>
  );
}

const themeChips = (xs: ThemeCount[], tone: "good" | "bad") => xs.slice(0, 4).map((x) => (
  <Chip key={x.key} tone={tone}><span className={x.mild === x.n && tone === "bad" ? "opacity-70" : ""}>{x.label} {pc(x.share)}{tone === "bad" && x.mild === x.n ? tr(" · mild", " · 가벼움") : ""}</span></Chip>
));

export function Buyers({ products, colors, loading }: { products: ProductFacts[]; colors: Record<string, string>; loading: boolean }) {
  const a = products.find((p) => p.role === "anchor");
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const few = (p: ProductFacts) => (p.themes && p.themes.n < FEW ? tr(` (only ${p.themes.n} reviews)`, ` (리뷰 ${p.themes.n}건뿐)`) : "");
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "split", after: "rating", label: tr("Star split", "별점 분포"), help: tr("Share of all star ratings", "전체 별점 중 비중"), has: (p) => !!p.split, missing: () => tr("Not shown on Nykaa", "Nykaa에 표시 없음"), render: (p) => <StarSplit split={p.split!} /> },
    { key: "praise", label: tr("Praised for", "칭찬받는 점"), help: tr("Themes counted in the review text (our count, same method for every product); click for numbers and quotes", "리뷰 본문에서 집계한 주제 (모든 제품에 같은 방법). 누르면 수치·인용문 표시"),
      has: (p) => !!p.themes?.n, missing: () => (loading ? tr("Loading…", "불러오는 중…") : tr("No reviews collected", "수집된 리뷰 없음")),
      render: (p) => p.themes!.praise.length ? <Opens detail={themesDetail(p, "praise")}><span className="flex flex-wrap gap-1">{themeChips(p.themes!.praise, "good")}</span>{few(p) && <span className="block text-[11px] text-muted">{few(p)}</span>}</Opens>
        : <Missing>{tr(`No praise theme in ${p.themes!.n} reviews`, `리뷰 ${p.themes!.n}건에 칭찬 주제 없음`)}</Missing> },
    { key: "complaints", label: tr("Complaints", "불만"), help: tr("Complaint themes: all from 1–3★ reviews, plus mild ones raised inside 4–5★ reviews (lighter); click for the method and quotes", "불만 주제: 1–3★ 리뷰 전체 + 4–5★ 리뷰 속 가벼운 불만(흐리게 표시). 누르면 방법·인용문 표시"),
      has: (p) => !!p.themes?.n, missing: () => (loading ? tr("Loading…", "불러오는 중…") : tr("No reviews collected", "수집된 리뷰 없음")),
      render: (p) => p.themes!.complaints.length ? <Opens detail={themesDetail(p, "complaint")}><span className="flex flex-wrap gap-1">{themeChips(p.themes!.complaints, "bad")}</span></Opens>
        : <Opens detail={themesDetail(p, "complaint")}><Missing>{tr(`No complaint theme in ${p.themes!.n} reviews`, `리뷰 ${p.themes!.n}건에 불만 주제 없음`)}</Missing></Opens> },
    { key: "nykaa", label: tr("Nykaa's tags", "Nykaa 태그"), help: tr("Tags reviewers pick on Nykaa (% of tagged reviews) and Nykaa's own summary phrases. Not every product gets them, and tagged reviews are mostly positive, so they are shown apart from our count", "리뷰어가 Nykaa에서 고르는 태그(태그 단 리뷰 중 %)와 Nykaa 요약 문구. 모든 제품에 있진 않고, 태그 단 리뷰는 대부분 긍정적이라 우리 집계와 따로 표시"),
      has: (p) => !!p.themes?.tagged || p.phrases.length > 0, missing: () => (loading ? tr("Loading…", "불러오는 중…") : tr("Nykaa shows no tags for this product", "Nykaa에 이 제품 태그 없음")),
      render: (p) => (
        <div className="space-y-1">
          {!!p.themes?.tagged && <div className="flex flex-wrap gap-1">{p.themes.tags.slice(0, 3).map((t) => <Chip key={t.label} tone="plain">{tx(t.label)} {pc(t.share)}</Chip>)}</div>}
          {p.phrases.length > 0 && <Opens detail={{ kicker: tr(`${p.brand} · Nykaa's review summary`, `${p.brand} · Nykaa 리뷰 요약`), title: shortTitle(p.name, p.brand), body: <>
            <DetailHead>{tr("Positive", "긍정")}</DetailHead><div className="flex flex-wrap gap-1">{p.phrases.filter((x) => x.sentiment === "Positive").map((x) => <Chip key={x.text} tone="good">{tx(x.text)}</Chip>)}</div>
            <DetailHead>{tr("Negative", "부정")}</DetailHead><div className="flex flex-wrap gap-1">{p.phrases.filter((x) => x.sentiment !== "Positive").map((x) => <Chip key={x.text} tone="bad">{tx(x.text)}</Chip>)}</div>
            {!!p.themes?.tagged && <><DetailHead>{tr(`Reviewer tags (${p.themes.tagged} tagged reviews)`, `리뷰어 태그 (태그 단 리뷰 ${p.themes.tagged}건)`)}</DetailHead><Points items={p.themes.tags.map((t) => `${tx(t.label)}: ${pc(t.share)}${t.negative ? tr(` (${t.negative} negative)`, ` (부정 ${t.negative})`) : ""}`)} /></>}
          </> }}><span className="text-[11.5px] text-ink-2">{tr(`${p.phrases.length} Nykaa phrases`, `Nykaa 문구 ${p.phrases.length}개`)}</span></Opens>}
        </div>) },
    { key: "echo", label: tr("Buyers repeat it", "구매자 공감"), help: tr("Share of the product's claims that its reviewers say back: 60%+ strong, 30–59% moderate, under 30% weak", "리뷰어가 따라 말하는 소구점 비율: 60% 이상 강함, 30–59% 보통, 30% 미만 약함"), has: (p) => !!p.usp, missing: (p) => (p.role === "rival" ? tr("Not in an analysed group", "분석 그룹에 없음") : tr("Not analysed", "분석 안 됨")),
      render: (p) => <Level level={p.echo.level} reasons={p.echo.reasons} none={p.echo.none} title={tr("Buyers repeat its claims", "구매자의 소구점 공감")} kicker={`${p.brand} · ${shortTitle(p.name, p.brand)}`} /> },
    { key: "ai", label: tr("Paid review analysis", "AI 리뷰 분석"), help: tr("The AI read of each claim against the reviews, with what buyers value unprompted and recurring complaints", "주장별로 리뷰와 대조한 AI 분석. 구매자가 스스로 꼽는 장점과 반복 불만 포함"),
      has: (p) => !!p.usp, missing: (p) => (p.role === "rival" ? tr("Not in an analysed group", "분석 그룹에 없음") : tr("Not analysed", "분석 안 됨")),
      render: (p) => { const r = p.usp!.analysis.review_check; return (
        <Opens detail={aiReadDetail(p)}><span className="block text-[12px] leading-snug">
          <span className="text-good">{tr(`${r.valued_but_not_advertised.length} valued unprompted`, `숨은 장점 ${r.valued_but_not_advertised.length}`)}</span> · <span className="text-bad">{tr(`${r.recurring_complaints.length} complaint${r.recurring_complaints.length === 1 ? "" : "s"}`, `불만 ${r.recurring_complaints.length}`)}</span>
          <span className="block text-[11px] text-muted">{tr(`${r.reviews_considered} reviews read`, `리뷰 ${r.reviews_considered}건 분석`)}</span></span></Opens>); } },
  ];
  const praise = a?.themes?.praise[0]; const comp = a?.themes?.complaints[0];
  const title = a && praise
    ? tr(`Buyers praise ${shortTitle(a.name, a.brand)} most for “${praise.label.toLowerCase()}” (${pc(praise.share)} of reviews)${comp ? `; the top complaint is “${comp.label.toLowerCase()}” (${pc(comp.share)})` : "; no complaint theme stands out"}.`,
      `${shortTitle(a.name, a.brand)} 구매자 최다 칭찬: “${praise.label}”(리뷰의 ${pc(praise.share)})${comp ? `, 최다 불만: “${comp.label}”(${pc(comp.share)})` : ", 두드러진 불만 없음"}.`)
    : tr("What reviewers say, product by product.", "제품별 리뷰 반응.");
  return (
    <ActionSection id="buyers" kicker={tr("What buyers say · reviews", "구매자 반응 · 리뷰")} title={title}
      note={tr("Three layers: our count of themes in the review text (the same for every product), Nykaa's own tags where it shows them, and the paid AI review read one click away. Percentages are of all stored recent reviews, so short reviews (“good product”) lower them evenly for everyone.", "세 겹으로 확인: 리뷰 본문 주제 집계(모든 제품에 같은 방법), Nykaa 태그, 한 번 누르면 나오는 AI 리뷰 분석. 비율은 저장된 최근 리뷰 전체 기준이라 “good product” 같은 짧은 리뷰가 모든 제품의 비율을 똑같이 낮춤.")}>
      <CompareGrid cols={cols} items={products} criteria={BUYER_CRITERIA} extra={extra} labelWidth={150} />
    </ActionSection>
  );
}

/* ---------------------------------------------------------------- §6 shelf, search and demand */

/** Shelf, search and demand in one table (owner 20 Oct 2026: one place, less space): where the product sits and how
 *  much it sells, with written reviews month on month. */
export function ShelfAndDemand({ products, colors, cat }: { products: ProductFacts[]; colors: Record<string, string>; cat: string }) {
  const a = products.find((p) => p.role === "anchor"); const win = monthsWindow(12);
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const SHOT = (s: string | null) => (s === "pack_shot" ? tr("pack shot", "제품 단독 컷") : s === "flat_lay" ? tr("flat lay", "플랫레이") : (s ?? "").replaceAll("_", " "));
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "thumb", after: "search", label: tr("Thumbnail style", "썸네일 스타일"), help: tr("How the main image reads in the grid (click a product image for the full read)", "목록 화면에서 대표 이미지가 보이는 방식 (제품 이미지를 누르면 전체 분석)"), has: (p) => !!p.thumb?.shot_type,
      missing: () => tr("Image not analysed yet", "이미지 미분석"),
      render: (p) => <div className="flex flex-wrap gap-1"><Chip>{SHOT(p.thumb!.shot_type)}</Chip><Chip>{p.thumb!.text_density === "heavy" ? tr("text-heavy", "문구 많음") : p.thumb!.text_density === "light" ? tr("light text", "문구 적음") : tr("no text", "문구 없음")}</Chip>{p.thumb!.model_present && <Chip>{tr("shows a person", "인물 있음")}</Chip>}</div> },
    { key: "spark", after: "momentum", label: tr("By month · month on month", "월별 · 전월 대비"), help: momHelp(), has: (p) => !!p.spark?.some((v) => v !== null),
      missing: () => tr("No review history tracked", "추적 중인 리뷰 이력 없음"), render: (p) => <MonthOnMonth values={p.spark!} win={win} open={p.sparkOpen} color={colors[p.brand] ?? "#8a8880"} /> },
  ];
  const higher = a ? products.filter((p) => p !== a && p.rank && (!a.rank || p.rank < a.rank)).length : 0;
  const top = [...products].filter((p) => p.recent !== null).sort((x, y) => y.recent! - x.recent!)[0];
  const mom0 = a ? latestMoM(a.spark, win, a.sparkOpen) : null; const mom = mom0 && !mom0.small ? mom0 : null;
  const title = a ? tr(`${a.rank ? `#${a.rank} in ${CATEGORY_LABEL[cat]} today` : `Not in today's ${CATEGORY_LABEL[cat]} top 100`}, ${higher} of ${products.length - 1} rivals higher${a.recent !== null ? `; ${a.recent} reviews in 3 months${top && top !== a ? ` (${top.brand} leads with ${top.recent})` : ", the most in the group"}` : ""}${mom ? `; ${monthShort(mom.month)} ${signed(mom.mom)} on the month before` : ""}.`,
      `${a.rank ? `오늘 ${CATEGORY_LABEL[cat]} ${a.rank}위` : `오늘 ${CATEGORY_LABEL[cat]} 100위 밖`}, 경쟁 제품 ${products.length - 1}개 중 ${higher}개가 더 높음${a.recent !== null ? `. 3개월 리뷰 ${a.recent}건${top && top !== a ? ` (선두 ${top.brand} ${top.recent}건)` : ", 그룹 내 최다"}` : ""}${mom ? `. ${monthShort(mom.month)} 전월 대비 ${signed(mom.mom)}` : ""}.`)
    : tr("Shelf, search and demand.", "진열·검색·수요.");
  return (
    <ActionSection id="visibility" kicker={tr("Shelf, search and demand", "진열·검색·수요")} title={title}
      note={tr("Green where Innisfree beats that rival, red where it trails, grey on par (within 3 places or 5%). Demand = written reviews: Nykaa does not publish sales, and new reviews per month track them closely.", "초록 = Innisfree가 그 경쟁 제품보다 앞섬, 빨강 = 뒤짐, 회색 = 비슷 (3계단 또는 5% 이내). 수요 = 작성 리뷰: Nykaa는 판매량을 공개하지 않고, 월별 신규 리뷰가 판매를 잘 따라감.")}>
      <span id="demand" className="block scroll-mt-32" />
      <CompareGrid cols={cols} items={products} criteria={[...VIS_CRITERIA, ...DEMAND_CRITERIA]} extra={extra} colors={products.map((p) => colors[p.brand])} labelWidth={150}
        groups={{ rank: tr("Shelf and search", "진열·검색"), demand: tr("Demand · written reviews", "수요 · 작성 리뷰") }} />
    </ActionSection>
  );
}
