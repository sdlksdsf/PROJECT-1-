// Major capitals and cities used for the weather overview.
export interface City {
  name: string;
  lat: number;
  lng: number;
}

export const MAJOR_CITIES: City[] = [
  { name: 'Karachi', lat: 24.86, lng: 67.01 },
  { name: 'Islamabad', lat: 33.69, lng: 73.06 },
  { name: 'New Delhi', lat: 28.61, lng: 77.21 },
  { name: 'Beijing', lat: 39.9, lng: 116.4 },
  { name: 'Tokyo', lat: 35.68, lng: 139.69 },
  { name: 'Moscow', lat: 55.76, lng: 37.62 },
  { name: 'Kyiv', lat: 50.45, lng: 30.52 },
  { name: 'London', lat: 51.51, lng: -0.13 },
  { name: 'Cairo', lat: 30.04, lng: 31.24 },
  { name: 'Nairobi', lat: -1.29, lng: 36.82 },
  { name: 'Washington DC', lat: 38.9, lng: -77.04 },
  { name: 'São Paulo', lat: -23.55, lng: -46.63 },
  { name: 'Sydney', lat: -33.87, lng: 151.21 },
];
