/* Pocket Protocol kiosk - shared config. No visitor data is ever stored. */
(function (g) {
  'use strict';
  var C = {
    // Public-by-design publishable values, read from the PocketProtocol Lovable project source
    // (src/lib/supabase.ts / .env). Used for Realtime BROADCAST only: no tables, nothing written.
    SUPABASE_URL: 'https://shmajnwkvfcvtdmgbxks.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNobWFqbndrdmZjdnRkbWdieGtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjY4MjcsImV4cCI6MjA5ODAwMjgyN30.m8b4Ch9ErL23Z5Xn5dSyW5b4F22CsG-DiAx7j-Jymgo',
    // Test hook: ?rt=ws://host:port/websocket overrides the realtime endpoint (used by test script only).
    EYE_URL: 'https://eye.championpride.com',
    DEFAULT_DURATION: 60,
    END_CARD_SECONDS: 20,
    DEMO_DURATION: 30,
    BATCH_MS: 100,
    PHONE_TIMEOUT_MS: 6000,
    DISCLAIMER: 'A demonstration of how your phone sees your movement. Not a medical or clinical measure.',
    CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  };
  C.newRoom = function () {
    var s = '', a = C.CODE_ALPHABET, r = new Uint8Array(4);
    (g.crypto || g.msCrypto).getRandomValues(r);
    for (var i = 0; i < 4; i++) s += a[r[i] % a.length];
    return s;
  };
  C.qs = function (k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };
  C.store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  C.cleanRoom = function (s) { return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); };
  C.pageUrl = function (name, params) {
    var base = location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, '');
    var q = params ? '?' + Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '';
    return base + name + q;
  };
  g.PK = g.PK || {}; g.PK.config = C;
})(window);
