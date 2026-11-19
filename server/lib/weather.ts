// Current conditions and a 3-day outlook from Open-Meteo (free, keyless, no API key).
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
    const d = await getJson<OmResponse>(url, { timeoutMs: 7000 });
    return {
      updatedAt: new Date().toISOString(),
      timezone: d.timezone,
      current: {
        temp: d.current.temperature_2m,
        feels: d.current.apparent_temperature,
        humidity: d.current.relative_humidity_2m,
        wind: d.current.wind_speed_10m,
        precip: d.current.precipitation,
        code: d.current.weather_code,
        isDay: d.current.is_day === 1,
      },
      daily: d.daily.time.map((date, i) => ({
        date,
        max: d.daily.temperature_2m_max[i] ?? null,
        min: d.daily.temperature_2m_min[i] ?? null,
        code: d.daily.weather_code[i] ?? null,
      })),
    };
  });
}
