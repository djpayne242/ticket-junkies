// Address lookup (OpenStreetMap Nominatim) and weather forecasts (Open-Meteo).
// Both are free and need no API key. Results are cached to stay fast and polite.

const UA = 'TicketJunkies.com/1.0 (event ticketing; admin contact via site)';
const geoMem = new Map();           // query -> { lat, lng, label } | null
let geoChain = Promise.resolve();   // Nominatim allows ~1 request/second: run lookups one at a time
let lastGeoAt = 0;

async function nominatim(q) {
  const key = q.toLowerCase().trim();
  if (geoMem.has(key)) return geoMem.get(key);
  const run = async () => {
    const wait = Math.max(0, lastGeoAt + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastGeoAt = Date.now();
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Geocoder error ${res.status}`);
    const list = await res.json();
    const hit = list[0] ? { lat: Number(list[0].lat), lng: Number(list[0].lon), label: list[0].display_name } : null;
    geoMem.set(key, hit);
    return hit;
  };
  const p = geoChain.then(run, run);
  geoChain = p.catch(() => {});
  return p;
}

// Tries the most precise query first, then falls back to broader ones.
export async function geocodePlace({ venue = '', address = '', city = '', country = '' }) {
  const parts = (...xs) => xs.map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  const tries = [
    ['venue', parts(venue, address, city, country)],
    ['address', parts(address, city, country)],
    ['venue', parts(venue, city, country)],
    ['city', parts(city, country)],
  ];
  const seen = new Set();
  for (const [precision, q] of tries) {
    if (!q || seen.has(q) || (precision !== 'city' && q === parts(city, country))) continue;
    seen.add(q);
    try {
      const hit = await nominatim(q);
      if (hit) return { ...hit, precision, query: q };
    } catch (e) {
      console.error('[geo]', e.message);
      return null;
    }
  }
  return null;
}

export const validLatLng = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// ---------- weather ----------
const wxMem = new Map(); // "lat,lng" -> { at, data }
const WX_TTL = 30 * 60 * 1000;

export async function forecast(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = wxMem.get(key);
  if (hit && Date.now() - hit.at < WX_TTL) return hit.data;
  const params = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4), timezone: 'auto', timeformat: 'unixtime', forecast_days: '16',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Weather service error ${res.status}`);
  const j = await res.json();
  const data = {
    timezone: j.timezone, utcOffset: j.utc_offset_seconds,
    current: j.current && {
      time: j.current.time, temp: j.current.temperature_2m, feels: j.current.apparent_temperature,
      humidity: j.current.relative_humidity_2m, code: j.current.weather_code, wind: j.current.wind_speed_10m, isDay: !!j.current.is_day,
    },
    daily: (j.daily?.time || []).map((t, i) => ({
      time: t, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i],
      rain: j.daily.precipitation_probability_max[i], sunrise: j.daily.sunrise[i], sunset: j.daily.sunset[i],
    })),
    hourly: (j.hourly?.time || []).map((t, i) => ({
      time: t, temp: j.hourly.temperature_2m[i], rain: j.hourly.precipitation_probability[i],
      code: j.hourly.weather_code[i], wind: j.hourly.wind_speed_10m[i], isDay: !!j.hourly.is_day[i],
    })),
  };
  wxMem.set(key, { at: Date.now(), data });
  if (wxMem.size > 500) wxMem.delete(wxMem.keys().next().value);
  return data;
}
