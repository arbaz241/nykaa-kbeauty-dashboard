"use client";

import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { DetailHead, Level, Missing, Opens, Points, type DetailContent } from "@/components/Detail";
import { ActionSection } from "@/components/Report";
import { Card } from "@/components/ui";
import { matchRival, shortTitle, type ProductFacts } from "@/lib/competeData";
import { clause } from "@/lib/format";
import type { UspComparison } from "@/lib/usp";
import { ProductHead } from "./Overview";
import { dayMonthYear, tr } from "@/lib/i18n";
import { tx, txs } from "@/lib/dict";

const CONF: Record<string, [string, string]> = { high: ["high", "높음"], medium: ["medium", "보통"], low: ["low", "낮음"] };
const DIM: Record<string, string> = { concern: "피부 고민", skin_type: "피부 타입", routine_role: "루틴 내 역할", price_positioning: "가격 포지션", values: "가치관", age_or_life_stage: "연령·생애 단계", occasion: "사용 상황" };
const LVL: Record<string, string> = { strong: "강함", moderate: "보통", weak: "약함" };
const PROOF: Record<string, string> = { ingredient_logic_only: "성분 논리만", consumer_perception_study: "소비자 체감 조사", instrumental_test: "기기 측정", before_after: "사용 전후 비교", clinical_number: "임상 수치", dermatologist_endorsement: "피부과 전문의 추천", time_to_result: "효과 발현 시간" };
const proofWord = (k: string) => tr(k.replaceAll("_", " "), PROOF[k] ?? k.replaceAll("_", " "));

/* ---------------------------------------------------------------- §3 message */

const notAnalysed = (p: ProductFacts) => (p.role === "rival" ? tr("Not in an analysed group", "분석 그룹에 없음") : tr("Not analysed", "분석 안 됨"));

function promiseDetail(p: ProductFacts): DetailContent {
  const m = p.usp!.analysis.main_usp;
  return {
    kicker: tr(`${p.brand} · main promise`, `${p.brand} · 핵심 약속`), title: shortTitle(p.name, p.brand),
    body: (<>
      <p className="text-[14px] font-medium leading-snug">{tx(m.statement)}</p>
      {m.brand_words && <><DetailHead>{tr("In the brand’s words", "브랜드 표현 그대로")}</DetailHead><p className="italic text-ink-2">&ldquo;{m.brand_words}&rdquo;</p>{tx(m.brand_words) !== m.brand_words && <p className="mt-1 text-[12.5px] text-muted">{tx(m.brand_words)}</p>}</>}
      <DetailHead>{tr("Why this is the lead message", "이것이 대표 메시지인 이유")}</DetailHead><Points items={tx(m.why_this_is_the_usp).split(/(?<=[.!?])\s+/).slice(0, 4)} />
      {m.runner_up && <><DetailHead>{tr("Runner-up message", "차순위 메시지")}</DetailHead><p className="text-ink-2">{tx(m.runner_up)}</p></>}
      <p className="mt-4 text-[12px] text-muted">{tr(`Confidence ${m.confidence}. Read from every photo in the Nykaa gallery and the page text.`, `신뢰도 ${(CONF[m.confidence] ?? [m.confidence, m.confidence])[1]}. Nykaa 상세 이미지 전체와 페이지 문구를 읽고 판단.`)}</p>
    </>),
  };
}

