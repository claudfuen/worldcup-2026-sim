// FIFA's official 2026 tournament venue names — host-city based, so they're browsable (you instantly
// know WHERE a match is) rather than the commercial stadium name. Keyed by the stadium name stored in
// lib/data/schedule.ts. Estadio Azteca is kept as-is (iconic + already city-clear). The host-city naming
// is FIFA's official convention for the tournament (fifa.com host cities / stadiums).
const FIFA_VENUE: Record<string, string> = {
  "AT&T Stadium": "Dallas Stadium",
  "BC Place Stadium": "Vancouver Stadium",
  "BMO Field": "Toronto Stadium",
  "Estadio Akron": "Guadalajara Stadium",
  "Estadio Azteca": "Estadio Azteca",
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
