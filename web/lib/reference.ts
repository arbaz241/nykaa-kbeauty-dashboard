import { tr } from "./i18n";

/** Figures Nykaa itself reported, shown next to ours as a check (Round 4 plan, section 3). Update each quarter when
 *  Nykaa publishes results; the Overview shows a note when our estimate is more than 10 points away. */
export interface Reported { label: string; value: number; period: string; source: string; url: string }

export const NYKAA_REPORTED = (): Reported[] => [
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.28, period: tr("Apr–Jun 2026 vs a year earlier (Q1 FY27)", "2026년 4–6월, 전년 동기 대비 (FY27 1분기)"),
    source: "Business Standard, 4 Aug 2026", url: "https://www.business-standard.com/companies/quarterly-results/nykaa-q1-fy27-results-net-profit-rises-3-3-times-to-79-76-crore-126080401292_1.html" },
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.27, period: tr("Apr 2025–Mar 2026 vs a year earlier (FY26)", "2025년 4월–2026년 3월, 전년 대비 (FY26)"),
    source: "Playbook of Beauty, FY26 results", url: "https://playbookofbeauty.com/nykaa-revenue-were-up-26-in-fy26/" },
  { label: tr("Korean beauty on Nykaa", "Nykaa의 K-뷰티"), value: 0.58, period: tr("FY26 vs FY25, across 70+ brands", "FY26, 전년 대비, 70개 이상 브랜드"),
    source: "Multibagg, Q4 FY26 summary", url: "https://www.multibagg.ai/market-pulse/articles/nykaa-q4-fy26-profit-revenue-cmpfircut8vu8p40j044ne746" },
];
export const MAKEUP_SHARE_NOTE = () => tr("Nykaa's founder: colour cosmetics are about one-third of Nykaa's beauty sales.", "Nykaa 창업자: 색조 화장품은 Nykaa 뷰티 매출의 약 3분의 1.");
