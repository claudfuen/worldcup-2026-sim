"use client";
// Toggle a match in/out of the user's My Matches. Optimistic; falls back to /signin when signed out.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleMatch } from "@/app/actions/matches";
import { useT } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref } from "@/lib/i18n/config";

export function MatchFlagButton({
  matchNo,
  initialOn,
  isAuthed,
  variant = "icon",
}: {
  matchNo: number;
  initialOn: boolean;
  isAuthed: boolean;
  variant?: "icon" | "button";
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [pending, start] = useTransition();

  function handle(e: React.MouseEvent) {
    // These buttons often sit inside <Link> cards — don't navigate the card.
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthed) {
      const next = typeof window !== "undefined" ? window.location.pathname : localeHref(locale, "/matches");
      router.push(`${localeHref(locale, "/signin")}?next=${encodeURIComponent(next)}`);
      return;
    }
    const target = !on;
    setOn(target); // optimistic
    start(async () => {
      const res = await toggleMatch(matchNo, target);
      if (!res.ok) {
        setOn(!target);
        if (res.error === "not-signed-in") router.push(localeHref(locale, "/signin"));
      } else {
        router.refresh();
      }
    });
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        aria-pressed={on}
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
          on
            ? "border-contention/40 bg-contention/12 text-contention"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bookmark filled={on} />
        {on ? t("matchFlag.inMyMatches") : isAuthed ? t("matchFlag.addToMyMatches") : t("matchFlag.signInToSave")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-pressed={on}
      aria-label={on ? t("matchFlag.removeFromMyMatches") : t("matchFlag.addToMyMatches")}
      title={on ? t("matchFlag.removeFromMyMatches") : t("matchFlag.addToMyMatches")}
      className={`shrink-0 rounded-md p-1 leading-none disabled:opacity-60 ${
        on ? "text-contention" : "text-muted-foreground/40 hover:text-muted-foreground"
      }`}
    >
      <Bookmark filled={on} />
    </button>
  );
}

// A small bookmark glyph — filled when the match is saved, outline when not.
function Bookmark({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M6 3a2 2 0 0 0-2 2v15l8-4 8 4V5a2 2 0 0 0-2-2H6Z" />
    </svg>
  );
}
