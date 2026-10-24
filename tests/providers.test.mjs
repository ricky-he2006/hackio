import test from 'node:test';
import assert from 'node:assert/strict';
import { modelJson, searchPlace } from '../lib/providers.mjs';

test('Gemini and NVIDIA adapters make the documented structured requests', async () => {
  const saved = { ...process.env }, originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, ...options, body: JSON.parse(options.body) }); return Response.json(String(url).includes('nvidia') ? { choices: [{ message: { content: '{"intent":"context","patch":{"budget":20}}' } }] } : { candidates: [{ content: { parts: [{ text: '{"intent":"context","patch":{"budget":20}}' }] } }] }); };
  try {
    process.env.AGENT_PROVIDER = 'gemini'; process.env.GEMINI_API_KEY = 'test-only';
    assert.equal((await modelJson('Return JSON', { message: 'Under $20' })).patch.budget, 20);
    assert.ok(requests[0].url.includes(':generateContent')); assert.equal(requests[0].headers['x-goog-api-key'], 'test-only');
    assert.equal(requests[0].body.generationConfig.responseMimeType, 'application/json');
    process.env.AGENT_PROVIDER = 'nvidia'; process.env.NVIDIA_API_KEY = 'test-only';
    assert.equal((await modelJson('Return JSON', { message: 'Under $20' })).patch.budget, 20);
    assert.equal(requests[1].url, 'https://integrate.api.nvidia.com/v1/chat/completions'); assert.equal(requests[1].body.messages[0].role, 'system');
  } finally { globalThis.fetch = originalFetch; for (const key of ['AGENT_PROVIDER', 'GEMINI_API_KEY', 'NVIDIA_API_KEY']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});

test('web lookup has no private context and does not promote uncited model claims', async () => {
  const saved = { ...process.env }, originalFetch = globalThis.fetch; let request;
  process.env.GEMINI_API_KEY = 'test-only'; process.env.ENABLE_WEB_SEARCH = 'true';
  globalThis.fetch = async (_url, options) => { request = JSON.parse(options.body); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Could not verify.', price: 12, open: true, dietary: ['vegan'] }) }] } }] }); };
  try {
    const result = await searchPlace({ name: 'Example Restaurant', area: 'Columbus', private: { budget: 9876, reason: 'secret' } }, '2026-10-24', '19:00');
    assert.equal(result.status, 'unverified'); assert.equal(result.open, null); assert.equal(result.price, null); assert.deepEqual(result.dietary, []);
    assert.ok(!JSON.stringify(request).includes('9876')); assert.ok(!JSON.stringify(request).includes('secret'));
    assert.deepEqual(request.tools, [{ google_search: {} }]);
  } finally { globalThis.fetch = originalFetch; for (const key of ['GEMINI_API_KEY', 'ENABLE_WEB_SEARCH']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
