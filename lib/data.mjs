import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { resolve } from 'node:path';

export const MAIN_IDS = ['ricky', 'aditya', 'arnav', 'daniel'];
const idMap = { U001: 'ricky', U002: 'aditya', U003: 'arnav', U004: 'daniel' };
export const normalizeId = id => idMap[id] || String(id).replace(/^u_/, '');
export const uid = () => randomBytes(10).toString('hex');
export const passwordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex');
export function passwordMatches(password, salt, hash) {
  const a = Buffer.from(passwordHash(password, salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const publicUser = u => ({ id: u.id, name: u.name, area: u.area, color: u.color, fictional: u.fictional });
const score = sentiment => sentiment === 'positive' ? 8.5 : sentiment === 'negative' ? 3.5 : 6;

export function buildSeed(raw, password = 'disco2026') {
  const users = {};
  for (const [index, row] of raw.Users.entries()) {
    const id = normalizeId(row.user_id);
    const p = raw.Private_Context.find(p => p.user_id === row.user_id);
    const a = raw.Availability.find(p => p.user_id === row.user_id);
    const salt = randomBytes(16).toString('hex');
    users[id] = { id, name: row.name, area: row.home_area, color: ['purple', 'orange', 'green', 'blue'][index], fictional: false,
      salt, passwordHash: passwordHash(password, salt), friends: MAIN_IDS.filter(x => x !== id),
      private: { budget: Number(p.budget_limit_usd), dietary: p.dietary_preference, preferences: p.private_note, interests: row.likes,
        start: a.start_local, end: a.end_local, energy: 'medium', days: ['Saturday', 'Sunday'], memories: [] },
      chat: [], pendingMemory: null, saved: [], onboarded: false };
  }
  for (const row of raw['Demo People']) {
    const p = raw['Demo Private'].find(x => x.user_id === row.user_id);
    users[row.user_id] = { id: row.user_id, name: row.display_name, area: row.home_area, color: 'sand', fictional: true, friends: [],
      private: { budget: Number(p?.max_budget_usd || 25), dietary: p?.dietary_preference || '', preferences: p?.vibe_preference || '', interests: row.interests,
        start: '18:00', end: '23:00', energy: p?.energy || 'medium', days: ['Friday', 'Saturday', 'Sunday'], memories: [] }, saved: [], chat: [] };
  }
  for (const edge of raw['Demo Friendships']) {
    const a = normalizeId(edge.user_id_a), b = normalizeId(edge.user_id_b);
    if (users[a] && users[b]) { users[a].friends.push(b); users[b].friends.push(a); }
  }
  for (const user of Object.values(users)) user.friends = [...new Set(user.friends)];
  const places = {};
  for (const p of raw.Places) places[p.place_id] = { id: p.place_id, name: p.name, category: p.category, area: p.area, address: p.address,
    tags: p.search_tags.split(',').filter(Boolean), source: p.source_url, hours: p.opening_hours || null, price: p.price_usd ? Number(p.price_usd) : null, provenance: 'Workbook venue; details unverified' };
  for (const p of raw['OSM All Columbus']) places[p.place_id] = { id: p.place_id, name: p.name, category: p.category, area: p.osu_cluster === 'CORE' ? 'OSU campus' : p.osu_cluster === 'NEAR' ? 'Near OSU' : 'Columbus',
    address: p.address, tags: (p.cuisine || '').split(';').filter(Boolean), source: p.website || p.osm_url, osmUrl: p.osm_url,
    hours: p.opening_hours_raw || null, price: null, distance: Number(p.distance_osu_km), lat: Number(p.lat), lon: Number(p.lon), provenance: 'OpenStreetMap · unverified community data' };
  const reviews = raw.Opinions.map(r => ({ id: r.opinion_id, userId: normalizeId(r.user_id), placeId: r.place_id, quote: r.original_quote,
    rating: score(r.sentiment), tags: [r.tag], date: r.date, synthetic: true, likes: [] }));
  reviews.push(...raw['Demo Reviews'].map(r => ({ id: r.opinion_id, userId: r.user_id, placeId: r.place_id, quote: r.original_quote_demo,
    rating: score(r.sentiment), tags: [r.tag], date: '2026-10-21', synthetic: true, likes: [] })));
  return { version: 1, revision: 1, users, places, reviews, plans: [], facts: {}, requests: [], createdAt: new Date().toISOString() };
}

// The state blob is sealed with AES-256-GCM, so the database file alone never reveals private context.
// The key comes from DATA_KEY (32 bytes, base64) or a generated owner-only file next to the database.
export function dataKey(path) {
  if (process.env.DATA_KEY) {
    const key = Buffer.from(process.env.DATA_KEY, 'base64');
    if (key.length !== 32) throw new Error('DATA_KEY must be 32 random bytes, base64-encoded.');
    return key;
  }
  if (path === ':memory:') return randomBytes(32);
  const keyPath = path + '.key';
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  return Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64');
}
export function seal(key, text) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return 'enc:v1:' + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
export function unseal(key, stored) {
  if (!stored.startsWith('enc:v1:')) return stored; // Written before encryption existed; sealed on the next save.
  const raw = Buffer.from(stored.slice(7), 'base64'), decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  try { return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'); }
  catch { throw new Error('Could not decrypt the database: DATA_KEY or the .key file does not match it.'); }
}

export class Store {
  constructor({ path = process.env.DB_PATH || resolve('data/disco.sqlite'), seedPath = resolve('data/seed.json'), password, key } = {}) {
    if (path !== ':memory:') mkdirSync(resolve(path, '..'), { recursive: true });
    this.key = key || dataKey(path);
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)');
    const row = this.db.prepare('SELECT json FROM state WHERE id=1').get();
    this.data = row ? JSON.parse(unseal(this.key, row.json)) : buildSeed(JSON.parse(readFileSync(seedPath, 'utf8')), password || process.env.DEMO_PASSWORD || 'disco2026');
    // Client-supplied ids index these maps; without a prototype, "constructor" or "__proto__" cannot resolve to built-ins.
    for (const key of ['users', 'places', 'facts']) this.data[key] = Object.assign(Object.create(null), this.data[key]);
    const host = this.data.users[MAIN_IDS[0]];
    this.defaultPassword = !!host?.passwordHash && passwordMatches('disco2026', host.salt, host.passwordHash);
    this.listeners = new Set();
    // A restart must never leave an abandoned negotiation spinning forever.
    for (const plan of this.data.plans) if (plan.state === 'negotiating') { plan.state = 'needs_decision'; plan.issue = 'Planning was interrupted. Retry to continue.'; }
    this.save();
    // Migrating a plaintext database: rebuild the file so the old plaintext pages do not linger on disk.
    if (row && !row.json.startsWith('enc:v1:')) this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM');
    if (path !== ':memory:') for (const file of [path, path + '-wal', path + '-shm']) if (existsSync(file)) chmodSync(file, 0o600);
  }
  save() {
    this.data.revision++;
    this.db.prepare('INSERT INTO state(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(seal(this.key, JSON.stringify(this.data)));
    for (const listener of this.listeners) listener(this.data.revision);
  }
  login(username, password) {
    const user = this.data.users[username.toLowerCase().trim()];
    if (!user?.passwordHash || !passwordMatches(password, user.salt, user.passwordHash)) return null;
    const token = randomBytes(32).toString('hex');
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token), user.id, Date.now() + 24 * 3600_000);
    return { token, user: publicUser(user) };
  }
  authenticate(token) {
    if (!token) return null;
    const row = this.db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(tokenHash(token), Date.now());
    return row ? this.data.users[row.user_id] : null;
  }
  logout(token) { this.db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token)); }
  close() { this.db.close(); }
}
