"use client";

import { useMemo } from "react";
import { useCatalog, useDemand, useReviewMonths, useShelf, useShelfDaily, useShelfProducts } from "./data";
import { indexDaily, poolProducts, productDims, ratingFlow, ratingFreeze, type FlowRow } from "./market";
import { shelfWindow, usePeriod, type ShelfWindow } from "./period";
import { norm } from "./brands";

/** Everything the Round 4 tabs share, loaded once and computed for the chosen period.
 *  Plan v2 (17 Oct 2026): no market growth from our data any more (Nykaa's reported figures are the market; see
 *  lib/reference.ts). The period picker only moves shelf facts. Buying (new ratings) stops on the last day Nykaa
 *  still updated its rating counts. */
export function useMarket() {
  const shelf = useShelf(); const catalog = useCatalog(); const months = useReviewMonths(); const demand = useDemand();
  const daily = useShelfDaily(); const products = useShelfProducts();
  const period = usePeriod();
  const ready = !!(shelf.data && catalog.data && months.data && demand.data && daily.data && products.data);
  const error = shelf.error || catalog.error || months.error || demand.error || daily.error || products.error;

  const dims = useMemo(() => productDims(products.data ?? [], shelf.data ?? []), [products.data, shelf.data]);
  const ix = useMemo(() => indexDaily(daily.data ?? []), [daily.data]);
  const freeze = useMemo(() => ratingFreeze(ix), [ix]);
  const originOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dims.values()) if (!m.has(norm(d.brand)) || m.get(norm(d.brand)) === "unknown") m.set(norm(d.brand), d.origin);
    return (b: string) => m.get(norm(b)) ?? "unknown";
  }, [dims]);
  const pool = useMemo(() => (ready ? poolProducts({ months: months.data!, demand: demand.data!, shelf: shelf.data!, catalog: catalog.data!, products: products.data!, daily: daily.data! }) : []),
    [ready, months.data, demand.data, shelf.data, catalog.data, products.data, daily.data]);

  const latest = ix.days[ix.days.length - 1] ?? null;
  const win: ShelfWindow | null = useMemo(() => shelfWindow(ix.days, period.days), [ix.days, period.days]);
  const ratingEnd = freeze?.lastLive;
  const flow: FlowRow[] = useMemo(() => (win ? ratingFlow(ix, dims, win.start, win.end, false, ratingEnd) : []), [ix, dims, win, ratingEnd]);
  const prevFlow: FlowRow[] | null = useMemo(() => (win?.prev ? ratingFlow(ix, dims, win.prev.start, win.prev.end, false, ratingEnd) : null), [ix, dims, win, ratingEnd]);
  /** The days the buying figures actually cover (start → the earlier of the period end and the last live day). */
  const flowSpan = win ? { start: win.start, end: ratingEnd && ratingEnd < win.end ? ratingEnd : win.end, none: !!ratingEnd && ratingEnd <= win.start } : null;

  return { ready, error, period, shelf: shelf.data ?? [], catalog: catalog.data ?? [], products: products.data ?? [], months: months.data ?? [], dims, ix, pool, originOf,
    latest, win, flow, prevFlow, freeze, flowSpan };
}
export type Market = ReturnType<typeof useMarket>;
