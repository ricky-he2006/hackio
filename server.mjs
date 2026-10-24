import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store, MAIN_IDS, publicUser } from './lib/data.mjs';
import { Engine, AppError, assert, clean, validDate, validTime } from './lib/engine.mjs';
import { providerStatus, checkProvider } from './lib/providers.mjs';

const publicDir = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
// Fixed-window counters. Keys are user ids or socket addresses; the map is pruned so it cannot grow without bound.
export function limiter(max, windowMs) {
  const hits = new Map();
  const entry = key => { let h = hits.get(key); if (!h || Date.now() - h.since > windowMs) { if (hits.size > 10_000) hits.clear(); h = { since: Date.now(), count: 0 }; hits.set(key, h); } return h; };
  return { hit: key => ++entry(key).count <= max, blocked: key => entry(key).count >= max };
}
// A DNS-rebinding page reaches loopback under its own hostname; only names we serve are accepted.
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...(process.env.ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)]);
const hostAllowed = host => allowedHosts.has(String(host || '').toLowerCase().replace(/:\d+$/, ''));
// Routes that can reach a paid model or search provider.
const modelRoutes = new Set(['/api/chat', '/api/adventure-draft', '/api/facts', '/api/plans', '/api/plans/revise']);
const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req, max = 24000) {
  let content = ''; for await (const chunk of req) { content += chunk; if (content.length > max) throw new AppError('Request too large.', 413); }
  try { return content ? JSON.parse(content) : {}; } catch { throw new AppError('Invalid JSON.'); }
}
function calendar(p) {
  const escape = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const date = p.option.date.replaceAll('-', ''), time = p.option.time.replace(':', '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Disco//Friends//EN', 'BEGIN:VEVENT', `UID:${p.id}@disco.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART;TZID=America/New_York:${date}T${time}00`, `DURATION:PT${p.option.activity ? 2 : 1}H`, `SUMMARY:${escape(p.title)}`, `LOCATION:${escape(p.option.place.name + ', ' + p.option.place.address)}`, `DESCRIPTION:${escape('Disco plan. No restaurant reservation has been made.' + (p.option.activity ? ' Second stop: ' + p.option.activity.name + '. Verify travel time before attending.' : ''))}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

/** Fixed-window counter per key. Expired windows are swept once the map grows, so it can't leak memory. */
function rateLimiter(max, windowMs) {
  const windows = new Map();
  return key => {
    const now = Date.now();
    if (windows.size > 500) for (const [k, w] of windows) if (now - w.since > windowMs) windows.delete(k);
    let w = windows.get(key); if (!w || now - w.since > windowMs) windows.set(key, w = { since: now, count: 0 });
    return ++w.count <= max;
  };
}
const MAX_STREAMS_PER_USER = 6; // the four-phone demo opens one per account; this leaves room for extra tabs

export function createApp({ store = new Store(), engine = new Engine(store) } = {}) {
  const loginLimit = rateLimiter(30, 60_000), factsLimit = rateLimiter(10, 60_000), mediaLimit = rateLimiter(60, 60_000), avatarLimit = rateLimiter(10, 60_000), streams = new Map();
  const failedByAccount = limiter(10, 15 * 60_000), modelCalls = limiter(20, 60_000), writes = limiter(120, 60_000);
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org https://*.googleusercontent.com; connect-src 'self'; frame-src 'self' about: https://www.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    try {
      assert(hostAllowed(req.headers.host), 'Unrecognized host.', 421);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (!url.pathname.startsWith('/api/')) {
        assert(req.method === 'GET' || req.method === 'HEAD', 'Method not allowed.', 405);
        const route = url.pathname === '/' ? '/index.html' : url.pathname === '/demo' ? '/demo.html' : url.pathname;
        let decoded; try { decoded = decodeURIComponent(route); } catch { throw new AppError('Not found.', 404); } // e.g. /%E0
        const file = resolve(publicDir, '.' + decoded);
        assert(file.startsWith(publicDir + sep), 'Not found.', 404);
        try { assert((await stat(file)).isFile(), 'Not found.', 404); const data = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data); return; } catch { throw new AppError('Not found.', 404); }
      }
      if (req.method !== 'GET' && req.headers.origin) assert(req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}`, 'Cross-origin request rejected.', 403);
      if (url.pathname === '/api/health') return json(res, 200, { ok: true, ...providerStatus(), defaultPassword: store.defaultPassword });
      // Public so the login screen can show faces before sign-in. Only stored, signature-checked images are served.
      // Signed URL instead of a login header (image requests can't send one); see Engine.reviewPhotoUrl.
      if (url.pathname === '/api/review-photo' && req.method === 'GET') {
        const photo = engine.signedReviewPhoto(url.searchParams.get('id'), url.searchParams.get('v'), url.searchParams.get('sig')); assert(photo, 'Not found.', 404);
        res.writeHead(200, { 'content-type': photo.type, 'content-length': photo.data.length, 'cache-control': 'private, max-age=86400' }); return res.end(photo.data);
      }
      if (url.pathname === '/api/avatar' && req.method === 'GET') {
        const avatar = store.avatar(url.searchParams.get('id')); assert(avatar, 'Not found.', 404);
        res.writeHead(200, { 'content-type': avatar.type, 'content-length': avatar.data.length, 'cache-control': 'public, max-age=31536000, immutable' }); return res.end(req.method === 'HEAD' ? undefined : avatar.data);
      }
      if (url.pathname === '/api/accounts' && req.method === 'GET') return json(res, 200, MAIN_IDS.map(id => publicUser(store.data.users[id])));
      if (url.pathname === '/api/login' && req.method === 'POST') {
        assert(loginLimit(req.socket.remoteAddress), 'Too many login attempts. Try again in a minute.', 429);
        const input = await body(req); assert(typeof input.username === 'string' && typeof input.password === 'string', 'Enter your username and password.');
        const account = input.username.toLowerCase().trim();
        assert(!failedByAccount.blocked(account), 'This account is temporarily locked after repeated failed logins. Try again in 15 minutes.', 429);
        const session = store.login(input.username, input.password);
        if (!session) failedByAccount.hit(account);
        assert(session, 'That username or password is incorrect.', 401); return json(res, 200, session);
      }
      const token = req.headers.authorization?.replace(/^Bearer /, ''); const user = store.authenticate(token); assert(user, 'Please log in again.', 401); const id = user.id;
      if (url.pathname === '/api/events' && req.method === 'GET') {
        assert((streams.get(id) || 0) < MAX_STREAMS_PER_USER, 'Too many open live connections. Close another tab and retry.', 429);
        streams.set(id, (streams.get(id) || 0) + 1); res.on('close', () => { const n = streams.get(id) - 1; if (n > 0) streams.set(id, n); else streams.delete(id); });
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        const listener = revision => res.write(`data: ${JSON.stringify({ revision })}\n\n`); store.listeners.add(listener); listener(store.data.revision);
        const heartbeat = setInterval(() => { if (!store.authenticate(token)) res.end(); else res.write(': keepalive\n\n'); }, 15000);
        res.on('close', () => { clearInterval(heartbeat); store.listeners.delete(listener); }); return;
      }
      if (req.method === 'POST') {
        assert(writes.hit(id), 'You’re going a little fast. Try again in a minute.', 429);
        assert(!modelRoutes.has(url.pathname) || modelCalls.hit(id), 'Your agent needs a short break. Try again in a minute.', 429);
      }
      if (req.method === 'GET') {
        if (url.pathname === '/api/state') {
          const lat = url.searchParams.get('lat'), lon = url.searchParams.get('lon');
          assert((lat === null) === (lon === null), 'Choose a valid location.');
          const origin = lat === null ? null : { lat: Number(lat), lon: Number(lon), label: 'your location' };
          if (origin) assert(Number.isFinite(origin.lat) && Number.isFinite(origin.lon) && origin.lat >= -90 && origin.lat <= 90 && origin.lon >= -180 && origin.lon <= 180, 'Choose a valid location.');
          return json(res, 200, engine.state(id, origin));
        }
        if (url.pathname === '/api/profile') return json(res, 200, engine.profile(id, url.searchParams.get('id')));
        if (url.pathname === '/api/invite') return json(res, 200, engine.invitePreview(id, url.searchParams.get('from')));
        if (url.pathname === '/api/catalog') return json(res, 200, engine.catalog(id, url.searchParams.get('q') || ''));
        if (url.pathname === '/api/place') return json(res, 200, engine.place(id, url.searchParams.get('id')));
        // Each lookup can be a paid Places call; the browser keeps results for the session, so this only bites on abuse.
        if (url.pathname === '/api/place-media') { assert(mediaLimit(id), 'Too many photo lookups. Try again in a minute.', 429); return json(res, 200, await engine.placeMedia(url.searchParams.get('id'))); }
        if (url.pathname === '/api/quickrate') return json(res, 200, engine.quickPicks(id));
        if (url.pathname === '/api/recommend') return json(res, 200, engine.recommend(id, url.searchParams.get('q') || 'restaurants'));
        if (url.pathname === '/api/calendar') {
          const p = engine.planFor(id, url.searchParams.get('id')); assert(['confirmed', 'booked'].includes(p.state), 'Confirm the plan before adding it to your calendar.');
          res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="disco-plan.ics"' }); return res.end(calendar(p));
        }
      }
      assert(req.method === 'POST', 'Not found.', 404);
      const upload = ['/api/avatar', '/api/review-photo'].includes(url.pathname);
      if (upload) assert(avatarLimit(id), 'Too many photo uploads. Try again in a minute.', 429);
      const input = await body(req, url.pathname === '/api/review-photo' ? 600_000 : upload ? 300_000 : 24000); let result = { ok: true };
      switch (url.pathname) {
        case '/api/logout': store.logout(token); break;
        case '/api/chat': result = await engine.chat(id, input); break;
        case '/api/adventure-draft': result = await engine.adventureDraft(id, input); break;
        case '/api/settings': result = engine.settings(id, input); break;
        case '/api/proactive/settings': result = engine.proactiveSettings(id, input); break;
        case '/api/proactive/respond': result = engine.respondProactive(id, input.opportunityId, input.response); break;
        case '/api/proactive/start': result = engine.startProactivePlan(id, input.opportunityId); break;
        case '/api/avatar': result = engine.setAvatar(id, input); break;
        case '/api/review-photo': result = engine.setReviewPhoto(id, input); break;
        case '/api/onboard': result = engine.onboard(id, input); break;
        case '/api/temporary/clear': user.temporary = {}; user.pendingMemory = null; store.save(); break;
        case '/api/memory': result = engine.memory(id, input); break;
        case '/api/reviews': result = engine.review(id, input); break;
        case '/api/reviews/delete': result = engine.deleteReview(id, input.reviewId); break;
        case '/api/items': result = engine.addItem(id, input); break;
        case '/api/save': result = engine.savePlace(id, input.placeId); break;
        case '/api/like': engine.like(id, input.reviewId); break;
        case '/api/comment': result = engine.comment(id, input.reviewId, input.text); break;
        case '/api/matches/dismiss': result = engine.dismissMatch(id, clean(input.placeId, 80)); break;
        case '/api/friends': result = engine.friendRequest(id, input.userId, input.accept === true, input.decline === true); break;
        case '/api/facts': {
          assert(Object.hasOwn(store.data.places, String(input.placeId)), 'Place not found.', 404);
          // Each lookup can be a paid search-grounding call.
          assert(factsLimit(id), 'Too many detail checks. Try again in a minute.', 429);
          // Date and time reach the search prompt and the shared cache key, so only real values get through.
          const date = input.date || engine.state(id).defaultDate, time = input.time || '19:00';
          assert(validDate(date) && validTime(time), 'Choose a valid date and time.');
          result = await engine.facts(input.placeId, date, time); break;
        }
        case '/api/plans': result = engine.createPlan(id, input); break;
        case '/api/plans/approve': result = engine.approve(id, input.planId, input.revision); break;
        case '/api/plans/rsvp': result = engine.rsvp(id, input.planId, input.response); break;
        case '/api/plans/revise': result = engine.revise(id, input.planId, input); break;
        case '/api/plans/cancel': engine.cancel(id, input.planId); break;
        case '/api/plans/book': result = engine.book(id, input.planId); break;
        case '/api/plans/drop': result = engine.dropParticipant(id, input.planId, input.userId); break;
        case '/api/plans/rate': result = engine.rateNight(id, input.planId, input); break;
        default: throw new AppError('Not found.', 404);
      }
      json(res, 200, result);
    } catch (error) { if (!res.headersSent) json(res, error.status || 500, { error: error instanceof AppError ? error.message : 'Something went wrong. Please try again.' }); else res.end(); if (!(error instanceof AppError)) console.error(error.stack); }
  });
  return { server, store, engine };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server } = createApp(); const port = Number(process.env.PORT || 3000); const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, async () => {
    console.log(`Disco is ready: http://${host}:${port}\nFour-user demo: http://${host}:${port}/demo\nAgent mode: ${providerStatus().provider}`);
    const check = await checkProvider();
    if (check.ok === false) console.warn(`Agent mode: ${check.provider} is FAILING (${check.error}). Agents will use local rules until calls succeed.`);
    else if (check.ok) { const { models } = providerStatus(); console.log(`Agent mode: ${check.provider} verified (chat: ${models.chat}, planner: ${models.planner})`); }
  });
}
