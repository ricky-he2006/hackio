import { qrSvg } from './qr.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slot = new URLSearchParams(location.search).get('slot') || 'single';
const tokenKey = `disco-session-${slot}`;
const MAIN_IDS = ['ricky', 'aditya', 'arnav', 'daniel'];
let token = sessionStorage.getItem(tokenKey), S = null, pending = false, streamController, refreshTimer, lastKey = '', lastChatLen = -1, searchTimer;
let stack = [{ name: 'chat' }];
const drafts = {}, scrolls = {};
const ui = { filter: 'All', ptab: 'been', pcat: 'Eat & Drink', catOpen: false, comments: new Set(), imports: {}, quick: null, nights: {}, logs: {}, newTag: false, qr: false, skipWelcome: false, open: new Set() };

/* ---------- Icons (drawn from the mockup boards) ---------- */
const svg = (w, h, inner, attrs = '') => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false" ${attrs}>${inner}</svg>`;
const line = (d, color = '#1D1A2F', width = 2.25) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const I = {
  back: svg(20, 20, line('M12.5 4L6.5 10l6 6')),
  close: svg(20, 20, line('M5 5l10 10M15 5L5 15')),
  send: svg(18, 18, line('M9 14V4M5 8l4-4 4 4')),
  check: svg(16, 16, line('M3 8.5l3 3 7-7', '#1F7A50')),
  arrow: svg(16, 16, line('M2.5 8h9M8.5 4.5L12 8l-3.5 3.5', '#9A4A12')),
  spin: svg(16, 16, '<circle class="spin-dash" cx="8" cy="8" r="5" fill="none" stroke="#5E5873" stroke-width="1.75" stroke-dasharray="3 2"/>'),
  lock: svg(14, 14, '<rect x="2.5" y="6" width="9" height="6.5" rx="1.5" fill="none" stroke="#5E5873" stroke-width="1.5"/><path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" fill="none" stroke="#5E5873" stroke-width="1.5"/>'),
  heart: on => svg(18, 18, `<path d="M9 15.5S2.5 11.6 2.5 6.9A3.4 3.4 0 019 5a3.4 3.4 0 016.5 1.9C15.5 11.6 9 15.5 9 15.5z" fill="${on ? '#FF6F59' : 'none'}" stroke="#1D1A2F" stroke-width="1.75" stroke-linejoin="round"/>`),
  comment: svg(18, 18, '<path d="M3 4.5h12v8H8l-3.5 2.5v-2.5H3z" fill="none" stroke="#1D1A2F" stroke-width="1.75" stroke-linejoin="round"/>'),
  bookmark: on => svg(14, 16, `<path d="M2.5 2h9v12L7 11l-4.5 3z" fill="${on ? '#1D1A2F' : 'none'}" stroke="#1D1A2F" stroke-width="1.75" stroke-linejoin="round"/>`),
  addFriend: svg(20, 20, '<circle cx="8" cy="7" r="3.25" fill="none" stroke="#1D1A2F" stroke-width="2"/>' + line('M2.5 17c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15.5 6v5M13 8.5h5', '#1D1A2F', 2)),
  search: (color = '#1D1A2F') => svg(18, 18, `<circle cx="8" cy="8" r="5.5" fill="none" stroke="${color}" stroke-width="2"/>` + line('M12 12l4 4', color, 2)),
  plus: svg(14, 14, line('M7 2v10M2 7h10', '#1D1A2F', 2.5)),
  plusBig: svg(24, 24, line('M12 5v14M5 12h14', '#1D1A2F', 2.75)),
  x: svg(12, 12, line('M3 3l6 6M9 3L3 9', '#1D1A2F', 2)),
  share: svg(16, 16, line('M8 10V2.5M5 5.5l3-3 3 3M3 9v4h10V9', '#1D1A2F', 1.75)),
  qr: svg(16, 16, '<rect x="2" y="2" width="5" height="5" fill="none" stroke="#1D1A2F" stroke-width="1.5"/><rect x="9" y="2" width="5" height="5" fill="none" stroke="#1D1A2F" stroke-width="1.5"/><rect x="2" y="9" width="5" height="5" fill="none" stroke="#1D1A2F" stroke-width="1.5"/><path d="M9.5 9.5h2v2h-2zM12 12h2v2h-2z" fill="#1D1A2F"/>'),
  music: svg(18, 18, '<path d="M6.5 13V4l7-1.5V11.5" fill="none" stroke="#1D1A2F" stroke-width="1.75" stroke-linejoin="round"/><circle cx="5" cy="13" r="2" fill="none" stroke="#1D1A2F" stroke-width="1.75"/><circle cx="12" cy="11.5" r="2" fill="none" stroke="#1D1A2F" stroke-width="1.75"/>'),
  pin: svg(18, 18, '<path d="M9 16s5-4.6 5-8.5A5 5 0 004 7.5C4 11.4 9 16 9 16z" fill="none" stroke="#1D1A2F" stroke-width="1.75"/><circle cx="9" cy="7.5" r="1.75" fill="#1D1A2F"/>'),
  play: svg(18, 18, '<rect x="2.5" y="4" width="13" height="10" rx="1.5" fill="none" stroke="#1D1A2F" stroke-width="1.75"/><path d="M7.5 7v4l3.5-2z" fill="#1D1A2F"/>'),
  caret: svg(14, 14, line('M3 5l4 4 4-4')),
  chevron: svg(16, 16, line('M6 3.5L10.5 8 6 12.5', '#1D1A2F', 2)),
  loop: svg(28, 28, line('M14 4a10 10 0 019.5 7M24 7.5l-.5 3.5-3.5-.5M14 24a10 10 0 01-9.5-7M4 20.5l.5-3.5 3.5.5'), 'style="flex-shrink:0"'),
  gear: svg(20, 20, '<circle cx="10" cy="10" r="2.75" fill="none" stroke="#1D1A2F" stroke-width="2"/>' + line('M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6', '#1D1A2F', 2))
};
const ball = (size = 26) => `<img src="/disco-ball.png" width="${size}" height="${size}" alt="" aria-hidden="true">`;

/* ---------- Formatting helpers ---------- */
const PALETTE = { purple: '#D9C8FF', orange: '#FFB86B', green: '#F6A8CC', blue: '#9CC8FF' };
const EXTRA = ['#FFD666', '#C9B6FF', '#F6A8CC', '#9CC8FF', '#FFB86B', '#D9C8FF'];
function colorOf(u) {
  if (!u) return '#D9C8FF'; if (S && u.id === S.me.id) return '#B79CFF'; if (PALETTE[u.color]) return PALETTE[u.color];
  let h = 0; for (const c of String(u.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return EXTRA[h % EXTRA.length];
}
const firstRaw = u => (u?.name || '').split(' ')[0];
const first = u => esc(firstRaw(u));
const nameOf = u => S && u?.id === S.me.id ? 'You' : first(u);
const isMe = u => S && u?.id === S.me.id;
const av = (u, size = 34, cls = '') => `<span class="av ${cls}" aria-hidden="true" style="--s:${size}px;--f:${size <= 24 ? 10.5 : size <= 30 ? 12 : size <= 34 ? 13 : size <= 38 ? 14 : 15}px;--bg:${colorOf(u)}">${esc((u?.name || '?').trim().charAt(0).toUpperCase())}</span>`;
const avStack = (users, size = 30, overlap = -8) => `<span class="av-stack" style="--o:${overlap}px">${users.map(u => av(u, size)).join('')}</span>`;
const names = list => list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
const initials = name => esc(String(name || '').split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join(''));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const scoreCls = n => n >= 8 ? 'hi' : n >= 6 ? 'mid' : 'lo';
const scoreColor = n => n >= 8 ? '#79D18A' : n >= 6 ? '#FFD666' : '#FF8A7A';
const score = (n, cls = '', label = 'Score') => n == null ? `<span class="score empty ${cls}" aria-label="Not rated yet">–</span>` : `<span class="score ${scoreCls(n)} ${cls}" aria-label="${label} ${Number(n).toFixed(1)}">${Number(n).toFixed(1)}</span>`;
const EAT = /restaurant|fast_food|food|cafe|coffee|tea|bar|pub|brew|pizza|bakery|brunch|ice_cream|confectionery|dining|american|italian|german|mediterranean|steak|sushi|indian|french|spanish|seafood|latin|mexican|ramen|burger/;
function group(p) {
  const c = String(p?.category || '').toLowerCase();
  if (['Music', 'Movies & TV', 'Products', 'Books'].includes(p?.category)) return p.category;
  if (/theat|cinema|nightclub|arts_centre|entertainment|immersive|concert|comedy|festival/.test(c)) return 'Live Events';
  return EAT.test(c) ? 'Eat & Drink' : 'Places';
}
function typeTag(p) {
  const c = String(p?.category || '').toLowerCase();
  const media = { Music: ['Album', '#E6DEFF'], 'Movies & TV': ['Movie', '#DDEFFC'], Books: ['Book', '#FFF0C2'], Products: ['Product', '#F1EBFF'] }[p?.category];
  if (media) return media;
  if (/cafe|coffee|tea|bakery|ice_cream|confectionery/.test(c)) return ['Café', '#F1EBFF'];
  if (/bar|pub|brew|nightclub/.test(c)) return ['Bar', '#E6DEFF'];
  if (EAT.test(c)) return ['Restaurant', '#FFE0D6'];
  if (group(p) === 'Live Events') return [/cinema/.test(c) ? 'Cinema' : 'Live', '#FFF0C2'];
  return [cap(c.replace(/_/g, ' ')) || 'Place', '#FFFDF7'];
}
const tagPill = p => { const [label, bg] = typeTag(p); return `<span class="typetag" style="background:${bg}">${esc(label)}</span>`; };
const price = p => p?.price == null ? '' : p.price < 15 ? '$' : p.price < 30 ? '$$' : '$$$';
const distance = p => Number.isFinite(p?.distance) ? `${(p.distance * 0.621371).toFixed(1)} mi from OSU` : '';
const GAPS = [[/^Date/, 'good for a date'], [/^Quiet/, 'quiet'], [/^Opening hours/, 'hours'], [/^Closed/, 'open then'], [/^Current menu prices/, 'prices'], [/^Above your/, 'under your price'], [/^Distance uses/, ''], [/^(\w+) not confirmed/, m => m[1].toLowerCase()]];
const shortGap = text => { for (const [re, out] of GAPS) { const m = text.match(re); if (m) return typeof out === 'function' ? out(m) : out; } return text; };
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const ampm = t => { let [h, m] = t.split(':').map(Number); const pm = h >= 12 && h < 24; h = h % 12 || 12; return `${h}${m ? ':' + String(m).padStart(2, '0') : ''}${pm ? 'pm' : 'am'}`; };
function hoursOn(raw, day) {
  for (const rule of String(raw || '').split(';')) {
    const m = rule.trim().match(/^([A-Za-z,\- ]+?)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/); if (!m) continue;
    const covers = m[1].split(',').some(part => { const [a, b] = part.trim().split('-'); const ia = DAYS.indexOf(a), ib = b ? DAYS.indexOf(b) : ia; return ia >= 0 && ib >= 0 && (ia <= ib ? day >= ia && day <= ib : day >= ia || day <= ib); });
    if (covers) return [m[2], m[3]];
  }
  return null;
}
const hoursLabel = (p, day = 6) => { const h = hoursOn(p?.hours, day); return h ? `Open ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${ampm(h[0])}–${ampm(h[1])}` : ''; };
const meta = parts => esc(parts.filter(Boolean).join(' · '));
function ago(value) {
  const t = Date.parse(String(value).length === 10 ? `${value}T12:00:00` : value), s = (Date.now() - t) / 1000;
  if (!Number.isFinite(s)) return ''; if (s < 0) return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`; if (s < 86400) return `${Math.round(s / 3600)}h`; if (s < 172800) return 'Yesterday'; if (s < 604800) return `${Math.round(s / 86400)}d`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dparts(date) {
  const d = new Date(`${date}T12:00:00`), f = o => d.toLocaleDateString('en-US', o);
  return { w: f({ weekday: 'short' }).toUpperCase(), d: d.getDate(), m: f({ month: 'short' }).toUpperCase(), long: f({ weekday: 'long' }), short: f({ weekday: 'short', month: 'short', day: 'numeric' }), md: f({ month: 'short', day: 'numeric' }) };
}
const t12 = (time, suffix = true) => { const [h, m] = String(time).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${suffix ? (h >= 12 ? ' pm' : ' am') : ''}`; };
const plus = (time, mins) => { const [h, m] = time.split(':').map(Number), t = h * 60 + m + mins; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const partOfDay = time => { const h = Number(String(time).split(':')[0]); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };
const todayISO = () => new Date().toLocaleDateString('en-CA');
function stops(o) {
  const h = Number(o.time.split(':')[0]), cafe = typeTag(o.place)[0] === 'Café';
  const list = [{ label: `${h < 11 ? 'Brunch' : cafe ? 'Coffee' : h < 16 ? 'Lunch' : 'Dinner'} at ${o.place.name}`, place: o.place, time: o.time }];
  if (o.activity) list.push({ label: `${group(o.activity) === 'Live Events' ? 'Show at' : 'Then'} ${o.activity.name}`, place: o.activity, time: plus(o.time, 60) });
  return list;
}
const WORDS = ['', 'one', 'both', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/* ---------- Plan status ---------- */
function status(p) {
  if (p.state === 'cancelled') return { key: 'cancelled', label: 'Cancelled', cls: 'gray', bg: '#E4E1DA' };
  if (['confirmed', 'booked'].includes(p.state)) return { key: 'confirmed', label: 'Confirmed', cls: 'green', bg: '#79D18A' };
  if (p.isHost && ['awaiting_approval', 'needs_decision'].includes(p.state)) return { key: 'ok', label: 'Needs your OK', cls: 'coral', bg: '#FF6F59' };
  if (!p.isHost && p.state === 'invited' && ['pending', 'reconfirm'].includes(p.myRsvp)) return { key: 'ok', label: 'Needs your OK', cls: 'coral', bg: '#FF6F59' };
  return { key: 'working', label: 'Working it out', cls: 'yellow', bg: '#FFD666' };
}
function statusLine(p) {
  const others = p.participants.filter(u => u.id !== p.hostId), replied = others.filter(u => ['in', 'out'].includes(p.rsvps[u.id])).length;
  if (p.state === 'cancelled') return 'Cancelled by the host';
  if (p.state === 'booked') return 'Demo booking made';
  if (p.state === 'confirmed') return 'Everyone’s in';
  if (p.isHost && p.state === 'awaiting_approval') return p.hasPendingChange && p.changeBy && p.changeBy.id !== S.me.id ? `${firstRaw(p.changeBy)} asked for ${t12(p.option.time, false)}` : 'Ready for your OK';
  if (p.isHost && p.state === 'needs_decision') return 'Needs a new plan';
  if (!p.isHost && p.state === 'invited' && p.myRsvp === 'reconfirm') return 'Reconfirm the new time';
  if (!p.isHost && p.state === 'invited' && p.myRsvp === 'pending') return 'Your reply needed';
  if (p.state === 'invited') return `${replied} of ${others.length} replied`;
  return 'Agents are working it out';
}
function planRoute(p) {
  if (p.isHost) {
    if (['negotiating', 'drafting', 'needs_decision'].includes(p.state)) return 'working';
    if (p.state === 'awaiting_approval') return p.hasPendingChange ? 'changed' : 'approve';
    return 'details';
  }
  return p.state === 'invited' && ['pending', 'reconfirm'].includes(p.myRsvp) ? 'invite' : 'details';
}
const findPlan = id => S.plans.find(p => p.id === id);
const needsMe = () => S.plans.some(p => status(p).key === 'ok');

/* ---------- Networking ---------- */
async function api(path, data) {
  const response = await fetch('/api' + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401 && path !== '/login') logoutLocal(); throw new Error(result.error || 'Please try again.'); }
  return result;
}
function toast(message) { const t = $('#toast'); t.textContent = message; t.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 4200); }
async function refresh() {
  if (!token) return;
  try { S = await api('/state'); const r = cur(); if (r.name === 'place' && r.data) r.data = await api('/place?id=' + encodeURIComponent(r.id)); render(); } catch (error) { toast(error.message); }
}
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 100); }
async function live() {
  streamController?.abort(); streamController = new AbortController(); const controller = streamController;
  while (token && !controller.signal.aborted) {
    try {
      const response = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (response.status === 401) { logoutLocal(); return; }
      if (!response.ok) throw new Error('Disconnected');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); let index; while ((index = buffer.indexOf('\n\n')) >= 0) { const chunk = buffer.slice(0, index); buffer = buffer.slice(index + 2); if (chunk.startsWith('data: ')) scheduleRefresh(); } }
    } catch { /* Reconnect quietly; drafts stay in memory. */ }
    if (!controller.signal.aborted) await new Promise(r => setTimeout(r, 2000));
  }
}
function logoutLocal() { token = null; S = null; sessionStorage.removeItem(tokenKey); streamController?.abort(); stack = [{ name: 'chat' }]; loginScreen(); }
async function login(username, password) {
  const result = await api('/login', { username, password }); token = result.token; sessionStorage.setItem(tokenKey, token); stack = [{ name: 'chat' }]; await refresh(); live();
  if (parent !== window) parent.postMessage({ kind: 'disco-ready', user: result.user.id }, location.origin);
}

