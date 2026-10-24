// Minimal QR Code encoder (byte mode, error correction level M, versions 1–10) for invite links.
// Follows ISO/IEC 18004 structure; adapted from the public-domain approach in Project Nayuki's QR generator.
const RAW = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
function divisor(degree) {
  const r = Array(degree - 1).fill(0).concat(1); let root = 1;
  for (let i = 0; i < degree; i++) { for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); }
  return r;
}
function remainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); }
  return r;
}

function codewords(bytes, version) {
  const capacity = RAW[version] - ECC[version] * BLOCKS[version], bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(4, 4); push(bytes.length, version < 10 ? 8 : 16); for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length)); push(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < capacity * 8; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
  const blocks = BLOCKS[version], shortLen = Math.floor(RAW[version] / blocks), shortCount = blocks - RAW[version] % blocks, ec = ECC[version], div = divisor(ec);
  const parts = []; let k = 0;
  for (let i = 0; i < blocks; i++) { const len = shortLen - ec + (i < shortCount ? 0 : 1); const d = data.slice(k, k + len); k += len; parts.push({ d, e: remainder(d, div) }); }
  const out = [], maxData = Math.max(...parts.map(p => p.d.length));
  for (let i = 0; i < maxData; i++) for (const p of parts) if (i < p.d.length) out.push(p.d[i]);
  for (let i = 0; i < ec; i++) for (const p of parts) out.push(p.e[i]);
  return out;
}

function build(version, data, mask) {
  const size = version * 4 + 17, m = Array.from({ length: size }, () => Array(size).fill(false)), fn = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
  }
  const al = ALIGN[version], last = al.length - 1;
  al.forEach((ay, i) => al.forEach((ax, j) => { if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
  const format = () => {
    const d = mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((d << 10) | rem) ^ 0x5412, bit = i => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i)); set(8, size - 8, true);
  };
  format();
  if (version >= 7) {
    let rem = version; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem; for (let i = 0; i < 18; i++) { const dark = ((bits >>> i) & 1) === 1, a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, dark); set(b, a, dark); }
  }
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && i < data.length * 8) { m[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  const rule = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0][mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && rule(x, y)) m[y][x] = !m[y][x];
  return m;
}

function penalty(m) {
  const n = m.length; let score = 0, dark = 0;
  for (let y = 0; y < n; y++) for (const line of [m[y], m.map(r => r[y])]) { let run = 1; for (let x = 1; x <= n; x++) { if (x < n && line[x] === line[x - 1]) run++; else { if (run >= 5) score += run - 2; run = 1; } } }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  for (const row of m) for (const c of row) if (c) dark++;
  return score + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const version = RAW.findIndex((raw, v) => v > 0 && raw - ECC[v] * BLOCKS[v] >= bytes.length + (v < 10 ? 2 : 3));
  if (version < 1) throw new Error('Link is too long for a QR code.');
  const data = codewords(bytes, version);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) { const m = build(version, data, mask), s = penalty(m); if (s < bestScore) { best = m; bestScore = s; } }
  return best;
}

export function qrSvg(text, { dark = '#1D1A2F', light = '#FFFFFF' } = {}) {
  const m = qrMatrix(text), n = m.length + 8; let d = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg viewBox="0 0 ${n} ${n}" role="img" aria-label="QR code for your invite link" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
