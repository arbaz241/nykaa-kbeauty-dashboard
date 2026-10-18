"use client";

import { useEffect } from "react";

/** Plan v3 (owner 18 Oct 2026): Brands merged into the Market tab (/categories/). Old links land there. */
export default function BrandsRedirect() {
  useEffect(() => { window.location.replace("/categories/"); }, []);
  return null;
}
