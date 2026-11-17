/* ============================================
   NOVA Environmental Consulting — AI chat endpoint
   POST /.netlify/functions/chat   ->  { reply: "..." }

   Provider is switchable with one environment variable.
   No npm dependencies: uses the runtime's built-in fetch (Node 18+).

   Environment variables (set in Netlify > Site settings > Environment variables)
   ---------------------------------------------------------------------------
   AI_PROVIDER     "gemini" (default, has a free tier) or "claude"
   GEMINI_API_KEY  required when AI_PROVIDER=gemini
   GEMINI_MODEL    optional, default "gemini-3.1-flash-lite"
   CLAUDE_API_KEY  required when AI_PROVIDER=claude
   CLAUDE_MODEL    optional, default "claude-haiku-5-5"

   If no key is configured the function returns 503 and the website widget
   silently falls back to its built-in curated answers.
   ============================================ */

'use strict';

var MAX_CHARS       = 1000;
var MAX_HISTORY     = 10;
var UPSTREAM_TIMEOUT = 9000;   // stay inside Netlify's 10s function limit
var RATE_LIMIT      = 20;      // requests per IP
var RATE_WINDOW     = 60000;   // per minute

var SYSTEM_PROMPT = [
  'You are the NOVA AI Assistant on the website of NOVA Environmental Consulting,',
  'an environmental and sustainability consultancy based in Doha, Qatar, working in',
  'line with Qatar National Vision 2030.',
  '',
  'SCOPE — answer questions about:',
  '- Weather, climate and air quality (with a focus on Qatar and the Gulf)',
  '- Traffic and transport trends; population and urbanisation trends',
  '- Energy and water consumption trends; renewable energy trends',
  '- Vegetation, green cover, biodiversity, desertification and land use',
  '- Air traffic and aviation emissions',
  '- Environmental projects, student assignments, research methods and report structure',
  '- Environmental education, courses and professional certification in Qatar',
  '- The UN Sustainable Development Goals and Qatar National Vision 2030',
  '- Climate change, GHG accounting, waste, recycling, EIA/ESIA, ISO 14001/45001,',
  '  GSAS/LEED green building, and ESG reporting',
  '- NOVA\'s own services, and how to get in touch',
  '',
  'STYLE:',
  '- Be concise: 120 words or fewer unless the user asks for detail.',
  '- Use short paragraphs, **bold** for key terms, and "- " bullets for lists.',
  '- Plain English, professional but friendly.',
  '- Reply in the same language the user writes in. If they write Roman Urdu',
  '  (Urdu in Latin letters), reply in Roman Urdu using Urdu vocabulary — never',
  '  substitute Hindi words such as "yogdaan", "vishay", "jankari" or "lakshya".',
  '',
  'ACCURACY RULES — these matter:',
  '- Never invent statistics, dates or figures. If you are not certain of a number,',
  '  describe the trend qualitatively and say which organisation publishes the data.',
  '- Never invent URLs or web addresses. The website automatically appends a list of',
  '  verified source links below your answer, so you only need to name organisations',
  '  (for example "the IEA", "Qatar Planning and Statistics Authority", "IRENA",',
  '  "UN SDG portal", "Qatar Meteorology Department").',
  '- When a block headed "LIVE DATA" appears at the top of the user\'s message, it was',
  '  measured minutes ago and is accurate: use those exact figures to answer "right now"',
  '  questions, state the observation time, and name the source given in the block.',
  '  Add brief environmental context (heat stress, air-quality health advice) where useful.',
  '- Without a LIVE DATA block you cannot look things up live, so for current weather,',
  '  live air quality or today\'s figures, explain the trend and point the user to the',
  '  official source.',
  '- If a question is outside the scope above, politely redirect to environmental',
  '  and sustainability topics, or to the NOVA contact page.',
  '- Never give legal guarantees of regulatory approval; recommend a NOVA consultant',
  '  for project-specific compliance advice.'
].join('\n');

