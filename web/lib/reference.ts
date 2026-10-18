import { tr } from "./i18n";

/** Nykaa's own figures (plan v3, owner 18 Oct 2026: "go into FSN E-Commerce Ventures' statements... use other sources
 *  only where you don't have the clear figure"). Every number here is from Nykaa's investor documents on
 *  nykaa.com/investor-relations (presentations, call transcripts, quarterly updates). Add each quarter when Nykaa
 *  publishes; Jul–Sep 2026 results are due in early November (only the provisional update of 4 Oct is out). */

export const IR_PAGE = "https://www.nykaa.com/investor-relations/lp";

export interface QuarterGrowth {
  /** First month of the quarter. */
  start: string;
  label: string; fy: string;
  /** Beauty GMV in ₹ crore, and growth against the same quarter a year earlier; null before results are out. */
  gmv: number | null; value: number | null;
  doc: string; note?: string;
}

export const NYKAA_QUARTERS = (): QuarterGrowth[] => [
  { start: "2025-04-01", label: tr("Apr–Jun 2025", "2025년 4–6월"), fy: "Q1 FY26", gmv: 3208, value: 0.26, doc: tr("Investor presentation Q1 FY26", "투자자 자료 FY26 1분기") },
  { start: "2025-07-01", label: tr("Jul–Sep 2025", "2025년 7–9월"), fy: "Q2 FY26", gmv: 3551, value: 0.28, doc: tr("Investor presentation Q2 FY26", "투자자 자료 FY26 2분기") },
  { start: "2025-10-01", label: tr("Oct–Dec 2025", "2025년 10–12월"), fy: "Q3 FY26", gmv: 4302, value: 0.27, doc: tr("Investor presentation Q3 FY26", "투자자 자료 FY26 3분기") },
  { start: "2026-01-01", label: tr("Jan–Mar 2026", "2026년 1–3월"), fy: "Q4 FY26", gmv: 3892, value: 0.27, doc: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기") },
  { start: "2026-04-01", label: tr("Apr–Jun 2026", "2026년 4–6월"), fy: "Q1 FY27", gmv: 4105, value: 0.28, doc: tr("Investor presentation Q1 FY27", "투자자 자료 FY27 1분기") },
  { start: "2026-07-01", label: tr("Jul–Sep 2026", "2026년 7–9월"), fy: "Q2 FY27", gmv: null, value: null, doc: tr("Quarterly update, 4 Oct 2026", "분기 업데이트, 2026년 10월 4일"),
    note: tr("Provisional: beauty sales after returns grew in the \"late twenties\"; festive sales moved into Oct–Dec", "잠정: 반품 후 뷰티 매출 \"20% 후반\" 성장, 축제 시즌 매출은 10–12월로 이동") },
];

/** The latest quarter with a reported beauty GMV growth. */
export const LATEST_REPORTED = () => [...NYKAA_QUARTERS()].reverse().find((q) => q.value !== null)!;

export interface Reported { label: string; value: number; period: string; source: string; url: string }
/** Headline figures kept for pages that show one or two of them. */
export const NYKAA_REPORTED = (): Reported[] => [
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.28, period: tr("Apr–Jun 2026 vs a year earlier", "2026년 4–6월, 전년 동기 대비"), source: tr("Investor presentation Q1 FY27", "투자자 자료 FY27 1분기"), url: IR_PAGE },
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.27, period: tr("Apr 2025–Mar 2026 (FY26): ₹14,954 cr", "2025년 4월–2026년 3월 (FY26): ₹14,954억"), source: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: IR_PAGE },
  { label: tr("Korean brands on Nykaa", "Nykaa의 한국 브랜드"), value: 0.58, period: tr("FY26 vs FY25, 70+ brands, 27 Korean launches", "FY26, 전년 대비, 70개 이상 브랜드, 한국 브랜드 27개 출시"), source: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: IR_PAGE },
];

/** What Nykaa says in its investor documents that our shelf data can be held against (plan v3, section 2). */
export interface IrClaim { says: string; doc: string; check: "dotkey_sun" | "dotkey_moist" | "dotkey_wash" | "kbeauty" | "derma" | "hon" | "sales" }
export const IR_CLAIMS = (): IrClaim[] => [
  { says: tr("Korean brands grew 58% in FY26 (70+ brands; 27 Korean launches incl. Aestura, Arencia, Anua, Mise en Scène)", "한국 브랜드 FY26 58% 성장 (70개 이상, Aestura·Arencia·Anua·Mise en Scène 등 27개 출시)"), doc: "Q4 FY26", check: "kbeauty" },
  { says: tr("Dot & Key is #1 in sunscreen (across Nykaa, Amazon, Flipkart, Blinkit)", "Dot & Key 선크림 1위 (Nykaa·Amazon·Flipkart·Blinkit 합산)"), doc: "Q4 FY26", check: "dotkey_sun" },
  { says: tr("Dot & Key is #2 in moisturiser", "Dot & Key 보습 크림 2위"), doc: "Q4 FY26", check: "dotkey_moist" },
  { says: tr("Dot & Key is #3 in face wash", "Dot & Key 클렌저 3위"), doc: "Q4 FY26", check: "dotkey_wash" },
  { says: tr("Derma brands grew 40% in FY26 and are 20% of skincare", "더마 브랜드 FY26 40% 성장, 스킨케어의 20%"), doc: "Q4 FY26", check: "derma" },
  { says: tr("House of Nykaa beauty grew 64% in FY26 (₹1,695 → ₹2,788 cr) and keeps growing ahead of beauty", "하우스 오브 나이카 뷰티 FY26 64% 성장 (₹1,695 → ₹2,788억), 뷰티 전체보다 빠른 성장 지속"), doc: "Q4 FY26 · Q2 FY27 update", check: "hon" },
  { says: tr("Pink Summer Sale (May 2026) and the Birthday Sale drove Apr–Jun; Pink Summer GMV ~40% up", "핑크 서머 세일(2026년 5월)과 생일 세일이 4–6월 견인, 핑크 서머 GMV 약 40% 증가"), doc: "Q1 FY27", check: "sales" },
];

/** Global dermocosmetic houses: our list for the derma check (Nykaa does not publish its own). */
export const DERMA_BRANDS = ["Cetaphil", "CeraVe", "La Roche-Posay", "Bioderma", "Eucerin", "Avene", "Avène", "Vichy", "Sebamed", "Uriage", "Aveeno", "Physiogel", "ISDIN", "Noreva"];
/** Nykaa's own beauty brands (House of Nykaa). */
export const HON_BRANDS = ["Dot & Key", "Kay Beauty", "Nykaa Cosmetics", "Nykaa Skin", "Nykaa Naturals", "Earth Rhythm", "Nykaa SkinRX", "Nykaa Wanderlust", "Nykaa Skin Secrets", "Nykaa"];

export const MAKEUP_SHARE_NOTE = () => tr("Nykaa's founder: colour cosmetics are about one-third of Nykaa's beauty sales.", "Nykaa 창업자: 색조 화장품은 Nykaa 뷰티 매출의 약 3분의 1.");