/* ---------- Navigation ---------- */
const cur = () => stack.at(-1);
const routeKey = r => `${stack.length}:${r.name}:${r.id || ''}`;
function go(name, params = {}) { stack.push({ name, ...params }); load(); render(); }
function replace(name, params = {}) { stack[stack.length - 1] = { name, ...params }; load(); render(); }
function back() { if (stack.length > 1) stack.pop(); else stack = [{ name: 'chat' }]; render(); }
function tab(name) { stack = [{ name }]; ui.catOpen = false; render(); }
function openPlan(id) { const p = findPlan(id); if (p) go(planRoute(p), { id }); }
async function load() {
  const r = cur();
  try {
    if ((r.name === 'place' || r.name === 'log') && !r.data) { r.data = await api('/place?id=' + encodeURIComponent(r.id)); if (r.name === 'log') initLog(r.data, r.rating); }
    else if (r.name === 'catalog' && !r.data) r.data = await api('/catalog?q=' + encodeURIComponent(drafts['catalog-q'] || ''));
    else if (r.name === 'quickrate' && !ui.quick) ui.quick = { i: 0, answers: [], picks: await api('/quickrate') };
    else if (r.name === 'facts' && r.placeId && !r.data) r.data = await api('/facts', { placeId: r.placeId, date: S.defaultDate, time: '19:00' });
    else return;
    if (cur() === r) render();
  } catch (error) { toast(error.message); }
}

