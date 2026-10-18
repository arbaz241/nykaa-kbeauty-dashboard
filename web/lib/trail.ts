"use client";

/** Where the reader came from (plan v4, owner 18 Oct 2026: "show me how I got here... click to go back"). Kept for the
 *  browser tab in sessionStorage: the tab page they started on, the section they clicked in, then each brand or
 *  product page they opened. Brand and product pages show it as a trail and keep that tab highlighted. */

export interface Crumb { href: string; label: string }
export interface Trail { tab: string; crumbs: Crumb[] }

const KEY = "nmi.trail";
const here = () => `${location.pathname}${location.search}`;

export function readTrail(): Trail | null { return parseTrail(trailText()); }
const listeners = new Set<() => void>();
function save(t: Trail) { try { sessionStorage.setItem(KEY, JSON.stringify(t)); } catch { /* storage off: no trail */ } listeners.forEach((f) => f()); }
/** For useSyncExternalStore: the stored trail as text (stable while unchanged), null on the server. */
export function subscribeTrail(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export function trailText(): string | null { try { return sessionStorage.getItem(KEY); } catch { return null; } }
export function parseTrail(text: string | null): Trail | null { try { const t = JSON.parse(text ?? "null"); return t && Array.isArray(t.crumbs) ? t : null; } catch { return null; } }

/** A tab page opened: the trail starts again from it. */
export function startTrail(tab: string, label: string) { save({ tab, crumbs: [{ href: here(), label }] }); }

/** A link to a brand or product page was clicked on a tab page: remember the section it sat in. */
export function noteSection(sectionId: string | null, sectionLabel: string | null) {
  const t = readTrail(); if (!t || !t.crumbs.length) return;
  const root = { ...t.crumbs[0], href: here() };   // the tab page's own address now (a category picked since)
  save({ tab: t.tab, crumbs: sectionId && sectionLabel ? [root, { href: `${root.href.split("#")[0]}#${sectionId}`, label: sectionLabel }] : [root] });
}

/** A brand or product page opened: add it, or cut the trail back to it (Back, or a crumb clicked). */
export function enterPage(label: string, fallback: { tab: string; href: string; label: string }): Trail {
  const href = here();
  const t = readTrail() ?? { tab: fallback.tab, crumbs: [{ href: fallback.href, label: fallback.label }] };
  const i = t.crumbs.findIndex((c) => c.href === href);
  const crumbs = i >= 0 ? [...t.crumbs.slice(0, i), { href, label }] : [...t.crumbs, { href, label }];
  const out = { tab: t.tab, crumbs: crumbs.length > 7 ? [crumbs[0], ...crumbs.slice(-6)] : crumbs };
  save(out);
  return out;
}
