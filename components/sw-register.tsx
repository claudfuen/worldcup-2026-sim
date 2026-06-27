"use client";

import { useEffect } from "react";

// Registers the minimal service worker (public/sw.js) so the PWA is installable on Android. Production
// only — a SW in dev can interfere with HMR, and installability is only meaningful on the live origin.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration failed — install just falls back to manifest-only / iOS share flow */
    });
  }, []);
  return null;
}
