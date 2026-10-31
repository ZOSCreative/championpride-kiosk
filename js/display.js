(function () {
  'use strict';
  var PK = window.PK, C = PK.config, A = PK.analysis;
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage');

  // ---------- settings (kiosk settings only; never visitor data) ----------
  var room = C.cleanRoom(C.qs('room')) || C.cleanRoom(C.store.get('pk_room')) || C.newRoom();
  C.store.set('pk_room', room);
  var urlDemo = C.qs('demo') === '1';
  var demo = urlDemo || C.store.get('pk_demo') === '1';
  var duration = parseInt(C.qs('dur') || C.store.get('pk_dur') || C.DEFAULT_DURATION, 10) || C.DEFAULT_DURATION;
  var testMode = false;

  // ---------- state ----------
  var finishedAt = 0, state = 'attract';           // attract | running | done
  var buf = [], sessionStart = 0, lastPhone = 0, lastSampleAt = 0, endTimer = null, doneTimer = null, demoIdx = 0, demoData = null, demoStartedAt = 0, demoTick = null, lastRein = 0, tpStatus = 'connecting', tp = null;
  var live = { sway: null, sym: null, ev: 0, tempo: null, reg: null, events: [] };

  $('disc').textContent = C.DISCLAIMER;

  function phoneHere() { return Date.now() - lastPhone < C.PHONE_TIMEOUT_MS; }
  function setState(s) { state = s; stage.setAttribute('data-state', s); render(); }

  // ---------- QR + room ----------
  function drawPair() {
    var url = C.pageUrl('sensor.html', { room: room });
    $('qrPair').innerHTML = PK.qr.svg(url);
    $('roomCode').textContent = room;
    $('setCode').textContent = room;
    $('pairUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\?room=.*/, '') + '  (code ' + room + ')';
  }

  // ---------- pill / chrome ----------
  function render() {
    var pill = $('pill'), txt;
    if (demo) { pill.className = 'pill ok'; txt = 'Demo mode'; }
    else if (tpStatus !== 'open') { pill.className = 'pill off'; txt = 'Offline'; }
    else if (phoneHere()) { pill.className = 'pill ok'; txt = 'Connected'; }
    else { pill.className = 'pill wait'; txt = 'Waiting for phone'; }
    $('pillText').textContent = txt;
    $('sampleChipTop').hidden = !(demo || testMode);
    $('sampleChipTop').textContent = demo ? 'Sample' : 'Test mode';
    $('sampleChipTop').className = 'sample-chip big';
    document.body.classList.toggle('demo', demo);
    $('timer').hidden = !(state === 'running' && !testMode);
    var paired = !demo && phoneHere();
    $('pairBox').hidden = paired || demo;
    $('readyMsg').hidden = !paired;
    $('attractH1').textContent = testMode ? 'Test mode' : 'Sit down, phone in your pocket.';
    if (demo) { $('attractH1').textContent = 'Sit down, phone in your pocket.'; $('attractH2').textContent = 'This is a sample run. Real traces start when a phone pairs.'; }
    else $('attractH2').textContent = 'See how your phone reads your movement.';
  }

  // ---------- live numbers ----------
  function recompute() {
    if (!buf.length) { live = { sway: null, sym: null, ev: 0, tempo: null, reg: null, events: [] }; return; }
    var last = buf[buf.length - 1].t, i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > last - 10) i--;
    var m = A.metrics(buf.slice(i));
    var ev = A.detectSpikes(buf, A.rateOf(buf));
    live = { sway: m.ok ? m.sway : null, sym: m.ok ? m.symmetry : null, ev: ev.length, tempo: m.tempo, reg: m.regularity, events: ev.map(function (e) { return e.ride_time_seconds; }), ok: m.ok };
  }
  function paintNumbers() {
    var has = state === 'running' && live.ok;
    $('vSway').textContent = has && live.sway != null ? live.sway.toFixed(1) : '--';
    $('vSym').textContent = has && live.sym != null ? live.sym + '%' : '--';
    $('vEv').textContent = state === 'running' && buf.length > 50 ? String(live.ev) : '--';
    $('tempoLine').textContent = has && live.tempo ? 'Tempo ' + live.tempo + ' cycles a minute. Rhythm ' + (live.reg >= 80 ? 'very even' : live.reg >= 60 ? 'fairly even' : 'variable') + '.' : 'Tempo and rhythm appear once you are moving.';
  }

  // ---------- canvas ----------
  var cv = $('cv'), ctx = cv.getContext('2d'), dpr = 1;
  function fit() { dpr = Math.min(2, window.devicePixelRatio || 1); var r = cv.getBoundingClientRect(); cv.width = Math.max(10, Math.round(r.width * dpr)); cv.height = Math.max(10, Math.round(r.height * dpr)); }
  window.addEventListener('resize', fit);
  var ghost = A.synth('steady', 40, { seed: 5 }), ghostT0 = performance.now();
  var cs = getComputedStyle(document.documentElement);
  function col(n) { return cs.getPropertyValue(n).trim() || '#fff'; }
  function draw() {
    var w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h);
    var gold = col('--gold'), line = col('--navy-line'), dim = col('--on-navy-2');
    // grid
    ctx.lineWidth = 1 * dpr; ctx.strokeStyle = line;
    for (var gy = 0; gy <= 4; gy++) { var y = h * gy / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.setLineDash([4 * dpr, 6 * dpr]); ctx.strokeStyle = dim; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    var series, tNow, isGhost = false, evs = live.events;
    if (state === 'running' && buf.length > 2) { series = buf; tNow = buf[buf.length - 1].t; }
    else { var e = ((performance.now() - ghostT0) / 1000) % 30 + 10; series = ghost; tNow = e; isGhost = true; evs = []; }
    var span = 10, t0 = tNow - span, range = 12; // +/- degrees
    ctx.save(); if (isGhost) ctx.globalAlpha = .35;
    ctx.strokeStyle = gold; ctx.lineWidth = 3 * dpr; ctx.lineJoin = 'round'; ctx.beginPath();
    var started = false;
    for (var i = Math.max(0, series.length - Math.ceil(span * 60) - 5); i < series.length; i++) {
      var s = series[i]; if (s.t < t0 || s.t > tNow) continue;
      var x = (s.t - t0) / span * w, v = Math.max(-range, Math.min(range, A.tilt(s))), yy = h / 2 - v / range * (h / 2) * .92;
      if (!started) { ctx.moveTo(x, yy); started = true; } else ctx.lineTo(x, yy);
    }
    ctx.stroke(); ctx.restore();
    // steadiness events
    ctx.fillStyle = gold; ctx.strokeStyle = gold; ctx.lineWidth = 2 * dpr;
    evs.forEach(function (t) { if (t < t0 || t > tNow) return; var x = (t - t0) / span * w; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(x, h * .06); ctx.lineTo(x - 9 * dpr, h * .06 + 16 * dpr); ctx.lineTo(x + 9 * dpr, h * .06 + 16 * dpr); ctx.closePath(); ctx.fill(); });
  }

  // ---------- session control ----------
  function startSession(opts) {
    clearTimeout(endTimer); clearTimeout(doneTimer);
    buf = []; live = { sway: null, sym: null, ev: 0, tempo: null, reg: null, events: [] };
    sessionStart = Date.now();
    $('ovEnd').hidden = true;
    setState('running');
    var dur = (opts && opts.dur) || duration;
    if (!testMode) { endTimer = setTimeout(function () { finish(); }, dur * 1000); }
    $('timer').textContent = dur;
    $('timer').dataset.dur = dur;
  }
  function finish() {
    if (state !== 'running') return;
    finishedAt = Date.now();
    clearTimeout(endTimer);
    var sum = A.summary(buf);
    if (tp && !demo) tp.send({ type: 'end' });
    if (testMode) { setState('attract'); return; }
    var list = $('sentences'); list.innerHTML = '';
    var sents = A.sentences(sum);
    if (demo) sents.unshift('SAMPLE run. These numbers are illustrative, not a real rider.');
    sents.forEach(function (s) { var li = document.createElement('li'); li.textContent = s; list.appendChild(li); });
    $('qrEye').innerHTML = PK.qr.svg(C.EYE_URL);
    $('ovEnd').hidden = false;
    setState('done');
    var secs = demo ? 10 : C.END_CARD_SECONDS, left = secs;
    $('endCount').textContent = '';
    (function tick() { $('endCount').textContent = 'Back to start in ' + left + ' seconds.'; if (left-- <= 0) { reset(); return; } doneTimer = setTimeout(tick, 1000); })();
  }
  function reset() {
    clearTimeout(doneTimer); clearTimeout(endTimer);
    $('ovEnd').hidden = true; buf = []; live = { sway: null, sym: null, ev: 0, tempo: null, reg: null, events: [] };
    setState('attract'); paintNumbers();
    if (demo) startDemoSoon();
  }
  $('btnDone').onclick = reset;
  $('ovEnd').addEventListener('click', function (e) { if (e.target === $('ovEnd')) reset(); });

  // ---------- demo loop (works with no phone and no internet) ----------
  function startDemoSoon() {
    clearTimeout(demoTick);
    demoTick = setTimeout(function () {
      if (!demo || state !== 'attract') return;
      var kind = demoIdx++ % 2 === 0 ? 'steady' : 'unsteady';
      demoData = A.synth(kind, C.DEMO_DURATION, { seed: kind === 'steady' ? 11 : 29 });
      demoStartedAt = performance.now();
      startSession({ dur: C.DEMO_DURATION });
      var iv = setInterval(function () {
        if (!demo || state !== 'running') { clearInterval(iv); return; }
        var el = (performance.now() - demoStartedAt) / 1000;
        while (buf.length < demoData.length && demoData[buf.length].t <= el) buf.push(demoData[buf.length]);
      }, 40);
    }, 3500);
  }
  function setDemo(on) {
    demo = on; C.store.set('pk_demo', on ? '1' : '0');
    clearTimeout(demoTick);
    if (state !== 'attract') { clearTimeout(endTimer); clearTimeout(doneTimer); $('ovEnd').hidden = true; buf = []; state = 'attract'; stage.setAttribute('data-state', 'attract'); }
    render(); paintNumbers(); if (on) startDemoSoon();
  }

  // ---------- incoming messages ----------
  function onMsg(m) {
    if (!m || demo && m.type !== 'mode') return;
    var now = Date.now();
    switch (m.type) {
      case 'hello': case 'ping': lastPhone = now; render(); break;
      case 'start': lastPhone = now; if (state !== 'running') startSession(); render(); break;
      case 's':
        lastPhone = now; lastSampleAt = now;
        if (state === 'done' || now - finishedAt < 3000) break; // trailing samples after the end must not start a phantom session
        if (state !== 'running') startSession();
        if (m.b) for (var i = 0; i < m.b.length; i++) { var r = m.b[i]; buf.push({ t: r[0], ax: r[1], ay: r[2], az: r[3], gx: r[4] || 0, gy: r[5] || 0, gz: r[6] || 0 }); }
        break;
      case 'stop':
        lastPhone = now;
        if (state === 'running') { if (buf.length > 100) finish(); else { clearTimeout(endTimer); finishedAt = now; setState('attract'); } }
        break;
      case 'reset': if (!demo) reset(); break;
      case 'rein': lastRein = now; reinPaint(m); break;
      case 'mode':
        if ('test' in m) { var was = testMode; testMode = !!m.test; if (state === 'running' && testMode) clearTimeout(endTimer); if (was && !testMode && state === 'running') startSession(); render(); }
        if ('demo' in m) setDemo(!!m.demo);
        if (m.dur) { duration = +m.dur; C.store.set('pk_dur', String(duration)); $('selDur').value = String(duration); }
        break;
    }
  }
  function reinPaint(m) {
    var max = 30; // kg full scale for the bar
    $('rein').hidden = false;
    $('rl').style.width = Math.min(100, (m.l || 0) / max * 100) + '%'; $('rr').style.width = Math.min(100, (m.r || 0) / max * 100) + '%';
    $('rlv').textContent = (+m.l || 0).toFixed(1) + ' ' + (m.unit || 'kg'); $('rrv').textContent = (+m.r || 0).toFixed(1) + ' ' + (m.unit || 'kg');
  }

  // ---------- settings panel ----------
  $('gear').onclick = function () { $('ovSet').hidden = false; $('selDur').value = String(duration); if (![].some.call($('selDur').options, function (o) { return o.value === String(duration); })) { var o = document.createElement('option'); o.textContent = duration; $('selDur').appendChild(o); $('selDur').value = String(duration); } $('btnDemo').textContent = demo ? 'Leave Demo mode' : 'Switch to Demo mode'; };
  $('btnClose').onclick = function () { $('ovSet').hidden = true; };
  $('selDur').onchange = function () { duration = parseInt(this.value, 10); C.store.set('pk_dur', String(duration)); };
  $('btnDemo').onclick = function () { setDemo(!demo); $('ovSet').hidden = true; };
  $('btnNewCode').onclick = function () { room = C.newRoom(); C.store.set('pk_room', room); drawPair(); connect(); };

  // ---------- transport ----------
  function connect() {
    if (tp) tp.close();
    if (urlDemo) { tpStatus = 'closed'; render(); return; } // website demo link: no network at all
    tp = PK.transport.connect({ room: room, onMsg: onMsg, onStatus: function (s) { tpStatus = s; render(); } });
  }

  // ---------- loop ----------
  function frame() {
    if (state === 'running') {
      var left;
      if (testMode) { $('timer').hidden = true; }
      else { var d = +$('timer').dataset.dur || duration; left = Math.max(0, Math.ceil(d - (Date.now() - sessionStart) / 1000)); $('timer').textContent = left; }
    }
    draw(); requestAnimationFrame(frame);
  }
  setInterval(function () { if (state === 'running') recompute(); paintNumbers(); if (Date.now() - lastRein > 3000) $('rein').hidden = true; render(); }, 250);

  // Keep the iPad awake (best effort)
  function wake() { try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {} }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
  wake();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});

  drawPair(); render(); fit(); connect(); requestAnimationFrame(frame);
  if (demo) startDemoSoon();
  window.__pk = { get state() { return state; }, get buf() { return buf; }, get room() { return room; }, get live() { return live; } };
})();