function benefitsDetail(p: ProductFacts): DetailContent {
  const a = p.usp!.analysis;
  return {
    kicker: tr(`${p.brand} · benefits and ingredients`, `${p.brand} · 효능과 성분`), title: shortTitle(p.name, p.brand),
    body: (<>
      <DetailHead>{tr("Benefits claimed, most emphasised first", "주장하는 효능 (강조 순)")}</DetailHead>
      <Points items={[...a.key_benefits].sort((x, y) => y.emphasis - x.emphasis).map((b) => <><b className="font-medium">{tx(b.benefit)}</b><span className="block text-[12px] text-muted">{b.proof_type === "none" ? tr("no proof offered", "근거 없음") : `${proofWord(b.proof_type)}${b.proof_detail ? `: ${tx(b.proof_detail)}` : ""}`}</span></>)} />
      {!!a.hero_ingredients.length && <><DetailHead>{tr("Hero ingredients and their claimed role", "핵심 성분과 주장하는 역할")}</DetailHead><Points items={a.hero_ingredients.map((h) => <><b className="font-medium">{tx(h.ingredient)}</b>: {tx(h.claimed_role)}</>)} /></>}
      {a.emotional_and_brand_angle && <><DetailHead>{tr("Brand and emotional angle", "브랜드·감성 포인트")}</DetailHead><p className="text-ink-2">{tx(a.emotional_and_brand_angle)}</p></>}
    </>),
  };
}

function whoDetail(p: ProductFacts): DetailContent {
  const t = p.usp?.analysis.target_consumer;
  return {
    kicker: tr(`${p.brand} · who it is for`, `${p.brand} · 타깃 소비자`), title: shortTitle(p.name, p.brand),
    body: (<>
      {t && <p className="text-ink-2">{tx(t.summary)}</p>}
      {(p.skinTypes.length > 0 || p.concerns.length > 0) && <><DetailHead>{tr("On the Nykaa page", "Nykaa 페이지 표기")}</DetailHead><Points items={[...(p.skinTypes.length ? [`${tr("Skin type", "피부 타입")}: ${p.skinTypes.join(", ")}`] : []), ...(p.concerns.length ? [`${tr("Concern", "피부 고민")}: ${p.concerns.join(", ")}`] : [])]} /></>}
      {t && <><DetailHead>{tr("Read from the listing", "상품 페이지에서 읽은 내용")}</DetailHead><Points items={t.attributes.map((x) => <><b className="font-medium">{tr(x.dimension.replaceAll("_", " "), DIM[x.dimension] ?? x.dimension.replaceAll("_", " "))}</b>: {tx(x.value)} <span className="text-[11.5px] text-muted">({x.basis === "stated" ? tr("stated", "명시") : tr("implied", "암시")})</span></>)} /></>}
    </>),
  };
}

function versusDetail(p: ProductFacts, hero: UspComparison, products: ProductFacts[]): DetailContent {
  const ap = hero.comparison.anchor_position;
  const mine = <T,>(xs: T[], f: (x: T) => string) => xs.filter((x) => matchRival(f(x), products) === p);
  const st = mine(ap.stronger_than_rivals, (x) => x.rival); const wk = mine(ap.weaker_than_rivals, (x) => x.rival); const ov = mine(ap.overlaps_with, (x) => x.rival);
  return {
    kicker: `Innisfree vs ${p.brand}`, title: shortTitle(p.name, p.brand),
    body: (<>
      <DetailHead>{tr("Where Innisfree’s message is stronger", "Innisfree 메시지가 더 강한 점")}</DetailHead>{st.length ? <Points tone="good" items={txs(st.map((x) => x.where))} /> : <Missing>{tr("No clear edge over this rival", "이 경쟁 제품보다 뚜렷이 앞서는 점 없음")}</Missing>}
      <DetailHead>{tr("Where it is weaker", "더 약한 점")}</DetailHead>{wk.length ? <Points tone="bad" items={txs(wk.map((x) => x.where))} /> : <Missing>{tr("This rival does not clearly out-argue it", "이 경쟁 제품이 뚜렷이 앞서는 점 없음")}</Missing>}
      <DetailHead>{tr("What both say", "공통 메시지")}</DetailHead>{ov.length ? <Points items={txs(ov.map((x) => x.shared_message))} /> : <Missing>{tr("No shared message", "공통 메시지 없음")}</Missing>}
      {p.groupRead && <><DetailHead>{tr(`${p.brand}’s own angle`, `${p.brand}만의 포인트`)}</DetailHead><p className="text-ink-2">{tx(p.groupRead.distinct_angle)}</p></>}
    </>),
  };
}

