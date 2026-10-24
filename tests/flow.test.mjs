import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, MAIN_IDS } from '../lib/data.mjs';
import { Engine, nextSaturday, evaluatePrivate } from '../lib/engine.mjs';
import { createApp } from '../server.mjs';

const setup = () => { const store = new Store({ path: ':memory:' }); const engine = new Engine(store, { delay: 0, search: async () => ({ status: 'unavailable', summary: 'Not connected', sources: [] }) }); return { store, engine }; };
const start = async engine => { const { planId } = engine.createPlan('ricky', { friends: ['aditya', 'arnav', 'daniel'], date: nextSaturday(), time: '19:00', allowance: 24 }); await engine.jobs.get(planId); return engine.d.plans.find(p => p.id === planId); };

test('prepared users authenticate; wrong passwords and fictional users do not', () => {
  const { store } = setup();
  for (const id of MAIN_IDS) { const session = store.login(id, 'disco2026'); assert.equal(store.authenticate(session.token).id, id); store.logout(session.token); assert.equal(store.authenticate(session.token), null); }
  assert.equal(store.login('ricky', 'wrong'), null); assert.equal(store.login('demo_001', 'disco2026'), null); store.close();
});

test('full plan: negotiate, approve, invite, RSVP, revise, reconfirm, simulate booking', async () => {
  const { store, engine } = setup(); const p = await start(engine);
  assert.equal(p.state, 'awaiting_approval'); assert.equal(p.option.time, '20:30'); assert.ok(p.option.allowance <= 18);
  assert.equal(engine.state('arnav').plans.length, 0, 'no invitation before host approval');
  assert.throws(() => engine.approve('arnav', p.id, p.revision), /not found/);
  assert.throws(() => engine.approve('ricky', p.id, p.revision - 1), /changed/);
  engine.approve('ricky', p.id, p.revision);
  assert.equal(engine.state('arnav').plans[0].state, 'invited');
  assert.throws(() => engine.book('ricky', p.id), /Everyone must accept/);
  for (const id of MAIN_IDS.filter(x => x !== 'ricky')) engine.rsvp(id, p.id, 'in');
  assert.equal(p.state, 'confirmed');
  engine.revise('arnav', p.id, { constraints: { start: '21:00', budget: 15 } }); await engine.jobs.get(p.id);
  assert.equal(p.state, 'awaiting_approval'); assert.equal(p.option.time, '21:00'); assert.equal(p.option.allowance, 15);
  assert.equal(p.previous.time, '20:30');
  assert.throws(() => engine.rsvp('daniel', p.id, 'in'), /Wait for the host/);
  engine.approve('ricky', p.id, p.revision);
  assert.equal(p.rsvps.daniel, 'reconfirm'); assert.equal(p.rsvps.aditya, 'reconfirm');
  for (const id of MAIN_IDS.filter(x => x !== 'ricky')) engine.rsvp(id, p.id, 'in');
  assert.equal(engine.book('ricky', p.id).simulated, true); assert.equal(p.state, 'booked'); store.close();
});

test('privacy: other contexts, private change text, and unconnected opinions never enter projections', async () => {
  const { store, engine } = setup(); engine.user('arnav').private.preferences = 'PRIVATE_REASON_SENTINEL';
  engine.user('arnav').private.budget = 17.43; const p = await start(engine); engine.approve('ricky', p.id, p.revision);
  engine.revise('arnav', p.id, { constraints: { start: '21:00', preferences: 'NEW_PRIVATE_REASON_SENTINEL' } }); await engine.jobs.get(p.id);
  const host = engine.state('ricky'), json = JSON.stringify(host);
  assert.ok(!json.includes('PRIVATE_REASON_SENTINEL')); assert.ok(!json.includes('17.43')); assert.ok(!json.includes('overrides'));
  for (const friend of host.friends) { assert.equal(friend.private, undefined); assert.equal(friend.passwordHash, undefined); }
  assert.ok(host.feed.every(r => r.userId === 'ricky' || engine.user('ricky').friends.includes(r.userId)));
  assert.ok(engine.state('arnav').me.private.preferences.includes('PRIVATE_REASON_SENTINEL')); store.close();
});

