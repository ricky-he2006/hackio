import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('profile uses the category dropdown layout for both place lists', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(source, /function profileScreen\(\) \{[\s\S]*profile-head/);
  assert.match(source, /data-action="cat-toggle"/);
  assert.match(source, /data-action="cat"/);
  assert.match(source, /const been = S\.myReviews/);
  assert.match(source, /items = \(ui\.ptab === 'been' \? been : want\)/);
});
