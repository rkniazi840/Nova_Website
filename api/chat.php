<?php
/* ============================================
   NOVA Environmental Consulting — AI chat endpoint (PHP)
   POST /api/chat.php   ->  { "reply": "..." }

   This is the Hostinger / shared-hosting version of
   netlify/functions/chat.js. Same behaviour, no Node required.

   CONFIGURATION — pick ONE of these:

   1. Create api/config.php  (copy api/config.sample.php)
   2. Or put the same file OUTSIDE public_html as  ../nova-config.php
   3. Or set environment variables via .htaccess:
         SetEnv AI_PROVIDER gemini
         SetEnv GEMINI_API_KEY your-key-here

   If no key is found, this returns 503 and the website widget
   silently falls back to its built-in curated answers.
   ============================================ */

declare(strict_types=1);

const MAX_CHARS        = 1000;
const MAX_HISTORY      = 10;
const UPSTREAM_TIMEOUT = 20;    // seconds
const RATE_LIMIT       = 20;    // requests per IP
const RATE_WINDOW      = 60;    // per this many seconds

/* ------------------------------------------------------------------
   Configuration loading
   ------------------------------------------------------------------ */
$NOVA_CONFIG = [];
foreach ([
    __DIR__ . '/../../nova-config.php',   // ABOVE public_html  <- safest
    __DIR__ . '/../nova-config.php',      // public_html/nova-config.php
    __DIR__ . '/config.php',              // public_html/api/config.php
] as $candidate) {
    if (is_file($candidate)) {
        $loaded = require $candidate;
        if (is_array($loaded)) {
            $NOVA_CONFIG = $loaded;
            break;
        }
    }
}

function cfg(string $key, string $default = ''): string
{
    global $NOVA_CONFIG;
    if (isset($NOVA_CONFIG[$key]) && $NOVA_CONFIG[$key] !== '') {
        return (string) $NOVA_CONFIG[$key];
    }
    $env = getenv($key);
    if ($env !== false && $env !== '') {
        return (string) $env;
    }
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
        return (string) $_SERVER[$key];
    }
    return $default;
}

/* ------------------------------------------------------------------
   The assistant's instructions
   ------------------------------------------------------------------ */
const SYSTEM_PROMPT = <<<'PROMPT'
You are the NOVA AI Assistant on the website of NOVA Environmental Consulting,
an environmental and sustainability consultancy based in Doha, Qatar, working in
line with Qatar National Vision 2030.

SCOPE — answer questions about:
- Weather, climate and air quality (with a focus on Qatar and the Gulf)
- Traffic and transport trends; population and urbanisation trends
- Energy and water consumption trends; renewable energy trends
- Vegetation, green cover, biodiversity, desertification and land use
- Air traffic and aviation emissions
- Environmental projects, student assignments, research methods and report structure
- Environmental education, courses and professional certification in Qatar
- The UN Sustainable Development Goals and Qatar National Vision 2030
- Climate change, GHG accounting, waste, recycling, EIA/ESIA, ISO 14001/45001,
  GSAS/LEED green building, and ESG reporting
- NOVA's own services, and how to get in touch

STYLE:
- Be concise: 120 words or fewer unless the user asks for detail.
- Use short paragraphs, **bold** for key terms, and "- " bullets for lists.
- Plain English, professional but friendly.
- Reply in the same language the user writes in. If they write Roman Urdu
  (Urdu in Latin letters), reply in Roman Urdu using Urdu vocabulary — never
  substitute Hindi words such as "yogdaan", "vishay", "jankari" or "lakshya".

ACCURACY RULES — these matter:
- Never invent statistics, dates or figures. If you are not certain of a number,
  describe the trend qualitatively and say which organisation publishes the data.
- Never invent URLs or web addresses. The website automatically appends a list of
  verified source links below your answer, so you only need to name organisations
  (for example "the IEA", "Qatar Planning and Statistics Authority", "IRENA",
  "UN SDG portal", "Qatar Meteorology Department").
- When a block headed "LIVE DATA" appears at the top of the user's message, it was
  measured minutes ago and is accurate: use those exact figures to answer "right now"
  questions, state the observation time, and name the source given in the block.
  Add brief environmental context (heat stress, air-quality health advice) where useful.
- Without a LIVE DATA block you cannot look things up live, so for current weather,
  live air quality or today's figures, explain the trend and point the user to the
  official source.
- If a question is outside the scope above, politely redirect to environmental
  and sustainability topics, or to the NOVA contact page.
- Never give legal guarantees of regulatory approval; recommend a NOVA consultant
  for project-specific compliance advice.
