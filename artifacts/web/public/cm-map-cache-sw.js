const MAP_CACHE = "cm-map-tiles-v1";
const MAP_HOSTS = [
  "tile.openstreetmap.org",
  "a.basemaps.cartocdn.com",
  "b.basemaps.cartocdn.com",
  "c.basemaps.cartocdn.com",
  "d.basemaps.cartocdn.com",
  "server.arcgisonline.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!MAP_HOSTS.includes(url.hostname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(MAP_CACHE);
    const cached = await cache.match(event.request);
    const network = fetch(event.request)
      .then((response) => {
        if (response && response.ok) cache.put(event.request, response.clone()).catch(() => undefined);
        return response;
      })
      .catch(() => cached);
    return cached || network;
  })());
});
