// The 16 host venues of the 2026 World Cup. `key` matches the `venue` string stored on every match in
// schedule.ts (the commercial / original stadium name), so this joins 1:1 to the schedule and to the
// FIFA host-city names in lib/venues.ts. Capacities are the tournament (football) configuration, rounded
// and approximate. Coordinates are the stadium location — used for the overview map.
export interface Venue {
  key: string; // === SCHEDULE.venue (commercial name)
  slug: string;
  fifaName: string; // FIFA's host-city tournament name (e.g. "Mexico City Stadium")
  city: string; // FIFA host city
  country: "USA" | "Mexico" | "Canada";
  hostCode: "USA" | "MEX" | "CAN"; // host-nation team code, for the country flag
  capacity: number; // approx, tournament configuration
  lat: number;
  lng: number;
}

export const VENUES: Venue[] = [
  // United States
  { key: "MetLife Stadium", slug: "new-york-new-jersey", fifaName: "New York New Jersey Stadium", city: "New York New Jersey", country: "USA", hostCode: "USA", capacity: 82500, lat: 40.8135, lng: -74.0745 },
  { key: "AT&T Stadium", slug: "dallas", fifaName: "Dallas Stadium", city: "Dallas", country: "USA", hostCode: "USA", capacity: 80000, lat: 32.7473, lng: -97.0945 },
  { key: "NRG Stadium", slug: "houston", fifaName: "Houston Stadium", city: "Houston", country: "USA", hostCode: "USA", capacity: 72220, lat: 29.6847, lng: -95.4107 },
  { key: "GEHA Field at Arrowhead Stadium", slug: "kansas-city", fifaName: "Kansas City Stadium", city: "Kansas City", country: "USA", hostCode: "USA", capacity: 76416, lat: 39.0489, lng: -94.4839 },
  { key: "Mercedes-Benz Stadium", slug: "atlanta", fifaName: "Atlanta Stadium", city: "Atlanta", country: "USA", hostCode: "USA", capacity: 71000, lat: 33.7553, lng: -84.4006 },
  { key: "Lincoln Financial Field", slug: "philadelphia", fifaName: "Philadelphia Stadium", city: "Philadelphia", country: "USA", hostCode: "USA", capacity: 69176, lat: 39.9008, lng: -75.1675 },
  { key: "Lumen Field", slug: "seattle", fifaName: "Seattle Stadium", city: "Seattle", country: "USA", hostCode: "USA", capacity: 69000, lat: 47.5952, lng: -122.3316 },
  { key: "Levi's Stadium", slug: "san-francisco-bay-area", fifaName: "San Francisco Bay Area Stadium", city: "San Francisco Bay Area", country: "USA", hostCode: "USA", capacity: 68500, lat: 37.4030, lng: -121.9698 },
  { key: "SoFi Stadium", slug: "los-angeles", fifaName: "Los Angeles Stadium", city: "Los Angeles", country: "USA", hostCode: "USA", capacity: 70240, lat: 33.9535, lng: -118.3392 },
  { key: "Gillette Stadium", slug: "boston", fifaName: "Boston Stadium", city: "Boston", country: "USA", hostCode: "USA", capacity: 65878, lat: 42.0909, lng: -71.2643 },
  { key: "Hard Rock Stadium", slug: "miami", fifaName: "Miami Stadium", city: "Miami", country: "USA", hostCode: "USA", capacity: 65326, lat: 25.9580, lng: -80.2389 },
  // Mexico
  { key: "Estadio Azteca", slug: "mexico-city", fifaName: "Mexico City Stadium", city: "Mexico City", country: "Mexico", hostCode: "MEX", capacity: 83264, lat: 19.3029, lng: -99.1505 },
  { key: "Estadio BBVA", slug: "monterrey", fifaName: "Monterrey Stadium", city: "Monterrey", country: "Mexico", hostCode: "MEX", capacity: 53500, lat: 25.6692, lng: -100.2444 },
  { key: "Estadio Akron", slug: "guadalajara", fifaName: "Guadalajara Stadium", city: "Guadalajara", country: "Mexico", hostCode: "MEX", capacity: 48071, lat: 20.6819, lng: -103.4625 },
  // Canada
  { key: "BC Place Stadium", slug: "vancouver", fifaName: "Vancouver Stadium", city: "Vancouver", country: "Canada", hostCode: "CAN", capacity: 54500, lat: 49.2768, lng: -123.1119 },
  { key: "BMO Field", slug: "toronto", fifaName: "Toronto Stadium", city: "Toronto", country: "Canada", hostCode: "CAN", capacity: 45000, lat: 43.6332, lng: -79.4185 },
];

export const VENUE_BY_SLUG: Record<string, Venue> = Object.fromEntries(VENUES.map((v) => [v.slug, v]));
export const VENUE_BY_KEY: Record<string, Venue> = Object.fromEntries(VENUES.map((v) => [v.key, v]));
export const COUNTRIES = ["USA", "Mexico", "Canada"] as const;
