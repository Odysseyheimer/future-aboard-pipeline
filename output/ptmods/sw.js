/* Pocket Tutor v2 - service worker (module "pwa")
   ES5-safe.
   Strategy:
     - PRECACHE only the tiny app shell (never the big JSON decks) so install
       cannot be wedged by a 10MB atomic cache.addAll on a slow connection.
     - Warm the data decks best-effort AFTER activate (each file individually,
       failures ignored) so offline still works without blocking updates.
     - NETWORK-FIRST for navigation/HTML so an online user always gets the newest
       app.html on the first open (fixes the "reopen twice to see updates" bug).
     - CACHE-FIRST for data/*.json + icons + manifest (they are versioned by the
       CACHE name; a deploy bumps CACHE and activate() drops the old cache).
   Bump CACHE below on every deploy so phones refetch.
*/

/* eslint-disable no-var */
var CACHE = "pocket-tutor-v124";
// Japanese sidecars (data/ja/<file>.<sha8>.json) are content-addressed, so they live in their own
// cache that is NEVER bumped: a deploy does not make phones re-download them. JA_KEEP prunes old ones.
var JA_CACHE = "pocket-tutor-ja";

// tiny, must-always-work shell — safe to precache atomically
var SHELL_URLS = [
  "./",
  "./index.html",
  "./app.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// bigger assets: cached lazily on first use, and warmed best-effort after activate
var DATA_URLS = [
  "./data/oxford.json", "./data/awl.json", "./data/colloc.json", "./data/syn.json",
  "./data/pv.json", "./data/idiom.json", "./data/topic.json", "./data/knowledge.json",
  "./data/sentences.json", "./data/conversations.json", "./data/wordchoice.json",
  "./data/exam.json", "./data/reading.json", "./data/bank.json", "./data/fix.json",
  "./data/stories.json", "./data/structure.json", "./data/campaign_landing.json", "./data/campaign_detective.json", "./data/campaign_fantasy.json", "./data/formal.json", "./data/formal_articles.json", "./data/shapes.json", "./data/grammar.json"
];

// ---- install: precache ONLY the shell (small + reliable). Do NOT skipWaiting
// automatically — wait until the page tells us to (so we never swap assets
// under a running quiz). ----
self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL_URLS); }));
});

// ---- activate: drop old caches, take control, then warm data decks off the
// critical path (individually; a failure of one must not break the others). ----
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) { return (name !== CACHE && name !== JA_CACHE) ? caches.delete(name) : undefined; }));
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      warmData(); // fire-and-forget; not awaited so activation stays fast
    })
  );
});

function warmData() {
  caches.open(CACHE).then(function (cache) {
    for (var i = 0; i < DATA_URLS.length; i++) {
      // best-effort: ignore per-file failures (offline, slow, missing)
      cache.add(DATA_URLS[i]).catch(function () {});
    }
  }).catch(function () {});
}

// ---- let the page trigger an immediate takeover (the "tap to update" banner) ----
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") { self.skipWaiting(); }
  if (event.data && event.data.type === "JA_KEEP" && event.data.files) {
    var keep = {};
    for (var i = 0; i < event.data.files.length; i++) keep[event.data.files[i]] = 1;
    caches.open(JA_CACHE).then(function (cache) {
      return cache.keys().then(function (reqs) {
        reqs.forEach(function (rq) {
          var name = rq.url.split("/").pop();
          if (name !== "index.json" && !keep[name]) cache.delete(rq);
        });
      });
    }).catch(function () {});
  }
  if (event.data && event.data.type === "GET_VERSION" && event.source) {
    event.source.postMessage({ type: "VERSION", version: CACHE });
  }
});

// ---- helpers ----
function isNavigationRequest(request) {
  return request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept") &&
      request.headers.get("accept").indexOf("text/html") !== -1);
}

function isCacheFirstAsset(url) {
  if (url.pathname.indexOf("/data/") !== -1 && url.pathname.indexOf(".json") !== -1) return true;
  if (url.pathname.indexOf("icon-192.png") !== -1 || url.pathname.indexOf("icon-512.png") !== -1) return true;
  if (url.pathname.indexOf("manifest.webmanifest") !== -1) return true;
  return false;
}

// network-first: fresh from network, fall back to cache offline
function networkFirst(request) {
  return fetch(request).then(function (resp) {
    if (resp && resp.ok) {
      var clone = resp.clone();
      caches.open(CACHE).then(function (cache) { cache.put(request, clone); }).catch(function () {});
    }
    return resp;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      return cached || caches.match("./app.html") || caches.match("./");
    });
  });
}

// cache-first: serve from cache immediately, else fetch + store
function cacheFirst(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (resp) {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      }).catch(function () { return cached; });
    });
  });
}

// cache-first in the never-bumped Japanese cache
function jaFirst(request) {
  return caches.open(JA_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (resp) {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      });
    });
  });
}

// ---- fetch ----
self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigationRequest(request)) { event.respondWith(networkFirst(request)); return; }
  if (url.pathname.indexOf("/data/ja/") !== -1) { event.respondWith(jaFirst(request)); return; }
  if (isCacheFirstAsset(url)) { event.respondWith(cacheFirst(request)); return; }

  event.respondWith(
    caches.match(request).then(function (cached) {
      return cached || fetch(request).catch(function () { return cached; });
    })
  );
});
