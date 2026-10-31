/* Pocket Protocol kiosk - analysis. Only what a phone in a pocket can measure:
   sway amplitude, left-right symmetry, rhythm/tempo, steadiness events (spikes).
   No OBI, no weight distribution, no diagnosis. */
(function (g) {
  'use strict';
  var G = 9.80665;

  /* Sample format everywhere: {t, ax, ay, az, gx, gy, gz}  (t seconds, accel incl. gravity m/s2, gyro deg/s)
     Same contract as PocketProtocol capture.tsx / telemetry.ts. */

  function mags(s) { var m = new Array(s.length); for (var i = 0; i < s.length; i++) m[i] = Math.sqrt(s[i].ax * s[i].ax + s[i].ay * s[i].ay + s[i].az * s[i].az); return m; }

  /* Port of detectPelvicStaticSpikes (sovereign-equine-insights/src/lib/telemetry.server.ts):
     rolling-window variance of accel magnitude, window 0.5 s, threshold = 2.5 x whole-session variance,
     contiguous candidate windows collapse to their single highest-variance sample.
     ONE addition for a kiosk: an absolute floor (minVar, (m/s2)^2) so a perfectly still session with
     only sensor noise cannot flag its own noise as events. Pass minVar:0 for the exact original. */
  function detectSpikes(samples, rateHz, opts) {
    opts = opts || {};
    var rate = rateHz > 0 ? rateHz : 50;
    var windowSeconds = opts.windowSeconds != null ? opts.windowSeconds : 0.5;
    var win = Math.max(4, Math.round(rate * windowSeconds));
    if (samples.length < win) return [];
    var m = mags(samples), n = m.length, i;
    var mean = 0; for (i = 0; i < n; i++) mean += m[i]; mean /= n;
    var gv = 0; for (i = 0; i < n; i++) gv += (m[i] - mean) * (m[i] - mean); gv /= n;
    var minVar = opts.minVar != null ? opts.minVar : 0.5;
    var threshold = opts.threshold != null ? opts.threshold : Math.max(gv * 2.5, 1e-6, minVar);
    var sum = 0, sumSq = 0;
    for (i = 0; i < win; i++) { sum += m[i]; sumSq += m[i] * m[i]; }
    var spikes = [], run = null;
    for (var end = win - 1; end < n; end++) {
      if (end >= win) { var inV = m[end], outV = m[end - win]; sum += inV - outV; sumSq += inV * inV - outV * outV; }
      var mu = sum / win, variance = Math.max(0, sumSq / win - mu * mu);
      var c = end - Math.floor(win / 2), smp = samples[c] || samples[end];
      if (variance > threshold) {
        var cand = { ride_time_seconds: +smp.t.toFixed(3), magnitude: +variance.toFixed(6) };
        if (!run || cand.magnitude > run.magnitude) run = cand;
      } else if (run) { spikes.push(run); run = null; }
    }
    if (run) spikes.push(run);
    return spikes;
  }

  /* Side-to-side tilt of the phone in degrees (what the pelvis does to a pocketed, upright phone). */
  function tilt(s) { var v = s.ax / G; v = v > 1 ? 1 : v < -1 ? -1 : v; return Math.asin(v) * 180 / Math.PI; }

  function pct(sorted, p) { if (!sorted.length) return 0; var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }

  /* metrics over an array of samples (a window or a whole session) */
  function metrics(samples) {
    var out = { n: samples.length, sway: 0, symmetry: null, tempo: null, regularity: null, ok: false };
    if (samples.length < 25) return out;
    var span = samples[samples.length - 1].t - samples[0].t;
    if (span < 1.5) return out;
    var tl = samples.map(tilt), sorted = tl.slice().sort(function (a, b) { return a - b; });
    var p5 = pct(sorted, .05), p95 = pct(sorted, .95), med = pct(sorted, .5);
    out.sway = p95 - p5;
    var P = pct(sorted, .9) - med, N = med - pct(sorted, .1);
    out.symmetry = (P + N) > 0.05 ? Math.round(100 * (1 - Math.abs(P - N) / (P + N))) : null;
    out.dominant = P > N ? 'a' : 'b';
    // tempo: hysteresis crossings of median
    var h = Math.max(0.35, (p95 - p5) * 0.2), state = 0, ups = [];
    for (var i = 0; i < tl.length; i++) {
      var v = tl[i] - med;
      if (v > h) { if (state === -1) ups.push(samples[i].t); state = 1; }
      else if (v < -h) state = -1;
    }
    if (ups.length >= 3) {
      var iv = []; for (var k = 1; k < ups.length; k++) iv.push(ups[k] - ups[k - 1]);
      var mi = iv.reduce(function (a, b) { return a + b; }, 0) / iv.length;
      var sd = Math.sqrt(iv.reduce(function (a, b) { return a + (b - mi) * (b - mi); }, 0) / iv.length);
      out.tempo = Math.round(60 / mi);
      out.regularity = Math.max(0, Math.min(100, Math.round(100 * (1 - sd / mi))));
    }
    out.ok = true;
    return out;
  }

  function rateOf(samples) { if (samples.length < 2) return 50; var d = samples[samples.length - 1].t - samples[0].t; return d > 0 ? (samples.length - 1) / d : 50; }

  function summary(samples) {
    var m = metrics(samples), sp = detectSpikes(samples, rateOf(samples));
    m.events = sp.length; m.eventTimes = sp.map(function (s) { return s.ride_time_seconds; });
    return m;
  }

  /* Plain-English sentences, no jargon. */
  function sentences(m) {
    var s = [];
    if (!m.ok) return ['Not enough movement was captured to read. Try again with the phone upright in your front pocket.'];
    var w = m.sway;
    s.push('Your side-to-side sway averaged ' + w.toFixed(1) + ' degrees, which is ' + (w < 8 ? 'small and quiet' : w < 14 ? 'a moderate amount' : 'quite wide') + '.');
    if (m.symmetry != null) {
      s.push(m.symmetry >= 85 ? 'Your movement was closely matched from one side to the other (' + m.symmetry + '% symmetry).'
        : m.symmetry >= 70 ? 'You moved a little more to one side than the other (' + m.symmetry + '% symmetry).'
        : 'You moved clearly more to one side than the other (' + m.symmetry + '% symmetry).');
    }
    if (m.tempo != null) s.push('Your rhythm ran at about ' + m.tempo + ' cycles a minute and was ' + (m.regularity >= 80 ? 'very even' : m.regularity >= 60 ? 'fairly even' : 'variable') + '.');
    s.push(m.events === 0 ? 'No steadiness events. Smooth throughout.'
      : m.events === 1 ? '1 steadiness event, at ' + m.eventTimes[0].toFixed(1) + ' seconds.'
      : m.events + ' steadiness events, the first at ' + m.eventTimes[0].toFixed(1) + ' seconds.');
    return s;
  }

  /* ---------- synthetic rider traces (demo + tests) ---------- */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function synth(kind, seconds, opts) {
    opts = opts || {};
    var hz = 50, n = Math.round(seconds * hz), r = rng(opts.seed || (kind === 'steady' ? 11 : 29)), out = [];
    var amp = kind === 'steady' ? 3.4 : 4.6, f0 = kind === 'steady' ? 0.95 : 0.9, phase = 0, wob = 0, asym = kind === 'steady' ? 0.05 : 0.7;
    var spikes = opts.spikes || (kind === 'steady' ? [] : [[6.0, 6.4], [13.2, 13.5], [21.0, 21.5], [26.4, 26.7]]);
    var prev = 0;
    for (var i = 0; i < n; i++) {
      var t = i / hz;
      wob += (r() - 0.5) * (kind === 'steady' ? 0.0015 : 0.02); wob *= 0.995;
      var f = f0 * (1 + wob * 6);
      phase += 2 * Math.PI * f / hz;
      var a = amp * (1 + (kind === 'steady' ? 0.04 : 0.25) * Math.sin(t * 0.7));
      var s = Math.sin(phase), td = a * (s + asym * (s > 0 ? s : 0));
      var rad = td * Math.PI / 180;
      var ax = G * Math.sin(rad) + (r() - .5) * 0.08;
      var ay = G * Math.cos(rad) + 0.25 * Math.sin(phase * 2) + (r() - .5) * 0.08;
      var az = 0.5 * Math.sin(phase + 1.2) + (r() - .5) * 0.08;
      for (var k = 0; k < spikes.length; k++) if (t >= spikes[k][0] && t < spikes[k][1]) {
        var env = Math.sin(Math.PI * (t - spikes[k][0]) / (spikes[k][1] - spikes[k][0]));
        var j = Math.sin(t * 2 * Math.PI * 9) * 7 * env;
        ax += j * 0.8; az += j; ay += j * 0.4;
      }
      out.push({ t: +t.toFixed(3), ax: +ax.toFixed(3), ay: +ay.toFixed(3), az: +az.toFixed(3), gx: 0, gy: 0, gz: +((td - prev) * hz).toFixed(2) });
      prev = td;
    }
    return out;
  }

  g.PK = g.PK || {};
  g.PK.analysis = { G: G, detectSpikes: detectSpikes, tilt: tilt, metrics: metrics, summary: summary, sentences: sentences, synth: synth, rateOf: rateOf };
  if (typeof module !== 'undefined') module.exports = g.PK.analysis;
})(typeof window !== 'undefined' ? window : globalThis);
