"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { etTime, etDateTime } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/groups", label: "Groups" },
  { href: "/bracket", label: "Bracket" },
  { href: "/schedule", label: "Schedule" },
  { href: "/matches", label: "My Matches" },
  { href: "/methodology", label: "Method" },
];

export function Nav({ updatedAt }: { updatedAt: string | null }) {
  const path = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="mr-3 flex shrink-0 items-center gap-2 py-3">
          <span className="text-base">🏆</span>
          <span className="font-display hidden text-sm font-semibold tracking-tight sm:inline">World Cup 2026 Predictions</span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_86%,transparent)] sm:[mask-image:none]">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
                  active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Freshness updatedAt={updatedAt} />
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {isPending ? null : session ? (
            <>
              <span
                className="text-muted-foreground hidden max-w-[14ch] truncate text-xs sm:inline"
                title={session.user.email}
              >
                {session.user.email}
              </span>
              <button
                onClick={async () => {
                  await signOut();
                  router.refresh();
                }}
                className="text-muted-foreground hover:text-foreground rounded-full px-2 py-1 text-xs whitespace-nowrap"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/signin"
              className="text-primary hover:bg-primary/10 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

// Global data-freshness indicator: a dot (green/amber/grey by age) + how long ago the dataset updated.
// `now` starts null so SSR and first client render match (both show the absolute ET time); a 30s ticker
// then switches to a live "Xm ago" relative time without a hydration mismatch.
function Freshness({ updatedAt }: { updatedAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!updatedAt) return null;
  const min = now == null ? null : Math.max(0, (now - new Date(updatedAt).getTime()) / 60000);
  const rel =
    min == null
      ? etTime(updatedAt)
      : min < 1
        ? "just now"
        : min < 60
          ? `${Math.round(min)}m ago`
          : min < 1440
            ? `${Math.round(min / 60)}h ago`
            : `${Math.round(min / 1440)}d ago`;
  const dot = min == null || min < 45 ? "bg-emerald-400" : min < 180 ? "bg-amber-400" : "bg-muted-foreground";
  return (
    <div
      className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs"
      title={`Live data updated ${etDateTime(updatedAt)}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="hidden whitespace-nowrap sm:inline">Updated {rel}</span>
      <span className="whitespace-nowrap sm:hidden">{rel}</span>
    </div>
  );
}
