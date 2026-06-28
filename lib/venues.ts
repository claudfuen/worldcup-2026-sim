// FIFA's official 2026 tournament venue names — host-city based, so they're browsable (you instantly
// know WHERE a match is) rather than the commercial stadium name. Keyed by the stadium name stored in
// lib/data/schedule.ts. The host-city naming is FIFA's official convention for the tournament
// (fifa.com host cities / stadiums) — so even the iconic Azteca becomes "Mexico City Stadium".
const FIFA_VENUE: Record<string, string> = {
  "AT&T Stadium": "Dallas Stadium",
  "BC Place Stadium": "Vancouver Stadium",
  "BMO Field": "Toronto Stadium",
  "Estadio Akron": "Guadalajara Stadium",
  "Estadio Azteca": "Mexico City Stadium",
  "Estadio BBVA": "Monterrey Stadium",
  "GEHA Field at Arrowhead Stadium": "Kansas City Stadium",
  "Gillette Stadium": "Boston Stadium",
  "Hard Rock Stadium": "Miami Stadium",
  "Levi's Stadium": "San Francisco Bay Area Stadium",
  "Lincoln Financial Field": "Philadelphia Stadium",
  "Lumen Field": "Seattle Stadium",
  "Mercedes-Benz Stadium": "Atlanta Stadium",
  "MetLife Stadium": "New York New Jersey Stadium",
  "NRG Stadium": "Houston Stadium",
  "SoFi Stadium": "Los Angeles Stadium",
};

/** FIFA official 2026 tournament name for a stadium (falls back to the stored name if unmapped). */
export function fifaVenue(venue: string): string {
  return FIFA_VENUE[venue] ?? venue;
}

// FIFA's official host CITY for each stadium — the recognizable metro a casual browser knows, not the
// precise municipality stored in schedule.ts (Inglewood, Foxborough, East Rutherford, Santa Clara,
// Arlington, Miami Gardens…). Keyed by stadium so it stays 1:1 with FIFA_VENUE.
const FIFA_CITY: Record<string, string> = {
  "AT&T Stadium": "Dallas",
  "BC Place Stadium": "Vancouver",
  "BMO Field": "Toronto",
  "Estadio Akron": "Guadalajara",
  "Estadio Azteca": "Mexico City",
  "Estadio BBVA": "Monterrey",
  "GEHA Field at Arrowhead Stadium": "Kansas City",
  "Gillette Stadium": "Boston",
  "Hard Rock Stadium": "Miami",
  "Levi's Stadium": "San Francisco Bay Area",
  "Lincoln Financial Field": "Philadelphia",
  "Lumen Field": "Seattle",
  "Mercedes-Benz Stadium": "Atlanta",
  "MetLife Stadium": "New York New Jersey",
  "NRG Stadium": "Houston",
  "SoFi Stadium": "Los Angeles",
};

/** FIFA official 2026 host city for a stadium (falls back to the stored municipality if unmapped). */
export function fifaCity(venue: string, fallbackCity: string): string {
  return FIFA_CITY[venue] ?? fallbackCity;
}
