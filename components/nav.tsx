"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/groups", label: "Groups" },
  { href: "/bracket", label: "Bracket" },
  { href: "/schedule", label: "Schedule" },
  { href: "/matches", label: "My Matches" },
  { href: "/methodology", label: "Method" },
];

export function Nav() {
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
