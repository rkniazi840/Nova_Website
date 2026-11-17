<?php
/* ============================================
   NOVA AI Assistant — configuration

   HOW TO USE
   1. Copy this file and rename the copy to  config.php
      (same folder:  api/config.php)
   2. Paste your API key below.
   3. Upload it. Done — no other file needs changing.

   SAFER OPTION (recommended if you can reach it in File Manager):
   put the renamed file one level ABOVE public_html instead, named
   nova-config.php — chat.php looks there first.

   chat.php looks in these three places, in this order:

        /domains/yourdomain.com/nova-config.php              <-- safest
        /domains/yourdomain.com/public_html/nova-config.php
        /domains/yourdomain.com/public_html/api/config.php   <-- easiest

   NEVER commit the real config.php to git. It is already in .gitignore.
   ============================================ */

return [

    // 'gemini'  = Google Gemini  (has a free tier — recommended to start)
    // 'claude'  = Anthropic Claude (paid, higher quality)
    'AI_PROVIDER'    => 'gemini',

    // Get a free key at: https://aistudio.google.com/apikey
    'GEMINI_API_KEY' => '',

    // Optional — leave as is unless you know you want a different model
    'GEMINI_MODEL'   => 'gemini-3.1-flash-lite',

    // Live weather + air quality for Doha (source: Open-Meteo, no key needed).
    // Set to 'false' to turn it off — the assistant then explains trends and
    // points users to the Qatar Meteorology Department instead.
    // NOTE: Open-Meteo's free tier is meant for non-commercial use; they sell
    // a commercial plan. See the comment at the top of api/chat.php.
    'LIVE_DATA'      => 'true',

    // Only needed when AI_PROVIDER is 'claude'
    // Get a key at: https://console.anthropic.com
    'CLAUDE_API_KEY' => '',
    'CLAUDE_MODEL'   => 'claude-haiku-5-5',

];
