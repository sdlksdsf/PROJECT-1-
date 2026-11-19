// Types shared between the Vercel API functions (server/, api/) and the React app (src/).

export type Category =
  | 'world'
  | 'politics'
  | 'tech'
  | 'sports'
  | 'business'
  | 'science'
  | 'health'
  | 'conflict'
  | 'regional';

/**
 * Editorial standing is a PROCESS-based grade, not a political one:
 *  A = public-service broadcaster, intergovernmental or primary-source agency
 *  B = established newsroom with published editorial standards
 *  C = aggregator, specialist or unrated outlet
 * Grades are editorial placeholders and can be changed in the `source_ratings` table.
 */
export type Standing = 'A' | 'B' | 'C';

export interface Outlet {
  id: string;
  name: string;
  domain: string;
  link: string;
  title: string;
  publishedAt: string;
  standing: Standing;
  outletCountry: string;
  ownership: string | null;
}

export interface Factuality {
  score: number; // 0-100, heuristic confidence in the story as reported
  label: string;
  tone: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface Story {
  id: string;
  title: string;
  summary: string;
  link: string;
  category: Category;
  publishedAt: string;
  ageHours: number;
  breaking: boolean;
  outlets: Outlet[];
  outletCountries: string[];
  corroboration: number;
  countries: string[]; // ISO alpha-3 codes mentioned in the coverage
  factuality: Factuality;
}

export interface FeedStatus {
  id: string;
  name: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface NewsResponse {
  updatedAt: string;
  stories: Story[];
  feeds: FeedStatus[];
  stale?: boolean;
}

export type QuoteGroup = 'index' | 'stock' | 'commodity' | 'crypto' | 'fx';

export interface Quote {
  symbol: string;
  name: string;
  group: QuoteGroup;
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string | null;
  series: number[];
}

export interface MarketsResponse {
  updatedAt: string;
  quotes: Quote[];
  error?: string;
}

export interface Quake {
  id: string;
  mag: number;
  place: string;
  time: string;
  lat: number;
  lon: number;
  depth: number;
  tsunami: boolean;
  url: string;
}

export interface NatEvent {
  id: string;
  title: string;
  category: string;
  date: string;
  lat: number;
  lon: number;
  link: string;
}

export interface DisastersResponse {
  updatedAt: string;
  quakes: Quake[];
  events: NatEvent[];
  errors: string[];
}

export interface Aircraft {
  id: string;
  call: string;
  country: string;
  lat: number;
  lon: number;
  alt: number | null; // metres
  vel: number | null; // m/s
  hdg: number | null; // degrees, true track
}

export interface FlightsResponse {
  updatedAt: string;
  total: number;
  airborne: number;
  aircraft: Aircraft[];
  byCountry: { country: string; count: number }[];
  error?: string;
}

export interface WeatherResponse {
  updatedAt: string;
  source: string;
  timezone: string;
  current: {
    temp: number | null;
    feels: number | null;
    humidity: number | null;
    wind: number | null;
    precip: number | null;
    code: number | null;
    isDay: boolean;
  };
  daily: { date: string; max: number | null; min: number | null; code: number | null }[];
}

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  year: number | null;
  unit: string;
  note: string;
}

export interface Leader {
  name: string;
  role: string;
  image: string | null;
  wikidata: string;
}

export interface CountryResponse {
  iso3: string;
  cca2: string | null;
  name: string;
  official: string | null;
  capital: string | null;
  capitalLatLng: [number, number] | null;
  region: string | null;
  subregion: string | null;
  population: number | null;
  area: number | null;
  languages: string[];
  currencies: string[];
  flag: string | null;
  indicators: Indicator[];
  leaders: Leader[];
  notes: string[];
  updatedAt: string;
}

export type CameraSourceId = 'windy' | 'openwebcamdb';
export type CameraSourceStatus = 'ok' | 'no-key' | 'auth-failed' | 'error';

export interface Camera {
  id: string;
  source: CameraSourceId;
  title: string;
  city: string | null;
  lat: number | null;
  lon: number | null;
  preview: string | null;
  embed: string | null;
  url: string | null;
  attribution: string | null;
}

export interface CamerasResponse {
  configured: boolean;
  cameras: Camera[];
  sources: Record<CameraSourceId, CameraSourceStatus>;
  message?: string;
}

export interface FlightStatus {
  flight: string;
  airline: string | null;
  date: string | null;
  status: string | null;
  departure: { airport: string | null; iata: string | null; scheduled: string | null; estimated: string | null; delay: number | null };
  arrival: { airport: string | null; iata: string | null; scheduled: string | null; estimated: string | null; delay: number | null };
  live: { lat: number; lon: number; altitude: number | null; speed: number | null; onGround: boolean } | null;
}

export interface FlightStatusResponse {
  configured: boolean;
  flights: FlightStatus[];
  message?: string;
}

export interface ArchiveItem {
  id: string;
  title: string;
  link: string;
  source_name: string;
  published_at: string;
  standing: Standing;
  factuality_score: number | null;
  category: Category;
}

export interface SourceRating {
  id: string;
  name: string;
  domain: string;
  country: string;
  standing: Standing;
  ownership: string | null;
  category: Category;
  source: 'database' | 'defaults';
}

export interface HealthResponse {
  ok: boolean;
  time: string;
  services: {
    database: boolean;
    cameras: boolean;
    ships: boolean;
    oil: boolean;
    flights: boolean;
    weather: boolean;
    flightStatus: boolean;
  };
}

export interface ShipPoint {
  mmsi: string;
  name: string;
  lat: number;
  lng: number;
  sog: number | null; // speed over ground, knots
  cog: number | null; // course over ground, degrees
}

export interface ShipsResponse {
  configured: boolean;
  updatedAt: string;
  ships: ShipPoint[];
  message?: string;
}

export interface OilResponse {
  configured: boolean;
  updatedAt: string;
  value: number | null;
  year: number | null;
  unit: string | null;
  message?: string;
}
