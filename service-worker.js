/* =========================================================
   SERVICE-WORKER.JS
   Cache versionado del "app shell". Network-first para HTML/manifest
   (para detectar versión nueva sin romper el offline), cache-first
   con revalidación para el resto. Nunca cachea llamadas a Apps Script
   (login/sync): esas siempre van directo a la red.

   IMPORTANTE: subí CACHE_VERSION cada vez que cambies archivos del
   app shell, para que los dispositivos no queden pegados a una
   versión vieja (REGLA 9).
   ========================================================= */
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = 'mi-erp-' + CACHE_VERSION;

const APP_SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/config.js', './js/utils.js', './js/db.js', './js/storage-service.js',
  './js/auth-service.js', './js/business-service.js', './js/sync-service.js', './js/migration.js',
  './js/ui/toast.js', './js/ui/modal.js', './js/ui/nav.js', './js/ui/login.js',
  './js/ui/dashboard.js', './js/ui/productos.js', './js/ui/venta.js', './js/ui/boletas.js',
  './js/ui/clientes.js', './js/ui/gastos.js', './js/ui/reportes.js', './js/ui/config.js',
  './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=> cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(names=> Promise.all(
      names.filter(n=> n!==CACHE_NAME).map(n=> caches.delete(n))
    )).then(()=> self.clients.claim())
  );
});

self.addEventListener('message', (event)=>{
  if(event.data && event.data.type==='SKIP_WAITING') self.skipWaiting();
});

function esMismoOrigen(url){
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return; // login/syncBatch son POST: nunca se tocan acá
  const url = new URL(req.url);
  if(!esMismoOrigen(url)) return; // Apps Script y cualquier otro origen: directo a la red

  const esNavegacion = req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('manifest.webmanifest');

  if(esNavegacion){
    event.respondWith(
      fetch(req).then(resp=>{
        caches.open(CACHE_NAME).then(cache=> cache.put(req, resp.clone()));
        return resp;
      }).catch(()=> caches.match(req).then(r=> r || caches.match('./index.html')))
    );
    return;
  }

  // Assets estáticos: cache-first con revalidación en segundo plano.
  event.respondWith(
    caches.match(req).then(cached=>{
      const fetchPromise = fetch(req).then(resp=>{
        if(resp && resp.ok) caches.open(CACHE_NAME).then(cache=> cache.put(req, resp.clone()));
        return resp;
      }).catch(()=> cached);
      return cached || fetchPromise;
    })
  );
});
