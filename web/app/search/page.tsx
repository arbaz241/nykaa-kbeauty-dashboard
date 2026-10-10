"use client";

import { useEffect } from "react";

/** Search & Ads is now part of the Demand tab. Old links land there. */
export default function SearchRedirect() {
  useEffect(() => { window.location.replace("/demand/"); }, []);
  return null;
}
