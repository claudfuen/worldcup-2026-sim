"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

// "Add to Home Screen" install popup. Pervasive (the tournament is short-lived): shows once per session,
// fires on the first visit after a brief dwell, and re-prompts again the next session (≥2h later) even
// after a dismiss. Re-openable on demand via the `wc:open-install` window event (the nav menu dispatches
// it). Android uses the native beforeinstallprompt; iOS/others get Add-to-Home-Screen instructions.
const DISMISS_KEY = "wc:install-dismissed-until";
const SESSIONS_KEY = "wc:sessions";
const SESSION_GUARD = "wc:session-started";
const SHOWN_SESSION_KEY = "wc:install-shown-session";
const INSTALLED_KEY = "wc:installed";
const DISMISS_COUNT_KEY = "wc:install-dismiss-count";
const HOUR = 60 * 60 * 1000;
// Escalating back-off: pushy at first, but if they keep saying no we leave them alone.
const COOLDOWN_MS = 2 * HOUR;
function cooldownForDismissCount(n: number): number {
  if (n >= 3) return 7 * 24 * HOUR; // 3+ refusals → effectively done (tournament is weeks long)
  if (n === 2) return 12 * HOUR;
  return COOLDOWN_MS;
}
export const OPEN_INSTALL_EVENT = "wc:open-install";

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(INSTALLED_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return isStandalone();
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone);
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [views, setViews] = useState(0);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosTip, setIosTip] = useState(false);

  // Count this tab-session once (returning-visitor signal) + tag how the app was opened, so we can see
  // installed-app usage vs browser in analytics (the app is "aware" of running as an installed instance).
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SESSION_GUARD)) {
        localStorage.setItem(SESSIONS_KEY, String(Number(localStorage.getItem(SESSIONS_KEY) ?? "0") + 1));
        sessionStorage.setItem(SESSION_GUARD, "1");
        trackEvent("app_open", { mode: isStandalone() ? "standalone" : "browser" });
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  // Robust "already installed?" check (Android/Chrome): catches users who installed on a prior visit but
  // are now in a normal tab (not standalone), so we never nag someone who already has the app.
  useEffect(() => {
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    if (typeof nav.getInstalledRelatedApps !== "function") return;
    nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (Array.isArray(apps) && apps.length > 0) {
          try {
            localStorage.setItem(INSTALLED_KEY, "1");
          } catch {
            /* ignore */
          }
          setShow(false);
        }
      })
      .catch(() => {
        /* unsupported */
      });
  }, []);

  // Fired by the browser when the PWA is actually installed — record the conversion and never prompt again.
  useEffect(() => {
    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* ignore */
      }
      trackEvent("pwa_installed", { platform: isIos() ? "ios" : "android" });
      setShow(false);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  // Count page views this session (the layout persists across client navigations).
  useEffect(() => setViews((v) => v + 1), [pathname]);

  // QA/preview hatch: append ?install to any URL to force the popup (it's otherwise mobile + gated).
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has("install")) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Manual re-open from anywhere (e.g. the nav menu "Add to home screen" item), bypassing all gating.
  useEffect(() => {
    const open = () => {
      if (isInstalled()) return; // already installed → nothing to prompt
      setIosTip(false);
      setShow(true);
      trackEvent("pwa_prompt_shown", { platform: isIos() ? "ios" : "android", source: "menu" });
    };
    window.addEventListener(OPEN_INSTALL_EVENT, open);
    return () => window.removeEventListener(OPEN_INSTALL_EVENT, open);
  }, []);

  // Capture Android's installability event.
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  // Decide whether to surface the prompt. Aggressive (the tournament is short-lived): fire on the first
  // visit after a brief dwell so they glimpse value, and almost instantly for returning/engaged users.
  useEffect(() => {
    if (show || isInstalled()) return;
    let sessions = 0;
    let until = 0;
    let shownThisSession = false;
    try {
      sessions = Number(localStorage.getItem(SESSIONS_KEY) ?? "0");
      until = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
      shownThisSession = sessionStorage.getItem(SHOWN_SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (shownThisSession || Date.now() < until) return; // once per session; ~2h cooldown after a dismiss
    if (!deferred && !isIos()) return; // can't install: desktop/Android without the event
    const engaged = sessions >= 2 || views >= 2; // returning, or has clicked into something
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(SHOWN_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setShow(true);
      trackEvent("pwa_prompt_shown", { platform: deferred ? "android" : "ios" });
    }, engaged ? 1200 : 5000);
    return () => clearTimeout(t);
  }, [views, deferred, show]);

  // Lock background scroll while the popup is up (it's a modal).
  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [show]);

  function remember(cooldownMs: number) {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + cooldownMs));
    } catch {
      /* ignore */
    }
    setShow(false);
    setIosTip(false);
  }
  function dismiss() {
    let count = 1;
    try {
      count = Number(localStorage.getItem(DISMISS_COUNT_KEY) ?? "0") + 1;
      localStorage.setItem(DISMISS_COUNT_KEY, String(count));
    } catch {
      /* ignore */
    }
    trackEvent("pwa_install_dismissed", { platform: isIos() ? "ios" : "android", dismiss_count: count });
    remember(cooldownForDismissCount(count));
  }
  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice.catch(() => undefined);
      trackEvent("pwa_install_choice", { platform: "android", outcome: choice?.outcome ?? "unknown" });
      setDeferred(null);
      remember(7 * 24 * HOUR); // installed (or chose) → don't reappear; appinstalled also locks it out
    } else {
      // No native prompt (iOS, or a manual open without an install event) → show instructions.
      trackEvent("pwa_install_instructions", { platform: isIos() ? "ios" : "other" });
      setIosTip(true);
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={dismiss}
        className="animate-in fade-in absolute inset-0 bg-black/60 backdrop-blur-sm duration-200"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to home screen"
        className="animate-in fade-in zoom-in-95 slide-in-from-bottom-2 bg-surface-raised border-border-strong relative w-full max-w-sm rounded-3xl border p-6 text-center shadow-2xl duration-200 dark:inset-ring dark:inset-ring-white/5"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="text-muted-2 hover:text-foreground hover:bg-muted/40 absolute top-3 right-3 flex size-8 items-center justify-center rounded-lg"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>

        {!iosTip ? (
          <>
            <span className="border-primary/30 bg-primary/10 mx-auto flex size-16 items-center justify-center rounded-2xl border" aria-hidden>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v1a4 4 0 0 1-4 4" /><path d="M7 5H4v1a4 4 0 0 0 4 4" />
              </svg>
            </span>
            <h2 className="font-display mt-4 text-lg font-semibold tracking-tight text-balance">Add World Cup 2026 to your home screen</h2>
            <p className="text-muted-foreground mt-1.5 text-sm text-pretty">One tap to live scores, odds and the bracket — full-screen, like a native app. No searching as the tournament flies by.</p>
            <button
              type="button"
              onClick={install}
              className="bg-primary text-primary-foreground mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            >
              {deferred ? "Add to Home Screen" : "Show me how"}
            </button>
            <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground mt-1 w-full rounded-lg px-4 py-2 text-sm">Maybe later</button>
          </>
        ) : (
          <>
            <span className="border-primary/30 bg-primary/10 mx-auto flex size-16 items-center justify-center rounded-2xl border" aria-hidden>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M12 16V4" /><path d="m8 8 4-4 4 4" /><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
              </svg>
            </span>
            <h2 className="font-display mt-4 text-lg font-semibold tracking-tight">Add it in two taps</h2>
            {isIos() ? (
              <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
                Tap the <span className="text-foreground font-medium">Share</span> button in Safari, then choose{" "}
                <span className="text-foreground font-medium">“Add to Home Screen.”</span>
              </p>
            ) : (
              <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
                Open your browser menu (<span className="text-foreground font-medium">⋮</span>), then choose{" "}
                <span className="text-foreground font-medium">“Add to Home screen”</span> or{" "}
                <span className="text-foreground font-medium">“Install app.”</span>
              </p>
            )}
            <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground mt-5 w-full rounded-lg px-4 py-2 text-sm">Got it</button>
          </>
        )}
      </div>
    </div>
  );
}
