"use client";

import { useEffect } from "react";

/** The USP tab is now part of Competitive Analysis (product view). Old links land there. */
export default function UspRedirect() {
  useEffect(() => { window.location.replace("/compare/?view=products"); }, []);
  return null;
}
