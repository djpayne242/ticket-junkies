// TicketJunkies.com — single-page frontend
'use strict';
// ---------- WordPress adapter (TicketJunkies plugin) ----------
// TJ_CONFIG is printed by the plugin: REST base, nonce, page URLs, asset URL.
const TJ = Object.assign({ rest: '/wp-json/tj/v1/', nonce: '', home: '/', assets: '', pages: {}, editor: false }, window.TJ_CONFIG || {});
let tjBooted = false;
// Which WordPress page shows each part of the app. Keys of TJ.pages: home, event, checkout, tickets, organizer, admin, login, register, ticket
const TJ_ROUTE_PAGE = { '': 'home', event: 'event', checkout: 'checkout', cart: 'checkout', order: 'checkout', tickets: 'tickets', dashboard: 'organizer', create: 'organizer', edit: 'organizer', attendees: 'organizer', reports: 'organizer', admin: 'admin', login: 'login', register: 'register', t: 'ticket' };
const tjSeg = (hash) => String(hash || '').replace(/^#?\/?/, '').split(/[/?]/)[0];
const tjPageOf = (hash) => (Object.prototype.hasOwnProperty.call(TJ_ROUTE_PAGE, tjSeg(hash)) ? TJ_ROUTE_PAGE[tjSeg(hash)] : 'home');
function tjApi(url) { return /^https?:/.test(url) ? url : TJ.rest + String(url).replace(/^\/?api\//, ''); }
// '#/event/evt_1' -> https://site/event/#/event/evt_1   ·   '#/?q=x' -> https://site/?q=x
function tjRouteUrl(hash) {
  hash = '#/' + String(hash || '').replace(/^#?\/?/, '');
  const key = tjPageOf(hash);
  const base = TJ.pages[key] || TJ.home;
  if (key === 'home') { const qs = hash.split('?')[1]; return base + (qs ? (base.includes('?') ? '&' : '?') + qs : ''); }
  return base + hash;
}
const tjLink = (l) => (/^https?:/.test(String(l)) ? l : tjRouteUrl(String(l || '').replace(/^\/?/, '')));
// The routed "screen" widget on this page (event page, checkout, dashboards …)
let TJ_SCREEN = null;
const TJ_SCREEN_DEFAULT = {
  home: () => '#/',
  event: () => { const id = new URLSearchParams(location.search).get('id'); return id ? '#/event/' + id : (TJ.sampleEvent ? '#/event/' + TJ.sampleEvent : '#/event/'); },
  checkout: () => { try { const c = JSON.parse(sessionStorage.getItem('tj_cart') || 'null'); if (c && c.id) return '#/checkout/' + c.id; } catch {} return TJ.sampleEvent ? '#/checkout/' + TJ.sampleEvent : '#/checkout/'; },
  tickets: () => '#/tickets', organizer: () => '#/dashboard', admin: () => '#/admin', login: () => '#/login', register: () => '#/register', ticket: () => '#/t',
};
function tjScreenAllows(hash) { return !!TJ_SCREEN && tjPageOf(hash) === TJ_SCREEN.key; }
function tjCurrentRoute() {
  if (TJ_SCREEN && location.hash && location.hash.length > 2 && tjScreenAllows(location.hash)) return location.hash;
  if (TJ_SCREEN && location.hash && location.hash.length > 2) return location.hash; // belongs to another page: route() forwards it
  return TJ_SCREEN ? TJ_SCREEN_DEFAULT[TJ_SCREEN.key]() : '#/' + location.search;
}
function tjGo(hash) {
  hash = '#/' + String(hash || '').replace(/^#?\/?/, '');
  if (tjScreenAllows(hash)) { if (location.hash === hash) route(); else location.hash = hash; return; }
  location.href = tjRouteUrl(hash);
}
// Links written as "#/..." are rewritten to the right page (so "open in new tab" works too)
function tjFixLinks(root) {
  (root.querySelectorAll ? root.querySelectorAll('a[href^="#/"]') : []).forEach((a) => {
    const h = a.getAttribute('href');
    if (!tjScreenAllows(h)) a.setAttribute('href', tjRouteUrl(h));
  });
}
new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches && n.matches('a[href^="#/"]')) tjFixLinks(n.parentNode || n); else tjFixLinks(n); } }); })
  .observe(document.documentElement, { childList: true, subtree: true });
// Body-level container for toasts and pop-ups (keeps them inside the plugin's styles)
function tjFloat(id) {
  let f = document.getElementById('tj-float');
  if (!f) { f = document.createElement('div'); f.id = 'tj-float'; f.className = 'tj-root tj-float'; f.innerHTML = '<div id="toast" class="toast" hidden></div>'; document.body.appendChild(f); }
  return id ? document.getElementById(id) : f;
}


let $app = document.createElement('div');
let $nav = document.getElementById('nav') || document.createElement('nav');
let me = null;
let META = { categories: [], feePercent: 0.035, feeFixed: 0.99 };

const CAT_STYLE = {
  'Music': ['#376eb8', '#5fa4f0', '🎵'],
  'Nightlife': ['#2a1b5c', '#8a3ffc', '🪩'],
  'Comedy': ['#eb742a', '#f7b267', '🎤'],
  'Food & Drink': ['#c0392b', '#eb742a', '🍹'],
  'Sports': ['#1d7a46', '#84d65f', '🏆'],
  'Arts': ['#9b2c6e', '#eb742a', '🎨'],
  'Business': ['#1b2a41', '#376eb8', '💼'],
  'Community': ['#3e7f22', '#84d65f', '🥁'],
};

const ROLE_LABEL = { user: 'Attendee', organizer: 'Organizer', admin: 'Admin' };

// ---------- utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2);
const round2 = (n) => Math.round(n * 100) / 100;
const fee = (p) => (p > 0 ? round2(p * META.feePercent + META.feeFixed) : 0);
const fmtLong = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtShort = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const multiDay = (ev) => ev.schedule === 'multi' || (ev.endsAt && new Date(ev.endsAt).toDateString() !== new Date(ev.startsAt).toDateString() && new Date(ev.endsAt) - new Date(ev.startsAt) > 20 * 3600000);
const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const cardWhen = (ev) => multiDay(ev) ? `${fmtDay(ev.startsAt)} – ${fmtDay(ev.endsAt)}` : fmtShort(ev.startsAt);
const toLocalInput = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

