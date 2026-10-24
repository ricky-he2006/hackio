const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slot = new URLSearchParams(location.search).get('slot') || 'single';
const tokenKey = `disco-session-${slot}`;
let token = sessionStorage.getItem(tokenKey), S, view = 'chat', modal = null, modalKey = '', pending = false, streamController, refreshTimer;
let chatDraft = '', filter = 'All', searchTimer, returnFocus;
const icons = {
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z"/>',
  feed: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 11h8M8 15h4"/>',
  adventures: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/>',
  you: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  arrow: '<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
  send: '<path d="m12 19 0-14m-6 6 6-6 6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  save: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sparkle}</svg>`;
const avatar = (user, small = false) => `<span class="avatar ${esc(user?.color || 'purple')} ${small ? 'small' : ''}" aria-label="${esc(user?.name || '')}">${esc((user?.name || 'D').split(' ').map(s => s[0]).slice(0, 2).join(''))}</span>`;
const button = (text, action, cls = '', attrs = '') => `<button class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const prettyTime = time => { const [h, m] = (time || '00:00').split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`; };
const prettyDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const safeUrl = url => { try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? esc(u.href) : '#'; } catch { return '#'; } };
const statusText = { drafting: 'Draft', negotiating: 'Working it out', awaiting_approval: 'Needs your OK', invited: 'Invites are out', confirmed: 'Everyone’s in', booked: 'Demo booking', needs_decision: 'Your call', cancelled: 'Cancelled' };

async function api(path, data, options = {}) {
  const response = await fetch('/api' + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data), ...options });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401 && path !== '/login') logoutLocal(); throw new Error(result.error || 'Please try again.'); }
  return result;
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
async function refresh() { if (!token) return; try { S = await api('/state'); render(); } catch (error) { toast(error.message); } }
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 100); }
async function live() {
  streamController?.abort(); streamController = new AbortController(); const controller = streamController;
  while (token && !controller.signal.aborted) {
    try {
      const response = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (response.status === 401) { logoutLocal(); return; }
      if (!response.ok) throw new Error('Disconnected');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); let index; while ((index = buffer.indexOf('\n\n')) >= 0) { const chunk = buffer.slice(0, index); buffer = buffer.slice(index + 2); if (chunk.startsWith('data: ')) scheduleRefresh(); } }
    } catch { /* Reconnect without interrupting the current form. */ }
    if (!controller.signal.aborted) await new Promise(r => setTimeout(r, 2000));
  }
}
function logoutLocal() { token = null; S = null; sessionStorage.removeItem(tokenKey); streamController?.abort(); modal = null; $('#app').innerHTML = ''; loginScreen(); }
async function login(username, password) {
  const result = await api('/login', { username, password }); token = result.token; sessionStorage.setItem(tokenKey, token); $('#app').innerHTML = ''; await refresh(); live();
  if (parent !== window) parent.postMessage({ kind: 'disco-ready', user: result.user.id }, location.origin);
}

function art(category = '', variant = 0) {
  const coffee = /tea|cafe|coffee|matcha/i.test(category);
  return `<svg class="food-art" viewBox="0 0 360 190" aria-hidden="true"><defs><pattern id="grid${variant}" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1"/></pattern></defs><rect width="360" height="190" fill="${coffee ? '#dce4c6' : variant % 2 ? '#e6b995' : '#dfd6ee'}"/><rect width="360" height="190" fill="url(#grid${variant})"/><ellipse cx="180" cy="153" rx="101" ry="14" fill="#252327" opacity=".09"/>${coffee ? '<ellipse cx="176" cy="145" rx="75" ry="19" fill="#faf8ee" stroke="#514936" stroke-width="2"/><path d="M222 77h16c34 0 32 46 0 46h-15" fill="none" stroke="#faf8ee" stroke-width="15"/><path d="M117 66h116l-9 60q-5 28-49 28t-49-28Z" fill="#faf8ee" stroke="#514936" stroke-width="2"/><ellipse cx="175" cy="67" rx="58" ry="18" fill="#7d945d" stroke="#514936" stroke-width="2"/><path d="M148 66q25-17 51 0-24 16-51 0m11 0q15-10 28 0" fill="none" stroke="#e4ecd0" stroke-width="3"/><path d="M157 39q-10-13 0-25m31 25q-10-13 0-25" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' : '<ellipse cx="180" cy="102" rx="92" ry="59" fill="#faf8ee" stroke="#65574c" stroke-width="2"/><ellipse cx="180" cy="101" rx="72" ry="44" fill="#efe9d9" stroke="#c9bfa6"/><path d="m135 95 38-28 53 18-8 40-52 10-34-23Z" fill="#d49956" stroke="#a66e3d" stroke-width="2"/><path d="m148 98 24-17 35 13-9 26-33 2Z" fill="#f1ce8c"/><g fill="#708151"><ellipse cx="139" cy="118" rx="12" ry="6" transform="rotate(-35 139 118)"/><ellipse cx="215" cy="81" rx="13" ry="7" transform="rotate(35 215 81)"/><ellipse cx="198" cy="119" rx="11" ry="6"/></g><g fill="#c56c4a"><circle cx="156" cy="84" r="7"/><circle cx="214" cy="109" r="8"/><circle cx="175" cy="115" r="5"/></g><path d="M63 47v94m-7-94v25q7 9 14 0V47m-7 0v26M291 48v94m0-94q-20 23 0 39" fill="none" stroke="#5c5148" stroke-width="3" stroke-linecap="round"/>'}<path d="m306 22 3 8 9 3-9 3-3 8-3-8-9-3 9-3Z" fill="#f9f7ee"/><path d="m45 138 2 6 7 2-7 3-2 6-3-6-6-3 6-2Z" fill="#f9f7ee"/></svg>`;
}