PROMPT;

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */
function send_json(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** mbstring is not installed everywhere — fall back to plain substr. */
function safe_substr(string $text, int $start, int $length): string
{
    return function_exists('mb_substr')
        ? mb_substr($text, $start, $length)
        : substr($text, $start, $length);
}

function client_ip(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
        if (!empty($_SERVER[$key])) {
            $parts = explode(',', (string) $_SERVER[$key]);
            return trim($parts[0]);
        }
    }
    return 'unknown';
}

function rate_limited(string $ip): bool
{
    $file = rtrim(sys_get_temp_dir(), '/') . '/nova_ai_' . md5($ip) . '.json';
    $now  = time();
    $data = ['start' => $now, 'count' => 0];

    if (is_file($file)) {
        $raw     = @file_get_contents($file);
        $decoded = $raw ? json_decode($raw, true) : null;
        if (is_array($decoded) && isset($decoded['start'], $decoded['count'])
            && ($now - (int) $decoded['start']) < RATE_WINDOW) {
            $data = ['start' => (int) $decoded['start'], 'count' => (int) $decoded['count']];
        }
    }

    $data['count']++;
    @file_put_contents($file, json_encode($data), LOCK_EX);

    return $data['count'] > RATE_LIMIT;
}

/**
 * POST JSON and return [httpStatus, decodedBody, errorString].
 * Uses cURL when available, falls back to the stream wrapper.
 */
function post_json(string $url, array $headers, array $body): array
{
    $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_TIMEOUT        => UPSTREAM_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            return [0, null, $err !== '' ? $err : 'connection failed'];
        }
        return [$status, json_decode((string) $raw, true), ''];
    }

    // Fallback: allow_url_fopen
    $context = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => implode("\r\n", $headers),
            'content'       => $payload,
            'timeout'       => UPSTREAM_TIMEOUT,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $context);
    if ($raw === false) {
        return [0, null, 'connection failed (cURL and allow_url_fopen unavailable)'];
    }

    $status = 0;
    if (isset($http_response_header[0]) &&
        preg_match('#HTTP/\S+\s+(\d{3})#', $http_response_header[0], $m)) {
        $status = (int) $m[1];
    }
    return [$status, json_decode($raw, true), ''];
}

/* ------------------------------------------------------------------
   Live data — real current readings for "what is it right now" questions

   Source: Open-Meteo (https://open-meteo.com) — no API key required.
   NOTE ON LICENSING: Open-Meteo's free tier is intended for non-commercial
   use (fair-use limit ~10,000 calls/day). For a commercial site they offer a
   paid plan. To switch providers, replace the two URLs in live_context().
   Set LIVE_DATA => false in the config file to turn this feature off.
   ------------------------------------------------------------------ */
const LIVE_LAT      = 25.2854;   // Doha, Qatar
const LIVE_LON      = 51.5310;
const LIVE_PLACE    = 'Doha, Qatar';
const LIVE_TIMEOUT  = 6;         // seconds — keep the whole request snappy

