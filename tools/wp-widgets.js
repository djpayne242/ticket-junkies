
// ---------- Elementor / shortcode widgets ----------
// Each widget prints <div class="tj-root tj-widget" data-tj-widget="..." data-tj-opts='{...}'></div>; this mounts them.
const tjHomeQuery = () => { const s = new URLSearchParams(location.search); return { q: s.get('q') || '', category: s.get('category') || '' }; };
const tjEventsCache = {};
function tjEvents(params) {
  const p = new URLSearchParams(); if (params.q) p.set('q', params.q); if (params.category) p.set('category', params.category);
  const k = p.toString();
  return (tjEventsCache[k] ||= api('/api/events?' + p).then((r) => r.events));
}
const tjOpts = (el) => { try { return JSON.parse(el.getAttribute('data-tj-opts') || '{}'); } catch { return {}; } };
const tjHomeUrl = (params) => { const p = new URLSearchParams(); if (params.q) p.set('q', params.q); if (params.category) p.set('category', params.category); const s = p.toString(); return (TJ.pages.home || TJ.home) + (s ? '?' + s : ''); };

const TJ_WIDGETS = {
  // Full routed screens (event page, checkout, dashboards, admin …)
  screen(el, o) {
    if (TJ_SCREEN) { el.innerHTML = '<div class="notice">Only one TicketJunkies screen can be used per page.</div>'; return; }
    const key = o.screen || 'home';
    el.classList.add('tj-screen');
    TJ_SCREEN = { el, key, routed: false };
    window.addEventListener('hashchange', route);
    route();
  },
  search(el, o) {
    const { q, category } = tjHomeQuery();
    const catOpts = META.categories.map((c) => `<option ${c === category ? 'selected' : ''}>${esc(c)}</option>`).join('');
    el.innerHTML = `<form class="search" role="search">
      <input name="q" placeholder="${esc(o.placeholder || 'Search events, venues, organizers…')}" value="${esc(q)}" />
      ${o.showCategory === false ? '' : `<select name="category"><option value="">${esc(o.allLabel || 'All categories')}</option>${catOpts}</select>`}
      <button class="btn btn-primary">${esc(o.button || 'Search')}</button></form>`;
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      location.href = tjHomeUrl({ q: f.get('q') || '', category: f.get('category') || '' });
    };
  },
  chips(el, o) {
    const { q, category } = tjHomeQuery();
    el.innerHTML = `<div class="chips">${['', ...META.categories].map((c) => `<a class="chip ${c === category ? 'active' : ''}" href="${esc(tjHomeUrl({ q, category: c }))}">${c ? esc(c) : esc(o.allLabel || 'All')}</a>`).join('')}</div>`;
  },
  async map(el, o) {
    const query = o.category ? { q: '', category: o.category } : tjHomeQuery();
    const filtered = query.q || query.category;
    el.innerHTML = `<section class="map-section">
      ${o.showTitle === false ? '' : `<div class="section-head"><h2>${esc(filtered ? (o.titleFiltered || '🗺️ These events on the map') : (o.title || '🗺️ Live events on the map'))}</h2><span class="muted small tj-map-count">Tap a pin to see the event</span></div>`}
      <div class="events-map" style="${o.height ? `height:${Number(o.height)}px` : ''}"><div class="loading">Loading map…</div></div></section>`;
    const mapEl = el.querySelector('.events-map');
    try {
      const events = await tjEvents(query);
      const pinned = events.filter((e) => Number.isFinite(e.lat));
      const c = el.querySelector('.tj-map-count');
      if (c) c.textContent = pinned.length ? `${pinned.length} event${pinned.length === 1 ? '' : 's'} · tap a pin to see the event` : 'No mapped events yet';
      await TJGeo.eventsMap(mapEl, events, { googleKey: META.maps?.googleMapsKey, center: META.maps?.center || { lat: 25.0582, lng: -77.3431 } });
    } catch { mapEl.innerHTML = '<div class="empty" style="box-shadow:none">Map could not be loaded right now.</div>'; }
  },
  async grid(el, o) {
    const query = o.category ? { q: '', category: o.category } : tjHomeQuery();
    const filtered = !o.category && (query.q || query.category);
    el.innerHTML = `${o.showTitle === false ? '' : `<div class="section-head"><h2>${esc(filtered ? (o.titleFiltered || 'Search results') : (o.title || 'Upcoming events'))}</h2>${o.showCount === false ? '' : '<span class="muted small tj-count"></span>'}</div>`}
      <div class="grid"${o.columns ? ` style="grid-template-columns:repeat(${Number(o.columns)},minmax(0,1fr))"` : ''}><div class="loading">Loading events…</div></div>`;
    try {
      let events = await tjEvents(query);
      if (o.limit) events = events.slice(0, Number(o.limit));
      const c = el.querySelector('.tj-count'); if (c) c.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;
      el.querySelector('.grid').innerHTML = events.length ? events.map(card).join('')
        : `<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><h3>${esc(o.emptyTitle || 'No events found')}</h3><p class="muted">${esc(o.emptyText || 'Try another search or category.')}</p></div>`;
    } catch (e) { el.querySelector('.grid').innerHTML = `<div class="error">${esc(e.message)}</div>`; }
  },
  weather(el, o) {
    el.innerHTML = `<div class="hero-side tj-hero-side">
      ${o.showWeather === false ? '' : '<div class="wx-mini hidden" id="homeWx"></div>'}
      ${o.showClock === false ? '' : `<div class="hero-clock" id="homeClock" aria-live="off">
        <div class="hc-time"><span id="hcTime">--:--</span><span class="hc-sec" id="hcSec"></span><span class="hc-ampm" id="hcAmpm"></span></div>
        <div class="hc-date" id="hcDate"></div><div class="hc-zone" id="hcZone"></div></div>`}</div>`;
    const place = o.place && o.lat && o.lng ? { name: o.place, lat: Number(o.lat), lng: Number(o.lng) } : META.weatherPlace;
    if (o.showWeather !== false && place) TJGeo.homeWeather(el.querySelector('#homeWx'), place);
    if (o.showClock !== false) startHomeClock();
  },
  // Orange & blue "Get your ticket fix." box with search, weather and live clock inside
  hero(el, o) {
    const { q, category } = tjHomeQuery();
    const catOpts = META.categories.map((c) => `<option ${c === category ? 'selected' : ''}>${esc(c)}</option>`).join('');
    const side = o.showWeather === false && o.showClock === false ? '' : `<div class="hero-side">
        ${o.showWeather === false ? '' : '<div class="wx-mini hidden" id="homeWx"></div>'}
        ${o.showClock === false ? '' : `<div class="hero-clock" id="homeClock" aria-live="off">
          <div class="hc-time"><span id="hcTime">--:--</span><span class="hc-sec" id="hcSec"></span><span class="hc-ampm" id="hcAmpm"></span></div>
          <div class="hc-date" id="hcDate"></div><div class="hc-zone" id="hcZone"></div></div>`}</div>`;
    const cta = o.showCta === false ? '' : (me?.role === 'organizer'
      ? '<a class="btn btn-green" href="#/create">+ Create an event</a>'
      : `<span>${esc(o.ctaText || 'Hosting an event?')}</span><a class="link" href="#/register?role=organizer">${esc(o.ctaLink || 'Become an organizer →')}</a>`);
    el.innerHTML = `<section class="hero tj-hero${side ? '' : ' no-side'}">${side}
      <h1 class="display">${esc(o.title || 'Get your ticket fix.')}</h1>
      ${o.subtitle === '' ? '' : `<p>${esc(o.subtitle || 'Discover the hottest parties, concerts, comedy shows and festivals — or launch your own event and start selling tickets in minutes.')}</p>`}
      <form class="search" role="search">
        <input name="q" placeholder="${esc(o.placeholder || 'Search events, venues, organizers…')}" value="${esc(q)}" />
        <select name="category"><option value="">All categories</option>${catOpts}</select>
        <button class="btn btn-primary">${esc(o.button || 'Search')}</button>
      </form>
      ${cta ? `<div class="hero-cta">${cta}</div>` : ''}
    </section>`;
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      location.href = tjHomeUrl({ q: f.get('q') || '', category: f.get('category') || '' });
    };
    const place = META.weatherPlace;
    if (o.showWeather !== false && place) TJGeo.homeWeather(el.querySelector('#homeWx'), place);
    if (o.showClock !== false) startHomeClock();
  },
  cta(el, o) {
    if (me?.role === 'organizer' && o.hideForOrganizers !== false) { el.innerHTML = '<a class="btn btn-green" href="#/create">+ Create an event</a>'; return; }
    el.innerHTML = `<div class="hero-cta"><span>${esc(o.text || 'Hosting an event?')}</span><a class="link" href="#/register?role=organizer">${esc(o.link || 'Become an organizer →')}</a></div>`;
  },
};

