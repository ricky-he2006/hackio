import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, MAIN_IDS } from '../lib/data.mjs';
import { Engine, nextSaturday, listedHours } from '../lib/engine.mjs';

function setup(t) {
  const store = new Store({ path: ':memory:' });
  const engine = new Engine(store, { delay: 0, model: async () => null, search: async () => ({ status: 'unavailable', sources: [] }) });
  for (const id of MAIN_IDS) engine.settings(id, { budget: 100, start: '09:00', end: '23:00', dietary: 'none', days: ['Saturday', 'Sunday'] });
  t.after(async () => { await Promise.all(engine.jobs.values()); store.close(); });
  return engine;
}
async function ready(engine, extra = {}) {
  const { planId } = engine.createPlan('ricky', { friends: ['aditya'], date: nextSaturday(), time: '19:00', allowance: 20, ...extra });
  await engine.jobs.get(planId);
  const p = engine.planFor('ricky', planId);
  assert.equal(p.state, 'awaiting_approval');
  return p;
}
function opportunity(engine, ids = ['ricky', 'aditya'], settings = {}) {
  const venue = engine.quickPicks('ricky')[0].place.id;
  for (const id of ids) engine.proactiveSettings(id, { enabled: true, shareSavedPlaces: true, quietHours: { start: '00:00', end: '00:00' }, ...settings });
  for (const id of ids) engine.savePlace(id, venue);
  return engine.d.opportunities.find(o => o.status === 'awaiting_interest');
}

test('a rejected adventure chat does not permanently lock the user’s agent', async t => {
  const e = setup(t);
  await assert.rejects(e.chat('ricky', { text: 'hello', planId: 'missing' }), /not found/);
  await assert.doesNotReject(e.chat('ricky', { text: 'hello' }));
  assert.equal(e.chatLocks.size, 0);
});

test('failed revisions cannot be confirmed by stale RSVPs or the host', async t => {
  const e = setup(t), p = await ready(e);
  e.approve('ricky', p.id, p.revision);
  e.revise('aditya', p.id, { constraints: { days: [] } }); await e.jobs.get(p.id);
  assert.equal(p.state, 'needs_decision');
  assert.equal(e.planView(p, 'aditya').canRsvp, false);
  for (const id of p.participants) assert.throws(() => e.rsvp(id, p.id, 'in'), /Wait for the host/);
  assert.equal(p.state, 'needs_decision');
});

test('RSVP rechecks changed requirements and prevents double booking', async t => {
  const e = setup(t), p = await ready(e);
  e.approve('ricky', p.id, p.revision);
  e.calendarBlock('aditya', { date: p.option.date, start: '18:00', end: '22:00', title: 'Private appointment' });
  assert.throws(() => e.rsvp('aditya', p.id, 'in'), /changed/);
  assert.equal(p.rsvps.aditya, 'pending');
  assert.equal(p.state, 'invited');
});

test('a decline still allows remaining guests to reply without marking an unapproved change', async t => {
  const e = setup(t), p = await ready(e, { friends: ['aditya', 'daniel'] });
  e.approve('ricky', p.id, p.revision); e.rsvp('aditya', p.id, 'out');
  assert.equal(e.planView(p, 'daniel').hasPendingChange, false);
  assert.equal(e.planView(p, 'daniel').canRsvp, true);
  e.rsvp('daniel', p.id, 'in'); assert.equal(p.state, 'needs_decision');
});

test('multiple revisions preserve the last approved original for keeping the plan', async t => {
  const e = setup(t), p = await ready(e, { friends: ['aditya', 'daniel'] });
  e.approve('ricky', p.id, p.revision);
  e.rsvp('aditya', p.id, 'in'); e.rsvp('daniel', p.id, 'in');
  e.revise('aditya', p.id, { constraints: { start: '20:00' } }); await e.jobs.get(p.id);
  e.revise('aditya', p.id, { constraints: { start: '21:00' } }); await e.jobs.get(p.id);
  assert.equal(p.previous.time, '19:00');
  e.dropParticipant('ricky', p.id, 'aditya');
  assert.equal(p.option.time, '19:00'); assert.equal(p.state, 'confirmed');
});