test('no convergence asks host; hard dietary needs cannot be silently accepted', async () => {
  const { store, engine } = setup(); engine.user('arnav').private.days = [];
  const p = await start(engine); assert.equal(p.state, 'needs_decision'); assert.equal(p.round, 3); assert.deepEqual(p.participants, MAIN_IDS);
  assert.throws(() => engine.approve('ricky', p.id, p.revision), /not ready/);
  const verdict = evaluatePrivate({ budget: 30, days: ['Saturday'], start: '10:00', end: '23:00', dietary: 'vegan' }, { date: nextSaturday(), time: '19:00', allowance: 20 });
  assert.equal(verdict.type, 'counter'); assert.ok(verdict.codes.includes('dietary_unverified')); store.close();
});

test('chat updates are temporary until explicit memory consent; memories can be forgotten', async () => {
  const { store, engine } = setup(); const original = engine.user('ricky').private.budget;
  await engine.chat('ricky', { text: 'Keep tonight under $20' });
  assert.equal(engine.user('ricky').private.budget, original); assert.equal(engine.user('ricky').temporary.budget, 20);
  const pending = engine.user('ricky').pendingMemory;
  assert.throws(() => engine.memory('ricky', { action: 'save', pendingId: 'stale' }), /no longer active/);
  engine.memory('ricky', { action: 'save', pendingId: pending.id }); assert.equal(engine.user('ricky').private.budget, 20);
  const memory = engine.user('ricky').private.memories[0]; engine.memory('ricky', { action: 'forget', memoryId: memory.id });
  assert.equal(engine.user('ricky').private.budget, original); assert.equal(engine.user('ricky').private.memories.length, 0); store.close();
});

test('fresh opinions change friend recommendations and remain attributed to the author', () => {
  const { store, engine } = setup(); const before = engine.recommend('ricky', 'restaurants', { limit: 20 }); const target = before.at(-1).place;
  engine.review('daniel', { placeId: target.id, rating: 10, quote: 'Absolutely loved this dinner, quiet and great for groups.', tags: ['quiet', 'groups'] });
  const after = engine.recommend('ricky', target.name, { limit: 20 });
  assert.equal(after[0].place.id, target.id); assert.ok(after[0].reviews.some(r => r.author.id === 'daniel' && r.quote.includes('Absolutely loved')));
  assert.match(after[0].change, /Daniel/);
  engine.review('daniel', { placeId: target.id, rating: 1, quote: 'Changed my mind, disappointing.', tags: [] });
  assert.equal(engine.d.reviews.filter(r => r.userId === 'daniel' && r.placeId === target.id).length, 1); store.close();
});

test('expired invitations cannot be accepted and constraint changes block stale approval', async () => {
  const { store, engine } = setup(); const p = await start(engine);
  engine.settings('arnav', { budget: 1 }); assert.throws(() => engine.approve('ricky', p.id, p.revision), /constraints changed/);
  engine.settings('arnav', { budget: 18 }); engine.approve('ricky', p.id, p.revision); p.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => engine.rsvp('arnav', p.id, 'in'), /expired/); engine.expireInvites(); assert.equal(p.state, 'needs_decision'); store.close();
});

test('the exact demo chat phrase moves the evening plan to 9 pm, privately', async () => {
  const { store, engine } = setup(); const p = await start(engine); engine.approve('ricky', p.id, p.revision);
  for (const id of MAIN_IDS.filter(x => x !== 'ricky')) engine.rsvp(id, p.id, 'in');
  await engine.chat('arnav', { text: "Can't do 8:30, could do 9", planId: p.id }); await engine.jobs.get(p.id);
  assert.equal(p.option.time, '21:00'); assert.equal(p.state, 'awaiting_approval'); assert.equal(p.previous.time, '20:30');
  assert.ok(!JSON.stringify(engine.state('ricky')).includes("Can't do 8:30, could do 9")); store.close();
});

