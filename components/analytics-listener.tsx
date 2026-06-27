"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

// ONE place that captures key events for the whole app, so we never hand-instrument the same click twice:
//  1. Declarative events — any element with `data-evt="name"` fires that event on click, with every other
//     `data-*` attribute passed through as a property (e.g. data-match="68" -> { match: 68 }). Mark a link
//     once in markup; this listener routes it to BOTH analytics backends via trackEvent().
//  2. Auto outbound — any click on an external <a> with no explicit data-evt fires `outbound_click`.
// Mounted once in the root layout.
export function AnalyticsListener() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.("a,[data-evt]") as HTMLElement | null;
      if (!el) return;

      const evt = el.getAttribute("data-evt");
      if (evt) {
        const props: Record<string, string | number> = {};
        for (const attr of Array.from(el.attributes)) {
          if (!attr.name.startsWith("data-") || attr.name === "data-evt") continue;
          const key = attr.name.slice(5).replace(/-/g, "_");
          const n = Number(attr.value);
          props[key] = attr.value !== "" && Number.isFinite(n) ? n : attr.value;
        }
        trackEvent(evt, props);
        return;
      }

      if (el.tagName === "A") {
        const href = (el as HTMLAnchorElement).href;
        if (!href) return;
        try {
          const u = new URL(href, location.href);
          if (/^https?:$/.test(u.protocol) && u.host !== location.host) {
            trackEvent("outbound_click", { host: u.host, dest: u.pathname, from: location.pathname });
          }
        } catch {
          /* unparseable href */
        }
      }
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
