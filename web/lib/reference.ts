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
  /** The document itself (opens in the browser; Nykaa blocks scripted downloads, not people). */
  url: string;
}

export const NYKAA_QUARTERS = (): QuarterGrowth[] => [
  { start: "2025-04-01", label: tr("Apr–Jun 2025", "2025년 4–6월"), fy: "Q1 FY26", url: "https://www.nykaa.com/media/wysiwyg/uiTools/2025-8/Investor-Presentation-Q1.pdf", gmv: 3208, value: 0.26, doc: tr("Investor presentation Q1 FY26", "투자자 자료 FY26 1분기") },
  { start: "2025-07-01", label: tr("Jul–Sep 2025", "2025년 7–9월"), fy: "Q2 FY26", url: "https://www.nykaa.com/media/wysiwyg/uiTools/2025-11/Investor-Presentation-Q2.pdf", gmv: 3551, value: 0.28, doc: tr("Investor presentation Q2 FY26", "투자자 자료 FY26 2분기") },
  { start: "2025-10-01", label: tr("Oct–Dec 2025", "2025년 10–12월"), fy: "Q3 FY26", url: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-2/Investor-Presentation-Q3.pdf", gmv: 4302, value: 0.27, doc: tr("Investor presentation Q3 FY26", "투자자 자료 FY26 3분기") },
  { start: "2026-01-01", label: tr("Jan–Mar 2026", "2026년 1–3월"), fy: "Q4 FY26", url: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-5/Investor-Presentation-Q4-2026.pdf", gmv: 3892, value: 0.27, doc: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기") },
  { start: "2026-04-01", label: tr("Apr–Jun 2026", "2026년 4–6월"), fy: "Q1 FY27", url: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-8/NykaaInvestorPresentation-v1.pdf", gmv: 4105, value: 0.28, doc: tr("Investor presentation Q1 FY27", "투자자 자료 FY27 1분기") },
  { start: "2026-07-01", label: tr("Jul–Sep 2026", "2026년 7–9월"), fy: "Q2 FY27", url: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-10/NykaaQ2FY27Revenueupdate.pdf", gmv: null, value: null, doc: tr("Quarterly update, 4 Oct 2026", "분기 업데이트, 2026년 10월 4일"),
    note: tr("Provisional: beauty sales after returns grew in the \"late twenties\"; festive sales moved into Oct–Dec", "잠정: 반품 후 뷰티 매출 \"20% 후반\" 성장, 축제 시즌 매출은 10–12월로 이동") },
];

export const DOC = {
  q4fy26: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-5/Investor-Presentation-Q4-2026.pdf",
  q4fy26call: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-5/transcript-of-the-conference-call-for-analyst-Investors-Q4-FY26.pdf",
  q1fy27: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-8/NykaaInvestorPresentation-v1.pdf",
  q1fy27call: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-8/Transcript-of-the-Conference-Call-for-Analyst-Investors-Q1-FY27.pdf",
  q2fy27: "https://www.nykaa.com/media/wysiwyg/uiTools/2026-10/NykaaQ2FY27Revenueupdate.pdf",
};

/** Beauty GMV by financial year (April–March), Investor presentation Q4 FY26, page 9. Growth is Nykaa's own
 *  (and equals the year-on-year change of these figures). */
export interface YearGrowth { fy: string; label: string; gmv: number; value: number | null }
export const NYKAA_YEARS = (): YearGrowth[] => [
  { fy: "FY23", label: tr("Apr 2022–Mar 2023", "2022년 4월–2023년 3월"), gmv: 7058, value: null },
  { fy: "FY24", label: tr("Apr 2023–Mar 2024", "2023년 4월–2024년 3월"), gmv: 9055, value: 0.28 },
  { fy: "FY25", label: tr("Apr 2024–Mar 2025", "2024년 4월–2025년 3월"), gmv: 11775, value: 0.30 },
  { fy: "FY26", label: tr("Apr 2025–Mar 2026", "2025년 4월–2026년 3월"), gmv: 14954, value: 0.27 },
];
/** Yearly growth rate between two financial years (compound). */
export const cagr = (from: number, to: number, years: number) => Math.pow(to / from, 1 / years) - 1;

/** Won at the owner's planning rate (plan v4, owner 18 Oct 2026: "in 억원, 1 rupee = 16 won"). The ECB reference
 *  rate on 16 Oct 2026 was ₹1 = ₩14.03; the page says which it uses. ₹1 crore = ₹10 million = 1.6억원 at ₩16. */
export const KRW_PER_INR = 16;
export const ECB_KRW_PER_INR = { rate: 14.03, date: "2026-10-16", url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" };
export function eok(crore: number) {
  const e = Math.round(crore * KRW_PER_INR / 10);   // ₹1 cr × 16 = ₩160M = 1.6억
  const jo = Math.floor(e / 10000); const rest = e % 10000;
  return jo ? `${jo}조${rest ? ` ${rest.toLocaleString("en-IN")}억` : ""}원` : `${rest.toLocaleString("en-IN")}억원`;
}

/** The latest quarter with a reported beauty GMV growth. */
export const LATEST_REPORTED = () => [...NYKAA_QUARTERS()].reverse().find((q) => q.value !== null)!;

export interface Reported { label: string; value: number; period: string; source: string; url: string }
/** Headline figures kept for pages that show one or two of them. */
export const NYKAA_REPORTED = (): Reported[] => [
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.28, period: tr("Apr–Jun 2026 vs a year earlier", "2026년 4–6월, 전년 동기 대비"), source: tr("Investor presentation Q1 FY27", "투자자 자료 FY27 1분기"), url: IR_PAGE },
  { label: tr("Nykaa beauty sales value (GMV)", "Nykaa 뷰티 거래액(GMV)"), value: 0.27, period: tr("Apr 2025–Mar 2026 (FY26): ₹14,954 cr", "2025년 4월–2026년 3월 (FY26): ₹14,954 cr (2조 3,926억원)"), source: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: IR_PAGE },
  { label: tr("Korean brands on Nykaa", "Nykaa의 K-뷰티 브랜드"), value: 0.58, period: tr("FY26 vs FY25, 70+ brands, 27 Korean launches", "FY26, 전년 대비, 70개 이상 브랜드, K-뷰티 브랜드 27개 신규 입점"), source: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: IR_PAGE },
];

/** What Nykaa says in its investor documents that our shelf data can be held against (plan v3, section 2). */
export type ClaimCheck = "dotkey_sun" | "dotkey_moist" | "dotkey_wash" | "kbeauty" | "korean_70" | "derma" | "hon" | "hon_growth" | "kay_sun" | "brands_6000" | "new_brands" | "sales";
export interface IrClaim { says: string; doc: string; check: ClaimCheck; url?: string }
export const IR_CLAIMS = (): IrClaim[] => [
  { says: tr("Korean brands grew 58% in FY26 (70+ brands; 27 Korean launches incl. Aestura, Arencia, Anua, Mise en Scène)", "K-뷰티 브랜드 FY26 58% 성장 (70개 이상, Aestura·Arencia·Anua·Mise en Scène 등 27개 신규 입점)"), doc: "Q4 FY26", check: "kbeauty", url: DOC.q4fy26 },
  { says: tr("70+ Korean brands on Nykaa; the largest Korean assortment in India", "Nykaa의 K-뷰티 브랜드 70개 이상, 인도 최대 K-뷰티 구색"), doc: tr("Q4 FY26 · call", "FY26 4분기 · 컨퍼런스콜"), check: "korean_70", url: DOC.q4fy26call },
  { says: tr("Dot & Key is #1 in sunscreen (across Nykaa, Amazon, Flipkart, Blinkit)", "Dot & Key 선크림 1위 (Nykaa·Amazon·Flipkart·Blinkit 합산)"), doc: "Q4 FY26", check: "dotkey_sun", url: DOC.q4fy26 },
  { says: tr("Dot & Key is #2 in moisturiser", "Dot & Key 보습 크림 2위"), doc: "Q4 FY26", check: "dotkey_moist", url: DOC.q4fy26 },
  { says: tr("Dot & Key is #3 in face wash", "Dot & Key 클렌저 3위"), doc: "Q4 FY26", check: "dotkey_wash", url: DOC.q4fy26 },
  { says: tr("Kay Beauty launched its first tinted sunscreen, \"gaining good traction\"", "Kay Beauty 첫 틴티드 선크림 출시, \"좋은 반응\""), doc: "Q4 FY26", check: "kay_sun", url: DOC.q4fy26 },
  { says: tr("House of Nykaa beauty ₹2,788 cr in FY26 (+64%); Dot & Key 13×+ and Kay Beauty 3×+ over FY23–26", "House of Nykaa 뷰티 FY26 ₹2,788 cr (+64%); Dot & Key 13배 이상, Kay Beauty 3배 이상 (FY23–26)"), doc: "Q4 FY26", check: "hon_growth", url: DOC.q4fy26 },
  { says: tr("45% of House of Nykaa sales are on Nykaa's own app and site, 9% in Nykaa stores (FY26)", "House of Nykaa 매출의 45%가 Nykaa 앱·웹, 9%가 Nykaa 매장 (FY26)"), doc: "Q4 FY26", check: "hon", url: DOC.q4fy26 },
  { says: tr("Derma brands grew 40% in FY26 and are 20% of skincare", "더마 브랜드 FY26 40% 성장, 스킨케어의 20%"), doc: "Q4 FY26", check: "derma", url: DOC.q4fy26 },
  { says: tr("6,000+ brands on Nykaa", "Nykaa 입점 브랜드 6,000개 이상"), doc: "Q4 FY26", check: "brands_6000", url: DOC.q4fy26 },
  { says: tr("1,280 new brands launched in FY26", "FY26 신규 브랜드 1,280개 출시"), doc: "Q4 FY26", check: "new_brands", url: DOC.q4fy26 },
  { says: tr("Pink Summer Sale (May 2026) and the Birthday Sale drove Apr–Jun; Pink Summer GMV ~40% up", "핑크 서머 세일(2026년 5월)과 생일 세일이 4–6월 견인, 핑크 서머 GMV 약 40% 증가"), doc: "Q1 FY27", check: "sales", url: DOC.q1fy27 },
];

/** Global dermocosmetic houses: our list for the derma check (Nykaa does not publish its own). */
export const DERMA_BRANDS = ["Cetaphil", "CeraVe", "La Roche-Posay", "Bioderma", "Eucerin", "Avene", "Avène", "Vichy", "Sebamed", "Uriage", "Aveeno", "Physiogel", "ISDIN", "Noreva"];
/** Share of House of Nykaa sales made on Nykaa's own app, site and stores (FY26 channel split, Q4 FY26 p.21). */
export const HON_ON_NYKAA = 0.54;
/** Nykaa's own beauty brands (House of Nykaa). */
export const HON_BRANDS = ["Dot & Key", "Kay Beauty", "Nykaa Cosmetics", "Nykaa Skin", "Nykaa Naturals", "Earth Rhythm", "Nykaa SkinRX", "Nykaa Wanderlust", "Nykaa Skin Secrets", "Nykaa"];

// plan v4: the "colour cosmetics are one-third of beauty sales" note was dropped: it is not in Nykaa's investor documents.