test('invalid revisions are atomic, known prices are enforced, and media stays in its category', async () => {
  const { store, engine } = setup(); const p = await start(engine); const before = structuredClone(p.option);
  assert.throws(() => engine.revise('ricky', p.id, { option: { time: '21:00', allowance: -5 } }), /valid allowance/);
  assert.deepEqual(p.option, before);
  assert.ok(evaluatePrivate(engine.user('arnav').private, p.option, { price: 35 }).codes.includes('budget'));
  const item = engine.addItem('daniel', { name: 'A test album', category: 'Music' }); engine.review('daniel', { placeId: item.id, rating: 9.5, quote: 'A great album for a drive.', tags: [] });
  const recs = engine.recommend('ricky', 'music'); assert.equal(recs.length, 1); assert.equal(recs[0].place.id, item.id); store.close();
});

test('two-stop routes respect the full duration, total known cost, and separate fact caches', async () => {
  const { store, engine } = setup();
  engine.search = async place => ({ status: 'sourced', checkedAt: new Date().toISOString(), sources: [{ title: 'Test fixture', url: 'https://example.test' }], price: place.id === 'CBUS005' ? 0 : 12, dietary: [], open: true });
  const { planId } = engine.createPlan('ricky', { friends: ['aditya', 'arnav', 'daniel'], date: nextSaturday(), time: '19:00', allowance: 24, activityId: 'CBUS005' });
  await engine.jobs.get(planId); const p = engine.d.plans.find(p => p.id === planId);
  assert.equal(p.state, 'awaiting_approval'); assert.equal(p.option.activity.id, 'CBUS005');
  assert.equal(engine.d.facts[`${p.option.place.id}:${p.option.date}:${p.option.time}`].activity, undefined);
  const context = { ...engine.user('arnav').private, end: '21:30' };
  assert.ok(evaluatePrivate(context, p.option, p.facts).codes.includes('schedule'));
  assert.ok(evaluatePrivate(engine.user('arnav').private, p.option, { price: 12, activity: { price: 10 } }).codes.includes('budget'));
  store.close();
});

test('model-backed evaluators receive one private context and cannot leak prose into the channel', async () => {
  const prior = { provider: process.env.AGENT_PROVIDER, key: process.env.GEMINI_API_KEY }; process.env.AGENT_PROVIDER = 'gemini'; process.env.GEMINI_API_KEY = 'test-only-placeholder';
  const { store, engine } = setup(); const contexts = [];
  engine.model = async (_system, input) => { contexts.push(input); return { type: 'accept', reason: 'PRIVATE_MODEL_PROSE_SENTINEL', privateBudget: 999 }; };
  try {
    const p = await start(engine); assert.equal(p.state, 'awaiting_approval'); assert.ok(contexts.length >= 4);
    assert.ok(contexts.every(x => x.privateContext && !x.users && !x.otherUsers));
    assert.ok(!JSON.stringify(engine.state('ricky')).includes('PRIVATE_MODEL_PROSE_SENTINEL'));
  } finally { if (prior.provider === undefined) delete process.env.AGENT_PROVIDER; else process.env.AGENT_PROVIDER = prior.provider; if (prior.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prior.key; store.close(); }
});

test('HTTP auth boundary, private files, origin checks, independent sessions, and calendar gate', async t => {
  const { store, engine } = setup(); const { server } = createApp({ store, engine }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/state')).status, 401);
  assert.equal((await fetch(base + '/data/seed.json')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'ricky', password: 'disco2026' }) });
  const { token } = await login.json(); const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const state = await (await fetch(base + '/api/state?userId=arnav', { headers })).json(); assert.equal(state.me.id, 'ricky');
  const other = await fetch(base + '/api/settings', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: JSON.stringify({ budget: 0 }) }); assert.equal(other.status, 403);
  assert.equal((await fetch(base + '/')).status, 200); assert.equal((await fetch(base + '/demo')).status, 200);
  const p = await start(engine); assert.equal((await fetch(base + '/api/calendar?id=' + p.id, { headers })).status, 400);
});
