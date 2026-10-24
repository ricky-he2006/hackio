import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store, MAIN_IDS, publicUser } from './lib/data.mjs';
import { Engine, AppError, assert, clean, validDate, validTime } from './lib/engine.mjs';
import { providerStatus, checkProvider } from './lib/providers.mjs';

const publicDir = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  let content = ''; for await (const chunk of req) { content += chunk; if (content.length > 24000) throw new AppError('Request too large.', 413); }
  try { return content ? JSON.parse(content) : {}; } catch { throw new AppError('Invalid JSON.'); }
}
function calendar(p) {
  const escape = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const date = p.option.date.replaceAll('-', ''), time = p.option.time.replace(':', '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Disco//Friends//EN', 'BEGIN:VEVENT', `UID:${p.id}@disco.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART;TZID=America/New_York:${date}T${time}00`, `DURATION:PT${p.option.activity ? 2 : 1}H`, `SUMMARY:${escape(p.title)}`, `LOCATION:${escape(p.option.place.name + ', ' + p.option.place.address)}`, `DESCRIPTION:${escape('Disco plan. No restaurant reservation has been made.' + (p.option.activity ? ' Second stop: ' + p.option.activity.name + '. Verify travel time before attending.' : ''))}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

export function createApp({ store = new Store(), engine = new Engine(store) } = {}) {
  const loginAttempts = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' about:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (!url.pathname.startsWith('/api/')) {
        assert(req.method === 'GET' || req.method === 'HEAD', 'Method not allowed.', 405);
        const route = url.pathname === '/' ? '/index.html' : url.pathname === '/demo' ? '/demo.html' : url.pathname;
        const file = resolve(publicDir, '.' + decodeURIComponent(route));
        assert(file.startsWith(publicDir + sep), 'Not found.', 404);
        try { assert((await stat(file)).isFile(), 'Not found.', 404); const data = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data); return; } catch { throw new AppError('Not found.', 404); }
      }
      if (req.method !== 'GET' && req.headers.origin) assert(req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}`, 'Cross-origin request rejected.', 403);
      if (url.pathname === '/api/health') return json(res, 200, { ok: true, ...providerStatus() });
      if (url.pathname === '/api/accounts' && req.method === 'GET') return json(res, 200, MAIN_IDS.map(id => publicUser(store.data.users[id])));
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const key = req.socket.remoteAddress; let attempts = loginAttempts.get(key);
        if (!attempts || Date.now() - attempts.since > 60_000) { attempts = { since: Date.now(), count: 0 }; loginAttempts.set(key, attempts); }
        assert(++attempts.count <= 30, 'Too many login attempts. Try again in a minute.', 429);
        const input = await body(req); assert(typeof input.username === 'string' && typeof input.password === 'string', 'Enter your username and password.');
        const session = store.login(input.username, input.password); assert(session, 'That username or password is incorrect.', 401); return json(res, 200, session);
      }
      const token = req.headers.authorization?.replace(/^Bearer /, ''); const user = store.authenticate(token); assert(user, 'Please log in again.', 401); const id = user.id;
      if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        const listener = revision => res.write(`data: ${JSON.stringify({ revision })}\n\n`); store.listeners.add(listener); listener(store.data.revision);
        const heartbeat = setInterval(() => { if (!store.authenticate(token)) res.end(); else res.write(': keepalive\n\n'); }, 15000);
        res.on('close', () => { clearInterval(heartbeat); store.listeners.delete(listener); }); return;
      }
      if (req.method === 'GET') {
        if (url.pathname === '/api/state') return json(res, 200, engine.state(id));
        if (url.pathname === '/api/catalog') return json(res, 200, engine.catalog(id, url.searchParams.get('q') || ''));
        if (url.pathname === '/api/place') return json(res, 200, engine.place(id, url.searchParams.get('id')));
        if (url.pathname === '/api/quickrate') return json(res, 200, engine.quickPicks(id));
        if (url.pathname === '/api/recommend') return json(res, 200, engine.recommend(id, url.searchParams.get('q') || 'restaurants'));
        if (url.pathname === '/api/calendar') {
          const p = engine.planFor(id, url.searchParams.get('id')); assert(['confirmed', 'booked'].includes(p.state), 'Confirm the plan before adding it to your calendar.');
          res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="disco-plan.ics"' }); return res.end(calendar(p));
        }
      }
      assert(req.method === 'POST', 'Not found.', 404); const input = await body(req); let result = { ok: true };
      switch (url.pathname) {
        case '/api/logout': store.logout(token); break;
        case '/api/chat': result = await engine.chat(id, input); break;
        case '/api/settings': result = engine.settings(id, input); break;
        case '/api/onboard': result = engine.onboard(id, input); break;
        case '/api/temporary/clear': user.temporary = {}; user.pendingMemory = null; store.save(); break;
        case '/api/memory': result = engine.memory(id, input); break;
        case '/api/reviews': result = engine.review(id, input); break;
        case '/api/items': result = engine.addItem(id, input); break;
        case '/api/save': result = engine.savePlace(id, input.placeId); break;
        case '/api/like': engine.like(id, input.reviewId); break;
        case '/api/comment': result = engine.comment(id, input.reviewId, input.text); break;
        case '/api/matches/dismiss': result = engine.dismissMatch(id, clean(input.placeId, 80)); break;
        case '/api/friends': result = engine.friendRequest(id, input.userId, input.accept === true, input.decline === true); break;
        case '/api/facts': {
          assert(store.data.places[input.placeId], 'Place not found.', 404);
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
