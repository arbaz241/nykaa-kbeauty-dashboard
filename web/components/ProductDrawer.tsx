"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useProduct, useThumbnails } from "@/lib/data";
import { CATEGORY_LABEL, compact, inr, shortName } from "@/lib/format";
import { monthsWindow } from "@/lib/metrics";
import { VERDICT, useUspProducts } from "@/lib/usp";
import { LEVEL_WORD } from "./Detail";
import LineChart from "./LineChart";
import { push } from "@/lib/group";
import { dayMonth, dayMonthYear, monthYY, tr } from "@/lib/i18n";
import { tx, txs } from "@/lib/dict";
import Link from "next/link";
import { brandHref, productHref } from "./Links";

/** Minimal info a caller already has; the drawer fetches history on demand. */
export interface ProductRef {
  product_id: string; name: string; brand: string; url?: string | null; image?: string | null; price?: number | null; mrp?: number | null;
  rating?: number | null; rating_count?: number | null; usp?: string | null; concerns?: string[] | null; phrases?: { text: string; sentiment: string }[] | null;
  splitup?: Record<string, number> | null; madeIn?: string | null;
}

const Ctx = createContext<(p: ProductRef) => void>(() => {});
export const useOpenProduct = () => useContext(Ctx);

export function ProductDrawerProvider({ children }: { children: React.ReactNode }) {
  const [p, setP] = useState<ProductRef | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setP(null);
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Ctx.Provider value={setP}>
      {children}
      {p && <Drawer p={p} onClose={() => setP(null)} />}
    </Ctx.Provider>
  );
}

