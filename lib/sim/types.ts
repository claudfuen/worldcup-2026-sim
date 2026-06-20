export interface GroupMatch {
  group: string;
  home: string; // team code
  away: string; // team code
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
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
