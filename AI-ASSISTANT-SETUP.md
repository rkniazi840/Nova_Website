# NOVA "Ask AI Assistant" — Setup Guide

A floating **Ask AI Assistant** button appears on every page. Clicking it opens a chat
panel that answers questions about weather and climate, air quality, traffic, population,
energy and renewables, vegetation, air traffic, environmental projects and assignments,
environmental education in Qatar, and the UN Sustainable Development Goals — and shows a
verified **"Explore more"** link list with every answer.

---

## Files

| File | Purpose |
|---|---|
| `js/ai-assistant.js` | The widget: launcher, chat panel, curated knowledge base, link library |
| `api/chat.php` | **Hostinger / shared hosting** backend (PHP) |
| `api/config.sample.php` | Template — copy to `api/config.php` and paste your key |
| `netlify/functions/chat.js` | **Netlify** backend (Node). Not used on Hostinger. |
| `netlify.toml` | Netlify-only config. Harmless elsewhere. |
| `css/style.css` | Widget styles are appended at the end of the file |

The widget automatically detects which backend exists — it tries `api/chat.php` first,
then the Netlify function. No code changes are needed when you switch hosts.

---

## Live weather & air quality

Questions like *"what is the weather right now?"* or *"how is the air quality today?"*
are answered with **real current readings for Doha**, fetched at request time from
[Open-Meteo](https://open-meteo.com) (no API key needed). The assistant states the
observation time and names the source, then adds environmental context such as heat
stress or air-quality health advice.

The lookup only runs for weather/air-quality questions, so other answers stay fast.
If the lookup fails the assistant falls back to explaining trends — nothing breaks.

**Licensing:** Open-Meteo's free tier is intended for non-commercial use (fair-use
limit ~10,000 calls/day); they offer a paid commercial plan. For a commercial site,
either take their commercial plan or swap the two URLs in `live_context()`
(`api/chat.php`) / `liveContext()` (`netlify/functions/chat.js`) for another provider.
To switch the feature off entirely, set `LIVE_DATA` to `'false'` in `api/config.php`
(or `LIVE_DATA=false` in Netlify's environment variables).

Location is set near the top of the live-data section in each backend
(`LIVE_LAT` / `LIVE_LON` / `LIVE_PLACE`), currently Doha.

## It already works with no API key

If no API key is configured, the widget answers from the **built-in curated knowledge base**
in `js/ai-assistant.js` (15 topics, all with verified source links). Nothing breaks, nothing
costs anything. Adding a key simply upgrades it to real, open-ended AI answers.

---

# Deploying to Hostinger

Hostinger shared hosting runs **PHP**, not Node — so `api/chat.php` is the backend there.

## Step 1 — Upload the site

**Option A: hPanel File Manager**

1. hPanel → **Files → File Manager**
2. Open `public_html`
3. Upload these, keeping the folder structure exactly:

```
public_html/
├── index.html
├── robots.txt
├── sitemap.xml
├── css/style.css
├── js/main.js
├── js/ai-assistant.js
├── images/...
├── pages/...
└── api/chat.php
```

You do **not** need to upload `netlify/`, `netlify.toml`, `.netlify/`, or this guide.

**Option B: Git deployment (recommended)**

hPanel → **Advanced → GIT** → add your repository and branch, set the
install path to `public_html`, then click **Deploy**.

## Step 2 — Check it works without a key

Open your domain. The **Ask AI Assistant** pill should appear bottom-right and answer
from the built-in knowledge base. If you see it, the deployment is good.

## Step 3 — Turn on real AI (optional, free)

1. Get a free key at **https://aistudio.google.com/apikey**
2. In File Manager, copy `api/config.sample.php` → rename the copy to `api/config.php`
3. Edit it and paste the key:

```php
return [
    'AI_PROVIDER'    => 'gemini',
    'GEMINI_API_KEY' => 'AIza....your-key....',
    'GEMINI_MODEL'   => 'gemini-3.1-flash-lite',
];
```

4. Save. No restart or redeploy is needed — PHP picks it up on the next request.

**Safer placement:** instead of `public_html/api/config.php`, put the same file one level
above `public_html` and name it `nova-config.php`. `chat.php` looks there first, and
nothing above `public_html` is reachable from the web.

### Switching to Claude later

In the same config file:

```php
'AI_PROVIDER'    => 'claude',
'CLAUDE_API_KEY' => 'sk-ant-....',
'CLAUDE_MODEL'   => 'claude-haiku-5-5',
```

Cost on Claude Haiku 5.5 is roughly **$0.25 per 1,000 chat messages**.

## Hostinger troubleshooting

| Symptom | Cause / fix |
|---|---|
| Widget answers, but only the 15 built-in topics | No key yet, or the key is wrong — check `api/config.php` |
| 500 error on `/api/chat.php` | PHP version too old. hPanel → **Advanced → PHP Configuration** → select **PHP 8.0+** |
| "connection failed" in the error log | Outbound HTTPS is blocked. Enable `allow_url_fopen` in PHP Configuration, or contact Hostinger support |
| Nothing happens when clicking the pill | `js/ai-assistant.js` did not upload, or the path is wrong — check the browser console (F12) |

To see errors: hPanel → **Files → File Manager** → `public_html/error_log`.

---

# Deploying to Netlify (alternative)

Push the repo, then set **Site settings → Environment variables**:

| Variable | Value |
|---|---|
| `AI_PROVIDER` | `gemini` or `claude` |
| `GEMINI_API_KEY` | your free key from https://aistudio.google.com/apikey |
| `CLAUDE_API_KEY` | only if using Claude |

Then **Deploys → Trigger deploy**.

---

# Local testing

```bash
# Static only — widget uses the built-in knowledge base
cd Nova_Website
python3 -m http.server 8090
# open http://localhost:8090

# With the PHP backend (same as Hostinger)
php -S localhost:8090
# open http://localhost:8090   (needs php-cli installed)

# With the Netlify function
netlify dev
```

---

# Editing the answers and links

All at the top of `js/ai-assistant.js`:

- `R` — the resource library (`label` + `url` for every external site)
- `KB` — the topics: `k` = trigger keywords, `a` = the answer, `l` = which resources to show
- `CHIPS` — the suggested-question buttons shown on open
- `GREETING` — the first message

The AI's instructions (tone, scope, accuracy rules) live in `SYSTEM_PROMPT`, which exists
in **both** `api/chat.php` and `netlify/functions/chat.js` — edit whichever backend you use.

---

# Security notes

- The API key lives only in `api/config.php` (or Netlify env vars) — **never** in the browser.
- `api/config.php` and `nova-config.php` are in `.gitignore` and must never be committed.
- The endpoint rejects non-POST requests, caps messages at 1,000 characters, and
  rate-limits to 20 requests per minute per visitor.
- The model is instructed never to invent URLs or statistics — the "Explore more" links
  always come from the verified list in `js/ai-assistant.js`.
- Every answer carries a visible disclaimer linking to the contact page.
