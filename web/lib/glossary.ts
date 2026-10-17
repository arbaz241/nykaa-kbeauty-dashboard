import { tr } from "./i18n";

/** One place that defines every metric on the dashboard (owner decision D5). Tooltips, chart labels and the
 *  Definitions panel all read from here, so a definition cannot drift between tabs. Each field is [English, Korean]
 *  and reads in the current language. */
export interface Metric { name: string; plain: string; formula: string; source: string; window: string }

type Pair = readonly [string, string];
const metric = (m: Record<keyof Metric, Pair>): Metric => {
  const out = {} as Metric;
  for (const k of Object.keys(m) as (keyof Metric)[]) Object.defineProperty(out, k, { get: () => tr(m[k][0], m[k][1]), enumerable: true });
  return out;
};

export const GLOSSARY = {
  shelf: metric({
    name: ["Share of shelf", "진열 점유율"],
    plain: ["How much of Nykaa's top-100 lists a brand holds: what Nykaa gives it.", "Nykaa 상위 100위 목록에서 브랜드가 차지하는 비중. Nykaa가 브랜드에 내어 주는 자리입니다."],
    formula: ["The brand's listings in the top 100 of every tracked category ÷ all places in those top 100s.", "추적 중인 모든 카테고리 상위 100위 안의 브랜드 제품 수 ÷ 해당 상위 100위의 전체 자리 수."],
    source: ["Nykaa app category pages, read every morning (13 categories, 1,300 places).", "Nykaa 앱 카테고리 페이지를 매일 아침 수집 (13개 카테고리, 1,300개 자리)."],
    window: ["Today. Changes are compared on the categories tracked on both days, so new categories do not count as gains.", "오늘 기준. 변화는 두 날짜 모두 추적한 카테고리끼리만 비교하므로, 새로 추가된 카테고리는 상승으로 집계되지 않습니다."],
  }),
  search: metric({
    name: ["Share of search", "검색 점유율"],
    plain: ["How often a brand comes up when shoppers search: what shoppers who search find.", "소비자가 검색할 때 브랜드가 얼마나 자주 나오는지. 검색하는 소비자의 눈에 띄는 정도입니다."],
    formula: ["The brand's results among the unpaid top 10 for every tracked keyword ÷ all those places.", "추적 중인 모든 키워드의 비광고 상위 10개 결과 중 브랜드 결과 수 ÷ 해당 전체 자리 수."],
    source: ["Nykaa search results for 39 keywords (15 Korean-beauty terms plus Nykaa's own suggestions), read daily.", "39개 키워드(K-뷰티 검색어 15개 + Nykaa 추천 검색어)의 Nykaa 검색 결과를 매일 수집."],
    window: ["Today's searches.", "오늘의 검색 결과."],
  }),
  demand: metric({
    name: ["Share of demand", "수요 점유율"],
    plain: ["How much of the buying goes to a brand, read from reviews (Nykaa does not publish sales).", "구매가 브랜드에 얼마나 돌아가는지를 리뷰로 추정한 값 (Nykaa는 판매량을 공개하지 않음)."],
    formula: ["The brand's reviews dated in the last 3 complete months ÷ reviews for all tracked products in the same months.", "최근 3개월(완결된 달 기준) 동안 작성된 브랜드 리뷰 수 ÷ 같은 기간 추적 중인 전체 제품의 리뷰 수."],
    source: ["Each tracked product's review history on Nykaa (562 products across 54 brands).", "추적 제품별 Nykaa 리뷰 이력 (54개 브랜드, 562개 제품)."],
    window: ["Jul–Sep 2026 (the last 3 complete months).", "2026년 7–9월 (최근 완결된 3개월)."],
  }),
  growth: metric({
    name: ["Demand growth", "수요 성장률"],
    plain: ["Whether buying is rising or falling, from reviews.", "리뷰로 본 구매의 증감."],
    formula: ["Reviews dated in the last 3 complete months ÷ the same 3 months a year earlier, minus 1. Only products whose history reaches back that far count (like for like).", "최근 3개월 리뷰 수 ÷ 전년 같은 3개월 리뷰 수 − 1. 그 시점까지 이력이 있는 제품만 집계합니다 (동일 제품 기준)."],
    source: ["Review dates as Nykaa records them, not the day we collected them, so one month of crawling is not a limit.", "수집일이 아니라 Nykaa에 기록된 리뷰 작성일 기준이므로, 수집 기간이 짧아도 과거를 볼 수 있습니다."],
    window: ["Jul–Sep 2026 vs Jul–Sep 2025; both contain Nykaa's Hot Pink sale.", "2026년 7–9월 vs 2025년 7–9월. 두 기간 모두 Nykaa Hot Pink sale 포함."],
  }),
  marketGrowth: metric({
    name: ["Growth of all tracked products", "추적 전체 성장률"],
    plain: ["The same review measure across every tracked product: the bar a brand or category in our data has to beat. It is not the market's growth; that is Nykaa's own reported figure on the Brief.", "추적 중인 전체 제품에 같은 리뷰 계산을 적용한 값. 우리 데이터 안의 기준선이며 시장 성장률이 아닙니다. 시장 성장률은 브리핑의 Nykaa 발표 수치입니다."],
    formula: ["All tracked reviews in the last 3 complete months ÷ the same months a year earlier, minus 1 (products on sale in both). The Overview weights the same comparison by price.", "최근 3개월 전체 리뷰 수 ÷ 전년 같은 기간 리뷰 수 − 1 (두 기간 모두 판매된 제품). 개요 탭은 같은 비교를 가격으로 가중합니다."],
    source: ["Same review history as demand growth.", "수요 성장률과 같은 리뷰 이력."],
    window: ["Jul–Sep 2026 vs Jul–Sep 2025.", "2026년 7–9월 vs 2025년 7–9월."],
  }),
  catShare: metric({
    name: ["Category share", "카테고리 점유율"],
    plain: ["The anchor's slice of the buying inside one category.", "한 카테고리 안에서 기준 브랜드가 차지하는 구매 비중."],
    formula: ["The anchor's reviews in the category in the last 3 complete months ÷ all tracked reviews in that category.", "최근 3개월 해당 카테고리의 기준 브랜드 리뷰 수 ÷ 그 카테고리의 전체 추적 리뷰 수."],
    source: ["Review history of the products tracked in that category.", "해당 카테고리 추적 제품의 리뷰 이력."],
    window: ["Jul–Sep 2026.", "2026년 7–9월."],
  }),
  avgShare: metric({
    name: ["Its usual share", "평소 점유율"],
    plain: ["The anchor's share of demand across all categories together. A category above this line is one where it does better than usual.", "전체 카테고리를 합친 기준 브랜드의 수요 점유율. 이 선보다 위에 있는 카테고리는 평소보다 잘하고 있는 곳입니다."],
    formula: ["The anchor's reviews across all categories ÷ all tracked reviews (the same as share of demand).", "전체 카테고리의 기준 브랜드 리뷰 수 ÷ 전체 추적 리뷰 수 (수요 점유율과 동일)."],
    source: ["Review history.", "리뷰 이력."],
    window: ["Jul–Sep 2026.", "2026년 7–9월."],
  }),
  rangeGap: metric({
    name: ["Range gap", "라인업 공백"],
    plain: ["A price band in a category where the focus brands sell and the anchor has nothing.", "주요 브랜드는 판매하는데 기준 브랜드에는 제품이 없는 카테고리·가격대."],
    formula: ["Each focus brand's full Nykaa range, split by category and MRP band (under ₹500, ₹500–999, ₹1,000–1,999, ₹2,000+). A gap = 0 anchor products and 3+ focus-brand products.", "주요 브랜드별 Nykaa 전체 라인업을 카테고리와 정가(MRP) 구간(₹500 미만, ₹500–999, ₹1,000–1,999, ₹2,000 이상)으로 나눕니다. 기준 브랜드 제품 0개, 주요 브랜드 제품 3개 이상이면 공백입니다."],
    source: ["Each brand's own Nykaa catalogue, read weekly.", "브랜드별 Nykaa 카탈로그를 매주 수집."],
    window: ["Latest weekly catalogue.", "최신 주간 카탈로그."],
  }),
  hero: metric({
    name: ["Hero product", "히어로 제품"],
    plain: ["A brand's strongest product, judged against other products in the same category, not against its own siblings.", "브랜드에서 가장 강한 제품. 같은 브랜드 제품끼리가 아니라 같은 카테고리의 다른 제품과 비교해 판단합니다."],
    formula: ["Four factors, each scored against the category's median product: shelf rank, reviews in the last 3 months, rating and number of ratings. The hero has the highest total.", "진열 순위, 최근 3개월 리뷰 수, 평점, 평가 수 네 가지를 각각 카테고리 중앙값 제품과 비교해 점수화합니다. 합계가 가장 높은 제품이 히어로입니다."],
    source: ["Shelf, review history and catalogue.", "진열 순위, 리뷰 이력, 카탈로그."],
    window: ["Today's shelf; reviews Jul–Sep 2026.", "오늘의 진열 순위, 2026년 7–9월 리뷰."],
  }),
  paid: metric({
    name: ["Paid share", "광고 의존도"],
    plain: ["How much of a brand's visibility is bought.", "브랜드 노출 중 광고로 사는 비중."],
    formula: ["The brand's sponsored (AD) slots ÷ its sponsored slots plus its unpaid top-10 places, across tracked searches.", "추적 검색어 전체에서 브랜드의 광고(AD) 자리 수 ÷ (광고 자리 수 + 비광고 상위 10위 자리 수)."],
    source: ["Nykaa search results; ads as shown to our collector at about 07:00 IST.", "Nykaa 검색 결과. 광고는 인도 시간 오전 7시경 수집기에 노출된 기준."],
    window: ["Today.", "오늘 기준."],
  }),
  // ---- Round 4 (17 Oct 2026) ----
  valueGrowth: metric({
    name: ["Growth, like for like", "성장률 (동일 제품 기준)"],
    plain: ["How much more buying the products already on sale a year ago got. Kept only as a check on the Brief: products collect fewer reviews as they age, so it swings from -49% to +30% while Nykaa holds at 26–28%.", "1년 전에도 판매 중이던 제품의 구매 증가. 브리핑에서 점검용으로만 씁니다: 제품은 나이가 들수록 리뷰가 줄어 이 값은 Nykaa가 26–28%를 유지하는 동안 −49%에서 +30%까지 흔들립니다."],
    formula: ["Reviews in the chosen months × selling price, ÷ the same products' reviews × price in the same months a year earlier (or the months before), minus 1. Categories are added up by their share of that value, so Nykaa's total = Σ category weight × category growth.", "선택한 기간의 리뷰 수 × 판매가 ÷ 같은 제품의 1년 전 같은 기간(또는 직전 기간) 리뷰 수 × 판매가 − 1. 카테고리는 금액 비중으로 합산하므로 전체 = Σ 카테고리 비중 × 카테고리 성장률."],
    source: ["Monthly review history of the products we track (about 600), by the date each review was written; today's selling price.", "추적 중인 약 600개 제품의 월별 리뷰 이력(리뷰 작성일 기준)과 현재 판매가."],
    window: ["The months in the period picker, compared with a year earlier by default.", "기간 선택에서 고른 개월 수. 기본은 전년 동기 비교."],
  }),
  launchGrowth: metric({
    name: ["From launches", "신제품 기여"],
    plain: ["Extra growth from products first reviewed after the comparison months. Read it as an upper bound: we only track launches that reached today's top 100, not the ones that failed.", "비교 기간 이후 처음 리뷰가 달린 제품이 더한 성장분. 오늘 상위 100위에 든 신제품만 추적하므로(실패한 신제품은 빠짐) 최대치로 읽어야 합니다."],
    formula: ["Launches' review value in the chosen months ÷ like-for-like value in the comparison months.", "선택 기간 신제품 리뷰 금액 ÷ 비교 기간 동일 제품 리뷰 금액."],
    source: ["Same review history; first review date from Nykaa.", "같은 리뷰 이력, Nykaa의 첫 리뷰 날짜."],
    window: ["As above.", "위와 같음."],
  }),
  ratingFlow: metric({
    name: ["Share of buying", "구매 점유율"],
    plain: ["Which brands the shoppers of the period bought, read from the new ratings their listings gained on Nykaa's top-100 shelves.", "해당 기간 소비자가 어떤 브랜드를 샀는지. Nykaa 상위 100위 제품에 새로 달린 평가 수로 봅니다."],
    formula: ["New ratings over the period (rating count at the end − at the start, listings on the shelf both days) × selling price; a set of ratings shared by sizes of one product counts once. A brand's share = its value ÷ all value.", "기간 중 새 평가 수(종료일 평가 수 − 시작일 평가 수, 양일 모두 진열된 제품) × 판매가. 용량별로 공유되는 평가는 한 번만 셉니다. 브랜드 점유율 = 브랜드 금액 ÷ 전체 금액."],
    source: ["Nykaa's rating counts on 13 category top-100 lists, read every morning since 13 Sep 2026.", "2026년 9월 13일부터 매일 아침 수집한 13개 카테고리 상위 100위의 평가 수."],
    window: ["The days in the period picker (last 30 by default).", "기간 선택의 일수 (기본 최근 30일)."],
  }),
  brandCount: metric({
    name: ["Brands on Nykaa", "Nykaa 입점 브랜드"],
    plain: ["How many brands sell at least one product in the category on Nykaa, from Nykaa's own brand filter.", "Nykaa에서 해당 카테고리에 제품이 하나라도 있는 브랜드 수. Nykaa 자체 브랜드 필터 기준."],
    formula: ["Brands in the category's brand filter; products = the sum of their product counts.", "카테고리 브랜드 필터의 브랜드 수. 제품 수 = 각 브랜드 제품 수의 합."],
    source: ["Nykaa app category page, read nightly since 17 Oct 2026.", "2026년 10월 17일부터 매일 밤 수집한 Nykaa 앱 카테고리 페이지."],
    window: ["Latest night.", "최근 수집일."],
  }),
} satisfies Record<string, Metric>;

export type MetricKey = keyof typeof GLOSSARY;
export const def = (k: MetricKey) => `${GLOSSARY[k].plain} ${GLOSSARY[k].formula} ${tr("Window", "기간")}: ${GLOSSARY[k].window}`;
