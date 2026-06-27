// Minimal service worker — its only job is to make the app installable on Android (Chrome's PWA
// install criteria want a registered SW with a fetch handler). It intentionally caches NOTHING: this
// app is live / real-time, so every request must hit the network — we never serve stale odds/scores.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* passthrough — no respondWith(), so the browser handles every request normally (no caching) */
});