async function api(url, { method = 'GET', body } = {}) {
  const headers = { 'X-WP-Nonce': TJ.nonce };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(tjApi(url), { method, credentials: 'same-origin', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (data && typeof data.nonce === 'string' && data.nonce) TJ.nonce = data.nonce;
  if (!res.ok) { const e = new Error(data.error || data.message || 'Request failed'); e.status = res.status; throw e; }
  return data;
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = tjFloat('toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
const go = (hash) => tjGo(hash);
const loadingHtml = () => (META.preloader && META.preloader.enabled ? '<div class="loading" aria-hidden="true"></div>' : '<div class="loading">Loading…</div>');
const loading = () => { $app.innerHTML = loadingHtml(); };

function cover(ev, cls = '') {
  if (ev.imageUrl) return `<div class="cover has-img ${cls}"><img class="cover-img" src="${esc(ev.imageUrl)}" alt="${esc(ev.title)}" ${cls === 'big' ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" /></div>`;
  const [a, b, icon] = CAT_STYLE[ev.category] || ['#376eb8', '#84d65f', '🎟️'];
  return `<div class="cover ${cls}" style="background:linear-gradient(135deg,${a},${b})"><span class="cover-icon">${icon}</span><span class="cover-title">${esc(ev.title)}</span></div>`;
}
const tierKindOf = (t) => t.kind || (t.price > 0 ? 'paid' : 'free');
// "From $25" / "Free" / "Donation · from $5" / "Pay what you want" — plain text, or null when sold out
function priceText(kind, min, many = true) {
  if (kind === null || kind === undefined) return null;
  if (kind === 'donation') return min > 0 ? `Donation · from ${money(min)}` : 'Pay what you want';
  if (kind === 'free' || min === 0) return 'Free';
  return many ? `From ${money(min)}` : money(min);
}
// soon = sales not started · open = can be bought · closed = sales end has passed
function tierSaleState(t) {
  const now = Date.now();
  if (t.salesStart && new Date(t.salesStart).getTime() > now) return 'soon';
  if (t.salesEnd && new Date(t.salesEnd).getTime() <= now) return 'closed';
  return 'open';
}
const tierOnSaleNow = (t) => tierSaleState(t) === 'open';
// how many of this ticket type the visitor can still pick (per-person limit, or 10 per order)
const tierCap = (t) => Math.max(0, Math.min(t.remaining, t.maxPerPerson ? t.maxPerPerson - (t.boughtByYou || 0) : 10));
function nextSaleStart(ev) { return ev.tiers.filter((t) => t.remaining > 0 && t.visibility !== 'private' && tierSaleState(t) === 'soon').map((t) => t.salesStart).sort()[0] || null; }
function salesClosed(ev) { const a = ev.tiers.filter((t) => t.remaining > 0 && t.visibility !== 'private'); return a.length > 0 && a.every((t) => tierSaleState(t) === 'closed'); }
// "Nov 25, 2:00 PM – Nov 30, 11:59 PM" for a ticket type's sales window
function salesWindowText(t) {
  const f = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (t.salesStart && t.salesEnd) return `Sales: ${f(t.salesStart)} – ${f(t.salesEnd)}`;
  if (t.salesStart) return `Sales start ${f(t.salesStart)}`;
  if (t.salesEnd) return `Sales end ${f(t.salesEnd)}`;
  return '';
}
function lowestTier(ev) {
  const open = ev.tiers.filter((t) => t.remaining > 0 && t.visibility !== 'private' && tierOnSaleNow(t));
  if (!open.length) return null;
  return open.reduce((a, t) => (t.price < a.price || (t.price === a.price && tierKindOf(t) === 'paid') ? t : a), open[0]);
}
function priceFrom(ev) {
  const t = lowestTier(ev);
  if (!t) return nextSaleStart(ev) ? '<span class="badge soon">On sale soon</span>' : salesClosed(ev) ? '<span class="badge">Sales ended</span>' : '<span class="badge soldout">Sold out</span>';
  return esc(priceText(tierKindOf(t), t.price, ev.tiers.filter((x) => x.visibility !== 'private').length > 1));
}

// ---------- countdown to the start of each event (updates every second) ----------
function cdParts(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }; }
const p2 = (n) => String(n).padStart(2, '0');
function countdownState(startsAt, endsAt) {
  const now = Date.now(), st = new Date(startsAt).getTime(), en = new Date(endsAt).getTime();
  return now < st ? 'soon' : now < en ? 'live' : 'ended';
}
function countdownHtml(ev, big = false) {
  const attrs = `data-cd="${esc(ev.startsAt)}" data-cd-end="${esc(ev.endsAt)}"`;
  if (big) return `<div class="cd-big${big === 'card' ? ' cd-card' : ''}" ${attrs} aria-live="off"><div class="cd-big-label">${big === 'card' ? '⏳ Goes live in' : '⏳ This event goes live in'}</div><div class="cd-big-boxes">${['Days', 'Hours', 'Minutes', 'Seconds'].map((l, i) => `<div class="cd-box"><b data-cd-u="${i}">--</b><span>${l}</span></div>`).join('')}</div><div class="cd-big-msg"></div></div>`;
  return `<span class="cd-chip" ${attrs}>⏳ <span class="cd-txt">…</span></span>`;
}
function tickCountdowns() {
  document.querySelectorAll('[data-cd]').forEach((el) => {
    const state = countdownState(el.dataset.cd, el.dataset.cdEnd);
    if (el.dataset.cdState !== state) { el.dataset.cdState = state; el.classList.toggle('is-live', state === 'live'); el.classList.toggle('is-ended', state === 'ended'); }
    const c = cdParts(new Date(el.dataset.cd).getTime() - Date.now());
    if (el.classList.contains('cd-big')) {
      const msg = el.querySelector('.cd-big-msg'), boxes = el.querySelector('.cd-big-boxes'), lbl = el.querySelector('.cd-big-label');
      if (state !== 'soon') { boxes.style.display = 'none'; lbl.style.display = 'none'; msg.textContent = state === 'live' ? '🔴 This event is LIVE now!' : 'This event has ended'; return; }
      [c.d, p2(c.h), p2(c.m), p2(c.s)].forEach((v, i) => { const b = el.querySelector(`[data-cd-u="${i}"]`); if (b && b.textContent !== String(v)) b.textContent = v; });
      return;
    }
    const t = el.querySelector('.cd-txt') || el;
    const left = `${c.d ? c.d + 'd ' : ''}${p2(c.h)}h ${p2(c.m)}m ${p2(c.s)}s`;
    if (el.dataset.cdKind === 'saleEnd') {
      // ticket type countdown: until its sales end
      t.textContent = state === 'soon' ? `Sales end in ${left}` : 'Sales ended';
      if (state !== 'soon' && !el.dataset.cdFired) { el.dataset.cdFired = '1'; el.dispatchEvent(new CustomEvent('tj:onsale', { bubbles: true })); }
      return;
    }
    if (el.dataset.cdKind === 'sale') {
      // ticket type countdown: until its sales start
      t.textContent = state === 'soon' ? `On sale in ${left}` : 'On sale now';
      if (state !== 'soon' && !el.dataset.cdFired) { el.dataset.cdFired = '1'; el.dispatchEvent(new CustomEvent('tj:onsale', { bubbles: true })); }
      return;
    }
    t.textContent = state === 'live' ? 'Live now' : state === 'ended' ? 'Ended' : `Goes live in ${left}`;
  });
}
let cdTimer = null;
function startCountdowns() { tickCountdowns(); if (!cdTimer) cdTimer = setInterval(() => { if (document.querySelector('[data-cd]')) tickCountdowns(); }, 1000); }
new MutationObserver(() => { if (document.querySelector('[data-cd]:not([data-cd-state])')) startCountdowns(); }).observe(document.documentElement, { childList: true, subtree: true });
const card = (ev) => `
  <a class="card" href="#/event/${esc(ev.id)}">
    ${cover(ev)}
    <div class="card-body">
      <div class="card-date">${esc(cardWhen(ev))}${ev.moreDates ? ` <span class="more-dates">+${ev.moreDates} more date${ev.moreDates > 1 ? 's' : ''}</span>` : ''}</div>
      <h3>${esc(ev.title)}</h3>
      <div class="muted small">${esc(ev.venue)} · ${esc(ev.city)}${(ev.extraVenues || []).length ? ` <span class="more-dates">+${ev.extraVenues.length} venue${ev.extraVenues.length > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="muted small">By ${esc(ev.organizer)}</div>
      <div class="card-cd">${countdownHtml(ev, 'card')}</div>
      <div class="card-buy"><span class="price">${priceFrom(ev)}</span>${lowestTier(ev) ? '<span class="btn btn-primary btn-sm card-get">Get tickets →</span>' : '<span class="btn btn-ghost btn-sm card-get off">View event</span>'}</div>
      <div class="card-foot"><span class="card-foot-r"><span class="tag">${esc(ev.category)}</span><button class="card-share" data-share="${esc(ev.id)}" title="Share this event" aria-label="Share ${esc(ev.title)}">${SHARE_ICON}</button></span></div>
    </div>
  </a>`;

const errBox = (id) => `<div class="error hidden" id="${id}"></div>`;
function showErr(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.remove('hidden'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }

// Shrinks an uploaded flyer to at most 1600px wide (keeps GIFs and already-small files as they are)
function optimizeFlyer(dataUrl, fileType) {
  return new Promise((resolve) => {
    if (/gif/i.test(fileType || '')) return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width, 2000 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', 0.82);
      resolve(out.length < dataUrl.length ? out : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Makes a ≤1200px JPEG under ~280 KB for link previews
function shrinkForShare(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / img.width, 1200 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      let q = 0.85, out = c.toDataURL('image/jpeg', q);
      while (out.length * 0.75 > 280 * 1024 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// ---------- Google reCAPTCHA ("I'm not a robot") ----------
const Captcha = (() => {
  let loading = null;
  const load = () => (loading ||= new Promise((resolve, reject) => {
    window.__tjCaptchaReady = () => resolve(window.grecaptcha);
    const s = document.createElement('script');
    s.src = 'https://www.google.com/recaptcha/api.js?onload=__tjCaptchaReady&render=explicit';
    s.async = true; s.defer = true;
    s.onerror = () => { loading = null; reject(new Error('Robot check could not load. Check your connection and reload the page.')); };
    document.head.appendChild(s);
  }));
  // Renders the checkbox into `el`; returns { token(), reset() }
  function mount(el) {
    let widgetId = null;
    const draw = () => {
      if (!el.isConnected) return;
      el.innerHTML = '';
      const box = document.createElement('div');
      el.appendChild(box);
      widgetId = window.grecaptcha.render(box, {
        sitekey: META.captcha.siteKey,
        theme: 'light', // always light: CSS blends it into the page so it looks transparent in light AND dark mode
        callback: () => el.closest('form')?.querySelector('.error')?.classList.add('hidden'),
      });
    };
    el.innerHTML = '<div class="muted small">Loading robot check…</div>';
    load().then(draw).catch((e) => { el.innerHTML = `<div class="error">${esc(e.message)}</div>`; });
    return {
      token: () => (widgetId !== null && window.grecaptcha ? window.grecaptcha.getResponse(widgetId) : ''),
      reset: () => { if (widgetId !== null && window.grecaptcha) window.grecaptcha.reset(widgetId); },
    };
  }
  return { mount };
})();

// ---------- theme (light / dark / auto) ----------
const Theme = (() => {
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  const get = () => { try { return localStorage.getItem('tj_theme') || 'auto'; } catch { return 'auto'; } };
  const apply = (pref) => {
    const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-pref', pref);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#12161f' : '#ffffff');
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === pref)));
  };
  const set = (pref) => {
    try { localStorage.setItem('tj_theme', pref); } catch {}
    apply(pref);
    toast({ light: '☀️ Light mode', dark: '🌙 Dark mode', auto: `🖥️ Auto — following your device (${mq.matches ? 'dark' : 'light'} right now)` }[pref]);
  };
  // Auto mode follows the device live (e.g. a phone switching to dark at sunset)
  const onChange = () => { if (get() === 'auto') apply('auto'); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-theme-set]'); if (b) set(b.dataset.themeSet); });
  apply(get());
  return { get, set };
})();

// ---------- sharing ----------
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>';
const ICONS = {
  whatsapp: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.7 15.6 2.2 13.8 2.2 12 2.2 6.6 6.6 2.2 12 2.2c2.6 0 5.1 1 6.9 2.9 1.8 1.8 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8zm8.4-18.2C18.1 1.3 15.2.1 12 .1 5.5.1.2 5.4.2 11.9c0 2.1.5 4.1 1.6 5.9L.1 23.9l6.3-1.6c1.7.9 3.7 1.4 5.6 1.4 6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.4-8.3z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.06-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>',
  sms: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.4A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>',
  email: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  qr: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M17 17h4v4h-4"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};
const shareUrl = (ev) => `${TJ.home}e/${ev.id}`;
function shareText(ev, going = false) {
  const when = new Date(ev.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return going
    ? `I'm going to ${ev.title} 🎉 ${when} at ${ev.venue}. Get your tickets on TicketJunkies:`
    : `🎟️ ${ev.title}\n📅 ${when}\n📍 ${[ev.venue, ev.city].filter(Boolean).join(', ')}\nGet tickets on TicketJunkies:`;
}
function shareTargets(ev, going = false) {
  const url = shareUrl(ev), text = shareText(ev, going), e = encodeURIComponent;
  const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  return [
    { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', href: `https://wa.me/?text=${e(text + ' ' + url)}` },
    { id: 'facebook', label: 'Facebook', color: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
    { id: 'x', label: 'X', color: '#000000', href: `https://twitter.com/intent/tweet?text=${e(text.replace(/\n/g, ' '))}&url=${e(url)}` },
    { id: 'telegram', label: 'Telegram', color: '#229ED9', href: `https://t.me/share/url?url=${e(url)}&text=${e(text)}` },
    { id: 'sms', label: 'Text message', color: '#34C759', href: `sms:${isApple ? '&' : '?'}body=${e(text + ' ' + url)}`, self: true },
    { id: 'email', label: 'Email', color: '#EB742A', href: `mailto:?subject=${e((going ? "I'm going to " : '') + ev.title)}&body=${e(text + '\n' + url)}`, self: true },
    { id: 'instagram', label: 'Instagram', color: '#E1306C', action: 'instagram' },
    { id: 'link', label: 'Copy link', color: '#376EB8', action: 'copy' },
    { id: 'qr', label: 'QR code', color: '#1B1F2A', action: 'qr' },
  ];
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
async function runShareAction(action, ev, going) {
  const url = shareUrl(ev);
  if (action === 'copy') { toast((await copyText(url)) ? 'Link copied — paste it anywhere 📋' : url); return; }
  if (action === 'instagram') { await copyText(url); toast('Link copied! Paste it in your Instagram story (link sticker), bio or DMs 📸'); return; }
  if (action === 'qr') { openShare(ev, going, 'qr'); return; }
  if (action === 'native') {
    try { await navigator.share({ title: ev.title, text: shareText(ev, going), url }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing was cancelled', true); }
  }
}
// Compact row of the most-used buttons (event page, order confirmation)
function quickShareHtml(ev, going = false) {
  const t = shareTargets(ev, going).filter((x) => ['whatsapp', 'facebook', 'x', 'sms', 'link'].includes(x.id));
  return t.map((x) => x.href
    ? `<a class="qs-btn" style="--c:${x.color}" href="${esc(x.href)}" ${x.self ? '' : 'target="_blank" rel="noopener"'} title="Share on ${esc(x.label)}" aria-label="Share on ${esc(x.label)}">${ICONS[x.id]}</a>`
    : `<button class="qs-btn" style="--c:${x.color}" data-qs="${x.action}" title="${esc(x.label)}" aria-label="${esc(x.label)}">${ICONS[x.id]}</button>`).join('')
    + `<button class="qs-btn qs-more" data-qs="sheet" title="More ways to share" aria-label="More ways to share">${ICONS.more}</button>`;
}
function bindQuickShare(root, ev, going = false) {
  root.querySelectorAll('[data-qs]').forEach((b) => (b.onclick = (e) => {
    e.preventDefault();
    if (b.dataset.qs === 'sheet') openShare(ev, going); else runShareAction(b.dataset.qs, ev, going);
  }));
}
// Full share sheet (modal)
function openShare(ev, going = false, view = 'main') {
  document.getElementById('shareModal')?.remove();
  const url = shareUrl(ev);
  const targets = shareTargets(ev, going);
  const wrap = document.createElement('div');
  wrap.id = 'shareModal'; wrap.className = 'modal-backdrop';
  const preview = `<div class="share-preview">${cover(ev)}<div><div class="card-date">${esc(fmtShort(ev.startsAt))}</div><strong>${esc(ev.title)}</strong><div class="muted small">${esc([ev.venue, ev.city].filter(Boolean).join(', '))}</div></div></div>`;
  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Share event">
      <div class="modal-head"><h3>${view === 'qr' ? 'QR code for this event' : (going ? "Tell your friends you're going" : 'Share this event')}</h3><button class="modal-x" aria-label="Close">×</button></div>
      ${view === 'qr' ? `
        <div class="share-qr"><img loading="lazy" decoding="async" src="${TJ.rest}qr/event.svg?id=${esc(ev.id)}" alt="QR code linking to ${esc(ev.title)}" /></div>
        <p class="muted small" style="text-align:center">Anyone who scans this with a phone camera lands on the event page. Put it on flyers, posters and screens at the venue.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary btn-sm" href="${TJ.rest}qr/event.svg?id=${esc(ev.id)}" download="${esc(ev.title.replace(/[^\w]+/g, '-'))}-QR.svg">⬇ Download QR</a><button class="btn btn-ghost btn-sm" id="qrBack">← Back to sharing</button></div>`
      : `
        ${preview}
        <div class="share-grid">
          ${navigator.share ? `<button class="share-opt" data-act="native"><span class="share-ico" style="--c:#6b7280">${SHARE_ICON.replace(/16/g, '20')}</span>Share via…</button>` : ''}
          ${targets.map((x) => x.href
            ? `<a class="share-opt" href="${esc(x.href)}" ${x.self ? '' : 'target="_blank" rel="noopener"'}><span class="share-ico" style="--c:${x.color}">${ICONS[x.id]}</span>${esc(x.label)}</a>`
            : `<button class="share-opt" data-act="${x.action}"><span class="share-ico" style="--c:${x.color}">${ICONS[x.id]}</span>${esc(x.label)}</button>`).join('')}
        </div>
        <div class="share-link"><input readonly value="${esc(url)}" aria-label="Event link" /><button class="btn btn-blue btn-sm" data-act="copy">Copy</button></div>`}
    </div>`;
  tjFloat().appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  wrap.querySelector('.modal-x').onclick = close;
  wrap.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => runShareAction(b.dataset.act, ev, going)));
  wrap.querySelectorAll('a.share-opt').forEach((a) => a.addEventListener('click', () => setTimeout(close, 300)));
  const back = wrap.querySelector('#qrBack'); if (back) back.onclick = () => openShare(ev, going);
  const inp = wrap.querySelector('.share-link input'); if (inp) inp.onclick = () => inp.select();
}
window.addEventListener('hashchange', () => document.getElementById('shareModal')?.remove());
// Share icons on event cards and dashboard rows (event delegation)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-share]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  try { const { event } = await api('/api/events/' + encodeURIComponent(b.dataset.share)); openShare(event); }
  catch (err) { toast(err.message, true); }
}, true);

// ---------- nav ----------
function renderNav() {
  if (!document.getElementById('nav')) return;
  const h = tjCurrentRoute();
  const link = (href, label) => `<a href="${href}" class="${h.startsWith(href) && href !== '#/' ? 'active' : ''}">${label}</a>`;
  let html = link('#/', 'Browse Events');
  if (!me) {
    html += link('#/register?role=organizer', 'Sell Tickets') + link('#/login', 'Log In') + `<a href="#/register" class="btn btn-primary btn-sm" style="color:#fff">Sign Up</a>`;
  } else {
    if (me.role === 'admin') html += `<a href="#/admin" class="btn btn-blue btn-sm admin-link" style="color:#fff">⚙ Admin Panel</a>`;
    if (me.role === 'organizer' || me.role === 'admin') html += link('#/dashboard', 'My Events') + `<a href="#/create" class="btn btn-primary btn-sm" style="color:#fff">+ Create Event</a>`;
    if (me.role === 'organizer' || me.role === 'admin') { const rh = me.role === 'admin' ? '#/admin/reports' : '#/reports'; html += `<a href="${rh}" class="${h.startsWith(rh) ? 'active' : ''}">📈 Reports</a>`; }
    html += link('#/tickets', me.role === 'user' ? '🎟️ My Dashboard' : 'My Tickets');
    html += `<span class="who">${esc(me.name)}<span class="role-pill ${me.role}">${ROLE_LABEL[me.role]}</span></span>`;
    html += `<button class="link" id="logoutBtn">Log Out</button>`;
  }
  $nav.innerHTML = html;
  const lo = document.getElementById('logoutBtn');
  // Everyone (admin, organizer, attendee) goes to the home page after logging out
  if (lo) lo.onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} me = null; toast('Logged out'); renderNav(); go('#/'); };
}
document.addEventListener('click', (e) => { if (e.target.closest('#menuBtn')) $nav.classList.toggle('open'); });

// ---------- router ----------
function parseHash() {
  const raw = tjCurrentRoute().slice(1);
  const [p, qs] = raw.split('?');
  return { parts: p.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}
function needLogin(role) {
  if (!me) { go('#/login?next=' + encodeURIComponent(tjCurrentRoute())); return true; }
  const allowed = role === 'organizer' ? ['organizer', 'admin'] : [role];
  if (role && !allowed.includes(me.role)) {
    const msg = role === 'admin' ? ['Administrator access required', 'Only the site administrator can open the Admin Panel.'] : ['Organizer account required', 'Only organizer accounts can create and manage events.'];
    $app.innerHTML = `<div class="empty"><div class="big">🔒</div><h2>${msg[0]}</h2><p class="muted">${msg[1]}</p><a class="btn btn-primary" href="#/">Browse events</a></div>`;
    return true;
  }
  return false;
}
// ---------- preloader (small icon in the middle of the screen while a page opens) ----------
const preAsset = (f) => TJ.assets + 'img/' + f;
function preIconUrl(p) { return p.icon === 'custom' && p.customUrl ? p.customUrl : (p.icon === 'logo' || p.icon === 'custom') ? preAsset('favicon.png') : preAsset('preloader/' + p.icon + '.svg'); }
function preApply(el, p, extra = '') {
  el.className = `tj-pre pre-${p.animation} pre-speed-${p.speed} pre-bg-${p.background}${extra}`;
  el.style.setProperty('--pre-size', (Number(p.size) || 56) + 'px');
  let img = el.querySelector('img');
  if (!img) { img = document.createElement('img'); img.alt = ''; el.appendChild(img); }
  const src = preIconUrl(p);
  if (img.getAttribute('src') !== src) img.src = src;
}
let preTimer = 0, preShownAt = 0;
function showPreloader(p = META.preloader, ms = 8000) {
  if (!p || !p.enabled) return;
  let el = document.getElementById('tjPre');
  if (!el) {
    const host = document.createElement('div'); host.className = 'tj-root tj-pre-host';
    el = document.createElement('div'); el.id = 'tjPre'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Loading');
    host.appendChild(el); document.body.appendChild(host);
  }
  preApply(el, p); preShownAt = Date.now();
  clearTimeout(preTimer); preTimer = setTimeout(() => hidePreloader(0), ms);
}
function hidePreloader(minMs = 350) {
  const el = document.getElementById('tjPre');
  if (!el) return;
  clearTimeout(preTimer);
  const wait = preShownAt ? Math.max(0, minMs - (Date.now() - preShownAt)) : 0;
  preTimer = setTimeout(() => { el.classList.add('done'); preShownAt = 0; }, wait);
}
let lastRoutePath = null;
async function route() {
  if (!TJ_SCREEN) return;
  $app = TJ_SCREEN.el;
  if (!tjScreenAllows(tjCurrentRoute())) { location.href = tjRouteUrl(tjCurrentRoute()); return; }
  const rp = parseHash().parts.join('/');
  if (lastRoutePath !== null && rp !== lastRoutePath) showPreloader();
  lastRoutePath = rp;
  try { await routePage(); } finally { hidePreloader(); }
}
async function routePage() {
  $nav.classList.remove('open');
  renderNav();
  if (TJ_SCREEN.routed) TJ_SCREEN.el.scrollIntoView({ block: 'start' }); TJ_SCREEN.routed = true;
  const { parts, params } = parseHash();
  const [a, b, c] = parts;
  try {
    if (!a) return await pageHome(params);
    if (a === 'event' && b) return await pageEvent(b);
    if (a === 'checkout' && b) return await pageCheckout(b);
    if (a === 'cart' && b === 'checkout') return await pageCartCheckout();
    if (a === 'cart') return await pageCart();
    if (a === 'login') return pageLogin(params);
    if (a === 'register') return pageRegister(params);
    if (a === 'forgot') return pageForgot(params);
    if (a === 'reset') return pageReset(params);
    if (a === 'tickets') return needLogin() || (await pageTickets());
    if (a === 'order' && b) return needLogin() || (await pageOrder(b));
    if (a === 't' && b && c) return await pagePublicTickets(b, c);
    if (a === 'dashboard') return needLogin('organizer') || (await pageDashboard());
    if (a === 'reports') return needLogin('organizer') || (await pageReports(null, params));
    if (a === 'create') return needLogin('organizer') || pageEventForm(null);
    if (a === 'edit' && b) return needLogin('organizer') || (await pageEventForm(b));
    if (a === 'attendees' && b) return needLogin('organizer') || (await pageAttendees(b));
    if (a === 'admin') return needLogin('admin') || (await pageAdmin(b || 'overview', c, params));
    $app.innerHTML = `<div class="empty"><div class="big">🎟️</div><h2>Page not found</h2><a class="btn btn-primary" href="#/">Go home</a></div>`;
  } catch (e) {
    if (e.status === 401) {
      // Tell people when the site logged them out because they were away too long
      const mins = META.security && META.security.idleMinutes;
      let lastActive = 0; try { lastActive = Number(localStorage.getItem('tj_last_active')) || 0; } catch {}
      const idle = mins && lastActive && Date.now() - lastActive > mins * 60000;
      return go('#/login?' + (idle ? 'reason=idle&' : '') + 'next=' + encodeURIComponent(tjCurrentRoute()));
    }
    $app.innerHTML = `<div class="empty"><div class="big">😕</div><h2>${esc(e.message)}</h2><a class="btn btn-primary" href="#/">Go home</a></div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------- search form (keyword, category, organizer, venue, date, year, time of day) ----------
const SEARCH_KEYS = ['q', 'category', 'organizer', 'venue', 'date', 'year', 'time'];
const SEARCH_TIMES = [['morning', 'Morning (5 AM – 12 PM)'], ['afternoon', 'Afternoon (12 – 5 PM)'], ['evening', 'Evening (5 – 9 PM)'], ['night', 'Late night (9 PM – 5 AM)']];
function searchValues(src) { const v = {}; for (const k of SEARCH_KEYS) v[k] = (src && (src.get ? src.get(k) : src[k])) || ''; return v; }
function searchParams(v, over = {}) { const p = new URLSearchParams(); for (const k of SEARCH_KEYS) { const x = k in over ? over[k] : v[k]; if (x) p.set(k, x); } return p; }
const searchActive = (v) => SEARCH_KEYS.some((k) => v[k]);
let searchOptionsP = null;
const searchOptions = () => (searchOptionsP ||= api('/api/search-options').catch(() => ({ organizers: [], venues: [], years: [] })));
function searchFormHtml(v, o = {}) {
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const keep = (list, cur) => (cur && !list.includes(cur) ? [cur, ...list] : list);
  const sel = (name, label, all, list, cur) => `<label class="sf"><span>${label}</span><select name="${name}">${opt('', all, cur)}${list.map((x) => Array.isArray(x) ? opt(x[0], x[1], cur) : opt(x, x, cur)).join('')}</select></label>`;
  return `<form class="search search-adv" role="search">
    <div class="sf-main">
      <input name="q" aria-label="Search" placeholder="${esc(o.placeholder || 'Search events, venues, organizers…')}" value="${esc(v.q)}" />
      <button class="btn btn-primary">${esc(o.button || 'Search')}</button>
    </div>
    <div class="sf-grid">
      ${o.showCategory === false ? '' : sel('category', 'Category', 'All categories', META.categories, v.category)}
      ${sel('organizer', 'Organizer', 'All organizers', keep([], v.organizer), v.organizer)}
      ${sel('venue', 'Venue', 'All venues', keep([], v.venue), v.venue)}
      <label class="sf sf-date"><span>Date</span><input type="date" name="date" value="${esc(v.date)}" min="${esc(todayLocalIso())}" aria-label="Event date" /></label>
    </div>
    <div class="sf-foot ${searchActive(v) ? '' : 'hidden'}"><a href="#" class="sf-clear">✕ Clear search</a></div>
  </form>`;
}
// Fills the organizer / venue / year lists and wires the form. onGo(URLSearchParams) runs on submit.
function wireSearchForm(form, v, onGo) {
  const submit = () => {
    const f = new FormData(form); const nv = {};
    for (const k of SEARCH_KEYS) nv[k] = String(f.get(k) || '').trim();
    onGo(searchParams(nv));
  };
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
  // dropdowns search straight away; the keyword box waits for Enter / Search
  form.querySelectorAll('select, input[type=date]').forEach((x) => x.addEventListener('change', submit));
  // the date box also searches once a full date has been typed
  const dt = form.querySelector('input[type=date]');
  if (dt) { let last = dt.value; dt.addEventListener('input', () => { if (dt.value !== last && (dt.value === '' || /^\d{4}-\d{2}-\d{2}$/.test(dt.value))) { last = dt.value; submit(); } }); dt.addEventListener('change', () => { last = dt.value; }); }
  const clr = form.querySelector('.sf-clear');
  if (clr) clr.onclick = (e) => { e.preventDefault(); onGo(new URLSearchParams()); };
  searchOptions().then((opts) => {
    const fill = (name, list) => {
      const s = form.querySelector(`select[name="${name}"]`); if (!s) return;
      const cur = v[name];
      const all = cur && !list.some((x) => norm(x) === norm(cur)) ? [cur, ...list] : list;
      s.innerHTML = s.options[0].outerHTML + all.map((x) => `<option value="${esc(x)}" ${norm(x) === norm(cur) ? 'selected' : ''}>${esc(x)}</option>`).join('');
    };
    fill('organizer', opts.organizers || []); fill('venue', opts.venues || []); fill('year', opts.years || []);
  });
}
function norm(x) { return String(x || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function todayLocalIso() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ---------- slim clock & weather bar (sits above the orange & blue box) ----------
function infoBarHtml(o = {}) {
  if (o.showClock === false && o.showWeather === false) return '';
  return `<div class="info-bar">
    ${o.showClock === false ? '' : `<div class="hero-clock ib-clock" id="homeClock" aria-live="off">
      <span class="hc-time"><span id="hcTime">--:--</span><span class="hc-sec" id="hcSec"></span><span class="hc-ampm" id="hcAmpm"></span></span>
      <span class="hc-date" id="hcDate"></span><span class="hc-zone" id="hcZone"></span></div>`}
    ${o.showWeather === false ? '' : '<div class="wx-mini ib-wx hidden" id="homeWx"></div>'}
  </div>`;
}

// ---------- Calendar of events (month view, days with events highlighted) ----------
const CAL_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function calendarHtml(o = {}) {
  return `<section class="cal-section">
    <div class="section-head"><h2>${esc(o.title || '📅 Calendar of events')}</h2><span class="muted small cal-count"></span></div>
    <div class="cal-card">
      <div class="cal-top">
        <button type="button" class="cal-nav" data-step="-1" aria-label="Previous month">‹</button>
        <h3 class="cal-title">&nbsp;</h3>
        <button type="button" class="cal-nav" data-step="1" aria-label="Next month">›</button>
        <button type="button" class="cal-today">Today</button>
      </div>
      <div class="cal-grid"><div class="loading" style="grid-column:1/-1">Loading calendar…</div></div>
      <div class="cal-day"></div>
    </div></section>`;
}
function calMoney(n, kind) { return n === null || n === undefined ? '' : priceText(kind || (n > 0 ? 'paid' : 'free'), n); }
function openCalendarDay(day, evs, hols, routeFix) {
  document.getElementById('calModal')?.remove();
  const label = new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const wrap = document.createElement('div');
  wrap.id = 'calModal'; wrap.className = 'modal-backdrop tj-root';
  const holHtml = hols.map((h) => `<div class="cal-pop-hol">🎉 <strong>${esc(h.name)}</strong>${h.note ? ` <span class="muted small">(${esc(h.note)})</span>` : ''} <span class="muted small">· Public holiday</span></div>`).join('');
  const evHtml = evs.map((e) => {
    const link = '#/event/' + encodeURIComponent(e.id);
    const img = e.imageUrl
      ? `<img src="${esc(e.imageUrl)}" alt="${esc(e.title)} flyer" loading="lazy" decoding="async" />`
      : `<div class="cal-pop-noimg" style="background:linear-gradient(135deg,${(CAT_STYLE[e.category] || ['#376eb8', '#84d65f'])[0]},${(CAT_STYLE[e.category] || ['#376eb8', '#84d65f'])[1]})"><span>${(CAT_STYLE[e.category] || [, , '🎟️'])[2]}</span></div>`;
    const price = e.ended ? '<span class="badge">Ended</span>' : e.soldOut ? '<span class="badge soldout">Sold out</span>' : e.priceFrom === null && e.salesStart ? '<span class="badge soon">On sale soon</span>' : e.salesClosed ? '<span class="badge">Sales ended</span>' : `<strong class="cal-pop-price">${esc(calMoney(e.priceFrom, e.priceKind))}</strong>`;
    return `<article class="cal-pop-ev${e.ended ? ' ended' : ''}">
      <a class="cal-pop-flyer" href="${link}">${img}</a>
      <div class="cal-pop-body">
        <div class="card-date">${esc(e.startDay === day ? e.time : 'Continues')} – ${esc(e.endTime)}${e.sessionLabel ? ' · ' + esc(e.sessionLabel) : ''}</div>
        <h4><a href="${link}">${esc(e.title)}</a></h4>
        <div class="muted small">📍 ${esc(e.city && !norm(e.venue).includes(norm(e.city)) ? e.venue + ', ' + e.city : e.venue)}</div>
        <div class="muted small">🎤 ${esc(e.organizer || '')} · <span class="tag">${esc(e.category)}</span></div>
        ${e.ended ? '' : countdownHtml(e)}
        ${e.summary ? `<p class="cal-pop-desc">${esc(e.summary)}</p>` : ''}
        <div class="cal-pop-foot">${price}<a class="btn btn-primary btn-sm" href="${link}">${e.ended ? 'View event' : e.soldOut ? 'View event' : 'Get tickets →'}</a></div>
      </div></article>`;
  }).join('');
  wrap.innerHTML = `<div class="modal cal-pop" role="dialog" aria-modal="true" aria-label="${esc(label)}">
    <div class="modal-head"><h3>📅 ${esc(label)}</h3><button class="modal-x" aria-label="Close">×</button></div>
    ${holHtml}${evHtml || (hols.length ? '<p class="muted small" style="margin:10px 0 0">No events on this day yet.</p>' : '')}
  </div>`;
  tjFloat().appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.onclick = (ev) => { if (ev.target === wrap) close(); };
  wrap.querySelector('.modal-x').onclick = close;
  wrap.querySelectorAll('a[href^="#/"]').forEach((x) => x.addEventListener('click', () => setTimeout(close, 0)));
  if (routeFix) routeFix(wrap);
  wrap.querySelector('.modal-x').focus();
}
function mountCalendar(sec) {
  if (!sec) return;
  const grid = sec.querySelector('.cal-grid'), title = sec.querySelector('.cal-title'), dayEl = sec.querySelector('.cal-day'), countEl = sec.querySelector('.cal-count');
  let data = null;
  const ym = (m) => [Number(m.slice(0, 4)), Number(m.slice(5, 7))];
  const monthName = (m) => { const [y, mo] = ym(m); return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  const shift = (m, n) => { const [y, mo] = ym(m); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
  const byDay = () => { const map = {}; for (const e of data.events) for (const d of e.days) (map[d] ||= []).push(e); return map; };
  const holDay = () => { const map = {}; for (const h of data.holidays || []) (map[h.date] ||= []).push(h); return map; };
  const fix = (root) => { if (typeof tjFixLinks === 'function') tjFixLinks(root); };
  const render = () => {
    const map = byDay(), hmap = holDay(); const [y, mo] = ym(data.month);
    const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    title.textContent = monthName(data.month);
    const cells = CAL_WD.map((w) => `<div class="cal-wd">${w}</div>`);
    for (let i = 0; i < first; i++) cells.push('<div class="cal-cell blank" aria-hidden="true"></div>');
    for (let d = 1; d <= n; d++) {
      const key = `${data.month}-${String(d).padStart(2, '0')}`, evs = map[key] || [], hols = hmap[key] || [];
      const cls = ['cal-cell', evs.length ? 'has-ev' : '', hols.length ? 'has-hol' : '', key === data.today ? 'today' : '', key < data.today ? 'past' : ''].filter(Boolean).join(' ');
      const inner = `<span class="cal-num">${d}</span>${hols.slice(0, 1).map((h) => `<span class="cal-hol" title="${esc(h.name)}">🎉 ${esc(h.name)}</span>`).join('')}${evs.slice(0, hols.length ? 1 : 2).map((e) => `<span class="cal-ev">${esc(e.title)}</span>`).join('')}${evs.length > (hols.length ? 1 : 2) ? `<span class="cal-more">+${evs.length - (hols.length ? 1 : 2)} more</span>` : ''}${evs.length || hols.length ? `<span class="cal-dots">${hols.length ? '<i class="h"></i>' : ''}${evs.slice(0, 3).map(() => '<i></i>').join('')}</span>` : ''}`;
      const aria = [...hols.map((h) => h.name + ' (public holiday)'), ...evs.map((e) => e.title)].join(', ');
      cells.push(evs.length || hols.length ? `<button type="button" class="${cls}" data-day="${key}" aria-label="${esc(d + ' ' + monthName(data.month) + ': ' + aria)}">${inner}</button>` : `<div class="${cls}">${inner}</div>`);
    }
    grid.innerHTML = cells.join('');
    const c = data.events.length, hc = (data.holidays || []).length;
    countEl.textContent = (c ? `${c} event${c === 1 ? '' : 's'}` : 'No events') + ` in ${monthName(data.month)}` + (hc ? ` · ${hc} public holiday${hc === 1 ? '' : 's'}` : '');
    grid.querySelectorAll('button[data-day]').forEach((b) => { b.onclick = () => openCalendarDay(b.dataset.day, map[b.dataset.day] || [], hmap[b.dataset.day] || [], fix); });
    dayEl.innerHTML = `<div class="cal-legend"><span><i class="lg-ev"></i>Event day — tap to see the flyer & details</span>${hc || data.holidayCountry ? `<span><i class="lg-hol"></i>Public holiday${data.holidayCountry ? ' in ' + esc(data.holidayCountry) : ''}</span>` : ''}<span><i class="lg-today"></i>Today</span></div>`;
  };
  const load = async (m) => {
    grid.style.opacity = '.5';
    try { data = await api('/api/calendar' + (m ? '?month=' + m : '')); }
    catch (e) { grid.style.opacity = ''; grid.innerHTML = `<div class="error" style="grid-column:1/-1">${esc(e.message)}</div>`; return; }
    grid.style.opacity = '';
    render();
  };
  sec.querySelectorAll('.cal-nav').forEach((b) => { b.onclick = () => data && load(shift(data.month, Number(b.dataset.step))); });
  sec.querySelector('.cal-today').onclick = () => load('');
  load('');
}

// ---------- pages ----------
async function pageHome(params) {
  const sv = searchValues(params);
  const { q, category } = sv;
  const chips = ['', ...META.categories].map((c) => {
    const p = searchParams(sv, { category: c });
    return `<a class="chip ${c === category ? 'active' : ''}" href="#/?${p}">${c ? esc(c) : 'All'}</a>`;
  }).join('');
  $app.innerHTML = `
    ${infoBarHtml()}
    <section class="hero no-side">
      <h1 class="display">Get your ticket fix.</h1>
      <p>Discover the hottest parties, concerts, comedy shows and festivals — or launch your own event and start selling tickets in minutes.</p>
      ${searchFormHtml(sv)}
      <div class="hero-cta">${me?.role === 'organizer' ? '<a class="btn btn-green" href="#/create">+ Create an event</a>' : '<span>Hosting an event?</span><a class="link" href="#/register?role=organizer">Become an organizer →</a>'}</div>
    </section>
    <div class="chips">${chips}</div>
    <section class="map-section">
      <div class="section-head"><h2>🗺️ ${searchActive(sv) ? 'These events on the map' : 'Live events on the map'}</h2><span class="muted small" id="mapCount">Tap a pin to see the event</span></div>
      <div class="events-map" id="eventsMap"><div class="loading">Loading map…</div></div>
    </section>
    ${calendarHtml()}
    <div class="section-head"><h2>${searchActive(sv) ? 'Search results' : 'Upcoming events'}</h2><span class="muted small" id="count"></span></div>
    <div class="grid" id="grid"><div class="loading">Loading events…</div></div>
    ${me?.role === 'organizer' ? '' : `
    <section class="promo-band">
      <div><h2 class="display">Throw events? Sell tickets here.</h2><p class="muted" style="margin:0">Create your event page, set ticket types and prices, track sales and check guests in at the door.</p></div>
      <a class="btn btn-primary" href="#/register?role=organizer">Start selling — it's free</a>
    </section>`}`;
  wireSearchForm($app.querySelector('form.search-adv'), sv, (p) => go('#/' + (p.toString() ? '?' + p : '')));
  mountCalendar($app.querySelector('.cal-section'));
  const p = searchParams(sv);
  if (META.weatherPlace) TJGeo.homeWeather(document.getElementById('homeWx'), META.weatherPlace);
  startHomeClock();
  const { events } = await api('/api/events?' + p);
  const mapEl = document.getElementById('eventsMap');
  const pinned = events.filter((e) => Number.isFinite(e.lat));
  document.getElementById('mapCount').textContent = pinned.length ? `${pinned.length} event${pinned.length === 1 ? '' : 's'} · tap a pin to see the event` : 'No mapped events yet';
  TJGeo.eventsMap(mapEl, events, { googleKey: META.maps?.googleMapsKey, center: META.maps?.center || { lat: 25.0582, lng: -77.3431 } })
    .catch(() => { mapEl.innerHTML = '<div class="empty" style="box-shadow:none">Map could not be loaded right now.</div>'; });
  document.getElementById('count').textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;
  document.getElementById('grid').innerHTML = events.length ? events.map(card).join('')
    : `<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><h3>No events found</h3><p class="muted">Try another search, or <a href="#/">clear the search</a>.</p></div>`;
}

async function pageEvent(id) {
  loading();
  const { event: ev } = await api('/api/events/' + encodeURIComponent(id));
  const qty = Object.fromEntries(ev.tiers.map((t) => [t.id, 0]));
  const ended = new Date(ev.endsAt) < new Date();
  const buyable = ev.status === 'published' && !ended;
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([ev.venue, ev.address, ev.city].filter(Boolean).join(', '));

  $app.innerHTML = `
    ${ev.isOwner ? `<div class="notice">${me?.role === 'admin' ? '⚙ Admin view.' : "You're the organizer of this event."} <a href="#/edit/${esc(ev.id)}">Edit event</a> · <a href="#/attendees/${esc(ev.id)}">View attendees</a></div>` : ''}
    ${ev.status === 'cancelled' ? '<div class="error">This event has been cancelled.</div>' : ''}
    ${ev.status === 'draft' ? '<div class="notice">Draft — only you can see this page. Publish it from your dashboard to start selling.</div>' : ''}
    ${cover(ev, 'big')}
    <div class="event-layout">
      <div>
        <div class="card-date">${esc(cardWhen(ev))}${ev.sessionLabel ? ' · ' + esc(ev.sessionLabel) : ''}</div>
        <div class="title-row"><h1 style="font-size:2.3rem">${esc(ev.title)}</h1>${ev.status !== 'draft' ? `<button class="btn btn-primary share-btn" id="shareBtn">${SHARE_ICON} Share</button>` : ''}</div>
        ${ev.status !== 'draft' ? `<div class="quick-share">${quickShareHtml(ev)}</div>` : ''}
        <div class="muted">Presented by <strong>${esc(ev.organizer)}</strong> · <span class="tag">${esc(ev.category)}</span></div>
        ${ev.status !== 'cancelled' ? countdownHtml(ev, true) : ''}
        <div class="event-meta">
          <div class="meta-row"><div class="meta-ico">📅</div><div>${multiDay(ev)
            ? `<strong>${esc(fmtLong(ev.startsAt))}</strong><div class="muted small">Until ${esc(fmtLong(ev.endsAt))}</div><div class="small"><span class="tag">🗓️ Multi-day event · ${Math.max(2, Math.round((new Date(new Date(ev.endsAt).toDateString()) - new Date(new Date(ev.startsAt).toDateString())) / 86400000) + 1)} days</span> One ticket covers every day.</div>`
            : `<strong>${esc(fmtLong(ev.startsAt))}</strong><div class="muted small">Ends ${esc(fmtShort(ev.endsAt))}</div>`}</div></div>
          ${(ev.series || []).length > 1 ? `<div class="meta-row"><div class="meta-ico">🔁</div><div style="flex:1"><strong>${ev.series.length} shows available</strong> <span class="muted small">Pick the day and time you want. Each show has its own tickets.</span>
            <div class="date-chips">${ev.series.map((x) => `<a class="date-chip ${x.id === ev.id ? 'on' : ''} ${x.soldOut || x.status !== 'published' || new Date(x.endsAt) < new Date() ? 'off' : ''}" href="#/event/${esc(x.id)}"><strong>${esc(fmtDay(x.startsAt))}</strong><span>${esc(new Date(x.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}${x.sessionLabel ? ' · ' + esc(x.sessionLabel) : ''}</span>${x.soldOut ? '<em>Sold out</em>' : x.status === 'cancelled' ? '<em>Cancelled</em>' : x.status === 'draft' ? '<em>Draft</em>' : new Date(x.endsAt) < new Date() ? '<em>Ended</em>' : ''}</a>`).join('')}</div></div></div>` : ''}
          <div class="meta-row"><div class="meta-ico">📍</div><div><strong>${esc(ev.venue)}</strong><div class="muted small">${esc([ev.address, ev.city].filter(Boolean).join(', '))} · <a href="#venue" id="toMap">View map</a> · <a href="${mapUrl}" target="_blank" rel="noopener">Directions</a></div>${(ev.extraVenues || []).map((x) => `<div style="margin-top:8px"><strong>${esc(x.name)}</strong><div class="muted small">${esc([x.address, x.city].filter(Boolean).join(', '))}${[x.address, x.city].some(Boolean) || x.name ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Number.isFinite(x.lat) && Number.isFinite(x.lng) ? x.lat + ',' + x.lng : [x.name, x.address, x.city].filter(Boolean).join(', '))}" target="_blank" rel="noopener">Directions</a>` : ''}</div></div>`).join('')}</div></div>
        </div>
        <div class="panel wx-card" id="eventWx"></div>
        <h2>About this event</h2>
        <div class="desc">${esc(ev.description)}</div>
        <h2 style="margin-top:28px" id="venue">📍 Venue & directions</h2>
        <div class="panel venue-map" id="venueMap"></div>
      </div>
      <div class="sticky side-col">
        <aside class="panel" id="buyPanel"></aside>
        ${ev.status !== 'draft' ? `<div class="panel side-share">
          <button class="btn btn-blue btn-block" id="shareBtn2">${SHARE_ICON} Share this event</button>
          <div class="quick-share" style="justify-content:center">${quickShareHtml(ev)}</div>
        </div>` : ''}
      </div>
    </div>
    ${ev.status !== 'draft' ? `<button class="fab-share" id="fabShare" aria-label="Share this event">${SHARE_ICON.replace(/16/g, '22')}</button>` : ''}`;

  ['shareBtn', 'shareBtn2', 'fabShare'].forEach((id) => { const b = document.getElementById(id); if (b) b.onclick = () => openShare(ev); });
  bindQuickShare($app, ev);
  TJGeo.venueMap(document.getElementById('venueMap'), ev);
  TJGeo.eventWeather(document.getElementById('eventWx'), ev);
  document.getElementById('toMap').onclick = (e) => { e.preventDefault(); document.getElementById('venue').scrollIntoView({ behavior: 'smooth' }); };

  const panel = document.getElementById('buyPanel');
  // donation tickets: amount per ticket chosen by the buyer (starts at the suggested amount or the minimum)
  const amt = {};
  for (const t of ev.tiers) if (tierKindOf(t) === 'donation') amt[t.id] = t.suggested ?? t.price;
  const unitOf = (t) => (tierKindOf(t) === 'donation' ? Number(amt[t.id]) || 0 : tierKindOf(t) === 'free' ? 0 : t.price);
  const amtOk = (t) => tierKindOf(t) !== 'donation' || !qty[t.id] || (Number.isFinite(Number(amt[t.id])) && Number(amt[t.id]) >= t.price);
  const totals = () => {
    let subtotal = 0, fees = 0, count = 0;
    for (const t of ev.tiers) { const u = unitOf(t); subtotal += u * qty[t.id]; fees += fee(u) * qty[t.id]; count += qty[t.id]; }
    return { subtotal: round2(subtotal), fees: round2(fees), total: round2(subtotal + fees), count, ok: ev.tiers.every(amtOk) };
  };

  function renderPicker() {
    const tiers = ev.tiers.map((t) => {
      if (t.visibility === 'private') return `<div class="tier tier-private">
        <div><div class="tier-name">🔒 ${esc(t.name)} <span class="badge private">Private</span></div>
          ${t.description ? `<div class="tier-desc">${esc(t.description)}</div>` : ''}
          <div class="muted small">Hidden from the public · ${t.remaining} left · <a href="#/attendees/${esc(ev.id)}">Send complimentary tickets</a></div></div>
      </div>`;
      if (tierSaleState(t) === 'soon') return `<div class="tier tier-soon">
        <div><div class="tier-name">${esc(t.name)}</div>
          ${t.description ? `<div class="tier-desc">${esc(t.description)}</div>` : ''}
          <div class="small">${tierKindOf(t) === 'donation' ? `<span class="kind-badge donation">💝 Donation</span> ${t.price > 0 ? 'Minimum ' + money(t.price) : 'Pay what you want'}` : tierKindOf(t) === 'free' || t.price === 0 ? '<span class="kind-badge free">🎁 Free</span>' : `<strong>${money(t.price)}</strong> <span class="muted">+ ${money(t.fee)} fee</span>`}</div>
          <div class="muted small">On sale ${esc(fmtLong(t.salesStart))}${t.salesEnd ? ` · until ${esc(fmtLong(t.salesEnd))}` : ''}</div></div>
        <span class="badge soon">Coming soon</span>
        <div class="tier-cd"><span class="cd-chip sale" data-cd-kind="sale" data-cd="${esc(t.salesStart)}" data-cd-end="${esc(ev.endsAt)}">🕒 <span class="cd-txt">…</span></span></div>
      </div>`;
      if (tierSaleState(t) === 'closed') return `<div class="tier tier-closed">
        <div><div class="tier-name">${esc(t.name)}</div>
          ${t.description ? `<div class="tier-desc">${esc(t.description)}</div>` : ''}
          <div class="muted small">Sales ended ${esc(fmtLong(t.salesEnd))}</div></div>
        <span class="badge">Sales ended</span>
      </div>`;
      const max = tierCap(t);
      const opts = Array.from({ length: max + 1 }, (_, i) => `<option ${i === qty[t.id] ? 'selected' : ''}>${i}</option>`).join('');
      return `<div class="tier">
        <div><div class="tier-name">${esc(t.name)}</div>
          ${t.description ? `<div class="tier-desc">${esc(t.description)}</div>` : ''}
          <div class="small">${tierKindOf(t) === 'donation'
            ? `<span class="kind-badge donation">💝 Donation</span> <strong>${t.price > 0 ? 'Minimum ' + money(t.price) : 'Pay what you want'}</strong>${t.suggested ? ` <span class="muted">· suggested ${money(t.suggested)}</span>` : ''}`
            : tierKindOf(t) === 'free' || t.price === 0 ? '<span class="kind-badge free">🎁 Free</span>' : `<strong>${money(t.price)}</strong> <span class="muted">+ ${money(t.fee)} fee</span>`}</div>
          ${tierKindOf(t) === 'donation' && qty[t.id] > 0 ? `<label class="don-amt"><span>Your donation per ticket</span><span class="don-in">$<input type="number" inputmode="decimal" min="${t.price}" step="0.01" data-amt="${esc(t.id)}" value="${esc(amt[t.id])}" /></span></label>${amtOk(t) ? '' : `<div class="error small" style="margin:6px 0 0">Minimum is ${money(t.price)}</div>`}` : ''}
          <div class="muted small">${t.remaining > 0 ? (t.remaining <= 20 ? `Only ${t.remaining} left!` : 'Available') : 'Sold out'}${salesWindowText(t) ? ' · ' + esc(salesWindowText(t)) : ''}</div>
          ${t.maxPerPerson ? `<div class="limit-note">👤 Limit ${t.maxPerPerson} per person${t.boughtByYou ? ` · you have ${t.boughtByYou}` : ''}</div>` : ''}
          </div>
        ${t.remaining > 0 && buyable ? (max > 0 ? `<select data-tier="${esc(t.id)}">${opts}</select>` : '<span class="badge">Limit reached</span>') : '<span class="badge soldout">Sold out</span>'}
        ${t.salesEnd && t.remaining > 0 && buyable ? `<div class="tier-cd"><span class="cd-chip sale-end" data-cd-kind="saleEnd" data-cd="${esc(t.salesEnd)}" data-cd-end="${esc(t.salesEnd)}">⌛ <span class="cd-txt">…</span></span></div>` : ''}
      </div>`;
    }).join('');
    const tt = totals();
    panel.innerHTML = `
      <h3>Tickets</h3>
      ${!buyable ? `<div class="notice">${ended ? 'This event has ended.' : 'Tickets are not on sale.'}</div>` : ''}
      ${tiers}
      <div class="summary">
        <div><span class="muted">Subtotal</span><span>${money(tt.subtotal)}</span></div>
        <div><span class="muted">Service fees</span><span>${money(tt.fees)}</span></div>
        <div class="total"><span>Total</span><span>${money(tt.total)}</span></div>
      </div>
      <button class="btn btn-primary btn-block" id="toCheckout" style="margin-top:14px" ${tt.count && buyable && tt.ok ? '' : 'disabled'}>${tt.count ? `Continue to checkout · ${tt.count} ticket${tt.count > 1 ? 's' : ''}` : 'Select tickets'}</button>
      ${buyable ? `<button class="btn btn-ghost btn-block add-cart-btn" id="addCart" ${tt.count && tt.ok ? '' : 'disabled'}>🛒 ${inCart ? 'Update cart' : 'Add to cart'}${tt.count ? ` · ${tt.count} ticket${tt.count > 1 ? 's' : ''}` : ''}</button>` : ''}
      ${inCart ? `<p class="small in-cart-note">🛒 ${cartCount(cartOnly(ev.id))} ticket${cartCount(cartOnly(ev.id)) === 1 ? '' : 's'} for this event in <a href="#/cart">your cart</a></p>` : ''}
      ${!me ? '<p class="muted small" style="text-align:center;margin:10px 0 0">🔒 You will create a free account (or log in) before checkout, so all your tickets are saved in your dashboard.</p>' : ''}`;
    panel.querySelectorAll('select[data-tier]').forEach((s) => (s.onchange = () => { qty[s.dataset.tier] = Number(s.value); renderPicker(); }));
    panel.querySelectorAll('input[data-amt]').forEach((inp) => {
      inp.onchange = () => { amt[inp.dataset.amt] = inp.value === '' ? '' : round2(Number(inp.value)); renderPicker(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.onchange(); } };
    });
    document.getElementById('toCheckout').onclick = () => {
      sessionStorage.setItem('tj_cart', JSON.stringify({ id: ev.id, qty, amt }));
      go('#/checkout/' + ev.id);
    };
    const ac = document.getElementById('addCart');
    if (ac) ac.onclick = () => {
      cartPut(ev, qty, amt);
      inCart = true;
      toast(`🛒 Added to your cart · ${cartCount()} ticket${cartCount() === 1 ? '' : 's'} in total`);
      renderPicker();
    };
  }

  // a ticket type's sales just opened → show its quantity picker
  panel.addEventListener('tj:onsale', () => setTimeout(renderPicker, 300));
  // tickets for this event already in the shopping cart
  let inCart = !!cartLoad()[ev.id];
  if (inCart) { const c = cartLoad()[ev.id]; for (const t of ev.tiers) if (c.qty[t.id]) { qty[t.id] = Math.min(Number(c.qty[t.id]) || 0, tierCap(t)); if (c.amt && c.amt[t.id] !== undefined && tierKindOf(t) === 'donation') amt[t.id] = c.amt[t.id]; } }
  // restore cart after login redirect
  try {
    const saved = JSON.parse(sessionStorage.getItem('tj_cart') || 'null');
    if (saved && saved.id === ev.id) for (const t of ev.tiers) { qty[t.id] = Math.min(saved.qty[t.id] || 0, tierCap(t)); if (saved.amt && saved.amt[t.id] !== undefined && tierKindOf(t) === 'donation') amt[t.id] = saved.amt[t.id]; }
  } catch {}
  renderPicker();
}

// ---------- shopping cart (tickets from several events, paid in one checkout) ----------
const CART_KEY = 'tj_basket';
function cartLoad() {
  try {
    const c = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
    for (const [id, e] of Object.entries(c)) if (!e || typeof e !== 'object' || !e.qty || Date.now() - (e.addedAt || 0) > 30 * 86400000) delete c[id];
    return c;
  } catch { return {}; }
}
function cartSave(c) {
  try { if (Object.keys(c).length) localStorage.setItem(CART_KEY, JSON.stringify(c)); else localStorage.removeItem(CART_KEY); } catch {}
  updateCartBadge();
}
const cartOnly = (id) => { const e = cartLoad()[id]; return e ? { [id]: e } : {}; };
const cartCount = (c = cartLoad()) => Object.values(c).reduce((a, e) => a + Object.values(e.qty || {}).reduce((x, y) => x + (Number(y) || 0), 0), 0);
function cartPut(ev, qty, amt) {
  const c = cartLoad();
  const q = {}, a = {};
  for (const [k, v] of Object.entries(qty)) if (Number(v) > 0) { q[k] = Number(v); if (amt && amt[k] !== undefined) a[k] = amt[k]; }
  if (Object.keys(q).length) c[ev.id] = { qty: q, amt: a, title: ev.title, addedAt: Date.now() }; else delete c[ev.id];
  cartSave(c);
}
const CART_ICON = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.6l2.6 12.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L21.5 7H6"/></svg>';
function updateCartBadge() {
  const n = cartCount();
  document.querySelectorAll('.cart-count').forEach((b) => { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; });
  document.querySelectorAll('.cart-btn').forEach((b) => { b.classList.toggle('has-items', !!n); b.setAttribute('aria-label', n ? `Shopping cart, ${n} ticket${n === 1 ? '' : 's'}` : 'Shopping cart'); });
}
function mountCartBtn() {
  const bar = document.querySelector('.topbar-inner');
  if (bar && !bar.querySelector('.cart-btn')) {
    const a = document.createElement('a');
    a.className = 'cart-btn'; a.href = '#/cart'; a.title = 'Shopping cart';
    a.innerHTML = CART_ICON + '<span class="cart-count" hidden>0</span>';
    bar.insertBefore(a, bar.querySelector('#themeSwitch') || bar.querySelector('#menuBtn'));
  }
  updateCartBadge();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountCartBtn); else mountCartBtn();
window.addEventListener('storage', (e) => { if (e.key === CART_KEY) updateCartBadge(); });

// Loads every event in the cart with live availability; quantities are trimmed to what can still be bought.
async function cartLines() {
  const c = cartLoad();
  const ids = Object.keys(c);
  const res = await Promise.allSettled(ids.map((id) => api('/api/events/' + encodeURIComponent(id))));
  const out = [];
  ids.forEach((id, i) => {
    const entry = c[id];
    if (res[i].status !== 'fulfilled') { out.push({ id, entry, ev: null, problem: 'This event is no longer available', lines: [] }); return; }
    const ev = res[i].value.event;
    const ended = new Date(ev.endsAt) < new Date();
    const problem = ev.status !== 'published' ? (ev.status === 'cancelled' ? 'This event was cancelled' : 'Tickets are not on sale') : ended ? 'This event has ended' : '';
    const lines = [];
    for (const t of ev.tiers) {
      const want = Number(entry.qty[t.id]) || 0;
      if (!want) continue;
      const open = t.visibility !== 'private' && tierSaleState(t) === 'open' && t.remaining > 0;
      const cap = open ? tierCap(t) : 0;
      const q = Math.min(want, cap);
      const unit = tierKindOf(t) === 'donation' ? Math.max(t.price, round2(Number(entry.amt?.[t.id] ?? t.suggested ?? t.price)) || 0) : tierKindOf(t) === 'free' ? 0 : t.price;
      lines.push({ t, want, qty: q, cap, unit, note: !open ? (t.remaining <= 0 ? 'Sold out' : tierSaleState(t) === 'closed' ? 'Sales ended' : tierSaleState(t) === 'soon' ? 'Not on sale yet' : 'Not available') : q < want ? `Only ${q} available for you` : '' });
    }
    out.push({ id, entry, ev, problem, lines });
  });
  return out;
}
const cartTotals = (groups) => {
  let subtotal = 0, fees = 0, count = 0;
  for (const g of groups) if (!g.problem) for (const l of g.lines) { subtotal += l.unit * l.qty; fees += fee(l.unit) * l.qty; count += l.qty; }
  return { subtotal: round2(subtotal), fees: round2(fees), total: round2(subtotal + fees), count };
};

async function pageCart() {
  loading();
  const groups = await cartLines();
  const t = cartTotals(groups);
  if (!groups.length) {
    $app.innerHTML = `<div class="empty"><div class="big">🛒</div><h2>Your cart is empty</h2><p class="muted">Pick tickets on any event page and tap <strong>Add to cart</strong>. You can collect tickets for several events and pay once.</p><a class="btn btn-primary" href="#/">Browse events</a></div>`;
    return;
  }
  $app.innerHTML = `
    <div class="section-head"><div><h1>🛒 Your cart</h1><div class="muted">${t.count} ticket${t.count === 1 ? '' : 's'} for ${groups.filter((g) => !g.problem && g.lines.some((l) => l.qty)).length} event${groups.length === 1 ? '' : 's'} · pay for everything in one checkout</div></div><a class="small" href="#/">← Keep shopping</a></div>
    <div class="checkout-layout">
      <div class="cart-list">
        ${groups.map((g) => `
        <div class="panel cart-event${g.problem ? ' cart-off' : ''}">
          <div class="cart-ev-head">
            ${g.ev ? `<a href="#/event/${esc(g.id)}" class="cart-thumb">${cover(g.ev)}</a>` : '<div class="cart-thumb cart-thumb-empty">🎟️</div>'}
            <div style="flex:1;min-width:0">
              <h3 style="margin:0 0 2px">${g.ev ? `<a href="#/event/${esc(g.id)}">${esc(g.ev.title)}</a>` : esc(g.entry.title || 'Event')}</h3>
              ${g.ev ? `<div class="muted small">📅 ${esc(fmtLong(g.ev.startsAt))}</div><div class="muted small">📍 ${esc([g.ev.venue, g.ev.city].filter(Boolean).join(', '))}</div>` : ''}
              ${g.problem ? `<div class="notice" style="margin:8px 0 0">${esc(g.problem)}. Remove it to continue.</div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" data-cart-remove="${esc(g.id)}" title="Remove from cart">✕ Remove</button>
          </div>
          ${g.lines.map((l) => `
          <div class="cart-line">
            <div><strong>${esc(l.t.name)}</strong> <span class="muted small">${tierKindOf(l.t) === 'donation' ? `💝 ${money(l.unit)} each` : l.unit ? `${money(l.unit)} + ${money(fee(l.unit))} fee` : 'Free'}</span>${l.note ? `<div class="small cart-warn">⚠️ ${esc(l.note)}</div>` : ''}</div>
            ${l.cap > 0 && !g.problem ? `<select data-cart-ev="${esc(g.id)}" data-cart-tier="${esc(l.t.id)}" aria-label="Quantity">${Array.from({ length: l.cap + 1 }, (_, i) => `<option ${i === l.qty ? 'selected' : ''}>${i}</option>`).join('')}</select>` : '<span class="badge">Unavailable</span>'}
            <strong class="cart-amt">${l.qty ? (l.unit ? money(l.unit * l.qty) : 'Free') : '—'}</strong>
          </div>`).join('')}
        </div>`).join('')}
      </div>
      <aside class="panel checkout-summary">
        <h3 style="margin-top:0">Order summary</h3>
        <div class="summary">
          ${groups.filter((g) => !g.problem && g.lines.some((l) => l.qty)).map((g) => `<div><span>${esc(g.ev.title)} <span class="muted small">× ${g.lines.reduce((a, l) => a + l.qty, 0)}</span></span><span>${money(round2(g.lines.reduce((a, l) => a + l.unit * l.qty, 0)))}</span></div>`).join('')}
          <div><span class="muted">Service fees</span><span>${money(t.fees)}</span></div>
          <div class="total"><span>Total</span><span>${money(t.total)}</span></div>
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="cartGo" style="margin-top:12px" ${t.count && !groups.some((g) => g.problem) ? '' : 'disabled'}>Checkout · ${t.count} ticket${t.count === 1 ? '' : 's'}</button>
        ${groups.some((g) => g.problem) ? '<p class="muted small" style="text-align:center">Remove the events that are no longer available to continue.</p>' : ''}
        ${!me ? '<p class="muted small" style="text-align:center;margin:10px 0 0">🔒 You will create a free account (or log in) before paying, so all your tickets are saved in your dashboard.</p>' : ''}
        <button class="btn btn-ghost btn-block btn-sm" id="cartClear" style="margin-top:10px">Empty cart</button>
      </aside>
    </div>`;
  $app.querySelectorAll('[data-cart-remove]').forEach((b) => (b.onclick = () => { const c = cartLoad(); delete c[b.dataset.cartRemove]; cartSave(c); pageCart(); }));
  $app.querySelectorAll('select[data-cart-ev]').forEach((s) => (s.onchange = () => {
    const c = cartLoad(); const e = c[s.dataset.cartEv]; if (!e) return;
    const v = Number(s.value);
    if (v) e.qty[s.dataset.cartTier] = v; else delete e.qty[s.dataset.cartTier];
    if (!Object.keys(e.qty).length) delete c[s.dataset.cartEv];
    cartSave(c); pageCart();
  }));
  document.getElementById('cartClear').onclick = () => { if (confirm('Remove everything from your cart?')) { cartSave({}); pageCart(); } };
  document.getElementById('cartGo').onclick = () => {
    // keep the trimmed quantities, then continue
    const c = cartLoad();
    for (const g of groups) if (c[g.id]) { for (const l of g.lines) { if (l.qty) c[g.id].qty[l.t.id] = l.qty; else delete c[g.id].qty[l.t.id]; } if (!Object.keys(c[g.id].qty).length) delete c[g.id]; }
    cartSave(c);
    go(me ? '#/cart/checkout' : '#/register?role=user&from=checkout&next=' + encodeURIComponent('#/cart/checkout'));
  };
}

const orderPdfHref = (id) => (typeof TJ !== 'undefined' && TJ.rest ? `${TJ.rest}orders/${encodeURIComponent(id)}/tickets.pdf?_wpnonce=${TJ.nonce}` : `/api/orders/${encodeURIComponent(id)}/tickets.pdf`);
async function pageCartCheckout() {
  if (!me) { go('#/register?role=user&from=checkout&next=' + encodeURIComponent('#/cart/checkout')); return; }
  loading();
  const groups = (await cartLines()).filter((g) => !g.problem && g.lines.some((l) => l.qty));
  const t = cartTotals(groups);
  if (!t.count) { go('#/cart'); return; }
  const np = String(me.name || '').trim().split(/\s+/);
  const nameParts = { first: np.length > 1 ? np.slice(0, -1).join(' ') : (np[0] || ''), last: np.length > 1 ? np[np.length - 1] : '' };
  const slotsOf = (g) => g.lines.flatMap((l) => Array(l.qty).fill(l.t));
  $app.innerHTML = `
    <div class="checkout-steps"><span class="done">1 · Cart</span><span class="done">2 · Account ✓</span><span class="on">3 · Checkout</span><span>4 · Your tickets</span></div>
    <div class="section-head"><div><a href="#/cart" class="small">← Back to cart</a><h1>Checkout</h1><div class="muted">Signed in as <strong>${esc(me.name)}</strong> (${esc(me.email)}) · your tickets will be saved to <a href="#/tickets">My Dashboard</a></div></div></div>
    <div class="checkout-layout">
      <div class="panel">
        ${errBox('coErr')}
        <form id="ccForm">
          <h3>🎟️ Your details</h3>
          <div class="row">
            <div class="field"><label>First name <span class="req">*</span></label><input name="buyerFirstName" autocomplete="given-name" required maxlength="40" value="${esc(nameParts.first)}" /></div>
            <div class="field"><label>Last name <span class="req">*</span></label><input name="buyerLastName" autocomplete="family-name" required maxlength="40" value="${esc(nameParts.last)}" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Email for tickets & QR codes</label><input name="buyerEmail" type="email" autocomplete="email" required value="${esc(me.email)}" /></div>
            <div class="field"><label>Mobile number <span class="muted small">(we'll text your tickets)</span></label><input name="buyerPhone" type="tel" autocomplete="tel" required placeholder="242-555-1234" value="${esc(me.phone || '')}" /></div>
          </div>
          ${groups.some((g) => slotsOf(g).length > 1) ? `
          <h3 style="margin-top:10px">👥 Who's coming? <span class="muted small" style="font-weight:500">(optional)</span></h3>
          <p class="muted small" style="margin-top:-4px">The first ticket for each event is yours. Add a name and email for your guests and we'll email each person their own ticket with a PDF. Leave a ticket blank to keep it in your email.</p>
          ${groups.map((g) => slotsOf(g).length > 1 ? `<div class="att-event"><div class="att-ev-title">${esc(g.ev.title)}</div><div class="att-list">${slotsOf(g).map((tt, i) => i === 0 ? '' : `
            <div class="att-row">
              <div class="att-label">Ticket ${i + 1} · ${esc(tt.name)}</div>
              <div class="row">
                <div class="field"><label>Guest name</label><input data-cart-att-name="${esc(g.id)}:${i}" maxlength="80" autocomplete="off" placeholder="Full name" /></div>
                <div class="field"><label>Guest email</label><input data-cart-att-email="${esc(g.id)}:${i}" type="email" maxlength="160" autocomplete="off" placeholder="name@example.com" /></div>
              </div>
            </div>`).join('')}</div></div>` : '').join('')}` : ''}
          ${t.total > 0 ? `
          <h3 style="margin-top:10px">💳 Payment</h3>
          <div class="notice">Demo mode — no real charge. Use any test card, e.g. 4242 4242 4242 4242.</div>
          <div class="field"><label>Name on card</label><input name="cardHolder" autocomplete="cc-name" required value="${esc(me.name)}" /></div>
          <div class="field"><label>Card number</label><input name="cardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" required /></div>
          <div class="row"><div class="field"><label>Expiry</label><input name="expiry" placeholder="MM/YY" autocomplete="cc-exp" required /></div>
          <div class="field"><label>CVC</label><input name="cvc" inputmode="numeric" placeholder="123" autocomplete="cc-csc" required /></div></div>` : ''}
          ${META.captcha?.checkout ? '<div class="captcha-box" id="ccCaptcha"></div>' : ''}
          <button class="btn btn-primary btn-block btn-lg" id="ccPay">${t.total > 0 ? `🔒 Pay ${money(t.total)}` : 'Get my free tickets'}</button>
          <p class="muted small" style="text-align:center;margin:10px 0 0">One payment for everything. You'll get each event's QR tickets by email and text, and they'll always be in your dashboard.</p>
        </form>
      </div>
      <aside class="panel checkout-summary">
        <h3 style="margin-top:0">🛒 ${t.count} ticket${t.count === 1 ? '' : 's'} · ${groups.length} event${groups.length === 1 ? '' : 's'}</h3>
        <div class="summary">
          ${groups.map((g) => `<div class="cart-sum-ev"><strong>${esc(g.ev.title)}</strong><span class="muted small">${esc(fmtLong(g.ev.startsAt))}</span></div>${g.lines.filter((l) => l.qty).map((l) => `<div><span>${l.qty} × ${esc(l.t.name)}</span><span>${l.unit ? money(l.unit * l.qty) : 'Free'}</span></div>`).join('')}`).join('')}
          <div><span class="muted">Service fees</span><span>${money(t.fees)}</span></div>
          <div class="total"><span>Total</span><span>${money(t.total)}</span></div>
        </div>
        <a class="btn btn-ghost btn-block btn-sm" style="margin-top:12px" href="#/cart">✏️ Change cart</a>
      </aside>
    </div>`;
  const cap = META.captcha?.checkout ? Captcha.mount(document.getElementById('ccCaptcha')) : null;
  document.getElementById('ccForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.buyerFirstName = (f.buyerFirstName || '').trim(); f.buyerLastName = (f.buyerLastName || '').trim();
    if (!f.buyerFirstName || !f.buyerLastName) { showErr('coErr', 'Please enter your first and last name.'); return; }
    const carts = groups.map((g) => ({
      eventId: g.id,
      items: g.lines.filter((l) => l.qty).map((l) => ({ tierId: l.t.id, qty: l.qty, ...(tierKindOf(l.t) === 'donation' ? { amount: l.unit } : {}) })),
      attendees: slotsOf(g).map((_, i) => {
        if (!i) return {};
        const v = (k) => ((document.querySelector(`[data-cart-att-${k}="${g.id}:${i}"]`) || {}).value || '').trim();
        return { name: v('name'), email: v('email') };
      }),
    }));
    for (const [gi, c] of carts.entries()) { const m = c.attendees.findIndex((a) => a.email && !a.name); if (m > 0) { showErr('coErr', `${groups[gi].ev.title}: please enter a name for ticket ${m + 1}, or clear its email.`); return; } }
    const captcha = cap ? cap.token() : '';
    if (cap && !captcha) { showErr('coErr', 'Please tick "I\'m not a robot" to complete your purchase.'); return; }
    const btn = document.getElementById('ccPay'); btn.disabled = true; btn.textContent = 'Processing…';
    try {
      const r = await api('/api/cart/checkout', { method: 'POST', body: {
        carts, buyerFirstName: f.buyerFirstName, buyerLastName: f.buyerLastName, buyerEmail: f.buyerEmail, buyerPhone: f.buyerPhone,
        payment: { cardHolder: f.cardHolder, cardNumber: f.cardNumber, expiry: f.expiry, cvc: f.cvc }, captcha,
      } });
      cartSave({});
      sessionStorage.removeItem('tj_cart');
      const n = r.orders.reduce((a, o) => a + o.tickets.length, 0);
      toast(`You're going! 🎉 ${n} ticket${n === 1 ? '' : 's'} saved to your dashboard`);
      window.scrollTo(0, 0);
      $app.innerHTML = `
        <div class="checkout-steps"><span class="done">1 · Cart</span><span class="done">2 · Account ✓</span><span class="done">3 · Checkout</span><span class="on">4 · Your tickets</span></div>
        <div class="form-page"><div class="form-card" style="max-width:720px">
          <h1 class="display" style="font-size:2.2rem">🎉 You're going!</h1>
          <p>${n} ticket${n === 1 ? '' : 's'} for ${r.orders.length} event${r.orders.length === 1 ? '' : 's'}. We've emailed your QR tickets${r.orders.some((o) => o.tickets.some((x) => x.holderEmail)) ? ' and sent each guest their own ticket' : ''}. Total paid: <strong>${money(round2(r.orders.reduce((a, o) => a + o.total, 0)))}</strong>.</p>
          <div class="cart-done">${r.orders.map((o) => `
            <div class="cart-done-row">
              <div><strong>${esc(o.event ? o.event.title : 'Event')}</strong><div class="muted small">${o.tickets.length} ticket${o.tickets.length === 1 ? '' : 's'} · Order ${esc(o.id.slice(-8).toUpperCase())}${o.event ? ' · ' + esc(fmtLong(o.event.startsAt)) : ''}</div></div>
              <div class="actions"><a class="btn btn-blue btn-sm" href="#/order/${esc(o.id)}">View tickets</a><a class="btn btn-ghost btn-sm" href="${orderPdfHref(o.id)}" download>⬇ PDF</a></div>
            </div>`).join('')}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-primary" href="#/tickets">Go to My Dashboard</a><a class="btn btn-ghost" href="#/">Find more events</a></div>
        </div></div>`;
    } catch (err) { showErr('coErr', err.message); btn.disabled = false; btn.textContent = 'Try again'; if (cap) cap.reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };
}

// ---------- checkout page (account required) ----------
async function pageCheckout(id) {
  if (!me) {
    // Force an account before checkout: new visitors create one, existing customers can log in from there.
    go('#/register?role=user&from=checkout&next=' + encodeURIComponent('#/checkout/' + id));
    return;
  }
  loading();
  const { event: ev } = await api('/api/events/' + encodeURIComponent(id));
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('tj_cart') || 'null'); } catch {}
  const qty = {};
  for (const t of ev.tiers) if (t.visibility !== 'private') qty[t.id] = saved && saved.id === ev.id ? Math.min(saved.qty[t.id] || 0, tierCap(t)) : 0;
  const lines = ev.tiers.filter((t) => qty[t.id] > 0);
  const amt = {};
  for (const t of lines) amt[t.id] = tierKindOf(t) === 'donation' ? Math.max(t.price, round2(Number(saved?.amt?.[t.id] ?? t.suggested ?? t.price)) || 0) : tierKindOf(t) === 'free' ? 0 : t.price;
  const ended = new Date(ev.endsAt) < new Date();
  if (!lines.length || ev.status !== 'published' || ended) {
    $app.innerHTML = `<div class="empty"><div class="big">🛒</div><h2>${ended ? 'This event has ended' : ev.status !== 'published' ? 'Tickets are not on sale' : 'Your cart is empty'}</h2><p class="muted">Pick your tickets on the event page first.</p><a class="btn btn-primary" href="#/event/${esc(ev.id)}">Back to ${esc(ev.title)}</a></div>`;
    return;
  }
  const subtotal = round2(lines.reduce((a, t) => a + amt[t.id] * qty[t.id], 0));
  const fees = round2(lines.reduce((a, t) => a + fee(amt[t.id]) * qty[t.id], 0));
  const total = round2(subtotal + fees);
  const count = lines.reduce((a, t) => a + qty[t.id], 0);
  const slots = lines.flatMap((t) => Array(qty[t.id]).fill(t)); // one entry per ticket, same order the server creates them
  const np = String(me.name || '').trim().split(/\s+/);
  const nameParts = { first: np.length > 1 ? np.slice(0, -1).join(' ') : (np[0] || ''), last: np.length > 1 ? np[np.length - 1] : '' };
  $app.innerHTML = `
    <div class="checkout-steps"><span class="done">1 · Tickets</span><span class="done">2 · Account ✓</span><span class="on">3 · Checkout</span><span>4 · Your tickets</span></div>
    <div class="section-head"><div><a href="#/event/${esc(ev.id)}" class="small">← Back to event</a><h1>Checkout</h1><div class="muted">Signed in as <strong>${esc(me.name)}</strong> (${esc(me.email)}) · your tickets will be saved to <a href="#/tickets">My Dashboard</a></div></div></div>
    <div class="checkout-layout">
      <div class="panel">
        ${errBox('coErr')}
        <form id="coForm">
          <h3>🎟️ Attendee details</h3>
          <div class="row">
            <div class="field"><label>Attendee first name <span class="req">*</span></label><input name="buyerFirstName" autocomplete="given-name" required maxlength="40" value="${esc(nameParts.first)}" placeholder="First name" /></div>
            <div class="field"><label>Attendee last name <span class="req">*</span></label><input name="buyerLastName" autocomplete="family-name" required maxlength="40" value="${esc(nameParts.last)}" placeholder="Last name" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Email for tickets & QR codes</label><input name="buyerEmail" type="email" autocomplete="email" required value="${esc(me.email)}" /></div>
            <div class="field"><label>Mobile number <span class="muted small">(we'll text your tickets)</span></label><input name="buyerPhone" type="tel" autocomplete="tel" required placeholder="242-555-1234" value="${esc(me.phone || '')}" /></div>
          </div>
          ${count > 1 ? `
          <h3 style="margin-top:10px">👥 Who's coming? <span class="muted small" style="font-weight:500">(optional)</span></h3>
          <p class="muted small" style="margin-top:-4px">Ticket 1 is yours. Add a name and email for your guests and we'll email each person their own ticket with a PDF they can download or share. Leave a ticket blank to keep it in your email.</p>
          <div class="att-list">${slots.map((t, i) => i === 0 ? '' : `
            <div class="att-row">
              <div class="att-label">Ticket ${i + 1} · ${esc(t.name)}</div>
              <div class="row">
                <div class="field"><label>Guest name</label><input data-att-name="${i}" maxlength="80" autocomplete="off" placeholder="Full name" /></div>
                <div class="field"><label>Guest email</label><input data-att-email="${i}" type="email" maxlength="160" autocomplete="off" placeholder="name@example.com" /></div>
              </div>
            </div>`).join('')}</div>` : ''}
          ${total > 0 ? `
          <h3 style="margin-top:10px">💳 Payment</h3>
          <div class="notice">Demo mode — no real charge. Use any test card, e.g. 4242 4242 4242 4242.</div>
          <div class="field"><label>Name on card</label><input name="cardHolder" autocomplete="cc-name" required value="${esc(me.name)}" /></div>
          <div class="field"><label>Card number</label><input name="cardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" required /></div>
          <div class="row"><div class="field"><label>Expiry</label><input name="expiry" placeholder="MM/YY" autocomplete="cc-exp" required /></div>
          <div class="field"><label>CVC</label><input name="cvc" inputmode="numeric" placeholder="123" autocomplete="cc-csc" required /></div></div>` : ''}
          ${META.captcha?.checkout ? '<div class="captcha-box" id="coCaptcha"></div>' : ''}
          <button class="btn btn-primary btn-block btn-lg" id="payBtn">${total > 0 ? `🔒 Pay ${money(total)}` : 'Get my free tickets'}</button>
          <p class="muted small" style="text-align:center;margin:10px 0 0">You'll get your QR tickets by email and text, and they'll always be in your dashboard to view or download.</p>
        </form>
      </div>
      <aside class="panel checkout-summary">
        <a href="#/event/${esc(ev.id)}">${cover(ev)}</a>
        <h3 style="margin:12px 0 2px">${esc(ev.title)}</h3>
        <div class="muted small">📅 ${esc(fmtLong(ev.startsAt))}</div>
        <div class="muted small">📍 ${esc([ev.venue, ev.city].filter(Boolean).join(', '))}</div>
        <div class="summary">
          ${lines.map((t) => `<div><span>${qty[t.id]} × ${esc(t.name)}${tierKindOf(t) === 'donation' ? ` <span class="muted small">(💝 ${money(amt[t.id])} each)</span>` : ''}</span><span>${amt[t.id] ? money(amt[t.id] * qty[t.id]) : 'Free'}</span></div>`).join('')}
          <div><span class="muted">Service fees</span><span>${money(fees)}</span></div>
          <div class="total"><span>Total</span><span>${money(total)}</span></div>
        </div>
        <a class="btn btn-ghost btn-block btn-sm" style="margin-top:12px" href="#/event/${esc(ev.id)}">✏️ Change tickets</a>
      </aside>
    </div>`;
  const cap = META.captcha?.checkout ? Captcha.mount(document.getElementById('coCaptcha')) : null;
  document.getElementById('coForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.buyerFirstName = (f.buyerFirstName || '').trim(); f.buyerLastName = (f.buyerLastName || '').trim();
    if (!f.buyerFirstName || !f.buyerLastName) { showErr('coErr', 'Please enter the attendee\'s first and last name.'); return; }
    const attendees = slots.map((_, i) => {
      if (!i) return {};
      const v = (k) => ((document.querySelector(`[data-att-${k}="${i}"]`) || {}).value || '').trim();
      return { name: v('name'), email: v('email') };
    });
    const missing = attendees.findIndex((a) => a.email && !a.name);
    if (missing > 0) { showErr('coErr', `Please enter a name for ticket ${missing + 1}, or clear its email.`); return; }
    const captcha = cap ? cap.token() : '';
    if (cap && !captcha) { showErr('coErr', 'Please tick "I\'m not a robot" to complete your purchase.'); return; }
    const btn = document.getElementById('payBtn'); btn.disabled = true; btn.textContent = 'Processing…';
    try {
      const { order } = await api(`/api/events/${ev.id}/checkout`, { method: 'POST', body: {
        items: Object.entries(qty).filter(([, q]) => q > 0).map(([tierId, q]) => ({ tierId, qty: q, ...(amt[tierId] !== undefined ? { amount: amt[tierId] } : {}) })),
        buyerFirstName: f.buyerFirstName, buyerLastName: f.buyerLastName, buyerEmail: f.buyerEmail, buyerPhone: f.buyerPhone, attendees,
        payment: { cardHolder: f.cardHolder, cardNumber: f.cardNumber, expiry: f.expiry, cvc: f.cvc }, captcha,
      } });
      sessionStorage.removeItem('tj_cart');
      toast(`You're going! 🎉 ${count} ticket${count > 1 ? 's' : ''} saved to your dashboard`);
      go('#/order/' + order.id);
    } catch (err) { showErr('coErr', err.message); btn.disabled = false; btn.textContent = 'Try again'; if (cap) cap.reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };
}

// ---------- log in & security helpers ----------
const minPw = () => (META.security && META.security.minPassword) || 8;
const resetAllowed = () => !META.security || META.security.allowReset !== false;
const forgotUrl = () => (window.TJ_CONFIG && TJ_CONFIG.lostPassword) || '#/forgot';
const durText = (min) => (min % 1440 === 0 ? `${min / 1440} day${min === 1440 ? '' : 's'}` : min % 60 === 0 ? `${min / 60} hour${min === 60 ? '' : 's'}` : `${min} minute${min === 1 ? "" : "s"}`);
const homeFor = (u) => ({ organizer: '#/dashboard', admin: '#/admin' }[u.role] || '#/tickets');

function pageLogin(params) {
  const next = params.get('next') || '';
  const reason = params.get('reason');
  $app.innerHTML = `
    <div class="form-page"><div class="form-card">
      <h1 class="display" style="font-size:2rem">Welcome back</h1>
      <p class="muted">${params.get('from') === 'checkout' ? 'Log in to finish checking out — your tickets are still selected.' : 'Log in to buy tickets or manage your events.'}</p>
      ${reason === 'idle' ? `<div class="notice">🔒 You were logged out after ${esc(durText((META.security && META.security.idleMinutes) || 0))} with no activity. Please log in again.</div>` : ''}
      ${errBox('loginErr')}
      <form id="loginForm">
        <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
        <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required /></div>
        ${resetAllowed() ? `<p class="small forgot-row"><a class="forgot-link" href="${esc(forgotUrl())}">Forgot your password?</a></p>` : ''}
        <button class="btn btn-primary btn-block">Log In</button>
      </form>
      <p class="muted small" style="text-align:center;margin-top:16px">New to TicketJunkies? <a href="#/register?role=user${params.get('from') === 'checkout' ? '&from=checkout' : ''}${next ? '&next=' + encodeURIComponent(next) : ''}">Create a free account</a></p>
    </div></div>`;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      me = user; toast(`Welcome back, ${user.name.split(' ')[0]}!`);
      // Admins → Admin Panel, organizers → Organizer Dashboard, attendees → My Ticket Dashboard.
      // Only a purchase in progress (checkout, cart, an order or ticket link) returns to where the person was.
      go(next && /^#\/(checkout|cart|order|t)\//.test(next + '/') ? next : homeFor(user));
    } catch (err) { showErr('loginErr', err.message); }
  };
}

function pageForgot() {
  if (!resetAllowed()) { $app.innerHTML = '<div class="empty"><div class="big">🔒</div><h2>Password resets are turned off</h2><p class="muted">Please contact support for help with your account.</p><a class="btn btn-primary" href="#/login">Back to log in</a></div>'; return; }
  $app.innerHTML = `
    <div class="form-page"><div class="form-card" id="forgotCard">
      <h1 class="display" style="font-size:2rem">Forgot your password?</h1>
      <p class="muted">Enter the email you use for TicketJunkies and we'll send you a link to choose a new password.</p>
      ${errBox('fErr')}
      <form id="forgotForm">
        <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
        <button class="btn btn-primary btn-block">Email me a reset link</button>
      </form>
      <p class="muted small" style="text-align:center;margin-top:16px"><a href="#/login">Back to log in</a></p>
    </div></div>`;
  document.getElementById('forgotForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    try {
      const r = await api('/api/auth/forgot', { method: 'POST', body: { email } });
      document.getElementById('forgotCard').innerHTML = `<h1 class="display" style="font-size:2rem">📧 Check your email</h1><p>If there's a TicketJunkies account for <strong>${esc(email)}</strong>, we've sent it a link to choose a new password. The link works for <strong>${esc(r.valid)}</strong>.</p><p class="muted small">Can't find it? Check your spam or junk folder.</p><a class="btn btn-ghost btn-block" href="#/login">Back to log in</a>`;
    } catch (err) { showErr('fErr', err.message); }
  };
}

function pageReset(params) {
  const token = params.get('token') || '';
  $app.innerHTML = `
    <div class="form-page"><div class="form-card">
      <h1 class="display" style="font-size:2rem">Choose a new password</h1>
      <p class="muted">Pick a password you don't use anywhere else.</p>
      ${errBox('rErr')}
      <form id="resetForm">
        <div class="field"><label>New password</label><input name="password" type="password" autocomplete="new-password" minlength="${minPw()}" required /><span class="muted small">At least ${minPw()} characters.</span></div>
        <div class="field"><label>Type it again</label><input name="confirm" type="password" autocomplete="new-password" minlength="${minPw()}" required /></div>
        <button class="btn btn-primary btn-block">Save new password</button>
      </form>
      <p class="muted small" style="text-align:center;margin-top:16px">Link expired? <a href="#/forgot">Ask for a new one</a></p>
    </div></div>`;
  document.getElementById('resetForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.confirm.value) return showErr('rErr', "The two passwords don't match");
    try {
      const { user } = await api('/api/auth/reset', { method: 'POST', body: { token, password: f.password.value } });
      me = user; renderNav(); toast("Password changed. You're logged in.");
      go(homeFor(user));
    } catch (err) { showErr('rErr', err.message); }
  };
}

function pageRegister(params) {
  let role = ['organizer', 'promoter'].includes(params.get('role')) ? 'organizer' : 'user';
  const next = params.get('next') || '';
  $app.innerHTML = `
    <div class="form-page signup"><div class="form-card">
      <h1 class="display" style="font-size:2rem">Create your account</h1>
      ${params.get('from') === 'checkout' ? '<div class="notice gate-notice">🎟️ <strong>Almost there!</strong> Create your free attendee account to finish checking out. Your tickets are still selected, and every purchase will be saved in your personal ticket dashboard.</div>' : '<p class="muted">Choose how you\'ll use TicketJunkies.</p>'}
      ${errBox('regErr')}
      <form id="regForm">
        <div class="role-pick">
          <label class="role-opt" data-role="user"><input type="radio" name="role" value="user" /><div class="ico">🎟️</div><strong>Attendee</strong><span class="small">Discover events & buy tickets</span></label>
          <label class="role-opt" data-role="organizer"><input type="radio" name="role" value="organizer" /><div class="ico">📣</div><strong>Organizer</strong><span class="small">Create events & sell tickets</span></label>
        </div>
        <p class="muted small req-note">All fields marked <span class="req">*</span> are required.</p>
        <div class="signup-grid">
        <div class="field"><label>Full name <span class="req">*</span></label><input name="name" autocomplete="name" required /></div>
        <div class="field"><label>Mobile number <span class="req">*</span> <span class="muted small">(for ticket texts)</span></label><input name="phone" type="tel" autocomplete="tel" placeholder="242-555-1234" required /></div>
        <div class="field hidden" id="orgField"><label>Organizer name <span class="req">*</span></label><input name="organization" placeholder="e.g. Junkie Nights Entertainment" /><span class="muted small">Your company or brand name. It shows on your event pages and in the Admin Panel.</span></div>
        <div class="field"><label>Email <span class="req">*</span></label><input name="email" type="email" autocomplete="email" required /></div>
        <div class="field"><label>Password <span class="req">*</span></label><input name="password" type="password" autocomplete="new-password" minlength="${minPw()}" required /><span class="muted small">At least ${minPw()} characters.</span></div>
        </div>
        ${META.captcha?.register ? '<div class="captcha-box" id="regCaptcha"></div>' : ''}
        <button class="btn btn-primary btn-block" id="regBtn">Create account</button>
        ${params.get('from') === 'checkout' ? '<p class="muted small" style="text-align:center;margin:10px 0 0">Next: you\'ll go straight back to checkout.</p>' : ''}
      </form>
      <p class="muted small" style="text-align:center;margin-top:16px">Already have an account? <a href="#/login?${params.get('from') === 'checkout' ? 'from=checkout&' : ''}${next ? 'next=' + encodeURIComponent(next) : ''}">Log in</a></p>
    </div></div>`;
  const setRole = (r) => {
    role = r;
    document.querySelectorAll('.role-opt').forEach((el) => { el.classList.toggle('selected', el.dataset.role === r); el.querySelector('input').checked = el.dataset.role === r; });
    document.getElementById('orgField').classList.toggle('hidden', r !== 'organizer');
    document.querySelector('#orgField input').required = r === 'organizer';
    document.getElementById('regBtn').textContent = r === 'organizer' ? 'Create organizer account' : 'Create account';
  };
  document.querySelectorAll('.role-opt').forEach((el) => (el.onclick = () => setRole(el.dataset.role)));
  setRole(role);
  const cap = META.captcha?.register ? Captcha.mount(document.getElementById('regCaptcha')) : null;
  document.getElementById('regForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target)); body.role = role;
    delete body['g-recaptcha-response'];
    body.captcha = cap ? cap.token() : '';
    if (cap && !body.captcha) { showErr('regErr', 'Please tick "I\'m not a robot" to create your account.'); return; }
    const btn = document.getElementById('regBtn'); btn.disabled = true;
    try {
      const { user } = await api('/api/auth/register', { method: 'POST', body });
      me = user; toast(`Welcome to TicketJunkies, ${user.name.split(' ')[0]}!`);
      go(next || (user.role === 'organizer' ? '#/create' : '#/tickets'));
    } catch (err) { showErr('regErr', err.message); btn.disabled = false; if (cap) cap.reset(); }
  };
}

const stub = (t, ev) => `
  <div class="stub">
    <div class="stub-left">${esc(t.tierName)}</div>
    <div class="stub-right">
      <div class="muted small">${esc(ev?.title || '')}</div>
      <div class="code">${esc(t.code)}</div>
      ${t.checkedIn ? '<div class="checked">✓ Checked in</div>' : ''}
    </div>
    <a class="stub-qr-link" href="${TJ.rest}qr/${esc(t.code)}.png" download="${esc(t.code)}.png" title="Download this QR code as an image"><img class="stub-qr" loading="lazy" decoding="async" src="${TJ.rest}qr/${esc(t.code)}.svg" alt="QR code ${esc(t.code)}" /><span>⬇ QR</span></a>
  </div>`;

function orderBlock(o) {
  const ev = o.event || { title: 'Event removed', category: '' };
  return `<div class="order">
    <div class="order-head">
      <a href="#/event/${esc(ev.id || '')}">${cover(ev)}</a>
      <div style="flex:1">
        <div class="card-date">${ev.startsAt ? esc(fmtLong(ev.startsAt)) : ''}</div>
        <h3 style="margin:2px 0">${esc(ev.title)}</h3>
        <div class="muted small">${esc([ev.venue, ev.city].filter(Boolean).join(' · '))}</div>
        ${ev.status === 'cancelled' ? '<span class="badge cancelled">Event cancelled</span>' : ''}
        ${o.status === 'refunded' ? '<span class="badge cancelled">Refunded — tickets void</span>' : ''}
        ${o.test ? '<span class="badge test">🧪 Test order</span>' : ''}
      </div>
      <div style="text-align:right">
        <div class="price">${o.comp ? '🎁 Complimentary' : money(o.total)}</div>
        <div class="muted small">Order ${esc(o.id.slice(-8).toUpperCase())}</div>
        <div class="muted small">${o.cardLast4 ? esc(o.cardBrand || 'Card') + ' •••• ' + esc(o.cardLast4) : o.comp ? `From ${esc(o.issuedBy || 'the organizer')}` : 'Free'}</div>
      </div>
    </div>
    <div class="stubs">${o.tickets.map((t) => stub(t, ev)).join('')}</div>
    ${o.status !== 'refunded' ? `<div class="order-actions">
      <span class="muted small">Didn't get your email or text?</span>
      <a class="btn btn-blue btn-sm" href="${TJ.rest}orders/${esc(o.id)}/tickets.pdf?_wpnonce=${TJ.nonce}" download>⬇ Download tickets (PDF)</a>
      <button type="button" class="btn btn-ghost btn-sm" data-resend="email" data-order="${esc(o.id)}">📧 Resend email</button>
      ${o.buyerPhone ? `<button type="button" class="btn btn-ghost btn-sm" data-resend="sms" data-order="${esc(o.id)}">📱 Resend text</button>` : ''}
      <a class="btn btn-ghost btn-sm" href="#/t/${esc(o.id)}/${esc(o.key)}">🔗 Full-screen tickets</a>
    </div>` : ''}
  </div>`;
}
function bindOrderActions() {
  $app.querySelectorAll('[data-resend]').forEach((b) => (b.onclick = async () => {
    const label = b.textContent; b.disabled = true; b.textContent = 'Sending…';
    try {
      const r = await api(`/api/orders/${encodeURIComponent(b.dataset.order)}/resend`, { method: 'POST', body: { channel: b.dataset.resend } });
      toast(b.dataset.resend === 'sms' ? `📱 Tickets texted to ${r.sentTo.sms}` : `📧 Tickets emailed to ${r.sentTo.email}`);
      b.textContent = '✓ Sent';
      setTimeout(() => { b.disabled = false; b.textContent = label; }, 8000);
    } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = label; }
  }));
}

async function pageOrder(id) {
  loading();
  const { order } = await api('/api/orders/' + encodeURIComponent(id));
  $app.innerHTML = `
    <div class="confirm-hero">
      <div class="big">🎉</div>
      <h1 class="display" style="font-size:2.2rem">You're going!</h1>
      <p class="muted">${order.tickets.length} ticket${order.tickets.length > 1 ? 's' : ''} for <strong>${esc(order.event?.title)}</strong>. Show your ticket code at the door.<br/>Your tickets are saved in <strong>My Dashboard</strong> — download them any time.</p>
      <a class="btn btn-blue" href="#/tickets">Go to My Dashboard</a> <a class="btn btn-primary" href="${TJ.rest}orders/${esc(order.id)}/tickets.pdf?_wpnonce=${TJ.nonce}" download>⬇ Download tickets (PDF)</a> <a class="btn btn-ghost" href="#/">Find more events</a>
      ${order.event ? `<div class="going-share"><strong>📣 Tell your friends you're going!</strong><div class="quick-share" style="justify-content:center">${quickShareHtml(order.event, true)}</div></div>` : ''}
    </div>
    ${orderBlock(order)}`;
  bindOrderActions();
  if (order.event) bindQuickShare($app, order.event, true);
}

async function pageTickets() {
  loading();
  const { orders } = await api('/api/orders');
  const now = new Date();
  const upcoming = orders.filter((o) => o.event && new Date(o.event.startsAt) >= now);
  const past = orders.filter((o) => !o.event || new Date(o.event.startsAt) < now);
  const active = orders.filter((o) => o.status !== 'refunded');
  const ticketCount = active.reduce((a, o) => a + o.tickets.length, 0);
  const spent = active.reduce((a, o) => a + (o.total || 0), 0);
  const nextUp = upcoming.filter((o) => o.status !== 'refunded').sort((a, b) => new Date(a.event.startsAt) - new Date(b.event.startsAt))[0];
  const history = orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $app.innerHTML = `
    <div class="section-head"><div><h1>🎟️ My Ticket Dashboard</h1><div class="muted">Hi ${esc(me.name.split(' ')[0])} — every ticket you buy is saved here.</div></div><a class="btn btn-primary" href="#/">Find events</a></div>
    ${orders.length ? `<div class="stats">
      <div class="stat"><div class="muted small">Upcoming events</div><div class="num">${new Set(upcoming.filter((o) => o.status !== 'refunded').map((o) => o.event.id)).size}</div>${nextUp ? `<div class="muted small">Next: ${esc(nextUp.event.title)} · ${esc(fmtShort(nextUp.event.startsAt))}</div>` : ''}</div>
      <div class="stat"><div class="muted small">Tickets</div><div class="num">${ticketCount}</div><div class="muted small">${active.length} order${active.length === 1 ? '' : 's'}</div></div>
      <div class="stat"><div class="muted small">Total spent</div><div class="num">${money(spent)}</div><div class="muted small">incl. service fees</div></div>
      <div class="stat"><div class="muted small">Events attended</div><div class="num">${new Set(past.filter((o) => o.status !== 'refunded' && o.tickets.some((t) => t.checkedIn)).map((o) => o.event?.id)).size}</div><div class="muted small">checked in at the door</div></div>
    </div>` : ''}
    ${!orders.length ? `<div class="empty"><div class="big">🎟️</div><h2>No tickets yet</h2><p class="muted">When you buy tickets, they'll show up here.</p><a class="btn btn-primary" href="#/">Browse events</a></div>` : ''}
    ${upcoming.length ? `<h2 style="margin:10px 0 14px">Upcoming</h2>${upcoming.map(orderBlock).join('')}` : ''}
    ${past.length ? `<h2 style="margin:24px 0 14px">Past</h2>${past.map(orderBlock).join('')}` : ''}
    ${history.length ? `<h2 style="margin:28px 0 14px">🧾 Purchase history</h2>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Order #</th><th>Event</th><th>Tickets</th><th>Paid with</th><th>Total</th><th>Status</th></tr></thead><tbody>
      ${history.map((o) => `<tr>
        <td class="small">${esc(fmtShort(o.createdAt))}</td>
        <td class="code" style="font-size:.85rem">${esc(o.id.slice(-8).toUpperCase())}</td>
        <td>${o.event ? `<a href="#/event/${esc(o.event.id)}">${esc(o.event.title)}</a><div class="muted small">${esc(fmtShort(o.event.startsAt))}</div>` : '<span class="muted">Event removed</span>'}</td>
        <td>${o.items.map((i) => `${i.qty}× ${esc(i.tierName)}`).join(', ')}</td>
        <td class="small">${o.cardLast4 ? `${esc(o.cardBrand || 'Card')} •••• ${esc(o.cardLast4)}` : o.comp ? '🎁 Complimentary' : 'Free'}</td>
        <td><strong>${o.comp ? '$0.00' : money(o.total)}</strong></td>
        <td>${o.status === 'refunded' ? '<span class="badge cancelled">Refunded</span>' : o.comp ? '<span class="badge comp">🎁 Comp</span>' : '<span class="badge published">Paid</span>'}${o.test ? ' <span class="badge test">Test</span>' : ''}</td>
      </tr>`).join('')}
    </tbody></table></div>` : ''}`;
  bindOrderActions();
}

async function pageDashboard() {
  loading();
  const { events } = await api('/api/organizer/events');
  const sum = (k) => events.reduce((a, e) => a + e.stats[k], 0);
  const rows = events.map((e) => {
    const pct = e.stats.capacity ? Math.round((e.stats.sold / e.stats.capacity) * 100) : 0;
    return `<tr>
      <td><a href="#/event/${esc(e.id)}"><strong>${esc(e.title)}</strong></a><div class="muted small">${esc(fmtShort(e.startsAt))} · ${esc(e.venue)}</div></td>
      <td><span class="badge ${esc(e.status)}">${esc(e.status)}</span></td>
      <td>${e.stats.sold} / ${e.stats.capacity}<div class="progress"><div style="width:${pct}%"></div></div></td>
      <td><strong>${money(e.stats.revenue)}</strong></td>
      <td><div class="actions">
        <a class="btn btn-ghost btn-sm" href="#/edit/${esc(e.id)}">Edit</a>
        <a class="btn btn-ghost btn-sm" href="#/attendees/${esc(e.id)}">Attendees</a>
        ${e.status === 'published' ? `<button class="btn btn-ghost btn-sm" data-share="${esc(e.id)}" title="${e.stats.shareViews} visits from shared links">${SHARE_ICON} Share</button>` : ''}
        ${e.status === 'draft' ? `<button class="btn btn-green btn-sm" data-pub="${esc(e.id)}">Publish</button>` : ''}
        ${e.status === 'published' ? `<button class="btn btn-ghost btn-sm" data-unpub="${esc(e.id)}">Unpublish</button>` : ''}
        ${e.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" data-del="${esc(e.id)}" data-sold="${e.stats.orders}">${e.stats.orders ? 'Cancel' : 'Delete'}</button>` : ''}
      </div></td></tr>`;
  }).join('');
  $app.innerHTML = `
    <div class="section-head"><div><h1>Organizer Dashboard</h1><div class="muted">${esc(me.organization || me.name)}</div></div><div class="actions"><a class="btn btn-ghost" href="#/reports">📈 Sales reports</a><a class="btn btn-primary" href="#/create">+ Create Event</a></div></div>
    <div class="stats">
      <div class="stat"><div class="muted small">Events</div><div class="num">${events.length}</div></div>
      <div class="stat"><div class="muted small">Tickets sold</div><div class="num">${sum('sold').toLocaleString()}</div></div>
      <div class="stat"><div class="muted small">Gross ticket sales</div><div class="num">${money(sum('revenue'))}</div></div>
      <div class="stat"><div class="muted small">Checked in</div><div class="num">${sum('checkedIn').toLocaleString()}</div></div>
    </div>
    ${events.length ? `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Status</th><th>Sold</th><th>Revenue</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty"><div class="big">📣</div><h2>Create your first event</h2><p class="muted">Set up your event page and ticket types in a few minutes.</p><a class="btn btn-primary" href="#/create">+ Create Event</a></div>`}`;
  const setStatus = async (id, status) => {
    try { await api('/api/events/' + id, { method: 'PUT', body: { status } }); toast(status === 'published' ? 'Event is live!' : 'Event unpublished'); pageDashboard(); }
    catch (e) { toast(e.message, true); }
  };
  $app.querySelectorAll('[data-pub]').forEach((b) => (b.onclick = () => setStatus(b.dataset.pub, 'published')));
  $app.querySelectorAll('[data-unpub]').forEach((b) => (b.onclick = () => setStatus(b.dataset.unpub, 'draft')));
  $app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const hasSales = b.dataset.sold !== '0';
    if (!confirm(hasSales ? 'This event has ticket sales. Cancel it? Ticket holders will see it as cancelled.' : 'Delete this event permanently?')) return;
    try { const r = await api('/api/events/' + b.dataset.del, { method: 'DELETE' }); toast(r.cancelled ? 'Event cancelled' : 'Event deleted'); pageDashboard(); }
    catch (e) { toast(e.message, true); }
  }));
}

async function pageEventForm(id) {
  let ev = null;
  if (id) { loading(); ev = (await api('/api/organizer/events/' + encodeURIComponent(id))).event; }
  const def = new Date(Date.now() + 14 * 86400000); def.setHours(20, 0, 0, 0);
  const defEnd = new Date(def.getTime() + 4 * 3600000);
  const v = ev || { title: '', category: META.categories[0], description: '', startsAt: def.toISOString(), endsAt: defEnd.toISOString(), venue: '', address: '', city: '', imageUrl: '', status: 'published', tiers: [{ name: 'General Admission', price: 25, quantity: 100, sold: 0 }] };
  const isoToLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
  const splitLocal = (iso) => { const v2 = isoToLocalInput(iso); return v2 ? v2.split('T') : ['', '']; };
  let tiers = v.tiers.map((t) => { const [ssDate, ssTime] = splitLocal(t.salesStart), [seDate, seTime] = splitLocal(t.salesEnd); return { ...t, kind: tierKindOf(t), suggested: t.suggested ?? '', ssDate, ssTime, seDate, seTime }; });
  // date + time boxes → ISO (start time defaults to 12:00 AM, end time to 11:59 PM)
  const joinLocal = (d, tm, dflt) => (d ? new Date(`${d}T${tm || dflt}`).toISOString() : null);
  let imageUrl = v.imageUrl;
  let imageShareUrl = v.imageShareUrl || '';
  const dir = await api('/api/directory').catch(() => ({ organizers: [], venues: [] }));
  let orgs = (v.organizers && v.organizers.length ? v.organizers : [v.organizerName || (ev ? v.organizer : (me.organization || me.name)) || '']).filter(Boolean);
  let extraVenues = (v.extraVenues || []).map((x) => ({ ...x }));
  const savedVenue = (name, city) => dir.venues.find((x) => x.name.toLowerCase() === String(name || '').trim().toLowerCase() && (!city || !x.city || x.city.toLowerCase() === String(city).trim().toLowerCase()));

  $app.innerHTML = `
    <datalist id="orgList">${dir.organizers.map((o) => `<option value="${esc(o.name)}"></option>`).join('')}</datalist>
    <datalist id="venueList">${dir.venues.map((x) => `<option value="${esc(x.name)}">${esc([x.address, x.city].filter(Boolean).join(', '))}</option>`).join('')}</datalist>
    <div class="form-page event-form"><div class="form-card">
      <h1 class="display" style="font-size:2rem">${ev ? 'Edit event' : 'Create an event'}</h1>
      <p class="muted">${ev ? 'Update your event details and ticket types.' : 'Fill in the details — you can edit everything later.'}</p>
      ${errBox('evErr')}
      <form id="evForm">
        <div class="ev-stack">
        <div class="field"><label>Event title <span class="req">*</span></label><input name="title" maxlength="120" required value="${esc(v.title)}" placeholder="e.g. Friday Night Afrobeats Takeover" /></div>
        <div class="field"><label>Organizers <span class="req">*</span> <span class="muted small">(add one or more)</span></label>
          <div class="tagpick" id="orgPick"><div class="tags" id="orgTags"></div>
            <div class="tag-add"><input id="orgInput" list="orgList" maxlength="100" placeholder="Type or pick an organizer, then press Add" aria-label="Add organizer" /><button type="button" class="btn btn-blue btn-sm" id="orgAdd">+ Add</button></div></div>
          <span class="muted small">Pick from saved organizers or type a new one. All of them are shown on the event page as “Presented by …” and in tickets, emails and reports.</span></div>
        <div class="field"><label>Category</label><select name="category">${META.categories.map((c) => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="form-section ev-flyer"><h3>🖼️ Event flyer / image</h3>
          <label class="img-drop" for="imgFile"><strong>Click to upload</strong> <span class="muted">PNG, JPG or WEBP, up to 5MB. Wide images (16:9) look best.</span></label>
          <input type="file" id="imgFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
          <div class="img-preview" id="imgPreview"></div>
          <div id="imgActions" style="margin-top:8px"></div>
        </div>
        <div class="form-section"><h3>📅 Date & time</h3>
          ${ev ? `${v.seriesId ? `<div class="notice">🔁 This is one show of a recurring event (${(v.series || []).length} shows). Changes here apply to <strong>this show only</strong>. Each show has its own tickets and guest list.${(v.series || []).length > 1 ? ` Other shows: ${v.series.filter((x) => x.id !== v.id).map((x) => `<a href="#/edit/${esc(x.id)}">${esc(fmtShort(x.startsAt))}${x.sessionLabel ? ' · ' + esc(x.sessionLabel) : ''}</a>`).join(' · ')}` : ''}</div>` : ''}
          <div class="row">
            <div class="field"><label>Starts <span class="req">*</span></label><input type="datetime-local" name="startsAt" required value="${toLocalInput(v.startsAt)}" /></div>
            <div class="field"><label>Ends <span class="req">*</span></label><input type="datetime-local" name="endsAt" required value="${toLocalInput(v.endsAt)}" /></div>
          </div>`
          : `<div class="row">
            <div class="field"><label for="perDay">How many times a day? <span class="req">*</span></label>
              <select id="perDay">
                <option value="1">Once a day</option>
                <option value="2">2 times a day (Morning &amp; Evening)</option>
                <option value="3">3 times a day (Morning, Midday &amp; Evening)</option>
              </select></div>
            <div class="field"><label for="dayMode">On which days? <span class="req">*</span></label>
              <select id="dayMode">
                <option value="one">One day</option>
                <option value="many">Several days, same times each day</option>
                <option value="custom">Different days and times (set each one)</option>
              </select></div>
          </div>
          <div id="slotBox">
            <label class="sub-label">Times</label>
            <div id="slotRows"></div>
          </div>
          <div id="dayBox">
            <label class="sub-label" id="dayLabel">Date</label>
            <div id="dayRows"></div>
            <div class="sess-tools hidden" id="dayTools">
              <button type="button" class="btn btn-ghost btn-sm" id="addDay">+ Add a day</button>
              <span class="muted small">or repeat the first day</span>
              <select id="repEvery"><option value="7">every week</option><option value="1">every day</option><option value="14">every 2 weeks</option><option value="month">every month</option></select>
              <input type="number" id="repCount" min="2" max="60" value="4" aria-label="How many days" /> <span class="muted small">days</span>
              <button type="button" class="btn btn-blue btn-sm" id="repFill">Fill days</button>
            </div>
          </div>
          <div id="customBox" class="hidden">
            <p class="muted small" style="margin-top:0">Add a row for every show. Each can be on any day, at any time.</p>
            <div class="sess-head"><span>Date</span><span>Starts</span><span>Ends</span><span>Name <span class="muted">(optional)</span></span><span></span></div>
            <div id="sessRows"></div>
            <div class="sess-tools"><button type="button" class="btn btn-ghost btn-sm" id="addSess">+ Add a show</button></div>
          </div>
          <div class="sched-summary" id="schedSummary"></div>
          <input type="hidden" name="startsAt" value="${toLocalInput(v.startsAt)}" /><input type="hidden" name="endsAt" value="${toLocalInput(v.endsAt)}" />`}
        </div>
        <div class="form-section"><h3>📍 Location</h3>
          ${dir.venues.length ? `<div class="field"><label>Choose a saved venue</label><select id="venueSaved"><option value="">— Pick a saved venue to fill in the details —</option>${dir.venues.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.city ? ' · ' + esc(x.city) : ''}</option>`).join('')}</select></div>` : ''}
          <div class="field"><label>Main venue name <span class="req">*</span></label><input name="venue" list="venueList" required value="${esc(v.venue)}" placeholder="e.g. Club Velocity" /></div>
          <div class="row">
            <div class="field"><label>Street address</label><input name="address" value="${esc(v.address)}" /></div>
            <div class="field"><label>City</label><input name="city" required value="${esc(v.city)}" /></div>
          </div>
          <div class="pin-head"><label style="font-weight:600;font-size:.9rem">Map pin</label>
            <button type="button" class="btn btn-ghost btn-sm" id="findAddr">📍 Find address on map</button></div>
          <div class="pin-map" id="pinMap"></div>
          <div class="muted small" id="pinStatus" style="margin-top:6px"></div>
          <div class="extra-venues">
            <h4>More venues <span class="muted small">(optional, for events held at more than one place)</span></h4>
            <div id="xvRows"></div>
            <div class="sess-tools">
              ${dir.venues.length ? `<select id="xvSaved"><option value="">Add a saved venue…</option>${dir.venues.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.city ? ' · ' + esc(x.city) : ''}</option>`).join('')}</select>` : ''}
              <button type="button" class="btn btn-ghost btn-sm" id="xvAdd">+ Add another venue</button>
            </div>
          </div>
        </div>
        <div class="form-section ev-desc">
        <div class="field"><label>Description</label><textarea name="description" maxlength="5000" required placeholder="What should people know? Line-up, dress code, age limit, parking…">${esc(v.description)}</textarea></div>
        </div>
        <div class="form-section ev-status">
        <div class="field"><label>Status</label><select name="status">
            <option value="published" ${v.status === 'published' ? 'selected' : ''}>Published — on sale now</option>
            <option value="draft" ${v.status === 'draft' ? 'selected' : ''}>Draft — hidden</option>
            ${ev ? `<option value="cancelled" ${v.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>` : ''}
          </select></div>
        </div>
        </div>

        <div class="form-section"><h3>🎟️ Tickets</h3>
          <p class="muted small" style="margin-top:-8px">Buyers pay a service fee of ${(META.feePercent * 100).toFixed(1)}% + ${money(META.feeFixed)} per paid ticket on top of your price. Use price 0 for free tickets. Set a ticket type to <strong>🔒 Private</strong> to hide it from the public (e.g. "Complimentary", "Guest list", "Staff") and send those tickets yourself from the Attendees page.</p>
          <div id="tiers"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="addTier">+ Add ticket type</button>
        </div>

        <div style="display:flex;gap:10px;margin-top:26px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-primary" id="saveBtn">${ev ? 'Save changes' : 'Create event'}</button>
          <a class="btn btn-ghost" href="${me.role === 'admin' ? '#/admin/events' : '#/dashboard'}">Cancel</a>
        </div>
      </form>
    </div></div>`;

  // ---- map pin ----
  let geo = { lat: Number.isFinite(v.lat) ? v.lat : null, lng: Number.isFinite(v.lng) ? v.lng : null, geoPrecision: v.geoPrecision || null };
  const pinMsg = {
    pin: '✅ Pin placed by you. Guests will see this exact spot.',
    venue: '✅ Found the venue. Drag the pin if it isn\'t exactly right.',
    address: '✅ Found the street address. Drag the pin onto the venue for the best accuracy.',
    city: '⚠️ Only the city was found. <strong>Drag the pin (or click the map) onto your venue.</strong>',
  };
  const setPinStatus = () => { document.getElementById('pinStatus').innerHTML = geo.lat == null ? 'Click <strong>Find address on map</strong>, or click the map to drop a pin at your venue. If you skip this, we look up the address automatically.' : pinMsg[geo.geoPrecision] || pinMsg.pin; };
  setPinStatus();
  let picker = null;
  TJGeo.pinPicker(document.getElementById('pinMap'), {
    lat: geo.lat, lng: geo.lng, center: META.maps?.center || { lat: 25.0582, lng: -77.3431 },
    onChange: (lat, lng, source) => { geo = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, geoPrecision: source }; setPinStatus(); },
  }).then((p) => (picker = p)).catch(() => { document.getElementById('pinMap').innerHTML = '<div class="muted small" style="padding:20px">Map could not load. The address will be looked up automatically.</div>'; });
  const findAddress = async (quiet) => {
    const f = document.getElementById('evForm');
    const venue = f.venue.value.trim(), address = f.address.value.trim(), city = f.city.value.trim();
    if (!city && !address) { if (!quiet) toast('Enter the address and city first', true); return; }
    const btn = document.getElementById('findAddr'); btn.disabled = true; btn.textContent = 'Searching…';
    try {
      const { result } = await api(`/api/geocode?venue=${encodeURIComponent(venue)}&address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`);
      if (picker) picker.setPoint(result.lat, result.lng, result.precision);
      else { geo = { lat: result.lat, lng: result.lng, geoPrecision: result.precision }; setPinStatus(); }
    } catch (err) { if (!quiet) toast(err.message, true); }
    btn.disabled = false; btn.textContent = '📍 Find address on map';
  };
  document.getElementById('findAddr').onclick = () => findAddress(false);
  ['venue', 'address', 'city'].forEach((n) => {
    const input = document.querySelector(`#evForm [name=${n}]`);
    input.addEventListener('change', () => { if (geo.geoPrecision !== 'pin') { geo = { lat: null, lng: null, geoPrecision: null }; setPinStatus(); findAddress(true); } });
  });

  // ---- organizers (one or more) ----
  const renderOrgs = () => {
    document.getElementById('orgTags').innerHTML = orgs.length
      ? orgs.map((n, i) => `<span class="tag-chip">${esc(n)}<button type="button" data-rmorg="${i}" aria-label="Remove ${esc(n)}">✕</button></span>`).join('')
      : '<span class="muted small">No organizer yet. Add at least one.</span>';
    document.querySelectorAll('[data-rmorg]').forEach((b) => (b.onclick = () => { orgs.splice(Number(b.dataset.rmorg), 1); renderOrgs(); }));
  };
  const addOrg = () => {
    const inp = document.getElementById('orgInput'); const n = inp.value.trim().replace(/\s+/g, ' ');
    if (!n) return;
    if (orgs.some((x) => x.toLowerCase() === n.toLowerCase())) { inp.value = ''; return toast('That organizer is already added'); }
    if (orgs.length >= 10) return toast('An event can have up to 10 organizers', true);
    orgs.push(n); inp.value = ''; renderOrgs();
  };
  document.getElementById('orgAdd').onclick = addOrg;
  document.getElementById('orgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOrg(); } });
  document.getElementById('orgInput').addEventListener('change', (e) => { if (dir.organizers.some((o) => o.name === e.target.value)) addOrg(); });
  renderOrgs();

  // ---- main venue from the saved list ----
  const fillMain = (sv) => {
    const f = document.getElementById('evForm');
    f.venue.value = sv.name; f.address.value = sv.address || ''; f.city.value = sv.city || '';
    if (Number.isFinite(sv.lat) && Number.isFinite(sv.lng)) { if (picker) picker.setPoint(sv.lat, sv.lng, sv.geoPrecision || 'pin'); geo = { lat: sv.lat, lng: sv.lng, geoPrecision: sv.geoPrecision || 'pin' }; setPinStatus(); }
    else { geo = { lat: null, lng: null, geoPrecision: null }; setPinStatus(); findAddress(true); }
  };
  const vs = document.getElementById('venueSaved');
  if (vs) vs.onchange = () => { const sv = dir.venues.find((x) => x.id === vs.value); if (sv) fillMain(sv); vs.value = ''; };
  document.querySelector('#evForm [name=venue]').addEventListener('input', (e) => { const sv = savedVenue(e.target.value); const f = document.getElementById('evForm'); if (sv && !f.address.value && !f.city.value) fillMain(sv); });

  // ---- more venues ----
  const xvRows = document.getElementById('xvRows');
  const readXv = () => xvRows.querySelectorAll('.xv-row').forEach((r, i) => { const g = (k) => r.querySelector(`[data-k="${k}"]`).value.trim(); extraVenues[i] = { ...extraVenues[i], name: g('name'), address: g('address'), city: g('city') }; });
  const renderXv = () => {
    xvRows.innerHTML = extraVenues.map((x, i) => `<div class="xv-row">
      <input data-k="name" list="venueList" maxlength="120" value="${esc(x.name || '')}" placeholder="Venue name" aria-label="Venue ${i + 2} name" />
      <input data-k="address" maxlength="200" value="${esc(x.address || '')}" placeholder="Street address" aria-label="Venue ${i + 2} address" />
      <input data-k="city" maxlength="80" value="${esc(x.city || '')}" placeholder="City" aria-label="Venue ${i + 2} city" />
      <button type="button" class="btn btn-ghost btn-sm" data-rmxv="${i}" title="Remove venue">✕</button></div>`).join('');
    xvRows.querySelectorAll('[data-rmxv]').forEach((b) => (b.onclick = () => { readXv(); extraVenues.splice(Number(b.dataset.rmxv), 1); renderXv(); }));
    xvRows.querySelectorAll('[data-k="name"]').forEach((inp, i) => inp.addEventListener('input', () => {
      const sv = savedVenue(inp.value); if (!sv) { extraVenues[i].lat = null; extraVenues[i].lng = null; return; }
      if (inp.value !== sv.name && inp.value.length < sv.name.length) return;
      readXv(); extraVenues[i] = { name: sv.name, address: sv.address || '', city: sv.city || '', lat: sv.lat ?? null, lng: sv.lng ?? null }; renderXv();
    }));
  };
  document.getElementById('xvAdd').onclick = () => { readXv(); if (extraVenues.length >= 9) return toast('An event can have up to 10 venues', true); extraVenues.push({ name: '', address: '', city: '' }); renderXv(); xvRows.querySelector('.xv-row:last-child input')?.focus(); };
  const xs = document.getElementById('xvSaved');
  if (xs) xs.onchange = () => { const sv = dir.venues.find((x) => x.id === xs.value); xs.value = ''; if (!sv) return; readXv(); if (extraVenues.length >= 9) return toast('An event can have up to 10 venues', true); if (extraVenues.some((x) => x.name.toLowerCase() === sv.name.toLowerCase())) return toast('That venue is already added'); extraVenues.push({ name: sv.name, address: sv.address || '', city: sv.city || '', lat: sv.lat ?? null, lng: sv.lng ?? null }); renderXv(); };
  renderXv();

  const renderImg = () => {
    document.getElementById('imgPreview').innerHTML = imageUrl ? `<img src="${esc(imageUrl)}" alt="Event image" decoding="async" />` : '';
    document.getElementById('imgActions').innerHTML = imageUrl ? '<button type="button" class="btn btn-ghost btn-sm" id="rmImg">Remove image</button>' : '';
    const rm = document.getElementById('rmImg'); if (rm) rm.onclick = () => { imageUrl = ''; imageShareUrl = ''; renderImg(); };
  };
  renderImg();
  document.getElementById('imgFile').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('Image must be 5MB or smaller', true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        toast('Uploading image…');
        const optimized = await optimizeFlyer(reader.result, file.type);
        const { url } = await api('/api/upload', { method: 'POST', body: { dataUrl: optimized } });
        // Small JPEG copy for social link previews (WhatsApp ignores images over ~300 KB)
        let shareUrl = '';
        try { const small = await shrinkForShare(reader.result); if (small) shareUrl = (await api('/api/upload', { method: 'POST', body: { dataUrl: small } })).url; } catch {}
        imageUrl = url; imageShareUrl = shareUrl; renderImg(); toast('Image uploaded');
      }
      catch (err) { toast(err.message, true); }
    };
    reader.readAsDataURL(file);
  };

  const syncTiers = () => {
    document.querySelectorAll('.tier-row').forEach((row, i) => {
      tiers[i].name = row.querySelector('[data-k=name]').value;
      tiers[i].kind = row.querySelector('[data-k=kind]').value;
      tiers[i].price = tiers[i].kind === 'free' ? 0 : row.querySelector('[data-k=price]').value;
      tiers[i].suggested = row.querySelector('[data-k=suggested]').value;
      tiers[i].ssDate = row.querySelector('[data-k=ssDate]').value; tiers[i].ssTime = row.querySelector('[data-k=ssTime]').value;
      tiers[i].seDate = row.querySelector('[data-k=seDate]').value; tiers[i].seTime = row.querySelector('[data-k=seTime]').value;
      tiers[i].quantity = row.querySelector('[data-k=quantity]').value;
      tiers[i].maxPerPerson = row.querySelector('[data-k=maxPerPerson]').value;
      tiers[i].description = row.querySelector('[data-k=description]').value;
      tiers[i].visibility = row.querySelector('[data-k=visibility]').value;
    });
  };
  const renderTiers = () => {
    document.getElementById('tiers').innerHTML = tiers.map((t, i) => `
      <div class="tier-row">
        <div class="field"><label>Ticket name</label><input data-k="name" value="${esc(t.name)}" placeholder="e.g. VIP" required /></div>
        <div class="field"><label>Ticket type</label><select data-k="kind" ${t.sold ? 'disabled title="Locked after sales"' : ''}>
          <option value="paid" ${tierKindOf(t) === 'paid' ? 'selected' : ''}>💵 Paid</option>
          <option value="free" ${tierKindOf(t) === 'free' ? 'selected' : ''}>🎁 Free</option>
          <option value="donation" ${tierKindOf(t) === 'donation' ? 'selected' : ''}>💝 Donation</option></select></div>
        <div class="field ${tierKindOf(t) === 'free' ? 'hidden' : ''}" data-f="price"><label>${tierKindOf(t) === 'donation' ? 'Minimum donation ($)' : 'Price ($)'}</label><input data-k="price" type="number" min="${tierKindOf(t) === 'paid' ? '0.01' : '0'}" step="0.01" value="${esc(tierKindOf(t) === 'free' ? 0 : t.price)}" ${t.sold ? 'readonly title="Price locked after sales"' : ''} ${tierKindOf(t) === 'free' ? '' : 'required'} /></div>
        <div class="field ${tierKindOf(t) === 'donation' ? '' : 'hidden'}" data-f="suggested"><label>Suggested ($) <span class="muted small">(optional)</span></label><input data-k="suggested" type="number" min="0" step="0.01" value="${esc(t.suggested ?? '')}" placeholder="e.g. 20" /></div>
        <div class="field"><label>Quantity${t.sold ? ` <span class="muted small">(${t.sold} used)</span>` : ''}</label><input data-k="quantity" type="number" min="${t.sold || 1}" step="1" value="${esc(t.quantity)}" required /></div>
        <div class="field"><label>Max per person <span class="muted small">(optional)</span></label><input data-k="maxPerPerson" type="number" min="1" max="100" step="1" value="${esc(t.maxPerPerson ?? '')}" placeholder="No limit" title="Most tickets of this type one person can buy (1–100). Empty = up to 10 per order." /></div>
        <div class="field"><label>Visibility</label><select data-k="visibility">
          <option value="public" ${t.visibility !== 'private' ? 'selected' : ''}>🌐 Public — on sale</option>
          <option value="private" ${t.visibility === 'private' ? 'selected' : ''}>🔒 Private — hidden</option></select></div>
        <button type="button" class="btn btn-danger btn-sm" data-rm="${i}" ${t.sold || tiers.length === 1 ? 'disabled' : ''}>✕</button>
        <div class="field tier-sale-field"><label>Ticket sales window <span class="muted small">(optional)</span></label>
          <div class="sale-grid">
            <label><span>Sales start date</span><input data-k="ssDate" type="date" value="${esc(t.ssDate || '')}" /></label>
            <label><span>Sales start time</span><input data-k="ssTime" type="time" value="${esc(t.ssTime || '')}" /></label>
            <label><span>Sales end date</span><input data-k="seDate" type="date" value="${esc(t.seDate || '')}" /></label>
            <label><span>Sales end time</span><input data-k="seTime" type="time" value="${esc(t.seTime || '')}" /></label>
          </div>
          <span class="muted small">Leave empty to sell from now until the event ends. Buyers see "On sale in…" before the start and "Sales end in…" while it's selling.</span></div>
        <div class="field tier-desc-field"><label>Description <span class="muted small">(optional)</span></label><input data-k="description" maxlength="300" value="${esc(t.description || '')}" placeholder="e.g. Includes 1 free drink and fast-track entry" /></div>
      </div>`).join('');
    document.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { syncTiers(); tiers.splice(Number(b.dataset.rm), 1); renderTiers(); }));
    document.querySelectorAll('.tier-row [data-k=kind]').forEach((s) => (s.onchange = () => {
      syncTiers();
      const i = [...document.querySelectorAll('.tier-row')].indexOf(s.closest('.tier-row'));
      if (s.value === 'paid' && !(Number(tiers[i].price) > 0)) tiers[i].price = '';
      if (s.value === 'donation' && tiers[i].price === '') tiers[i].price = 0;
      renderTiers();
    }));
  };
  renderTiers();
  document.getElementById('addTier').onclick = () => {
    syncTiers();
    if (tiers.length >= 10) return toast('Maximum 10 ticket types', true);
    tiers.push({ name: '', kind: 'paid', price: '', suggested: '', ssDate: '', ssTime: '', seDate: '', seTime: '', quantity: 50, sold: 0, description: '', visibility: 'public' }); renderTiers();
  };

  // ---- schedule: times a day × days (create only) ----
  const pad = (n) => String(n).padStart(2, '0');
  const dLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tLocal = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const toIso = (x) => {
    const st = new Date(`${x.date}T${x.start}`); let en = new Date(`${x.date}T${x.end}`);
    if (!isNaN(st) && !isNaN(en) && en <= st) en = new Date(en.getTime() + 86400000);
    return { startsAt: isNaN(st) ? '' : st.toISOString(), endsAt: isNaN(en) ? '' : en.toISOString(), label: x.label || '' };
  };
  const SLOT_DEFAULTS = {
    1: [{ label: '', start: tLocal(new Date(v.startsAt)), end: tLocal(new Date(v.endsAt)) }],
    2: [{ label: 'Morning', start: '10:00', end: '13:00' }, { label: 'Evening', start: '19:00', end: '22:00' }],
    3: [{ label: 'Morning', start: '09:00', end: '11:30' }, { label: 'Midday', start: '13:00', end: '15:30' }, { label: 'Evening', start: '19:00', end: '22:00' }],
  };
  let slots = SLOT_DEFAULTS[1].map((x) => ({ ...x }));
  let days = [dLocal(new Date(v.startsAt))];
  let sessions = [];
  const $id = (x) => document.getElementById(x);
  const readSlots = () => $id('slotRows')?.querySelectorAll('.slot-row').forEach((r, i) => { const g = (k) => r.querySelector(`[data-k="${k}"]`).value; slots[i] = { label: g('label').trim(), start: g('start'), end: g('end') }; });
  const readDays = () => $id('dayRows')?.querySelectorAll('[data-day]').forEach((inp, i) => { days[i] = inp.value; });
  const readSessions = () => $id('sessRows')?.querySelectorAll('.sess-row').forEach((r, i) => { const g = (k) => r.querySelector(`[data-k="${k}"]`).value; sessions[i] = { date: g('date'), start: g('start'), end: g('end'), label: g('label') }; });
  const fmtD = (d) => { const x = new Date(`${d}T12:00`); return isNaN(x) ? '?' : x.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
  const fmtT = (t) => { const x = new Date(`2000-01-01T${t}`); return isNaN(x) ? '?' : x.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  const buildShows = () => {
    if (ev) return [];
    if ($id('dayMode').value === 'custom') { readSessions(); return sessions.map((x) => ({ ...x })); }
    readSlots(); readDays();
    const useDays = $id('dayMode').value === 'one' ? days.slice(0, 1) : days;
    const out = [];
    for (const d of useDays) for (const sl of slots) out.push({ date: d, start: sl.start, end: sl.end, label: slots.length > 1 ? sl.label : '' });
    return out;
  };
  const renderSummary = () => {
    if (ev) return;
    const shows = buildShows().filter((x) => x.date && x.start && x.end);
    const el = $id('schedSummary');
    if (!shows.length) { el.innerHTML = ''; return; }
    const nDays = new Set(shows.map((x) => x.date)).size;
    el.innerHTML = shows.length === 1
      ? `🗓️ <strong>1 show</strong>: ${esc(fmtD(shows[0].date))}, ${esc(fmtT(shows[0].start))} – ${esc(fmtT(shows[0].end))}`
      : `🔁 <strong>${shows.length} shows</strong> on ${nDays} day${nDays > 1 ? 's' : ''}. Each show gets its <strong>own tickets, stock and guest list</strong>, and guests pick the one they want.
        <div class="sum-list">${shows.slice(0, 12).map((x) => `<span>${esc(fmtD(x.date))} · ${esc(fmtT(x.start))}${x.label ? ' · ' + esc(x.label) : ''}</span>`).join('')}${shows.length > 12 ? `<span>+${shows.length - 12} more</span>` : ''}</div>`;
  };
  const renderSlots = () => {
    $id('slotRows').innerHTML = slots.map((x, i) => `<div class="slot-row${slots.length > 1 ? '' : ' one'}">
      ${slots.length > 1 ? `<input data-k="label" maxlength="60" value="${esc(x.label)}" aria-label="Name of show ${i + 1}" placeholder="Name" />` : '<input data-k="label" type="hidden" value="" />'}
      <label class="mini">Starts<input type="time" data-k="start" value="${esc(x.start)}" aria-label="Show ${i + 1} starts" /></label>
      <label class="mini">Ends<input type="time" data-k="end" value="${esc(x.end)}" aria-label="Show ${i + 1} ends" /></label></div>`).join('');
    $id('slotRows').querySelectorAll('input').forEach((i) => i.addEventListener('input', renderSummary));
  };
  const renderDays = () => {
    const many = $id('dayMode').value === 'many';
    $id('dayLabel').textContent = many ? 'Days' : 'Date';
    $id('dayTools').classList.toggle('hidden', !many);
    const list = many ? days : days.slice(0, 1);
    $id('dayRows').innerHTML = list.map((d, i) => `<div class="day-row${many ? '' : ' solo'}"><input type="date" data-day value="${esc(d)}" aria-label="Day ${i + 1}" />${many ? `<button type="button" class="btn btn-ghost btn-sm" data-rmday="${i}" title="Remove day" ${list.length < 2 ? 'disabled' : ''}>✕</button>` : ''}</div>`).join('');
    $id('dayRows').querySelectorAll('[data-rmday]').forEach((b) => (b.onclick = () => { readDays(); days.splice(Number(b.dataset.rmday), 1); renderDays(); renderSummary(); }));
    $id('dayRows').querySelectorAll('input').forEach((i) => i.addEventListener('input', () => { readDays(); renderSummary(); }));
  };
  const renderSessions = () => {
    $id('sessRows').innerHTML = sessions.map((x, i) => `<div class="sess-row">
      <input type="date" data-k="date" value="${esc(x.date)}" aria-label="Show ${i + 1} date" />
      <input type="time" data-k="start" value="${esc(x.start)}" aria-label="Show ${i + 1} starts" />
      <input type="time" data-k="end" value="${esc(x.end)}" aria-label="Show ${i + 1} ends" />
      <input type="text" data-k="label" maxlength="60" value="${esc(x.label)}" placeholder="e.g. Early show" aria-label="Show ${i + 1} name" />
      <button type="button" class="btn btn-ghost btn-sm" data-rm="${i}" title="Remove" ${sessions.length < 2 ? 'disabled' : ''}>✕</button></div>`).join('');
    $id('sessRows').querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { readSessions(); sessions.splice(Number(b.dataset.rm), 1); renderSessions(); renderSummary(); }));
    $id('sessRows').querySelectorAll('input').forEach((i) => i.addEventListener('input', renderSummary));
  };
  if (!ev) {
    const applyMode = () => {
      const mode = $id('dayMode').value;
      const custom = mode === 'custom';
      if (custom && !sessions.length) { readSlots(); readDays(); sessions = buildShowsFrom(); }
      $id('slotBox').classList.toggle('hidden', custom);
      $id('dayBox').classList.toggle('hidden', custom);
      $id('customBox').classList.toggle('hidden', !custom);
      $id('perDay').disabled = custom;
      if (custom) renderSessions(); else renderDays();
      renderSummary();
    };
    const buildShowsFrom = () => { const out = []; for (const d of days) for (const sl of slots) out.push({ date: d, start: sl.start, end: sl.end, label: slots.length > 1 ? sl.label : '' }); return out; };
    $id('perDay').onchange = () => {
      readSlots();
      const n = Number($id('perDay').value);
      const keepFirst = slots[0];
      slots = SLOT_DEFAULTS[n].map((x) => ({ ...x }));
      if (n === 1 && keepFirst) slots[0] = { ...keepFirst, label: '' };
      renderSlots(); renderSummary();
    };
    $id('dayMode').onchange = () => {
      readDays();
      if ($id('dayMode').value === 'many' && days.length < 2) { const d = new Date(`${days[0]}T12:00`); d.setDate(d.getDate() + 1); days.push(dLocal(d)); }
      applyMode();
    };
    $id('addDay').onclick = () => { readDays(); const d = new Date(`${days[days.length - 1]}T12:00`); if (!isNaN(d)) d.setDate(d.getDate() + 1); days.push(isNaN(d) ? '' : dLocal(d)); renderDays(); renderSummary(); };
    $id('repFill').onclick = () => {
      readDays();
      const every = $id('repEvery').value; const n = Math.max(2, Math.min(60, Number($id('repCount').value) || 2));
      const d0 = new Date(`${days[0]}T12:00`); if (isNaN(d0)) return toast('Pick the first day first', true);
      days = Array.from({ length: n }, (_, i) => { const d = new Date(d0); if (every === 'month') d.setMonth(d.getMonth() + i); else d.setDate(d.getDate() + i * Number(every)); return dLocal(d); });
      renderDays(); renderSummary(); toast(`${n} days filled in`);
    };
    $id('addSess').onclick = () => { readSessions(); const last = sessions[sessions.length - 1] || { date: days[0], start: '19:00', end: '22:00' }; const d = new Date(`${last.date}T12:00`); if (!isNaN(d)) d.setDate(d.getDate() + 1); sessions.push({ date: isNaN(d) ? last.date : dLocal(d), start: last.start, end: last.end, label: '' }); renderSessions(); renderSummary(); };
    renderSlots(); applyMode();
  }

  document.getElementById('evForm').onsubmit = async (e) => {
    e.preventDefault(); syncTiers(); readXv();
    { const bad = tiers.find((t) => (t.ssTime && !t.ssDate) || (t.seTime && !t.seDate)); if (bad) { toast(`"${bad.name || 'Ticket'}": pick a date for the sales ${bad.ssTime && !bad.ssDate ? 'start' : 'end'} time`, true); return; } }
    const pending = document.getElementById('orgInput').value.trim(); if (pending) addOrg();
    if (!orgs.length) { document.getElementById('orgInput').focus(); return showErr('evErr', 'Add at least one organizer'); }
    const xvClean = extraVenues.filter((x) => x.name || x.address || x.city);
    const xvBad = xvClean.findIndex((x) => !x.name);
    if (xvBad >= 0) return showErr('evErr', `Venue #${xvBad + 2} needs a name (or remove that row)`);
    const f = { ...Object.fromEntries(new FormData(e.target)), organizers: orgs, organizerName: orgs.join(' & '), extraVenues: xvClean };
    let extra = {};
    if (!ev) {
      const shows = buildShows();
      const bad = shows.findIndex((x) => !x.date || !x.start || !x.end);
      if (bad >= 0) return showErr('evErr', shows.length > 1 ? `Show #${bad + 1}: fill in the date, start and end time` : 'Fill in the date, start and end time');
      const list = shows.map(toIso).sort((p, q) => new Date(p.startsAt) - new Date(q.startsAt));
      for (let i = 1; i < list.length; i++) if (list[i].startsAt === list[i - 1].startsAt) return showErr('evErr', 'Two shows start at exactly the same time. Change or remove one.');
      if (list.length > 60) return showErr('evErr', 'You can create up to 60 shows at once');
      f.startsAt = list[0].startsAt; f.endsAt = list[0].endsAt;
      extra = list.length > 1 ? { schedule: 'series', sessions: list } : { schedule: 'single', sessionLabel: list[0].label };
    }
    const body = {
      ...f, ...extra, imageUrl, imageShareUrl, lat: geo.lat, lng: geo.lng, geoPrecision: geo.geoPrecision,
      startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, kind: t.kind || 'paid', price: t.kind === 'free' ? 0 : Number(t.price), suggested: t.kind === 'donation' && t.suggested !== '' && t.suggested !== null && t.suggested !== undefined ? Number(t.suggested) : null,
        salesStart: joinLocal(t.ssDate, t.ssTime, '00:00'), salesEnd: joinLocal(t.seDate, t.seTime, '23:59'), maxPerPerson: t.maxPerPerson !== '' && t.maxPerPerson !== null && t.maxPerPerson !== undefined ? Number(t.maxPerPerson) : null, quantity: Number(t.quantity), description: t.description || '', visibility: t.visibility === 'private' ? 'private' : 'public' })),
    };
    const btn = document.getElementById('saveBtn'); btn.disabled = true;
    try {
      const { event, created } = await api(ev ? '/api/events/' + ev.id : '/api/events', { method: ev ? 'PUT' : 'POST', body });
      toast(ev ? 'Changes saved' : (created > 1 ? `${created} shows created${event.status === 'published' ? ' and live! 🎉' : ' as drafts'}` : (event.status === 'published' ? 'Your event is live! 🎉' : 'Draft saved')));
      go('#/event/' + event.id);
    } catch (err) { showErr('evErr', err.message); btn.disabled = false; }
  };
}

async function pageAttendees(id) {
  loading();
  const { event: ev, attendees } = await api(`/api/organizer/events/${encodeURIComponent(id)}/attendees`);
  const s = ev.stats;
  $app.innerHTML = `
    <div class="section-head"><div><a href="${me.role === 'admin' ? '#/admin/events' : '#/dashboard'}" class="small">← ${me.role === 'admin' ? 'Admin · Events' : 'Dashboard'}</a><h1>${esc(ev.title)}</h1><div class="muted">${esc(fmtLong(ev.startsAt))} · ${esc(ev.venue)}</div></div>
      <button class="btn btn-ghost" id="csvBtn" ${attendees.length ? '' : 'disabled'}>⬇ Export CSV</button></div>
    <div class="stats">
      <div class="stat"><div class="muted small">Tickets sold</div><div class="num">${s.paidSold ?? s.sold} / ${s.capacity}</div>${s.comped ? `<div class="muted small">+ ${s.comped} complimentary</div>` : ''}</div>
      <div class="stat"><div class="muted small">Orders</div><div class="num">${s.orders}</div></div>
      <div class="stat"><div class="muted small">Gross ticket sales</div><div class="num">${money(s.revenue)}</div></div>
      <div class="stat"><div class="muted small">Checked in</div><div class="num">${s.checkedIn}</div></div>
    </div>
    <div class="panel" style="margin-bottom:22px">
      <h3>🚪 Door check-in</h3>
      <form id="ciForm" style="display:flex;gap:10px;flex-wrap:wrap">
        <input name="code" placeholder="Enter ticket code, e.g. TJ-1A2B3C4D" required style="flex:1;min-width:220px;padding:11px 13px;border-radius:10px;border:1px solid var(--field-line);background:var(--card);color:var(--ink);font-size:1rem;font-family:ui-monospace,Menlo,monospace;text-transform:uppercase" />
        <button class="btn btn-green">Check in</button>
        <button type="button" class="btn btn-blue" id="scanBtn">📷 Scan QR</button>
      </form>
      <div id="scanner" class="hidden" style="margin-top:14px"><video id="scanVideo" playsinline muted style="width:100%;max-width:420px;border-radius:12px;background:#000"></video><div class="muted small" id="scanMsg">Point the camera at a ticket QR code…</div></div>
    </div>
    <div class="panel comp-panel" style="margin-bottom:22px">
      <h3>🎁 Complimentary tickets</h3>
      <p class="muted small" style="margin-top:-4px">Send free tickets to guests, VIPs, staff or sponsors. They get the same QR tickets by email (and text if you add a number). Works with any ticket type, including <strong>🔒 private</strong> ones. Comps count toward capacity but never as sales.</p>
      <form id="compForm" class="comp-form">
        <div class="field"><label>Ticket type</label><select name="tierId" required>${ev.tiers.map((t) => `<option value="${esc(t.id)}" ${t.remaining ? '' : 'disabled'}>${t.visibility === 'private' ? '🔒 ' : ''}${esc(t.name)} — ${t.remaining} left${t.visibility === 'private' ? ' (private)' : ''}</option>`).join('')}</select></div>
        <div class="field"><label>How many</label><input name="qty" type="number" min="1" max="50" value="1" required /></div>
        <div class="field"><label>Guest name</label><input name="name" required placeholder="Full name" /></div>
        <div class="field"><label>Guest email</label><input name="email" type="email" required placeholder="guest@email.com" /></div>
        <div class="field"><label>Mobile <span class="muted small">(optional, for a text)</span></label><input name="phone" type="tel" placeholder="+1 242 555 0123" /></div>
        <div class="field comp-note"><label>Message <span class="muted small">(optional)</span></label><input name="note" maxlength="300" placeholder="e.g. Thanks for your support — enjoy the show!" /></div>
        <div class="comp-actions"><button class="btn btn-primary">🎁 Send complimentary tickets</button></div>
      </form>
    </div>
    ${attendees.length ? `<div class="table-wrap"><table><thead><tr><th>Attendee</th><th>Ticket</th><th>Code</th><th>Purchased</th><th>Status</th></tr></thead><tbody>
      ${attendees.map((a) => `<tr><td><strong>${esc(a.holderName || a.buyerName)}</strong>${a.test ? ' <span class="badge test">Test</span>' : ''}${a.comp ? ' <span class="badge comp">🎁 Comp</span>' : ''}<div class="muted small">${esc(a.holderEmail || a.buyerEmail)}</div>${a.holderName && a.holderName !== a.buyerName ? `<div class="muted small">Bought by ${esc(a.buyerName)}</div>` : ''}${a.comp && a.compNote ? `<div class="muted small">“${esc(a.compNote)}”</div>` : ''}</td><td>${esc(a.tierName)}</td><td class="code" style="font-size:.9rem">${esc(a.code)}</td><td class="small">${esc(fmtShort(a.purchasedAt))}</td>
      <td>${a.checkedIn ? `<span class="checked">✓ In at ${esc(fmtTime(a.checkedInAt))}</span>` : `<button class="btn btn-ghost btn-sm" data-ci="${esc(a.code)}">Check in</button>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><div class="big">🧾</div><h3>No tickets sold yet</h3><p class="muted">Share your event link to start selling.</p></div>'}`;
  const checkin = async (code) => {
    try { const r = await api('/api/organizer/checkin', { method: 'POST', body: { code, eventId: ev.id } }); toast(`✓ ${r.ticket.buyerName} — ${r.ticket.tierName}`); pageAttendees(id); }
    catch (e) { toast(e.message, true); }
  };
  document.getElementById('ciForm').onsubmit = (e) => { e.preventDefault(); checkin(new FormData(e.target).get('code').trim()); };
  document.getElementById('compForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await api(`/api/events/${encodeURIComponent(ev.id)}/comp`, { method: 'POST', body: { ...f, qty: Number(f.qty) } });
      toast(`🎁 Sent ${r.order.tickets.length} complimentary ticket${r.order.tickets.length > 1 ? 's' : ''} to ${r.order.buyerName}`);
      pageAttendees(id);
    } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = '🎁 Send complimentary tickets'; }
  };
  document.getElementById('scanBtn').onclick = () => startScanner((code) => checkin(code));
  $app.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = () => checkin(b.dataset.ci)));
  document.getElementById('csvBtn').onclick = () => {
    const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const csv = ['First Name,Last Name,Email,Ticket,Price,Code,Purchased,Checked In,Complimentary,Attendee Name,Attendee Email', ...attendees.map((a) => [a.buyerFirstName, a.buyerLastName, a.buyerEmail, a.tierName, a.price, a.code, a.purchasedAt, a.checkedIn ? 'yes' : 'no', a.comp ? 'yes' : 'no', a.holderName || a.buyerName, a.holderEmail || a.buyerEmail].map(q).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${ev.title.replace(/[^\w]+/g, '-')}-attendees.csv`; link.click();
  };
}

// ---------- admin panel ----------
const rolePill = (r) => `<span class="role-pill ${esc(r)}">${ROLE_LABEL[r] || esc(r)}</span>`;
const statusPill = (u) => (u.suspended ? '<span class="badge cancelled">Suspended</span>' : '<span class="badge published">Active</span>');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

function adminShell(tab, inner) {
  const tabs = [['overview', '📊 Overview'], ['users', '👥 Users'], ['organizers', '📣 Organizers'], ['venues', '📍 Venues'], ['events', '🎪 Events'], ['orders', '🧾 Orders'], ['reports', '📈 Reports'], ['messages', '✉️ Emails & Texts'], ['sandbox', '🧪 Sandbox'], ['settings', '⚙ Settings']];
  $app.innerHTML = `
    <div class="section-head"><div><h1>Admin Panel</h1><div class="muted">Full control of TicketJunkies.com — users, organizers, events, orders and settings.</div></div></div>
    <div class="admin-tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div>
    <div id="adminBody">${inner}</div>`;
}

async function refundOrder(id, after) {
  if (!confirm('Refund this order? Its tickets become void and the seats go back on sale.')) return;
  try { await api(`/api/admin/orders/${id}/refund`, { method: 'POST' }); toast('Order refunded'); after(); }
  catch (e) { toast(e.message, true); }
}

const orderRow = (o) => `<tr>
  <td><strong class="code" style="font-size:.85rem">${esc(o.id.slice(-8).toUpperCase())}</strong><div class="muted small">${esc(fmtShort(o.createdAt))}</div></td>
  <td><strong>${esc(o.buyerName)}</strong><div class="muted small">${esc(o.buyerEmail)}</div>${o.account ? `<a class="small" href="#/admin/user/${esc(o.account.id)}">View account</a>` : ''}</td>
  <td>${o.event ? `<a href="#/event/${esc(o.event.id)}">${esc(o.event.title)}</a>` : '<span class="muted">Deleted event</span>'}<div class="muted small">${o.items.map((i) => `${i.qty}× ${esc(i.tierName)}`).join(', ')}</div></td>
  <td><strong>${money(o.total)}</strong><div class="muted small">fees ${money(o.fees)}</div></td>
  <td>${o.status === 'refunded' ? '<span class="badge cancelled">Refunded</span>' : o.comp ? '<span class="badge comp">🎁 Comp</span>' : '<span class="badge published">Paid</span>'}${o.test ? ' <span class="badge test">Test</span>' : ''}</td>
  <td>${o.status === 'refunded' ? '' : `<button class="btn btn-danger btn-sm" data-refund="${esc(o.id)}">Refund</button>`}</td></tr>`;
const ordersTable = (orders) => orders.length
  ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Event</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${orders.map(orderRow).join('')}</tbody></table></div>`
  : '<div class="empty"><div class="big">🧾</div><h3>No orders</h3></div>';
const bindRefunds = (after) => $app.querySelectorAll('[data-refund]').forEach((b) => (b.onclick = () => refundOrder(b.dataset.refund, after)));

async function pageAdmin(tab, sub, params) {
  if (tab === 'user' && sub) return adminUserDetail(sub);
  if (tab === 'users' && sub === 'new') return adminNewUser();
  adminShell(tab, loadingHtml());
  const body = document.getElementById('adminBody');
  const reload = () => pageAdmin(tab, sub, params);

  if (tab === 'overview') {
    const s = await api('/api/admin/stats');
    body.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="muted small">Total accounts</div><div class="num">${s.users}</div><div class="muted small">${s.attendees} attendees · ${s.organizers} organizers · ${s.admins} admin</div></div>
        <div class="stat"><div class="muted small">Tickets sold</div><div class="num">${s.ticketsSold.toLocaleString()}</div><div class="muted small">${s.orders} orders · ${s.refunds} refunded</div></div>
        <div class="stat"><div class="muted small">Total collected</div><div class="num">${money(s.totalCollected)}</div><div class="muted small">${money(s.grossSales)} to organizers</div></div>
        <div class="stat"><div class="muted small">Your platform fees</div><div class="num">${money(s.platformFees)}</div><div class="muted small">${s.liveEvents} live of ${s.events} events</div></div>
      </div>
      ${s.suspended ? `<div class="notice">${s.suspended} suspended account${s.suspended > 1 ? 's' : ''}. <a href="#/admin/users?role=suspended">Review</a></div>` : ''}
      <div class="section-head"><h2>Recent orders</h2><a href="#/admin/orders">All orders →</a></div>
      ${ordersTable(s.recentOrders)}
      <div class="section-head" style="margin-top:26px"><h2>Newest accounts</h2><a href="#/admin/users">All users →</a></div>
      ${usersTable(s.recentUsers)}`;
    bindRefunds(reload);
    return;
  }

  if (tab === 'users') {
    const q = params.get('q') || '', role = params.get('role') || '';
    const { users } = await api(`/api/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}`);
    body.innerHTML = `
      <form class="toolbar" id="uf">
        <input name="q" placeholder="Search name, email, organizer…" value="${esc(q)}" />
        <select name="role">${[['', 'All accounts'], ['user', 'Attendees (ticket buyers)'], ['organizer', 'Organizers'], ['admin', 'Administrators'], ['suspended', 'Suspended']].map(([v, l]) => `<option value="${v}" ${v === role ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn btn-blue">Filter</button>
        <a class="btn btn-primary" href="#/admin/users/new" style="margin-left:auto">+ Add user</a>
      </form>
      <p class="muted small">${users.length} account${users.length === 1 ? '' : 's'}</p>
      ${usersTable(users, true)}`;
    document.getElementById('uf').onsubmit = (e) => { e.preventDefault(); go('#/admin/users?' + new URLSearchParams(new FormData(e.target))); };
    bindUserQuick(reload);
    return;
  }

  if (tab === 'organizers') return adminOrganizers(body, params, reload);
  if (tab === 'venues') return adminVenues(body, params, reload);

  if (tab === 'events') {
    const q = params.get('q') || '', status = params.get('status') || '';
    const { events } = await api(`/api/admin/events?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    body.innerHTML = `
      <form class="toolbar" id="ef">
        <input name="q" placeholder="Search title, venue, organizer…" value="${esc(q)}" />
        <select name="status">${[['', 'All statuses'], ['published', 'Published'], ['draft', 'Draft'], ['cancelled', 'Cancelled']].map(([v, l]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn btn-blue">Filter</button>
        <a class="btn btn-primary" href="#/create" style="margin-left:auto">+ Create event</a>
      </form>
      ${events.length ? `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Organizer</th><th>Status</th><th>Sold</th><th>Revenue</th><th></th></tr></thead><tbody>
      ${events.map((e) => `<tr>
        <td><a href="#/event/${esc(e.id)}"><strong>${esc(e.title)}</strong></a><div class="muted small">${esc(fmtShort(e.startsAt))} · ${esc(e.venue)}, ${esc(e.city)}</div></td>
        <td><a href="#/admin/user/${esc(e.organizerId)}">${esc(e.organizer)}</a><div class="muted small">${esc(e.organizerEmail)}</div></td>
        <td><span class="badge ${esc(e.status)}">${esc(e.status)}</span></td>
        <td>${e.stats.sold} / ${e.stats.capacity}</td>
        <td><strong>${money(e.stats.revenue)}</strong></td>
        <td><div class="actions">
          <a class="btn btn-ghost btn-sm" href="#/edit/${esc(e.id)}">Edit</a>
          <a class="btn btn-ghost btn-sm" href="#/attendees/${esc(e.id)}">Attendees</a>
          ${e.status !== 'published' ? `<button class="btn btn-green btn-sm" data-st="published" data-id="${esc(e.id)}">Publish</button>` : `<button class="btn btn-ghost btn-sm" data-st="draft" data-id="${esc(e.id)}">Unpublish</button>`}
          ${e.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" data-del="${esc(e.id)}" data-sold="${e.stats.orders}">${e.stats.orders ? 'Cancel' : 'Delete'}</button>` : ''}
        </div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><div class="big">🎪</div><h3>No events found</h3></div>'}`;
    document.getElementById('ef').onsubmit = (e) => { e.preventDefault(); go('#/admin/events?' + new URLSearchParams(new FormData(e.target))); };
    body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => {
      try { await api('/api/events/' + b.dataset.id, { method: 'PUT', body: { status: b.dataset.st } }); toast('Event updated'); reload(); } catch (e) { toast(e.message, true); }
    }));
    body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm(b.dataset.sold !== '0' ? 'This event has sales. Cancel it?' : 'Delete this event permanently?')) return;
      try { const r = await api('/api/events/' + b.dataset.del, { method: 'DELETE' }); toast(r.cancelled ? 'Event cancelled' : 'Event deleted'); reload(); } catch (e) { toast(e.message, true); }
    }));
    return;
  }

  if (tab === 'orders') {
    const q = params.get('q') || '', status = params.get('status') || '';
    const { orders } = await api(`/api/admin/orders?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    body.innerHTML = `
      <form class="toolbar" id="of">
        <input name="q" placeholder="Search buyer, email, event, order ID or ticket code…" value="${esc(q)}" />
        <select name="status">${[['', 'All orders'], ['paid', 'Paid'], ['refunded', 'Refunded']].map(([v, l]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn btn-blue">Filter</button>
      </form>
      ${ordersTable(orders)}`;
    document.getElementById('of').onsubmit = (e) => { e.preventDefault(); go('#/admin/orders?' + new URLSearchParams(new FormData(e.target))); };
    bindRefunds(reload);
    return;
  }

  if (tab === 'settings') {
    const { settings } = await api('/api/admin/settings');
    body.innerHTML = `
      <div class="form-card" style="max-width:620px">
        <h3>Service fees (charged to ticket buyers)</h3>
        <p class="muted small">This is what TicketJunkies earns on each paid ticket. Free tickets are never charged.</p>
        ${errBox('setErr')}
        <form id="sf">
          <div class="row">
            <div class="field"><label>Percentage fee (%)</label><input name="feePercent" type="number" step="0.1" min="0" max="30" value="${round2(settings.feePercent * 100)}" /></div>
            <div class="field"><label>Fixed fee per ticket ($)</label><input name="feeFixed" type="number" step="0.01" min="0" max="20" value="${settings.feeFixed}" /></div>
          </div>
          <p class="muted small" id="feeEx"></p>
          <button class="btn btn-primary">Save settings</button>
        </form>
      </div>
      ${captchaSettingsHtml(settings)}
      ${mapsSettingsHtml(settings)}
      ${preloaderSettingsHtml(settings)}
      ${securitySettingsHtml(settings)}
      ${notifSettingsHtml(settings)}
      <div class="form-card" style="max-width:620px;margin-top:20px">
        <h3>Your administrator account</h3>
        <p class="muted small">Change your admin email or password from your own user page.</p>
        <a class="btn btn-ghost" href="#/admin/user/${esc(me.id)}">Edit my admin account</a>
      </div>`;
    const f = document.getElementById('sf');
    const ex = () => { const p = Number(f.feePercent.value) / 100, x = Number(f.feeFixed.value); document.getElementById('feeEx').textContent = `Example: a $25 ticket → buyer pays ${money(25 + round2(25 * p + x))}, you earn ${money(round2(25 * p + x))}.`; };
    f.oninput = ex; ex();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('/api/admin/settings', { method: 'PUT', body: { feePercent: Number(f.feePercent.value), feeFixed: Number(f.feeFixed.value) } }); META.feePercent = r.settings.feePercent; META.feeFixed = r.settings.feeFixed; toast('Settings saved'); }
      catch (err) { showErr('setErr', err.message); }
    };
    bindNotifSettings();
    bindMapsSettings();
    bindCaptchaSettings();
    bindPreloaderSettings(settings);
    bindSecuritySettings(settings);
    return;
  }

  if (tab === 'messages') return adminMessages(body, params);
  if (tab === 'sandbox') return adminSandbox(body);
  if (tab === 'reports') return pageReports(body, params);
  body.innerHTML = '<div class="empty"><h3>Unknown section</h3></div>';
}

// ---------- Admin · Organizers ----------
async function adminOrganizers(body, params, reload) {
  const q = params.get('q') || '';
  const { organizers, accounts } = await api('/api/admin/organizers?q=' + encodeURIComponent(q));
  body.innerHTML = `
    <form class="toolbar" id="dirSearch"><input name="q" placeholder="Search organizers…" value="${esc(q)}" /><button class="btn btn-blue">Search</button>
      <button type="button" class="btn btn-primary" id="dirNew" style="margin-left:auto">+ Add organizer</button></form>
    <div class="form-card dir-form hidden" id="dirForm"></div>
    <p class="muted small">${organizers.length} organizer${organizers.length === 1 ? '' : 's'}. These are the names organizers pick from when they create an event. Renaming one here also renames it on every event that uses it.</p>
    ${organizers.length ? `<div class="table-wrap"><table><thead><tr><th>Organizer</th><th>Contact</th><th>Linked account</th><th>Events</th><th>Tickets sold</th><th></th></tr></thead><tbody>
      ${organizers.map((o) => `<tr>
        <td><strong>${esc(o.name)}</strong>${o.website ? `<div class="small"><a href="${esc(/^https?:/i.test(o.website) ? o.website : 'https://' + o.website)}" target="_blank" rel="noopener">${esc(o.website)}</a></div>` : ''}${o.notes ? `<div class="muted small">${esc(o.notes)}</div>` : ''}</td>
        <td class="small">${esc(o.email || '—')}<div class="muted">${esc(o.phone || '')}</div></td>
        <td class="small">${o.account ? `<a href="#/admin/user/${esc(o.account.id)}">${esc(o.account.name)}</a><div class="muted">${esc(o.account.email)}</div>` : '<span class="muted">—</span>'}</td>
        <td>${o.events}<div class="muted small">${o.upcoming} upcoming</div></td><td>${o.ticketsSold}</td>
        <td><div class="actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(o.id)}">Edit</button><button class="btn btn-danger btn-sm" data-del="${esc(o.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><div class="big">📣</div><h3>No organizers saved yet</h3><p class="muted">They are added automatically when events are created, or add one now.</p></div>'}`;
  document.getElementById('dirSearch').onsubmit = (e) => { e.preventDefault(); go('#/admin/organizers?' + new URLSearchParams(new FormData(e.target))); };
  const form = document.getElementById('dirForm');
  const open = (o) => {
    form.classList.remove('hidden');
    form.innerHTML = `<h3 style="margin-top:0">${o ? 'Edit organizer' : 'Add organizer'}</h3>${errBox('dirErr')}
      <form id="dirF"><div class="row"><div class="field"><label>Organizer name <span class="req">*</span></label><input name="name" required maxlength="100" value="${esc(o?.name || '')}" /></div>
        <div class="field"><label>Linked account <span class="muted small">(optional)</span></label><select name="userId"><option value="">— None —</option>${accounts.map((a) => `<option value="${esc(a.id)}" ${o?.userId === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.email)}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field"><label>Email</label><input name="email" type="email" value="${esc(o?.email || '')}" /></div><div class="field"><label>Phone</label><input name="phone" type="tel" value="${esc(o?.phone || '')}" placeholder="242-555-1234" /></div></div>
      <div class="field"><label>Website / social</label><input name="website" maxlength="200" value="${esc(o?.website || '')}" placeholder="e.g. instagram.com/djpayne242" /></div>
      <div class="field"><label>Notes <span class="muted small">(only admins see this)</span></label><textarea name="notes" maxlength="1000" style="min-height:70px">${esc(o?.notes || '')}</textarea></div>
      <div class="actions"><button class="btn btn-primary">${o ? 'Save changes' : 'Add organizer'}</button><button type="button" class="btn btn-ghost" id="dirCancel">Cancel</button></div></form>`;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('dirCancel').onclick = () => { form.classList.add('hidden'); form.innerHTML = ''; };
    document.getElementById('dirF').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api(o ? '/api/admin/organizers/' + o.id : '/api/admin/organizers', { method: o ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target)) });
        toast(o ? `Organizer saved${r.eventsUpdated ? ` · ${r.eventsUpdated} event${r.eventsUpdated > 1 ? 's' : ''} updated` : ''}` : 'Organizer added'); reload();
      } catch (err) { showErr('dirErr', err.message); }
    };
  };
  document.getElementById('dirNew').onclick = () => open(null);
  body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => open(organizers.find((o) => o.id === b.dataset.edit))));
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const o = organizers.find((x) => x.id === b.dataset.del);
    if (!confirm(`Remove "${o.name}" from the saved organizers list? Events that use this name keep it.`)) return;
    try { await api('/api/admin/organizers/' + o.id, { method: 'DELETE' }); toast('Organizer removed'); reload(); } catch (err) { toast(err.message, true); }
  }));
}

// ---------- Admin · Venues ----------
async function adminVenues(body, params, reload) {
  const q = params.get('q') || '';
  const { venues } = await api('/api/admin/venues?q=' + encodeURIComponent(q));
  const pinBadge = (x) => (Number.isFinite(x.lat) && Number.isFinite(x.lng) ? (x.geoPrecision === 'city' ? '<span class="badge draft">City only</span>' : '<span class="badge published">On map</span>') : '<span class="badge cancelled">No pin</span>');
  body.innerHTML = `
    <form class="toolbar" id="dirSearch"><input name="q" placeholder="Search venues, addresses, cities…" value="${esc(q)}" /><button class="btn btn-blue">Search</button>
      <button type="button" class="btn btn-primary" id="dirNew" style="margin-left:auto">+ Add venue</button></form>
    <div class="form-card dir-form hidden" id="dirForm"></div>
    <p class="muted small">${venues.length} venue${venues.length === 1 ? '' : 's'}. Organizers pick from these when they create an event. Editing a venue's name or address also updates the events that use it.</p>
    ${venues.length ? `<div class="table-wrap"><table><thead><tr><th>Venue</th><th>Address</th><th>Map</th><th>Capacity</th><th>Events</th><th></th></tr></thead><tbody>
      ${venues.map((x) => `<tr>
        <td><strong>${esc(x.name)}</strong>${x.phone ? `<div class="muted small">${esc(x.phone)}</div>` : ''}${x.notes ? `<div class="muted small">${esc(x.notes)}</div>` : ''}</td>
        <td class="small">${esc([x.address, x.city].filter(Boolean).join(', ') || '—')}</td>
        <td>${pinBadge(x)}${Number.isFinite(x.lat) ? ` <a class="small" href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}" target="_blank" rel="noopener">View</a>` : ''}</td>
        <td>${x.capacity || '—'}</td><td>${x.events}<div class="muted small">${x.upcoming} upcoming</div></td>
        <td><div class="actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(x.id)}">Edit</button><button class="btn btn-danger btn-sm" data-del="${esc(x.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><div class="big">📍</div><h3>No venues saved yet</h3><p class="muted">They are added automatically when events are created, or add one now.</p></div>'}`;
  document.getElementById('dirSearch').onsubmit = (e) => { e.preventDefault(); go('#/admin/venues?' + new URLSearchParams(new FormData(e.target))); };
  const form = document.getElementById('dirForm');
  const open = (x) => {
    form.classList.remove('hidden');
    form.innerHTML = `<h3 style="margin-top:0">${x ? 'Edit venue' : 'Add venue'}</h3>${errBox('dirErr')}
      <form id="dirF"><div class="field"><label>Venue name <span class="req">*</span></label><input name="name" required maxlength="120" value="${esc(x?.name || '')}" placeholder="e.g. Club Velocity" /></div>
      <div class="row"><div class="field"><label>Street address</label><input name="address" maxlength="200" value="${esc(x?.address || '')}" /></div><div class="field"><label>City <span class="req">*</span></label><input name="city" required maxlength="80" value="${esc(x?.city || '')}" placeholder="e.g. Nassau" /></div></div>
      <div class="row"><div class="field"><label>Phone</label><input name="phone" type="tel" value="${esc(x?.phone || '')}" /></div><div class="field"><label>Capacity</label><input name="capacity" type="number" min="1" value="${esc(x?.capacity ?? '')}" /></div></div>
      <div class="field"><label>Notes <span class="muted small">(parking, entrance, contact person…)</span></label><textarea name="notes" maxlength="1000" style="min-height:70px">${esc(x?.notes || '')}</textarea></div>
      <p class="muted small">The map pin is found automatically from the address when you save.</p>
      <div class="actions"><button class="btn btn-primary" id="dirSave">${x ? 'Save changes' : 'Add venue'}</button><button type="button" class="btn btn-ghost" id="dirCancel">Cancel</button></div></form>`;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('dirCancel').onclick = () => { form.classList.add('hidden'); form.innerHTML = ''; };
    document.getElementById('dirF').onsubmit = async (e) => {
      e.preventDefault(); const btn = document.getElementById('dirSave'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const r = await api(x ? '/api/admin/venues/' + x.id : '/api/admin/venues', { method: x ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target)) });
        toast(x ? `Venue saved${r.eventsUpdated ? ` · ${r.eventsUpdated} event${r.eventsUpdated > 1 ? 's' : ''} updated` : ''}` : 'Venue added'); reload();
      } catch (err) { showErr('dirErr', err.message); btn.disabled = false; btn.textContent = x ? 'Save changes' : 'Add venue'; }
    };
  };
  document.getElementById('dirNew').onclick = () => open(null);
  body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => open(venues.find((x) => x.id === b.dataset.edit))));
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const x = venues.find((y) => y.id === b.dataset.del);
    if (!confirm(`Remove "${x.name}" from the saved venues list? Events at this venue keep their address.`)) return;
    try { await api('/api/admin/venues/' + x.id, { method: 'DELETE' }); toast('Venue removed'); reload(); } catch (err) { toast(err.message, true); }
  }));
}

function usersTable(users, withActions = false) {
  if (!users.length) return '<div class="empty"><div class="big">👥</div><h3>No accounts found</h3></div>';
  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Organizer</th><th>Role</th><th>Status</th><th>Joined</th><th>Purchases</th><th>Events</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr>
      <td><a href="#/admin/user/${esc(u.id)}"><strong>${esc(u.name)}</strong></a><div class="muted small">${esc(u.email)}</div></td>
      <td>${u.organization ? `<strong>${esc(u.organization)}</strong>` : '<span class="muted">—</span>'}</td>
      <td>${rolePill(u.role)}</td><td>${statusPill(u)}</td>
      <td class="small">${esc(fmtDate(u.createdAt))}</td>
      <td class="small">${u.ticketsBought} tickets<div class="muted">${money(u.spent)}</div></td>
      <td class="small">${u.events}</td>
      <td><div class="actions"><a class="btn btn-ghost btn-sm" href="#/admin/user/${esc(u.id)}">Manage</a>
        ${withActions && u.id !== me.id ? `<button class="btn btn-sm ${u.suspended ? 'btn-green' : 'btn-danger'}" data-susp="${esc(u.id)}" data-v="${u.suspended ? '0' : '1'}">${u.suspended ? 'Reactivate' : 'Suspend'}</button>` : ''}</div></td>
    </tr>`).join('')}</tbody></table></div>`;
}
function bindUserQuick(after) {
  $app.querySelectorAll('[data-susp]').forEach((b) => (b.onclick = async () => {
    const susp = b.dataset.v === '1';
    if (susp && !confirm('Suspend this account? They will be logged out and unable to sign in.')) return;
    try { await api('/api/admin/users/' + b.dataset.susp, { method: 'PUT', body: { suspended: susp } }); toast(susp ? 'Account suspended' : 'Account reactivated'); after(); }
    catch (e) { toast(e.message, true); }
  }));
}

const roleSelect = (cur) => `<select name="role">${['user', 'organizer', 'admin'].map((r) => `<option value="${r}" ${r === cur ? 'selected' : ''}>${ROLE_LABEL[r]}${r === 'user' ? ' (ticket buyer)' : r === 'organizer' ? ' (can post events)' : ' (full control)'}</option>`).join('')}</select>`;

async function adminUserDetail(id) {
  adminShell('users', '<div class="loading">Loading…</div>');
  const { user: u, orders, events } = await api('/api/admin/users/' + encodeURIComponent(id));
  const self = u.id === me.id;
  document.getElementById('adminBody').innerHTML = `
    <a href="#/admin/users" class="small">← All users</a>
    <div class="admin-user-head">
      <div class="avatar">${esc(u.name.trim()[0] || '?').toUpperCase()}</div>
      <div><h2 style="margin:0">${esc(u.name)} ${rolePill(u.role)} ${statusPill(u)}</h2>
        <div class="muted small">${esc(u.email)} · Joined ${esc(fmtDate(u.createdAt))} · Last login ${esc(u.lastLoginAt ? fmtShort(u.lastLoginAt) : 'never')}</div></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="muted small">Orders</div><div class="num">${u.orders}</div></div>
      <div class="stat"><div class="muted small">Tickets bought</div><div class="num">${u.ticketsBought}</div></div>
      <div class="stat"><div class="muted small">Total spent</div><div class="num">${money(u.spent)}</div></div>
      <div class="stat"><div class="muted small">Events posted</div><div class="num">${u.events}</div></div>
    </div>
    <div class="form-card" style="margin-bottom:24px">
      <h3>Account details</h3>
      ${errBox('uErr')}
      <form id="uForm">
        <div class="row">
          <div class="field"><label>Full name</label><input name="name" required value="${esc(u.name)}" /></div>
          <div class="field"><label>Email</label><input name="email" type="email" required value="${esc(u.email)}" /></div>
        </div>
        <div class="row">
          <div class="field"><label>Account type</label>${roleSelect(u.role)}</div>
          <div class="field"><label>Organizer name <span class="muted small">(organizer accounts)</span></label><input name="organization" value="${esc(u.organization)}" /></div>
        </div>
        <div class="row"><div class="field"><label>Mobile number</label><input name="phone" type="tel" value="${esc(u.phone || '')}" placeholder="242-555-1234" /></div><div></div></div>
        <div class="row">
          <div class="field"><label>Set new password</label><input name="password" type="password" minlength="${minPw()}" autocomplete="new-password" placeholder="Leave blank to keep current" /></div>
          <div class="field"><label>Status</label><select name="suspended" ${self ? 'disabled' : ''}><option value="0" ${!u.suspended ? 'selected' : ''}>Active</option><option value="1" ${u.suspended ? 'selected' : ''}>Suspended (can't log in)</option></select></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary">Save changes</button>
          ${u.suspended ? '' : '<button type="button" class="btn btn-ghost" id="sendReset">📧 Send password reset link</button>'}
          <button type="button" class="btn btn-ghost" id="kickUser">🚪 ${self ? 'Log out my other devices' : 'Log out of all devices'}</button>
          ${self ? '' : '<button type="button" class="btn btn-danger" id="delUser">Delete account</button>'}
        </div>
      </form>
    </div>
    <div class="section-head"><h2>Ticket orders</h2></div>
    ${ordersTable(orders)}
    ${events.length || u.role !== 'user' ? `<div class="section-head" style="margin-top:26px"><h2>Events posted</h2></div>
    ${events.length ? `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Status</th><th>Sold</th><th>Revenue</th><th></th></tr></thead><tbody>${events.map((e) => `<tr><td><a href="#/event/${esc(e.id)}"><strong>${esc(e.title)}</strong></a><div class="muted small">${esc(fmtShort(e.startsAt))}</div></td><td><span class="badge ${esc(e.status)}">${esc(e.status)}</span></td><td>${e.stats.sold} / ${e.stats.capacity}</td><td>${money(e.stats.revenue)}</td><td><div class="actions"><a class="btn btn-ghost btn-sm" href="#/edit/${esc(e.id)}">Edit</a><a class="btn btn-ghost btn-sm" href="#/attendees/${esc(e.id)}">Attendees</a></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h3>No events yet</h3></div>'}` : ''}`;
  bindRefunds(() => adminUserDetail(id));
  document.getElementById('uForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const body = { name: f.name, email: f.email, role: f.role, organization: f.organization, phone: f.phone };
    if (!self) body.suspended = f.suspended === '1';
    if (f.password) body.password = f.password;
    try {
      const r = await api('/api/admin/users/' + u.id, { method: 'PUT', body });
      if (self) { me = { ...me, ...r.user }; renderNav(); }
      toast('Account updated'); adminUserDetail(id);
    } catch (err) { showErr('uErr', err.message); }
  };
  const sr = document.getElementById('sendReset');
  if (sr) sr.onclick = async () => {
    if (!confirm(`Email ${u.name} a link to choose a new password?`)) return;
    try { const r = await api('/api/admin/users/' + u.id + '/send-reset', { method: 'POST' }); toast(`Reset link sent to ${r.email}${r.valid ? ` (works for ${r.valid})` : ''}`); }
    catch (err) { toast(err.message, true); }
  };
  document.getElementById('kickUser').onclick = async () => {
    if (!confirm(self ? 'Log out your account on every other device?' : `Log ${u.name} out on every device?`)) return;
    try { await api('/api/admin/users/' + u.id + '/logout', { method: 'POST' }); toast(self ? 'Your other devices are logged out' : `${u.name} is logged out everywhere`); }
    catch (err) { toast(err.message, true); }
  };
  const del = document.getElementById('delUser');
  if (del) del.onclick = async () => {
    if (!confirm(`Permanently delete ${u.name}'s account?`)) return;
    try { await api('/api/admin/users/' + u.id, { method: 'DELETE' }); toast('Account deleted'); go('#/admin/users'); }
    catch (err) { showErr('uErr', err.message); }
  };
}

function adminNewUser() {
  adminShell('users', `
    <a href="#/admin/users" class="small">← All users</a>
    <div class="form-card" style="max-width:640px;margin-top:12px">
      <h2>Add a user</h2>
      <p class="muted small">Create an attendee, organizer or another administrator account.</p>
      ${errBox('nErr')}
      <form id="nForm">
        <div class="row"><div class="field"><label>Full name</label><input name="name" required /></div>
        <div class="field"><label>Email</label><input name="email" type="email" required /></div></div>
        <div class="row"><div class="field"><label>Account type</label>${roleSelect('user')}</div>
        <div class="field"><label>Organizer name <span class="muted small">(organizer accounts)</span></label><input name="organization" /></div></div>
        <div class="field"><label>Mobile number (optional)</label><input name="phone" type="tel" placeholder="242-555-1234" /></div>
        <div class="field"><label>Temporary password</label><input name="password" type="password" minlength="${minPw()}" required autocomplete="new-password" /></div>
        <button class="btn btn-primary">Create account</button>
      </form>
    </div>`);
  document.getElementById('nForm').onsubmit = async (e) => {
    e.preventDefault();
    try { const { user } = await api('/api/admin/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Account created'); go('#/admin/user/' + user.id); }
    catch (err) { showErr('nErr', err.message); }
  };
}

// ---------- maps & weather settings (admin) ----------
function captchaSettingsHtml(settings) {
  const c = settings.captcha;
  const chk = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} /> ${label}</label>`;
  return `
  <div class="form-card" style="max-width:820px;margin-top:20px">
    <h3>🤖 Google reCAPTCHA (spam & bot protection) ${!c.enabled ? '<span class="badge draft">Off</span>' : c.testKeys ? '<span class="badge draft">Test keys</span>' : '<span class="badge published">Protected</span>'}</h3>
    <p class="muted small">Adds the "I'm not a robot" checkbox. The server double-checks every answer with Google, so bots can't skip it.</p>
    ${c.testKeys ? `<div class="notice">You're using <strong>Google's test keys</strong>: the checkbox appears and works, but always passes and shows a red "for testing purposes only" note. Before launch, get free keys at <strong>google.com/recaptcha/admin</strong>: choose <em>reCAPTCHA v2 → "I'm not a robot" Checkbox</em>, add the domain <strong>ticketjunkies.com</strong>, then paste both keys below.</div>` : ''}
    ${errBox('cErr')}
    <form id="cf">
      <div class="checks">${chk('enabled', c.enabled, '<strong>reCAPTCHA on</strong>')}${chk('protectRegister', c.protectRegister, 'Registration (attendees & organizers)')}${chk('protectCheckout', c.protectCheckout, 'Ticket checkout')}</div>
      <div class="row" style="margin-top:10px">
        <div class="field"><label>Site key</label><input name="siteKey" value="${esc(c.siteKey)}" autocomplete="off" /></div>
        <div class="field"><label>Secret key</label><input name="secretKey" value="${esc(c.secretKey)}" autocomplete="off" /></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary">Save reCAPTCHA settings</button>
        ${c.testKeys ? '' : '<button type="button" class="btn btn-ghost" id="capTest">Switch back to test keys</button>'}
        <a class="btn btn-ghost" href="#/register" target="_blank">Preview registration page ↗</a>
      </div>
    </form>
  </div>`;
}
function bindCaptchaSettings() {
  const f = document.getElementById('cf');
  if (!f) return;
  const save = async (extra) => {
    try {
      const body = { enabled: f.enabled.checked, protectRegister: f.protectRegister.checked, protectCheckout: f.protectCheckout.checked, siteKey: f.siteKey.value.trim(), secretKey: f.secretKey.value.trim(), ...extra };
      await api('/api/admin/captcha', { method: 'PUT', body });
      META = { ...META, ...(await api('/api/meta')) };
      toast('reCAPTCHA settings saved');
      pageAdmin('settings', null, new URLSearchParams());
    } catch (err) { showErr('cErr', err.message); }
  };
  f.onsubmit = (e) => { e.preventDefault(); save({}); };
  const t = document.getElementById('capTest'); if (t) t.onclick = () => save({ useTestKeys: true });
}

function mapsSettingsHtml(settings) {
  const m = settings.maps;
  return `
  <div class="form-card" style="max-width:820px;margin-top:20px">
    <h3>🗺️ Maps & weather</h3>
    <p class="muted small">Every event page already shows a <strong>Google Map close-up</strong> of the venue with directions. The front-page map of all events uses OpenStreetMap until you add a Google Maps API key, then it switches to Google Maps automatically.</p>
    ${errBox('mErr')}
    <form id="mf">
      <div class="row">
        <div class="field"><label>Google Maps API key <span class="muted small">(optional)</span></label><input name="googleMapsKey" value="${esc(m.googleMapsKey)}" placeholder="AIza..." autocomplete="off" /><span class="muted small">Google Cloud → enable "Maps JavaScript API" → create a key restricted to ticketjunkies.com.</span></div>
        <div class="field"><label>Country (helps address lookup)</label><input name="country" value="${esc(m.country)}" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Front-page weather location</label><input name="weatherPlace" value="${esc(m.weatherPlace)}" placeholder="Nassau, Bahamas" /><span class="muted small">Also the default center of the map.</span></div>
        <div></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary">Save map & weather settings</button>
        <button type="button" class="btn btn-ghost" id="locateAll">📍 Locate events missing a map pin</button>
      </div>
    </form>
  </div>`;
}
function bindMapsSettings() {
  const f = document.getElementById('mf');
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/admin/maps', { method: 'PUT', body: Object.fromEntries(new FormData(f)) });
      const m = r.settings.maps;
      META.maps = { googleMapsKey: m.googleMapsKey, center: { lat: m.weatherLat, lng: m.weatherLng } };
      META.weatherPlace = { name: m.weatherPlace, lat: m.weatherLat, lng: m.weatherLng };
      toast('Map & weather settings saved');
    } catch (err) { showErr('mErr', err.message); }
  };
  document.getElementById('locateAll').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Locating…';
    try { const r = await api('/api/admin/maps/locate-all', { method: 'POST' }); toast(r.checked ? `Located ${r.located} of ${r.checked} events` : 'All events already have a map pin'); }
    catch (err) { toast(err.message, true); }
    e.target.disabled = false; e.target.textContent = '📍 Locate events missing a map pin';
  };
}

// ---------- log in & security settings (admin) ----------
const HOURS_LIST = [[1, '1 hour'], [4, '4 hours'], [8, '8 hours'], [12, '12 hours'], [24, '1 day'], [72, '3 days'], [168, '1 week'], [336, '2 weeks'], [720, '30 days'], [2160, '90 days']];
const IDLE_LIST = [[0, 'Never (off)'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours']];
const TRIES_LIST = [[0, 'Off (no limit)'], [3, '3 wrong tries'], [5, '5 wrong tries'], [10, '10 wrong tries']];
const LOCK_LIST = [[5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [1440, '1 day']];
const RESET_LIST = [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [1440, '1 day']];
const PWLEN_LIST = [[8, '8 characters'], [10, '10 characters'], [12, '12 characters'], [16, '16 characters']];
function securitySettingsHtml(settings) {
  const s = settings.security;
  const opt = (list, v) => { const l = list.some(([k]) => k === v) ? list : [...list, [v, String(v)]]; return l.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join(''); };
  const wp = !!window.TJ_CONFIG;
  return `
  <div class="form-card" style="max-width:820px;margin-top:20px">
    <h3>🔐 Log in & security</h3>
    <p class="muted small">Control how long people stay logged in, when they're logged out automatically, and how passwords are reset.${wp ? ' New time limits apply the next time someone logs in.' : ''}</p>
    ${errBox('secErr')}
    <form id="secForm">
      <h4 class="sec-sub">⏱️ Log-in timer</h4>
      <div class="row">
        <div class="field"><label>Keep people logged in for</label><select name="sessionHours">${opt(HOURS_LIST, s.sessionHours)}</select><span class="muted small">Attendees and organizers. After this they must log in again.</span></div>
        <div class="field"><label>Keep administrators logged in for</label><select name="adminSessionHours">${opt(HOURS_LIST, s.adminSessionHours)}</select><span class="muted small">A shorter time keeps the Admin Panel safer.</span></div>
      </div>
      <div class="row">
        <div class="field"><label>Log out automatically after no activity</label><select name="idleMinutes">${opt(IDLE_LIST, s.idleMinutes)}</select><span class="muted small">A 1-minute warning shows first, so people can stay logged in.</span></div>
        <div></div>
      </div>
      <h4 class="sec-sub">🚫 Wrong passwords</h4>
      <div class="row">
        <div class="field"><label>Lock the log-in after</label><select name="maxAttempts">${opt(TRIES_LIST, s.maxAttempts)}</select></div>
        <div class="field"><label>Lock it for</label><select name="lockMinutes">${opt(LOCK_LIST, s.lockMinutes)}</select><span class="muted small">Stops people guessing passwords.</span></div>
      </div>
      <h4 class="sec-sub">🔑 Passwords</h4>
      <label class="check"><input type="checkbox" name="allowReset" ${s.allowReset ? 'checked' : ''} /> Show "Forgot your password?" so people can reset it by email</label>
      <div class="row" style="margin-top:10px">
        <div class="field"><label>Reset link works for</label><select name="resetMinutes">${opt(RESET_LIST, s.resetMinutes)}</select></div>
        <div class="field"><label>Shortest password allowed</label><select name="minPassword">${opt(PWLEN_LIST, s.minPassword)}</select><span class="muted small">For new accounts and password changes.</span></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary">Save log-in settings</button>
        <button type="button" class="btn btn-danger" id="kickAll">🚪 Log everyone else out now</button>
      </div>
      <p class="muted small" style="margin-top:10px">To reset one person's password, open <a href="#/admin/users">Users</a>, pick the person and use <strong>Send password reset link</strong> or <strong>Set new password</strong>.</p>
    </form>
  </div>`;
}
function bindSecuritySettings() {
  const f = document.getElementById('secForm');
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const n = (k) => Number(f.elements.namedItem(k).value);
    const body = { sessionHours: n('sessionHours'), adminSessionHours: n('adminSessionHours'), idleMinutes: n('idleMinutes'), maxAttempts: n('maxAttempts'), lockMinutes: n('lockMinutes'), resetMinutes: n('resetMinutes'), minPassword: n('minPassword'), allowReset: f.elements.namedItem('allowReset').checked };
    try {
      const r = await api('/api/admin/security', { method: 'PUT', body });
      const s = r.settings.security;
      META.security = { idleMinutes: s.idleMinutes, allowReset: s.allowReset, minPassword: s.minPassword };
      toast('Log-in settings saved');
    } catch (err) { showErr('secErr', err.message); }
  };
  document.getElementById('kickAll').onclick = async () => {
    if (!confirm('Log out everyone on every device, except you on this one? They will need to log in again.')) return;
    try { const r = await api('/api/admin/logout-everyone', { method: 'POST' }); toast(r.count ? `Logged out ${r.count} ${r.count === 1 ? 'person' : 'people'}` : 'Everyone else is logged out'); }
    catch (err) { toast(err.message, true); }
  };
}

// ---------- automatic log-out after no activity ----------
(function idleLogout() {
  const KEY = 'tj_last_active';
  let last = Date.now(), wrote = 0, warned = false;
  const shared = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
  const hideWarn = () => { warned = false; const w = document.getElementById('idleWarn'); if (w) w.remove(); };
  const bump = () => {
    last = Date.now();
    if (last - wrote > 5000) { wrote = last; try { localStorage.setItem(KEY, String(last)); } catch {} }
    if (warned) hideWarn();
  };
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'wheel'].forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
  setInterval(async () => {
    const mins = META.security && META.security.idleMinutes;
    if (!me || !mins) { if (warned) hideWarn(); return; }
    const left = mins * 60000 - (Date.now() - Math.max(last, shared()));
    if (left <= 0) {
      hideWarn();
      try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
      me = null; renderNav();
      const back = location.hash && !/^#\/(login|reset|forgot)/.test(location.hash) ? '&next=' + encodeURIComponent(tjCurrentRoute()) : '';
      go('#/login?reason=idle' + back);
      if (window.TJ_CONFIG && typeof tjRouteUrl === 'function') location.href = tjRouteUrl('#/login?reason=idle' + back);
      return;
    }
    if (left <= 60000 && !warned) {
      warned = true;
      const w = document.createElement('div');
      w.id = 'idleWarn'; w.className = 'tj-root idle-warn'; w.setAttribute('role', 'alertdialog');
      w.innerHTML = '<div class="idle-box"><strong>⏳ Still there?</strong><span>You\'ll be logged out in 1 minute because there has been no activity.</span><button type="button" class="btn btn-primary btn-sm">Stay logged in</button></div>';
      w.querySelector('button').onclick = () => { bump(); api('/api/auth/me').catch(() => {}); };
      document.body.appendChild(w);
    }
  }, 5000);
})();

// ---------- preloader settings (admin) ----------
const PRE_ICON_LIST = [['logo', 'TicketJunkies'], ['ticket', 'Ticket'], ['vinyl', 'Vinyl record'], ['ring', 'Ring'], ['music', 'Music'], ['star', 'Star'], ['bolt', 'Lightning'], ['heart', 'Heart']];
const PRE_ANIM_LIST = [['spin', '🔄 Spin'], ['pulse', '💓 Pulse (grow & shrink)'], ['rumble', '📳 Rumble (shake)'], ['flash', '⚡ Flash (blink)'], ['bounce', '🏀 Bounce'], ['flip', '🪙 Flip'], ['still', '⏸️ Stand still']];
const PRE_SPEED_LIST = [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']];
const PRE_BG_LIST = [['page', 'Cover the page while it loads'], ['dim', 'See-through dim'], ['clear', 'Icon only (no background)']];
function preloaderSettingsHtml(settings) {
  const p = settings.preloader;
  const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
  const tile = (k, label, src, extra = '') => `<label class="pre-tile"${extra}><input type="radio" name="icon" value="${k}" ${p.icon === k ? 'checked' : ''} /><span><img src="${esc(src)}" alt="" /><em>${label}</em></span></label>`;
  return `
  <div class="form-card" style="max-width:820px;margin-top:20px" id="preCard">
    <h3>⏳ Preloader</h3>
    <p class="muted small">A small icon that appears in the middle of the screen whenever a page opens or refreshes. There is no "Loading" text, just your icon. Pick a built-in icon or upload your own, then choose its size and how it moves.</p>
    ${errBox('pErr')}
    <form id="pf">
      <label class="check"><input type="checkbox" name="enabled" ${p.enabled ? 'checked' : ''} /> Show the preloader when pages open or refresh</label>
      <div class="field" style="margin-top:12px"><label>Icon</label>
        <div class="pre-tiles">${PRE_ICON_LIST.map(([k, l]) => tile(k, l, preIconUrl({ ...p, icon: k }))).join('')}${tile('custom', 'My icon', p.customUrl || '', ` id="preCustomTile"${p.customUrl ? '' : ' hidden'}`)}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="btn btn-ghost btn-sm" id="preUpload">⬆️ Upload my own icon</button>
          <input type="file" id="preFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
          <span class="muted small">A PNG with a see-through background looks best. Animated GIFs work too. Up to 2 MB.</span>
        </div>
      </div>
      <div class="row">
        <div class="field"><label>Size: <strong id="preSizeOut">${p.size}px</strong></label><input type="range" name="size" min="24" max="160" step="2" value="${p.size}" /></div>
        <div class="field"><label>Animation</label><select name="animation">${opt(PRE_ANIM_LIST, p.animation)}</select></div>
      </div>
      <div class="row">
        <div class="field"><label>Speed</label><select name="speed">${opt(PRE_SPEED_LIST, p.speed)}</select></div>
        <div class="field"><label>Background</label><select name="background">${opt(PRE_BG_LIST, p.background)}</select></div>
      </div>
      <div class="field"><label>Preview</label><div class="tj-pre pre-inline" id="prePreview"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary">Save preloader</button>
        <button type="button" class="btn btn-ghost" id="preTry">👀 Try it full screen</button>
      </div>
    </form>
  </div>`;
}
function bindPreloaderSettings(settings) {
  const f = document.getElementById('pf');
  if (!f) return;
  const el = (n) => f.elements.namedItem(n);
  let customUrl = settings.preloader.customUrl || '';
  const val = () => ({ enabled: el('enabled').checked, icon: (f.querySelector('input[name=icon]:checked') || {}).value || 'logo', customUrl, size: Number(el('size').value), animation: el('animation').value, speed: el('speed').value, background: el('background').value });
  const prev = () => { const v = val(); document.getElementById('preSizeOut').textContent = v.size + 'px'; preApply(document.getElementById('prePreview'), v, ' pre-inline'); };
  f.addEventListener('input', prev); f.addEventListener('change', prev); prev();
  document.getElementById('preUpload').onclick = () => document.getElementById('preFile').click();
  document.getElementById('preFile').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Please pick an image of 2 MB or less', true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        toast('Uploading icon…');
        const { url } = await api('/api/upload', { method: 'POST', body: { dataUrl: reader.result } });
        customUrl = url;
        const t = document.getElementById('preCustomTile');
        t.hidden = false; t.querySelector('img').src = url; t.querySelector('input').checked = true;
        prev(); toast('Icon uploaded. Press "Save preloader" to use it.');
      } catch (err) { toast(err.message, true); }
    };
    reader.readAsDataURL(file);
  };
  document.getElementById('preTry').onclick = () => showPreloader({ ...val(), enabled: true }, 2500);
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/admin/preloader', { method: 'PUT', body: val() }); META.preloader = r.settings.preloader; toast('Preloader saved'); }
    catch (err) { showErr('pErr', err.message); }
  };
}

// ---------- notifications (admin) ----------
function notifSettingsHtml(settings) {
  const n = settings.notifications;
  const a = n.adminAlerts;
  const chk = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} /> ${label}</label>`;
  const pill = (on, ready) => on && ready ? '<span class="badge published">Connected</span>' : '<span class="badge draft">Preview mode</span>';
  return `
  <div class="form-card" style="max-width:820px;margin-top:20px">
    <h3>✉️ Email & text notifications</h3>
    <p class="muted small">Until a provider is connected, every message is saved in <a href="#/admin/messages">Emails & Texts</a> in <strong>preview mode</strong> so you can read exactly what would be sent.</p>
    ${errBox('nErr')}
    <form id="nf">
      <div class="form-section"><h3>General</h3>
        <div class="row">
          <div class="field"><label>Website address (used in links)</label><input name="siteUrl" value="${esc(n.siteUrl)}" placeholder="https://ticketjunkies.com" /></div>
          <div class="field"><label>Admin notification email(s)</label><input name="adminEmail" value="${esc(n.adminEmail)}" placeholder="${esc(settings.defaultAdminRecipients.join(', '))}" /><span class="muted small">Blank = all admin accounts (${esc(settings.defaultAdminRecipients.join(', '))})</span></div>
        </div>
        <label style="font-weight:600;font-size:.9rem">Email me (admin) when:</label>
        <div class="checks">${chk('a_userSignup', a.userSignup, 'A user registers')}${chk('a_organizerSignup', a.organizerSignup, 'An organizer registers')}${chk('a_ticketSale', a.ticketSale, 'Tickets are sold')}${chk('a_eventCreated', a.eventCreated, 'An event is created')}</div>
      </div>
      <div class="form-section"><h3>Email — Resend ${pill(n.emailEnabled, n.resendApiKey)}</h3>
        <p class="muted small">Create a free account at <strong>resend.com</strong>, verify the ticketjunkies.com domain, then paste your API key.</p>
        <div class="row">
          <div class="field"><label>Resend API key</label><input name="resendApiKey" value="${esc(n.resendApiKey)}" placeholder="re_..." autocomplete="off" /></div>
          <div class="field"><label>From address</label><input name="emailFrom" value="${esc(n.emailFrom)}" /></div>
        </div>
        <div class="row"><div class="field"><label>Reply-to (optional)</label><input name="replyTo" value="${esc(n.replyTo)}" placeholder="support@ticketjunkies.com" /></div>
        <div class="field" style="align-self:end">${chk('emailEnabled', n.emailEnabled, '<strong>Send real emails</strong>')}</div></div>
      </div>
      <div class="form-section"><h3>Text messages — Twilio ${pill(n.smsEnabled, n.twilioSid && n.twilioToken && n.twilioFrom)}</h3>
        <p class="muted small">Create an account at <strong>twilio.com</strong>, buy a phone number that can send SMS, then paste the details from your Twilio console.</p>
        <div class="row3">
          <div class="field"><label>Account SID</label><input name="twilioSid" value="${esc(n.twilioSid)}" placeholder="AC..." autocomplete="off" /></div>
          <div class="field"><label>Auth token</label><input name="twilioToken" value="${esc(n.twilioToken)}" autocomplete="off" /></div>
          <div class="field"><label>Twilio number</label><input name="twilioFrom" value="${esc(n.twilioFrom)}" placeholder="+1..." /></div>
        </div>
        ${chk('smsEnabled', n.smsEnabled, '<strong>Send real text messages</strong>')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <button class="btn btn-primary">Save notification settings</button>
        <button type="button" class="btn btn-ghost" id="testEmail">Send test email</button>
        <button type="button" class="btn btn-ghost" id="testSms">Send test text</button>
      </div>
    </form>
  </div>`;
}

function bindNotifSettings() {
  const f = document.getElementById('nf');
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = (k) => f.elements[k].value;
    const c = (k) => f.elements[k].checked;
    try {
      await api('/api/admin/notifications', { method: 'PUT', body: {
        siteUrl: v('siteUrl'), adminEmail: v('adminEmail'), resendApiKey: v('resendApiKey'), emailFrom: v('emailFrom'), replyTo: v('replyTo'),
        twilioSid: v('twilioSid'), twilioToken: v('twilioToken'), twilioFrom: v('twilioFrom'),
        emailEnabled: c('emailEnabled'), smsEnabled: c('smsEnabled'),
        adminAlerts: { userSignup: c('a_userSignup'), organizerSignup: c('a_organizerSignup'), ticketSale: c('a_ticketSale'), eventCreated: c('a_eventCreated') },
      } });
      toast('Notification settings saved'); pageAdmin('settings', null, new URLSearchParams());
    } catch (err) { showErr('nErr', err.message); }
  };
  const test = async (channel) => {
    const to = prompt(channel === 'sms' ? 'Send a test text to which mobile number?' : 'Send a test email to which address?', channel === 'sms' ? (me.phone || '') : me.email);
    if (!to) return;
    try {
      const { result } = await api('/api/admin/notifications/test', { method: 'POST', body: { channel, to } });
      toast(result.status === 'sent' ? 'Test sent ✓' : result.status === 'preview' ? 'Saved in preview mode (provider not connected)' : 'Failed: ' + result.detail, result.status === 'failed');
    } catch (err) { toast(err.message, true); }
  };
  document.getElementById('testEmail').onclick = () => test('email');
  document.getElementById('testSms').onclick = () => test('sms');
}

async function adminMessages(body, params) {
  const channel = params.get('channel') || '', q = params.get('q') || '';
  const { notifications } = await api(`/api/admin/notifications?channel=${encodeURIComponent(channel)}&q=${encodeURIComponent(q)}`);
  const st = { sent: 'published', preview: 'draft', failed: 'cancelled', pending: 'draft' };
  body.innerHTML = `
    <form class="toolbar" id="mf">
      <input name="q" placeholder="Search recipient, subject or type…" value="${esc(q)}" />
      <select name="channel">${[['', 'Emails & texts'], ['email', 'Emails only'], ['sms', 'Texts only']].map(([v, l]) => `<option value="${v}" ${v === channel ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn btn-blue">Filter</button>
      <a class="btn btn-ghost" href="#/admin/settings" style="margin-left:auto">⚙ Connect email / SMS</a>
    </form>
    <p class="muted small">Every email and text the site sends is logged here (latest 300). <strong>Preview</strong> = not sent because the provider is not connected yet.</p>
    ${notifications.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>To</th><th>Subject / message</th><th>Status</th><th></th></tr></thead><tbody>
    ${notifications.map((n) => `<tr>
      <td class="small">${esc(fmtShort(n.createdAt))}</td>
      <td>${n.channel === 'sms' ? '📱 Text' : '✉️ Email'}${n.test ? ' <span class="badge test">Test</span>' : ''}<div class="muted small">${esc(n.tag || '')}</div></td>
      <td class="small">${esc(n.to)}</td>
      <td>${esc(n.subject || '')}${n.attachments && n.attachments.length ? `<div class="muted small">📎 ${n.attachments.length} QR attachment${n.attachments.length > 1 ? 's' : ''}</div>` : ''}</td>
      <td><span class="badge ${st[n.status] || 'draft'}" title="${esc(n.detail || '')}">${esc(n.status)}</span></td>
      <td><button class="btn btn-ghost btn-sm" data-view="${esc(n.id)}">View</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty"><div class="big">✉️</div><h3>No messages yet</h3><p class="muted">Messages appear here when users register, events are created or tickets are sold.</p></div>'}
    <div id="msgView"></div>`;
  document.getElementById('mf').onsubmit = (e) => { e.preventDefault(); go('#/admin/messages?' + new URLSearchParams(new FormData(e.target))); };
  body.querySelectorAll('[data-view]').forEach((b) => (b.onclick = async () => {
    const { notification: n } = await api('/api/admin/notifications/' + b.dataset.view);
    const v = document.getElementById('msgView');
    v.innerHTML = `<div class="panel" style="margin-top:20px">
      <div class="section-head"><div><h3 style="margin:0">${esc(n.subject || 'Text message')}</h3><div class="muted small">To ${esc(n.to)} · ${esc(fmtShort(n.createdAt))} · ${esc(n.status)}${n.detail ? ' — ' + esc(n.detail) : ''}</div></div><button class="btn btn-ghost btn-sm" id="closeMsg">Close</button></div>
      ${n.channel === 'email' ? '<iframe id="msgFrame" sandbox="" style="width:100%;height:720px;border:1px solid #e5e7eb;border-radius:12px;background:#fff"></iframe>' : `<div class="sms-bubble">${esc(n.text)}</div>`}
    </div>`;
    if (n.channel === 'email') document.getElementById('msgFrame').srcdoc = n.html || '';
    document.getElementById('closeMsg').onclick = () => (v.innerHTML = '');
    v.scrollIntoView({ behavior: 'smooth' });
  }));
}

// ---------- sandbox (admin) ----------
async function adminSandbox(body) {
  const data = await api('/api/admin/sandbox');
  const { events, testOrders, providers } = data;
  const conn = (on, label) => on ? `<span class="badge published">${label}: sending for real</span>` : `<span class="badge draft">${label}: preview only</span>`;
  body.innerHTML = `
    <div class="sandbox-hero">
      <div><h2 style="margin:0 0 6px">🧪 Sandbox — simulate a ticket sale</h2>
      <p class="muted" style="margin:0">Runs the full purchase flow (QR tickets, buyer email & text, organizer and admin alerts, door check-in) without real payment. Test orders <strong>never</strong> change ticket inventory, sales totals or payouts, and real organizers are not emailed — their copy comes to you.</p></div>
      <div class="sandbox-status">${conn(providers.email, 'Email')} ${conn(providers.sms, 'Texts')}<a class="small" href="#/admin/settings">Connect providers →</a></div>
    </div>
    ${!events.length ? '<div class="empty"><div class="big">🎪</div><h3>Create an event first</h3><a class="btn btn-primary" href="#/create">+ Create event</a></div>' : `
    <div class="form-card" style="margin-bottom:22px">
      ${errBox('sbErr')}
      <form id="sbForm">
        <div class="row">
          <div class="field"><label>Event</label><select name="eventId" id="sbEvent">${events.map((e) => `<option value="${esc(e.id)}">${esc(e.title)} — ${esc(fmtShort(e.startsAt))}${e.status === 'draft' ? ' (draft)' : ''}</option>`).join('')}</select></div>
          <div class="row" style="gap:10px">
            <div class="field"><label>Ticket type</label><select name="tierId" id="sbTier"></select></div>
            <div class="field"><label>Quantity</label><select name="qty">${[1, 2, 3, 4].map((n) => `<option ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          </div>
        </div>
        <div class="row3">
          <div class="field"><label>Buyer name</label><input name="buyerName" required value="${esc(me.name)}" /></div>
          <div class="field"><label>Send tickets to email</label><input name="buyerEmail" type="email" required value="${esc(me.email)}" /></div>
          <div class="field"><label>Send text to mobile</label><input name="buyerPhone" type="tel" required value="${esc(me.phone || '')}" placeholder="242-555-1234" /></div>
        </div>
        <button class="btn btn-primary" id="sbBtn">🧪 Simulate ticket sale</button>
        <span class="muted small" style="margin-left:10px">Card used: test card •••• 4242 — no money moves.</span>
      </form>
    </div>
    <div id="sbResult"></div>`}
    <div class="section-head" style="margin-top:26px"><h2>Test orders (${testOrders.length})</h2>
      ${testOrders.length ? '<button class="btn btn-danger btn-sm" id="sbClear">Delete all test data</button>' : ''}</div>
    ${testOrders.length ? `<div class="table-wrap"><table><thead><tr><th>Created</th><th>Event</th><th>Buyer</th><th>Tickets</th><th></th></tr></thead><tbody>
      ${testOrders.map((o) => `<tr><td class="small">${esc(fmtShort(o.createdAt))}</td><td>${esc(o.event?.title || '')}</td><td class="small">${esc(o.buyerEmail)}<div class="muted">${esc(o.buyerPhone)}</div></td>
        <td class="small">${o.tickets.map((t) => `<span class="code" style="font-size:.8rem">${esc(t.code)}</span>${t.checkedIn ? ' ✓' : ''}`).join('<br>')}</td>
        <td><div class="actions"><button class="btn btn-ghost btn-sm" data-show="${esc(o.id)}">Show results</button><a class="btn btn-ghost btn-sm" href="${esc(tjLink(o.link))}">Ticket page</a></div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">No test orders yet.</p>'}`;

  const evSel = document.getElementById('sbEvent');
  if (evSel) {
    const fillTiers = () => {
      const ev = events.find((e) => e.id === evSel.value);
      document.getElementById('sbTier').innerHTML = ev.tiers.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} — ${t.price ? money(t.price) : 'Free'}</option>`).join('');
    };
    evSel.onchange = fillTiers; fillTiers();
    document.getElementById('sbForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('sbBtn'); btn.disabled = true; btn.textContent = 'Simulating…';
      try {
        const r = await api('/api/admin/sandbox/sale', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        toast('Test sale complete — tickets issued');
        const keep = { eventId: evSel.value, tierId: document.getElementById('sbTier').value };
        await adminSandbox(body);
        const ev2 = document.getElementById('sbEvent');
        if (ev2) { ev2.value = keep.eventId; ev2.onchange(); document.getElementById('sbTier').value = keep.tierId; document.getElementById('sbBtn').textContent = '🧪 Simulate another sale'; }
        await showSandboxResult(r.order, r.providers, r.lanUrls);
        return;
      } catch (err) { showErr('sbErr', err.message); }
      btn.disabled = false; btn.textContent = '🧪 Simulate ticket sale';
    };
  }
  body.querySelectorAll('[data-show]').forEach((b) => (b.onclick = () => {
    const o = testOrders.find((x) => x.id === b.dataset.show);
    showSandboxResult(o, providers, data.lanUrls);
  }));
  const clr = document.getElementById('sbClear');
  if (clr) clr.onclick = async () => {
    if (!confirm('Delete all sandbox test orders, tickets and test messages?')) return;
    const r = await api('/api/admin/sandbox', { method: 'DELETE' });
    toast(`Removed ${r.removedOrders} test orders and ${r.removedMessages} test messages`);
    adminSandbox(body);
  };
}

async function showSandboxResult(order, providers, lanUrls) {
  const box = document.getElementById('sbResult') || document.getElementById('adminBody');
  // messages are sent in the background — give them a moment to be logged
  let messages = [];
  for (let i = 0; i < 6; i++) {
    messages = (await api(`/api/admin/sandbox/orders/${order.id}/messages`)).messages;
    if (messages.length && messages.every((m) => m.status !== 'pending')) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  const ev = order.event || {};
  const localLink = tjLink(order.link);
  const phoneBase = (lanUrls || [])[0];
  const phoneLink = phoneBase ? phoneBase + order.link : '';
  const order1 = ['buyer.tickets', 'organizer.sale', 'admin.ticketSale', 'organizer.soldOut'];
  messages.sort((a, b) => order1.indexOf(a.tag) - order1.indexOf(b.tag) || (a.channel === 'sms') - (b.channel === 'sms'));
  const label = (m) => ({ 'buyer.tickets': m.channel === 'sms' ? '📱 Buyer text' : '✉️ Buyer ticket email', 'organizer.sale': '📣 Organizer sale email', 'admin.ticketSale': '⚙ Admin sale alert', 'organizer.soldOut': '🔥 Sold-out email' }[m.tag] || m.tag);
  const stBadge = (m) => m.status === 'sent' ? '<span class="badge published">Delivered to provider</span>' : m.status === 'failed' ? `<span class="badge cancelled" title="${esc(m.detail || '')}">Failed</span>` : '<span class="badge draft">Preview (not sent)</span>';

  box.innerHTML = `
    <div class="panel sandbox-result">
      <div class="section-head"><div><h2 style="margin:0">✅ Test sale complete</h2><div class="muted small">${esc(ev.title || '')} · ${order.tickets.length} × ${esc(order.items[0].tierName)} · total ${money(order.total)} · order ${esc(order.id.slice(-8).toUpperCase())}</div></div>
        <a class="btn btn-blue btn-sm" href="${esc(tjLink(order.link))}" target="_blank">Open ticket page ↗</a></div>

      <h3>1. Tickets issued</h3>
      <div class="sb-tickets">${order.tickets.map((t) => `
        <div class="sb-ticket"><img loading="lazy" decoding="async" src="${TJ.rest}qr/${esc(t.code)}.svg" alt="QR ${esc(t.code)}" /><div class="code">${esc(t.code)}</div>
          <button class="btn btn-green btn-sm" data-ci="${esc(t.code)}">${t.checkedIn ? 'Scan again (should be rejected)' : '🚪 Test door check-in'}</button><div class="small ci-res" data-res="${esc(t.code)}"></div></div>`).join('')}</div>

      <h3 style="margin-top:22px">2. Messages sent</h3>
      <div class="sb-msgs">${messages.map((m, i) => `<button class="sb-msg ${i === 0 ? 'active' : ''}" data-i="${i}"><strong>${label(m)}</strong><span class="small muted">to ${esc(m.to)}</span>${stBadge(m)}</button>`).join('') || '<p class="muted">No messages logged — check Admin → Emails & Texts.</p>'}</div>
      <div id="sbMsgView"></div>
      ${!providers.email || !providers.sms ? `<div class="notice" style="margin-top:12px">${!providers.email ? 'Email is in <strong>preview mode</strong>, so the ticket email is shown here instead of landing in your inbox. ' : ''}${!providers.sms ? 'Texts are in <strong>preview mode</strong>, so the text is shown here instead of on your phone. ' : ''}Connect Resend / Twilio in <a href="#/admin/settings">Settings</a> and run the sandbox again to receive them for real.</div>` : ''}

      <h3 style="margin-top:22px">3. See it on your phone</h3>
      <div class="sb-phone">
        ${phoneLink ? `<img loading="lazy" decoding="async" src="${TJ.rest}qr/link.svg?u=${encodeURIComponent(phoneLink)}" alt="Open on phone" />` : ''}
        <div><p style="margin-top:0">${phoneLink ? 'Scan this with your phone camera (phone must be on the same Wi-Fi as this computer) to open the buyer\'s ticket page with the QR codes — exactly what the text message link opens.' : 'Your computer has no local network address right now, so the phone link is unavailable.'}</p>
          ${phoneLink ? `<div class="code" style="font-size:.8rem;word-break:break-all">${esc(phoneLink)}</div>` : ''}
          <p class="muted small">Then, on another device, open this event's <a href="#/attendees/${esc(order.eventId)}">Attendees page</a> and use <strong>📷 Scan QR</strong> to scan the ticket on your phone — the full door experience. Once the site is online at your real domain, links work anywhere.</p></div>
      </div>
    </div>`;

  const view = document.getElementById('sbMsgView');
  const showMsg = (i) => {
    const m = messages[i]; if (!m) return;
    box.querySelectorAll('.sb-msg').forEach((b) => b.classList.toggle('active', Number(b.dataset.i) === i));
    view.innerHTML = m.channel === 'sms'
      ? `<div class="sb-phone-frame"><div class="muted small" style="text-align:center;margin-bottom:10px">Text to ${esc(m.to)}</div><div class="sms-bubble">${esc(m.text).replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank">$1</a>')}</div></div>`
      : `<div class="muted small" style="margin:10px 0 6px"><strong>Subject:</strong> ${esc(m.subject)} · <strong>To:</strong> ${esc(m.to)}${m.attachments?.length ? ` · 📎 ${m.attachments.map(esc).join(', ')}` : ''}</div><iframe sandbox="" class="sb-frame"></iframe>`;
    if (m.channel === 'email') view.querySelector('iframe').srcdoc = m.html || '';
  };
  box.querySelectorAll('.sb-msg').forEach((b) => (b.onclick = () => showMsg(Number(b.dataset.i))));
  showMsg(0);
  box.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = async () => {
    const res = box.querySelector(`[data-res="${b.dataset.ci}"]`);
    try {
      const r = await api('/api/organizer/checkin', { method: 'POST', body: { code: b.dataset.ci, eventId: order.eventId } });
      res.innerHTML = `<span class="checked">✓ Admitted: ${esc(r.ticket.buyerName)} — ${esc(r.ticket.tierName)}</span>`;
      b.textContent = 'Scan again (should be rejected)';
    } catch (e) { res.innerHTML = `<span style="color:#b42318;font-weight:700">⛔ ${esc(e.message)}</span>`; }
  }));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- sales reports (admin: all events + card data; organizer: own events) ----------
function downloadCsv(filename, header, rows) {
  const q = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
  const csv = '\ufeff' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function pageReports(adminBody, params) {
  const admin = !!adminBody;
  const host = adminBody || $app;
  if (!admin) $app.innerHTML = '<div class="loading">Loading report…</div>';
  else adminBody.innerHTML = '<div class="loading">Loading report…</div>';
  const qs = new URLSearchParams();
  for (const k of ['eventId', 'status', 'from', 'to', 'tests']) if (params.get(k)) qs.set(k, params.get(k));
  const { report: r } = await api(`/api/${admin ? 'admin' : 'organizer'}/reports?${qs}`);
  const f = r.filters, s = r.summary;
  const base = admin ? '#/admin/reports' : '#/reports';
  const single = f.eventId ? r.byEvent[0] : null;
  const day = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const dt = (iso) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const cardTxt = (t) => t.cardLast4 ? `${t.cardBrand || 'Card'} •••• ${t.cardLast4}` : 'Free / no card';
  const maxDay = Math.max(1, ...r.byDay.map((d) => d.total));
  const evTitle = single ? single.title : 'All events';
  const period = f.from || f.to ? `${f.from ? day(f.from + 'T12:00') : 'start'} – ${f.to ? day(f.to + 'T12:00') : 'today'}` : 'All time';

  const html = `
    ${admin ? '' : `<div class="section-head"><div><a href="#/dashboard" class="small">← Dashboard</a><h1>📈 Sales reports</h1><div class="muted">${esc(me.organization || me.name)}</div></div></div>`}
    <form class="toolbar report-filters no-print" id="rf">
      <select name="eventId"><option value="">All events</option>${r.events.map((e) => `<option value="${esc(e.id)}" ${e.id === f.eventId ? 'selected' : ''}>${esc(e.title)} — ${esc(day(e.startsAt))}</option>`).join('')}</select>
      <label class="rf-date">From <input type="date" name="from" value="${esc(f.from)}" /></label>
      <label class="rf-date">To <input type="date" name="to" value="${esc(f.to)}" /></label>
      <select name="status">${[['paid', 'Paid orders'], ['refunded', 'Refunded only'], ['all', 'Paid + refunded']].map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${admin ? `<label class="check"><input type="checkbox" name="tests" value="1" ${f.tests ? 'checked' : ''} /> Include sandbox tests</label>` : ''}
      <button class="btn btn-blue">Run report</button>
    </form>

    <div class="export-panel no-print" id="exportPanel">
      <div class="export-head"><strong>⬇ Download this report</strong><span class="muted small">Uses the filters above. Pick what to include, then choose a format.</span></div>
      <div class="export-sections">
        ${[['summary', 'Summary totals'], ['days', 'Sales by day'], ['events', single ? 'Ticket types' : 'Sales by event'], ...(admin ? [['cards', 'Tickets per card']] : []), ['transactions', 'Transactions'], ['attendees', 'Attendee list']].map(([v, l]) => `<label class="check"><input type="checkbox" name="xs" value="${v}" checked /> ${l}</label>`).join('')}
      </div>
      <div class="export-buttons">
        <button type="button" class="btn btn-export x-pdf" data-fmt="pdf">📄 PDF</button>
        <button type="button" class="btn btn-export x-docx" data-fmt="docx">📝 Word</button>
        <button type="button" class="btn btn-export x-xlsx" data-fmt="xlsx">📊 Excel</button>
        <button type="button" class="btn btn-export x-csv" data-fmt="csv">🧾 CSV</button>
        <button type="button" class="btn btn-ghost" id="rPrint">🖨 Print</button>
      </div>
    </div>

    <div class="report-title"><h2 style="margin:0">${esc(evTitle)}</h2><div class="muted small">${esc(period)} · ${f.status === 'all' ? 'paid + refunded' : f.status === 'refunded' ? 'refunded orders' : 'paid orders'}${f.tests ? ' · incl. sandbox tests' : ''} · generated ${esc(dt(r.generatedAt))}</div></div>

    <div class="stats report-stats">
      <div class="stat"><div class="muted small">Tickets sold</div><div class="num">${s.tickets.toLocaleString()}</div><div class="muted small">${s.orders} orders · ${s.checkedIn} checked in${s.compTickets ? ` · 🎁 ${s.compTickets} comps` : ''}</div></div>
      <div class="stat"><div class="muted small">Ticket sales${admin ? ' (to organizers)' : ' (your revenue)'}</div><div class="num">${money(s.grossSales)}</div><div class="muted small">avg order ${money(s.avgOrder)}</div></div>
      <div class="stat"><div class="muted small">${admin ? 'Platform fees (yours)' : 'Service fees paid by buyers'}</div><div class="num">${money(s.fees)}</div><div class="muted small">total collected ${money(s.totalCollected)}</div></div>
      <div class="stat"><div class="muted small">Buyers${admin ? ' · cards' : ''}</div><div class="num">${s.buyers}${admin ? ` <span style="font-size:1rem;color:var(--muted)">· ${s.cards} cards</span>` : ''}</div><div class="muted small">${s.refundedOrders} refunded (${money(s.refundedAmount)})</div></div>
    </div>

    <div class="report-section">
      <div class="section-head"><h3>📅 Sales by day</h3></div>
      ${r.byDay.length ? `<div class="bars">${r.byDay.slice(-31).map((d) => `<div class="bar" title="${esc(day(d.date + 'T12:00'))}: ${d.tickets} tickets, ${money(d.total)}"><div class="bar-fill" style="height:${Math.max(4, Math.round((d.total / maxDay) * 100))}%"></div><span>${esc(new Date(d.date + 'T12:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }))}</span><b>${d.tickets}</b></div>`).join('')}</div><div class="muted small">Bar height = money collected; number = tickets sold that day${r.byDay.length > 31 ? ' (last 31 sales days shown)' : ''}.</div>` : '<p class="muted">No sales in this period.</p>'}
    </div>

    <div class="report-section">
      <div class="section-head"><h3>🎪 ${single ? 'Ticket types' : 'Sales by event'}</h3><button class="btn btn-ghost btn-sm no-print" id="csvEvents">⬇ CSV</button></div>
      ${single ? `<div class="table-wrap"><table><thead><tr><th>Ticket type</th><th>Price</th><th>Sold (period)</th><th>Capacity</th><th>Revenue</th></tr></thead><tbody>
        ${single.tiers.map((t) => `<tr><td><strong>${esc(t.name)}</strong></td><td>${t.price ? money(t.price) : 'Free'}</td><td>${t.sold}</td><td>${t.quantity}</td><td><strong>${money(t.revenue)}</strong></td></tr>`).join('')}
        <tr class="total-row"><td>Total</td><td></td><td>${single.tickets}</td><td>${single.capacity}</td><td>${money(single.gross)}</td></tr></tbody></table></div>`
      : `<div class="table-wrap"><table><thead><tr><th>Event</th>${admin ? '<th>Organizer</th>' : ''}<th>Orders</th><th>Tickets</th><th>Sold / capacity (all time)</th><th>Ticket sales</th><th>Fees</th><th>Refunds</th><th>Checked in</th></tr></thead><tbody>
        ${r.byEvent.map((e) => `<tr><td><a href="${base}?${new URLSearchParams({ ...Object.fromEntries(qs), eventId: e.id })}"><strong>${esc(e.title)}</strong></a><div class="muted small">${esc(day(e.startsAt))} · ${esc(e.venue)}</div></td>${admin ? `<td class="small">${esc(e.organizer)}</td>` : ''}<td>${e.orders}</td><td>${e.tickets}</td><td>${e.soldAllTime} / ${e.capacity}<div class="progress"><div style="width:${e.capacity ? Math.round((e.soldAllTime / e.capacity) * 100) : 0}%"></div></div></td><td><strong>${money(e.gross)}</strong></td><td>${money(e.fees)}</td><td>${e.refunds}</td><td>${e.checkedIn}</td></tr>`).join('') || `<tr><td colspan="9" class="muted">No events</td></tr>`}
        <tr class="total-row"><td>Total</td>${admin ? '<td></td>' : ''}<td>${s.orders}</td><td>${s.tickets}</td><td></td><td>${money(s.grossSales)}</td><td>${money(s.fees)}</td><td>${s.refundedOrders}</td><td>${s.checkedIn}</td></tr></tbody></table></div>`}
    </div>

    ${admin ? `<div class="report-section">
      <div class="section-head"><h3>💳 Tickets purchased per card</h3><button class="btn btn-ghost btn-sm no-print" id="csvCards">⬇ CSV</button></div>
      <p class="muted small" style="margin-top:-6px">Grouped by a secure card fingerprint, so the same card is recognized across orders without storing the card number. Flags highlight cards worth a second look.</p>
      ${r.byCard.length ? `<div class="table-wrap"><table><thead><tr><th>Card</th><th>Name on card</th><th>Buyer email(s)</th><th>Orders</th><th>Tickets</th><th>Total spent</th><th>Events</th><th>First / last purchase</th><th>Flags</th></tr></thead><tbody>
        ${r.byCard.map((c) => `<tr><td><strong>${esc(c.brand)} •••• ${esc(c.last4)}</strong>${c.fingerprint.startsWith('legacy_') ? '<div class="muted small">older order</div>' : ''}</td><td class="small">${c.holders.map(esc).join('<br>') || '—'}</td><td class="small">${c.emails.map(esc).join('<br>')}</td><td>${c.orders}${c.refunds ? ` <span class="muted small">(+${c.refunds} refunded)</span>` : ''}</td><td><strong>${c.tickets}</strong></td><td><strong>${money(c.total)}</strong></td><td class="small">${c.events.map(esc).join('<br>')}</td><td class="small">${esc(day(c.first))}<br>${esc(day(c.last))}</td><td>${c.flags.map((x) => `<span class="badge draft" style="display:inline-block;margin:1px 0">${esc(x)}</span>`).join(' ') || '<span class="muted small">—</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No card payments in this period.</p>'}
    </div>` : ''}

    <div class="report-section">
      <div class="section-head"><h3>🧾 Transactions & attendees (${r.transactions.length})</h3>
        <div class="actions no-print"><input class="rf-search" id="txSearch" placeholder="Filter by name, email, phone, code${admin ? ', card' : ''}…" /><button class="btn btn-ghost btn-sm" id="csvTx">⬇ Orders CSV</button><button class="btn btn-ghost btn-sm" id="csvTickets">⬇ Attendee list CSV</button></div></div>
      ${r.transactions.length ? `<div class="table-wrap"><table class="tx-table"><thead><tr><th>Sale date</th><th>Order</th>${single ? '' : '<th>Event</th>'}<th>Attendee / buyer</th>${admin ? '<th>Card</th>' : ''}<th>Tickets</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        ${r.transactions.map((t) => `<tr data-search="${esc([t.buyerName, t.buyerEmail, t.buyerPhone, t.ref, t.event, ...t.codes, admin ? `${t.cardBrand} ${t.cardLast4} ${t.cardHolder}` : ''].join(' ').toLowerCase())}">
          <td class="small">${esc(dt(t.createdAt))}</td>
          <td><span class="code" style="font-size:.8rem">${esc(t.ref)}</span>${t.test ? ' <span class="badge test">Test</span>' : ''}</td>
          ${single ? '' : `<td class="small">${esc(t.event)}</td>`}
          <td><strong>${esc(t.buyerName)}</strong><div class="muted small">${esc(t.buyerEmail)}${t.buyerPhone ? '<br>' + esc(t.buyerPhone) : ''}</div></td>
          ${admin ? `<td class="small"><strong>${esc(cardTxt(t))}</strong>${t.cardHolder ? '<br>' + esc(t.cardHolder) : ''}</td>` : ''}
          <td class="small"><strong>${t.qty}</strong> · ${t.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}<div class="muted">${t.codes.map(esc).join(', ')}</div>${t.checkedIn ? `<div class="checked">✓ ${t.checkedIn} checked in</div>` : ''}</td>
          <td><strong>${money(t.total)}</strong><div class="muted small">${money(t.subtotal)} + ${money(t.fees)} fees</div></td>
          <td>${t.status === 'refunded' ? `<span class="badge cancelled">Refunded</span><div class="muted small">${esc(day(t.refundedAt))}</div>` : t.comp ? `<span class="badge comp">🎁 Comp</span>${t.issuedBy ? `<div class="muted small">by ${esc(t.issuedBy)}</div>` : ''}` : '<span class="badge published">Paid</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><div class="big">🧾</div><h3>No sales match these filters</h3></div>'}
    </div>`;

  if (admin) adminBody.innerHTML = html; else $app.innerHTML = html;

  const rf = host.querySelector('#rf');
  rf.onsubmit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(rf)) if (v) p.set(k, v);
    go(`${base}?${p}`);
  };
  rf.querySelector('[name=eventId]').onchange = () => rf.requestSubmit();
  host.querySelector('#rPrint').onclick = () => window.print();
  host.querySelectorAll('.btn-export').forEach((b) => b.onclick = async () => {
    const secs = [...host.querySelectorAll('input[name=xs]:checked')].map((i) => i.value);
    if (!secs.length) return toast('Tick at least one section to include', true);
    const p = new URLSearchParams(qs); p.set('format', b.dataset.fmt); p.set('sections', secs.join(','));
    const label = b.innerHTML; b.disabled = true; b.innerHTML = '⏳ Preparing…';
    try {
      const res = await fetch(`${TJ.rest}${admin ? 'admin' : 'organizer'}/reports/export?${p}`, { credentials: 'same-origin', headers: { 'X-WP-Nonce': TJ.nonce } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Export failed'); }
      const blob = await res.blob();
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || `ticketjunkies-report.${b.dataset.fmt}`;
      const url = URL.createObjectURL(blob);
      const el = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(`Downloaded ${name}`);
    } catch (e) { toast(e.message, true); }
    finally { b.disabled = false; b.innerHTML = label; }
  });
  const slug = (single ? single.title : 'all-events').replace(/[^\w]+/g, '-').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  const tsv = host.querySelector('#txSearch');
  if (tsv) tsv.oninput = () => { const q = tsv.value.toLowerCase().trim(); host.querySelectorAll('.tx-table tbody tr').forEach((tr) => { tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none'; }); };
  host.querySelector('#csvTx').onclick = () => downloadCsv(`ticketjunkies-orders-${slug}-${stamp}.csv`,
    ['Sale date', 'Order #', 'Event', 'Event date', 'Buyer name', 'Email', 'Phone', ...(admin ? ['Card brand', 'Card last 4', 'Name on card', 'Card fingerprint'] : []), 'Tickets (qty)', 'Ticket types', 'Ticket codes', 'Checked in', 'Ticket sales', 'Fees', 'Total', 'Status', 'Refunded on', 'Sandbox test'],
    r.transactions.map((t) => [dt(t.createdAt), t.ref, t.event, dt(t.eventDate), t.buyerName, t.buyerEmail, t.buyerPhone, ...(admin ? [t.cardBrand, t.cardLast4, t.cardHolder, t.cardFingerprint] : []), t.qty, t.items.map((i) => `${i.qty}x ${i.name}`).join('; '), t.codes.join(' '), t.checkedIn, t.subtotal.toFixed(2), t.fees.toFixed(2), t.total.toFixed(2), t.status, t.refundedAt ? dt(t.refundedAt) : '', t.test ? 'yes' : '']));
  host.querySelector('#csvTickets').onclick = () => downloadCsv(`ticketjunkies-attendees-${slug}-${stamp}.csv`,
    ['Ticket code', 'Event', 'Ticket type', 'Price', 'First name', 'Last name', 'Email', 'Phone', 'Order #', 'Sale date', 'Order status', ...(admin ? ['Card'] : [])],
    r.transactions.flatMap((t) => { const types = t.items.flatMap((i) => Array(i.qty).fill(i)); return t.codes.map((c, k) => [c, t.event, types[k]?.name || '', (types[k]?.price ?? 0).toFixed(2), t.buyerFirstName, t.buyerLastName, t.buyerEmail, t.buyerPhone, t.ref, dt(t.createdAt), t.status, ...(admin ? [cardTxt(t)] : [])]); }));
  host.querySelector('#csvEvents').onclick = () => single
    ? downloadCsv(`ticketjunkies-ticket-types-${slug}-${stamp}.csv`, ['Ticket type', 'Price', 'Sold', 'Capacity', 'Revenue'], single.tiers.map((t) => [t.name, t.price.toFixed(2), t.sold, t.quantity, t.revenue.toFixed(2)]))
    : downloadCsv(`ticketjunkies-events-${stamp}.csv`, ['Event', 'Event date', 'Venue', ...(admin ? ['Organizer'] : []), 'Orders', 'Tickets', 'Sold (all time)', 'Capacity', 'Ticket sales', 'Fees', 'Total collected', 'Refunds', 'Checked in'],
      r.byEvent.map((e) => [e.title, dt(e.startsAt), e.venue, ...(admin ? [e.organizer] : []), e.orders, e.tickets, e.soldAllTime, e.capacity, e.gross.toFixed(2), e.fees.toFixed(2), e.total.toFixed(2), e.refunds, e.checkedIn]));
  const cc = host.querySelector('#csvCards');
  if (cc) cc.onclick = () => downloadCsv(`ticketjunkies-cards-${slug}-${stamp}.csv`,
    ['Card brand', 'Last 4', 'Card fingerprint', 'Name(s) on card', 'Buyer email(s)', 'Orders', 'Refunded orders', 'Tickets', 'Total spent', 'Events', 'First purchase', 'Last purchase', 'Flags'],
    r.byCard.map((c) => [c.brand, c.last4, c.fingerprint, c.holders.join('; '), c.emails.join('; '), c.orders, c.refunds, c.tickets, c.total.toFixed(2), c.events.join('; '), dt(c.first), dt(c.last), c.flags.join('; ')]));
}

// ---------- QR scanner (door check-in) ----------
let scanStream = null;
async function startScanner(onCode) {
  const box = document.getElementById('scanner');
  const video = document.getElementById('scanVideo');
  const msg = document.getElementById('scanMsg');
  if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; box.classList.add('hidden'); return; }
  if (!('BarcodeDetector' in window)) { toast('QR scanning is not supported in this browser — use Chrome/Edge/Android, or type the code', true); return; }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch { toast('Camera permission was denied', true); return; }
  box.classList.remove('hidden');
  video.srcObject = scanStream; await video.play();
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  let last = '', lastAt = 0;
  const tick = async () => {
    if (!scanStream) return;
    try {
      const codes = await detector.detect(video);
      const raw = codes[0]?.rawValue?.trim().toUpperCase();
      const m = raw && raw.match(/TJ-[0-9A-F]{8}/);
      if (m && (m[0] !== last || Date.now() - lastAt > 4000)) { last = m[0]; lastAt = Date.now(); msg.textContent = 'Scanned ' + m[0]; onCode(m[0]); }
    } catch {}
    setTimeout(tick, 300);
  };
  tick();
}
window.addEventListener('hashchange', () => { if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; } });

// ---------- public ticket page (link from text/email) ----------
async function pagePublicTickets(id, key) {
  loading();
  const { order } = await api(`/api/tickets/${encodeURIComponent(id)}?k=${encodeURIComponent(key)}`);
  const ev = order.event || { title: 'Event' };
  $app.innerHTML = `
    <div class="confirm-hero">
      <div class="big">🎟️</div>
      <h1 class="display" style="font-size:2rem">${esc(ev.title)}</h1>
      <p class="muted">${ev.startsAt ? esc(fmtLong(ev.startsAt)) : ''}<br>${esc([ev.venue, ev.address, ev.city].filter(Boolean).join(', '))}</p>
      ${order.test ? '<div class="notice">🧪 <strong>Sandbox test ticket</strong> — created from the Admin Panel to test the ticket flow. Not a real purchase.</div>' : ''}
      ${order.status === 'refunded' ? '<div class="error">This order was refunded — these tickets are no longer valid.</div>' : ''}
      ${ev.status === 'cancelled' ? '<div class="error">This event has been cancelled.</div>' : ''}
      <p><strong>${esc(order.buyerName)}</strong> · ${order.tickets.length} ticket${order.tickets.length > 1 ? 's' : ''} · Order ${esc(order.id.slice(-8).toUpperCase())}</p>
      <p class="muted small">Show these QR codes at the door. Each code admits one person.</p>
      ${order.status !== 'refunded' ? `<a class="btn btn-primary" href="${TJ.rest}tickets/${esc(order.id)}/pdf?k=${esc(key)}" download>⬇ Download tickets (PDF)</a>` : ''}
    </div>
    <div class="big-tickets">${order.tickets.map((t) => `
      <div class="big-ticket">
        <div class="tier-name" style="color:var(--orange-d);text-transform:uppercase;font-size:.85rem">${esc(t.tierName)}</div>
        <img loading="lazy" decoding="async" src="${TJ.rest}qr/${esc(t.code)}.svg" alt="QR ${esc(t.code)}" />
        <div class="code">${esc(t.code)}</div>
        ${t.checkedIn ? '<div class="checked">✓ Already checked in</div>' : ''}
      </div>`).join('')}</div>`;
}

// ---------- boot ----------
(async function boot() {
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  try { META = await api('/api/meta'); } catch {}
  try { me = (await api('/api/auth/me')).user; } catch {}
  renderNav();
  tjMountAll(document);
  tjBooted = true;
})();

// ---------- mobile: label table cells so tables become cards on phones ----------
(function mobileTables() {
  const label = () => {
    document.querySelectorAll('.table-wrap table, .report-section table').forEach((tbl) => {
      const heads = [...tbl.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      if (!heads.length) return;
      tbl.classList.add('mtable');
      tbl.querySelectorAll('tbody tr').forEach((tr) => {
        [...tr.children].forEach((td, i) => { if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] || ''); });
      });
    });
  };
  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(label, 30); }).observe(document.body, { childList: true, subtree: true });
  label();
})();

// ---------- homepage clock (visitor's own browser time zone) ----------
let homeClockTimer = null;
function startHomeClock() {
  clearInterval(homeClockTimer);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const tick = () => {
    const el = document.getElementById('homeClock');
    if (!el) { clearInterval(homeClockTimer); homeClockTimer = null; return; }
    const now = new Date();
    const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).formatToParts(now);
    const get = (t) => parts.filter((p) => p.type === t).map((p) => p.value).join('');
    const ampm = get('dayPeriod');
    document.getElementById('hcTime').textContent = `${get('hour')}:${get('minute')}`;
    document.getElementById('hcSec').textContent = ':' + get('second');
    document.getElementById('hcAmpm').textContent = ampm ? ' ' + ampm : '';
    document.getElementById('hcDate').textContent = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const abbr = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value || '';
    const z = document.getElementById('hcZone');
    if (z) { z.textContent = abbr || tz.replace(/_/g, ' '); z.title = 'Your time · ' + tz.replace(/_/g, ' '); }
  };
  tick();
  homeClockTimer = setInterval(tick, 1000);
}


// ---------- Elementor / shortcode widgets ----------
// Each widget prints <div class="tj-root tj-widget" data-tj-widget="..." data-tj-opts='{...}'></div>; this mounts them.
const tjHomeQuery = () => searchValues(new URLSearchParams(location.search));
const tjEventsCache = {};
function tjEvents(params) {
  const p = searchParams(searchValues(params));
  const k = p.toString();
  return (tjEventsCache[k] ||= api('/api/events?' + p).then((r) => r.events));
}
const tjOpts = (el) => { try { return JSON.parse(el.getAttribute('data-tj-opts') || '{}'); } catch { return {}; } };
const tjHomeUrl = (params) => { const s = searchParams(searchValues(params)).toString(); return (TJ.pages.home || TJ.home) + (s ? '?' + s : ''); };
const tjGoSearch = (p) => { const s = p.toString(); location.href = (TJ.pages.home || TJ.home) + (s ? '?' + s : ''); };

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
    const v = tjHomeQuery();
    el.innerHTML = searchFormHtml(v, o);
    wireSearchForm(el.querySelector('form'), v, tjGoSearch);
  },
  chips(el, o) {
    const sv = tjHomeQuery(); const { category } = sv;
    el.innerHTML = `<div class="chips">${['', ...META.categories].map((c) => `<a class="chip ${c === category ? 'active' : ''}" href="${esc(tjHomeUrl({ ...sv, category: c }))}">${c ? esc(c) : esc(o.allLabel || 'All')}</a>`).join('')}</div>`;
  },
  async map(el, o) {
    const query = o.category ? { q: '', category: o.category } : tjHomeQuery();
    const filtered = searchActive(searchValues(query));
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
    const filtered = !o.category && searchActive(searchValues(query));
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
    el.innerHTML = infoBarHtml(o);
    const place = o.place && o.lat && o.lng ? { name: o.place, lat: Number(o.lat), lng: Number(o.lng) } : META.weatherPlace;
    if (o.showWeather !== false && place) TJGeo.homeWeather(el.querySelector('#homeWx'), place);
    if (o.showClock !== false) startHomeClock();
  },
  // Slim clock & weather bar above the orange & blue "Get your ticket fix." box (search inside)
  hero(el, o) {
    const sv = tjHomeQuery();
    const bar = infoBarHtml(o);
    const cta = o.showCta === false ? '' : (me?.role === 'organizer'
      ? '<a class="btn btn-green" href="#/create">+ Create an event</a>'
      : `<span>${esc(o.ctaText || 'Hosting an event?')}</span><a class="link" href="#/register?role=organizer">${esc(o.ctaLink || 'Become an organizer →')}</a>`);
    el.innerHTML = `${bar}<section class="hero tj-hero no-side">
      <h1 class="display">${esc(o.title || 'Get your ticket fix.')}</h1>
      ${o.subtitle === '' ? '' : `<p>${esc(o.subtitle || 'Discover the hottest parties, concerts, comedy shows and festivals — or launch your own event and start selling tickets in minutes.')}</p>`}
      ${searchFormHtml(sv, o)}
      ${cta ? `<div class="hero-cta">${cta}</div>` : ''}
    </section>`;
    wireSearchForm(el.querySelector('form.search-adv'), sv, tjGoSearch);
    const place = META.weatherPlace;
    if (o.showWeather !== false && place) TJGeo.homeWeather(el.querySelector('#homeWx'), place);
    if (o.showClock !== false) startHomeClock();
  },
  // Month calendar with event days highlighted
  calendar(el, o) {
    el.innerHTML = calendarHtml(o);
    mountCalendar(el.querySelector('.cal-section'));
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

// Pages that have the events map but no calendar get the "Calendar of events" right under the map.
// Turn off with: add_filter('tj_auto_calendar', '__return_false');
function tjAutoCalendar(root) {
  if (!window.TJ_CONFIG || TJ_CONFIG.autoCalendar === false || !root.querySelectorAll) return;
  if (document.querySelector('[data-tj-widget="calendar"], .cal-section')) return;
  const map = root.querySelector('[data-tj-widget="map"]:not([data-tj-mounted])');
  if (!map) return;
  const cal = document.createElement('div');
  cal.className = 'tj-root tj-widget';
  cal.setAttribute('data-tj-widget', 'calendar');
  cal.setAttribute('data-tj-opts', '{}');
  map.parentNode.insertBefore(cal, map.nextSibling);
}

function tjMountAll(root) {
  tjAutoHero(root);
  tjAutoCalendar(root);
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
    if (!f || f.dataset.tjLost || f.querySelector('.forgot-link') || !(window.TJ_CONFIG && TJ_CONFIG.lostPassword)) return;
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
