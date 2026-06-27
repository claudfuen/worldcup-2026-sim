import { STUBHUB_BY_MATCH } from "./data/ticketLinks";

/**
 * Centralized ticket-link layer. EVERYTHING about outbound ticket links lives here so the whole
 * site can be re-pointed from one file:
 *   - retag UTMs in one place,
 *   - flip every link to the affiliate redirect by providing a camref (no UI/page changes),
 *   - keep rel/target consistent (rendered by <TicketLink>).
 *
 * Provider: StubHub via Partnerize (prf.hn), the same network ticketdata's own links use.
 * The per-match destination URLs were verified against our schedule (venue city + local date, 104/104).
 */

export const TICKET_PROVIDER = "StubHub";

// ── AFFILIATE SWAP POINT ────────────────────────────────────────────────────────────────────────────
// `camref` ties our clicks to our StubHub/Partnerize publisher account. It is NOT a secret (it appears
// in every outbound affiliate URL), so it can live in code — but we read it from the env first so it can
// be turned on per-environment (set STUBHUB_CAMREF in Vercel + .env.local) without editing code.
//
// To go live:
//   1. Join the StubHub campaign in Partnerize, then generate a tracking link (Tracking tab).
//   2. Copy the token after "camref:" from that link.
//   3. Set NEXT_PUBLIC_STUBHUB_CAMREF to it — or paste it into CAMREF_FALLBACK below.
// Once a camref is present, every ticket link becomes a tracked prf.hn redirect, UTM medium flips to
// "affiliate", and rel flips to "sponsored". Until then we emit clean (UTM-tagged) StubHub links.
// NEXT_PUBLIC_ (not a secret — the camref appears in every outbound URL) so it resolves in BOTH server
// components AND the client ones (e.g. <TicketLink> renders inside the client schedule list).
const CAMREF_FALLBACK = ""; // paste camref here as an alternative to the env var
const CAMREF = (process.env.NEXT_PUBLIC_STUBHUB_CAMREF || CAMREF_FALLBACK).trim() || null;
const AFFILIATE_ACTIVE = CAMREF !== null;

/**
 * Wrap a clean destination URL in our Partnerize (prf.hn) tracked click-through:
 *   https://stubhub.prf.hn/click/camref:<CAMREF>/pubref:<surface>/destination:<url-encoded dest>
 * - pubref carries our placement so StubHub-side reporting attributes the sale to the surface it came
 *   from (sanitized to alphanumerics — Partnerize pubref allows only [A-Za-z0-9]).
 * - destination is the LAST segment and MUST be URL-encoded: our dest carries UTM query params, and a
 *   raw "&" would otherwise break the prf.hn parse.
 */
function affiliateWrap(dest: string, placement: string): string {
  if (!CAMREF) return dest;
  const pubref = placement.replace(/[^a-zA-Z0-9]/g, "").slice(0, 60) || "site";
  return `https://stubhub.prf.hn/click/camref:${CAMREF}/pubref:${pubref}/destination:${encodeURIComponent(dest)}`;
}
// ────────────────────────────────────────────────────────────────────────────────────────────────────

// UTM tags applied to every ticket link (identifies our site as the traffic source). Medium auto-switches
// to "affiliate" once a camref is present.
const UTM = {
  source: "worldcup2026predictions",
  medium: AFFILIATE_ACTIVE ? "affiliate" : "referral",
  campaign: "match_tickets",
};

/** rel for outbound commercial ticket links — "sponsored" once affiliate is live, else "nofollow". */
export const TICKET_REL = AFFILIATE_ACTIVE
  ? "sponsored noopener noreferrer"
  : "nofollow noopener noreferrer";

/** Does this match have a known ticket deep link? */
export function hasTickets(matchNo: number): boolean {
  return !!STUBHUB_BY_MATCH[matchNo];
}

function buildDest(matchNo: number, placement: string): string | null {
  const base = STUBHUB_BY_MATCH[matchNo];
  if (!base) return null;
  const u = new URL(base);
  u.searchParams.set("utm_source", UTM.source);
  u.searchParams.set("utm_medium", UTM.medium);
  u.searchParams.set("utm_campaign", UTM.campaign);
  u.searchParams.set("utm_content", placement); // WHERE the click came from (be mindful of placement)
  return u.toString();
}

/**
 * Final outbound ticket URL for a match, or null if none.
 * @param placement short, stable tag for the surface the link sits on (utm_content + affiliate pubref),
 *                  e.g. "match_page", "schedule_row", "team_fixtures". Lets us attribute clicks per
 *                  surface on both our analytics and StubHub's affiliate reporting.
 */
export function ticketUrl(matchNo: number, placement: string): string | null {
  const dest = buildDest(matchNo, placement);
  if (!dest) return null;
  return affiliateWrap(dest, placement);
}
