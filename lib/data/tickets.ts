// Claudio's FIFA World Cup 2026 tickets, extracted from FIFA Ticketing emails (account imclaudfuen@gmail.com).
// Held matches only. M65 (Cabo Verde vs Saudi Arabia, Jun 26) was transferred to a guest and is excluded.
// Venues included only where confirmed; others live in the FWC2026 app.
export interface TicketedMatch {
  match: number;
  round: string;
  kind: "group" | "knockout";
  date: string; // local kickoff (display only)
  tickets: number;
  slot: [string, string]; // slot refs, e.g. ["W91","W92"] or ["1J","2H"] or fixed codes for group
  fixedTeams?: [string, string]; // team codes for group matches with known teams
  venue?: string;
  note?: string;
}

export const MY_MATCHES: TicketedMatch[] = [
  { match: 38, round: "Group H", kind: "group", date: "Jun 21, 12:00", tickets: 2,
    slot: ["ESP", "KSA"], fixedTeams: ["ESP", "KSA"], venue: "Mercedes-Benz Stadium, Atlanta", note: "Hospitality" },
  { match: 86, round: "Round of 32", kind: "knockout", date: "Jul 3, 18:00", tickets: 1, slot: ["1J", "2H"] },
  { match: 92, round: "Round of 16", kind: "knockout", date: "Jul 5, 18:00", tickets: 3,
    slot: ["W79", "W80"], venue: "Mexico City Stadium" },
  { match: 99, round: "Quarter-final", kind: "knockout", date: "Jul 11, 17:00", tickets: 1, slot: ["W91", "W92"] },
  { match: 100, round: "Quarter-final", kind: "knockout", date: "Jul 11, 20:00", tickets: 1, slot: ["W95", "W96"] },
];

export const MY_MATCH_NUMBERS = MY_MATCHES.map((m) => m.match);