test('changed-plan notifications use the current revision and stop after approval', async t => {
  const e = setup(t), p = await ready(e, { friends: ['aditya', 'daniel'] });
  e.approve('ricky', p.id, p.revision);
  e.revise('aditya', p.id, { constraints: { start: '20:00' } }); await e.jobs.get(p.id);
  assert.ok(e.notifications('daniel').some(n => n.kind === 'plan_changed'));
  assert.match(e.notifications('ricky').find(n => n.kind === 'approval').title, /change/);
  e.approve('ricky', p.id, p.revision);
  assert.ok(!e.notifications('daniel').some(n => n.kind === 'plan_changed'));
});

test('a closed verdict for one time does not eliminate all other times', async t => {
  const e = setup(t);
  e.search = async (place, date, time) => ({ status: 'sourced', open: time !== '19:00', checkedAt: new Date().toISOString(), sources: [] });
  const p = await ready(e);
  assert.notEqual(p.option.time, '19:00'); assert.equal(p.facts.open, true);
});

test('proactive retries return only a plan id, never raw private plan overrides', async t => {
  const e = setup(t), o = opportunity(e);
  for (const id of ['ricky', 'aditya']) e.respondProactive(id, o.id, 'accepted');
  const result = e.startProactivePlan('ricky', o.id); await e.jobs.get(result.planId);
  e.planFor('ricky', result.planId).overrides.aditya = { preferences: 'PRIVATE_SENTINEL' };
  assert.deepEqual(e.startProactivePlan('ricky', o.id), result);
  assert.equal(e.d.plans.length, 1);
});

test('proactive consent is invalidated when a participant disables sharing', t => {
  const e = setup(t), o = opportunity(e);
  for (const id of ['ricky', 'aditya']) e.respondProactive(id, o.id, 'accepted');
  e.proactiveSettings('aditya', { shareSavedPlaces: false });
  assert.throws(() => e.startProactivePlan('ricky', o.id), /consent/);
  assert.equal(e.state('aditya').proactive.opportunities.length, 0);
  assert.ok(!e.notifications('aditya').some(n => n.kind === 'proactive_interest'));
});

test('expired proactive prompts and groups with one person cannot start planning', t => {
  const e = setup(t), o = opportunity(e);
  o.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => e.respondProactive('ricky', o.id, 'accepted'), /no longer/);
  assert.equal(o.status, 'expired');
  const fresh = e.proactiveOpportunities('ricky').find(x => x.id !== o.id);
  // Daily notification limits can defer the fresh prompt, but its record remains private.
  const next = fresh || e.d.opportunities.find(x => x.id !== o.id);
  e.respondProactive('ricky', next.id, 'accepted'); e.respondProactive('aditya', next.id, 'declined');
  assert.throws(() => e.startProactivePlan('ricky', next.id), /consent/);
  assert.equal(e.d.opportunities.find(x => x.id === next.id).status, 'cancelled');
});

test('proactive friend allowlists apply between every pair in the group', t => {
  const e = setup(t);
  const o = opportunity(e, ['ricky', 'aditya', 'daniel']);
  e.proactiveSettings('aditya', { allowedFriends: ['ricky'] });
  assert.equal(o.status, 'cancelled');
  for (const group of e.d.opportunities.filter(x => ['awaiting_interest', 'consented'].includes(x.status))) {
    const ids = group.participants.map(p => p.userId);
    assert.ok(!(ids.includes('aditya') && ids.includes('daniel')));
  }
});

