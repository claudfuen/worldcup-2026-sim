"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="mr-3 flex shrink-0 items-center gap-2 py-3">
          <span className="text-base">🏆</span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">WC26 Oracle</span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
