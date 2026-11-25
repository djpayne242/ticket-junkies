<?php if (!defined('ABSPATH')) exit;
/**
 * Address lookup (OpenStreetMap Nominatim) and weather forecasts (Open-Meteo). Both free, no API key.
 * Results are cached in transients to stay fast and polite (Nominatim allows ~1 request/second).
 */
class TJ_Geo {
  const UA = 'TicketJunkies.com/1.0 (event ticketing; admin contact via site)';
  const WX_TTL = 1800; // 30 minutes

  private static function user_agent() {
    $host = wp_parse_url(home_url(), PHP_URL_HOST);
    return self::UA . ($host ? ' ' . $host : '');
  }

  /** @return array|null {lat,lng,label}; throws Exception on service errors. */
  private static function nominatim($q, $timeout = 8) {
    $key = 'tj_geo_' . md5(strtolower(trim($q)));
    $cached = get_transient($key);
    if ($cached !== false) return $cached === 'none' ? null : $cached;
    // throttle: at most one request per ~1.1s across requests
    $last = (float) get_transient('tj_geo_last');
    $wait = $last + 1.1 - microtime(true);
    if ($wait > 0 && $wait < 2) usleep((int) ($wait * 1000000));
    set_transient('tj_geo_last', (string) microtime(true), 10);
    $url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=' . rawurlencode($q);
    $res = wp_remote_get($url, array('timeout' => $timeout, 'headers' => array('User-Agent' => self::user_agent(), 'Accept-Language' => 'en')));
    if (is_wp_error($res)) throw new Exception($res->get_error_message());
    $code = (int) wp_remote_retrieve_response_code($res);
    if ($code < 200 || $code >= 300) throw new Exception('Geocoder error ' . $code);
    $list = json_decode(wp_remote_retrieve_body($res), true);
    $hit = is_array($list) && !empty($list[0]) ? array('lat' => (float) $list[0]['lat'], 'lng' => (float) $list[0]['lon'], 'label' => (string) $list[0]['display_name']) : null;
    set_transient($key, $hit ? $hit : 'none', $hit ? 30 * DAY_IN_SECONDS : DAY_IN_SECONDS);
    return $hit;
  }

  /** Tries the most precise query first, then falls back to broader ones. */
  /** $deadline: optional unix time after which no further lookups are attempted. */
  public static function geocode_place($p, $deadline = null) {
    $g = function ($k) use ($p) { return isset($p[$k]) ? trim((string) $p[$k]) : ''; };
    $parts = function () { return implode(', ', array_values(array_filter(array_map(function ($x) { return trim((string) $x); }, func_get_args()), 'strlen'))); };
    $venue = $g('venue'); $address = $g('address'); $city = $g('city'); $country = $g('country');
    $cityq = $parts($city, $country);
    $tries = array(
      array('venue', $parts($venue, $address, $city, $country)),
      array('address', $parts($address, $city, $country)),
      array('venue', $parts($venue, $city, $country)),
      array('city', $cityq),
    );
    $seen = array();
    foreach ($tries as $t) {
      list($precision, $q) = $t;
      if (!$q || isset($seen[$q]) || ($precision !== 'city' && $q === $cityq)) continue;
      $seen[$q] = true;
      $left = $deadline ? $deadline - microtime(true) : 8;
      if ($left < 1) return null;
      try {
        $hit = self::nominatim($q, (int) max(1, min(8, floor($left))));
        if ($hit) return array_merge($hit, array('precision' => $precision, 'query' => $q));
      } catch (Exception $e) {
        error_log('[tj geo] ' . $e->getMessage());
        return null;
      }
    }
    return null;
  }

  public static function valid_lat_lng($lat, $lng) {
    if (!is_int($lat) && !is_float($lat)) return false;
    if (!is_int($lng) && !is_float($lng)) return false;
    if (is_nan((float) $lat) || is_nan((float) $lng) || is_infinite((float) $lat) || is_infinite((float) $lng)) return false;
    return abs($lat) <= 90 && abs($lng) <= 180 && !($lat == 0 && $lng == 0);
  }

  /** Weather forecast (cached 30 min per spot). Throws Exception on failure. */
  public static function forecast($lat, $lng) {
    $key = 'tj_wx_' . md5(sprintf('%.2f,%.2f', $lat, $lng));
    $hit = get_transient($key);
    if (is_array($hit)) return $hit;
    $params = array(
      'latitude' => sprintf('%.4f', $lat), 'longitude' => sprintf('%.4f', $lng), 'timezone' => 'auto', 'timeformat' => 'unixtime', 'forecast_days' => '16',
      'temperature_unit' => 'fahrenheit', 'wind_speed_unit' => 'mph', 'precipitation_unit' => 'inch',
      'current' => 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
      'hourly' => 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,is_day',
      'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    );
    $res = wp_remote_get('https://api.open-meteo.com/v1/forecast?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986), array('timeout' => 8, 'headers' => array('User-Agent' => self::user_agent())));
    if (is_wp_error($res)) throw new Exception($res->get_error_message());
    $code = (int) wp_remote_retrieve_response_code($res);
    if ($code < 200 || $code >= 300) throw new Exception('Weather service error ' . $code);
    $j = json_decode(wp_remote_retrieve_body($res), true);
    if (!is_array($j)) throw new Exception('Weather service returned invalid data');
    $at = function ($arr, $k, $i) { return isset($arr[$k][$i]) ? $arr[$k][$i] : null; };
    $data = array('timezone' => isset($j['timezone']) ? $j['timezone'] : null, 'utcOffset' => isset($j['utc_offset_seconds']) ? $j['utc_offset_seconds'] : null, 'current' => null, 'daily' => array(), 'hourly' => array());
    if (!empty($j['current'])) {
      $c = $j['current'];
      $data['current'] = array(
        'time' => $c['time'], 'temp' => $c['temperature_2m'], 'feels' => $c['apparent_temperature'],
        'humidity' => $c['relative_humidity_2m'], 'code' => $c['weather_code'], 'wind' => $c['wind_speed_10m'], 'isDay' => !empty($c['is_day']),
      );
    }
    $d = isset($j['daily']) ? $j['daily'] : array();
    foreach ((isset($d['time']) ? $d['time'] : array()) as $i => $t) {
      $data['daily'][] = array('time' => $t, 'code' => $at($d, 'weather_code', $i), 'max' => $at($d, 'temperature_2m_max', $i), 'min' => $at($d, 'temperature_2m_min', $i),
        'rain' => $at($d, 'precipitation_probability_max', $i), 'sunrise' => $at($d, 'sunrise', $i), 'sunset' => $at($d, 'sunset', $i));
    }
    $hh = isset($j['hourly']) ? $j['hourly'] : array();
    foreach ((isset($hh['time']) ? $hh['time'] : array()) as $i => $t) {
      $data['hourly'][] = array('time' => $t, 'temp' => $at($hh, 'temperature_2m', $i), 'rain' => $at($hh, 'precipitation_probability', $i),
        'code' => $at($hh, 'weather_code', $i), 'wind' => $at($hh, 'wind_speed_10m', $i), 'isDay' => !empty($hh['is_day'][$i]));
    }
    set_transient($key, $data, self::WX_TTL);
    return $data;
  }
}
