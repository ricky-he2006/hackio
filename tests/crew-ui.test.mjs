import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Store } from '../lib/data.mjs';
import { Engine } from '../lib/engine.mjs';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function crewHarness(api) {
  const context = { ui: {}, S: { defaultDate: '2026-10-31' }, api, tab() {}, render() {}, toast() {}, refresh: async () => {} };
  runInNewContext(source.slice(source.indexOf('function openCrew('), source.indexOf('async function finishQuick(')), context);
  return context;
}

test('inline crew keeps chat constraints and the selected venue; double clicks create only one plan', async () => {
  const calls = [], c = crewHarness(async (path, body) => { calls.push({ path, body }); });
  c.openCrew({ friends: ['aditya'], placeId: 'chosen', query: 'pizza', draft: { date: '2026-11-02', time: '14:00', allowance: 17 } });
  await Promise.all([c.startCrew(), c.startCrew()]);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { path: '/plans', body: { date: '2026-11-02', time: '14:00', allowance: 17, title: 'Dinner with the crew', friends: ['aditya'], placeId: 'chosen', query: 'pizza' } });
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