async function loginScreen() {
  const accounts = await api('/accounts');
  $('#app').innerHTML = `<main class="login"><a class="brand" href="/">Disco<span class="spark">✳</span></a><div class="login-illustration"><div class="orbit"></div><div class="disco-ball">✳</div>${accounts.map((u, i) => `<div class="orbit-person p${i}">${avatar(u)}</div>`).join('')}</div><p class="eyebrow">YOUR PEOPLE. YOUR PLANS.</p><h1>Good plans.<br>Better company.</h1><p class="muted">Your friends have great taste.<br>Your agent brings it all together.</p><form id="login-form" class="stack"><label>Your account<select name="username">${accounts.map(u => `<option value="${u.id}" ${slot === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label><button class="btn primary wide" type="submit">Let’s get together ${icon('arrow')}</button><p class="tiny muted">Prepared demo accounts · Password: <strong>disco2026</strong><br>Use your team’s password if it was changed.</p></form><p class="login-foot">Stress less, party more.</p></main>`;
}
function shell() {
  $('#app').innerHTML = `<div class="app-shell"><header id="topbar"></header><main id="main"></main><div id="composer"></div><nav id="nav" aria-label="Main navigation"></nav></div><div id="modal-root"></div>`;
}
function render() {
  if (!S) return;
  if (!$('#main')) shell();
  const scroll = $('#main').scrollTop;
  $('#topbar').innerHTML = `<button class="brand brand-button" data-action="nav" data-view="chat">Disco<span class="spark">✳</span></button><div class="header-right"><span class="live-dot" title="Live updates connected"></span><button class="avatar-button" data-action="nav" data-view="you" aria-label="Your profile">${avatar(S.me, true)}</button></div>`;
  $('#nav').innerHTML = ['chat', 'feed', 'adventures', 'you'].map(v => `<button class="nav-item ${view === v ? 'active' : ''}" data-action="nav" data-view="${v}" ${view === v ? 'aria-current="page"' : ''}>${icon(v)}<span>${v === 'you' ? 'You' : v[0].toUpperCase() + v.slice(1)}</span>${v === 'adventures' && S.plans.some(p => p.state === 'invited' && p.myRsvp !== 'in' || p.isHost && p.state === 'awaiting_approval') ? '<i class="notification-dot"></i>' : ''}</button>`).join('');
  $('#main').innerHTML = view === 'chat' ? chatView() : view === 'feed' ? feedView() : view === 'adventures' ? adventuresView() : profileView();
  if (view === 'adventures' && S.matches?.length) $('#main .page-title').insertAdjacentHTML('afterend', sharedMatches());
  if (view === 'feed') $('#main .filter-row')?.insertAdjacentHTML('beforeend', button('Movies & TV', 'filter', 'chip ' + (filter === 'Movies & TV' ? 'active' : ''), 'data-filter="Movies & TV"'));
  $('#main').scrollTop = scroll;
  if (view === 'chat') {
    if (!$('#chat-form')) $('#composer').innerHTML = `<form id="chat-form" class="composer"><label class="sr-only" for="message">Message your agent</label><textarea id="message" name="message" rows="1" placeholder="Ask your agent anything…" maxlength="2000">${esc(chatDraft)}</textarea><button class="send-button" type="submit" aria-label="Send message">${icon('send')}</button></form><div class="privacy-line">${icon('lock')} Your agent, your private space <span>• ${S.provider.provider === 'local' ? 'Local demo' : esc(S.provider.provider)}</span></div>`;
    $('#chat-form button').disabled = pending;
  } else $('#composer').innerHTML = '';
  drawModal();
}

function recCard(rec, index = 0, compact = false) {
  const isVenue = !['Music', 'Movies & TV', 'Books', 'Products'].includes(rec.place.category);
  const canPlan = /food|restaurant|cafe|tea|bar|pizza|brunch|coffee|bakery/i.test(rec.place.category);
  const hours = rec.facts?.open === true ? 'Open at checked time' : rec.facts?.open === false ? 'Closed at checked time' : 'Hours unverified';
  return `<article class="pick-card ${compact ? 'compact' : ''}">
    <button class="art-button" data-action="place" data-id="${esc(rec.place.id)}" aria-label="View ${esc(rec.place.name)}">
      ${art(rec.place.category + ' ' + rec.place.name, index)}<span class="image-badge">${icon('users')} Vouched ×${rec.votes}</span>
    </button>
    <div class="pick-body">
      <div class="row"><div><p class="eyebrow">${esc(rec.place.category)}${rec.place.area ? ' · ' + esc(rec.place.area) : ''}</p><button class="text-button place-name" data-action="place" data-id="${esc(rec.place.id)}">${esc(rec.place.name)}</button></div><span class="score">${rec.score.toFixed(1)}</span></div>
      ${rec.reviews[0] ? `<blockquote>“${esc(rec.reviews[0].quote)}”</blockquote><div class="row small-gap"><div class="avatar-stack">${rec.reviews.map(r => avatar(r.author, true)).join('')}</div><span class="tiny">${esc(rec.reason)}</span></div>` : ''}
      ${rec.change ? `<p class="ranking-change">${icon('sparkle')} ${esc(rec.change)}</p>` : ''}
      ${isVenue ? `<div class="card-facts"><span>${icon('pin')} ${rec.place.distance != null ? `${(rec.place.distance * .621371).toFixed(1)} mi from OSU` : esc(rec.place.area)}</span><span>${icon('clock')} ${hours}</span></div>` : ''}
      ${rec.facts ? `<p class="tiny muted mt">Checked for ${esc(prettyDate(rec.facts.date))}, ${esc(prettyTime(rec.facts.time))} · ${rec.facts.sources?.length || 0} sources</p>` : ''}
      ${rec.unmatched.length ? `<p class="unmatched">${esc(rec.unmatched.join(' · '))}</p>` : ''}
      <div class="row card-actions">${canPlan ? button('Plan this ' + icon('arrow'), 'new-plan', 'primary small-btn', `data-place="${esc(rec.place.id)}"`) : button('See opinions ' + icon('arrow'), 'place', 'primary small-btn', `data-id="${esc(rec.place.id)}"`)}${button(icon('save'), 'save', 'icon-button ' + (rec.saved ? 'selected' : ''), `data-id="${esc(rec.place.id)}" aria-label="${rec.saved ? 'Remove from' : 'Add to'} want to try"`)}</div>
    </div></article>`;
}
function sharedMatches() {
  return S.matches.map(m => `<div class="match-card"><span class="eyebrow">IT’S A MATCH</span><h3>${esc(m.place.name)}</h3><p>You and ${m.friends.map(u => esc(u.name)).join(', ')} want to try this.</p>${button('Make it a plan ' + icon('arrow'), 'match-plan', 'primary small-btn', `data-id="${esc(m.place.id)}"`)}</div>`).join('');
}
function chatView() {
  const pendingPlan = S.plans.find(p => p.state !== 'cancelled' && p.state !== 'booked');
  return `<div class="page chat-page">${!S.me.onboarded ? `<div class="welcome-note"><div class="row"><strong>An agent that grows with you.</strong>${button(icon('close'), 'onboard', 'icon-button tiny-button', 'aria-label="Dismiss introduction"')}</div><p>Tell me your taste and constraints. I’ll ask before saving a long-term memory. Ask what I remember—or tell me to forget—anytime.</p></div>` : ''}${S.chat.length === 0 ? `<div class="greeting"><p class="eyebrow">A LITTLE LESS “WHAT’S THE PLAN?”</p><h1>Hey ${esc(S.me.name)}.<br>Let’s make <span>something happen.</span></h1><p class="muted">Good taste runs in your friend group.</p></div><div class="prompt-grid">${button('Find a dinner spot ' + icon('arrow'), 'prompt', 'prompt', 'data-text="Find restaurants my friends love"')}${button('Round up my crew ' + icon('users'), 'new-plan', 'prompt lavender')}</div><div class="section-heading"><h2>Your circle’s good taste</h2><span class="tiny muted">Columbus, OH</span></div>${S.recommendations.map((r, i) => recCard(r, i, i > 0)).join('')}${!S.recommendations.length ? empty('The good stuff starts with you.', 'Log a restaurant opinion to get started.') : ''}` : `<div class="conversation">${S.chat.map(messageView).join('')}${pending ? `<div class="agent-message"><span class="agent-mark">✳</span><div class="thinking"><i></i><i></i><i></i><span>Working on it…</span></div></div>` : ''}</div>`}${pendingPlan && S.chat.length === 0 ? planCard(pendingPlan) : ''}<p class="data-note">Seeded opinions are fictional demo data. Venue artwork is illustrative.</p></div>`;
}
function messageView(m) {
  if (m.role === 'user') return `<div class="user-message">${esc(m.text)}</div>`;
  let attachment = '';
  if (m.kind === 'plan') { const p = S.plans.find(p => p.id === m.planId); if (p) attachment = planCard(p); }
  if (m.kind === 'recommendations') attachment = (m.picks || S.recommendations).map((r, i) => recCard(r, i, i > 0)).join('');
  if (m.kind === 'planDraft') attachment = button('Choose friends & start ' + icon('arrow'), 'new-plan', 'primary', `data-draft="${esc(m.id)}"`);
  if (m.kind === 'memoryPrompt' && S.me.pendingMemory?.id === m.pendingId) attachment = `<div class="memory-card"><span class="eyebrow">YOUR CALL, ALWAYS</span><div class="row">${button('Save to memory', 'memory-save', 'primary small-btn')}${button('Just this time', 'memory-skip', 'small-btn')}</div></div>`;
  if (m.kind === 'memories') attachment = S.me.private.memories.map(mem => `<div class="memory-item"><p>${esc(mem.text)}</p>${button('Forget', 'forget', 'small-btn', `data-id="${mem.id}"`)}</div>`).join('');
  return `<div class="agent-message"><span class="agent-mark">✳</span><div class="agent-content"><p>${esc(m.text)}</p>${attachment}</div></div>`;
}
function categoryMatch(p, category) { const c = (p?.category || '').toLowerCase(); return category === 'All' || category === 'Eat & drink' && /food|restaurant|bar|cafe|coffee|brunch|bakery|pizza|tea/.test(c) || category === 'Places' && !/music|movie|book|product/.test(c) || c.includes(category.toLowerCase()); }
function feedView() {
  const reviews = S.feed.filter(r => categoryMatch(r.place, filter));
  return `<div class="page"><div class="page-title"><div><p class="eyebrow">GOOD TASTE IS CONTAGIOUS</p><h1>In your circle</h1></div>${button(icon('users'), 'friends', 'icon-button', 'aria-label="Friends"')}</div><div class="filter-row">${['All', 'Eat & drink', 'Places', 'Music', 'Books', 'Products'].map(f => button(esc(f), 'filter', 'chip ' + (f === filter ? 'active' : ''), `data-filter="${f}"`)).join('')}</div>${button(icon('plus') + ' Log something you loved', 'catalog', 'wide dashed', 'data-purpose="review"')}<div class="feed-list">${reviews.map(r => `<article class="feed-card"><div class="row"><div class="row small-gap">${avatar(r.author, true)}<div><strong>${esc(r.author.name)}</strong><p class="tiny muted">${r.synthetic ? 'Seeded demo opinion' : 'Shared an opinion'}</p></div></div><span class="score small-score">${r.rating.toFixed(1)}</span></div><button class="text-button feed-place" data-action="place" data-id="${esc(r.placeId)}">${esc(r.place?.name)}</button><p class="eyebrow">${esc(r.place?.category)} · ${esc(r.place?.area)}</p><blockquote>“${esc(r.quote)}”</blockquote><div class="tag-row">${r.tags.filter(t => !['positive', 'mixed', 'negative'].includes(t)).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="row feed-actions">${button(icon('heart') + ` ${r.likes.length || ''}`, 'like', 'icon-button ' + (r.likes.includes(S.me.id) ? 'selected' : ''), `data-id="${r.id}" aria-label="Like opinion"`)}${button(icon('save') + ' Want to try', 'save', 'text-button', `data-id="${esc(r.placeId)}"`)}</div></article>`).join('') || empty('Nothing here yet.', 'Add the first opinion in this category.')}<p class="data-note">Fictional seeded opinions are labeled. New opinions update rankings live.</p></div></div>`;
}
function planCard(p) {
  return `<button class="plan-card" data-action="plan" data-id="${p.id}"><div class="plan-date"><span>${new Date(p.option.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}</span><strong>${new Date(p.option.date + 'T12:00:00').getDate()}</strong></div><div class="plan-card-body"><span class="status ${p.state}">${statusText[p.state]}</span><h3>${esc(p.title)}</h3><p>${esc(p.option.place.name)} · ${prettyTime(p.option.time)}</p><div class="avatar-stack">${p.participants.map(u => avatar(u, true)).join('')}</div></div>${icon('arrow')}</button>`;
}
function adventuresView() {
  return `<div class="page"><div class="page-title"><div><p class="eyebrow">LESS PLANNING, MORE LIVING</p><h1>Adventures</h1></div>${button(icon('plus'), 'new-plan', 'icon-button primary', 'aria-label="New plan"')}</div>${S.plans.length ? `<p class="section-label">YOUR PLANS</p>${S.plans.map(planCard).join('')}` : `<div class="empty-art">✳</div>${empty('The group chat could never.', 'Pick your people. Let your agents handle the back-and-forth.')}${button('Start an adventure ' + icon('arrow'), 'new-plan', 'primary wide')}`}<div class="callout"><span class="agent-mark">✳</span><div><strong>You make the social decisions.</strong><p>Your agent handles the logistics. Every plan and change comes back for approval.</p></div></div></div>`;
}
function profileView() {
  return `<div class="page"><div class="profile-hero">${avatar(S.me)}<h1>${esc(S.me.name)}</h1><p>${esc(S.me.area)} · Your kind of good time</p><div class="profile-stats"><div><strong>${S.myReviews.length}</strong><span>Reviewed</span></div><div><strong>${S.me.saved.length}</strong><span>Want to try</span></div><button data-action="friends"><strong>${S.friends.length}</strong><span>Friends</span></button><div><strong>${S.plans.length}</strong><span>Adventures</span></div></div></div><div class="section-heading"><h2>Just between us</h2>${icon('lock')}</div><p class="muted small-text">Only you and your agent can read these settings.</p><div class="settings-summary"><div><span>Usual budget</span><strong>$${S.me.private.budget}</strong></div><div><span>Available</span><strong>${prettyTime(S.me.private.start)}–${prettyTime(S.me.private.end)}</strong></div><div><span>Food preferences</span><strong>${esc(S.me.private.dietary || 'Not set')}</strong></div></div>${button('Edit private preferences', 'settings', 'wide')}<button class="memory-link" data-action="prompt" data-text="What do you remember about me?">${icon('sparkle')} What does my agent remember? ${icon('arrow')}</button>${Object.keys(S.me.temporary).length ? `<div class="callout"><div><strong>Current conversation preferences are active.</strong><p>These are separate from your saved settings.</p>${button('Clear temporary preferences', 'clear-temporary', 'small-btn')}</div></div>` : ''}<div class="section-heading"><h2>Want to try</h2><span class="tiny muted">${S.savedPlaces.length} saved</span></div>${S.savedPlaces.map(p => `<button class="list-item" data-action="place" data-id="${esc(p.id)}"><span class="mini-art">${icon('pin')}</span><div><strong>${esc(p.name)}</strong><p>${esc(p.category)}</p></div>${icon('arrow')}</button>`).join('') || '<p class="muted small-text">Save a friend’s pick and it’ll be right here.</p>'}<div class="section-heading"><h2>Your opinions</h2>${button(icon('plus'), 'catalog', 'icon-button', 'data-purpose="review" aria-label="Add opinion"')}</div>${S.myReviews.map(r => `<button class="list-item" data-action="review" data-id="${esc(r.placeId)}"><div><strong>${esc(r.place?.name)}</strong><p>${esc(r.quote)}</p></div><span class="score small-score">${r.rating.toFixed(1)}</span></button>`).join('')}<div class="profile-footer"><span class="tiny muted">${esc(S.provider.provider)} agent · Seeded demo network</span>${button('Log out', 'logout', 'text-button')}</div></div>`;
}
function empty(title, text) { return `<div class="empty"><h2>${title}</h2><p>${text}</p></div>`; }
function openModal(next) { if (!modal) returnFocus = document.activeElement; modal = next; modalKey = ''; drawModal(); }
function closeModal() { modal = null; modalKey = ''; if ($('#modal-root')) $('#modal-root').innerHTML = ''; if (returnFocus?.isConnected) returnFocus.focus(); }
function modalFrame(title, body, cls = '') { return `<div class="modal-backdrop"><section class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-header"><h2>${esc(title)}</h2>${button(icon('close'), 'close', 'icon-button', 'aria-label="Close dialog"')}</header><div class="modal-content">${body}</div></section></div>`; }
function drawModal() {
  if (!modal) { $('#modal-root').innerHTML = ''; modalKey = ''; return; }
  const key = `${modal.type}:${modal.id || ''}`;
  if (modalKey === key && !['plan'].includes(modal.type)) return;
  const sameModal = modalKey === key;
  const scroll = sameModal ? $('.modal-content')?.scrollTop || 0 : 0;
  const openDetails = sameModal ? [...document.querySelectorAll('.modal-content details[open]')].map(d => d.className) : [];
  modalKey = key;
  let content = '';
  if (modal.type === 'plan') { const p = S.plans.find(p => p.id === modal.id); content = p ? modalFrame('Your adventure', planDetail(p)) : modalFrame('Adventure', '<p>Waiting for this plan…</p>'); }
  if (modal.type === 'new-plan') content = modalFrame('Round up your crew', planForm());
  if (modal.type === 'settings') content = modalFrame('Your private preferences', settingsForm());
  if (modal.type === 'catalog') content = modalFrame('Find something good', `<div class="search-box">${icon('search')}<input id="catalog-query" placeholder="Search restaurants, cafés, books…" aria-label="Search items" autocomplete="off"></div><div id="catalog-results"><p class="muted">Loading your places…</p></div>${button(icon('plus') + ' Add another item', 'add-item', 'wide dashed')}`);
  if (modal.type === 'review') content = modalFrame('Log it', reviewForm());
  if (modal.type === 'place') content = modalFrame(modal.place.name, placeDetail(modal.place));
  if (modal.type === 'facts') content = modalFrame('A quick fact check', factsView(modal.facts));
  if (modal.type === 'friends') content = modalFrame('Your people', friendsView());
  if (modal.type === 'change') content = modalFrame('Tell your agent', changeForm());
  if (modal.type === 'tweak') content = modalFrame('Change the proposal', tweakForm());
  if (modal.type === 'add-item') content = modalFrame('Add to your taste', `<form id="item-form" class="stack"><label>Name<input name="name" required maxlength="100" placeholder="A book, album, film, product…"></label><label>Category<select name="category">${['Music', 'Movies & TV', 'Books', 'Products', 'Places'].map(c => `<option>${c}</option>`).join('')}</select></label><button class="btn primary" type="submit">Next: your opinion ${icon('arrow')}</button></form>`);
  $('#modal-root').innerHTML = content;
  if (modal.type === 'review') $('.modal input[type="range"]')?.setAttribute('aria-label', 'Your rating');
  if (modal.type === 'plan') {
    const primary = $('.modal [data-action="approve"], .modal [data-action="rsvp-in"]');
    if (primary) { const group = primary.dataset.action === 'rsvp-in' ? primary.parentElement : primary; group.classList.add('primary-shortcut'); $('.modal .route-card')?.insertAdjacentElement('afterend', group); }
    const plan = S.plans.find(p => p.id === modal.id);
    if (plan?.myRsvp === 'reconfirm' && primary) primary.innerHTML = 'Reconfirm ' + icon('check');
    if (plan && ['invited', 'confirmed', 'booked'].includes(plan.state) && $('.modal .diff .tiny')) $('.modal .diff .tiny').textContent = 'The host approved this update.';
    if (plan?.why?.length) $('.modal .route-card')?.insertAdjacentHTML('afterend', `<div class="plan-why"><span class="eyebrow">WHY THIS ONE</span><p>“${esc(plan.why[0].quote)}”</p><span>${esc(plan.why[0].author)}${plan.why[0].synthetic ? ' · demo opinion' : ''}</span></div>`);
    if (plan?.option.activity) {
      const [hour, minute] = plan.option.time.split(':').map(Number), activityTime = `${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      $('.modal .route-card')?.insertAdjacentHTML('afterend', `<div class="route-card secondary-stop"><div class="route-marker">${icon('adventures')}</div><div><span class="eyebrow">${prettyTime(activityTime)} · NEXT STOP</span><h2>${esc(plan.option.activity.name)}</h2><p>${esc(plan.option.activity.area)}</p><p class="tiny muted">One hour planned. Verify travel time and admission costs.</p></div></div>`);
    }
    if (plan?.previous && plan.previous.activity?.id !== plan.option.activity?.id) $('.modal .plan-heading')?.insertAdjacentHTML('afterend', `<div class="diff"><strong>Second stop changed</strong><p>${esc(plan.previous.activity?.name || 'None')} → ${esc(plan.option.activity?.name || 'None')}</p></div>`);
    if (plan?.state === 'booked') $('.modal .booking')?.insertAdjacentHTML('beforeend', button('Rate the night', 'review', 'primary wide mt', `data-id="${esc(plan.option.place.id)}"`));
  }
  if (['new-plan', 'tweak'].includes(modal.type)) {
    const form = $('#plan-form') || $('#tweak-form'), current = S.plans.find(p => p.id === modal.id)?.option.activity?.id;
    const label = document.createElement('label'); label.innerHTML = `After dinner (optional)<select name="activityId"><option value="">Keep it to dinner</option>${(S.activities || []).map(p => `<option value="${esc(p.id)}" ${p.id === current ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
    form.insertBefore(label, form.querySelector('[type="submit"]'));
  }
  if (modal.type === 'facts' && modal.facts?.activity) $('.modal-content')?.insertAdjacentHTML('beforeend', `<div class="section-heading"><h3>Second stop</h3></div>${factsView(modal.facts.activity)}`);
  if ($('.modal-content')) $('.modal-content').scrollTop = scroll;
  for (const name of openDetails) { const detail = [...document.querySelectorAll('.modal-content details')].find(d => d.className === name); if (detail) detail.open = true; }
  if (!sameModal) $('.modal input:not([type="checkbox"]), .modal textarea, .modal button')?.focus({ preventScroll: true });
}
function planForm() {
  const draft = modal.draft || {};
  return `<form id="plan-form" class="stack"><p class="muted">You pick the people. Your agents work out the details.</p><label>What’s the occasion?<input name="title" value="${esc(draft.title || 'Dinner with the crew')}" maxlength="80" required></label><div><p class="field-label">Choose your friends</p><div class="friend-choices">${S.friends.filter(u => ['ricky', 'aditya', 'arnav', 'daniel'].includes(u.id)).map(u => `<label class="friend-choice"><input name="friends" type="checkbox" value="${u.id}" ${(draft.friends || []).includes(u.id) ? 'checked' : ''}>${avatar(u, true)}<span>${esc(u.name)}</span><span class="choice-check">${icon('check')}</span></label>`).join('')}</div></div><label>Day<input name="date" type="date" value="${S.defaultDate}" required></label><div class="form-columns"><label>Starting time<input name="time" type="time" value="19:00" required></label><label>Proposed spend / person<input name="allowance" type="number" min="0" max="10000" value="24" required></label></div><p class="tiny muted">The proposed spend is a group meal allowance, not a verified restaurant price. Individual budgets stay private.</p>${modal.placeId ? `<div class="tag">Starting with your selected restaurant</div>` : ''}<button type="submit" class="btn primary wide">Let our agents work it out ${icon('sparkle')}</button></form>`;
}
function settingsForm() {
  const p = S.me.private;
  return `<form id="settings-form" class="stack"><div class="private-banner">${icon('lock')} Only you and your agent</div><label>Usual budget per outing ($)<input name="budget" type="number" min="0" max="10000" value="${p.budget}" required></label><div class="form-columns"><label>Free from<input name="start" type="time" value="${p.start}" required></label><label>Until<input name="end" type="time" value="${p.end}" required></label></div><fieldset><legend>Available days</legend><div class="days">${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => `<label><input name="days" type="checkbox" value="${d}" ${p.days.includes(d) ? 'checked' : ''}><span>${d.slice(0, 3)}</span></label>`).join('')}</div></fieldset><label>Dietary needs<input name="dietary" value="${esc(p.dietary)}" placeholder="e.g. vegetarian, or vegetarian preferred"></label><label>Things you love<input name="interests" value="${esc(p.interests)}" placeholder="Coffee, ramen, live music"></label><label>Other preferences<textarea name="preferences" rows="2">${esc(p.preferences)}</textarea></label><label>Social energy<select name="energy">${['low', 'medium', 'high'].map(e => `<option ${p.energy === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label><button class="btn primary wide" type="submit">Save private preferences ${icon('check')}</button><p class="tiny muted">Existing invitations aren’t changed automatically. Ask your agent to revise an active plan.</p></form>`;
}
function reviewForm() {
  const p = modal.place, previous = S.myReviews.find(r => r.placeId === p.id);
  return `<form id="review-form" class="stack"><div class="review-item">${art(p.category, 2)}<h2>${esc(p.name)}</h2><p class="muted">${esc(p.category)} · ${esc(p.area)}</p></div><label class="rating-label">Your rating <output id="rating-output">${previous?.rating || '8.5'}</output><input type="range" name="rating" min="0" max="10" step="0.1" value="${previous?.rating || 8.5}"></label><label>Note for friends<textarea name="quote" rows="3" placeholder="What would you tell your friends?" required minlength="3" maxlength="2000">${esc(previous?.quote || '')}</textarea></label><label>Tags, separated by commas<input name="tags" value="${esc(previous?.tags.join(', ') || '')}" placeholder="quiet, first date, good for groups"></label><button class="btn primary wide" type="submit">Post to friends ${icon('arrow')}</button><p class="tiny muted">Your friends’ rankings update as soon as this is saved.</p></form>`;
}
function placeDetail(p) {
  const avg = p.reviews.length ? (p.reviews.reduce((a, r) => a + r.rating, 0) / p.reviews.length).toFixed(1) : '—';
  return `<div class="place-hero">${art(p.category + ' ' + p.name, 0)}</div><div class="row"><div><p class="eyebrow">${esc(p.category)} · ${esc(p.area)}</p><h2>${esc(p.name)}</h2></div><span class="score">${avg}</span></div><p class="muted small-text">${esc(p.address || 'Address not provided')}</p><div class="row wrap">${button(icon('save') + (p.saved ? ' Saved' : ' Want to try'), 'save', '', `data-id="${esc(p.id)}"`)}${button('Log an opinion', 'review', '', `data-id="${esc(p.id)}"`)}</div>${/food|restaurant|cafe|tea|bar|pizza|brunch|coffee|bakery/i.test(p.category) ? button('Plan this ' + icon('arrow'), 'new-plan', 'primary wide mt', `data-place="${esc(p.id)}"`) : ''}<div class="section-heading"><h3>What friends say</h3></div>${p.reviews.map(r => `<div class="friend-review"><div class="row"><div class="row small-gap">${avatar(r.author, true)}<strong>${esc(r.author.name)}</strong></div><span class="score small-score">${r.rating.toFixed(1)}</span></div><blockquote>“${esc(r.quote)}”</blockquote><p class="tiny muted">${r.synthetic ? 'Fictional demo opinion · score derived from sentiment' : 'Shared by your friend'}</p></div>`).join('') || '<p class="muted">No opinions from your circle yet.</p>'}<div class="section-heading"><h3>Place details</h3></div><p class="small-text muted">${esc(p.provenance)}${p.hours ? `<br>Listed hours: ${esc(p.hours)}` : ''}</p><div class="row wrap">${button('Check current details', 'facts', 'small-btn', `data-id="${esc(p.id)}"`)}${p.source ? `<a class="btn small-btn" href="${safeUrl(p.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</div>`;
}
function factsView(facts) {
  if (!facts) return '<div class="loading-state"><span class="agent-mark spin">✳</span><h3>Checking the details…</h3><p>Looking for current hours, menu prices, and options.</p></div>';
  return `<span class="status ${facts.status === 'sourced' ? 'confirmed' : 'needs_decision'}">${facts.status === 'sourced' ? 'Sources found' : 'Not verified'}</span><p class="facts-summary">${esc(facts.summary)}</p>${facts.checkedAt ? `<p class="tiny muted">Checked ${new Date(facts.checkedAt).toLocaleTimeString()}</p>` : ''}<div class="source-list">${(facts.sources || []).map(s => `<a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</div>${facts.searchSuggestions ? `<iframe class="search-suggestions" title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(facts.searchSuggestions)}"></iframe>` : ''}`;
}
function planDetail(p) {
  const accepted = p.participants.filter(u => p.rsvps[u.id] === 'in').length;
  return `<div class="plan-heading"><span class="status ${p.state}">${statusText[p.state]}</span><h1>${esc(p.title)}</h1><p>${prettyDate(p.option.date)} · ${prettyTime(p.option.time)}</p></div>${p.previous && (p.previous.time !== p.option.time || p.previous.date !== p.option.date || p.previous.place.id !== p.option.place.id || p.previous.allowance !== p.option.allowance) ? `<div class="diff"><strong>Here’s what changed</strong>${p.previous.date !== p.option.date ? `<p>${prettyDate(p.previous.date)} → ${prettyDate(p.option.date)}</p>` : ''}${p.previous.time !== p.option.time ? `<p><s>${prettyTime(p.previous.time)}</s> → ${prettyTime(p.option.time)}</p>` : ''}${p.previous.place.id !== p.option.place.id ? `<p>${esc(p.previous.place.name)} → ${esc(p.option.place.name)}</p>` : ''}${p.previous.allowance !== p.option.allowance ? `<p>Proposed spend: $${p.previous.allowance} → $${p.option.allowance}</p>` : ''}<p class="tiny">The host must approve before anyone reconfirms.</p></div>` : ''}<div class="route-card"><div class="route-marker">${icon('pin')}</div><div><span class="eyebrow">${prettyTime(p.option.time)} · DINNER</span><h2>${esc(p.option.place.name)}</h2><p>${esc(p.option.place.area)} · $${p.option.allowance} proposed / person</p><p class="tiny muted">Meal allowance; actual menu price ${p.facts?.price ? `estimated at $${p.facts.price} by web sources` : 'unverified'}.</p></div></div>${p.isHost && p.candidates[0] ? `<p class="choice-reason">${icon('sparkle')} ${esc(p.candidates.find(c => c.place.id === p.option.place.id)?.reason || 'A new proposal for the group')}</p>` : ''}${p.state === 'negotiating' || p.state === 'awaiting_approval' || p.state === 'needs_decision' ? `<div class="section-heading"><h3>Your agents are on it</h3><span class="tiny muted">Round ${p.round} of 3</span></div><div class="agent-lanes">${p.participants.map(u => { const last = p.log.filter(l => l.userId === u.id).at(-1); return `<div class="agent-lane">${avatar(u, true)}<div><strong>${esc(u.name)}’s agent</strong><p>${last ? esc(last.text) : 'Checking privately…'}</p></div><span class="lane-status ${last?.type || ''}">${last?.type === 'accept' ? icon('check') : '···'}</span></div>`; }).join('')}</div><div class="privacy-callout">${icon('lock')} Budgets, calendars, and reasons stay with each person’s agent.</div><details class="negotiation-log"><summary>See how it came together</summary>${p.log.map(l => `<p><span>R${l.round}</span> ${esc(l.text)}</p>`).join('')}</details>` : `<div class="section-heading"><h3>Who’s coming</h3><span class="tiny muted">${accepted}/${p.participants.length} in</span></div>${p.participants.map(u => `<div class="rsvp-row">${avatar(u, true)}<strong>${esc(u.name)}</strong><span class="status ${p.rsvps[u.id] === 'in' ? 'confirmed' : 'invited'}">${({ in: 'I’m in', pending: 'Waiting', reconfirm: 'Reconfirm', out: 'Can’t make it' })[p.rsvps[u.id]] || 'Pending'}</span></div>`).join('')}`}${p.issue ? `<div class="issue"><strong>Your call.</strong><p>${esc(p.issue)}</p></div>` : ''}${p.warnings.map(w => `<p class="unmatched">${esc(w)}</p>`).join('')}<div class="venue-check"><div><strong>${p.facts?.status === 'sourced' ? 'Web sources checked' : 'Venue details need checking'}</strong><p>Hours, menu prices, and dietary options.</p></div>${button('Details', 'plan-facts', 'small-btn', `data-id="${p.id}"`)}</div><div class="plan-actions">${p.isHost && p.state === 'awaiting_approval' ? `${button((p.hasPendingChange ? 'Approve & send update' : 'Approve & send invites') + icon('arrow'), 'approve', 'primary wide', `data-id="${p.id}" data-revision="${p.revision}"`)}<div class="row">${button('Change something', 'tweak', 'wide', `data-id="${p.id}"`)}${button('Another option', 'another', 'wide', `data-id="${p.id}"`)}</div>` : ''}${p.isHost && p.state === 'needs_decision' ? button('Choose a new proposal', 'tweak', 'primary wide', `data-id="${p.id}"`) : ''}${p.state === 'invited' && !p.isHost && p.myRsvp !== 'in' ? `<div class="row">${button('I’m in ' + icon('check'), 'rsvp-in', 'primary wide', `data-id="${p.id}"`)}${button('Can’t make it', 'rsvp-out', 'wide', `data-id="${p.id}"`)}</div>` : ''}${['invited', 'confirmed', 'awaiting_approval', 'needs_decision'].includes(p.state) ? button('Tell my agent I need a change', 'change', 'wide', `data-id="${p.id}"`) : ''}${p.isHost && p.state === 'confirmed' ? button('Preview booking confirmation', 'book', 'primary wide', `data-id="${p.id}"`) : ''}${['confirmed', 'booked'].includes(p.state) ? button('Download calendar event', 'calendar', 'wide', `data-id="${p.id}"`) : ''}${p.booking ? `<div class="booking"><span class="celebrate">✳</span><h2>You’re all set. Almost.</h2><strong>${esc(p.booking.reference)}</strong><p>${esc(p.booking.note)}</p><span class="tag">Next up: real restaurant reservations</span></div>` : ''}${p.isHost && !['cancelled', 'booked'].includes(p.state) ? button('Cancel plan', 'cancel', 'text-button danger', `data-id="${p.id}"`) : ''}</div><details class="history"><summary>Plan history</summary>${p.history.map(h => `<p>${esc(h.text)}</p>`).join('')}</details><p class="data-note">${p.mode === 'local' ? 'Local demo agents evaluate real constraints against your proposal.' : `Agent provider: ${esc(p.mode)}`}</p>`;
}
function changeForm() { return `<form id="change-form" class="stack"><div class="private-banner">${icon('lock')} Only your agent sees what you write.</div><label>What changed?<textarea name="text" rows="4" required placeholder="Can’t do 8:30, could do 9. Keep tonight under $15."></textarea></label><button class="btn primary wide" type="submit">Ask my agent to work it out ${icon('arrow')}</button><p class="tiny muted">Others receive only a revised proposal. The host approves before invitations update.</p></form>`; }
function tweakForm() { const p = S.plans.find(p => p.id === modal.id); return `<form id="tweak-form" class="stack"><p class="muted">Your guest list stays the same. Agents will recheck this proposal.</p><label>Day<input name="date" type="date" value="${p.option.date}" required></label><label>Time<input name="time" type="time" value="${p.option.time}" required></label><label>Proposed spend per person ($)<input name="allowance" type="number" min="0" max="10000" value="${p.option.allowance}" required></label><label>Restaurant<select name="placeId">${p.candidates.map(c => `<option value="${esc(c.place.id)}" ${c.place.id === p.option.place.id ? 'selected' : ''}>${esc(c.place.name)}</option>`).join('')}</select></label><button class="btn primary wide" type="submit">Recheck with everyone ${icon('arrow')}</button></form>`; }
function friendsView() { return `<p class="muted">Opinions travel through your friend connections.</p>${S.requests.map(r => `<div class="list-item">${avatar(r.fromUser, true)}<strong>${esc(r.fromUser.name)}</strong>${button('Accept', 'accept-friend', 'small-btn primary', `data-id="${r.from}"`)}</div>`).join('')}<p class="section-label">YOUR FRIENDS · ${S.friends.length}</p>${S.friends.map(u => `<div class="list-item">${avatar(u, true)}<div><strong>${esc(u.name)}</strong><p>${u.fictional ? 'Fictional taste contributor' : 'Personal agent ready'}</p></div>${!u.fictional ? button('Plan', 'plan-friend', 'small-btn', `data-id="${u.id}"`) : ''}</div>`).join('')}<p class="section-label">DISCOVER PEOPLE</p>${S.people.slice(0, 10).map(u => `<div class="list-item">${avatar(u, true)}<div><strong>${esc(u.name)}</strong><p>${esc(u.area)} · Fictional persona</p></div>${button('Add', 'add-friend', 'small-btn', `data-id="${u.id}"`)}</div>`).join('')}`; }

async function catalog(query = '') { const results = await api('/catalog?q=' + encodeURIComponent(query)); if (modal?.type !== 'catalog') return; $('#catalog-results').innerHTML = results.map(p => `<button class="list-item" data-action="catalog-pick" data-id="${esc(p.id)}"><span class="mini-art">${icon('pin')}</span><div><strong>${esc(p.name)}</strong><p>${esc(p.category)} · ${esc(p.area)}</p></div>${icon('plus')}</button>`).join('') || '<p class="muted">No match yet. Add the item below.</p>'; }
async function openPlace(id, type = 'place') { const place = await api('/place?id=' + encodeURIComponent(id)); openModal({ type, place }); }
async function sendChat(text, planId) { pending = true; view = 'chat'; render(); scrollChat(); try { await api('/chat', { text, planId }); chatDraft = ''; if ($('#message')) $('#message').value = ''; await refresh(); scrollChat(); } finally { pending = false; render(); } }
function scrollChat() { requestAnimationFrame(() => { if ($('#main')) $('#main').scrollTop = $('#main').scrollHeight; }); }

document.addEventListener('click', async event => {
  const el = event.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action, id = el.dataset.id;
  if (parent !== window && S) parent.postMessage({ kind: 'disco-active', user: S.me.id }, location.origin);
  try {
    switch (action) {
      case 'nav': view = el.dataset.view; closeModal(); render(); $('#main').scrollTop = 0; break;
      case 'close': closeModal(); break;
      case 'onboard': await api('/onboard', {}); await refresh(); break;
      case 'prompt': closeModal(); await sendChat(el.dataset.text); break;
      case 'new-plan': { const draft = S.chat.find(m => m.id === el.dataset.draft)?.draft; openModal({ type: 'new-plan', placeId: el.dataset.place, draft }); break; }
      case 'plan-friend': openModal({ type: 'new-plan', draft: { friends: [id] } }); break;
      case 'match-plan': { const match = S.matches.find(m => m.place.id === id); openModal({ type: 'new-plan', placeId: id, draft: { friends: match.friends.filter(u => ['ricky', 'aditya', 'arnav', 'daniel'].includes(u.id)).map(u => u.id) } }); break; }
      case 'plan': openModal({ type: 'plan', id }); break;
      case 'place': await openPlace(id); break;
      case 'review': await openPlace(id, 'review'); break;
      case 'settings': openModal({ type: 'settings' }); break;
      case 'friends': openModal({ type: 'friends' }); break;
      case 'catalog': openModal({ type: 'catalog', purpose: el.dataset.purpose || 'review' }); await catalog(); $('#catalog-query').focus(); break;
      case 'catalog-pick': await openPlace(id, modal.purpose === 'review' ? 'review' : 'place'); break;
      case 'add-item': openModal({ type: 'add-item' }); break;
      case 'filter': filter = el.dataset.filter; render(); break;
      case 'save': { const result = await api('/save', { placeId: id }); toast(result.saved ? 'Added to Want to try.' : 'Removed from Want to try.'); await refresh(); if (modal?.type === 'place') await openPlace(id); break; }
      case 'like': await api('/like', { reviewId: id }); await refresh(); break;
      case 'memory-save': case 'memory-skip': await api('/memory', { action: action === 'memory-save' ? 'save' : 'skip', pendingId: S.me.pendingMemory.id }); await refresh(); break;
      case 'forget': await api('/memory', { action: 'forget', memoryId: id }); await refresh(); break;
      case 'clear-temporary': await api('/temporary/clear', {}); await refresh(); toast('Temporary preferences cleared.'); break;
      case 'approve': el.disabled = true; await api('/plans/approve', { planId: id, revision: Number(el.dataset.revision) }); toast('Invitations sent to your crew.'); await refresh(); break;
      case 'rsvp-in': case 'rsvp-out': el.disabled = true; await api('/plans/rsvp', { planId: id, response: action === 'rsvp-in' ? 'in' : 'out' }); await refresh(); break;
      case 'another': el.disabled = true; await api('/plans/revise', { planId: id, another: true }); await refresh(); break;
      case 'tweak': openModal({ type: 'tweak', id }); break;
      case 'change': openModal({ type: 'change', id }); break;
      case 'cancel': await api('/plans/cancel', { planId: id }); await refresh(); break;
      case 'book': await api('/plans/book', { planId: id }); await refresh(); break;
      case 'calendar': { const response = await fetch('/api/calendar?id=' + id, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Confirm the plan first.'); const href = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = href; a.download = 'disco-plan.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(href), 2000); break; }
      case 'facts': { openModal({ type: 'facts', facts: null }); const facts = await api('/facts', { placeId: id, date: S.defaultDate, time: '19:00' }); if (modal?.type === 'facts') openModal({ type: 'facts', facts }); break; }
      case 'plan-facts': openModal({ type: 'facts', facts: S.plans.find(p => p.id === id).facts }); break;
      case 'add-friend': case 'accept-friend': { const result = await api('/friends', { userId: id, accept: action === 'accept-friend' }); toast(result.message); await refresh(); openModal({ type: 'friends' }); break; }
      case 'logout': await api('/logout', {}); logoutLocal(); break;
    }
  } catch (error) { toast(error.message); el.disabled = false; }
});
document.addEventListener('submit', async event => {
  const form = event.target; event.preventDefault(); const data = new FormData(form); const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
  try {
    if (form.id === 'login-form') await login(data.get('username'), data.get('password'));
    if (form.id === 'chat-form') { if (pending) return; await sendChat(data.get('message')); }
    if (form.id === 'plan-form') { const result = await api('/plans', { title: data.get('title'), date: data.get('date'), time: data.get('time'), allowance: Number(data.get('allowance')), friends: data.getAll('friends'), placeId: modal.placeId, activityId: data.get('activityId') || undefined, query: modal.draft?.query || 'restaurants' }); await refresh(); openModal({ type: 'plan', id: result.planId }); }
    if (form.id === 'settings-form') { await api('/settings', { ...Object.fromEntries(data), budget: Number(data.get('budget')), days: data.getAll('days') }); closeModal(); await refresh(); toast('Your private preferences are saved.'); }
    if (form.id === 'review-form') { await api('/reviews', { placeId: modal.place.id, rating: Number(data.get('rating')), quote: data.get('quote'), tags: data.get('tags').split(',').map(x => x.trim()).filter(Boolean) }); closeModal(); await refresh(); toast('Opinion posted. Your circle’s rankings just updated.'); }
    if (form.id === 'item-form') { const place = await api('/items', Object.fromEntries(data)); openModal({ type: 'review', place }); }
    if (form.id === 'change-form') { const id = modal.id; closeModal(); await sendChat(data.get('text'), id); }
    if (form.id === 'tweak-form') { const id = modal.id; await api('/plans/revise', { planId: id, option: { ...Object.fromEntries(data), allowance: Number(data.get('allowance')) } }); await refresh(); openModal({ type: 'plan', id }); }
  } catch (error) { toast(error.message); } finally { if (submit?.isConnected) submit.disabled = false; }
});
document.addEventListener('input', event => {
  if (event.target.id === 'message') chatDraft = event.target.value;
  if (event.target.name === 'rating') $('#rating-output').textContent = Number(event.target.value).toFixed(1);
  if (event.target.id === 'catalog-query') { clearTimeout(searchTimer); searchTimer = setTimeout(() => catalog(event.target.value).catch(e => toast(e.message)), 250); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modal) closeModal();
  if (event.key === 'Tab' && modal) { const items = [...document.querySelectorAll('.modal button:not([disabled]), .modal input, .modal textarea, .modal select, .modal a[href], .modal summary')].filter(e => e.offsetParent !== null); const first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  if (event.target.id === 'message' && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#chat-form').requestSubmit(); }
});
window.addEventListener('message', async event => { if (event.origin !== location.origin || event.source !== parent || parent === window) return; if (event.data.kind === 'disco-login' && ['ricky', 'aditya', 'arnav', 'daniel'].includes(slot) && !token) { try { await login(slot, event.data.password); } catch (error) { toast(error.message); } } });
if (token) { await refresh(); if (S) { live(); if (parent !== window) parent.postMessage({ kind: 'disco-ready', user: S.me.id }, location.origin); } } else await loginScreen();
