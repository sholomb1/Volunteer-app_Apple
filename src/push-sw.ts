/// <reference lib="webworker" />
/**
 * Service worker — combines Workbox precache + a Web Push handler.
 *
 *   • Workbox: same precache/skipWaiting/clientsClaim behavior we had with
 *     generateSW. Defined via the injectManifest entry point.
 *   • Push handler: receives JSON {title, body, data} from the server, shows
 *     a system notification, and routes notification clicks back into the app.
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// One-time hard purge for the 2026-07-06 broadcast/address rollout.
// Old service-worker versions were holding onto the pre-rollout assets and
// keeping "Broadcast" / red-dot chat / autocomplete / queue-now hidden from
// tabs that had already installed the PWA. On install, wipe every cache
// storage this scope owns so the browser refetches everything from the
// origin (which is what we already deployed).
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch {
      /* ignore */
    }
  })());
});

// After the new SW activates, force every open tab to reload so the fresh
// bundle actually mounts — otherwise a client that never reloads would keep
// running the old code even after the new SW takes control.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      try { (c as WindowClient).navigate?.((c as WindowClient).url); } catch { /* ignore */ }
    }
  })());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; data?: Record<string, string> } = {};
  try { payload = event.data.json(); } catch { payload = { title: 'Zeh L\'Zeh', body: event.data.text() }; }
  const title = payload.title || "Zeh L'Zeh";
  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body || '',
    icon: '/rescue/icon-192.png',
    badge: '/rescue/icon-192.png',
    data: payload.data ?? {},
    tag: payload.data?.type ?? 'zlz',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as Record<string, string>;
  const target = data.url ? `/rescue${data.url.startsWith('/') ? data.url : '/' + data.url}` : '/rescue/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        try { (c as WindowClient).navigate?.(target); } catch { /* ignore */ }
        return (c as WindowClient).focus();
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
