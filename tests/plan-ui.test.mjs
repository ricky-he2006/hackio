import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('pending invitees get direct RSVP actions from plan details', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const details = source.slice(source.indexOf('function detailsScreen'), source.indexOf('/* Change something'));
  const footer = details.slice(details.indexOf('const footer'), details.indexOf('const history'));

  assert.match(footer, /data-action="rsvp-in"/);
  assert.match(footer, /data-action="rsvp-out"/);
  assert.doesNotMatch(details.slice(0, details.indexOf('const footer')), /data-action="invite"/);
});

test('plan creator has a cancel action while the plan is still being worked out', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const working = source.slice(source.indexOf('function workingScreen'), source.indexOf('const SORTED'));
  const approve = source.slice(source.indexOf('function approveScreen'), source.indexOf('/* 5 · Invite'));

  assert.match(working, /data-action="cancel"/);
  assert.match(working, /class="btn lg" data-action="cancel"/);
  assert.match(approve, /data-action="cancel"/);
});

test('every non-host invitee routes to the invitation screen before confirmation', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const routing = source.slice(source.indexOf('function planRoute'), source.indexOf('const findPlan'));

  assert.match(routing, /return \['invited', 'needs_decision'\]\.includes\(p\.state\) \? 'invite' : 'details';/);
});

test('creator cancellation lives in the details bottom bar, not the venue-details row', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const details = source.slice(source.indexOf('function detailsScreen'), source.indexOf('/* Change something'));
  const footer = details.slice(details.indexOf('const footer'), details.indexOf('const history'));
  const content = details.slice(details.indexOf('<div class="row wrap gap-8">'));

  assert.match(footer, /cancelButton/);
  assert.doesNotMatch(content, /data-action="cancel"/);
});
