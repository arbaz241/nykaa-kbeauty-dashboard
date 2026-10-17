"use client";

import { useMemo } from "react";
import { useCatalog, useDemand, useReviewMonths, useShelf, useShelfDaily, useShelfProducts } from "./data";
import { indexDaily, poolProducts, productDims, ratingFlow, valueGrowth, type FlowRow, type GrowthResult } from "./market";
import { monthWindow, shelfWindow, usePeriod, type MonthWindow, type ShelfWindow } from "./period";
import { norm } from "./brands";

/** Everything the Round 4 tabs share, loaded once and computed for the chosen period. */
export function useMarket() {
  const shelf = useShelf(); const catalog = useCatalog(); const months = useReviewMonths(); const demand = useDemand();
  const daily = useShelfDaily(); const products = useShelfProducts();
  const period = usePeriod();
  const ready = !!(shelf.data && catalog.data && months.data && demand.data && daily.data && products.data);
  const error = shelf.error || catalog.error || months.error || demand.error || daily.error || products.error;

  const dims = useMemo(() => productDims(products.data ?? [], shelf.data ?? []), [products.data, shelf.data]);
  const ix = useMemo(() => indexDaily(daily.data ?? []), [daily.data]);
  const originOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dims.values()) if (!m.has(norm(d.brand)) || m.get(norm(d.brand)) === "unknown") m.set(norm(d.brand), d.origin);
    return (b: string) => m.get(norm(b)) ?? "unknown";
  }, [dims]);
  const pool = useMemo(() => (ready ? poolProducts({ months: months.data!, demand: demand.data!, shelf: shelf.data!, catalog: catalog.data!, products: products.data!, daily: daily.data! }) : []),
    [ready, months.data, demand.data, shelf.data, catalog.data, products.data, daily.data]);

  const latest = ix.days[ix.days.length - 1] ?? null;
  const win: ShelfWindow | null = useMemo(() => shelfWindow(ix.days, period.days), [ix.days, period.days]);
  const mwin: MonthWindow | null = useMemo(() => (latest ? monthWindow(latest, period.months, period.compare) : null), [latest, period.months, period.compare]);
  const growth: GrowthResult | null = useMemo(() => (ready && mwin ? valueGrowth(pool, mwin, originOf) : null), [ready, pool, mwin, originOf]);
  const flow: FlowRow[] = useMemo(() => (win ? ratingFlow(ix, dims, win.start, win.end) : []), [ix, dims, win]);
  const prevFlow: FlowRow[] | null = useMemo(() => (win?.prev ? ratingFlow(ix, dims, win.prev.start, win.prev.end) : null), [ix, dims, win]);

  return { ready, error, period, shelf: shelf.data ?? [], catalog: catalog.data ?? [], products: products.data ?? [], dims, ix, pool, originOf,
    latest, win, mwin, growth, flow, prevFlow };
}
export type Market = ReturnType<typeof useMarket>;