/* --- Very small best-effort rate limiter (per warm instance) --- */
var hits = Object.create(null);

function rateLimited(ip) {
  var now = Date.now();
  var rec = hits[ip];
  if (!rec || now - rec.start > RATE_WINDOW) {
    hits[ip] = { start: now, count: 1 };
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

function fetchWithTimeout(url, options) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, UPSTREAM_TIMEOUT);
  options.signal = controller.signal;
  return fetch(url, options).finally(function () { clearTimeout(timer); });
}

/* ------------------------------------------------------------------
   Live data — real current readings for "what is it right now" questions

   Source: Open-Meteo (https://open-meteo.com) — no API key required.
   NOTE ON LICENSING: Open-Meteo's free tier is intended for non-commercial
   use (fair-use limit ~10,000 calls/day). For a commercial site they offer a
   paid plan. To switch providers, replace the two URLs in liveContext().
   Set LIVE_DATA=false in the environment to turn this feature off.
   ------------------------------------------------------------------ */
var LIVE_LAT     = 25.2854;   // Doha, Qatar
var LIVE_LON     = 51.5310;
var LIVE_PLACE   = 'Doha, Qatar';
var LIVE_TIMEOUT = 6000;

var WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
};

function aqiBand(aqi) {
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

async function getJson(url) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, LIVE_TIMEOUT);
  try {
    var res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function liveContext(message) {
  if (String(process.env.LIVE_DATA || 'true').toLowerCase() === 'false') return '';

  var m = ' ' + message.toLowerCase() + ' ';
  var wantsWeather = /\b(weather|temperature|temp|hot|cold|humid|humidity|rain|wind|forecast|sunny|mausam|garmi|sardi|today|right now|currently|outside)\b/.test(m);
  var wantsAir     = /\b(air quality|aqi|pm2\.?5|pm10|pollution|polluted|smog|dust|breathe|particulate)\b/.test(m);
  if (!wantsWeather && !wantsAir) return '';

  var lines = [];

  if (wantsWeather) {
    var w = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + LIVE_LAT +
      '&longitude=' + LIVE_LON +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code' +
      '&timezone=Asia%2FQatar');
    if (w && w.current && w.current.temperature_2m !== undefined) {
      var c = w.current;
      lines.push('Weather in ' + LIVE_PLACE + ' (source: Open-Meteo, observed ' + (c.time || 'now') + ' Qatar time):');
      lines.push('  Temperature: ' + c.temperature_2m + ' \u00b0C' +
        (c.apparent_temperature !== undefined ? ' (feels like ' + c.apparent_temperature + ' \u00b0C)' : ''));
      if (c.relative_humidity_2m !== undefined) lines.push('  Humidity: ' + c.relative_humidity_2m + '%');
      if (c.wind_speed_10m !== undefined)       lines.push('  Wind: ' + c.wind_speed_10m + ' km/h');
      if (c.weather_code !== undefined)         lines.push('  Conditions: ' + (WMO[c.weather_code] || 'Unsettled conditions'));
    }
  }

  if (wantsAir) {
    var a = await getJson('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + LIVE_LAT +
      '&longitude=' + LIVE_LON + '&current=pm10,pm2_5,us_aqi&timezone=Asia%2FQatar');
    if (a && a.current && a.current.us_aqi !== undefined) {
      var q = a.current;
      lines.push('Air quality in ' + LIVE_PLACE + ' (source: Open-Meteo, observed ' + (q.time || 'now') + ' Qatar time):');
      lines.push('  US AQI: ' + q.us_aqi + ' (' + aqiBand(q.us_aqi) + ')');
      if (q.pm2_5 !== undefined) lines.push('  PM2.5: ' + q.pm2_5 + ' \u00b5g/m\u00b3');
      if (q.pm10  !== undefined) lines.push('  PM10: '  + q.pm10  + ' \u00b5g/m\u00b3');
    }
  }

  if (!lines.length) return '';

  return 'LIVE DATA (measured minutes ago \u2014 treat these figures as current and accurate):\n' +
    lines.join('\n') + '\n\nUser\'s question follows.\n\n';
}

