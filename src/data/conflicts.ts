// Armed-conflict markers for the globe and the Conflicts panel.
// Only location, name and countries are kept here. Summaries, dates and status labels were removed because they
// went out of date. The panel shows live reporting from the news feed, matched by country code.
export interface Conflict {
  id: string;
  name: string;
  lat: number;
  lng: number;
  countries: string[]; // ISO alpha-3
}

export const CONFLICTS: Conflict[] = [
  { id: 'ukraine', name: 'Russia–Ukraine war', lat: 48.6, lng: 37.8, countries: ['UKR', 'RUS'] },
  { id: 'gaza', name: 'Gaza war', lat: 31.4, lng: 34.4, countries: ['PSE', 'ISR'] },
  { id: 'sudan', name: 'Sudanese civil war', lat: 15.5, lng: 32.5, countries: ['SDN'] },
  { id: 'myanmar', name: 'Myanmar civil war', lat: 21.9, lng: 96.1, countries: ['MMR'] },
  { id: 'yemen', name: 'Yemeni civil war', lat: 15.4, lng: 44.2, countries: ['YEM'] },
  { id: 'drc', name: 'Eastern DR Congo (M23)', lat: -1.7, lng: 29.2, countries: ['COD'] },
  { id: 'sahel', name: 'Sahel insurgency', lat: 14.5, lng: 0.5, countries: ['MLI', 'BFA', 'NER'] },
  { id: 'haiti', name: 'Haiti gang violence', lat: 18.9, lng: -72.3, countries: ['HTI'] },
  { id: 'somalia', name: 'Somalia insurgency', lat: 2.0, lng: 45.3, countries: ['SOM'] },
  { id: 'tigray', name: 'Tigray / northern Ethiopia', lat: 14.0, lng: 38.7, countries: ['ETH'] },
  { id: 'syria', name: 'Syria conflict & transition', lat: 35.0, lng: 38.5, countries: ['SYR'] },
  { id: 'kp', name: 'Khyber Pakhtunkhwa insurgency', lat: 33.6, lng: 70.0, countries: ['PAK'] },
];
