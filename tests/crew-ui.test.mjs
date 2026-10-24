import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Store } from '../lib/data.mjs';
import { Engine } from '../lib/engine.mjs';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function crewHarness(api) {
  const context = { ui: {}, drafts: {}, go() {}, S: { defaultDate: '2026-10-31' }, api, tab() {}, render() {}, toast() {}, refresh: async () => {} };
  runInNewContext(source.slice(source.indexOf('function openCrew('), source.indexOf('async function finishQuick(')), context);
  return context;
}

test('inline crew keeps chat constraints and the selected venue; double clicks create only one plan', async () => {
  const calls = [], c = crewHarness(async (path, body) => { calls.push({ path, body }); });
  c.openCrew({ friends: ['aditya'], placeId: 'chosen', query: 'pizza', draft: { date: '2026-11-02', time: '14:00', allowance: 17 } });
  await Promise.all([c.startCrew(), c.startCrew()]);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { path: '/plans', body: { date: '2026-11-02', time: '14:00', allowance: 17, title: 'Dinner with the crew', friends: ['aditya'], placeId: 'chosen', query: 'pizza',
    // The draft conversation carries over to start the adventure's own chat.
    transcript: [{ role: 'agent', text: 'What would make this a good outing? Tell me the food, day, time, and spending limit you have in mind, then pick your crew.' }] } });
});

test('failed crew submission reopens the picker for retry', async () => {
  const c = crewHarness(async () => { throw new Error('Offline'); });
  c.openCrew({ friends: ['daniel'] }); await c.startCrew();
  assert.equal(c.ui.crew.open, true); assert.ok(c.ui.crew.friends.has('daniel'));
});

test('chat crew drafts preserve the requested weekday and lunch time', async () => {
  const store = new Store({ path: ':memory:' }), engine = new Engine(store, { delay: 0 });
  try {
    await engine.chat('ricky', { text: 'plan lunch monday with the crew' });
    const m = engine.user('ricky').chat.at(-1);
    assert.equal(m.kind, 'planDraft'); assert.equal(m.draft.time, '14:00');
    assert.equal(new Date(m.draft.date + 'T12:00:00Z').getUTCDay(), 1);
    assert.equal(engine.d.plans.length, 0, 'picking a crew still precedes creating a plan');
  } finally { store.close(); }
});

test('adventure scratch chat is private and side-effect free across follow-up edits', async () => {
  const store = new Store({ path: ':memory:' }), engine = new Engine(store, { delay: 0 });
  engine.model = async () => null;
  try {
    const before = JSON.stringify(store.data);
    const first = await engine.adventureDraft('ricky', { text: 'pizza friday at 7 pm under $20 with daniel', draft: {} });
    assert.equal(first.draft.time, '19:00'); assert.equal(first.draft.allowance, 20);
    assert.deepEqual(first.draft.friends, ['daniel']); assert.match(first.draft.query, /pizza/);
    const next = await engine.adventureDraft('ricky', { text: 'something quiet, at 8:30 pm instead', draft: first.draft });
    assert.equal(next.draft.time, '20:30'); assert.equal(next.draft.date, first.draft.date);
    assert.equal(next.draft.allowance, 20); assert.deepEqual(next.draft.friends, ['daniel']);
    assert.equal(JSON.stringify(store.data), before, 'no chats, memories, plans, or state writes while drafting');
    const removed = await engine.adventureDraft('ricky', { text: 'without daniel, bring aditya', draft: next.draft });
    assert.deepEqual(removed.draft.friends, ['aditya']);
  } finally { store.close(); }
});

test('discarded temporary chat cannot be restored by an in-flight reply', async () => {
  let finish; const c = crewHarness(() => new Promise(resolve => { finish = resolve; }));
  c.openCrew({ friends: ['daniel'] });
  const pending = c.sendAdventureDraft('pizza');
  c.ui.crew = { open: false, friends: new Set() };
  finish({ draft: { friends: ['daniel'], query: 'pizza' }, reply: 'Updated' }); await pending;
  assert.equal(c.ui.crew.open, false); assert.equal(c.ui.crew.messages, undefined);
});
