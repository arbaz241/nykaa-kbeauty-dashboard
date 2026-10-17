import { tr } from "./i18n";

/** Nykaa's own reported figures: the market's growth (plan v2, owner 17 Oct 2026: "do not make our data vary by time
 *  period... match our data against that"). Our review data cannot measure market growth (products collect fewer
 *  reviews as they age; launches swing the total), so the market line comes from here and stays fixed to the
 *  quarter it belongs to. Add each quarter when Nykaa publishes results (Jul–Sep 2026 is due in early November). */
export interface Reported { label: string; value: number; period: string; source: string; url: string }

export interface QuarterGrowth {
  /** First month of the quarter. */
  start: string;
  label: string; fy: string;
  /** Beauty GMV growth vs the same quarter a year earlier; null when Nykaa did not publish a beauty-only figure. */
  value: number | null;
  note?: string; source?: string; url?: string;
}

export const NYKAA_QUARTERS = (): QuarterGrowth[] => [
  { start: "2025-04-01", label: tr("Apr–Jun 2025", "2025년 4–6월"), fy: "Q1 FY26", value: 0.26, source: "Fashion United, 13 Aug 2025",
    url: "https://fashionunited.in/news/business/nykaa-records-strong-q1-with-26-percent-gmv-growth/2025081351033" },
  { start: "2025-07-01", label: tr("Jul–Sep 2025", "2025년 7–9월"), fy: "Q2 FY26", value: 0.28, source: "Indian Retailer, Nov 2025",
    url: "https://www.indianretailer.com/news/nykaa-posts-25-pc-revenue-rise-q2-fy2026-beauty-leads-fashion-gains" },
  { start: "2025-10-01", label: tr("Oct–Dec 2025", "2025년 10–12월"), fy: "Q3 FY26", value: 0.27, source: "Multibagg, Q3 FY26",
    url: "https://www.multibagg.ai/market-pulse/articles/nykaa-q3fy26-growth-91366" },
  { start: "2026-01-01", label: tr("Jan–Mar 2026", "2026년 1–3월"), fy: "Q4 FY26", value: null, note: tr("No beauty-only figure; Nykaa guided \"late twenties\" and beauty revenue grew 27%", "뷰티 단독 수치 없음. Nykaa 가이던스 \"20% 후반\", 뷰티 매출 27% 성장"),
    source: "Storyboard18, Apr 2026", url: "https://www.storyboard18.com/brand-marketing/nykaa-sees-fastest-growth-in-three-years-on-beauty-and-store-expansion-ws-l-94298.htm" },
  { start: "2026-04-01", label: tr("Apr–Jun 2026", "2026년 4–6월"), fy: "Q1 FY27", value: 0.28, source: "Business Standard, 4 Aug 2026",
    url: "https://www.business-standard.com/companies/quarterly-results/nykaa-q1-fy27-results-net-profit-rises-3-3-times-to-79-76-crore-126080401292_1.html" },
  { start: "2026-07-01", label: tr("Jul–Sep 2026", "2026년 7–9월"), fy: "Q2 FY27", value: null, note: tr("Results due early November", "11월 초 발표 예정") },
];

/** The latest quarter Nykaa has reported a beauty figure for. */
export const LATEST_REPORTED = () => [...NYKAA_QUARTERS()].reverse().find((q) => q.value !== null)!;

export const NYKAA_REPORTED = (): Reported[] => [
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.28, period: tr("Apr–Jun 2026 vs a year earlier (Q1 FY27)", "2026년 4–6월, 전년 동기 대비 (FY27 1분기)"),
    source: "Business Standard, 4 Aug 2026", url: "https://www.business-standard.com/companies/quarterly-results/nykaa-q1-fy27-results-net-profit-rises-3-3-times-to-79-76-crore-126080401292_1.html" },
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.27, period: tr("Apr 2025–Mar 2026 vs a year earlier (FY26)", "2025년 4월–2026년 3월, 전년 대비 (FY26)"),
    source: "Playbook of Beauty, FY26 results", url: "https://playbookofbeauty.com/nykaa-revenue-were-up-26-in-fy26/" },
  { label: tr("Korean beauty on Nykaa", "Nykaa의 K-뷰티"), value: 0.58, period: tr("FY26 vs FY25, across 70+ brands", "FY26, 전년 대비, 70개 이상 브랜드"),
    source: "Multibagg, Q4 FY26 summary", url: "https://www.multibagg.ai/market-pulse/articles/nykaa-q4-fy26-profit-revenue-cmpfircut8vu8p40j044ne746" },
];
export const MAKEUP_SHARE_NOTE = () => tr("Nykaa's founder: colour cosmetics are about one-third of Nykaa's beauty sales.", "Nykaa 창업자: 색조 화장품은 Nykaa 뷰티 매출의 약 3분의 1.");
