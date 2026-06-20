// AUTO-GENERATED, red-team verified against 2026 FIFA regulations (Art. 13).
// 2026 RULE CHANGE: head-to-head is applied BEFORE overall goal difference (reverse of 1970-2022).
export const POINTS = { win: 3, draw: 1, loss: 0 } as const;
// Group tiebreaker order (after points): H2H points -> H2H GD -> H2H GF -> overall GD -> overall GF -> conduct -> FIFA ranking.
// Third-place ranking (cross-group, no H2H): points -> overall GD -> overall GF -> conduct -> FIFA ranking.
// Knockouts: draw -> 30' extra time -> penalties. No away-goals rule.
// FIFA-ranking fallback approximated by pre-tournament Elo (higher = higher rank). Used only in the rare unresolved tie.
export const THIRDS_ADVANCING = 8;
