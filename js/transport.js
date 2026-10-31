/* Supabase Realtime BROADCAST over a plain WebSocket (Phoenix protocol v1). No library, no tables, nothing written.
   PK.transport.connect({room,onMsg,onStatus}) -> {send(obj), close(), status()}
   status: 'connecting' | 'open' | 'closed'  ('open' = channel joined) */
(function (g) {
  'use strict';
  function endpoint() {
    var C = g.PK.config, o = C.qs && C.qs('rt');
    if (o) return o; // test hook only
    return C.SUPABASE_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(C.SUPABASE_KEY) + '&vsn=1.0.0';
  }
  function connect(opts) {
    var ws = null, ref = 0, hb = null, retry = 0, closed = false, joined = false, timer = null, topic = 'realtime:pk-' + opts.room, st = 'connecting';
    function setStatus(s) { if (s !== st) { st = s; try { opts.onStatus && opts.onStatus(s); } catch (e) {} } }
    function raw(o) { try { ws.send(JSON.stringify(o)); return true; } catch (e) { return false; } }
    function open() {
      if (closed) return;
      setStatus('connecting'); joined = false;
      try { ws = new WebSocket(endpoint()); } catch (e) { schedule(); return; }
      ws.onopen = function () {
        raw({ topic: topic, event: 'phx_join', ref: String(++ref), join_ref: '1', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } } });
        clearInterval(hb);
        hb = setInterval(function () { raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }); }, 20000);
      };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.event === 'phx_reply' && m.topic === topic) {
          if (m.payload && m.payload.status === 'ok') { joined = true; retry = 0; setStatus('open'); }
          else { try { ws.close(); } catch (e) {} }
        } else if (m.event === 'phx_error' || m.event === 'phx_close') {
          if (m.topic === topic) { try { ws.close(); } catch (e) {} }
        } else if (m.event === 'broadcast' && m.topic === topic && m.payload && m.payload.payload) {
          try { opts.onMsg && opts.onMsg(m.payload.payload); } catch (e) { console.error(e); }
        }
      };
      ws.onclose = function () { clearInterval(hb); joined = false; if (!closed) { setStatus('closed'); schedule(); } };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }
    function schedule() { clearTimeout(timer); var d = Math.min(8000, 1000 * Math.pow(2, retry++)); timer = setTimeout(open, d); }
    open();
    // coming back online / tab visible: reconnect now instead of waiting out the back-off
    function kick() { if (!closed && !joined) { clearTimeout(timer); retry = 0; if (ws) { try { ws.close(); } catch (e) {} } else open(); } }
    g.addEventListener('online', kick);
    return {
      send: function (obj) { if (!joined) return false; return raw({ topic: topic, event: 'broadcast', ref: String(++ref), payload: { type: 'broadcast', event: 'm', payload: obj } }); },
      status: function () { return st; },
      close: function () { closed = true; clearTimeout(timer); clearInterval(hb); g.removeEventListener('online', kick); try { ws && ws.close(); } catch (e) {} setStatus('closed'); }
    };
  }
  g.PK = g.PK || {}; g.PK.transport = { connect: connect };
})(window);
