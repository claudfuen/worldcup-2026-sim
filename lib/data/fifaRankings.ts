// Official FIFA/Coca-Cola Men's World Ranking position for each of the 48 finalists.
//
// MANUALLY SOURCED SNAPSHOT — edition of 11 June 2026 (the last release before the tournament; next FIFA
// update 20 July 2026). NOT auto-generated and NOT what drives any prediction — the model uses Elo
// (lib/data/teams.ts `rating`). This is stored only as a recognizable reference (e.g. the match-page rank
// toggle). Refresh from the official ranking when FIFA publishes a new edition.
// Sources: FIFA.com / ESPN "FIFA Men's Top 50" / Wikipedia "FIFA Men's World Ranking" (June 2026).
export const FIFA_RANK: Record<string, number> = {
  ARG: 1, ESP: 2, FRA: 3, ENG: 4, POR: 5, BRA: 6, MAR: 7, NED: 8, BEL: 9, GER: 10,
  CRO: 11, COL: 13, MEX: 14, SEN: 15, URU: 16, USA: 17, JPN: 18, SUI: 19, IRN: 20, TUR: 22,
  ECU: 23, AUT: 24, KOR: 25, AUS: 27, ALG: 28, EGY: 29, CAN: 30, NOR: 31, CIV: 33, PAN: 34,
  SWE: 38, CZE: 40, PAR: 41, SCO: 42, TUN: 45, COD: 46, UZB: 50, QAT: 56, IRQ: 57, RSA: 60,
  KSA: 61, JOR: 63, BIH: 64, CPV: 67, GHA: 73, CUW: 82, HAI: 83, NZL: 85,
};

// The ranking's edition date, for any "as of" caption.
export const FIFA_RANK_AS_OF = "2026-06-11";
