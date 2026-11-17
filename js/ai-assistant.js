/* ============================================
   NOVA Environmental Consulting
   "Ask AI Assistant" chat widget

   - Talks to /.netlify/functions/chat (provider-switchable: Gemini / Claude)
   - If no API is configured or the call fails, it falls back to the built-in
     curated knowledge base below, so the widget NEVER looks broken.
   ============================================ */

(function () {
  'use strict';

  var MAX_HISTORY = 10;
  var MAX_CHARS   = 1000;

  // Relative prefix so internal links work from / and from /pages/
  var BASE = window.location.pathname.indexOf('/pages/') !== -1 ? '../' : '';

  // Backend candidates, tried in order. The first one that answers is
  // remembered for the rest of the session.
  //   api/chat.php              -> Hostinger / any PHP shared hosting
  //   /.netlify/functions/chat  -> Netlify
  var ENDPOINTS = [BASE + 'api/chat.php', '/.netlify/functions/chat'];
  var activeEndpoint = null;

  /* ------------------------------------------------------------------
     1. Resource library — vetted external sources
     ------------------------------------------------------------------ */
  var R = {
    // --- Qatar ---
    psa:       { label: 'Qatar Planning & Statistics Authority',   url: 'https://www.psa.gov.qa' },
    mecc:      { label: 'Ministry of Environment & Climate Change', url: 'https://www.mecc.gov.qa' },
    qweather:  { label: 'Qatar Meteorology Department',            url: 'https://qweather.gov.qa' },
    kahramaa:  { label: 'KAHRAMAA — Electricity & Water',          url: 'https://www.km.qa' },
    ashghal:   { label: 'Ashghal — Public Works Authority',        url: 'https://www.ashghal.gov.qa' },
    mot:       { label: 'Ministry of Transport, Qatar',            url: 'https://www.mot.gov.qa' },
    hia:       { label: 'Hamad International Airport',             url: 'https://dohahamadairport.com' },
    gord:      { label: 'GORD — GSAS green building (Qatar)',      url: 'https://www.gord.qa' },
    qeeri:     { label: 'QEERI — Qatar Environment & Energy Research Institute', url: 'https://www.hbku.edu.qa/en/qeeri' },
    qu:        { label: 'Qatar University',                        url: 'https://www.qu.edu.qa' },
    earthna:   { label: 'Earthna — Centre for a Sustainable Future', url: 'https://earthna.qa' },
    qgbc:      { label: 'Qatar Green Building Council',            url: 'https://www.qatargbc.org' },

    // --- Global ---
    sdg:       { label: 'UN Sustainable Development Goals',        url: 'https://sdgs.un.org/goals' },
    sdgreport: { label: 'UN SDG Progress Reports',                 url: 'https://unstats.un.org/sdgs/report/2025/' },
    unep:      { label: 'UN Environment Programme (UNEP)',         url: 'https://www.unep.org' },
    iea:       { label: 'International Energy Agency (IEA)',       url: 'https://www.iea.org' },
    irena:     { label: 'IRENA — Renewable Energy Agency',         url: 'https://www.irena.org' },
    owid:      { label: 'Our World in Data',                       url: 'https://ourworldindata.org' },
    wb:        { label: 'World Bank Open Data',                    url: 'https://data.worldbank.org' },
    nasa:      { label: 'NASA Earthdata',                          url: 'https://www.earthdata.nasa.gov' },
    gfw:       { label: 'Global Forest Watch',                     url: 'https://www.globalforestwatch.org' },
    ipcc:      { label: 'IPCC — Climate Science Reports',          url: 'https://www.ipcc.ch' },
    iqair:     { label: 'IQAir — Live Air Quality',                url: 'https://www.iqair.com' },
    cw:        { label: 'Climate Watch — Emissions Data',          url: 'https://www.climatewatchdata.org' },
    wmo:       { label: 'World Meteorological Organization',       url: 'https://wmo.int' },
    icao:      { label: 'ICAO — Aviation & Environment',           url: 'https://www.icao.int/environmental-protection' },
    iata:      { label: 'IATA — Aviation Sustainability',          url: 'https://www.iata.org/en/programs/sustainability/' },
    unpop:     { label: 'UN World Population Prospects',           url: 'https://population.un.org/wpp/' },
    fao:       { label: 'FAO — Food & Agriculture Organization',   url: 'https://www.fao.org' },
    fr24:      { label: 'Flightradar24 — Live Air Traffic',        url: 'https://www.flightradar24.com' },
    ember:     { label: 'Ember — Global Electricity Data',         url: 'https://ember-energy.org' },

    // --- Internal ---
    services:  { label: 'NOVA Services',  url: BASE + 'pages/services.html' },
    research:  { label: 'NOVA Research',  url: BASE + 'pages/research.html' },
    blogs:     { label: 'NOVA Blog',      url: BASE + 'pages/blogs.html' },
    contact:   { label: 'Contact NOVA',   url: BASE + 'pages/contact.html' },
    about:     { label: 'About NOVA',     url: BASE + 'pages/about.html' }
  };

  /* ------------------------------------------------------------------
     2. Offline knowledge base (fallback when no AI API is reachable)
     ------------------------------------------------------------------ */
  var KB = [
    {
      k: ['weather', 'mausam', 'climate of qatar', 'temperature', 'humidity', 'rainfall', 'forecast', 'heat', 'summer', 'sandstorm', 'dust storm'],
      a: '**Weather & climate in Qatar**\n\nQatar has a hot desert climate: very hot, humid summers (May–September) and mild winters (December–February), with low and irregular rainfall concentrated in the winter months. Summer heat stress is a major occupational-health factor, which is why heat-stress planning is part of environmental and HSE work here.\n\nFor live forecasts and official records use the Qatar Meteorology Department; for long-term climate trends and projections use WMO and the IPCC reports.',
      l: ['qweather', 'wmo', 'ipcc', 'nasa']
    },
    {
      k: ['air quality', 'air pollution', 'pm2.5', 'pm10', 'aqi', 'smog', 'particulate', 'dust'],
      a: '**Air quality**\n\nAir quality is usually reported as an AQI built from PM2.5, PM10, NO₂, SO₂, O₃ and CO. In the Gulf region, natural dust is a large contributor to particulate levels alongside traffic and industrial sources.\n\nNOVA carries out ambient air and emissions monitoring as part of environmental reporting and compliance work.',
      l: ['iqair', 'mecc', 'unep', 'services']
    },
    {
      k: ['traffic', 'transport', 'vehicle', 'road', 'congestion', 'metro', 'commute', 'mobility', 'ev', 'electric vehicle', 'bus'],
      a: '**Traffic & transport trends**\n\nTransport is one of the largest sources of urban emissions. Qatar has invested heavily in shifting that curve — the Doha Metro, an expanding electric bus fleet, and road-network upgrades all aim to cut per-capita vehicle emissions while the population grows.\n\nKey indicators to watch: registered vehicles per 1,000 people, public-transport ridership, EV share of new registrations, and transport-sector CO₂.',
      l: ['mot', 'ashghal', 'psa', 'owid']
    },
    {
      k: ['population', 'demographic', 'census', 'residents', 'urbanisation', 'urbanization', 'growth rate', 'migration'],
      a: '**Population trends**\n\nQatar\'s population is highly urbanised and concentrated in the Doha metropolitan area, with a large expatriate majority that makes the total population unusually sensitive to construction and project cycles.\n\nPopulation growth drives demand for water, electricity, housing and waste services — so it is a core input to every environmental impact assessment and utility forecast.',
      l: ['psa', 'unpop', 'wb', 'owid']
    },
    {
      k: ['energy consumption', 'electricity', 'power', 'demand', 'grid', 'desalination', 'water consumption', 'per capita energy', 'natural gas', 'lng'],
      a: '**Energy & water consumption**\n\nQatar\'s electricity is generated overwhelmingly from natural gas, and a large share of it goes into cooling and into desalination — which makes water and energy consumption tightly linked here.\n\nKAHRAMAA\'s Tarsheed national conservation programme targets exactly this: reducing per-capita electricity and water use. For national figures use KAHRAMAA and PSA; for international comparison use the IEA and Our World in Data.',
      l: ['kahramaa', 'psa', 'iea', 'ember']
    },
    {
      k: ['renewable', 'solar', 'wind', 'clean energy', 'pv', 'green energy', 'al kharsaah', 'energy transition', 'net zero'],
      a: '**Renewable energy trends**\n\nSolar PV and wind are now the cheapest sources of new electricity in most markets, and global capacity additions keep setting records. In Qatar the flagship project is the Al Kharsaah solar PV plant, followed by further utility-scale solar and large rooftop/solar programmes tied to the National Climate Change Action Plan.\n\nIRENA publishes annual capacity statistics and the IEA tracks investment and cost trends.',
      l: ['irena', 'iea', 'kahramaa', 'ember']
    },
    {
      k: ['vegetation', 'green cover', 'ndvi', 'forest', 'mangrove', 'tree', 'landscaping', 'desertification', 'soil', 'afforestation', 'biodiversity'],
      a: '**Vegetation & green cover**\n\nVegetation trends are tracked with satellite indices such as NDVI (from Landsat and Sentinel data). In arid countries the focus is on mangroves, coastal habitats, protected reserves, urban landscaping and halting desertification rather than on forest cover.\n\nQatar\'s mangroves — notably around Al Thakira and Al Khor — are important carbon sinks and nursery habitats, and are commonly surveyed in ecological baseline studies.',
      l: ['gfw', 'nasa', 'fao', 'mecc']
    },
    {
      k: ['air traffic', 'aviation', 'airport', 'flight', 'airline', 'saf', 'passenger traffic', 'corsia', 'jet fuel'],
      a: '**Air traffic & aviation emissions**\n\nGlobal air traffic has recovered past pre-pandemic levels and keeps growing, which puts aviation emissions under close scrutiny. The industry levers are Sustainable Aviation Fuel (SAF), fleet renewal, operational efficiency and offsetting under ICAO\'s CORSIA scheme.\n\nHamad International Airport is one of the world\'s major hubs, so aviation is a meaningful part of Qatar\'s emissions profile and its green-airport initiatives.',
      l: ['icao', 'iata', 'hia', 'fr24']
    },
    {
      k: ['sdg', 'sustainable development goal', 'un goal', 'agenda 2030', 'global goals', '17 goals'],
      a: '**UN Sustainable Development Goals (SDGs)**\n\nThe 17 SDGs, adopted in 2015, run to 2030 and are measured through 169 targets and a global indicator framework. The ones most relevant to environmental consulting are:\n\n- **SDG 6** — Clean Water & Sanitation\n- **SDG 7** — Affordable & Clean Energy\n- **SDG 11** — Sustainable Cities & Communities\n- **SDG 12** — Responsible Consumption & Production\n- **SDG 13** — Climate Action\n- **SDG 14 & 15** — Life Below Water / Life on Land\n\nQatar National Vision 2030 maps closely onto these, especially its Environmental Development pillar.',
      l: ['sdg', 'sdgreport', 'psa', 'unep']
    },
    {
      k: ['education', 'university', 'course', 'study', 'degree', 'training', 'learn', 'school', 'student', 'scholarship', 'nebosh', 'iso 14001 training', 'certification course'],
      a: '**Environmental education & training in Qatar**\n\nQatar has a strong base for environmental study: Qatar University offers environmental science and engineering programmes, QEERI (part of Hamad Bin Khalifa University) runs applied energy and water research, and Earthna at Qatar Foundation focuses on sustainability policy for hot, arid states.\n\nOn the professional side, the common credentials are **ISO 14001** (environmental management), **ISO 45001** (occupational health & safety), **NEBOSH/IOSH** for HSE, and **GSAS/LEED** for green buildings — all of which NOVA delivers as training and certification support.',
      l: ['qu', 'qeeri', 'earthna', 'services']
    },
    {
      k: ['project', 'assignment', 'homework', 'thesis', 'dissertation', 'research topic', 'case study', 'report writing', 'proposal', 'methodology'],
      a: '**Environmental projects & assignments**\n\nA solid environmental project usually follows this structure:\n\n- **Problem & scope** — what environmental issue, where, and over what period\n- **Baseline data** — measurements or published datasets (cite the source)\n- **Method** — sampling, modelling, GIS/remote sensing, or survey design\n- **Impact assessment** — significance, receptors, mitigation\n- **Conclusions & recommendations** — tied back to regulation or an SDG target\n\nGood open data sources for a student project: World Bank Open Data, Our World in Data, NASA Earthdata and Qatar PSA. Tell me your topic and I can suggest a structure and datasets.',
      l: ['wb', 'owid', 'nasa', 'research']
    },
    {
      k: ['climate change', 'global warming', 'carbon', 'ghg', 'greenhouse', 'emission', 'carbon footprint', 'net zero', 'paris agreement', 'cop', 'scope 1', 'scope 3', 'decarbon'],
      a: '**Climate change & GHG emissions**\n\nGreenhouse-gas accounting is normally split into **Scope 1** (direct emissions), **Scope 2** (purchased electricity) and **Scope 3** (value chain) under the GHG Protocol. Qatar\'s National Climate Change Action Plan 2030 sets a national emissions-reduction target and sits under the Paris Agreement framework.\n\nNOVA provides carbon footprint assessment and GHG audits, including Scope 1–3 inventories and reduction roadmaps.',
      l: ['ipcc', 'cw', 'mecc', 'services']
    },
    {
      k: ['waste', 'recycling', 'circular', 'landfill', 'plastic', 'composting', 'reuse', 'e-waste', 'hazardous waste'],
      a: '**Waste & circular economy**\n\nThe waste hierarchy — prevent, reuse, recycle, recover, dispose — is the standard framework. Qatar\'s domestic solid-waste strategy pushes diversion away from landfill through segregation, the Mesaieed treatment facilities and growing construction & demolition waste recovery.\n\nNOVA offers renewability & recycling consultation, including waste audits and diversion planning.',
      l: ['unep', 'mecc', 'services', 'fao']
    },
    {
      k: ['water', 'desalination', 'groundwater', 'reuse water', 'tse', 'water scarcity', 'aquifer'],
      a: '**Water resources**\n\nQatar is one of the most water-scarce countries in the world, with almost all potable water coming from desalination and very limited renewable groundwater. The main sustainability levers are demand reduction (Tarsheed), treated sewage effluent (TSE) reuse for irrigation, and more energy-efficient desalination.\n\nThis links directly to SDG 6 (Clean Water & Sanitation).',
      l: ['kahramaa', 'sdg', 'wb', 'qeeri']
    },
    {
      k: ['green building', 'gsas', 'leed', 'estidama', 'construction', 'eia', 'esia', 'impact assessment', 'iso 14001', 'iso 45001', 'esg', 'compliance', 'permit', 'audit'],
      a: '**Green building, EIA & compliance**\n\nIn Qatar, new developments are assessed under **GSAS** (the regional green-building rating system developed by GORD), with **LEED** also widely used. Projects with significant environmental effects require an **EIA/ESIA** approved by the Ministry of Environment & Climate Change.\n\nNOVA supports the full chain: EIA/ESIA studies, ISO 14001 and ISO 45001 certification, ESG reporting, and green-building consultation.',
      l: ['gord', 'qgbc', 'mecc', 'services']
    },
    {
      k: ['nova', 'your company', 'who are you', 'about you', 'service', 'price', 'quote', 'contact', 'hire', 'consult', 'email', 'phone', 'career', 'job', 'vacancy'],
      a: '**About NOVA Environmental Consulting**\n\nWe are an environmental consultancy based in Doha, Qatar, working in line with Qatar National Vision 2030. Our services include planning & legal compliance, ISO training and certification, environmental reports and EIA/ESIA, carbon footprint and GHG audits, health & safety, green building consultation, laboratory and equipment support, renewability & recycling consultation, and AI-based environmental tools.\n\nFor a scope or quotation, the contact page is the fastest route.',
      l: ['services', 'about', 'contact', 'career']
    }
  ];

  var CHIPS = [
    'Weather & climate in Qatar',
    'Renewable energy trends',
    'UN Sustainable Development Goals',
    'Population trends',
    'Energy consumption trends',
    'Air traffic & aviation emissions',
    'Vegetation & green cover',
    'Help with my environment assignment'
  ];

  var GREETING = 'Hello! I am the **NOVA environmental assistant**.\n\nAsk me about weather and climate, air quality, traffic, population, energy and renewables, vegetation, air traffic, environmental projects and assignments, environmental education in Qatar, or the UN Sustainable Development Goals — and I will point you to trusted sources to explore further.';

  var FALLBACK = 'I can help with environmental and sustainability topics. Try asking about one of these, or rephrase your question with a bit more detail:\n\n- Weather, climate and air quality\n- Traffic, transport and population trends\n- Energy consumption and renewable energy\n- Vegetation, water and waste\n- Air traffic and aviation emissions\n- UN Sustainable Development Goals\n- Environmental education, projects and assignments in Qatar';

  /* ------------------------------------------------------------------
     3. Local answer engine
     ------------------------------------------------------------------ */
  function localAnswer(query) {
    var q = ' ' + query.toLowerCase().replace(/[^a-z0-9؀-ۿ\s.]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var best = null;
    var bestScore = 0;

    for (var i = 0; i < KB.length; i++) {
      var score = 0;
      for (var j = 0; j < KB[i].k.length; j++) {
        var kw = KB[i].k[j];
        if (q.indexOf(kw) !== -1) {
          // longer keyword = stronger signal
          score += kw.indexOf(' ') !== -1 ? 3 : 2;
        }
      }
      if (score > bestScore) { bestScore = score; best = KB[i]; }
    }

    if (!best) {
      return { text: FALLBACK, links: [R.sdg, R.unep, R.owid, R.services] };
    }

    var links = [];
    for (var n = 0; n < best.l.length; n++) {
      if (R[best.l[n]]) links.push(R[best.l[n]]);
    }
    return { text: best.a, links: links };
  }

  /* ------------------------------------------------------------------
     4. Rendering helpers
     ------------------------------------------------------------------ */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function inline(s) {
    // Order matters: escape first (done by caller), then decorate.
    return s
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function renderRich(text) {
    var lines = esc(text).split('\n');
    var html = '';
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var isItem = /^[-*•]\s+/.test(line);

      if (isItem) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inline(line.replace(/^[-*•]\s+/, '')) + '</li>';
        continue;
      }
      if (inList) { html += '</ul>'; inList = false; }
      if (line) html += '<p>' + inline(line) + '</p>';
    }
    if (inList) html += '</ul>';
    return html || '<p></p>';
  }

  var LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>';

  function renderLinks(links) {
    if (!links || !links.length) return '';
    var html = '<div class="nova-ai-links"><div class="nova-ai-links-title">Explore more</div>';
    for (var i = 0; i < links.length; i++) {
      var ext = /^https?:/.test(links[i].url);
      html += '<a class="nova-ai-link" href="' + esc(links[i].url) + '"' +
              (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
              LINK_ICON + '<span>' + esc(links[i].label) + '</span></a>';
    }
    return html + '</div>';
  }

  /* ------------------------------------------------------------------
     5. Build the UI
     ------------------------------------------------------------------ */
  var SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>';

  var launcher, teaser, panel, body, input, sendBtn;
  var history = [];
  var busy = false;
  var opened = false;

  function build() {
    launcher = document.createElement('button');
    launcher.className = 'nova-ai-launcher ping';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open the NOVA AI assistant');
    launcher.innerHTML = SPARK + '<span>Ask AI Assistant</span>';

    teaser = document.createElement('div');
    teaser.className = 'nova-ai-teaser';
    teaser.innerHTML =
      '<button class="nova-ai-teaser-close" type="button" aria-label="Dismiss">&times;</button>' +
      '<strong>Have an environment question?</strong>' +
      'Ask about climate, energy, SDGs or your project — free to use.';

    panel = document.createElement('div');
    panel.className = 'nova-ai-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'NOVA AI assistant');
    panel.innerHTML =
      '<div class="nova-ai-header">' +
        '<div class="nova-ai-avatar">' + SPARK + '</div>' +
        '<div class="nova-ai-header-text">' +
          '<h4>NOVA AI Assistant</h4>' +
          '<div class="nova-ai-status"><i></i> Environment &amp; sustainability</div>' +
        '</div>' +
        '<button class="nova-ai-close" type="button" aria-label="Close assistant">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="nova-ai-body" id="novaAiBody"></div>' +
      '<div class="nova-ai-footer">' +
        '<div class="nova-ai-input-row">' +
          '<textarea class="nova-ai-input" id="novaAiInput" rows="1" maxlength="' + MAX_CHARS + '" ' +
            'placeholder="Ask about climate, energy, SDGs..." aria-label="Your question"></textarea>' +
          '<button class="nova-ai-send" id="novaAiSend" type="button" aria-label="Send">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="nova-ai-disclaimer">AI-generated guidance — please verify before professional use. ' +
          '<a href="' + BASE + 'pages/contact.html">Talk to a consultant</a></div>' +
      '</div>';

    document.body.appendChild(launcher);
    document.body.appendChild(teaser);
    document.body.appendChild(panel);

    body    = panel.querySelector('#novaAiBody');
    input   = panel.querySelector('#novaAiInput');
    sendBtn = panel.querySelector('#novaAiSend');

    launcher.addEventListener('click', open);
    panel.querySelector('.nova-ai-close').addEventListener('click', close);
    teaser.querySelector('.nova-ai-teaser-close').addEventListener('click', function (e) {
      e.stopPropagation();
      hideTeaser();
    });
    teaser.addEventListener('click', open);
    sendBtn.addEventListener('click', submit);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) close();
    });

    greet();
    scheduleTeaser();
  }

  function scheduleTeaser() {
    var seen = false;
    try { seen = sessionStorage.getItem('novaAiTeaser') === '1'; } catch (err) { seen = false; }
    if (seen) return;
    setTimeout(function () {
      if (!opened) teaser.classList.add('show');
    }, 9000);
  }

  function hideTeaser() {
    teaser.classList.remove('show');
    try { sessionStorage.setItem('novaAiTeaser', '1'); } catch (err) { /* ignore */ }
  }

  function open() {
    opened = true;
    hideTeaser();
    launcher.classList.add('hidden');
    launcher.classList.remove('ping');
    panel.classList.add('open');
    setTimeout(function () { input.focus(); }, 260);
    scrollDown();
  }

  function close() {
    panel.classList.remove('open');
    launcher.classList.remove('hidden');
  }

  function scrollDown() {
    if (body) body.scrollTop = body.scrollHeight;
  }

  /* ------------------------------------------------------------------
     6. Messages
     ------------------------------------------------------------------ */
  function addMessage(role, text, links) {
    var wrap = document.createElement('div');
    wrap.className = 'nova-ai-msg ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'nova-ai-bubble';
    bubble.innerHTML = renderRich(text) + (role === 'bot' ? renderLinks(links) : '');
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function addChips() {
    var row = document.createElement('div');
    row.className = 'nova-ai-chips';
    for (var i = 0; i < CHIPS.length; i++) {
      (function (label) {
        var chip = document.createElement('button');
        chip.className = 'nova-ai-chip';
        chip.type = 'button';
        chip.textContent = label;
        chip.addEventListener('click', function () { ask(label); });
        row.appendChild(chip);
      })(CHIPS[i]);
    }
    body.appendChild(row);
    scrollDown();
  }

  function greet() {
    addMessage('bot', GREETING, null);
    addChips();
  }

  function showTyping() {
    var wrap = document.createElement('div');
    wrap.className = 'nova-ai-msg bot';
    wrap.innerHTML = '<div class="nova-ai-typing"><span></span><span></span><span></span></div>';
    body.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function submit() {
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    ask(text);
  }

  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    input.disabled = state;
  }

  function ask(text) {
    if (busy) return;
    if (!panel.classList.contains('open')) open();

    text = text.slice(0, MAX_CHARS);
    addMessage('user', text, null);
    history.push({ role: 'user', text: text });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

    setBusy(true);
    var typing = showTyping();

    requestAnswer(text).then(function (res) {
      typing.remove();
      addMessage('bot', res.text, res.links);
      history.push({ role: 'assistant', text: res.text });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      setBusy(false);
      input.focus();
    });
  }

  /* ------------------------------------------------------------------
     7. API call, with graceful fallback to the local knowledge base
     ------------------------------------------------------------------ */
  function requestAnswer(text) {
    var offline = localAnswer(text);

    // Opened straight from disk, or no fetch support -> local only.
    if (window.location.protocol === 'file:' || typeof fetch !== 'function') {
      return delay(450).then(function () { return offline; });
    }

    var list = activeEndpoint ? [activeEndpoint] : ENDPOINTS.slice();

    function attempt(i) {
      if (i >= list.length) return Promise.resolve(offline);

      var url = list[i];
      var controller = null;
      var timer = null;
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        timer = setTimeout(function () { controller.abort(); }, 25000);
      }

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
        signal: controller ? controller.signal : undefined
      }).then(function (r) {
        if (timer) clearTimeout(timer);

        // Not deployed at this path -> try the next candidate.
        if (r.status === 404 || r.status === 405 || r.status === 501) {
          return attempt(i + 1);
        }

        // This backend exists. Remember it, even if it has no API key yet.
        activeEndpoint = url;
        if (!r.ok) return offline;

        return r.json().then(function (data) {
          if (!data || !data.reply) return offline;
          // Keep the vetted links next to the AI answer.
          return {
            text: data.reply,
            links: data.links && data.links.length ? data.links : offline.links
          };
        }, function () { return offline; });
      }, function () {
        if (timer) clearTimeout(timer);
        return attempt(i + 1);
      });
    }

    return attempt(0);
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* ------------------------------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