// A page with the separate search + weather blocks but no hero box gets the
// orange & blue "Get your ticket fix." box back automatically (search, weather and
// clock move inside it). Turn off with: add_filter('tj_auto_hero', '__return_false');
function tjAutoHero(root) {
  if (!window.TJ_CONFIG || TJ_CONFIG.autoHero === false || !root.querySelectorAll) return;
  if (document.querySelector('[data-tj-widget="hero"], .tj-hero-box')) return;
  const search = root.querySelector('[data-tj-widget="search"]:not([data-tj-mounted])');
  if (!search) return;
  const weather = [...root.querySelectorAll('[data-tj-widget="weather"]:not([data-tj-mounted])')];
  const so = tjOpts(search);
  search.setAttribute('data-tj-widget', 'hero');
  search.setAttribute('data-tj-opts', JSON.stringify({ placeholder: so.placeholder, button: so.button, showWeather: weather.length ? undefined : false, showClock: weather.length ? undefined : false }));
  for (const w of weather) {
    w.dataset.tjMounted = '1'; w.style.display = 'none'; w.innerHTML = '';
    const br = w.nextSibling; if (br && br.nodeName === 'BR') br.remove();
  }
}

function tjMountAll(root) {
  tjAutoHero(root);
  const els = [...(root.querySelectorAll ? root.querySelectorAll('[data-tj-widget]') : [])];
  // screens first so links on the same page are recognised
  els.sort((a, b) => (a.dataset.tjWidget === 'screen' ? -1 : 0) - (b.dataset.tjWidget === 'screen' ? -1 : 0));
  for (const el of els) {
    if (el.dataset.tjMounted) continue;
    el.dataset.tjMounted = '1';
    const fn = TJ_WIDGETS[el.dataset.tjWidget];
    if (!fn) continue;
    try { const r = fn(el, tjOpts(el)); if (r && r.catch) r.catch((e) => { el.innerHTML = `<div class="error">${esc(e.message)}</div>`; }); }
    catch (e) { el.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
  }
  tjFixLinks(document);
}
// Elementor editor: re-mount widgets when they are (re)rendered in the preview
window.addEventListener('elementor/frontend/init', () => {
  if (!window.elementorFrontend || !elementorFrontend.hooks) return;
  elementorFrontend.hooks.addAction('frontend/element_ready/global', ($scope) => {
    const node = $scope && $scope[0];
    if (!node || !tjBooted) return;
    node.querySelectorAll('[data-tj-widget]').forEach((el) => {
      if (el.dataset.tjWidget === 'screen' && TJ_SCREEN && TJ_SCREEN.el !== el) { TJ_SCREEN = null; }
      delete el.dataset.tjMounted;
    });
    tjMountAll(node);
  });
});

// "Forgot your password?" link under the log-in form (uses WordPress's own reset email)
(function () {
  const add = () => {
    const f = document.getElementById('loginForm');
    if (!f || f.dataset.tjLost || !(window.TJ_CONFIG && TJ_CONFIG.lostPassword)) return;
    f.dataset.tjLost = '1';
    const p = document.createElement('p');
    p.className = 'muted small';
    p.style.cssText = 'text-align:center;margin:12px 0 0';
    p.innerHTML = '<a href="' + TJ_CONFIG.lostPassword + '">Forgot your password?</a>';
    f.appendChild(p);
  };
  new MutationObserver(add).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', add);
})();
