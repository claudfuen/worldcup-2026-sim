import { ticketUrl, hasTickets, TICKET_REL, TICKET_PROVIDER } from "@/lib/tickets";

// Single, centralized renderer for every ticket link on the site. Placement + UTM + rel + target all
// flow through lib/tickets.ts, so monetizing later (affiliate wrapper) needs zero changes here.
//
// variant:
//   "button" — prominent CTA (match page).
//   "inline" — small secondary link (schedule rows, team fixtures, lists).

function TicketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" />
      <path d="M13 7v10" strokeDasharray="1.5 2.5" />
    </svg>
  );
}

export function TicketLink({
  matchNo,
  placement,
  variant = "inline",
  className = "",
  label,
}: {
  matchNo: number;
  placement: string;
  variant?: "button" | "inline";
  className?: string;
  label?: string;
}) {
  if (!hasTickets(matchNo)) return null;
  const href = ticketUrl(matchNo, placement);
  if (!href) return null;

  if (variant === "button") {
    return (
      <a
        href={href}
        target="_blank"
        rel={TICKET_REL}
        className={`border-primary/25 bg-primary/5 text-primary hover:border-primary/50 hover:bg-primary/10 inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors ${className}`}
      >
        <TicketIcon className="size-4 shrink-0" />
        {label ?? `Find tickets on ${TICKET_PROVIDER}`}
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground shrink-0" aria-hidden>
          <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel={TICKET_REL}
      className={`text-muted-foreground hover:text-primary inline-flex shrink-0 items-center gap-1 text-xs transition-colors ${className}`}
      aria-label={`Find tickets for this match on ${TICKET_PROVIDER} (opens in a new tab)`}
    >
      <TicketIcon className="size-3.5" />
      {label ?? "Tickets"}
    </a>
  );
}