function fetch_json_get(string $url): ?array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => LIVE_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $raw  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $code !== 200) return null;
        $d = json_decode((string) $raw, true);
        return is_array($d) ? $d : null;
    }

    $ctx = stream_context_create(['http' => [
        'method'        => 'GET',
        'timeout'       => LIVE_TIMEOUT,
        'ignore_errors' => true,
    ]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;
    $d = json_decode($raw, true);
    return is_array($d) ? $d : null;
}

/** WMO weather interpretation codes -> plain English. */
function wmo_description(int $code): string
{
    $map = [
        0 => 'Clear sky', 1 => 'Mainly clear', 2 => 'Partly cloudy', 3 => 'Overcast',
        45 => 'Fog', 48 => 'Depositing rime fog',
        51 => 'Light drizzle', 53 => 'Moderate drizzle', 55 => 'Dense drizzle',
        61 => 'Slight rain', 63 => 'Moderate rain', 65 => 'Heavy rain',
        71 => 'Slight snow', 73 => 'Moderate snow', 75 => 'Heavy snow',
        80 => 'Slight rain showers', 81 => 'Moderate rain showers', 82 => 'Violent rain showers',
        95 => 'Thunderstorm', 96 => 'Thunderstorm with slight hail', 99 => 'Thunderstorm with heavy hail',
    ];
    return $map[$code] ?? 'Unsettled conditions';
}

/** US AQI band -> health guidance. */
function aqi_band(int $aqi): string
{
    if ($aqi <= 50)  return 'Good';
    if ($aqi <= 100) return 'Moderate';
    if ($aqi <= 150) return 'Unhealthy for sensitive groups';
    if ($aqi <= 200) return 'Unhealthy';
    if ($aqi <= 300) return 'Very unhealthy';
    return 'Hazardous';
}

/**
 * If the question asks about current weather or air quality, fetch real
 * readings and return a context block to prepend to the user's message.
 * Returns '' when not relevant, disabled, or the lookup fails.
 */
function live_context(string $message): string
{
    if (strtolower(cfg('LIVE_DATA', 'true')) === 'false') return '';

    $m = ' ' . strtolower($message) . ' ';

    $weather = preg_match('/\b(weather|temperature|temp|hot|cold|humid|humidity|rain|wind|forecast|sunny|mausam|garmi|sardi|today|right now|currently|outside)\b/', $m);
    $air     = preg_match('/\b(air quality|aqi|pm2\.?5|pm10|pollution|polluted|smog|dust|breathe|particulate)\b/', $m);

    if (!$weather && !$air) return '';

    $lines = [];

    if ($weather) {
        $d = fetch_json_get(
            'https://api.open-meteo.com/v1/forecast?latitude=' . LIVE_LAT . '&longitude=' . LIVE_LON .
            '&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code' .
            '&timezone=Asia%2FQatar'
        );
        if (isset($d['current']['temperature_2m'])) {
            $c = $d['current'];
            $lines[] = 'Weather in ' . LIVE_PLACE . ' (source: Open-Meteo, observed ' . ($c['time'] ?? 'now') . ' Qatar time):';
            $lines[] = '  Temperature: ' . $c['temperature_2m'] . ' °C'
                     . (isset($c['apparent_temperature']) ? ' (feels like ' . $c['apparent_temperature'] . ' °C)' : '');
            if (isset($c['relative_humidity_2m'])) $lines[] = '  Humidity: ' . $c['relative_humidity_2m'] . '%';
            if (isset($c['wind_speed_10m']))       $lines[] = '  Wind: ' . $c['wind_speed_10m'] . ' km/h';
            if (isset($c['weather_code']))         $lines[] = '  Conditions: ' . wmo_description((int) $c['weather_code']);
        }
    }

    if ($air) {
        $d = fetch_json_get(
            'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' . LIVE_LAT . '&longitude=' . LIVE_LON .
            '&current=pm10,pm2_5,us_aqi&timezone=Asia%2FQatar'
        );
        if (isset($d['current']['us_aqi'])) {
            $c = $d['current'];
            $lines[] = 'Air quality in ' . LIVE_PLACE . ' (source: Open-Meteo, observed ' . ($c['time'] ?? 'now') . ' Qatar time):';
            $lines[] = '  US AQI: ' . $c['us_aqi'] . ' (' . aqi_band((int) $c['us_aqi']) . ')';
            if (isset($c['pm2_5'])) $lines[] = '  PM2.5: ' . $c['pm2_5'] . ' µg/m³';
            if (isset($c['pm10']))  $lines[] = '  PM10: ' . $c['pm10'] . ' µg/m³';
        }
    }

    if (!$lines) return '';

    return "LIVE DATA (measured minutes ago — treat these figures as current and accurate):\n"
        . implode("\n", $lines)
        . "\n\nUser's question follows.\n\n";
}

/* ------------------------------------------------------------------
   Providers
   ------------------------------------------------------------------ */
function ask_gemini(string $message, array $history): string
{
    return ask_gemini_with_model($message, $history, cfg('GEMINI_MODEL', 'gemini-3.1-flash-lite'));
}

function ask_gemini_with_model(string $message, array $history, string $model): string
{
    $key = cfg('GEMINI_API_KEY');

    $contents = [];
    foreach ($history as $turn) {
        $contents[] = [
            'role'  => $turn['role'] === 'assistant' ? 'model' : 'user',
            'parts' => [['text' => $turn['text']]],
        ];
    }
    $contents[] = ['role' => 'user', 'parts' => [['text' => $message]]];

    [$status, $data, $err] = post_json(
        'https://generativelanguage.googleapis.com/v1beta/models/' .
            rawurlencode($model) . ':generateContent',
        ['Content-Type: application/json', 'x-goog-api-key: ' . $key],
        [
            'system_instruction' => ['parts' => [['text' => SYSTEM_PROMPT]]],
            'contents'           => $contents,
            'generationConfig'   => ['maxOutputTokens' => 700],
        ]
    );

    // Google retires models over time. If the configured one is gone,
    // fall back once to the always-current alias so the site keeps working.
    if ($status === 404 && $model !== 'gemini-flash-lite-latest') {
        error_log('[nova-ai] model "' . $model . '" unavailable, falling back to gemini-flash-lite-latest');
        return ask_gemini_with_model($message, $history, 'gemini-flash-lite-latest');
    }

    if ($err !== '')      throw new RuntimeException('Gemini: ' . $err);
    if ($status !== 200)  throw new RuntimeException('Gemini ' . $status . ': ' .
        ($data['error']['message'] ?? 'request failed'));

    $parts = $data['candidates'][0]['content']['parts'] ?? null;
    if (!is_array($parts)) throw new RuntimeException('Gemini returned no content');

    $text = '';
    foreach ($parts as $part) {
        $text .= $part['text'] ?? '';
    }
    $text = trim($text);
    if ($text === '') throw new RuntimeException('Gemini returned empty text');

    return $text;
}

function ask_claude(string $message, array $history): string
{
    $key   = cfg('CLAUDE_API_KEY');
    $model = cfg('CLAUDE_MODEL', 'claude-haiku-5-5');

    $messages = [];
    foreach ($history as $turn) {
        $messages[] = [
            'role'    => $turn['role'] === 'assistant' ? 'assistant' : 'user',
            'content' => $turn['text'],
        ];
    }
    $messages[] = ['role' => 'user', 'content' => $message];

    [$status, $data, $err] = post_json(
        'https://api.anthropic.com/v1/messages',
        [
            'Content-Type: application/json',
            'x-api-key: ' . $key,
            'anthropic-version: 2023-06-01',
        ],
        [
            'model'      => $model,
            'max_tokens' => 700,
            'system'     => SYSTEM_PROMPT,
            'messages'   => $messages,
        ]
    );

    if ($err !== '')      throw new RuntimeException('Claude: ' . $err);
    if ($status !== 200)  throw new RuntimeException('Claude ' . $status . ': ' .
        ($data['error']['message'] ?? 'request failed'));

    $text = '';
    foreach (($data['content'] ?? []) as $block) {
        if (($block['type'] ?? '') === 'text') {
            $text .= $block['text'] ?? '';
        }
    }
    $text = trim($text);
    if ($text === '') throw new RuntimeException('Claude returned no text');

    return $text;
}

/* ------------------------------------------------------------------
   Request handling
   ------------------------------------------------------------------ */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    send_json(204, []);
}
if ($method !== 'POST') {
    send_json(405, ['error' => 'Method not allowed']);
}

