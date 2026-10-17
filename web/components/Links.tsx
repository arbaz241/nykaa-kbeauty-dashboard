"use client";

import Link from "next/link";

/** Plan v2 (owner 17 Oct 2026: "the information would revolve around it"): every brand and product name opens its own
 *  page, where everything about it sits together. Query strings, because the site is a static export. */
export const brandHref = (b: string) => `/brand/?b=${encodeURIComponent(b)}`;
export const productHref = (id: string, cat?: string | null) => `/product/?id=${encodeURIComponent(id)}${cat ? `&cat=${encodeURIComponent(cat)}` : ""}`;

export function BrandLink({ brand, className = "", children }: { brand: string; className?: string; children?: React.ReactNode }) {
  return <Link href={brandHref(brand)} className={`underline decoration-line-2 underline-offset-2 hover:decoration-ink ${className}`}>{children ?? brand}</Link>;
}

export function ProductLink({ id, cat, className = "", children }: { id: string; cat?: string | null; className?: string; children: React.ReactNode }) {
  return <Link href={productHref(id, cat)} className={`underline decoration-line-2 underline-offset-2 hover:decoration-ink ${className}`}>{children}</Link>;
}
