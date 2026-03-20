const CACHE_VERSION = 2;
const CACHE_PREFIX = "holdsworth";
const STATIC_CACHE = `${CACHE_PREFIX}-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `${CACHE_PREFIX}-dynamic-v${CACHE_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}-images-v${CACHE_VERSION}`;
const PHOTO_CACHE = `${CACHE_PREFIX}-photos-v${CACHE_VERSION}`;

// App shell — pre-cached on install
const PRECACHE_URLS = [
  "/",
  "/cards",
  "/scan",
  "/offline.html",
  "/manifest.json",
  "/icon.svg",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// Max ages for cache entries (in ms)
const IMAGE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const PHOTO_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// Background sync queue
const SYNC_QUEUE = "holdsworth-sync-queue";

// ─── Install ───────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate — clean up old caches ────────────────────────────────────
self.addEventListener("activate", (event) => {
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE, PHOTO_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && !currentCaches.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Non-GET requests: attempt network, queue for background sync on failure
  if (request.method !== "GET") {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        await addToQueue(request);
        if ("sync" in self.registration) {
          try {
            await self.registration.sync.register(SYNC_QUEUE);
          } catch {
            // sync registration failed — queued for manual retry
          }
        }
        return new Response(
          JSON.stringify({ queued: true, message: "Saved offline — will sync when back online" }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // Skip Chrome extension and dev requests
  if (url.protocol === "chrome-extension:" || url.hostname === "localhost") {
    return;
  }

  // API calls — network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Card photos from GCS — cache-first with 30-day expiry
  if (url.hostname.includes("storage.googleapis.com")) {
    event.respondWith(cacheFirstWithExpiry(request, PHOTO_CACHE, PHOTO_MAX_AGE));
    return;
  }

  // Images — cache-first with 7-day expiry
  if (request.destination === "image" || /\.(svg|png|jpg|jpeg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirstWithExpiry(request, IMAGE_CACHE, IMAGE_MAX_AGE));
    return;
  }

  // App shell (HTML, CSS, JS) — cache-first with network update
  if (
    request.destination === "document" ||
    request.destination === "script" ||
    request.destination === "style" ||
    url.pathname === "/"
  ) {
    event.respondWith(cacheFirstWithNetworkUpdate(request, STATIC_CACHE));
    return;
  }

  // Everything else — network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ─── Background sync for failed mutations ──────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_QUEUE) {
    event.waitUntil(replayQueue());
  }
});

// ─── Cache strategies ──────────────────────────────────────────────────

/**
 * Network-first: try network, fall back to cache, then offline page for navigations.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // For navigation requests, serve offline page
    if (request.destination === "document") {
      return caches.match("/offline.html");
    }
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

/**
 * Cache-first with network update: serve from cache immediately,
 * but also fetch from network to update the cache for next time.
 */
async function cacheFirstWithNetworkUpdate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Fire-and-forget network update
  const networkUpdate = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  // No cache hit — wait for network
  try {
    const response = await networkUpdate;
    if (response) return response;
  } catch {
    // fall through
  }

  if (request.destination === "document") {
    return caches.match("/offline.html");
  }
  return new Response("Offline", { status: 503 });
}

/**
 * Cache-first with expiry: serve from cache if fresh, otherwise fetch.
 */
async function cacheFirstWithExpiry(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    const dateHeader = cached.headers.get("date") || cached.headers.get("sw-cached-at");
    if (dateHeader) {
      const cachedTime = new Date(dateHeader).getTime();
      if (Date.now() - cachedTime < maxAge) {
        return cached;
      }
    } else {
      // No date header — serve it but refresh in background
      fetch(request)
        .then((r) => {
          if (r.ok) cache.put(request, r);
        })
        .catch(() => {});
      return cached;
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (cached) return cached;
    return new Response("", { status: 503 });
  }
}

// ─── Background sync queue helpers ─────────────────────────────────────

async function addToQueue(request) {
  try {
    const db = await openSyncDB();
    const tx = db.transaction("requests", "readwrite");
    const body = await request.clone().text();
    tx.objectStore("requests").add({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    });
    await tx.complete;
  } catch {
    // IndexedDB not available — silently fail
  }
}

async function replayQueue() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction("requests", "readwrite");
    const store = tx.objectStore("requests");
    const requests = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    for (const entry of requests) {
      try {
        await fetch(entry.url, {
          method: entry.method,
          headers: entry.headers,
          body: entry.method !== "GET" ? entry.body : undefined,
        });
        store.delete(entry.id);
      } catch {
        // Will retry on next sync
        break;
      }
    }
  } catch {
    // IndexedDB not available
  }
}

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("holdsworth-sync", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("requests", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
