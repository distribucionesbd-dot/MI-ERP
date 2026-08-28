/* =========================================================
   SERVICE-WORKER.JS
   Cache versionado del "app shell". Network-first para TODO
   (HTML, CSS, JS, manifest, íconos): siempre intenta traer la
   versión más nueva de la red primero, y solo si no hay conexión
   usa la copia guardada. Así un archivo modificado (ej. config.js)
   nunca queda "pegado" a una versión vieja mientras haya internet.
   Nunca cachea llamadas a Apps Script (login/sync): esas van
   directo a la red y ni pasan por acá (son POST a otro origen).

   IMPORTANTE: subí CACHE_VERSION cada vez que cambies archivos del
   app shell, para forzar a los dispositivos ya instalados a bajar
   la versión nueva apenas detecten el service worker distinto
   (REGLA 9).
   ========================================================= */
const CACHE_VERSION = 'v1.0.3';
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
function esNavegacion(req, url){
  return req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('manifest.webmanifest');
}

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return; // login/syncBatch son POST: nunca se tocan acá
  const url = new URL(req.url);
  if(!esMismoOrigen(url)) return; // Apps Script y cualquier otro origen: directo a la red

  // Network-first con fallback a caché: intenta la red siempre que se pueda
  // (para no quedar pegado a una versión vieja de ningún archivo), y si no
  // hay conexión usa la última copia guardada.
  event.respondWith(
    fetch(req).then(resp=>{
      if(resp && resp.ok){
        const copia = resp.clone();
        caches.open(CACHE_NAME).then(cache=> cache.put(req, copia));
      }
      return resp;
    }).catch(()=>
      caches.match(req).then(cached=> cached || (esNavegacion(req, url) ? caches.match('./index.html') : undefined))
    )
  );
});
