export interface GroupMatch {
  group: string;
  home: string; // team code
  away: string; // team code
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  venue?: string; // for host-advantage in simulation
  // In-progress match: NOT yet played, but each Monte Carlo iteration starts from the current score and
  // samples only the remaining fraction of the match (so a live lead propagates into group/knockout odds).
  // `eloAdj` is an optional in-game rating nudge (red cards / shot dominance), oriented to THIS fixture's home.
  live?: { homeGoals: number; awayGoals: number; frac: number; eloAdj?: number };
}

export interface TeamRow {
  code: string;
  played: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

// FIFA-ranking fallback proxy: pre-tournament Elo (higher = ranked higher). Codes -> rating.
export type Ratings = Record<string, number>;
