(function () {
  'use strict';
  var PK = window.PK, C = PK.config, A = PK.analysis;
  var $ = function (id) { return document.getElementById(id); };
  var room = C.cleanRoom(C.qs('room')) || C.cleanRoom(C.store.get('pk_room')) || C.newRoom();
  C.store.set('pk_room', room);
  var cur = Math.max(0, Math.min(7, (parseInt(C.qs('step'), 10) || 1) - 1));
  var demo = C.store.get('pk_demo') === '1';
  var duration = parseInt(C.store.get('pk_dur') || C.DEFAULT_DURATION, 10);
  var tp = null, tpStatus = 'connecting', lastPhone = 0, sessionState = 'idle', testBuf = [], tapSeen = false, ticks = {}, miniTimer = null;

  function phoneHere() { return Date.now() - lastPhone < C.PHONE_TIMEOUT_MS; }
  function send(o) { return tp ? tp.send(o) : false; }

  // ---------- transport ----------
  function connect() {
    if (tp) tp.close();
    tp = PK.transport.connect({
      room: room,
      onStatus: function (s) { tpStatus = s; pill(); if (s === 'open') { send({ type: 'mode', demo: demo, dur: duration }); } refreshStatusEls(); },
      onMsg: function (m) {
        if (!m) return;
        if (m.type === 'hello' || m.type === 'ping') lastPhone = Date.now();
        else if (m.type === 's') {
          lastPhone = Date.now();
          if (m.b) for (var i = 0; i < m.b.length; i++) { var r = m.b[i]; testBuf.push({ t: r[0], ax: r[1], ay: r[2], az: r[3], gx: 0, gy: 0, gz: 0 }); }
          if (testBuf.length > 400) testBuf.splice(0, testBuf.length - 400);
        } else if (m.type === 'start') { lastPhone = Date.now(); sessionState = 'running'; testBuf = []; tapSeen = false; }
        else if (m.type === 'stop' || m.type === 'end') { sessionState = 'finished'; }
        refreshStatusEls();
      }
    });
  }
  function pill() {
    var p = $('pill'), t = $('pillText');
    if (tpStatus === 'open') { p.className = 'pill ok'; t.textContent = 'Online'; }
    else if (tpStatus === 'connecting') { p.className = 'pill wait'; t.textContent = 'Connecting'; }
    else { p.className = 'pill off'; t.textContent = 'Offline'; }
  }

  // ---------- fail-safe ----------
  function paintFailsafe() {
    $('failsafe').classList.toggle('on', demo);
    $('btnDemo').textContent = demo ? 'Back to live' : 'Switch to Demo mode';
    $('fsText').textContent = demo ? 'Demo is showing sample traces on the big screen. All numbers say SAMPLE.' : 'One tap puts a sample demo on the big screen.';
  }
  $('btnDemo').onclick = function () {
    demo = !demo; C.store.set('pk_demo', demo ? '1' : '0');
    send({ type: 'mode', demo: demo });
    paintFailsafe();
    if (demo && tpStatus !== 'open') $('fsText').innerHTML = 'Demo set on this device. If the big screen is a different device, open it at <a href="' + C.pageUrl('display.html', { demo: 1 }) + '" target="_blank" rel="noopener">the demo link</a>.';
  };

  // ---------- helpers ----------
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }
  function statusEl(id) { return '<span class="status" id="' + id + '"><i></i><span></span></span>'; }
  function refreshStatusEls() {
    var s = document.getElementById('phoneStatus');
    if (s) { var ok = phoneHere() && tpStatus === 'open'; s.className = 'status' + (ok ? ' ok' : ''); s.lastChild.textContent = ok ? 'Phone connected' : (tpStatus === 'open' ? 'Waiting for the phone' : 'Offline. Check Starlink.'); }
    var t = document.getElementById('tapOk');
    if (t) { t.className = 'tapok' + (tapSeen ? ' ok' : ''); t.textContent = tapSeen ? 'Tap seen. The phone works.' : (phoneHere() ? 'Waiting for a tap on the phone.' : 'Phone not connected yet. Go back one step.'); }
    var r = document.getElementById('runStatus');
    if (r) r.textContent = sessionState === 'running' ? 'Session running' : sessionState === 'finished' ? 'Session finished' : (phoneHere() ? 'Ready. Waiting for Start on the phone.' : 'Waiting for the phone');
  }

  // ---------- steps ----------
  var STEPS = [
    {
      name: 'Power', title: 'Power and Starlink on.',
      render: function (e) {
        e.innerHTML = '<p class="lead">Tick each one as you do it.</p><div class="checks" id="checks"></div>';
        [['p1', 'Lorry power is on'], ['p2', 'Starlink Mini is on, and its light is steady'], ['p3', 'iPad is plugged in and awake'], ['p4', 'Big screen is on (if you use one)']].forEach(function (c) { checkBtn($('checks'), c[0], c[1]); });
      },
      trouble: ['Starlink light flashing: wait 3 minutes. It is finding the sky. Move anything covering it.', 'No internet at all: press Switch to Demo mode at the top. The screen still works and says SAMPLE.', 'iPad asleep: Settings, Display, Auto-Lock, Never. Keep it plugged in.']
    },
    {
      name: 'Display', title: 'Open the display on the iPad.',
      render: function (e) {
        var url = C.pageUrl('display.html', { room: room });
        e.innerHTML = '<p class="lead">This puts the live screen up. Keep this helper page open in another tab.</p>' +
          '<div style="margin:16px 0"><a class="btn primary" id="openDisp" href="' + url + '" target="_blank" rel="noopener" style="width:100%">Open the display</a></div>' +
          '<p>Using the big screen? On the iPad: Control Centre, Screen Mirroring, pick the big screen. Then tap Open the display again.</p>' +
          '<p class="muted">The screen shows a 4-letter code: <strong>' + room + '</strong>. You will use it in the next step.</p>';
      },
      trouble: ['Opened but blank: pull down to refresh. If it stays blank, press Switch to Demo mode.', 'Pop-up blocked: touch and hold the button, choose Open in New Tab.', 'Big screen shows a small picture: on the iPad, Settings, Display, Mirror, set Fit to Screen.']
    },
    {
      name: 'Pair', title: 'Pair the phone.',
      render: function (e) {
        var url = C.pageUrl('sensor.html', { room: room });
        e.innerHTML = '<p class="lead">On the rider\'s phone, scan this, or open the page and type the code.</p>' +
          '<div class="pairrow"><div class="qr" id="qrP"></div><div><div class="muted">Room code</div><div class="codebig">' + room + '</div></div></div>' +
          '<p style="word-break:break-all" class="muted" id="urlTxt"></p>' +
          '<p>' + statusEl('phoneStatus').replace('class="status"', 'class="status"') + '</p>' +
          '<div class="field"><label for="roomIn" class="sub">Screen shows a different code?</label><input id="roomIn" class="code-in" maxlength="4" autocapitalize="characters" value="' + room + '"> <button class="btn small" id="roomSet">Use this code</button></div>';
        $('qrP').innerHTML = PK.qr.svg(url); $('urlTxt').textContent = url;
        $('roomSet').onclick = function () { var v = C.cleanRoom($('roomIn').value); if (v.length === 4) { room = v; C.store.set('pk_room', v); connect(); STEPS[2].render(e); refreshStatusEls(); } };
      },
      trouble: ['Phone says motion access refused: Settings, Safari, Motion and Orientation Access, switch on. Reload the page.', 'Camera will not scan: type the 4-letter code on the phone page instead.', 'Status stays Waiting: both devices need internet. Check Starlink, then try again.']
    },
    {
      name: 'Self-test', title: 'Place the phone and test it.',
      render: function (e) {
        e.innerHTML = '<ol class="ol lead"><li>Put the phone in a front pocket, screen toward the body, upright.</li><li>On the phone, press Start.</li><li>Tap the phone twice with a finger.</li></ol>' +
          '<div class="mini"><canvas id="mini" aria-label="Live phone movement"></canvas></div>' +
          '<div class="tapok" id="tapOk" role="status"></div>' +
          '<p class="muted" style="margin-top:12px">The big screen says Test mode. When you see the tick, press Stop on the phone, then press Next.</p>';
        tapSeen = false; testBuf = []; startMini();
      },
      enter: function () { send({ type: 'mode', test: true }); },
      leave: function () { stopMini(); send({ type: 'mode', test: false }); },
      trouble: ['No movement line: is the phone page showing Recording? Press Start on the phone.', 'No tick after tapping: tap harder, twice, in quick succession. Tap the phone through the pocket.', 'Still nothing: go back one step and check the phone says Connected.']
    },
    {
      name: 'Brief', title: 'Brief the sitter.',
      render: function (e) {
        e.innerHTML = '<p class="lead">Show them this card. Then press Next.</p><div id="card"></div><p style="margin-top:12px"><a class="btn small" href="sitter.html" target="_blank" rel="noopener">Print the A5 card</a></p>';
        PK.card.render($('card'));
      },
      trouble: ['Rider unsure: tell them there is nothing to get right. It shows how their phone sees them.', 'Rider has no front pocket: a loose jacket pocket works, but hold it still with a hand. A back pocket is fine too.', 'Rider is under 16 or unwell: skip. Do not press them.']
    },
    {
      name: 'Run', title: 'Run the session.',
      render: function (e) {
        e.innerHTML = '<p class="lead">Rider presses Start on their phone. The big screen does the rest.</p>' +
          '<div class="big-status" id="runStatus"></div>' + statusEl('phoneStatus') +
          '<div class="field"><label for="durSel" class="sub">Session length</label><select id="durSel"><option>30</option><option>45</option><option>60</option><option>90</option><option>120</option></select> seconds</div>' +
          '<p class="muted">The big screen shows the results by itself, then goes back to the start screen after 20 seconds.</p>';
        var sel = $('durSel'); sel.value = String(duration);
        sel.onchange = function () { duration = parseInt(sel.value, 10); C.store.set('pk_dur', String(duration)); send({ type: 'mode', dur: duration }); };
        sessionState = 'idle';
      },
      trouble: ['Rider pressed Start and nothing moves: check the phone says Recording. If not, Stop and Start again.', 'Trace is flat: the phone is not moving with the hips. Check it is in the pocket, not a bag.', 'Screen froze: press Switch to Demo mode at the top, then fix it between riders.']
    },
    {
      name: 'Reset', title: 'Reset for the next person.',
      render: function (e) {
        e.innerHTML = '<p class="lead">Quick reset between riders.</p><div class="checks" id="checks"></div>' +
          '<button class="btn" id="btnReset" style="width:100%;margin-bottom:10px">Send the big screen back to the start</button>' +
          '<button class="btn primary" id="btnNextRider" style="width:100%">Next rider: back to the card</button>';
        checkBtn($('checks'), 'r1', 'Phone back with its owner'); checkBtn($('checks'), 'r2', 'Big screen is on the start screen'); checkBtn($('checks'), 'r3', 'Next rider has the card');
        $('btnReset').onclick = function () { send({ type: 'reset' }); sessionState = 'idle'; };
        $('btnNextRider').onclick = function () { ticks = {}; go(4); };
      },
      trouble: ['Big screen stuck on results: press the button above, or tap Done on the big screen.', 'Next rider\'s phone does not connect: they need to scan the code again. Same code.', 'Queue building: reduce Session length to 30 seconds in the Run step.']
    },
    {
      name: 'End of day', title: 'End of day.',
      render: function (e) {
        e.innerHTML = '<p class="lead">Nothing about any rider is stored. There is nothing to export or delete.</p><div class="checks" id="checks"></div>' +
          '<button class="btn" id="btnNew" style="width:100%">Make a fresh room code for tomorrow</button>';
        [['e1', 'Close the display tab on the iPad'], ['e2', 'Switch off Starlink Mini'], ['e3', 'Switch off lorry power'], ['e4', 'Put the sitter card and phone holder away']].forEach(function (c) { checkBtn($('checks'), c[0], c[1]); });
        $('btnNew').onclick = function () { room = C.newRoom(); C.store.set('pk_room', room); $('btnNew').textContent = 'New code: ' + room; connect(); };
      },
      trouble: ['Display tab will not close: swipe it away in the tab switcher.', 'Want to run again tomorrow: open this helper page from the same link and start at step 1.']
    }
  ];

  function checkBtn(parent, id, label) {
    var b = document.createElement('button'); b.className = 'check'; b.type = 'button'; b.setAttribute('aria-pressed', ticks[id] ? 'true' : 'false');
    b.innerHTML = '<span class="box"></span><span></span>'; b.lastChild.textContent = label;
    b.onclick = function () { ticks[id] = !ticks[id]; b.setAttribute('aria-pressed', ticks[id] ? 'true' : 'false'); };
    parent.appendChild(b);
  }

  // ---------- mini trace + tap detection (self-test) ----------
  function startMini() {
    stopMini();
    var cv = $('mini'), ctx = cv.getContext('2d');
    miniTimer = setInterval(function () {
      var r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(10, r.width * d); cv.height = Math.max(10, r.height * d);
      var w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(244,240,230,.2)'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      if (testBuf.length > 3) {
        var tn = testBuf[testBuf.length - 1].t, t0 = tn - 6;
        ctx.strokeStyle = '#C6A15B'; ctx.lineWidth = 2.5 * d; ctx.beginPath(); var st = false;
        testBuf.forEach(function (s) { if (s.t < t0) return; var x = (s.t - t0) / 6 * w, mg = Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az) - 9.81, y = h / 2 - Math.max(-12, Math.min(12, mg)) / 12 * (h / 2) * .9; if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); });
        ctx.stroke();
        // tap = steadiness event in the last 4 seconds of samples
        var recent = testBuf.filter(function (s) { return s.t > tn - 4; });
        if (recent.length > 30 && A.detectSpikes(recent, A.rateOf(recent), { minVar: 1.0 }).length) tapSeen = true;
      }
      refreshStatusEls();
    }, 200);
  }
  function stopMini() { clearInterval(miniTimer); miniTimer = null; }

  // ---------- navigation ----------
  var prev = -1;
  function go(i) {
    i = Math.max(0, Math.min(STEPS.length - 1, i));
    if (prev >= 0 && STEPS[prev].leave) STEPS[prev].leave();
    cur = i; prev = i;
    try { history.replaceState(null, '', '?room=' + room + '&step=' + (i + 1)); } catch (e) {}
    var s = STEPS[i], host = $('step');
    host.innerHTML = '<p class="eyebrow">Step ' + (i + 1) + ' of ' + STEPS.length + '</p><h1 class="two-tone">' + s.title + '</h1><div id="stepBody"></div>';
    s.render($('stepBody'));
    if (s.enter) s.enter();
    $('dots').innerHTML = STEPS.map(function (_, k) { return '<span class="' + (k < i ? 'done' : k === i ? 'cur' : '') + '"' + (k === i ? ' aria-current="step"' : '') + '></span>'; }).join('');
    $('btnBack').disabled = i === 0;
    $('btnNext').textContent = i === STEPS.length - 1 ? 'Finish' : 'Next';
    $('btnNext').disabled = i === STEPS.length - 1;
    host.focus({ preventScroll: true }); window.scrollTo(0, 0);
    refreshStatusEls();
  }
  $('btnNext').onclick = function () { go(cur + 1); };
  $('btnBack').onclick = function () { go(cur - 1); };

  // ---------- troubleshooting drawer ----------
  var common = ['Nothing works at all: press Switch to Demo mode at the top. Then ring Zeze.', 'Page looks stuck: pull down to refresh. Your place is kept.'];
  $('btnTrouble').onclick = function () {
    var list = STEPS[cur].trouble.concat(common);
    $('drawerTitle').textContent = 'Troubleshooting: ' + STEPS[cur].name;
    $('drawerBody').innerHTML = '<ul>' + list.map(function (t) { return '<li></li>'; }).join('') + '</ul>';
    [].forEach.call($('drawerBody').querySelectorAll('li'), function (li, k) { li.textContent = list[k]; });
    $('drawer').hidden = false; $('btnTrouble').setAttribute('aria-expanded', 'true'); $('btnDrawerClose').focus();
  };
  function closeDrawer() { $('drawer').hidden = true; $('btnTrouble').setAttribute('aria-expanded', 'false'); $('btnTrouble').focus(); }
  $('btnDrawerClose').onclick = closeDrawer;
  $('drawer').addEventListener('click', function (e) { if (e.target === $('drawer')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });

  paintFailsafe(); pill(); connect(); go(cur);
  setInterval(refreshStatusEls, 1000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