test('suppressed proactive prompts stay hidden and deliver when notifications are enabled', t => {
  const e = setup(t), o = opportunity(e, ['ricky', 'aditya'], { notificationFrequency: 'never' });
  assert.ok(o); assert.equal(e.proactiveOpportunities('ricky').length, 0);
  e.proactiveSettings('ricky', { notificationFrequency: 'daily' });
  assert.equal(e.proactiveOpportunities('ricky')[0].id, o.id);
});

test('forgetting memories out of order cannot resurrect a forgotten budget', async t => {
  const e = setup(t), initial = e.user('ricky').private.budget;
  for (const budget of [20, 30]) {
    await e.chat('ricky', { text: `budget ${budget}` });
    e.memory('ricky', { action: 'save', pendingId: e.user('ricky').pendingMemory.id });
  }
  const ids = e.user('ricky').private.memories.map(m => m.id);
  for (const memoryId of ids) e.memory('ricky', { action: 'forget', memoryId });
  assert.equal(e.user('ricky').private.budget, initial);
});

test('night ratings validate every stop before publishing any review, and edits preserve the adventure link', async t => {
  const e = setup(t), activity = e.state('ricky').activities[0];
  const p = await ready(e, { activityId: activity.id });
  e.approve('ricky', p.id, p.revision); e.rsvp('aditya', p.id, 'in');
  const before = JSON.stringify(e.d.reviews);
  assert.throws(() => e.rateNight('ricky', p.id, { stops: [{ placeId: p.option.place.id, rating: 8 }, { placeId: activity.id, rating: 99 }] }), /Rating/);
  assert.equal(JSON.stringify(e.d.reviews), before);
  e.rateNight('ricky', p.id, { stops: [{ placeId: p.option.place.id, rating: 8 }] });
  const r = e.d.reviews.find(r => r.planId === p.id);
  e.review('ricky', { reviewId: r.id, placeId: r.placeId, rating: 9, quote: 'Updated opinion' });
  assert.equal(e.planView(p, 'ricky').myNightRating, 9);
});

test('unknown opening-hours syntax remains unknown rather than falsely closed', () => {
  assert.equal(listedHours('by appointment', 'Saturday'), null);
  assert.equal(listedHours('PH off', 'Saturday'), null);
  assert.deepEqual(listedHours('Mo-Fr 09:00-17:00', 'Saturday'), []);
});

test('match cards account for private busy blocks and keep the result coarse', t => {
  const e = setup(t), date = nextSaturday();
  for (const id of ['ricky', 'aditya']) e.settings(id, { start: '18:00', end: '22:00', days: ['Saturday'] });
  e.calendarBlock('aditya', { date, start: '18:00', end: '22:00', title: 'SECRET' });
  assert.equal(e.sharedWindow(['ricky', 'aditya']), null);
});

test('the last agreed slot stays reserved while agents work on a revision', async t => {
  const e = setup(t), p = await ready(e);
  e.approve('ricky', p.id, p.revision); e.rsvp('aditya', p.id, 'in');
  e.revise('aditya', p.id, { constraints: { start: '20:00' } }); await e.jobs.get(p.id);
  assert.equal(e.busy('ricky')[0].start, '19:00');
  assert.equal(e.busy('aditya')[0].start, '19:00');
});

test('main-chat plan drafts preserve explicit times, dates, and a useful untitled crew name', t => {
  const e = setup(t);
  assert.equal(e.planFromText('plan dinner saturday at 9 pm', []).time, '21:00');
  assert.equal(e.planFromText('plan coffee saturday at 9 am', []).time, '09:00');
  assert.equal(e.planFromText('plan dinner at 8:30', []).time, '20:30');
  assert.equal(e.planFromText('plan dinner 2026-11-07', []).date, '2026-11-07');
  assert.ok(!e.planFromText('plan dinner saturday', []).title.includes('undefined'));
});

