// Maritime chokepoints and waterways. Coordinates are approximate centres. The radius is only used to
// count nearby ships and aircraft on the Traffic tab; it is not a legal or navigational boundary.
export interface Chokepoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  note: string;
}

export const CHOKEPOINTS: Chokepoint[] = [
  { id: 'hormuz', name: 'Strait of Hormuz', lat: 26.6, lng: 56.3, radiusKm: 150, note: 'Oil and LNG from the Gulf' },
  { id: 'bab-el-mandeb', name: 'Bab el-Mandeb', lat: 12.6, lng: 43.4, radiusKm: 150, note: 'Red Sea entrance from Gulf of Aden' },
  { id: 'suez', name: 'Suez Canal', lat: 30.5, lng: 32.35, radiusKm: 120, note: 'Europe–Asia shipping' },
  { id: 'malacca', name: 'Strait of Malacca', lat: 2.5, lng: 101.8, radiusKm: 200, note: 'Asia–Pacific shipping' },
  { id: 'taiwan', name: 'Taiwan Strait', lat: 24.5, lng: 119.5, radiusKm: 200, note: 'Between Taiwan and mainland China' },
  { id: 'panama', name: 'Panama Canal', lat: 9.08, lng: -79.68, radiusKm: 120, note: 'Atlantic–Pacific transit' },
  { id: 'bosphorus', name: 'Turkish Straits (Bosphorus)', lat: 41.12, lng: 29.07, radiusKm: 100, note: 'Black Sea access' },
  { id: 'gibraltar', name: 'Strait of Gibraltar', lat: 36.0, lng: -5.6, radiusKm: 100, note: 'Mediterranean access' },
  { id: 'danish', name: 'Danish Straits', lat: 55.6, lng: 12.6, radiusKm: 120, note: 'Baltic Sea access' },
  { id: 'cape', name: 'Cape of Good Hope', lat: -34.36, lng: 18.47, radiusKm: 200, note: 'Alternative route around Africa' },
  { id: 'korea', name: 'Korea Strait', lat: 34.5, lng: 129.3, radiusKm: 150, note: 'Japan–Korea shipping' },
  { id: 'dover', name: 'Dover Strait', lat: 51.0, lng: 1.5, radiusKm: 80, note: 'English Channel, one of the busiest shipping lanes' },
];

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
