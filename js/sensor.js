(function () {
  'use strict';
  var PK = window.PK, C = PK.config;
  var $ = function (id) { return document.getElementById(id); };
  $('disc').textContent = C.DISCLAIMER + ' Nothing about you is stored.';

  var room = C.cleanRoom(C.qs('room')) || C.cleanRoom(C.store.get('pk_room_phone'));
  $('room').value = room;
  var tp = null, tpStatus = 'connecting', recording = false, t0 = 0, batch = [], queue = [], batchTimer = null, pingTimer = null, clockTimer = null, wl = null, fakeTimer = null;
  var fake = C.qs('fake'); // test hook: ?fake=steady|unsteady streams a synthetic trace instead of real sensors

  function pill() {
    var p = $('pill'), t = $('pillText');
    if (!room) { p.className = 'pill wait'; t.textContent = 'Enter room code'; }
    else if (tpStatus === 'open') { p.className = 'pill ok'; t.textContent = 'Connected'; }
    else { p.className = 'pill off'; t.textContent = tpStatus === 'connecting' ? 'Connecting' : 'Offline'; }
  }
  function say(el, text, err) { el.textContent = text || ''; el.className = 'msg' + (err ? ' err' : ''); }

  function connect() {
    if (tp) tp.close();
    if (room.length !== 4) { pill(); return; }
    C.store.set('pk_room_phone', room);
    tp = PK.transport.connect({
      room: room,
      onStatus: function (s) { tpStatus = s; pill(); if (s === 'open') { tp.send({ type: 'hello' }); flushQueue(); } },
      onMsg: function (m) { if (m && m.type === 'end' && recording) stop(true); }
    });
    clearInterval(pingTimer);
    pingTimer = setInterval(function () { tp && tp.send({ type: 'ping' }); }, 2000);
  }
  $('room').addEventListener('input', function () { this.value = C.cleanRoom(this.value); room = this.value; if (room.length === 4) connect(); else pill(); });

  function flushQueue() { while (queue.length && tp && tp.send(queue[0])) queue.shift(); }
  function emit(msg) {
    if (tp && tp.send(msg)) return;
    queue.push(msg); if (queue.length > 120) queue.shift(); // keep ~12 s if the link drops
  }
  function pushSample(t, a, r) {
    batch.push([+t.toFixed(3), +a.x.toFixed(3), +a.y.toFixed(3), +a.z.toFixed(3), +(r.alpha || 0).toFixed(2), +(r.beta || 0).toFixed(2), +(r.gamma || 0).toFixed(2)]);
  }
  function onMotion(ev) {
    var a = ev.accelerationIncludingGravity || ev.acceleration; if (!a || a.x == null) return;
    var r = ev.rotationRate || {};
    pushSample((performance.now() - t0) / 1000, { x: a.x, y: a.y, z: a.z }, r);
  }
  function sendBatch() { if (!batch.length) return; var b = batch; batch = []; emit({ type: 's', b: b }); }

  async function lockScreen() {
    try { if ('wakeLock' in navigator) { wl = await navigator.wakeLock.request('screen'); return true; } } catch (e) {}
    return false;
  }

  async function start() {
    say($('msg'), '');
    if (room.length !== 4) { say($('msg'), 'Enter the 4-letter code shown on the screen.', true); $('room').focus(); return; }
    if (!tp) connect();
    // iOS needs permission inside the tap
    var ok = true;
    if (!fake) {
      if (typeof DeviceMotionEvent === 'undefined') { say($('msg'), 'This phone has no motion sensor in the browser. Ask the stand team for help.', true); return; }
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try { var res = await DeviceMotionEvent.requestPermission(); ok = res === 'granted'; } catch (e) { ok = false; }
        if (!ok) { say($('msg'), 'Motion access was refused. In Settings, Safari, allow Motion and Orientation, then reload this page.', true); return; }
      }
    }
    var locked = await lockScreen();
    recording = true; t0 = performance.now(); batch = [];
    $('viewSetup').hidden = true; $('viewDone').hidden = true; $('viewRec').hidden = false;
    say($('recMsg'), locked ? '' : 'Your screen may dim. Tap it once if it does, the recording carries on.');
    emit({ type: 'start' });
    if (fake) {
      var data = fake === 'tap' ? A().synth('steady', 600, { spikes: [[3, 3.4], [4.5, 4.9]] }) : A().synth(fake === 'steady' ? 'steady' : 'unsteady', 600), idx = 0;
      fakeTimer = setInterval(function () { var el = (performance.now() - t0) / 1000; while (idx < data.length && data[idx].t <= el) { var s = data[idx++]; pushSample(s.t, { x: s.ax, y: s.ay, z: s.az }, { alpha: s.gx, beta: s.gy, gamma: s.gz }); } }, 20);
    } else window.addEventListener('devicemotion', onMotion);
    batchTimer = setInterval(sendBatch, C.BATCH_MS);
    clockTimer = setInterval(function () { var s = Math.floor((performance.now() - t0) / 1000); $('clock').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
    document.addEventListener('visibilitychange', onVis);
  }
  function A() { return PK.analysis; }
  function onVis() { if (recording && !document.hidden && !wl) lockScreen(); }

  function stop(fromDisplay) {
    if (!recording) return;
    recording = false;
    window.removeEventListener('devicemotion', onMotion);
    clearInterval(batchTimer); clearInterval(clockTimer); clearInterval(fakeTimer);
    sendBatch();
    if (!fromDisplay) emit({ type: 'stop' });
    try { wl && wl.release(); } catch (e) {} wl = null;
    $('viewRec').hidden = true; $('viewDone').hidden = false;
  }
  $('btnStart').onclick = start;
  $('btnStop').onclick = function () { stop(false); };
  $('btnAgain').onclick = function () { $('viewDone').hidden = true; $('viewSetup').hidden = false; };

  pill(); connect();
  window.addEventListener('beforeunload', function () { if (recording) emit({ type: 'stop' }); });
})();
