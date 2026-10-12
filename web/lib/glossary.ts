/** One place that defines every metric on the dashboard (owner decision D5). Tooltips, chart labels and the
 *  Definitions panel all read from here, so a definition cannot drift between tabs. */
export interface Metric { name: string; plain: string; formula: string; source: string; window: string }

export const GLOSSARY = {
  shelf: {
    name: "Share of shelf",
    plain: "How much of Nykaa's top-100 lists a brand holds: what Nykaa gives it.",
    formula: "The brand's listings in the top 100 of every tracked category ÷ all places in those top 100s.",
    source: "Nykaa app category pages, read every morning (13 categories, 1,300 places).",
    window: "Today. Changes are compared on the categories tracked on both days, so new categories do not count as gains.",
  },
  search: {
    name: "Share of search",
    plain: "How often a brand comes up when shoppers search: what shoppers who search find.",
    formula: "The brand's results among the unpaid top 10 for every tracked keyword ÷ all those places.",
    source: "Nykaa search results for 39 keywords (15 Korean-beauty terms plus Nykaa's own suggestions), read daily.",
    window: "Today's searches.",
  },
  demand: {
    name: "Share of demand",
    plain: "How much of the buying goes to a brand, read from reviews (Nykaa does not publish sales).",
    formula: "The brand's reviews dated in the last 3 complete months ÷ reviews for all tracked products in the same months.",
    source: "Each tracked product's review history on Nykaa (562 products across 54 brands).",
    window: "Jul–Sep 2026 (the last 3 complete months).",
  },
  growth: {
    name: "Demand growth",
    plain: "Whether buying is rising or falling, from reviews.",
    formula: "Reviews dated in the last 3 complete months ÷ the 3 months before, minus 1. Only products with complete history in all 6 months count.",
    source: "Review dates as Nykaa records them, not the day we collected them, so one month of crawling is not a limit.",
    window: "Jul–Sep vs Apr–Jun 2026. July holds Nykaa's Hot Pink sale, May a smaller probable sale.",
  },
  marketGrowth: {
    name: "Market growth",
    plain: "The same growth measure across every tracked product: the bar a brand or category has to beat.",
    formula: "All tracked reviews in the last 3 complete months ÷ the 3 before, minus 1.",
    source: "Same review history as demand growth.",
    window: "Jul–Sep vs Apr–Jun 2026.",
  },
  catShare: {
    name: "Category share",
    plain: "The anchor's slice of the buying inside one category.",
    formula: "The anchor's reviews in the category in the last 3 complete months ÷ all tracked reviews in that category.",
    source: "Review history of the products tracked in that category.",
    window: "Jul–Sep 2026.",
  },
  avgShare: {
    name: "Its usual share",
    plain: "The anchor's share of demand across all categories together. A category above this line is one where it does better than usual.",
    formula: "The anchor's reviews across all categories ÷ all tracked reviews (the same as share of demand).",
    source: "Review history.",
    window: "Jul–Sep 2026.",
  },
  rangeGap: {
    name: "Range gap",
    plain: "A price band in a category where the focus brands sell and the anchor has nothing.",
    formula: "Each focus brand's full Nykaa range, split by category and MRP band (under ₹500, ₹500–999, ₹1,000–1,999, ₹2,000+). A gap = 0 anchor products and 3+ focus-brand products.",
    source: "Each brand's own Nykaa catalogue, read weekly.",
    window: "Latest weekly catalogue.",
  },
  hero: {
    name: "Hero product",
    plain: "A brand's strongest product, judged against other products in the same category, not against its own siblings.",
    formula: "Four factors, each scored against the category's median product: shelf rank, reviews in the last 3 months, rating and number of ratings. The hero has the highest total.",
    source: "Shelf, review history and catalogue.",
    window: "Today's shelf; reviews Jul–Sep 2026.",
  },
  paid: {
    name: "Paid share",
    plain: "How much of a brand's visibility is bought.",
    formula: "The brand's sponsored (AD) slots ÷ its sponsored slots plus its unpaid top-10 places, across tracked searches.",
    source: "Nykaa search results; ads as shown to our collector at about 07:00 IST.",
    window: "Today.",
  },
} satisfies Record<string, Metric>;

export type MetricKey = keyof typeof GLOSSARY;
export const def = (k: MetricKey) => `${GLOSSARY[k].plain} ${GLOSSARY[k].formula} Window: ${GLOSSARY[k].window}`;
