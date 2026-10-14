/*
 * La Principal 2050: lets the counter open without a connection.
 *
 * - /_next/static (code, styles, fonts): cache first; file names change on every deploy.
 * - Vender and Consultar precio: network first, the last good copy when offline.
 * - Any other page offline: /sin-conexion, which explains what still works.
 * Data never goes through here: the catalog and the queued sales live in IndexedDB.
 */
const VERSION = "v1";
const STATIC = `lp-static-${VERSION}`;
const PAGES = `lp-pages-${VERSION}`;
const OFFLINE_PAGES = ["/vender", "/vender/consulta", "/vender/pendientes"];
const FALLBACK = "/sin-conexion";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(FALLBACK))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("lp-") && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a real page of the counter is kept (not a redirect to the login).
          if (response.ok && !response.redirected && OFFLINE_PAGES.includes(url.pathname)) {
            const copy = response.clone();
            caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(url.pathname)) ?? (await cache.match(FALLBACK)) ?? Response.error();
        }),
    );
  }
});