test('adventure intent sees its own conversation and private plan overrides', async t => {
  const e = setup(t), p = await ready(e);
  p.overrides.ricky = { budget: 12 };
  e.addChat('ricky', 'user', 'MAIN_ONLY');
  e.addChat('ricky', 'user', 'THREAD_ONLY', { planId: p.id });
  let input;
  e.model = async (_system, data) => { input = data; return { intent: 'chat', reply: 'Hello' }; };
  await e.chat('ricky', { planId: p.id, text: 'hello' });
  assert.equal(input.myContext.budget, 12);
  assert.ok(input.recentConversation.some(m => m.text === 'THREAD_ONLY'));
  assert.ok(!input.recentConversation.some(m => m.text === 'MAIN_ONLY'));
});

test('negative diet tags and optional preferences cannot bypass hard dietary checks', async t => {
  const e = setup(t), p = await ready(e);
  e.settings('ricky', { dietary: 'halal' });
  p.facts = { dietary: ['not halal'] };
  assert.ok(e.check('ricky', p, p.option).codes.includes('dietary_unverified'));
  e.review('ricky', { placeId: p.option.place.id, rating: 9, quote: 'Nice atmosphere', tags: ['non-halal'] });
  assert.ok(!e.vouchedDiets('ricky', p.option.place.id).includes('halal'));
  e.settings('ricky', { dietary: 'vegetarian preferred; peanut allergy' });
  p.facts = { dietary: ['vegetarian'] };
  assert.ok(e.check('ricky', p, p.option).codes.includes('dietary_unverified'));
  e.settings('ricky', { dietary: 'gluten-free' });
  p.facts = { dietary: ['contains gluten'] };
  assert.ok(e.check('ricky', p, p.option).codes.includes('dietary_unverified'));
  p.facts = { dietary: ['gluten-free'] };
  assert.equal(e.check('ricky', p, p.option).type, 'accept');
});

test('times in outing requests create drafts or recommendations, not private memory changes', async t => {
  const e = setup(t);
  await e.chat('ricky', { text: 'plan dinner saturday after 9 pm with the crew' });
  assert.equal(e.user('ricky').chat.at(-1).kind, 'planDraft');
  assert.equal(e.user('ricky').chat.at(-1).draft.time, '21:00');
  assert.equal(e.user('ricky').pendingMemory, null);
  await e.chat('ricky', { text: 'recommend restaurants open after 7 pm' });
  assert.equal(e.user('ricky').chat.at(-1).kind, 'recommendations');
  assert.equal(e.user('ricky').pendingMemory, null);
});

test('legacy revised invitations remain answerable when opened after the audit upgrade', async t => {
  const e = setup(t), p = await ready(e);
  e.approve('ricky', p.id, p.revision);
  delete p.approvedRevision; p.changeBy = 'ricky';
  assert.equal(e.planView(p, 'aditya').canRsvp, true);
  e.rsvp('aditya', p.id, 'in'); assert.equal(p.state, 'confirmed');
});

test('forgetting an older duplicate memory keeps the later consented value', async t => {
  const e = setup(t), initial = e.user('ricky').private.budget;
  for (let i = 0; i < 2; i++) {
    await e.chat('ricky', { text: 'budget 20' });
    e.memory('ricky', { action: 'save', pendingId: e.user('ricky').pendingMemory.id });
  }
  const ids = e.user('ricky').private.memories.map(m => m.id);
  e.memory('ricky', { action: 'forget', memoryId: ids[0] });
  assert.equal(e.user('ricky').private.budget, 20);
  e.memory('ricky', { action: 'forget', memoryId: ids[1] });
  assert.equal(e.user('ricky').private.budget, initial);
});

test('HTTP rejects null, arrays, and primitive JSON bodies with a client error', async () => {
  const { createApp } = await import('../server.mjs');
  const store = new Store({ path: ':memory:' }), { server } = createApp({ store });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    for (const body of ['null', '[]', '42', '"hello"']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, 400); assert.match((await response.json()).error, /JSON object/);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); }
});