/* ---------- Shared pieces ---------- */
function tabbar(active) {
  return `<nav class="tabbar" aria-label="Main">${[['chat', 'Chat'], ['feed', 'Feed'], ['adventures', 'Adventures'], ['you', 'You']].map(([v, l]) => `<button class="tab ${active === v ? 'active' : ''}" data-action="tab" data-view="${v}" ${active === v ? 'aria-current="page"' : ''}>${l}${v === 'adventures' && needsMe() ? '<i class="dot" aria-hidden="true"></i><span class="sr-only"> (needs you)</span>' : ''}</button>`).join('')}</nav>`;
}
const rootTab = () => stack[0].name;
function brandbar(right) {
  return `<header class="brandbar"><button class="brand" data-action="tab" data-view="chat" aria-label="Disco, go to chat">${ball(44)}<span class="stack"><span class="wordmark">Disco</span><span class="tagline">Stress less, party more</span></span></button>${right}</header>`;
}
function titlebar(title, { back: showBack = stack.length > 1, close = false, sub = '', subMuted = false, right = '', cls = '', size = '' } = {}) {
  const nav = close ? `<button class="back" data-action="back" aria-label="Close">${I.close}</button>` : showBack ? `<button class="back" data-action="back" aria-label="Back">${I.back}</button>` : '';
  if (cls.includes('inline')) return `<header class="titlebar ${cls}">${nav}<h1 class="title ${size}">${title}</h1>${right}</header>`;
  return `<header class="titlebar ${cls}">${nav}${right ? `<div class="row-between"><h1 class="title ${size}">${title}</h1>${right}</div>` : `<h1 class="title ${size}">${title}</h1>`}${sub ? `<p class="subtitle ${subMuted ? 'muted' : ''}">${sub}</p>` : ''}</header>`;
}
const checkRow = text => `<p class="check">${I.check}${text}</p>`;
const counterRow = text => `<p class="check counter">${I.arrow}${text}</p>`;
const spinRow = text => `<p class="check muted">${I.spin}${text}</p>`;
const lockNote = text => `<p class="lock-note">${I.lock}${text}</p>`;
const sticker = (text, cls, tilt = 4, extra = '') => `<span class="sticker ${cls}" style="--tilt:${tilt}deg;${extra}">${esc(text)}</span>`;
const photo = (p, style = '', cls = '', action = true) => action ? `<button class="photo ${cls}" style="${style}" data-action="place" data-id="${esc(p.id)}" aria-label="Open ${esc(p.name)}"><span>${initials(p.name)}</span></button>` : `<div class="photo ${cls}" style="${style}" aria-hidden="true"><span>${initials(p.name)}</span></div>`;
function slider(id, value, label, bubble) {
  return `<div class="slider" style="--c:${scoreColor(value)}"><div class="track" aria-hidden="true"></div><div class="fill" aria-hidden="true" style="width:calc(${value * 10}% + 12px)"></div><div class="thumb" aria-hidden="true" style="left:${value * 10}%"></div><input id="${id}" type="range" min="0" max="10" step="0.5" value="${value}" aria-label="${esc(label)}" data-slider data-bubble="${bubble}"></div>`;
}
function routeList(o, { rail = true, actions = false, party = 1 } = {}) {
  const list = stops(o);
  if (!rail) return `<ol class="times stack gap-8" aria-label="Route">${list.map(s => `<li><span class="t">${t12(s.time, false)}</span><span class="stop-name">${esc(s.label)}</span></li>`).join('')}</ol>`;
  return `<ol class="route" aria-label="Route">${list.map((s, i) => {
    const last = i === list.length - 1;
    const railHtml = last && list.length > 1 ? `<div class="rail end" aria-hidden="true">${ball(26)}</div>` : `<div class="rail" aria-hidden="true"><span class="dot"></span>${last ? '' : '<span class="line"></span>'}</div>`;
    const detail = actions ? ` · ${i === 0 ? `Table for ${party}` : `${party} going`}` : '';
    const act = actions ? (i === 0 ? `<a class="pill" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.place.name} ${s.place.address || 'Columbus, OH'}`)}" target="_blank" rel="noopener noreferrer">Directions</a>` : `<button class="pill" data-action="place" data-id="${esc(s.place.id)}">Tickets</button>`) : '';
    return `<li>${railHtml}<div class="stop-body ${actions ? 'row top gap-8' : ''}"><div class="grow"><p class="meta">${t12(s.time, false)}${detail}</p>${actions ? `<button class="stop-name s16" data-action="place" data-id="${esc(s.place.id)}">${esc(s.label)}</button>` : `<p class="stop-name">${esc(s.label)}</p>`}</div>${act}</div></li>`;
  }).join('')}</ol>`;
}

/* ---------- Screens ---------- */
function screen(r) {
  if (r.name === 'chat' && !S.me.onboarded && !ui.skipWelcome) return welcomeScreen();
  const p = r.id ? findPlan(r.id) : null;
  switch (r.name) {
    case 'chat': return chatScreen();
    case 'feed': return feedScreen();
    case 'adventures': return adventuresScreen();
    case 'you': return profileScreen();
    case 'place': return placeScreen(r);
    case 'log': return logScreen(r);
    case 'catalog': return catalogScreen(r);
    case 'additem': return addItemScreen();
    case 'friends': return friendsScreen();
    case 'addfriends': return addFriendsScreen(r);
    case 'settings': return settingsScreen();
    case 'facts': return factsScreen(r);
    case 'newplan': return newPlanScreen(r);
    case 'quickrate': return quickRateScreen();
    case 'welcome': return welcomeScreen();
  }
  if (!p) return `${titlebar('Adventure')}<main class="content" data-scroll><p class="body-15">This adventure isn’t available. It may have been cancelled or you’re no longer on it.</p></main>`;
  switch (r.name) {
    case 'working': return workingScreen(p);
    case 'approve': return p.isHost && p.state === 'awaiting_approval' ? approveScreen(p) : detailsScreen(p);
    case 'changed': return p.isHost && p.state === 'awaiting_approval' && p.hasPendingChange ? changedScreen(p) : detailsScreen(p);
    case 'invite': return !p.isHost && p.state === 'invited' ? inviteScreen(p) : detailsScreen(p);
    case 'change': return changeScreen(p);
    case 'rate': return rateScreen(p);
    default: return detailsScreen(p);
  }
}

/* 1, 2, 17 · Chat */
function chatScreen() {
  const latest = {}; S.chat.forEach((m, i) => { if (m.planId) latest[m.planId] = i; });
  const friends = S.friends.filter(f => MAIN_IDS.includes(f.id)).slice(0, 2);
  const ideas = [`matcha near me, open saturdays, good for a first date`, friends.length ? `plan something saturday night with ${friends.map(f => f.name.split(' ')[0].toLowerCase()).join(' and ')}. something fun, not too pricey` : '', 'what do you remember about me?'].filter(Boolean);
  let body = '<div style="margin-top:auto"></div>';
  if (!S.chat.length) body += `<p class="agent-text">Hey ${first(S.me)}. Ask for a spot your friends vouch for, or tell me who you want to plan with. Nothing goes out until you say go.</p><div class="suggestions">${ideas.map(t => `<button class="label-pill" data-action="prompt" data-text="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  body += S.chat.map((m, i) => message(m, latest[m.planId] === i)).join('');
  if (pending) body += `<div class="thinking" role="status"><i></i><i></i><i></i><span>Your agent is on it…</span></div>`;
  body += S.matches.map(matchCard).join('');
  const working = S.plans.some(p => p.isHost && p.state === 'negotiating');
  return `${brandbar(`<button class="icon-circle me" data-action="tab" data-view="you" aria-label="Your profile">${esc(S.me.name.charAt(0))}</button>`)}
  <main class="content" id="chat-log" data-scroll aria-label="Conversation">${body}</main>
  <form class="composer" id="chat-form"><label class="sr-only" for="message">Message your agent</label><input id="message" class="field" autocomplete="off" maxlength="2000" placeholder="${working ? 'Add someone, change the time, anything' : 'Where to? Ask or plan anything'}" value="${esc(drafts.message || '')}"><button class="send" type="submit" aria-label="Send" ${pending ? 'disabled' : ''}>${I.send}</button></form>${tabbar('chat')}`;
}
function message(m, isLatestForPlan) {
  if (m.role === 'user') return `<p class="bubble">${esc(m.text)}</p>`;
  let extra = '';
  if (m.kind === 'recommendations') { const picks = (m.picks || []).slice(0, 3); extra = picks.map((r, i) => recCard(r, i === 0)).join(''); }
  if (m.kind === 'planStart') { const p = findPlan(m.planId); extra = `<div class="row wrap gap-8">${(m.friends || []).map(u => `<span class="party-chip">${av(u, 28)}${first(u)}</span>`).join('')}</div><p class="agent-text">Rounding them up now. Nothing goes out until you say go.</p>${p && isLatestForPlan ? planAttachment(p) : ''}`; }
  if (m.kind === 'plan') { const p = findPlan(m.planId); if (p && isLatestForPlan) extra = planAttachment(p); }
  if (m.kind === 'planDraft') extra = `<button class="btn primary h48" data-action="newplan" data-draft="${esc(m.id)}">Pick your crew</button>`;
  if (m.kind === 'memoryPrompt' && S.me.pendingMemory?.id === m.pendingId) extra = `<div class="card pad col gap-8"><p class="eyebrow">Your call, always</p><div class="row gap-8"><button class="pill primary" data-action="memory-save">Save to memory</button><button class="pill" data-action="memory-skip">Just this time</button></div></div>`;
  if (m.kind === 'memories') extra = S.me.private.memories.map(mem => `<div class="card row-pad row gap-10"><p class="grow body-14">${esc(mem.text)}</p><button class="pill" data-action="forget" data-id="${esc(mem.id)}">Forget</button></div>`).join('');
  if (m.kind === 'reviewDraft' && m.placeId) extra = `<button class="btn primary h48" data-action="log" data-id="${esc(m.placeId)}" data-rating="${esc(m.rating)}">Log it</button>`;
  if (m.kind === 'review' && m.placeId) extra = `<button class="label-pill" style="align-self:flex-start" data-action="place" data-id="${esc(m.placeId)}">See what friends say</button>`;
  return `<div class="agent-block"><p class="agent-text">${esc(m.text)}</p>${extra}</div>`;
}
function recCard(rec, big) {
  const p = rec.place, q = rec.reviews[0], who = names(rec.reviews.map(r => nameOf(r.author)));
  const metaLine = meta([distance(p), hoursLabel(p), price(p)]) || meta([typeTag(p)[0], p.area]);
  const gaps = (rec.unmatched || []).map(shortGap).filter(Boolean);
  const unmatched = gaps.length ? `<p class="meta-12">Not confirmed yet: ${esc(gaps.join(', '))}</p>` : '';
  if (big) return `<article class="card pad sh-4 col gap-8">${photo(p, 'height:104px')}${sticker(`Vouched ×${rec.votes}`, 'coral lg', 4, 'top:20px;right:20px;padding:4px 10px')}
    <div><h2 class="h-21"><button data-action="place" data-id="${esc(p.id)}">${esc(p.name)}</button></h2><p class="meta" style="margin-top:2px">${metaLine}</p></div>
    ${q ? `<blockquote class="quote q-26">“${esc(q.quote)}”</blockquote>` : ''}
    <div class="row gap-8">${avStack(rec.reviews.map(r => r.author), 30)}<span class="body-14 semi">${who}</span></div>${unmatched}</article>`;
  return `<article class="card pad sh-4 col gap-4"><div class="row between base wrap gap-8"><h2 class="h-19"><button data-action="place" data-id="${esc(p.id)}">${esc(p.name)}</button></h2><p class="meta">${metaLine}</p></div>
    ${q ? `<blockquote class="quote">“${esc(q.quote)}” <span class="by">${nameOf(q.author)}</span></blockquote>` : ''}${unmatched}</article>`;
}
function planAttachment(p) {
  if (p.isHost && ['negotiating', 'awaiting_approval', 'needs_decision'].includes(p.state) && !p.hasPendingChange) return roundingCard(p);
  return advCard(p);
}
function lastEntry(p, userId) { return p.log.filter(l => l.userId === userId && l.round === p.round).at(-1); }
function roundingCard(p) {
  const invitees = p.participants.filter(u => !isMe(u)), d = dparts(p.option.date);
  const rows = invitees.map(u => { const last = lastEntry(p, u.id); return last?.type === 'accept' ? checkRow(`${first(u)} is free ${d.long} ${partOfDay(p.option.time)}`) : last?.type === 'counter' ? counterRow(`${first(u)} asked for another option`) : spinRow(`Asking ${first(u)}…`); });
  const done = invitees.filter(u => lastEntry(p, u.id)?.type === 'accept').length;
  const ready = p.state === 'awaiting_approval', stuck = p.state === 'needs_decision';
  return `<div class="card pad-14 sh-4 col gap-8"><div class="row between"><span class="eyebrow">${ready ? 'Your party is ready' : stuck ? 'Your call' : 'Rounding up your party'}</span><span class="meta">${done} of ${invitees.length}</span></div>${rows.join('')}
    ${stuck ? `<p class="body-14">${esc(p.issue || '')}</p>` : ''}<button class="link" style="align-self:flex-start;margin-top:2px" data-action="${ready ? 'approve-open' : 'working'}" data-id="${esc(p.id)}">${ready ? 'See the route' : 'See details'}</button></div>`;
}
function matchCard(m) {
  const members = [S.me, ...m.friends], p = m.place, count = members.length, plannable = m.friends.some(f => MAIN_IDS.includes(f.id) && !f.fictional);
  const when = m.window ? `, and ${count > 2 ? 'everyone’s' : 'you’re both'} free ${dparts(m.window.date).long} ${partOfDay(m.window.time)}` : '';
  return `<div class="agent-block"><p class="agent-text">Good timing: ${count > 2 ? `${WORDS[count] || count} of you want` : `you and ${first(m.friends[0])} both want`} to try the same spot${when}.</p>
  <article class="card r16 pad-14 sh-5 col gap-12" style="padding:14px">${sticker('It’s a match', 'yellow', 4, 'top:-12px;right:14px;padding:3px 10px')}
    <div class="row gap-12">${photo(p, '', 't72')}<div class="grow"><h2 class="h-21"><button data-action="place" data-id="${esc(p.id)}">${esc(p.name)}</button></h2><p class="meta row gap-6" style="margin-top:2px">${tagPill(p)}${meta([p.area, price(p)])}</p></div></div>
    <div class="dashed-top stack gap-8"><p class="eyebrow">On everyone’s want to try</p><div class="row gap-10">${avStack(members, 34)}<p class="body-14 semi">${names(members.map(nameOf))}</p></div>
      ${m.window ? checkRow(esc(m.window.text)) : spinRow('No shared free time this weekend yet')}
      ${m.rating ? `<p class="check">${I.check}<span>${first(m.rating.author)} rated it ${m.rating.rating.toFixed(1)}: <span class="quote q-20">“${esc(m.rating.quote.length > 48 ? m.rating.quote.slice(0, 46) + '…' : m.rating.quote)}”</span></span></p>` : ''}</div>
    <div class="row gap-8"><button class="btn primary h50" data-action="match-plan" data-id="${esc(p.id)}" ${plannable ? '' : 'disabled title="Planning works with your prepared friends"'}>Plan it</button><button class="btn h50 fit" data-action="match-dismiss" data-id="${esc(p.id)}">Not now</button></div></article>
  <p class="meta">Only shared because ${count > 2 ? `all ${WORDS[count] || count}` : 'both'} of you saved it. Free times come from each person’s agent, not their calendars.</p></div>`;
}

/* 7 · Friends feed */
const FILTERS = ['All', 'Eat & Drink', 'Places', 'Live Events', 'Music', 'Movies & TV', 'Products'];
function feedScreen() {
  const show = p => ui.filter === 'All' || group(p) === ui.filter || (ui.filter === 'Places' && ['Places', 'Eat & Drink', 'Live Events'].includes(group(p)));
  const items = [...S.feed.filter(r => r.place && r.userId !== S.me.id && show(r.place)).map(r => ({ at: r.date, html: feedCard(r) })), ...(['All', 'Places', 'Eat & Drink'].includes(ui.filter) ? S.saves.map(s => ({ at: s.at, html: savesCard(s) })) : [])]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return `${brandbar(`<div class="header-actions"><button class="icon-circle" data-action="friends" aria-label="Friends">${I.addFriend}</button><button class="icon-circle" data-action="catalog" data-purpose="browse" aria-label="Search">${I.search()}</button></div>`)}
  <div class="chip-row filters" role="group" aria-label="Filter">${FILTERS.map(f => `<button class="chip" aria-pressed="${ui.filter === f}" data-action="filter" data-value="${esc(f)}">${esc(f)}</button>`).join('')}</div>
  <main class="content gap-16" data-scroll aria-label="Friends activity" style="padding-top:12px;padding-bottom:90px">${items.map(i => i.html).join('') || `<div class="card empty-card"><p class="h-19">Nothing here yet</p><p class="meta">When friends rate something in this category, it shows up here.</p></div>`}</main>
  <button class="fab" data-action="catalog" data-purpose="review" aria-label="Log a review">${I.plusBig}</button>${tabbar('feed')}`;
}
function feedCard(r) {
  const p = r.place, media = ['Music', 'Movies & TV', 'Books', 'Products'].includes(p.category), saved = S.me.saved.includes(p.id), liked = r.likes.includes(S.me.id), open = ui.comments.has(r.id);
  const body = media ? `<div class="row gap-12">${photo(p, '', 'cover')}<blockquote class="quote q-25">“${esc(r.quote)}”</blockquote></div>` : `${photo(p, 'height:120px')}<blockquote class="quote q-25">“${esc(r.quote)}”</blockquote>`;
  return `<article class="card pad sh-4 col gap-10"><div class="row gap-10">${av(r.author, 36)}<div class="grow"><p class="body-14"><span class="strong">${nameOf(r.author)}</span> rated <button class="strong" data-action="place" data-id="${esc(p.id)}">${esc(p.name)}</button></p><p class="meta-12">${meta([typeTag(p)[0], p.area, ago(r.date), r.synthetic ? 'demo' : ''])}</p></div>${score(r.rating)}</div>
    ${body}
    <div class="row gap-4"><button class="pill ghost h36" data-action="like" data-id="${esc(r.id)}" aria-pressed="${liked}" aria-label="Like, ${r.likes.length} likes">${I.heart(liked)}${r.likes.length}</button><button class="pill ghost h36" data-action="comments" data-id="${esc(r.id)}" aria-expanded="${open}" aria-label="Comments, ${r.comments.length}">${I.comment}${r.comments.length}</button>
    <button class="pill h36" style="margin-left:auto" data-action="save" data-id="${esc(p.id)}" aria-pressed="${saved}">${I.bookmark(saved)}${saved ? 'Saved' : media ? 'Save' : 'Want to try'}</button></div>
    ${open ? `<div class="comments">${r.comments.map(c => `<p class="comment"><span class="strong">${nameOf(c.author)}</span> ${esc(c.text)}</p>`).join('') || '<p class="meta">No comments yet.</p>'}<form class="composer bare" data-form="comment" data-id="${esc(r.id)}"><label class="sr-only" for="c-${esc(r.id)}">Add a comment</label><input id="c-${esc(r.id)}" class="field paper" style="height:40px" maxlength="300" placeholder="Add a comment" value="${esc(drafts['c-' + r.id] || '')}"><button class="send" style="width:40px;height:40px" aria-label="Post comment">${I.send}</button></form></div>` : ''}</article>`;
}
function savesCard(s) {
  return `<article class="card pad col gap-10"><div class="row gap-10">${av(s.author, 36)}<div><p class="body-14"><span class="strong">${first(s.author)}</span> added ${s.places.length === 1 ? 'a spot' : `${s.places.length} spots`} to <span class="strong">Want to try</span></p><p class="meta-12">${esc(ago(s.at))}</p></div></div>
    <div class="row wrap gap-8">${s.places.map(p => `<button class="label-pill" data-action="place" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div></article>`;
}

/* 8 · Place page */
function placeScreen(r) {
  const p = r.data;
  if (!p) return `<div class="hero"><button class="icon-circle" data-action="back" aria-label="Back">${I.back}</button></div><main class="content" data-scroll><p class="meta">Loading…</p></main>`;
  const food = group(p) === 'Eat & Drink';
  return `<div class="hero"><span aria-hidden="true">${initials(p.name)}</span><button class="icon-circle" data-action="back" aria-label="Back">${I.back}</button></div>
  <main class="content gap-16" data-scroll>
    <div class="row top gap-12"><div class="grow"><h1 class="title t30">${esc(p.name)}</h1><p class="meta" style="margin-top:4px">${meta([typeTag(p)[0], p.area, price(p), hoursLabel(p)])}</p></div>
      <div class="stack gap-4" style="align-items:center">${score(p.friendScore, 's62', 'Friend score')}<span class="eyebrow" style="font-size:11px;line-height:14px;letter-spacing:.03em">${p.friendCount} friend${p.friendCount === 1 ? '' : 's'}</span></div></div>
    <div class="row gap-8">${p.myRating != null ? `<button class="btn lav sm-text" data-action="log" data-id="${esc(p.id)}" aria-pressed="true">${I.check}Been · ${p.myRating.toFixed(1)}</button>` : `<button class="btn sm-text" data-action="log" data-id="${esc(p.id)}" aria-pressed="false">Been</button>`}
      <button class="btn sm-text ${p.saved ? 'lav' : ''}" data-action="save" data-id="${esc(p.id)}" aria-pressed="${p.saved}">${p.saved ? I.check + 'Saved' : 'Want to try'}</button>
      ${food ? `<button class="btn primary sm-text" data-action="newplan" data-place="${esc(p.id)}">Plan this</button>` : ''}</div>
    ${p.tagCounts.length ? `<section><h2 class="eyebrow">What friends say</h2><div class="row wrap gap-8" style="margin-top:8px">${p.tagCounts.map(t => `<span class="label-pill">${esc(cap(t.tag))} · ${t.count}</span>`).join('')}</div></section>` : ''}
    <section class="stack gap-10"><h2 class="eyebrow">Friends’ reviews</h2>${p.reviews.map(rv => `<article class="card pad row top gap-10" style="padding:10px 12px">${av(rv.author, 34)}<div class="grow"><p class="row between body-14"><span class="strong">${nameOf(rv.author)}${rv.synthetic ? ' <span class="meta-12">· demo</span>' : ''}</span><span class="h-display" style="font-weight:800">${rv.rating.toFixed(1)}</span></p><p class="quote q-22">“${esc(rv.quote)}”</p></div></article>`).join('') || '<p class="meta">No one in your circle has rated this yet.</p>'}</section>
    <section class="stack gap-8"><h2 class="eyebrow">Details</h2><p class="meta">${esc(p.address || 'Address not provided')}${p.hours ? `<br>Listed hours: ${esc(p.hours)}` : ''}<br>${esc(p.provenance || '')}</p>
      <div class="row wrap gap-8"><button class="pill" data-action="facts" data-id="${esc(p.id)}">Check current details</button>${p.source ? `<a class="pill" href="${safeUrl(p.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</div></section>
  </main>`;
}
const safeUrl = url => { try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? esc(u.href) : '#'; } catch { return '#'; } };

/* 9 · Log a review */
// Diet tags on a well-rated review let friends' agents treat that diet as confirmed (Engine.vouchedDiets).
const TAGS = ['Quiet', 'First date', 'Good for groups', 'Cheap eats', 'Great patio', 'Loud', 'Vegetarian', 'Vegan', 'Halal', 'Gluten-free'];
function initLog(p, suggested) {
  if (ui.logs[p.id]) return;
  const mine = S.myReviews.find(r => r.placeId === p.id);
  ui.logs[p.id] = { rating: suggested ?? mine?.rating ?? 8.5, tags: new Set((mine?.tags || []).filter(t => !['positive', 'mixed', 'negative', 'quick-rate', 'adventure'].includes(t)).map(cap)) };
  drafts.note = mine && !mine.tags.includes('quick-rate') ? mine.quote : '';
}
function logScreen(r) {
  const p = r.data;
  if (!p) return `${titlebar('Log it', { close: true, cls: 'inline', size: 't24' })}<main class="content" data-scroll><p class="meta">Loading…</p></main>`;
  const st = ui.logs[p.id], tags = [...new Set([...TAGS, ...st.tags])];
  return `${titlebar('Log it', { close: true, cls: 'inline', size: 't24' })}
  <main class="content gap-22" data-scroll>
    <div class="card row gap-12" style="padding:10px 12px">${photo(p, '', 'thumb', false)}<div class="grow"><p class="h-18">${esc(p.name)}</p><p class="meta">${meta([typeTag(p)[0], p.area])}</p></div><button class="pill text" data-action="catalog" data-purpose="review" data-replace="1">Change</button></div>
    <section class="card r16 pad-16 sh-4 col gap-14"><div class="row between"><label for="rating" class="h-21">Your rating</label><span id="rate-bubble" class="score s68 ${scoreCls(st.rating)}" aria-hidden="true">${st.rating.toFixed(1)}</span></div>
      ${slider('rating', st.rating, 'Your rating', 'rate-bubble')}<div class="scale" aria-hidden="true"><span>0 · Skip it</span><span>5 · Fine</span><span>10 · Go now</span></div></section>
    <section class="stack gap-8"><label for="note" class="field-label">Note for friends</label><textarea id="note" class="textarea hand" style="height:96px" maxlength="2000" placeholder="What would you tell a friend?">${esc(drafts.note || '')}</textarea></section>
    <section class="stack gap-8"><h2 class="field-label">Tags</h2><div class="row wrap gap-8">${tags.map(t => `<button class="chip h34" aria-pressed="${st.tags.has(t)}" data-action="tag" data-id="${esc(p.id)}" data-value="${esc(t)}">${esc(t)}</button>`).join('')}
      ${ui.newTag ? `<form class="row gap-6" data-form="tag" data-id="${esc(p.id)}"><label class="sr-only" for="newtag">New tag</label><input id="newtag" class="field paper" style="height:34px;width:130px;font-size:13px" maxlength="30" placeholder="New tag" value="${esc(drafts.newtag || '')}"><button class="chip h34">Add</button></form>` : `<button class="chip h34 dashed" data-action="newtag" aria-label="Add a tag">+ Tag</button>`}</div></section>
  </main>
  <footer class="footbar"><button class="btn primary lg" data-action="post-review" data-id="${esc(p.id)}">Post to friends</button></footer>`;
}

/* Catalog search (Log → Change, Feed → search) */
function catalogScreen(r) {
  const results = r.data || [];
  return `${titlebar(r.purpose === 'review' ? 'What did you try?' : 'Find something', { size: 't30' })}
  <main class="content" data-scroll><div class="search">${I.search('#5E5873')}<label class="sr-only" for="catalog-q">Search places and things</label><input id="catalog-q" placeholder="Search places, albums, shows…" autocomplete="off" value="${esc(drafts['catalog-q'] || '')}"></div>
    <ul class="stack gap-8">${results.map(p => `<li><button class="card row-pad row gap-12" data-action="catalog-pick" data-id="${esc(p.id)}">${photo(p, '', 'thumb', false)}<span class="grow stack"><span class="row gap-8"><span class="body-15 strong">${esc(p.name)}</span>${tagPill(p)}</span><span class="meta-12">${meta([p.area, p.reviewCount ? `${p.reviewCount} from your circle` : ''])}</span></span>${I.chevron}</button></li>`).join('') || (r.data ? '<li class="meta">No match yet. Add it below.</li>' : '<li class="meta">Loading…</li>')}</ul>
    <button class="btn dashed h48" data-action="additem">${I.plus} Add something else</button></main>`;
}
function addItemScreen() {
  return `${titlebar('Add to your taste', { size: 't30' })}<main class="content" data-scroll><form id="item-form" class="form"><label class="lbl">Name<input class="input" name="name" required maxlength="100" placeholder="An album, show, product…"></label>
    <label class="lbl">Category<select class="select" name="category">${['Music', 'Movies & TV', 'Books', 'Products', 'Places'].map(c => `<option>${c}</option>`).join('')}</select></label><button class="btn primary lg">Next: your rating</button></form></main>`;
}

/* 10 · Profile */
const CATS = ['Eat & Drink', 'Live Events', 'Music', 'Movies & TV', 'Products'];
function profileScreen() {
  const been = S.myReviews.map(r => ({ p: r.place, rating: r.rating })).filter(x => x.p), want = S.savedPlaces.map(p => ({ p }));
  const extra = [...new Set([...been, ...want].map(x => group(x.p)))].filter(g => !CATS.includes(g));
  const cats = [...CATS, ...extra], items = (ui.ptab === 'been' ? been : want).filter(x => group(x.p) === ui.pcat).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const interests = String(S.me.private.interests || '').split(',').map(s => s.trim()).filter(Boolean).join(', ');
  return `<section class="profile-head"><button class="icon-circle gear" data-action="settings" aria-label="Settings and privacy">${I.gear}</button>
    <div class="row gap-14"><div class="big-av" aria-hidden="true">${esc(S.me.name.charAt(0))}</div><div class="grow"><h1>${esc(S.me.name)}</h1><p class="body-14 semi" style="margin-top:2px">${esc([S.me.area, cap(interests)].filter(Boolean).join(' · '))}</p></div></div>
    <dl class="stats"><div><dd><strong>${been.length}</strong></dd><dt><span>Been</span></dt></div><div><dd><strong>${want.length}</strong></dd><dt><span>Want to try</span></dt></div><a href="#" data-action="friends"><strong>${S.friends.length}</strong><span>Friends</span></a><div><dd><strong>${S.plans.length}</strong></dd><dt><span>Adventures</span></dt></div></dl></section>
  <div class="seg" role="tablist" aria-label="Your places" style="margin:14px 20px 0 16px"><button role="tab" aria-selected="${ui.ptab === 'been'}" data-action="ptab" data-value="been">Been</button><button role="tab" aria-selected="${ui.ptab === 'want'}" data-action="ptab" data-value="want">Want to try</button></div>
  <div class="row between gap-12" style="position:relative;z-index:2;flex-shrink:0;padding:14px 20px 0 16px"><span id="cat-label" class="eyebrow">${ui.ptab === 'been' ? 'Your ratings for' : 'Saved in'}</span>
    <div class="dropdown"><button class="pill primary h42 shadow" aria-haspopup="listbox" aria-expanded="${ui.catOpen}" aria-labelledby="cat-label" data-action="cat-toggle">${esc(ui.pcat)}${I.caret}</button>
    ${ui.catOpen ? `<div class="listbox" role="listbox" aria-labelledby="cat-label">${cats.map(c => `<button role="option" aria-selected="${c === ui.pcat}" data-action="cat" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}</div></div>
  <main class="content" data-scroll style="padding-top:14px"><ul class="stack gap-10" aria-label="${ui.ptab === 'been' ? 'Your ratings, highest first' : 'Your want to try list'}">
    ${items.map(x => `<li><button class="card row-pad row gap-12" data-action="place" data-id="${esc(x.p.id)}"><span class="grow stack"><span class="row gap-8"><span class="body-15 strong" style="font-size:16px;line-height:22px">${esc(x.p.name)}</span>${tagPill(x.p)}</span><span class="meta-12">${meta([x.p.area, price(x.p)])}</span></span>${x.rating != null ? score(x.rating, 's44') : I.bookmark(true)}</button></li>`).join('')
      || `<li class="card empty-card"><p class="h-19">${ui.ptab === 'been' ? 'Nothing rated here yet' : 'Nothing saved here yet'}</p><p class="meta">${ui.ptab === 'been' ? 'Log something you tried and it lands here, sorted by your rating.' : 'Tap Want to try on a friend’s pick to save it.'}</p></li>`}</ul></main>${tabbar('you')}`;
}
function settingsScreen() {
  const p = S.me.private;
  return `${titlebar('Settings', { size: 't30' })}<main class="content gap-16" data-scroll>
    <form id="settings-form" class="card r16 pad-16 sh-4 form"><p class="eyebrow row gap-8">${I.lock} Only you and your agent</p>
      <label class="lbl">Usual budget per outing ($)<input class="input" name="budget" type="number" min="0" max="10000" value="${esc(p.budget)}" required></label>
      <div class="two"><label class="lbl">Free from<input class="input" name="start" type="time" value="${esc(p.start)}" required></label><label class="lbl">Until<input class="input" name="end" type="time" value="${esc(p.end)}" required></label></div>
      <fieldset style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">Days you’re usually free</legend><div class="toggle-row">${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => `<label><input type="checkbox" name="days" value="${d}" ${p.days.includes(d) ? 'checked' : ''}><span class="plain">${d.slice(0, 3)}</span></label>`).join('')}</div></fieldset>
      <label class="lbl">Food needs<input class="input" name="dietary" value="${esc(p.dietary)}" placeholder="e.g. vegetarian, or vegetarian preferred"></label>
      <label class="lbl">Things you love<input class="input" name="interests" value="${esc(p.interests)}" placeholder="Coffee, ramen, live music"></label>
      <label class="lbl">Anything else<textarea class="textarea" name="preferences" rows="2">${esc(p.preferences)}</textarea></label>
      <label class="lbl">Social energy<select class="select" name="energy">${['low', 'medium', 'high'].map(e => `<option ${p.energy === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <button class="btn primary lg">Save private settings</button><p class="meta">Your agent shares conclusions like “free after 8:30”, never these values.</p></form>
    <button class="card pad row gap-10" data-action="prompt" data-text="What do you remember about me?"><span class="grow body-15 strong">What does my agent remember?</span>${I.chevron}</button>
    ${Object.keys(S.me.temporary).length ? `<div class="card pad col gap-8"><p class="body-14">Some preferences from chat apply to this conversation only.</p><button class="pill" style="align-self:flex-start" data-action="clear-temporary">Clear them</button></div>` : ''}
    <div class="row between"><span class="meta">${S.provider.provider === 'local' ? 'Local demo agents (not an LLM)' : `Agent: ${esc(S.provider.provider)}`}</span><button class="pill" data-action="logout">Log out</button></div></main>`;
}

/* 11 · Adventures */
function adventuresScreen() {
  const today = todayISO(), rank = p => status(p).key === 'ok' ? 0 : 1;
  const upcoming = S.plans.filter(p => p.option.date >= today).sort((a, b) => rank(a) - rank(b) || a.option.date.localeCompare(b.option.date));
  const past = S.plans.filter(p => p.option.date < today).sort((a, b) => b.option.date.localeCompare(a.option.date));
  return `${titlebar('Adventures', { back: false, cls: 'top', right: `<button class="pill primary h44 shadow" data-action="newplan">${I.plus}New</button>` })}
  <main class="content gap-18" data-scroll><h2 class="eyebrow tight">Upcoming</h2>
    ${upcoming.map(advCard).join('') || `<div class="card empty-card"><p class="h-19">The group chat could never.</p><p class="meta">Pick your people. Your agents handle the back-and-forth.</p><button class="btn primary h48" style="width:100%" data-action="newplan">Start an adventure</button></div>`}
    ${past.length ? `<h2 class="eyebrow" style="margin-bottom:-6px">Past</h2>${past.map(pastRow).join('')}` : ''}</main>${tabbar('adventures')}`;
}
function advCard(p) {
  const st = status(p), d = dparts(p.option.date), cancelled = st.key === 'cancelled';
  const route = cancelled ? 'Cancelled' : `${p.option.place.name}${p.option.activity ? ` → ${p.option.activity.name}` : ''} · ${t12(p.option.time, false)}`;
  return `<button class="adv ${st.key === 'ok' ? 'sh-4' : ''}" data-action="plan" data-id="${esc(p.id)}"><span class="stub ${cancelled ? 'gray' : ''}" style="--bg:${st.bg}"><span class="w">${d.w}</span><span class="d">${d.d}</span><span class="w">${d.m}</span></span>
    <span class="adv-body"><span class="adv-title ${cancelled ? 'struck' : ''}">${esc(p.title)}</span><span class="meta">${esc(route)}</span><span class="row gap-8" style="margin-top:6px">${avStack(p.participants, 24, -7)}<span class="meta-12">${esc(statusLine(p))}</span></span></span>
    ${sticker(st.label, st.cls, { ok: 4, confirmed: -3, cancelled: 3, working: -4 }[st.key])}</button>`;
}
function pastRow(p) {
  const others = p.participants.filter(u => !isMe(u)).map(first), rateable = ['confirmed', 'booked'].includes(p.state);
  return `<button class="card row gap-12" style="padding:10px 12px" data-action="${rateable && p.myNightRating == null ? 'rate' : 'details'}" data-id="${esc(p.id)}"><span class="grow stack"><span class="body-15 strong">${esc(p.title)}</span><span class="meta-12">${meta([dparts(p.option.date).md, p.option.place.name, others.length ? `with ${names(others)}` : ''])}</span></span>
    ${p.myNightRating != null ? score(p.myNightRating, 's44', 'Your rating') : rateable ? '<span class="pill">Rate it</span>' : `<span class="meta-12">${esc(status(p).label)}</span>`}</button>`;
}

/* 3 · Working it out */
function agentRows(p, u) {
  const rows = [];
  for (let round = 1; round < p.round; round++) if (p.log.some(l => l.userId === u.id && l.round === round && l.type === 'counter')) rows.push(counterRow(`Asked for another option. ${round === p.round - 1 ? 'Moved the plan.' : ''}`));
  const last = lastEntry(p, u.id);
  if (last?.type === 'accept') rows.push(checkRow('Time, budget and food work'));
  else if (last?.type === 'counter') rows.push(counterRow('Asked for another option'));
  else if (p.state === 'negotiating') rows.push(spinRow(p.round > 1 ? 'Checking the new proposal' : 'Checking privately…'));
  else if (p.state === 'needs_decision') rows.push(counterRow('Couldn’t make this one work'));
  return rows.join('');
}
function workingScreen(p) {
  const sub = p.state === 'negotiating' ? `Rounding up your party · round ${Math.max(1, p.round)} of 3` : p.state === 'awaiting_approval' ? 'Everyone’s agent said yes' : p.state === 'needs_decision' ? 'Your call: nothing worked for everyone' : statusLine(p);
  const list = stops(p.option), reason = p.candidates.find(c => c.place.id === p.option.place.id)?.reason;
  const people = [...p.participants].sort((a, b) => isMe(b) - isMe(a));
  const ready = p.state === 'awaiting_approval' && p.isHost, stuck = p.state === 'needs_decision' && p.isHost;
  return `${titlebar(esc(p.title), { cls: 'plain', size: 't30', sub, subMuted: true })}
  <main class="content" data-scroll style="padding-top:18px">
    <section class="card purple pad-14 sh-4"><h2 class="eyebrow">The route so far</h2><p class="h-18" style="margin-top:4px">${esc(list[0].label)} at ${t12(p.option.time, false)}${list[1] ? `, then ${esc(list[1].label.replace(/^(Show at|Then) /, list[1].label.startsWith('Show') ? 'the show at ' : ''))}` : ''}</p>
      ${reason ? `<p class="body-14" style="margin-top:4px;font-size:13px;line-height:18px">${esc(reason)}.</p>` : p.why[0] ? `<p class="body-14" style="margin-top:4px;font-size:13px;line-height:18px">${esc(p.why[0].author.split(' ')[0])} said “${esc(p.why[0].quote)}”</p>` : ''}</section>
    ${people.map(u => `<section class="card row top gap-12" style="padding:10px 14px" aria-label="${nameOf(u)}">${av(u, 34)}<div class="stack gap-4"><h3 class="body-15 strong">${nameOf(u)}</h3>${agentRows(p, u)}</div></section>`).join('')}
    ${stuck ? `<div class="issue">${esc(p.issue || 'No option worked for everyone.')}</div>` : ''}
    ${p.warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('')}
    ${lockNote('Calendars and budgets stay private. Only yes, no or a new time is shared.')}
  </main>
  <footer class="footbar">${stuck ? `<button class="btn primary lg" data-action="change" data-id="${esc(p.id)}">Change something</button><button class="btn lg fit" data-action="cancel" data-id="${esc(p.id)}">Cancel</button>`
    : ready ? `<button class="btn primary lg" data-action="approve-open" data-id="${esc(p.id)}">See the route</button>`
    : p.state === 'negotiating' ? `<button class="btn lg shadow" disabled>Still working it out…</button>` : `<button class="btn lg shadow" data-action="details" data-id="${esc(p.id)}">See the route</button>`}</footer>`;
}
const SORTED = { schedule: t => `Moved to ${t} so everyone can come`, budget: () => 'Brought the cost down to fit everyone', dietary_unverified: () => 'Checked the food works for everyone', closed: () => 'Picked a time they’re open', preference: () => 'Swapped in a spot the group likes more' };
function sortedItems(p) {
  const r = p.resolved || [], items = r.map(code => SORTED[code]?.(t12(p.option.time, false))).filter(Boolean);
  if (!r.includes('schedule')) items.push('Works with everyone’s schedule');
  if (!r.includes('budget')) items.push('Fits everyone’s budget');
  if (!r.includes('dietary_unverified')) items.push('Food works for everyone');
  return items;
}

/* 4 · You approve */
function approveScreen(p) {
  const d = dparts(p.option.date), items = sortedItems(p);
  return `<div class="screen sheet-screen"><div class="sheet-peek" aria-hidden="true">${esc(p.title)}</div>
  <section class="sheet" data-scroll aria-label="Route ready to send"><button class="grab" data-action="back" aria-label="Close"></button>
    <div>${sticker('Ready to go', 'coral static lg', -2)}<h1 class="huge" style="margin-top:8px">${d.long}, ${t12(p.option.time)}</h1></div>
    ${routeList(p.option)}
    <div class="row between gap-10"><div class="row gap-10">${avStack(p.participants, 32)}<p class="body-14 semi">Everyone’s free</p></div><p class="meta" title="Proposed meal allowance, not a verified menu price">~$${esc(p.option.allowance)} each</p></div>
    <div class="card lav pad-14"><h2 class="body-15 strong">${items.length} things sorted out privately</h2><ul class="stack gap-4" style="margin-top:6px">${items.map(t => `<li class="check">${I.check}${esc(t)}</li>`).join('')}</ul></div>
    ${p.warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('')}
    <div class="stack gap-12 mt-auto"><button class="btn primary lg" data-action="approve" data-id="${esc(p.id)}" data-revision="${p.revision}">Send invites</button>
      <div class="row gap-10"><button class="btn" data-action="change" data-id="${esc(p.id)}">Change something</button><button class="btn" data-action="another" data-id="${esc(p.id)}">Another route</button></div></div>
  </section></div>`;
}

/* 5 · Invite (invitee) */
function inviteScreen(p) {
  const host = p.participants.find(u => u.id === p.hostId), going = p.participants.filter(u => p.rsvps[u.id] === 'in' && !isMe(u)), why = p.why[0], d = dparts(p.option.date), re = p.myRsvp === 'reconfirm';
  return `<main class="content gap-16" data-scroll style="padding:24px 20px 20px 16px">
    <header class="row gap-10">${stack.length > 1 ? `<button class="back" data-action="back" aria-label="Back" style="margin-left:-10px">${I.back}</button>` : ''}${av(host, 40)}<p class="body-15"><span class="strong">${first(host)}</span> ${re ? 'updated your adventure' : 'invited you on an adventure'}</p></header>
    <article class="card r16 sh-5 col gap-14" style="padding:18px 16px">${sticker('You’re free', 'green lg', 5, 'top:-12px;right:16px;padding:3px 10px')}
      <h1 class="huge">${d.long}, ${t12(p.option.time)}</h1>${routeList(p.option, { rail: false })}
      <p class="meta" style="margin:-4px 0 0 52px">About $${esc(p.option.allowance)}</p>
      ${why ? `<div class="dashed-top"><p class="eyebrow">Why this one</p><blockquote class="quote q-28" style="margin-top:4px">“${esc(why.quote)}”</blockquote><p class="meta" style="margin-top:2px">${why.authorId === S.me.id ? 'You' : esc(why.author.split(' ')[0])}${why.synthetic ? ', demo opinion' : `, in ${new Date(why.date).toLocaleDateString('en-US', { month: 'long' })}`}</p></div>` : ''}
      ${going.length ? `<div class="row gap-10">${avStack(going, 30)}<p class="body-14 semi">${names(going.map(first))} ${going.length > 1 ? 'are' : 'is'} going</p></div>` : ''}</article>
    <div class="row gap-10"><button class="btn primary lg" data-action="rsvp-in" data-id="${esc(p.id)}">${re ? 'Still in' : 'I’m in'}</button><button class="btn lg" data-action="rsvp-out" data-id="${esc(p.id)}">Can’t make it</button></div>
    <form class="stack gap-8 mt-auto" data-form="tell" data-id="${esc(p.id)}"><label for="tell" class="field-label s18">Need a change? Just say it.</label><div class="row gap-8"><input id="tell" class="field paper" maxlength="500" placeholder="can’t do ${t12(p.option.time, false)}, could do ${t12(plus(p.option.time, 30), false)}" value="${esc(drafts.tell || '')}"><button class="send" aria-label="Send to your agent">${I.send}</button></div>
      <p class="meta">${first(host)} only sees the new time, not your reason.</p></form></main>`;
}

/* 6 · Plan changed (host) */
function changedScreen(p) {
  const by = p.changeBy && !isMe(p.changeBy) ? p.changeBy : null, prev = p.previous, now = stops(p.option), before = prev ? stops(prev) : [];
  const samePlace = prev && prev.place.id === p.option.place.id && (prev.activity?.id || null) === (p.option.activity?.id || null), sameBudget = prev && prev.allowance === p.option.allowance;
  const yes = p.participants.filter(u => !isMe(u) && u.id !== by?.id && ['in', 'reconfirm'].includes(p.rsvps[u.id]));
  const timeChanged = prev && prev.time !== p.option.time;
  const lead = by ? (timeChanged ? `${firstRaw(by)} can’t do ${t12(prev.time, false)}. Free at ${t12(p.option.time, false).replace(':00', '')}.` : `${firstRaw(by)} asked for a change.`) : 'You asked for a change.';
  const summary = [samePlace && sameBudget ? 'Same places, same budget.' : samePlace ? `Same places. Now about $${p.option.allowance} each.` : '', yes.length ? `${names(yes.map(firstRaw))} already said yes, so they get a quick reconfirm.` : ''].filter(Boolean).join(' ');
  const d = dparts(p.option.date);
  const rsvp = u => isMe(u) ? `<span class="row gap-6 green-ink strong">${I.check}In</span>` : u.id === by?.id ? '<span class="muted">Waiting on your OK</span>' : ['in', 'reconfirm'].includes(p.rsvps[u.id]) ? `<span class="row gap-6 green-ink strong">${I.check}In</span>` : '<span class="muted">Invited</span>';
  return `<main class="content gap-16" data-scroll style="padding:24px 20px 20px 16px">
    <header>${stack.length > 1 ? `<button class="back" data-action="back" aria-label="Back">${I.back}</button>` : ''}${sticker('Needs your OK', 'coral static lg', -2)}<h1 class="huge" style="margin-top:10px">${timeChanged ? `Route changed: ${t12(p.option.time, false)}` : 'Plan changed'}</h1></header>
    <section class="card r16 pad-16 sh-4 col gap-14"><div class="row gap-10">${av(by || S.me, 34)}<p class="body-15">${esc(lead)}</p></div>
      <dl class="num" style="display:grid;grid-template-columns:64px minmax(0,1fr);row-gap:10px;font-size:15px;line-height:22px">${now.map((s, i) => `<dt class="meta" style="line-height:22px">${i === 0 ? s.label.split(' at ')[0] : group(s.place) === 'Live Events' ? 'Show' : 'Next'}</dt><dd>${before[i] && (before[i].time !== s.time || before[i].place.id !== s.place.id) ? `<span class="muted" style="text-decoration:line-through">${before[i].place.id !== s.place.id ? esc(before[i].place.name) : t12(before[i].time, false)}</span> <span class="muted" aria-hidden="true">→</span> ` : ''}<span class="strong">${before[i] && before[i].place.id !== s.place.id ? esc(s.place.name) + ', ' : ''}${t12(s.time)}</span></dd>`).join('')}</dl>
      ${summary ? `<p class="meta">${esc(summary)}</p>` : ''}</section>
    <div class="stack gap-12"><button class="btn primary lg" data-action="approve" data-id="${esc(p.id)}" data-revision="${p.revision}">Send update</button>
      ${by && prev && p.participants.length > 2 ? `<button class="btn" data-action="drop" data-id="${esc(p.id)}" data-user="${esc(by.id)}">Keep ${t12(prev.time, false)} without ${first(by)}</button>` : `<button class="btn" data-action="change" data-id="${esc(p.id)}">Change something</button>`}</div>
    <section class="card r16 row mt-auto" style="overflow:hidden;align-items:stretch" aria-label="Who’s in"><div class="stub big" style="--bg:#FF6F59"><span class="w">${d.w}</span><span class="d">${d.d}</span><span class="w">${d.m}</span></div>
      <ul class="grow stack gap-10 body-14" style="padding:14px 16px">${p.participants.map(u => `<li class="row between"><span class="semi">${nameOf(u)}</span>${rsvp(u)}</li>`).join('')}</ul></section></main>`;
}

/* 12 · Adventure details */
function detailsScreen(p) {
  const d = dparts(p.option.date), st = status(p);
  const changeBanner = p.isHost && p.state === 'awaiting_approval' && p.hasPendingChange ? `<button class="card row gap-10" style="padding:10px 12px" data-action="changed" data-id="${esc(p.id)}">${sticker('Needs your OK', 'coral static', -3, 'padding:2px 8px')}<span class="grow body-14 semi">${p.changeBy && !isMe(p.changeBy) ? `${first(p.changeBy)} moved it to ${t12(p.option.time, false)}` : 'Your change is ready'}</span><span class="link">Review</span></button>`
    : p.state === 'negotiating' ? `<button class="card row gap-10" style="padding:10px 12px" data-action="working" data-id="${esc(p.id)}">${sticker('Working it out', 'yellow static', -3, 'padding:2px 8px')}<span class="grow body-14 semi">Agents are rechecking</span><span class="link">Watch</span></button>`
    : !p.isHost && st.key === 'ok' ? `<button class="card row gap-10" style="padding:10px 12px" data-action="invite" data-id="${esc(p.id)}">${sticker('Needs your OK', 'coral static', -3, 'padding:2px 8px')}<span class="grow body-14 semi">${p.myRsvp === 'reconfirm' ? 'New time to reconfirm' : 'Reply to the invite'}</span><span class="link">Open</span></button>`
    : p.state === 'needs_decision' ? `<div class="issue">${esc(p.issue || '')}</div>` : '';
  const who = u => { const r = p.rsvps[u.id]; if (p.hasPendingChange && p.changeBy?.id === u.id && !isMe(u)) return `<span class="st orange-ink">Asked for ${t12(p.option.time, false)}</span>`; return r === 'in' ? '<span class="st green-ink">In</span>' : r === 'out' ? '<span class="st orange-ink">Can’t make it</span>' : r === 'reconfirm' ? '<span class="st muted">Reconfirming</span>' : r === 'pending' ? '<span class="st muted">Invited</span>' : '<span class="st muted">Checking</span>'; };
  const footer = p.isHost && p.state === 'awaiting_approval' ? `<button class="btn h48" data-action="change" data-id="${esc(p.id)}">Change something</button><button class="btn primary h48" data-action="${p.hasPendingChange ? 'changed' : 'approve-open'}" data-id="${esc(p.id)}">${p.hasPendingChange ? 'Review change' : 'See the route'}</button>`
    : !p.isHost && st.key === 'ok' ? `<button class="btn h48" data-action="change" data-id="${esc(p.id)}">Need a change</button><button class="btn primary h48" data-action="invite" data-id="${esc(p.id)}">Reply</button>`
    : ['confirmed', 'booked'].includes(p.state) ? `<button class="btn h48" data-action="change" data-id="${esc(p.id)}">Change something</button><button class="btn primary h48" data-action="rate" data-id="${esc(p.id)}">${p.myNightRating != null ? 'Your ratings' : 'Rate the night'}</button>`
    : ['invited', 'needs_decision'].includes(p.state) ? `<button class="btn primary h48" data-action="change" data-id="${esc(p.id)}">Change something</button>` : '';
  const history = [...p.history].reverse().slice(0, 8);
  return `${titlebar(esc(p.title), { size: 't30', sub: `${d.short} · ${t12(p.option.time)} · ~$${esc(p.option.allowance)} each` })}
  <main class="content" data-scroll>${changeBanner}
    <section class="card pad-14 sh-4" style="padding:14px" aria-label="Route"><h2 class="eyebrow" style="margin-bottom:10px">The route</h2>${routeList(p.option, { actions: true, party: p.participants.length })}</section>
    <section aria-label="Who’s going"><h2 class="eyebrow" style="margin-bottom:8px">Who’s going</h2><ul class="who stack gap-8">${p.participants.map(u => `<li>${av(u, 30)}<span class="name">${nameOf(u)}</span>${who(u)}</li>`).join('')}</ul></section>
    <section aria-label="History"><h2 class="eyebrow" style="margin-bottom:8px">How it came together</h2><ul class="history stack gap-6">${history.map(h => `<li><span>${new Date(h.at).toLocaleDateString('en-US', { weekday: 'short' })}</span><span>${esc(h.text.replace(/\b([01]\d|2[0-3]):([0-5]\d)\b/g, (_, hh, mm) => t12(`${hh}:${mm}`)))}</span></li>`).join('')}</ul></section>
    ${p.booking ? `<div class="booking"><p class="eyebrow">Demo booking · ${esc(p.booking.reference)}</p><p class="body-14" style="margin-top:4px">${esc(p.booking.note)}</p></div>` : ''}
    <div class="row wrap gap-8">${p.isHost && p.state === 'confirmed' ? `<button class="pill primary" data-action="book" data-id="${esc(p.id)}">Preview booking</button>` : ''}${['confirmed', 'booked'].includes(p.state) ? `<button class="pill" data-action="calendar" data-id="${esc(p.id)}">Add to calendar</button>` : ''}<button class="pill" data-action="plan-facts" data-id="${esc(p.id)}">Venue details</button>${p.isHost && !['cancelled', 'booked'].includes(p.state) ? `<button class="pill" data-action="cancel" data-id="${esc(p.id)}">Cancel plan</button>` : ''}</div>
    ${p.log.length ? `<details class="more" data-key="log-${esc(p.id)}" ${ui.open.has('log-' + p.id) ? 'open' : ''}><summary>${I.chevron} How the agents negotiated</summary>${p.log.map(l => `<p>Round ${l.round}: ${esc(l.userId ? `${nameOf(p.participants.find(u => u.id === l.userId))}’s agent: ` : '')}${esc(l.text)}</p>`).join('')}</details>` : ''}
    <p class="meta-12">${p.mode === 'local' ? 'Local demo agents check real constraints against your proposal.' : `Agent provider: ${esc(p.mode)}`} The cost is a proposed meal allowance, not a menu price.</p>
  </main>${footer ? `<footer class="footbar tight">${footer}</footer>` : ''}${tabbar(rootTab())}`;
}

/* Change something (host tweak or invitee message) */
function changeScreen(p) {
  if (!p.isHost) return `${titlebar('Tell your agent', { size: 't30' })}<main class="content gap-16" data-scroll><p class="body-15">Say what changed. Your agent turns it into a new constraint and reopens the plan. ${first(p.participants.find(u => u.id === p.hostId))} only sees the new proposal.</p>
    <form class="form" data-form="tell" data-id="${esc(p.id)}" data-done="details"><label class="sr-only" for="tell">What changed?</label><textarea id="tell" class="textarea hand" style="height:110px" maxlength="500" placeholder="can’t do ${t12(p.option.time, false)}, could do ${t12(plus(p.option.time, 30), false)}">${esc(drafts.tell || '')}</textarea>${lockNote('Only your agent sees what you write.')}<button class="btn primary lg">Send to my agent</button></form></main>`;
  return `${titlebar('Change something', { size: 't30', sub: 'Your guest list stays the same. Agents recheck with everyone.', subMuted: true })}<main class="content" data-scroll><form id="tweak-form" class="form" data-id="${esc(p.id)}">
    <div class="two"><label class="lbl">Day<input class="input" name="date" type="date" value="${esc(p.option.date)}" required></label><label class="lbl">Time<input class="input" name="time" type="time" value="${esc(p.option.time)}" required></label></div>
    <label class="lbl">Proposed spend per person ($)<input class="input" name="allowance" type="number" min="0" max="10000" value="${esc(p.option.allowance)}" required></label>
    <label class="lbl">Where<select class="select" name="placeId">${p.candidates.map(c => `<option value="${esc(c.place.id)}" ${c.place.id === p.option.place.id ? 'selected' : ''}>${esc(c.place.name)}</option>`).join('')}</select></label>
    <label class="lbl">After that (optional)<select class="select" name="activityId"><option value="">Keep it to one stop</option>${(S.activities || []).map(a => `<option value="${esc(a.id)}" ${a.id === p.option.activity?.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <button class="btn primary lg">Recheck with everyone</button></form></main>`;
}

/* Pick friends / new plan */
function newPlanScreen(r) {
  const draft = r.draft || {}, chosen = new Set(draft.friends || r.friends || []);
  return `${titlebar('Who’s coming?', { size: 't30', sub: 'You pick the people. Agents never add or remove anyone.', subMuted: true })}<main class="content" data-scroll><form id="plan-form" class="form">
    <fieldset style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">Your party</legend><div class="toggle-row">${S.friends.filter(u => MAIN_IDS.includes(u.id)).map(u => `<label><input type="checkbox" name="friends" value="${esc(u.id)}" ${chosen.has(u.id) ? 'checked' : ''}><span>${av(u, 28)}${first(u)}</span></label>`).join('')}</div></fieldset>
    <label class="lbl">What’s the occasion?<input class="input" name="title" value="${esc(draft.title || 'Saturday night')}" maxlength="80" required></label>
    <div class="two"><label class="lbl">Day<input class="input" name="date" type="date" value="${esc(r.date || S.defaultDate)}" required></label><label class="lbl">Starting time<input class="input" name="time" type="time" value="${esc(r.time || '19:00')}" required></label></div>
    <label class="lbl">Proposed spend per person ($)<input class="input" name="allowance" type="number" min="0" max="10000" value="24" required></label>
    <label class="lbl">After dinner (optional)<select class="select" name="activityId"><option value="">Keep it to dinner</option>${(S.activities || []).map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>
    ${r.placeId ? `<p class="meta">Starting with the spot you picked.</p>` : ''}
    ${lockNote('Each friend’s budget and calendar stay with their own agent.')}<button class="btn primary lg">Round them up</button></form></main>`;
}

/* 13 · Friends */
function friendsScreen() {
  const q = String(drafts['friend-q'] || '').toLowerCase(), list = S.friends.filter(u => !q || u.name.toLowerCase().includes(q));
  return `${titlebar(`Friends <span class="count">${S.friends.length}</span>`, { right: `<button class="pill primary h44 shadow" data-action="addfriends">${I.plus}Add friends</button>` })}
  <main class="content" data-scroll>
    ${S.requests.length ? `<section class="card pad sh-4 col gap-10"><h2 class="eyebrow">Requests</h2>${sticker(`${S.requests.length} new`, 'coral')}${S.requests.map(r => `<div class="row gap-10">${av(r.fromUser, 38)}<span class="grow stack"><span class="body-15 strong">${esc(r.fromUser.name)}</span><span class="meta-12">${r.mutual.length ? `Friends with ${esc(names(r.mutual))}` : 'Wants to be friends'}</span></span><button class="pill primary h36" data-action="friend-accept" data-id="${esc(r.from)}">Accept</button><button class="icon-circle" style="width:36px;height:36px" data-action="friend-decline" data-id="${esc(r.from)}" aria-label="Decline ${esc(r.fromUser.name)}">${I.x}</button></div>`).join('')}</section>` : ''}
    <div class="search">${I.search('#5E5873')}<label class="sr-only" for="friend-q">Search your friends</label><input id="friend-q" placeholder="Search your friends" autocomplete="off" value="${esc(drafts['friend-q'] || '')}"></div>
    <ul class="stack gap-8" aria-label="Your friends">${list.map(u => `<li class="card row-pad row gap-10">${av(u, 38)}<span class="grow stack"><span class="body-15 strong">${esc(u.name)}</span><span class="meta-12">${u.ratings} rating${u.ratings === 1 ? '' : 's'} · ${u.adventures} adventure${u.adventures === 1 ? '' : 's'} together${u.fictional ? ' · demo person' : ''}</span></span>${MAIN_IDS.includes(u.id) ? `<button class="pill" data-action="plan-friend" data-id="${esc(u.id)}">Plan</button>` : ''}</li>`).join('') || '<li class="meta">No friends match that.</li>'}</ul>
  </main>${tabbar(rootTab())}`;
}

/* 14 · Add friends */
function addFriendsScreen(r) {
  const q = String(drafts['people-q'] || '').toLowerCase(), match = u => !q || u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
  const known = S.people.filter(u => u.mutual.length && match(u)).slice(0, 6), more = S.people.filter(u => !u.mutual.length && match(u)).slice(0, q ? 12 : 4);
  const row = u => `<div class="card row-pad row gap-10">${av(u, 38)}<span class="grow stack"><span class="body-15 strong">${esc(u.name)}</span><span class="meta-12">${u.mutual.length ? `Friends with ${esc(names(u.mutual))}` : `On disco · ${u.ratings} rating${u.ratings === 1 ? '' : 's'}`}</span></span>${S.sent.includes(u.id) ? '<span class="pill requested">Requested</span>' : `<button class="pill primary pad-14" data-action="friend-add" data-id="${esc(u.id)}">Add</button>`}</div>`;
  const link = `${location.origin}/?invite=${encodeURIComponent(S.me.id)}`;
  return `${titlebar('Add friends', { back: true })}<main class="content gap-16" data-scroll>
    <div class="search">${I.search('#5E5873')}<label class="sr-only" for="people-q">Search by name or username</label><input id="people-q" placeholder="Search by name or username" autocomplete="off" value="${esc(drafts['people-q'] || '')}"></div>
    <section class="card purple sh-4 col gap-10" style="padding:14px"><h2 class="h-19">Bring your crew</h2><p class="body-14">Share your link or QR code so friends can find you on Disco.</p>
      <div class="row gap-8"><button class="btn h44" data-action="share-link" data-link="${esc(link)}">${I.share}Share invite link</button><button class="btn h44" data-action="toggle-qr" aria-expanded="${ui.qr}">${I.qr}${ui.qr ? 'Hide QR code' : 'Show QR code'}</button></div>
      ${ui.qr ? `<div class="qr">${qrSvg(link)}</div><p class="meta-12 center" style="color:var(--ink)">${esc(link)}</p>` : ''}</section>
    ${known.length ? `<section class="stack gap-8"><h2 class="eyebrow">People you may know</h2>${known.map(row).join('')}</section>` : ''}
    <section class="stack gap-8"><h2 class="eyebrow">${q ? 'On disco' : 'More people on disco'}</h2>${more.map(row).join('') || '<p class="meta">No one matches that yet.</p>'}</section>
    ${r.onboarding ? `<button class="btn primary lg" data-action="finish-onboarding">Done, take me to chat</button>` : ''}</main>`;
}

/* 15 · Welcome / 16 · Quick rate */
const IMPORTS = [['music', 'Music you listen to', 'Connect your music app', '#B79CFF', 'music'], ['places', 'Places you’ve saved', 'Import saved spots from your maps app', '#FF6F59', 'pin'], ['shows', 'Movies and shows', 'Connect your streaming app', '#FFD666', 'play']];
function welcomeScreen() {
  return `<main class="onboard" data-scroll><div class="progress" aria-hidden="true"><span class="on"></span><span></span><span></span></div>
    <div><div class="row gap-12">${ball(66)}<div><p class="wordmark" style="font-size:44px;line-height:46px">Disco</p><p class="eyebrow muted" style="letter-spacing:.08em;margin-top:6px">Stress less, party more</p></div></div>
      <h1 class="title t30" style="margin-top:14px">First, show us your taste.</h1><p class="body-15 muted" style="margin-top:8px">Bring in what you already love so your friends’ picks make sense on day one. Takes about a minute.</p></div>
    <section aria-label="Import" class="stack gap-10">${IMPORTS.map(([key, title, sub, color, icon]) => { const on = ui.imports[key]; return `<button class="import ${on ? 'on' : ''}" data-action="import" data-value="${key}" aria-pressed="${!!on}"><span class="ic" style="background:${color}">${I[icon]}</span><span class="grow stack"><span class="body-15 strong">${title}</span>${on ? '<span class="meta-12 strong green-ink">Demo connection · nothing imported</span>' : `<span class="meta-12">${sub}</span>`}</span>${on ? I.check : '<span class="strong" style="font-size:13px">Connect</span>'}</button>`; }).join('')}</section>
    <div class="divider-or"><span></span>or<span></span></div>
    <button class="card col gap-2" style="padding:14px 16px" data-action="quickrate">${sticker('1 min', 'yellow', 4, 'padding:2px 9px')}<span class="h-18">Rate 10 Columbus spots</span><span class="meta">Quick taps: loved it, fine, or never been</span></button>
    <div class="stack gap-10 mt-auto"><button class="btn primary lg" data-action="quickrate">Continue</button><p class="meta center">Next: find your friends · <button class="link" style="font-size:13px" data-action="welcome-skip">Skip for now</button></p></div></main>`;
}
function quickRateScreen() {
  const q = ui.quick;
  if (!q) return `<main class="onboard" data-scroll><p class="meta">Finding popular spots…</p></main>`;
  const pick = q.picks[q.i];
  if (!pick) return `<main class="onboard" data-scroll><p class="meta">Saving your picks…</p></main>`;
  const p = pick.place;
  return `<main class="onboard g20" data-scroll><div class="progress" aria-hidden="true"><span class="on"></span><span class="on"></span><span></span></div>
    <div class="row between" style="align-items:flex-end"><h1 class="title t30">Been here?</h1><p class="h-18" style="font-weight:800">${q.i + 1}<span class="muted"> / ${q.picks.length}</span></p></div>
    <div class="deck"><div class="behind" aria-hidden="true"></div><article class="card r18 sh-5">${photo(p, 'height:200px;border-radius:12px', '', false)}
      <div class="row gap-8"><h2 class="h-24">${esc(p.name)}</h2>${tagPill(p)}</div><p class="meta">${meta([p.area, price(p)])}</p>
      <p class="row gap-8 meta" style="color:var(--ink);font-weight:600">${pick.reviewers.length ? `${avStack(pick.reviewers, 22, -6)}Popular with people you know` : 'Popular in Columbus'}</p></article></div>
    <div class="stack gap-10"><div class="row gap-8">${[['loved', 'Loved it'], ['fine', 'It was fine'], ['not', 'Not for me']].map(([v, l], i) => `<button class="btn lg ${i === 0 ? 'primary' : ''}" style="font-size:15px" data-action="quick" data-value="${v}">${l}</button>`).join('')}</div>
      <div class="row gap-8"><button class="btn dashed sm-text" data-action="quick" data-value="never">Never been</button><button class="btn dashed sm-text" data-action="quick" data-value="want">${I.bookmark(false)}Want to try</button></div></div>
    <p class="meta center" style="margin-top:auto">Quick picks become rough ratings you can fine-tune later. Friends see your ratings and Want to try list. <button class="link" style="font-size:13px" data-action="quick-skip">Skip to friends</button></p></main>`;
}

/* 18 · Rate the night */
function rateScreen(p) {
  const list = stops(p.option), st = ui.nights[p.id] || (ui.nights[p.id] = {}), next = new Date(`${p.option.date}T12:00:00`); next.setDate(next.getDate() + 1);
  const dayAfter = next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  const mine = Object.fromEntries(p.nightRatings.filter(r => isMe(r.author)).map(r => [r.placeId, r.rating]));
  const card = (s, i) => {
    const val = st[s.place.id] ?? mine[s.place.id], others = p.nightRatings.filter(r => r.placeId === s.place.id && !isMe(r.author));
    const head = `<div class="row between gap-10"><div><p class="meta-12">${t12(s.time, false)} · ${esc(group(s.place) === 'Eat & Drink' ? typeTag(s.place)[0] : group(s.place))}</p><h2 class="body-15 strong" style="font-size:17px;line-height:22px">${esc(s.place.name)}</h2></div><span id="night-bubble-${i}">${score(val ?? null, '', 'Your rating')}</span></div>`;
    const control = val == null ? `<div class="row gap-8">${[['9', 'Loved it'], ['7', 'It was fine'], ['4.5', 'Not for me']].map(([v, l]) => `<button class="btn h40" data-action="night-quick" data-id="${esc(p.id)}" data-place="${esc(s.place.id)}" data-value="${v}">${l}</button>`).join('')}</div>`
      : `${slider(`night-${i}`, val, `Your rating for ${s.place.name}`, `night-bubble-${i}`).replace('data-slider', `data-slider data-night="${esc(p.id)}" data-place="${esc(s.place.id)}"`)}`;
    return `<article class="card pad ${i === 0 ? 'sh-4' : ''} col gap-10">${head}${control}${others.map(r => `<p class="row gap-8" style="font-size:13px;line-height:18px">${av(r.author, 22)}${first(r.author)} gave it ${r.rating.toFixed(1)} <span class="quote q-19">“${esc(r.quote.length > 40 ? r.quote.slice(0, 38) + '…' : r.quote)}”</span></p>`).join('')}</article>`;
  };
  const saves = p.stopSaves[list[0].place.id] || 0;
  return `${titlebar(`How was ${esc(p.title)}?`, { close: true, size: 't30' }).replace('<h1', `<p class="eyebrow">${dayAfter} · The morning after</p><h1`)}
  <main class="content pad-flush" data-scroll>${list.map(card).join('')}
    <section class="stack gap-8"><label for="night-note" class="field-label s18">The night in one line</label><textarea id="night-note" class="textarea hand" style="height:70px;padding:8px 14px" maxlength="300" placeholder="Patio, then laughing till midnight.">${esc(drafts['night-note'] || '')}</textarea></section>
    <section class="note-box">${I.loop}<p><span class="strong">Your ratings make the next plan better.</span> ${saves ? `${saves} friend${saves > 1 ? 's have' : ' has'} ${esc(list[0].place.name)} on their Want to try list.` : 'They show up in your friends’ feeds and picks.'}</p></section><div style="height:6px"></div></main>
  <footer class="footbar col"><button class="btn primary lg" data-action="post-night" data-id="${esc(p.id)}">Post to friends</button></footer>`;
}

/* Facts */
function factsScreen(r) {
  const facts = r.planId ? findPlan(r.planId)?.facts : r.data;
  return `${titlebar('Venue details', { size: 't30' })}<main class="content" data-scroll>${!facts ? `<div class="thinking"><i></i><i></i><i></i><span>Checking hours, prices and menu options…</span></div>`
    : `${sticker(facts.status === 'sourced' ? 'Sources found' : 'Not verified', facts.status === 'sourced' ? 'green static' : 'yellow static', -2)}<p class="facts-summary">${esc(facts.summary || 'No live details yet.')}</p>${facts.checkedAt ? `<p class="meta">Checked ${new Date(facts.checkedAt).toLocaleTimeString()}</p>` : ''}
    <div class="source-list">${(facts.sources || []).map(s => `<a class="link" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</div>${facts.searchSuggestions ? `<iframe class="search-suggestions" title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(facts.searchSuggestions)}"></iframe>` : ''}`}</main>`;
}

/* Login */
async function loginScreen() {
  const accounts = await api('/accounts');
  $('#app').innerHTML = `<main class="login"><div class="progress" aria-hidden="true"><span class="on"></span><span class="on"></span><span class="on"></span></div><div class="row gap-12">${ball(66)}<div><p class="wordmark" style="font-size:44px;line-height:46px">Disco</p><p class="eyebrow muted" style="letter-spacing:.08em;margin-top:6px">Stress less, party more</p></div></div>
    <h1 class="title t30">Your friends’ picks, turned into plans.</h1><p class="body-15 muted">Ask for anything your friends vouch for. Pick your people, and your agents work out the rest.</p>
    <form id="login-form" class="card r16 pad-16 sh-4 form"><fieldset style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">Who are you?</legend><div class="toggle-row">${accounts.map((u, i) => `<label><input type="radio" name="username" value="${esc(u.id)}" ${(slot === u.id || (!MAIN_IDS.includes(slot) && i === 0)) ? 'checked' : ''}><span>${av(u, 28)}${esc(u.name)}</span></label>`).join('')}</div></fieldset>
      <label class="lbl">Password<input class="input" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label><button class="btn primary lg" type="submit">Let’s go</button></form>
    <p class="meta center">Prepared demo accounts · Password: <strong>disco2026</strong> unless your team changed it.</p></main>`;
}

/* ---------- Render ---------- */
function render() {
  if (!S) return;
  const r = cur(), key = routeKey(r), prev = $('[data-scroll]');
  if (prev && lastKey) scrolls[lastKey] = prev.scrollTop;
  const active = document.activeElement, focusId = active?.id && active !== document.body ? active.id : null;
  const selection = focusId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  let html; try { html = screen(r); } catch (error) { console.error(error); html = `${titlebar('Something went wrong')}<main class="content"><p class="body-15">${esc(error.message)}</p></main>`; }
  $('#app').innerHTML = `<div class="app-shell">${html.includes('class="screen') ? html : `<div class="screen">${html}</div>`}</div>`;
  const main = $('[data-scroll]');
  if (main) {
    const grew = r.name === 'chat' && (S.chat.length !== lastChatLen || pending);
    main.scrollTop = grew ? main.scrollHeight : scrolls[key] || 0;
    if (r.name === 'chat') lastChatLen = S.chat.length;
  }
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus({ preventScroll: true }); if (selection) try { el.setSelectionRange(...selection); } catch { /* Not a text field. */ } } }
  else if (key !== lastKey && lastKey) { const h = $('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  lastKey = key;
}

/* ---------- Actions ---------- */
async function sendChat(text, planId) {
  pending = true; render();
  try { await api('/chat', { text, planId }); delete drafts.message; await refresh(); } finally { pending = false; render(); }
}
async function createPlan(body) { const { planId } = await api('/plans', body); await refresh(); replaceOrGo('working', { id: planId }); }
function replaceOrGo(name, params) { if (['newplan', 'change'].includes(cur().name)) replace(name, params); else go(name, params); }
async function finishQuick() {
  const answers = ui.quick?.answers || []; ui.quick = null;
  await api('/onboard', { answers }); await refresh(); stack = [{ name: 'chat' }, { name: 'addfriends', onboarding: true }]; render();
  const rated = answers.filter(a => ['loved', 'fine', 'not'].includes(a.answer)).length;
  if (rated) toast(`${rated} rough rating${rated > 1 ? 's' : ''} saved. Fine-tune them anytime.`);
}
function updateSlider(input) {
  const v = Number(input.value), box = input.closest('.slider'), bubble = document.getElementById(input.dataset.bubble);
  box.style.setProperty('--c', scoreColor(v)); box.querySelector('.fill').style.width = `calc(${v * 10}% + 12px)`; box.querySelector('.thumb').style.left = `${v * 10}%`;
  const target = bubble?.classList.contains('score') ? bubble : bubble?.querySelector('.score');
  if (target) { target.textContent = v.toFixed(1); target.className = target.className.replace(/\b(hi|mid|lo|empty)\b/g, '').trim() + ' ' + scoreCls(v); }
  if (input.id === 'rating') { const p = cur().data; if (p) ui.logs[p.id].rating = v; }
  if (input.dataset.night) (ui.nights[input.dataset.night] ||= {})[input.dataset.place] = v;
}

document.addEventListener('click', async event => {
  const el = event.target.closest('[data-action]'); if (!el) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') event.preventDefault();
  const action = el.dataset.action, id = el.dataset.id;
  if (parent !== window && S) parent.postMessage({ kind: 'disco-active', user: S.me.id }, location.origin);
  if (action !== 'cat-toggle' && action !== 'cat') ui.catOpen = false;
  try {
    switch (action) {
      case 'tab': tab(el.dataset.view); break;
      case 'back': back(); break;
      case 'prompt': tab('chat'); await sendChat(el.dataset.text); break;
      case 'place': go('place', { id }); break;
      case 'log': go('log', { id, rating: el.dataset.rating ? Number(el.dataset.rating) : undefined }); break;
      case 'catalog': if (el.dataset.replace) replace('catalog', { purpose: 'review', fromLog: true }); else go('catalog', { purpose: el.dataset.purpose || 'review' }); break;
      case 'catalog-pick': if (cur().purpose === 'review') replace('log', { id }); else go('place', { id }); break;
      case 'additem': go('additem'); break;
      case 'filter': ui.filter = el.dataset.value; render(); break;
      case 'ptab': ui.ptab = el.dataset.value; render(); break;
      case 'cat-toggle': ui.catOpen = !ui.catOpen; render(); break;
      case 'cat': ui.pcat = el.dataset.value; ui.catOpen = false; render(); break;
      case 'comments': ui.comments.has(id) ? ui.comments.delete(id) : ui.comments.add(id); render(); break;
      case 'like': await api('/like', { reviewId: id }); await refresh(); break;
      case 'save': { const result = await api('/save', { placeId: id }); toast(result.saved ? 'Added to Want to try. Your friends can see it.' : 'Removed from Want to try.'); await refresh(); if (cur().name === 'place') { cur().data = await api('/place?id=' + encodeURIComponent(id)); render(); } break; }
      case 'tag': { const set = ui.logs[id].tags; set.has(el.dataset.value) ? set.delete(el.dataset.value) : set.add(el.dataset.value); render(); break; }
      case 'newtag': ui.newTag = true; render(); $('#newtag')?.focus(); break;
      case 'post-review': {
        const st = ui.logs[id], quote = String(drafts.note || '').trim(); if (quote.length < 3) { toast('Add a short note for friends first.'); $('#note')?.focus(); break; }
        el.disabled = true; await api('/reviews', { placeId: id, rating: st.rating, quote, tags: [...st.tags].map(t => t.toLowerCase()) });
        delete drafts.note; delete ui.logs[id]; await refresh(); back(); toast('Posted. Your friends’ picks just updated.'); break;
      }
      case 'friends': go('friends'); break;
      case 'addfriends': go('addfriends'); break;
      case 'settings': go('settings'); break;
      case 'newplan': { const draft = S.chat.find(m => m.id === el.dataset.draft)?.draft; go('newplan', { draft, placeId: el.dataset.place }); break; }
      case 'plan-friend': go('newplan', { friends: [id] }); break;
      case 'plan': openPlan(id); break;
      case 'working': case 'details': case 'invite': case 'changed': case 'change': case 'rate': go(action, { id }); break;
      case 'approve-open': go(findPlan(id)?.hasPendingChange ? 'changed' : 'approve', { id }); break;
      case 'approve': { el.disabled = true; const revised = findPlan(id)?.hasPendingChange; await api('/plans/approve', { planId: id, revision: Number(el.dataset.revision) }); await refresh(); replace('details', { id }); toast(revised ? 'Update sent. Anyone already in gets a quick reconfirm.' : 'Invites sent. Each friend hears from their own agent.'); break; }
      case 'another': el.disabled = true; await api('/plans/revise', { planId: id, another: true }); await refresh(); replace('working', { id }); break;
      case 'drop': el.disabled = true; await api('/plans/drop', { planId: id, userId: el.dataset.user }); await refresh(); replace('details', { id }); toast('Kept the original plan.'); break;
      case 'rsvp-in': case 'rsvp-out': el.disabled = true; await api('/plans/rsvp', { planId: id, response: action === 'rsvp-in' ? 'in' : 'out' }); await refresh(); replace('details', { id }); toast(action === 'rsvp-in' ? 'You’re in.' : 'Got it. Only “can’t make it” was shared.'); break;
      case 'cancel': await api('/plans/cancel', { planId: id }); await refresh(); replace('details', { id }); break;
      case 'book': await api('/plans/book', { planId: id }); await refresh(); toast('Demo confirmation created. No real reservation was made.'); break;
      case 'calendar': { const response = await fetch('/api/calendar?id=' + id, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Confirm the plan first.'); const href = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = href; a.download = 'disco-plan.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(href), 2000); break; }
      case 'facts': go('facts', { placeId: id }); break;
      case 'plan-facts': go('facts', { planId: id }); break;
      case 'memory-save': case 'memory-skip': await api('/memory', { action: action === 'memory-save' ? 'save' : 'skip', pendingId: S.me.pendingMemory.id }); await refresh(); break;
      case 'forget': await api('/memory', { action: 'forget', memoryId: id }); await refresh(); break;
      case 'clear-temporary': await api('/temporary/clear', {}); await refresh(); toast('Cleared.'); break;
      case 'match-plan': {
        const m = S.matches.find(x => x.place.id === id), friends = m.friends.filter(f => MAIN_IDS.includes(f.id)).map(f => f.id); el.disabled = true;
        await createPlan({ title: `${m.place.name} with ${names(m.friends.filter(f => friends.includes(f.id)).map(f => f.name.split(' ')[0]))}`, friends, placeId: group(m.place) === 'Eat & Drink' ? id : undefined, date: m.window?.date || S.defaultDate, time: m.window?.time || '19:00', allowance: 24, query: m.place.name });
        break;
      }
      case 'match-dismiss': await api('/matches/dismiss', { placeId: id }); await refresh(); toast('Hidden for two weeks.'); break;
      case 'friend-add': { const result = await api('/friends', { userId: id }); await refresh(); toast(result.message); break; }
      case 'friend-accept': case 'friend-decline': { const result = await api('/friends', { userId: id, accept: action === 'friend-accept', decline: action === 'friend-decline' }); await refresh(); toast(result.message); break; }
      case 'share-link': { const link = el.dataset.link; try { if (navigator.share) await navigator.share({ title: 'Join me on Disco', url: link }); else { await navigator.clipboard.writeText(link); toast('Invite link copied.'); } } catch { toast(link); } break; }
      case 'toggle-qr': ui.qr = !ui.qr; render(); break;
      case 'import': ui.imports[el.dataset.value] = !ui.imports[el.dataset.value]; render(); break;
      case 'quickrate': go('quickrate'); break;
      case 'welcome-skip': await api('/onboard', { answers: [] }); await refresh(); break;
      case 'quick': { const q = ui.quick; q.answers.push({ placeId: q.picks[q.i].place.id, answer: el.dataset.value }); q.i++; if (q.i >= q.picks.length) await finishQuick(); else render(); break; }
      case 'quick-skip': await finishQuick(); break;
      case 'finish-onboarding': tab('chat'); break;
      case 'night-quick': (ui.nights[id] ||= {})[el.dataset.place] = Number(el.dataset.value); render(); break;
      case 'post-night': {
        const st = ui.nights[id] || {}, list = Object.entries(st).map(([placeId, rating]) => ({ placeId, rating }));
        if (!list.length) { toast('Rate at least one stop first.'); break; }
        el.disabled = true; await api('/plans/rate', { planId: id, stops: list, note: drafts['night-note'] || '' }); delete drafts['night-note']; delete ui.nights[id]; await refresh(); back(); toast('Posted. Your friends will see it in their feed.'); break;
      }
      case 'logout': await api('/logout', {}); logoutLocal(); break;
    }
  } catch (error) { toast(error.message); if (el.isConnected) el.disabled = false; }
});

document.addEventListener('submit', async event => {
  const form = event.target; event.preventDefault(); const data = new FormData(form), submit = form.querySelector('button:not([type="button"])');
  if (submit) submit.disabled = true;
  try {
    if (form.id === 'login-form') await login(data.get('username'), data.get('password'));
    if (form.id === 'chat-form') { const text = String(drafts.message || '').trim(); if (text && !pending) await sendChat(text); }
    if (form.dataset.form === 'comment') { const key = 'c-' + form.dataset.id, text = String(drafts[key] || '').trim(); if (text) { await api('/comment', { reviewId: form.dataset.id, text }); delete drafts[key]; await refresh(); } }
    if (form.dataset.form === 'tag') { const t = cap(String(drafts.newtag || '').trim()); if (t) ui.logs[form.dataset.id].tags.add(t); delete drafts.newtag; ui.newTag = false; render(); }
    if (form.dataset.form === 'tell') {
      const text = String(drafts.tell || '').trim(); if (!text) { toast('Tell your agent what changed.'); return; }
      await api('/chat', { text, planId: form.dataset.id }); delete drafts.tell; await refresh(); replace('details', { id: form.dataset.id }); toast('Sent to your agent. The host only sees the new proposal.');
    }
    if (form.id === 'plan-form') {
      const r = cur(), friends = data.getAll('friends'); if (!friends.length) { toast('Pick at least one friend.'); return; }
      await createPlan({ title: data.get('title'), date: data.get('date'), time: data.get('time'), allowance: Number(data.get('allowance')), friends, placeId: r.placeId, activityId: data.get('activityId') || undefined, query: r.draft?.query || 'restaurants' });
    }
    if (form.id === 'tweak-form') { const id = form.dataset.id; await api('/plans/revise', { planId: id, option: { ...Object.fromEntries(data), allowance: Number(data.get('allowance')) } }); await refresh(); replace('working', { id }); }
    if (form.id === 'settings-form') { await api('/settings', { ...Object.fromEntries(data), budget: Number(data.get('budget')), days: data.getAll('days') }); await refresh(); back(); toast('Private settings saved.'); }
    if (form.id === 'item-form') { const place = await api('/items', Object.fromEntries(data)); replace('log', { id: place.id }); }
  } catch (error) { toast(error.message); } finally { if (submit?.isConnected) submit.disabled = false; }
});

document.addEventListener('input', event => {
  const el = event.target;
  if (el.matches('[data-slider]')) { updateSlider(el); return; }
  if (el.id && ['INPUT', 'TEXTAREA'].includes(el.tagName) && el.type !== 'checkbox' && el.type !== 'radio') drafts[el.id] = el.value;
  if (el.id === 'friend-q' || el.id === 'people-q') render();
  if (el.id === 'catalog-q') { clearTimeout(searchTimer); searchTimer = setTimeout(async () => { const r = cur(); if (r.name !== 'catalog') return; try { r.data = await api('/catalog?q=' + encodeURIComponent(el.value)); render(); } catch (error) { toast(error.message); } }, 250); }
});
document.addEventListener('change', event => { if (event.target.matches('[data-slider][data-night]')) updateSlider(event.target); });
document.addEventListener('toggle', event => { const d = event.target; if (d.matches?.('details[data-key]')) d.open ? ui.open.add(d.dataset.key) : ui.open.delete(d.dataset.key); }, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (ui.catOpen) { ui.catOpen = false; render(); } else if (S && stack.length > 1 && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) back(); }
});
window.addEventListener('message', async event => {
  if (event.origin !== location.origin || event.source !== parent || parent === window) return;
  if (event.data.kind === 'disco-login' && MAIN_IDS.includes(slot) && !token) { try { await login(slot, event.data.password); } catch (error) { toast(error.message); } }
});
if (token) { await refresh(); if (S) { live(); if (parent !== window) parent.postMessage({ kind: 'disco-ready', user: S.me.id }, location.origin); } } else await loginScreen();
