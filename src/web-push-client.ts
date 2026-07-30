/**
 * Browser-side Web Push subscription. Call ensureWebPushSubscribed() after
 * login — it requests notification permission, gets the VAPID public key
 * from the server, subscribes via PushManager, and posts the subscription
 * to /me/web-push/subscribe so the server can deliver pushes to us.
 *
 * Safe to call multiple times: subscribing the same browser is idempotent
 * (the server upserts by endpoint).
 */
import { api } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensureWebPushSubscribed(): Promise<{ ok: boolean; reason?: string }> {
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no-service-worker' };
  if (!('PushManager' in window))     return { ok: false, reason: 'no-push-manager' };

  // The browser doesn't allow requesting permission from a non-user-gesture
  // *and* we don't want to nag users on every reload. Only prompt when
  // permission has not yet been answered.
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'permission-denied' };

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Re-POST so the server records last-seen; idempotent.
    await postSubscription(existing);
    return { ok: true };
  }

  const keyResp = await api<{ data: { publicKey: string } }>('/api/me/web-push/public-key');
  const publicKey = keyResp.data?.publicKey;
  if (!publicKey) return { ok: false, reason: 'no-vapid-key' };

  // Cast through unknown — TS lib types for PushManager are stricter than the
  // browser-accepted Uint8Array in practice.
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  });
  await postSubscription(sub);
  return { ok: true };
}

async function postSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  await api('/api/me/web-push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      userAgent: navigator.userAgent.slice(0, 500),
    }),
  });
}