if (rate_limited(client_ip())) {
    send_json(429, ['error' => 'Too many requests. Please wait a moment and try again.']);
}

$raw     = file_get_contents('php://input') ?: '';
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    send_json(400, ['error' => 'Invalid JSON body']);
}

$message = isset($payload['message']) && is_string($payload['message'])
    ? trim($payload['message'])
    : '';
if ($message === '') {
    send_json(400, ['error' => 'A "message" field is required']);
}
$message = safe_substr($message, 0, MAX_CHARS);

$history = [];
if (isset($payload['history']) && is_array($payload['history'])) {
    foreach ($payload['history'] as $turn) {
        if (!is_array($turn) || !isset($turn['text']) || !is_string($turn['text'])) continue;
        if (trim($turn['text']) === '') continue;
        $history[] = [
            'role' => (($turn['role'] ?? '') === 'assistant') ? 'assistant' : 'user',
            'text' => safe_substr($turn['text'], 0, MAX_CHARS),
        ];
    }
}
$history = array_slice($history, -MAX_HISTORY);

// A conversation sent to the model must start with a user turn.
while (!empty($history) && $history[0]['role'] !== 'user') {
    array_shift($history);
}
$history = array_values($history);

$provider = strtolower(cfg('AI_PROVIDER', 'gemini'));
$hasKey   = $provider === 'claude' ? cfg('CLAUDE_API_KEY') !== '' : cfg('GEMINI_API_KEY') !== '';

if (!$hasKey) {
    // Widget falls back to its built-in curated answers.
    send_json(503, ['error' => 'AI provider is not configured on this site yet.']);
}

// For "what is it right now" questions, attach real current readings.
$prompt = live_context($message) . $message;

try {
    $reply = $provider === 'claude'
        ? ask_claude($prompt, $history)
        : ask_gemini($prompt, $history);

    send_json(200, ['reply' => $reply, 'provider' => $provider]);
} catch (Throwable $e) {
    error_log('[nova-ai] ' . $e->getMessage());
    send_json(502, ['error' => 'The assistant is unavailable right now.']);
}
