/* MISS of Pattaya – service worker: shows push notifications */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const scope = self.registration.scope;
  e.waitUntil(self.registration.showNotification(d.title || 'MISS of Pattaya 👑', {
    body: d.body || '',
    icon: scope + 'icon.svg',
    badge: scope + 'icon.svg',
    tag: d.tag || undefined,
    data: { url: d.url ? new URL(d.url, scope).href : scope }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