function Drawer({ p, onClose }: { p: ProductRef; onClose: () => void }) {
  const { data, error } = useProduct(p.product_id);
  const win = monthsWindow(12);
  const monthly = useMemo(() => {
    const m = new Map((data?.months ?? []).filter((r) => r.month >= r.coverage_start).map((r) => [r.month, r.reviews]));
    const start = data?.months[0]?.coverage_start ?? "1900-01-01";
    return win.map((mo) => (data?.months.length && mo >= start ? m.get(mo) ?? 0 : null));
  }, [data, win]);
  const byCat = useMemo(() => {
    const g = new Map<string, typeof data extends undefined ? never : NonNullable<typeof data>["history"]>();
    (data?.history ?? []).forEach((h) => push(g, h.subcategory, h));
    return g;
  }, [data]);
  const days = [...new Set((data?.history ?? []).map((h) => h.scrape_date))].sort();
  const priceSeries = days.map((d) => (data?.history ?? []).find((h) => h.scrape_date === d)?.price ?? null);
  const tot = p.splitup ? Object.values(p.splitup).reduce((a, b) => a + b, 0) || 1 : 1;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[720px] overflow-y-auto bg-page shadow-pop">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-page/90 px-7 py-3 backdrop-blur">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{tr("Quick look", "간단히 보기")}</span>
          <span className="ml-auto mr-2 flex gap-2">
            <Link href={productHref(p.product_id)} onClick={onClose} className="rounded-lg bg-brand px-2.5 py-1 text-[13px] font-medium text-on-brand hover:opacity-90">{tr("Full product page →", "제품 전체 페이지 →")}</Link>
            <Link href={brandHref(p.brand)} onClick={onClose} className="rounded-lg px-2.5 py-1 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">{tr(`${p.brand} page`, `${p.brand} 페이지`)}</Link>
          </span>
          <button onClick={onClose} className="rounded-lg px-2.5 py-1 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">{tr("Close · Esc", "닫기 · Esc")}</button>
        </div>
        <div className="px-7 py-6">
          <div className="flex gap-6">
            <div className="grid h-40 w-40 shrink-0 place-items-center rounded-2xl bg-surface ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- images served by Nykaa's CDN */}
              {p.image ? <img src={p.image} alt="" className="h-[85%] w-[85%] object-contain" /> : <span className="text-[12px] text-muted">{tr("No image", "이미지 없음")}</span>}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{p.brand}{p.madeIn ? tr(` · Made in ${p.madeIn}`, ` · ${tx(p.madeIn)} 생산`) : ""}</div>
              <h3 className="mt-1 font-display text-[22px] font-semibold leading-snug tracking-tight">{shortName(p.name, p.brand)}</h3>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[14px] tabular">
                {p.price != null && <span><b className="text-[18px]">{inr(p.price)}</b>{p.mrp && p.price && p.mrp > p.price ? <span className="ml-1.5 text-muted line-through">{inr(p.mrp)}</span> : null}</span>}
                {p.rating != null && <span>★ {p.rating.toFixed(1)} <span className="text-muted">· {tr(`${compact(p.rating_count)} ratings`, `평가 ${compact(p.rating_count)}건`)}</span></span>}
              </div>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-on-brand hover:opacity-90">{tr("Open on Nykaa ↗", "Nykaa에서 보기 ↗")}</a>}
            </div>
          </div>
          {p.usp && <p className="mt-6 text-[14.5px] leading-relaxed">{tx(p.usp)}</p>}

          {error && <p className="mt-6 text-[13px] text-bad">{tr("Could not load history", "이력을 불러오지 못했습니다")}: {String(error.message)}</p>}

          <Block title={tr("Demand: reviews per month", "수요: 월별 리뷰 수")} note={tr("Last 12 complete months. Months before the product's reliable history are blank.", "최근 완결된 12개월. 신뢰할 수 있는 이력 이전의 달은 비워 둡니다.")}>
            {monthly.some((v) => v !== null) ? <LineChart labels={win.map((m) => monthYY(m))} series={[{ name: tr("Reviews", "리뷰"), color: "#2a78d6", values: monthly }]} height={200} />
              : <p className="text-[13px] text-muted">{data ? tr("This product is not in the review-history set (tracked for the focus brands' leading products and the most visible competitors).", "이 제품은 리뷰 이력 수집 대상이 아닙니다 (주요 브랜드의 대표 제품과 노출이 많은 경쟁 제품만 추적).") : tr("Loading…", "불러오는 중…")}</p>}
          </Block>

          <Block title={tr("Rank on the shelf", "진열 순위")} note={tr("Daily position in each category's top 100 (1 = top). Gaps are days it was outside the top 100.", "카테고리별 상위 100위 안의 일별 순위 (1 = 최상위). 끊긴 구간은 100위 밖이었던 날입니다.")}>
            {byCat.size ? <LineChart labels={days.map((d) => dayMonth(d))} invert height={200}
              series={[...byCat.entries()].map(([cat, hs], i) => ({ name: CATEGORY_LABEL[cat] ?? tr("Korean store", "K-뷰티 스토어"), color: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"][i % 4], values: days.map((d) => hs.find((h) => h.scrape_date === d)?.rank ?? null) }))} />
              : <p className="text-[13px] text-muted">{data ? tr("Not in any tracked top 100 during the collected period.", "수집 기간 동안 추적 중인 상위 100위에 든 적이 없습니다.") : tr("Loading…", "불러오는 중…")}</p>}
          </Block>

          {priceSeries.some((v) => v !== null) && (
            <Block title={tr("Selling price", "판매가")} note={tr("As listed on each collection day.", "수집일마다 표시된 가격.")}>
              <LineChart labels={days.map((d) => dayMonth(d))} series={[{ name: tr("Price", "가격"), color: "#0e3b2e", values: priceSeries }]} height={160} format={(v) => inr(v)} />
            </Block>
          )}

          {p.splitup && (
            <Block title={tr("Star split", "별점 분포")} note={tr("Share of all ratings.", "전체 평가 중 비중.")}>
              {["5", "4", "3", "2", "1"].map((k) => (
                <div key={k} className="flex items-center gap-3 py-0.5 text-[12px] text-muted tabular">
                  <span className="w-3">{k}★</span><div className="h-2 flex-1 rounded-full bg-sunken"><div className="h-2 rounded-full bg-brand" style={{ width: `${((p.splitup![k] ?? 0) / tot) * 100}%`, opacity: Number(k) >= 4 ? 1 : 0.45 }} /></div>
                  <span className="w-10 text-right">{Math.round(((p.splitup![k] ?? 0) / tot) * 100)}%</span>
                </div>
              ))}
            </Block>
          )}

          {!!p.phrases?.length && (
            <Block title={tr("What shoppers say", "소비자 반응")} note={tr("Review themes Nykaa extracts from this product's reviews.", "Nykaa가 이 제품 리뷰에서 뽑은 주제.")}>
              <div className="flex flex-wrap gap-1.5">{p.phrases.map((ph) => <span key={ph.text} className={`rounded-full px-2.5 py-1 text-[12px] ${ph.sentiment === "Positive" ? "bg-[#eaf6ee] text-good" : "bg-[#fbecea] text-bad"}`}>{tx(ph.text)}</span>)}</div>
            </Block>
          )}

          <UspRead productId={p.product_id} />

          <ImageRead productId={p.product_id} />

          {!!data?.aspects.length && (
            <Block title={tr("What reviewers single out", "리뷰어가 꼽은 점")} note={tr("Nykaa asks reviewers to tag what stood out, with a sentiment. Share of mentions that were positive, most-mentioned first.", "Nykaa는 리뷰어에게 눈에 띈 점을 긍정·부정과 함께 태그하게 합니다. 긍정 언급 비중이며, 많이 언급된 순서입니다.")}>
              <div className="space-y-2">{data.aspects.slice(0, 8).map((a) => {
                const pct = Math.round((a.positive / a.total) * 100);
                return (
                  <div key={a.label} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-[13px] text-ink-2" title={tx(a.label)}>{tx(a.label)}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface ring-1 ring-line">
                      <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-24 shrink-0 text-right text-[12px] tabular-nums text-muted">{tr(`${pct}% of ${a.total}`, `${a.total}건 중 ${pct}%`)}</div>
                  </div>
                );
              })}</div>
            </Block>
          )}

          {!!data?.texts.length && (
            <Block title={tr("Recent reviews", "최근 리뷰")} note={tr("Latest reviews collected for this product.", "이 제품의 최근 수집 리뷰 (원문 그대로).")}>
              <div className="space-y-3">{data.texts.slice(0, 6).map((t) => (
                <div key={t.review_id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                  <div className="flex items-center justify-between text-[12px] text-muted"><span>{"★".repeat(t.rating ?? 0)}{t.is_buyer ? tr(" · verified buyer", " · 구매 인증") : ""}{t.images ? tr(` · ${t.images} photo${t.images > 1 ? "s" : ""}`, ` · 사진 ${t.images}장`) : ""}{t.likes ? tr(` · ${t.likes} found helpful`, ` · ${t.likes}명에게 도움됨`) : ""}</span><span>{dayMonthYear(t.created_on)}</span></div>
                  {t.title && <div className="mt-1 text-[13.5px] font-medium">{t.title}</div>}
                  {t.body && <div className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{t.body.slice(0, 280)}{t.body.length > 280 ? "…" : ""}</div>}
                </div>
              ))}</div>
            </Block>
          )}
        </div>
      </aside>
    </div>
  );
}

/** What the listing sells itself on, read from its whole gallery, page and reviews (USP page). */
export function UspRead({ productId }: { productId: string }) {
  const { data } = useUspProducts();
  const u = data?.find((x) => x.product_id === productId);
  if (!u) return null;
  const a = u.analysis;
  const v = VERDICT[a.review_check.usp_verdict];
  return (
    <Block title={tr("What it sells itself on", "핵심 소구점")} note={tr(`Read from all ${u.images ?? ""} photos in its Nykaa gallery, its page and ${a.review_check.reviews_considered} reviews.`, `Nykaa 상세 이미지 ${u.images ?? ""}장 전체, 상품 페이지, 리뷰 ${a.review_check.reviews_considered}건을 읽고 정리.`)}>
      <p className="text-[14px] font-medium leading-snug">{tx(a.main_usp.statement)}</p>
      <p className={`mt-1 text-[12.5px] font-medium ${v.tone}`}>{v.label}<span className="font-normal text-muted"> · {tr("proof", "근거")} {LEVEL_WORD[a.proof_strength.rating].toLowerCase()}</span></p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...a.key_benefits].sort((x, y) => y.emphasis - x.emphasis).slice(0, 5).map((b) => (
          <span key={b.benefit} className="rounded-full px-2.5 py-1 text-[12px] text-ink-2 ring-1 ring-line">{tx(b.benefit)}</span>
        ))}
      </div>
      {!!a.hero_ingredients.length && <p className="mt-3 text-[12.5px] text-ink-2"><span className="text-muted">{tr("Hero ingredients: ", "핵심 성분: ")}</span>{txs(a.hero_ingredients.map((h) => h.ingredient)).join(", ")}</p>}
      <p className="mt-1 text-[12.5px] text-ink-2"><span className="text-muted">{tr("For: ", "대상: ")}</span>{tx(a.target_consumer.summary)}</p>
      {!!a.review_check.valued_but_not_advertised.length && (
        <p className="mt-1 text-[12.5px] text-ink-2"><span className="text-muted">{tr("Buyers also value: ", "구매자가 함께 꼽는 점: ")}</span>{txs(a.review_check.valued_but_not_advertised.map((x) => x.theme)).join(" · ")}</p>
      )}
    </Block>
  );
}

/** Shot types the image read uses (scraper/thumbnails.py). */
const SHOT: Record<string, string> = { get pack_shot() { return tr("pack shot", "제품 단독 컷"); }, get flat_lay() { return tr("flat lay", "플랫레이"); } };

/** What this product's main image shows, as read from the image itself. */
export function ImageRead({ productId }: { productId: string }) {
  const { data } = useThumbnails();
  const t = data?.find((x) => x.product_id === productId);
  if (!t || !t.shot_type) return null;
  const bits = [
    SHOT[t.shot_type] ?? t.shot_type.replace("_", " "),
    t.model_present ? tr("shows a person", "인물 있음") : tr("no person", "인물 없음"),
    t.text_density === "heavy" ? tr("heavy text on image", "이미지 속 문구 많음") : t.text_density === "light" ? tr("light text", "문구 적음") : tr("no text", "문구 없음"),
    t.background ? tr(`${t.background} background`, `배경: ${tx(t.background)}`) : null,
  ].filter(Boolean) as string[];
  return (
    <Block title={tr("What the image says", "대표 이미지 분석")} note={tr("Nykaa ranks partly on clicks, and the thumbnail is what a shopper decides on.", "Nykaa 순위는 클릭에도 영향을 받고, 소비자는 썸네일을 보고 클릭을 결정합니다.")}>
      <p className="text-[13.5px] text-ink-2">{tx(t.summary)}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {bits.map((b) => <span key={b} className="rounded-full bg-sunken px-2.5 py-1 text-[12px] text-ink-2">{b}</span>)}
      </div>
      {!!t.on_image_claims?.length && (
        <div className="mt-3">
          <div className="text-[12px] text-muted">{tr("Printed on the image", "이미지에 적힌 문구")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {t.on_image_claims.map((c) => (
              <span key={c} className="rounded-full px-2.5 py-1 text-[12px] text-ink-2 ring-1 ring-line">{tx(c)}</span>
            ))}
          </div>
        </div>
      )}
    </Block>
  );
}

export function Block({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div className="mb-3"><div className="text-[14px] font-semibold">{title}</div><div className="text-[12px] text-muted">{note}</div></div>
      {children}
    </section>
  );
}
