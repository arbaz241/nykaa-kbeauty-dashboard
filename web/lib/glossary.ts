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
    formula: ["Reviews dated in the last 3 complete months ÷ the 3 months before, minus 1. Only products with complete history in all 6 months count.", "최근 3개월 리뷰 수 ÷ 직전 3개월 리뷰 수 − 1. 6개월 이력이 모두 있는 제품만 집계합니다."],
    source: ["Review dates as Nykaa records them, not the day we collected them, so one month of crawling is not a limit.", "수집일이 아니라 Nykaa에 기록된 리뷰 작성일 기준이므로, 수집 기간이 짧아도 과거를 볼 수 있습니다."],
    window: ["Jul–Sep vs Apr–Jun 2026. July holds Nykaa's Hot Pink sale, May a smaller probable sale.", "2026년 7–9월 vs 4–6월. 7월에는 Nykaa Hot Pink sale이, 5월에는 그보다 작은 세일(추정)이 있었습니다."],
  }),
  marketGrowth: metric({
    name: ["Market growth", "시장 성장률"],
    plain: ["The same growth measure across every tracked product: the bar a brand or category has to beat.", "추적 중인 전체 제품에 같은 성장률 계산을 적용한 값. 브랜드나 카테고리가 넘어야 할 기준선입니다."],
    formula: ["All tracked reviews in the last 3 complete months ÷ the 3 before, minus 1.", "최근 3개월 전체 리뷰 수 ÷ 직전 3개월 전체 리뷰 수 − 1."],
    source: ["Same review history as demand growth.", "수요 성장률과 같은 리뷰 이력."],
    window: ["Jul–Sep vs Apr–Jun 2026.", "2026년 7–9월 vs 4–6월."],
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
} satisfies Record<string, Metric>;

export type MetricKey = keyof typeof GLOSSARY;
export const def = (k: MetricKey) => `${GLOSSARY[k].plain} ${GLOSSARY[k].formula} ${tr("Window", "기간")}: ${GLOSSARY[k].window}`;
