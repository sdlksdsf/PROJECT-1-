// Weather for a point. Current conditions come from OpenWeather when OPENWEATHER_API_KEY is set
// (fallback: Open-Meteo). The 3-day outlook and the local timezone always come from Open-Meteo (free, keyless).
import { getJson } from './http';
import { remember } from './cache';
import type { WeatherResponse } from '../../shared/types';

interface OmResponse {
  timezone: string;
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    precipitation: number;
    weather_code: number;
    is_day: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    weather_code: (number | null)[];
  };
}

interface OwResponse {
  dt: number;
  main: { temp: number; feels_like: number; humidity: number };
  wind: { speed: number };
  rain?: { '1h'?: number };
  snow?: { '1h'?: number };
  weather: { id: number }[];
  sys: { sunrise: number; sunset: number };
}

// OpenWeather condition id -> the WMO weather codes that the UI already labels.
export function owToWmo(id: number): number {
  if (id >= 200 && id < 300) return 95;
  if (id >= 300 && id < 400) return 51;
  if (id === 500 || id === 501) return 61;
  if (id >= 500 && id < 600) return 65;
  if (id >= 600 && id < 700) return 73;
  if (id === 741) return 45;
  if (id >= 700 && id < 800) return 45;
  if (id === 800) return 0;
  if (id === 801) return 1;
  if (id === 802) return 2;
  return 3;
}

async function openWeatherCurrent(lat: number, lon: number, key: string): Promise<WeatherResponse['current']> {
  const d = await getJson<OwResponse>(
    `https://api.openweathermap.org/data/2.5/weather?${new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      units: 'metric',
      appid: key,
    })}`,
    { timeoutMs: 7000 },
  );
  return {
    temp: d.main.temp,
    feels: d.main.feels_like,
    humidity: d.main.humidity,
    wind: d.wind.speed * 3.6,
    precip: (d.rain?.['1h'] ?? 0) + (d.snow?.['1h'] ?? 0),
    code: owToWmo(d.weather[0]?.id ?? 800),
    isDay: d.dt >= d.sys.sunrise && d.dt < d.sys.sunset,
  };
}

export function getWeather(lat: number, lon: number): Promise<WeatherResponse> {
  const key = `weather:${lat.toFixed(2)},${lon.toFixed(2)}`;
  return remember(key, 10 * 60e3, async () => {
    const url =
      'https://api.open-meteo.com/v1/forecast?' +
      new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day',
        daily: 'temperature_2m_max,temperature_2m_min,weather_code',
        forecast_days: '3',
        timezone: 'auto',
        wind_speed_unit: 'kmh',
      }).toString();
    const owKey = process.env.OPENWEATHER_API_KEY;
    const [om, ow] = await Promise.all([
      getJson<OmResponse>(url, { timeoutMs: 7000 }),
      owKey ? openWeatherCurrent(lat, lon, owKey).catch(() => null) : Promise.resolve(null),
    ]);
    const omCurrent: WeatherResponse['current'] = {
      temp: om.current.temperature_2m,
      feels: om.current.apparent_temperature,
      humidity: om.current.relative_humidity_2m,
      wind: om.current.wind_speed_10m,
      precip: om.current.precipitation,
      code: om.current.weather_code,
      isDay: om.current.is_day === 1,
    };
    return {
      updatedAt: new Date().toISOString(),
      source: ow ? 'OpenWeather (now) · Open-Meteo (3-day)' : 'Open-Meteo',
      timezone: om.timezone,
      current: ow ?? omCurrent,
      daily: om.daily.time.map((date, i) => ({
        date,
        max: om.daily.temperature_2m_max[i] ?? null,
        min: om.daily.temperature_2m_min[i] ?? null,
        code: om.daily.weather_code[i] ?? null,
      })),
    };
  });
}