export function versusCounts(p: ProductFacts, hero: UspComparison, products: ProductFacts[]) {
  const ap = hero.comparison.anchor_position;
  const n = <T,>(xs: T[], f: (x: T) => string) => xs.filter((x) => matchRival(f(x), products) === p).length;
  return { st: n(ap.stronger_than_rivals, (x) => x.rival), wk: n(ap.weaker_than_rivals, (x) => x.rival), ov: n(ap.overlaps_with, (x) => x.rival) };
}

export function Message({ hero, products, colors }: { hero: UspComparison | null; products: ProductFacts[]; colors: Record<string, string> }) {
  const a = products.find((p) => p.role === "anchor");
  const c = hero?.comparison;
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const has = (p: ProductFacts) => !!p.usp;
  const benefits = (p: ProductFacts) => [...p.usp!.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis);
  const rows: ExtraRow<ProductFacts>[] = [
    { key: "promise", label: tr("Main promise", "핵심 약속"), help: tr("The one message the listing leads on; click for the full statement", "상품 페이지가 앞세우는 단 하나의 메시지. 누르면 전문 표시"), has, missing: notAnalysed,
      render: (p) => <Opens detail={promiseDetail(p)}><span className="text-[12.5px] font-medium leading-snug">{p.promise}</span></Opens> },
    { key: "benefits", label: tr("Key benefits", "주요 효능"), help: tr("Most emphasised first; click for the proof behind each", "강조 순. 누르면 효능별 근거 표시"), has, missing: notAnalysed,
      render: (p) => <div className="flex flex-wrap gap-1">{benefits(p).slice(0, 4).map((b) => <Chip key={b.benefit}>{clause(tx(b.benefit), 5)}</Chip>)}
        <Opens detail={benefitsDetail(p)}><span className="text-[11.5px] text-ink-2">{benefits(p).length > 4 ? tr(`+${benefits(p).length - 4} more`, `+${benefits(p).length - 4}개 더`) : tr("detail", "상세")}</span></Opens></div> },
    { key: "ingredients", label: tr("Hero ingredients", "핵심 성분"), has: (p) => !!p.usp?.analysis.hero_ingredients.length || p.ingredients.length > 0,
      missing: (p) => (p.usp ? tr("No ingredient named as the hero", "핵심으로 내세운 성분 없음") : tr("No ingredients listed", "성분 표기 없음")),
      render: (p) => <div className="flex flex-wrap gap-1">{(p.usp?.analysis.hero_ingredients.length ? txs(p.usp.analysis.hero_ingredients.map((h) => h.ingredient)) : p.ingredients).slice(0, 4).map((x) => <Chip key={x} tone="plain">{clause(x, 4)}</Chip>)}</div> },
    { key: "proof", label: tr("Proof of claims", "소구점 근거"), help: tr("How well the listing proves what it claims (clinical numbers, tests, before/after); click for the reasons", "상품 페이지가 주장을 얼마나 입증하는지 (임상 수치, 테스트, 사용 전후). 누르면 이유 표시"), has, missing: notAnalysed,
      render: (p) => <Level level={p.proof.level} reasons={p.proof.reasons} title={tr("Proof of claims", "소구점 근거")} kicker={`${p.brand} · ${shortTitle(p.name, p.brand)}`} /> },
    { key: "who", label: tr("Who it's for", "타깃 소비자"), help: tr("Skin type and concerns from the Nykaa page and the listing read; click for age, routine and evidence", "Nykaa 페이지와 상품 분석의 피부 타입·고민. 누르면 연령, 루틴, 근거 표시"),
      has: (p) => p.whoFor.skin.length + p.whoFor.concerns.length > 0 || !!p.whoFor.age, missing: () => tr("No target stated on the page", "페이지에 타깃 표기 없음"),
      render: (p) => (
        <Opens detail={whoDetail(p)}><div className="space-y-1">
          {p.whoFor.skin.length > 0 && <div className="flex flex-wrap gap-1"><span className="text-[11px] text-muted">{tr("Skin", "피부")}</span>{p.whoFor.skin.map((x) => <Chip key={x}>{x}</Chip>)}</div>}
          {p.whoFor.concerns.length > 0 && <div className="flex flex-wrap gap-1"><span className="text-[11px] text-muted">{tr("For", "고민")}</span>{p.whoFor.concerns.slice(0, 4).map((x) => <Chip key={x}>{x}</Chip>)}</div>}
          {p.whoFor.age && <div className="text-[11.5px] leading-snug text-ink-2">{p.whoFor.age}</div>}
        </div></Opens>) },
    { key: "angle", label: tr("Distinct angle", "차별 포인트"), help: tr("What sets it apart within this group", "이 그룹 안에서 이 제품을 구별 짓는 점"), has: (p) => !!p.groupRead, missing: notAnalysed,
      render: (p) => <Opens detail={{ kicker: tr(`${p.brand} · distinct angle`, `${p.brand} · 차별 포인트`), title: shortTitle(p.name, p.brand), body: <><p>{tx(p.groupRead!.distinct_angle)}</p><DetailHead>{tr("Credibility", "신뢰도")}: {tr(p.groupRead!.credibility, LVL[p.groupRead!.credibility] ?? p.groupRead!.credibility)}</DetailHead><p className="text-ink-2">{tx(p.groupRead!.credibility_reason)}</p><DetailHead>{tr("Do buyers echo it", "구매자도 같은 말을 하는가")}</DetailHead><p className="text-ink-2">{tx(p.groupRead!.buyers_echo_it)}</p></> }}>
        <span className="text-[12.5px] leading-snug">{clause(tx(p.groupRead!.distinct_angle), 10)}</span></Opens> },
    ...(hero ? [{ key: "versus", label: tr("Innisfree vs this rival", "Innisfree vs 이 경쟁 제품"), help: tr("Where Innisfree's message is stronger, weaker or the same as this rival's; click for each point", "Innisfree 메시지가 이 경쟁 제품보다 강한 점·약한 점·같은 점. 누르면 항목별 표시"),
      render: (p: ProductFacts) => {
        if (p === a) return <span className="text-[11.5px] text-muted">{tr("The product being compared", "비교 기준 제품")}</span>;
        if (p.role === "added") return <span className="text-[11.5px] italic text-muted">{tr("Added by you: not in the AI comparison (AI reads are paused)", "직접 추가: AI 비교에 포함되지 않음 (AI 분석 중지 중)")}</span>;
        const n = versusCounts(p, hero, products);
        return <Opens detail={versusDetail(p, hero, products)}><span className="flex flex-wrap gap-1"><Chip tone="good">{tr("stronger", "강함")} {n.st}</Chip><Chip tone="bad">{tr("weaker", "약함")} {n.wk}</Chip><Chip>{tr("shared", "공통")} {n.ov}</Chip></span></Opens>;
      } }] : []),
  ];
  const title = c ? tr(`${c.anchor_position.unique_to_anchor.length} claim${c.anchor_position.unique_to_anchor.length === 1 ? " is" : "s are"} Innisfree's alone and ${c.table_stakes.length} are made by every rival.`,
      `Innisfree만의 소구점 ${c.anchor_position.unique_to_anchor.length}개, 모든 경쟁 제품이 내세우는 소구점 ${c.table_stakes.length}개.`)
    : tr("What each product says about itself.", "제품별로 스스로 내세우는 메시지.");
  return (
    <ActionSection id="message" kicker={tr("Message · what each product sells itself on", "메시지 · 제품별 핵심 소구점")} title={title}
      note={c ? tr(<>What each listing claims, read from every photo in its Nykaa gallery and its page text; what buyers make of it is under What buyers say. Levels use one scale: <b>strong · moderate · weak</b>; click a level for the reasons. {<Opens className="ml-1" detail={{ kicker: "AI read of the whole group", title: "The group at a glance", body: <Points items={c.group_summary.split(/(?<=[.!?])\s+/)} /> }}>Group summary</Opens>}</>,
        <>상품 페이지가 내세우는 내용. 제품별 Nykaa 상세 이미지 전체와 페이지 문구를 읽고 판단. 구매자 반응은 ‘구매자 반응’ 참고. 수준은 한 가지 척도로 표시: <b>강함 · 보통 · 약함</b>. 수준을 누르면 이유 표시. {<Opens className="ml-1" detail={{ kicker: "그룹 전체 AI 분석", title: "그룹 한눈에 보기", body: <Points items={tx(c.group_summary).split(/(?<=[.!?])\s+/)} /> }}>그룹 요약</Opens>}</>)
        : tr("No message analysis for this category yet: rows show what the Nykaa page states.", "이 카테고리는 아직 메시지 분석이 없어 Nykaa 페이지 표기만 표시.")}>
      <CompareGrid cols={cols} items={products} criteria={[]} extra={rows} labelWidth={150} />
      {c && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Bucket title={tr("Table stakes", "기본 소구점")} help={tr("Claims every product here makes: needed to compete, but they set no one apart.", "모든 제품이 내세우는 소구점: 경쟁엔 필요하지만 차별화는 안 됨.")} tone={undefined}
            items={c.table_stakes.map((t) => ({ head: clause(tx(t.claim), 9), detail: { kicker: tr("Table stake", "기본 소구점"), title: tx(t.claim), body: <><DetailHead>{tr("Made by", "내세우는 제품")}</DetailHead><Points items={t.products_making_it} /></> } }))} empty={tr("None found.", "없음.")} />
          <Bucket title={tr("Only Innisfree says", "Innisfree만의 소구점")} help={tr("Points of difference: claims no rival in this group makes.", "차별점: 이 그룹의 어떤 경쟁 제품도 하지 않는 주장.")} tone="good"
            items={c.anchor_position.unique_to_anchor.map((x) => ({ head: clause(tx(x), 9), detail: { kicker: tr("Point of difference", "차별점"), title: tx(x), body: <p className="text-muted">{tr("No rival in this group makes this claim.", "이 그룹의 어떤 경쟁 제품도 하지 않는 주장.")}</p> } }))} empty={tr("Nothing Innisfree claims is unique here.", "Innisfree만의 소구점 없음.")} />
          <Bucket title={tr("White space", "빈틈 (기회)")} help={tr("What buyers value that no listing here claims: an opening for Innisfree.", "구매자는 중시하는데 어떤 상품 페이지도 내세우지 않는 점: Innisfree의 기회.")} tone="good"
            items={c.white_space.map((w) => ({ head: clause(tx(w.opportunity), 9), detail: { kicker: tr("White space", "빈틈 (기회)"), title: tx(w.opportunity), body: <><DetailHead>{tr("Evidence", "근거")}</DetailHead><Points items={tx(w.evidence).split(/(?<=[.!?])\s+/)} /></> } }))} empty={tr("None found.", "없음.")} />
        </div>
      )}
      {hero && <p className="mt-3 text-[11.5px] text-muted">{tr(`Analysed ${dayMonthYear(hero.analysed_at)}; re-read only when a product’s photos change.`, `${dayMonthYear(hero.analysed_at)} 분석. 제품 이미지가 바뀔 때만 재분석.`)}</p>}
    </ActionSection>
  );
}

/** One labelled list with a count and a one-line meaning; each point opens its detail. */
export function Bucket({ title, help, items, empty, tone }: { title: string; help: string; items: { head: string; detail: DetailContent }[]; empty: string; tone?: "good" | "bad" }) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className={`text-[13.5px] font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{title}</div>
        <span className="rounded-full bg-sunken px-2 py-px text-[11.5px] font-semibold tabular text-ink-2">{items.length}</span>
      </div>
      <div className="text-[11.5px] leading-snug text-muted">{help}</div>
      {items.length ? <Points className="mt-2.5 text-[12.5px]" tone={tone} items={items.map((i) => <Opens key={i.head} detail={i.detail}>{i.head}</Opens>)} /> : <p className="mt-2 text-[12.5px] text-muted">{empty}</p>}
    </Card>
  );
}