/* --- Google Gemini (free tier available) --- */
async function askGemini(message, history) {
  return askGeminiWithModel(message, history,
    process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite');
}

async function askGeminiWithModel(message, history, model) {
  var key = process.env.GEMINI_API_KEY;

  var contents = history.map(function (m) {
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] };
  });
  contents.push({ role: 'user', parts: [{ text: message }] });

  var res = await fetchWithTimeout(
    'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 700 }
      })
    }
  );

  var data = await res.json().catch(function () { return null; });

  // Google retires models over time. If the configured one is gone,
  // fall back once to the always-current alias so the site keeps working.
  if (res.status === 404 && model !== 'gemini-flash-lite-latest') {
    console.error('[nova-ai] model "' + model + '" unavailable, falling back');
    return askGeminiWithModel(message, history, 'gemini-flash-lite-latest');
  }

  if (!res.ok) {
    throw new Error('Gemini ' + res.status + ': ' +
      (data && data.error && data.error.message ? data.error.message : 'request failed'));
  }

  var parts = data && data.candidates && data.candidates[0] &&
              data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts) throw new Error('Gemini returned no content');

  return parts.map(function (p) { return p.text || ''; }).join('').trim();
}

/* --- Anthropic Claude (paid) --- */
async function askClaude(message, history) {
  var key   = process.env.CLAUDE_API_KEY;
  var model = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

  var messages = history.map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text };
  });
  messages.push({ role: 'user', content: message });

  var res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: messages
    })
  });

  var data = await res.json().catch(function () { return null; });
  if (!res.ok) {
    throw new Error('Claude ' + res.status + ': ' +
      (data && data.error && data.error.message ? data.error.message : 'request failed'));
  }

  var text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('')
    .trim();

  if (!text) throw new Error('Claude returned no text');
  return text;
}

/* --- Handler --- */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Method not allowed' });

  var ip = (event.headers && (event.headers['x-nf-client-connection-ip'] ||
            (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';

  if (rateLimited(ip)) {
    return json(429, { error: 'Too many requests. Please wait a moment and try again.' });
  }

  var payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Invalid JSON body' });
  }

  var message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) return json(400, { error: 'A "message" field is required' });
  message = message.slice(0, MAX_CHARS);

  var history = Array.isArray(payload.history) ? payload.history : [];
  history = history
    .filter(function (m) { return m && typeof m.text === 'string' && m.text.trim(); })
    .slice(-MAX_HISTORY)
    .map(function (m) {
      return { role: m.role === 'assistant' ? 'assistant' : 'user', text: m.text.slice(0, MAX_CHARS) };
    });

  // A conversation sent to the model must start with a user turn.
  while (history.length && history[0].role !== 'user') history.shift();

  var provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  var hasKey = provider === 'claude' ? !!process.env.CLAUDE_API_KEY : !!process.env.GEMINI_API_KEY;

  if (!hasKey) {
    // Widget falls back to its built-in curated answers.
    return json(503, { error: 'AI provider is not configured on this site yet.' });
  }

  // For "what is it right now" questions, attach real current readings.
  var prompt = (await liveContext(message)) + message;

  try {
    var reply = provider === 'claude'
      ? await askClaude(prompt, history)
      : await askGemini(prompt, history);

    return json(200, { reply: reply, provider: provider });
  } catch (err) {
    console.error('[nova-ai]', err && err.message ? err.message : err);
    var aborted = err && err.name === 'AbortError';
    return json(aborted ? 504 : 502, {
      error: aborted ? 'The assistant took too long to respond.' : 'The assistant is unavailable right now.'
    });
  }
};
