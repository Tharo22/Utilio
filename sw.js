/* ImmoHub: gemeinsamer Offline-Speicher für alle Apps.
   Beim Installieren werden alle Dateien geladen, danach startet die App auch ohne Netz.
   Abruf: erst Netz (max. 2,5 s, damit Updates ankommen), sonst gespeicherte Kopie. */
const V = 'immohub-17';
const FILES = [
"./besichtigung/apple-touch-icon.png",
"./besichtigung/fonts/bricolage-700.woff",
"./besichtigung/fonts/plexmono-400.woff",
"./besichtigung/fonts/plexmono-600.woff",
"./besichtigung/index.html",
"./bestands-cockpit/apple-touch-icon.png",
"./bestands-cockpit/fonts/bricolage-700.woff",
"./bestands-cockpit/fonts/plexmono-400.woff",
"./bestands-cockpit/fonts/plexmono-600.woff",
"./bestands-cockpit/index.html",
"./flip-rechner/apple-touch-icon.png",
"./flip-rechner/fonts/bricolage-700.woff",
"./flip-rechner/fonts/plexmono-400.woff",
"./flip-rechner/fonts/plexmono-600.woff",
"./flip-rechner/index.html",
"./immo-schnellcheck/apple-touch-icon.png",
"./immo-schnellcheck/fonts/bricolage-700.woff",
"./immo-schnellcheck/fonts/plexmono-400.woff",
"./immo-schnellcheck/fonts/plexmono-600.woff",
"./immo-schnellcheck/index.html",
"./immobilien-hub/apple-touch-icon.png",
"./immobilien-hub/fonts/bricolage-700.woff",
"./immobilien-hub/fonts/plexmono-400.woff",
"./immobilien-hub/fonts/plexmono-600.woff",
"./immobilien-hub/index.html",
"./immobilien-hub/plus.js",
"./index.html",
"./manifest.webmanifest",
"./nebenkosten/app.css",
"./nebenkosten/app.js",
"./nebenkosten/apple-touch-icon.png",
"./nebenkosten/fonts/bricolage-700.woff",
"./nebenkosten/fonts/plexmono-400.woff",
"./nebenkosten/fonts/plexmono-600.woff",
"./nebenkosten/index.html",
"./nebenkosten/logik.js",
"./pv-waermepumpe/apple-touch-icon.png",
"./pv-waermepumpe/fonts/bricolage-700.woff",
"./pv-waermepumpe/fonts/plexmono-400.woff",
"./pv-waermepumpe/fonts/plexmono-600.woff",
"./pv-waermepumpe/index.html",
"./renovierung/apple-touch-icon.png",
"./renovierung/fonts/bricolage-700.woff",
"./renovierung/fonts/plexmono-400.woff",
"./renovierung/fonts/plexmono-600.woff",
"./renovierung/index.html",
"./shared/core.js",
"./shared/i18n-en.js",
"./shared/icons/icon-192.png",
"./shared/icons/icon-512.png",
"./shared/icons/icon-maskable-512.png",
"./shared/ui.css",
"./vermietung/apple-touch-icon.png",
"./vermietung/fonts/bricolage-700.woff",
"./vermietung/fonts/plexmono-400.woff",
"./vermietung/fonts/plexmono-600.woff",
"./vermietung/index.html"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  const fromCache = () => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === 'navigate' ? caches.match(new URL('index.html', u).href).then(x => x || caches.match('./immobilien-hub/index.html')) : undefined));
  const net = fetch(r).then(res => { if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500));
  e.respondWith(Promise.race([net, timeout]).catch(() => fromCache().then(m => m || net)));
});
