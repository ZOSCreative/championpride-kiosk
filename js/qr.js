/* Minimal inline QR code generator (byte mode, ECC level L, versions 1-10, no dependencies).
   Algorithm follows the public QR spec (ISO 18004) as commonly implemented. PK.qr.svg(text) -> SVG string. */
(function (g) {
  'use strict';
  var ECC_PER_BLOCK = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
  var NUM_BLOCKS = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
  var ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function rawModules(v) {
    var s = v * 4 + 17, r = s * s - 192 - 2 * (s - 16) - 31 - 0; // finder+sep(192), timing(2*(s-16)), format(31 incl dark)
    // exact: 16*v*v + 128*v + 64 minus alignment/version
    r = (16 * v + 128) * v + 64;
    if (v >= 2) { var na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(v) { return Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v - 1] * NUM_BLOCKS[v - 1]; }

  // GF(256) / Reed-Solomon
  function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
  function rsDivisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (i = 0; i < deg; i++) { for (var j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= mul(c, f); }); });
    return r;
  }

  function utf8(str) { return Array.prototype.slice.call(new TextEncoder().encode(str)); }

  function encode(text) {
    var bytes = utf8(text), v;
    for (v = 1; v <= 10; v++) { var cap = dataCodewords(v) * 8, cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= cap) break; }
    if (v > 10) throw new Error('QR text too long');
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
    var capBits = dataCodewords(v) * 8;
    put(0, Math.min(4, capBits - bits.length)); while (bits.length % 8) bits.push(0);
    for (var pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = []; for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; data.push(b); }
    // blocks
    var nb = NUM_BLOCKS[v - 1], ecl = ECC_PER_BLOCK[v - 1], raw = Math.floor(rawModules(v) / 8);
    var shortLen = Math.floor(raw / nb), numShort = nb - raw % nb, div = rsDivisor(ecl), blocks = [], pos = 0;
    for (i = 0; i < nb; i++) {
      var dl = shortLen - ecl + (i < numShort ? 0 : 1), d = data.slice(pos, pos + dl); pos += dl;
      var e = rsRemainder(d, div); if (i < numShort) d.push(0); blocks.push(d.concat(e));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (bl, j) { if (i !== shortLen - ecl || j >= numShort) out.push(bl[i]); });
    return { v: v, cw: out };
  }

  function build(text) {
    var enc = encode(text), v = enc.v, size = v * 4 + 17, mod = [], fn = [];
    for (var y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function set(x, y, d) { mod[y][x] = d; fn[y][x] = true; }
    function finder(cx, cy) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue; var d = Math.max(Math.abs(dx), Math.abs(dy)); set(xx, yy, d !== 2 && d !== 4); } }
    for (var i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var al = ALIGN[v - 1] || [];
    al.forEach(function (ax, ia) { al.forEach(function (ay, ib) {
      if ((ia === 0 && ib === 0) || (ia === 0 && ib === al.length - 1) || (ia === al.length - 1 && ib === 0)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function format(mask) {
      var d = (1 << 3) | mask, r = d; for (var k = 0; k < 10; k++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bits = ((d << 10) | r) ^ 0x5412;
      function bit(k) { return ((bits >>> k) & 1) !== 0; }
      for (var k = 0; k <= 5; k++) set(8, k, bit(k));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (k = 9; k < 15; k++) set(14 - k, 8, bit(k));
      for (k = 0; k < 8; k++) set(size - 1 - k, 8, bit(k));
      for (k = 8; k < 15; k++) set(8, size - 15 + k, bit(k));
      set(8, size - 8, true);
    }
    format(0);
    if (v >= 7) {
      var r2 = v; for (i = 0; i < 12; i++) r2 = (r2 << 1) ^ ((r2 >>> 11) * 0x1F25);
      var vb = (v << 12) | r2;
      for (i = 0; i < 18; i++) { var bt = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, bt); set(b, a, bt); }
    }
    // codewords
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, yy = up ? size - 1 - vert : vert;
        if (!fn[yy][x] && bi < enc.cw.length * 8) { mod[yy][x] = ((enc.cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    // choose mask by penalty
    function apply(m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var inv; switch (m) { case 0: inv = (x + y) % 2 === 0; break; case 1: inv = y % 2 === 0; break; case 2: inv = x % 3 === 0; break; case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break; case 5: inv = x * y % 2 + x * y % 3 === 0; break; case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break; default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0; }
      if (!fn[y][x] && inv) mod[y][x] = !mod[y][x]; } }
    function penalty() {
      var p = 0, y, x, k;
      function runs(get) { for (var a = 0; a < size; a++) { var run = 1; for (var b = 1; b < size; b++) { if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } } }
      runs(function (a, b) { return mod[a][b]; }); runs(function (a, b) { return mod[b][a]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) { var c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      var pat = [true, false, true, true, true, false, true, false, false, false, false], pat2 = pat.slice().reverse();
      function match(get, a, b, pt) { for (var k = 0; k < 11; k++) if (get(a, b + k) !== pt[k]) return false; return true; }
      for (y = 0; y < size; y++) for (x = 0; x + 11 <= size; x++) { if (match(function (a, b) { return mod[a][b]; }, y, x, pat) || match(function (a, b) { return mod[a][b]; }, y, x, pat2)) p += 40; }
      for (x = 0; x < size; x++) for (y = 0; y + 11 <= size; y++) { if (match(function (a, b) { return mod[b][a]; }, x, y, pat) || match(function (a, b) { return mod[b][a]; }, x, y, pat2)) p += 40; }
      var dark = 0; mod.forEach(function (r) { r.forEach(function (d) { if (d) dark++; }); });
      k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1; p += Math.max(0, k) * 10;
      return p;
    }
    var best = 0, bestP = 1e9;
    for (var m = 0; m < 8; m++) { apply(m); format(m); var pn = penalty(); if (pn < bestP) { best = m; bestP = pn; } apply(m); }
    apply(best); format(best);
    return mod;
  }

  function svg(text, opts) {
    opts = opts || {};
    var mod = build(text), n = mod.length, q = 4, fg = opts.fg || '#002D4B', bg = opts.bg || '#FFFFFF', d = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (mod[y][x]) d += 'M' + (x + q) + ',' + (y + q) + 'h1v1h-1z';
    var t = n + q * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="' + bg + '"/><path d="' + d + '" fill="' + fg + '"/></svg>';
  }
  g.PK = g.PK || {}; g.PK.qr = { svg: svg, matrix: build };
  if (typeof module !== 'undefined') module.exports = g.PK.qr;
})(typeof window !== 'undefined' ? window : globalThis);
