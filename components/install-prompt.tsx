"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

// "Add to Home Screen" prompt for retention. Gated by engagement (a returning visitor, or 3rd page this
// session) so first-time landers aren't nagged; remembers dismissal for 30 days. Android uses the native
// beforeinstallprompt; iOS (no native prompt) gets Share → Add to Home Screen instructions. Lifecycle
// outcomes go to both analytics backends via trackEvent.
const DISMISS_KEY = "wc:install-dismissed-until";
const SESSIONS_KEY = "wc:sessions";
const SESSION_GUARD = "wc:session-started";
const DISMISS_DAYS = 30;

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

  // Count this tab-session once (returning-visitor signal).
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SESSION_GUARD)) {
        localStorage.setItem(SESSIONS_KEY, String(Number(localStorage.getItem(SESSIONS_KEY) ?? "0") + 1));
        sessionStorage.setItem(SESSION_GUARD, "1");
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  // Count page views this session (the layout persists across client navigations).
  useEffect(() => setViews((v) => v + 1), [pathname]);

  // Capture Android's installability event.
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  // Decide whether to surface the prompt.
  useEffect(() => {
    if (show || isStandalone()) return;
    let sessions = 0;
    let dismissedUntil = 0;
    try {
      sessions = Number(localStorage.getItem(SESSIONS_KEY) ?? "0");
      dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
    } catch {
      /* ignore */
    }
    if (Date.now() < dismissedUntil) return;
    if (!(sessions >= 2 || views >= 3)) return; // returning, or engaged this session
    if (!deferred && !isIos()) return; // can't install: desktop/Android without the event
    const t = setTimeout(() => {
      setShow(true);
      trackEvent("pwa_prompt_shown", { platform: deferred ? "android" : "ios" });
    }, 900);
    return () => clearTimeout(t);
  }, [views, deferred, show]);

  function remember() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
    } catch {
      /* ignore */
    }
    setShow(false);
    setIosTip(false);
  }
  function dismiss() {
    trackEvent("pwa_install_dismissed", { platform: isIos() ? "ios" : "android" });
    remember();
  }
  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice.catch(() => undefined);
      trackEvent("pwa_install_choice", { platform: "android", outcome: choice?.outcome ?? "unknown" });
      setDeferred(null);
      remember();
    } else if (isIos()) {
      trackEvent("pwa_install_ios_instructions", { platform: "ios" });
      setIosTip(true);
    }
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Add to home screen"
      className="bg-surface-raised border-border-strong fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border p-4 shadow-xl backdrop-blur-xl dark:inset-ring dark:inset-ring-white/5"
    >
      {!iosTip ? (
        <div className="flex items-start gap-3">
          <span className="border-primary/30 bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-xl border" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v1a4 4 0 0 1-4 4" /><path d="M7 5H4v1a4 4 0 0 0 4 4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Add to your home screen</p>
            <p className="text-muted-foreground mt-0.5 text-xs text-pretty">One-tap access to live odds, scores and the bracket — straight from your home screen.</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={install} className="bg-primary text-primary-foreground inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90">
                {deferred ? "Add to Home Screen" : "Show me how"}
              </button>
              <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 text-sm">Not now</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-pretty">
              Tap the <span className="font-medium">Share</span> button in Safari, then choose{" "}
              <span className="font-medium">“Add to Home Screen.”</span>
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 text-sm">Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
