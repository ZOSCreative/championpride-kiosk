/* Offline shell: after first load, display.html (incl. ?demo=1), operator and sitter card work with no network.
   Realtime (WebSocket) is never touched by the service worker. Bump VERSION when files change. */
var VERSION = 'pk-v1';
var FILES = ['./', 'index.html', 'display.html', 'sensor.html', 'operator.html', 'sitter.html', 'css/kiosk.css', 'css/display.css', 'css/operator.css', 'css/card.css', 'js/config.js', 'js/analysis.js', 'js/qr.js', 'js/transport.js', 'js/display.js', 'js/sensor.js', 'js/operator.js', 'js/card.js'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(r).then(function (res) { if (res && res.ok) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); } return res; }).catch(function () { return hit; });
    return hit || net;
  }));
});
