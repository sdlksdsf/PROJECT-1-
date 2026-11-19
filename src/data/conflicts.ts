// Curated list of armed conflicts shown as globe markers. This is NOT a live feed.
// Add ACLED credentials (or your own review process) to make it live.
// `status: 'verify'` means the entry has not been checked against current reporting.
export type ConflictStatus = 'active' | 'ceasefire' | 'verify';

export interface Conflict {
  id: string;
  name: string;
  lat: number;
  lng: number;
  countries: string[]; // ISO alpha-3
  status: ConflictStatus;
  since: string;
  summary: string;
  sources: { label: string; url: string }[];
}

const wiki = (title: string) => `https://en.wikipedia.org/wiki/${title}`;
const search = (q: string) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;

export const CONFLICTS: Conflict[] = [
  {
    id: 'ukraine',
    name: 'Russia–Ukraine war',
    lat: 48.6,
    lng: 37.8,
    countries: ['UKR', 'RUS'],
    status: 'active',
    since: '2022',
    summary: 'Full-scale war since Russia’s invasion in February 2022; frontline combat in eastern and southern Ukraine.',
    sources: [{ label: 'Wikipedia: Russo-Ukrainian War', url: wiki('Russo-Ukrainian_War') }],
  },
  {
    id: 'gaza',
    name: 'Gaza war',
    lat: 31.4,
    lng: 34.4,
    countries: ['PSE', 'ISR'],
    status: 'verify',
    since: '2023',
    summary: 'Armed conflict between Israel and Palestinian armed groups in Gaza. Ceasefire status changes frequently; verify current reporting.',
    sources: [{ label: 'Wikipedia: Gaza war', url: wiki('Gaza_war') }],
  },
  {
    id: 'sudan',
    name: 'Sudanese civil war',
    lat: 15.5,
    lng: 32.5,
    countries: ['SDN'],
    status: 'active',
    since: '2023',
    summary: 'Fighting between the Sudanese Armed Forces and the Rapid Support Forces, with large-scale displacement.',
    sources: [{ label: 'Wikipedia: Sudanese civil war (2023–present)', url: wiki('Sudanese_civil_war_(2023%E2%80%93present)') }],
  },
  {
    id: 'myanmar',
    name: 'Myanmar civil war',
    lat: 21.9,
    lng: 96.1,
    countries: ['MMR'],
    status: 'active',
    since: '2021',
    summary: 'Conflict between the military government and armed resistance and ethnic armed organisations after the 2021 coup.',
    sources: [{ label: 'Wikipedia: Myanmar civil war (2021–present)', url: wiki('Myanmar_civil_war_(2021%E2%80%93present)') }],
  },
  {
    id: 'yemen',
    name: 'Yemeni civil war',
    lat: 15.4,
    lng: 44.2,
    countries: ['YEM'],
    status: 'verify',
    since: '2014',
    summary: 'Long-running conflict between internationally recognised government forces and Houthi forces. Verify current front lines.',
    sources: [{ label: 'Wikipedia: Yemeni civil war (2014–present)', url: wiki('Yemeni_civil_war_(2014%E2%80%93present)') }],
  },
  {
    id: 'drc',
    name: 'Eastern DR Congo (M23)',
    lat: -1.7,
    lng: 29.2,
    countries: ['COD'],
    status: 'verify',
    since: '2021',
    summary: 'M23 rebel insurgency in North and South Kivu provinces. Peace-process status needs verification.',
    sources: [{ label: 'Wikipedia: M23 rebellion', url: wiki('M23_rebellion') }],
  },
  {
    id: 'sahel',
    name: 'Sahel insurgency',
    lat: 14.5,
    lng: 0.5,
    countries: ['MLI', 'BFA', 'NER'],
    status: 'active',
    since: '2012',
    summary: 'Jihadist insurgency and military-government tensions across Mali, Burkina Faso and Niger.',
    sources: [{ label: 'Wikipedia: Insurgency in the Sahel', url: wiki('Insurgency_in_the_Sahel') }],
  },
  {
    id: 'haiti',
    name: 'Haiti gang violence',
    lat: 18.9,
    lng: -72.3,
    countries: ['HTI'],
    status: 'verify',
    since: '2021',
    summary: 'Gang control of large parts of Port-au-Prince and wider displacement. Verify current situation.',
    sources: [{ label: 'Wikipedia search: Haiti gang violence', url: search('Haiti gang violence') }],
  },
  {
    id: 'somalia',
    name: 'Somalia insurgency',
    lat: 2.0,
    lng: 45.3,
    countries: ['SOM'],
    status: 'verify',
    since: '2007',
    summary: 'Al-Shabaab insurgency against the federal government and African Union forces.',
    sources: [{ label: 'Wikipedia search: Somali Civil War', url: search('Al-Shabaab insurgency Somalia') }],
  },
  {
    id: 'tigray',
    name: 'Tigray / northern Ethiopia',
    lat: 14.0,
    lng: 38.7,
    countries: ['ETH'],
    status: 'verify',
    since: '2020',
    summary: 'Tigray war (2020–2022) followed by a 2022 cessation of hostilities; tensions and local fighting continue. Verify.',
    sources: [{ label: 'Wikipedia: Tigray War', url: wiki('Tigray_War') }],
  },
  {
    id: 'syria',
    name: 'Syria conflict & transition',
    lat: 35.0,
    lng: 38.5,
    countries: ['SYR'],
    status: 'verify',
    since: '2011',
    summary: 'Syrian civil war and subsequent political transition. Verify current control and violence levels.',
    sources: [{ label: 'Wikipedia: Syrian civil war', url: wiki('Syrian_civil_war') }],
  },
  {
    id: 'kp',
    name: 'Khyber Pakhtunkhwa insurgency',
    lat: 33.6,
    lng: 70.0,
    countries: ['PAK'],
    status: 'verify',
    since: '2007',
    summary: 'Militant violence in north-west Pakistan, including Khyber Pakhtunkhwa and Balochistan. Verify current reporting.',
    sources: [{ label: 'Wikipedia search: Khyber Pakhtunkhwa insurgency', url: search('Khyber Pakhtunkhwa insurgency') }],
  },
];

export const CONFLICT_LAST_REVIEWED = 'Not yet reviewed against live reporting';
