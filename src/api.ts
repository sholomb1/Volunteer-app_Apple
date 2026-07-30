/**
 * Backend client → volunteer-portal Fastify API.
 *
 * JWT in localStorage (web + PWA install both have it). Auto-401 → clears
 * token. Empty-body POSTs omit Content-Type so Fastify doesn't reject.
 */
const TOKEN_KEY = 'vp.auth.token';
const USER_KEY  = 'vp.auth.user';

/**
 * Pick the right API base for whichever surface we're on:
 *  • VITE_API_BASE wins (local dev, override).
 *  • Capacitor APK runs the WebView at https://localhost/ — that has no
 *    backend, so we must hit the absolute staging URL. Detected via
 *    `Capacitor.isNativePlatform()`.
 *  • Web build served from staging.zehlzeh.org/rescue/ → same-origin
 *    `/rescue-api` (proxied to localhost:4137 by Apache).
 *  • Anything else (file://, local preview) → absolute staging URL.
 */
export const API_BASE = (() => {
  const env = (import.meta.env.VITE_API_BASE as string | undefined);
  if (env) return env;
  if (typeof window === 'undefined') return 'https://staging.zehlzeh.org/rescue-api';
  const cap = (window as any).Capacitor;
  const isNative = cap?.isNativePlatform?.() === true || cap?.getPlatform?.() === 'android' || cap?.getPlatform?.() === 'ios';
  const host = window.location.hostname || '';
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '';
  const isStaging   = host === 'staging.zehlzeh.org';
  if (isNative || isLocalhost) return 'https://staging.zehlzeh.org/rescue-api';
  // Hosted on staging.zehlzeh.org/rescue/ → same-origin proxy. Anywhere else
  // (Firebase Hosting, Vercel, Netlify, etc.) → hit the absolute staging URL.
  if (isStaging) return '/rescue-api';
  return 'https://staging.zehlzeh.org/rescue-api';
})();

export type AuthUser = {
  id: number; email: string | null; firstName: string; lastName: string; role: string;
};

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
/**
 * Whether the currently signed-in user can make changes. Read-only + viewer
 * roles come back false. Used to hide destructive buttons in the portal —
 * server-side write endpoints still need to enforce the same rule.
 */
export function canWrite(role?: string | null): boolean {
  if (!role) return false;
  return ['admin', 'coordinator', 'staff', 'dispatcher'].includes(role);
}
export function canManageUsers(role?: string | null): boolean {
  return role === 'admin';
}
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}
export function setAuth(token: string | null, user: AuthUser | null) {
  if (token === null) localStorage.removeItem(TOKEN_KEY); else localStorage.setItem(TOKEN_KEY, token);
  if (user  === null) localStorage.removeItem(USER_KEY);  else localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * On 401 we drop the token AND hard-reload to the login screen. Without this,
 * React Query keeps every query in an error state ("Session expired") forever
 * because the Root component captured the user once at mount; clearing
 * localStorage doesn't re-trigger the auth-gate. The reload guarantees the
 * user lands on Login instead of a portal full of red error panels.
 *
 * Login itself short-circuits this so the wrong-password 401 stays inline.
 */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) || {}) };
  // Always declare JSON content-type for body-bearing verbs. CapacitorHttp
  // (Android native client) sends an empty body without a Content-Type header
  // by default, which makes Fastify reject the request with 415 Unsupported
  // Media Type even when the endpoint doesn't read a body. Sending a `{}`
  // body + the JSON content-type satisfies the parser on both ends.
  const method = (init.method ?? 'GET').toUpperCase();
  // Include DELETE — Fastify's default JSON parser rejects DELETE requests
  // without a Content-Type header as 415 Unsupported Media Type, which
  // broke "Delete" on the Edit Steady Pickup modal. Sending a `{}` body +
  // JSON content-type is a no-op on the server side but satisfies the parser.
  const isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  const finalInit: RequestInit = { ...init };
  if (isBodyMethod) {
    if (init.body == null) finalInit.body = '{}';
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(API_BASE.replace(/\/$/, '') + path, { ...finalInit, headers });
  // Portal-wide force-refresh check. Any response can carry the epoch; if the
  // server has bumped ahead of what this tab has seen, wipe caches, unregister
  // the SW, and reload. Runs at most once per page load.
  maybeForcePortalReload(r.headers.get('X-Portal-Reload-Since'));
  if (r.status === 401) {
    const isLoginCall = path.includes('/auth/login');
    if (!isLoginCall) {
      setAuth(null, null);
      // One redirect per page-load even if many queries 401 at once.
      if (!(window as any).__vpAuthRedirected) {
        (window as any).__vpAuthRedirected = true;
        const base = (import.meta as any).env?.BASE_URL?.replace(/\/$/, '') || '';
        window.location.replace(base + '/');
      }
    }
    const body = await r.json().catch(() => ({}));
    throw new Error((body as any).error || (isLoginCall ? 'Invalid credentials' : 'Session expired'));
  }
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as any).error || `${r.status} ${r.statusText}`);
  }
  return r.json() as Promise<T>;
}

// Portal-wide force-refresh. On any API response, we compare the server's
// `X-Portal-Reload-Since` header with the epoch this tab last saw
// (localStorage `zlz_portal_reload_seen`). If the server is newer, we
// unregister service workers, delete every CacheStorage entry, and hard
// reload. Ignored inside the kiosk flow (no need to nuke a locked kiosk
// tablet mid-drop-off — the next kiosk boot picks up the new bundle).
const RELOAD_LS_KEY = 'zlz_portal_reload_seen';
let reloadInFlight = false;
export function maybeForcePortalReload(headerValue: string | null) {
  if (reloadInFlight) return;
  if (!headerValue) return;
  const serverEpoch = Number(headerValue);
  if (!Number.isFinite(serverEpoch) || serverEpoch <= 0) return;
  const seen = Number(localStorage.getItem(RELOAD_LS_KEY) || '0');
  // First-time capture: no prior seen value → record and don't reload.
  // Otherwise we'd nuke every tab as soon as this feature ships, which is
  // never what the admin wanted (they can bump explicitly when they want).
  if (!seen) { localStorage.setItem(RELOAD_LS_KEY, String(serverEpoch)); return; }
  if (serverEpoch <= seen) return;
  if (typeof window === 'undefined') return;
  if (window.location.pathname.includes('/kiosk/')) {
    // Kiosk gets refreshed at boot only — don't yank a driver mid-flow.
    return;
  }
  reloadInFlight = true;
  localStorage.setItem(RELOAD_LS_KEY, String(serverEpoch));
  void forceHardReload();
}
async function forceHardReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore — reload will still help */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }
  // Bypass HTTP cache with a cache-busting query string so the reload
  // picks up the freshest bundle even from a stale proxy.
  const u = new URL(window.location.href);
  u.searchParams.set('__r', String(Date.now()));
  window.location.replace(u.toString());
}

export type PickupAlertRecipient = { id: number; volunteerId: number; name: string; phone: string | null; smsOptIn: boolean; addedAt: string };
export const pickupAlerts = {
  list: () => api<{ data: PickupAlertRecipient[] }>('/api/admin/pickup-alert-recipients'),
  add:  (volunteerId: number) => api<{ data: { id: number; volunteerId: number } }>(
    '/api/admin/pickup-alert-recipients', { method: 'POST', body: JSON.stringify({ volunteerId }) }),
  remove: (id: number) => api(`/api/admin/pickup-alert-recipients/${id}`, { method: 'DELETE' }),
};

export const portalReload = {
  bump: () => api<{ data: { reloadSince: number } }>('/api/admin/portal-reload', { method: 'POST' }),
  current: () => api<{ data: { reloadSince: number } }>('/api/portal-reload-since'),
};

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await api<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password }),
  });
  setAuth(res.token, res.user);
  // Push registration is handled by AuthedApp's effect in App.tsx (runs on both
  // fresh login and startup-with-session), using static plugin imports.
  return res.user;
}

// ---------- volunteer endpoints ----------

export type SignupRow = { slot: number; first_name: string; last_name: string };
export type OpenPickup = {
  pickup_instance_id: number; scheduled_date: string; scheduled_time: string;
  status: string; urgency_level: string; notes: string | null;
  must_pickup_by: string | null; food_description: string | null;
  estimated_quantity: string | null; is_one_time: boolean;
  slots_capacity: number;
  suppliers: string | null; supplier_address: string | null;
  supplier_contact_name: string | null; supplier_phone: string | null;
  supplier_instructions: string | null;
  signups: SignupRow[];
};
export type MyPickup = OpenPickup & {
  assignment_id: number; assignment_status: string;
};
export type HistoryStats = {
  lifetime: number; thisMonth: number; hoursLogged: number;
  rewardPoints: number; donorsHelped: number; lastPickupAt: string | null;
};
export type ChatMsg = { id: number; body: string; created_at: string; author_user_id: number; first_name: string; last_name: string; role: string };
export type ActivityRow = { id: number; pickup_instance_id: number | null; store_id: number | null; miles: number | null; minutes: number | null; completed_at: string; notes: string | null; store_name: string | null };
export type ActivityStats = { pickups: number; miles: number; minutes: number; stores: number };

export const volunteer = {
  open:    () => api<{ data: OpenPickup[] }>('/api/me/open-pickups'),
  mine:    () => api<{ profile: { name: string }; data: MyPickup[] }>('/api/me/pickups'),
  history: () => api<{ profile: { name: string }; stats: HistoryStats; data: any[] }>('/api/me/history'),
  claim:   (id: number) => api(`/api/me/open-pickups/${id}/claim`, { method: 'POST' }),
  signup:  (id: number) => api<{ data: { pickupInstanceId: number; slot: number } }>(`/api/me/pickups/${id}/signup`, { method: 'POST' }),
  release: (id: number) => api(`/api/me/pickups/${id}/signup`, { method: 'DELETE' }),
  accept:  (assignmentId: number) => api(`/api/me/pickups/${assignmentId}/respond`, { method: 'POST', body: JSON.stringify({ action: 'accept' }) }),
  decline: (assignmentId: number) => api(`/api/me/pickups/${assignmentId}/respond`, { method: 'POST', body: JSON.stringify({ action: 'decline' }) }),
  start:   (assignmentId: number) => api(`/api/me/pickups/${assignmentId}/start`, { method: 'POST' }),
  complete: (assignmentId: number, body: { quantity?: string; notes?: string; photoUrl?: string; pickedUpAt?: string }) =>
    api(`/api/me/pickups/${assignmentId}/complete`, { method: 'POST', body: JSON.stringify(body) }),
  messages:    (pickupId: number) => api<{ data: ChatMsg[] }>(`/api/me/pickups/${pickupId}/messages`),
  sendMessage: (pickupId: number, body: string) => api<{ data: ChatMsg }>(`/api/me/pickups/${pickupId}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  chatSummary: () => api<{ data: { total: number; byPickup: Array<{ pickupInstanceId: number; lastBody: string; lastAt: string; unread: number }> } }>('/api/me/pickups/chat-summary'),
  saveActivity: (body: { pickupInstanceId?: number; storeId?: number; miles?: number; minutes?: number; notes?: string }) =>
    api<{ data: any }>('/api/me/activity-log', { method: 'POST', body: JSON.stringify(body) }),
  activity:    (scope: 'month' | 'all' = 'all') =>
    api<{ data: ActivityRow[]; stats: ActivityStats }>(`/api/me/activity-log?scope=${scope}`),
  availability: () =>
    api<{ data: { isAvailable: boolean; unavailableUntil: string | null } }>('/api/me/availability'),
  setAvailability: (isAvailable: boolean, unavailableUntil?: string | null) =>
    api<{ data: { isAvailable: boolean; unavailableUntil: string | null } }>(
      '/api/me/availability',
      { method: 'PATCH', body: JSON.stringify({ isAvailable, unavailableUntil }) },
    ),
};

// ---------- direct messages (in-app chat between any two users) ----------
export type DMRow  = { id: number; body: string; created_at: string; from_user_id: number; to_user_id: number; read_at: string | null; first_name?: string; last_name?: string };
export type SupplierContact  = { supplier_id: number; name: string; user_id: number | null; first_name: string | null; last_name: string | null; logo_url?: string | null };
export type VolunteerContact = { volunteer_id: number; first_name: string; last_name: string; phone_primary: string | null; user_id: number | null };

export type CrmInteraction = {
  id: number;
  targetType: 'volunteer' | 'supplier';
  targetId: number;
  targetName: string;
  channel: 'call' | 'text' | 'whatsapp' | 'email' | 'in_person' | 'voicemail' | 'other';
  direction: 'inbound' | 'outbound';
  occurredAt: string;
  summary: string | null;
  status: 'new_lead' | 'interested' | 'needs_followup' | 'ready_to_onboard' | 'active' | 'on_hold' | 'not_interested';
  nextFollowupAt: string | null;
  recordedById: number | null;
  recordedByName: string | null;
  spokeWithUserId: number | null;
  spokeWithLabel:  string | null;
  spokeWithName:   string | null;
  createdAt?: string;
};
export type FollowupDay = {
  day: string;
  count: number;
  items: Array<{
    id: number; targetType: 'volunteer' | 'supplier'; targetId: number;
    targetName: string; status: string; channel: string; time: string;
  }>;
};

export const crm = {
  interactions: (params: { targetType?: string; targetId?: number; status?: string; from?: string; to?: string; dueOnly?: boolean; limit?: number } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
    return api<{ data: CrmInteraction[] }>(`/api/crm/interactions${q.toString() ? '?' + q : ''}`);
  },
  followups: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to)   q.set('to',   to);
    return api<{ data: FollowupDay[] }>(`/api/crm/followups${q.toString() ? '?' + q : ''}`);
  },
  create: (body: Partial<CrmInteraction> & { targetType: string; targetId: number; channel: string }) =>
    api<{ data: CrmInteraction }>('/api/crm/interactions', { method: 'POST', body: JSON.stringify(body) }),
  patch:  (id: number, body: Partial<CrmInteraction>) =>
    api<{ data: CrmInteraction }>(`/api/crm/interactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) =>
    api(`/api/crm/interactions/${id}`, { method: 'DELETE' }),
};

// Global portal search (volunteers + suppliers + neighborhoods + pickups).
export type SearchResults = {
  volunteers:    Array<{ id: number; firstName: string; lastName: string; phone: string | null; area: string | null }>;
  suppliers:     Array<{ id: number; name: string; type: string | null; city: string | null }>;
  steadyPickups: Array<{ id: number; name: string | null }>;
  neighborhoods: Array<{ id: number; name: string; slug: string }>;
  pickups:       Array<{ id: number; scheduledDate: string; scheduledTime: string; status: string; supplier: string | null; food: string | null; notes: string | null }>;
};
export const search = {
  all: (q: string) => api<{ data: SearchResults }>(`/api/search?q=${encodeURIComponent(q)}`),
};

// Office SMS notification routing: per-event, per-phone toggleable list.
export type OnCallWindow = { dow: number; start: string; end: string };
export type NotificationPref = {
  id: number; eventType: string; phone: string; enabled: boolean;
  label: string | null;
  onCallOnly?: boolean;
  onCallSchedule?: OnCallWindow[];
  createdAt?: string; updatedAt?: string;
};
export type NotificationEvent = { key: string; label: string };

export const notificationPrefs = {
  list:   () => api<{ data: NotificationPref[]; events: NotificationEvent[] }>('/api/notification-prefs'),
  upsert: (body: { eventType: string; phone: string; enabled?: boolean; label?: string | null; onCallOnly?: boolean; onCallSchedule?: OnCallWindow[] }) =>
    api<{ data: NotificationPref }>('/api/notification-prefs', { method: 'POST', body: JSON.stringify(body) }),
  patch:  (id: number, body: { enabled?: boolean; label?: string | null; onCallOnly?: boolean; onCallSchedule?: OnCallWindow[] }) =>
    api<{ data: NotificationPref }>(`/api/notification-prefs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => api(`/api/notification-prefs/${id}`, { method: 'DELETE' }),
};

// Staff users for the "Spoke with" dropdown in CRM Log Interaction.
export type StaffUser = { id: number; name: string; role: string; email: string | null };
export const staffUsers = {
  list: () => api<{ data: StaffUser[] }>('/api/staff-users'),
};

// Admin/staff user management
export type AdminUser = {
  id: number; email: string; phone: string | null;
  role: 'admin' | 'coordinator' | 'staff';
  firstName: string; lastName: string;
  isActive: boolean;
  lastLoginAt: string | null; createdAt?: string;
};
export const adminUsers = {
  list:   () => api<{ data: AdminUser[] }>('/api/admin-users'),
  create: (body: { username: string; password: string; firstName?: string; lastName?: string; role?: 'admin' | 'coordinator' | 'staff' }) =>
    api<{ data: AdminUser }>('/api/admin-users', { method: 'POST', body: JSON.stringify(body) }),
  patch:  (id: number, body: { role?: string; isActive?: boolean }) =>
    api<{ data: AdminUser }>(`/api/admin-users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => api(`/api/admin-users/${id}`, { method: 'DELETE' }),
};

// Volunteer self-profile
export type VolunteerSelfProfile = {
  id: number;
  firstName: string; lastName: string;
  phonePrimary: string | null; email: string | null;
  homeAddress: string | null; locationArea: string | null;
  vehicleType: string | null; vehicleCapacity: string | null;
  refrigeratedHandling: string | null;
  prefersWhatsapp: boolean; smsOptIn: boolean;
  isAvailable: boolean;
};
export const volunteerSelf = {
  get:   () => api<{ data: VolunteerSelfProfile }>('/api/me/volunteer-profile'),
  patch: (body: Partial<VolunteerSelfProfile>) =>
    api<{ data: { id: number; first_name: string } }>('/api/me/volunteer-profile', { method: 'PATCH', body: JSON.stringify(body) }),
};

// Supplier self-profile
export type SupplierSelfProfile = {
  id: number; name: string; addressLine1: string | null; city: string | null;
  state: string | null; zip: string | null;
  contactName: string | null; contactPhone: string | null; contactEmail: string | null;
  pickupInstructions: string | null; preferredPickupWindow: string | null;
  contactHours: string | null; typicalDonation: string | null; holidaySchedule: string | null;
  kosherCertification: string | null; logoUrl: string | null;
  entrancePhotoUrl: string | null;
};
export const supplierSelf = {
  get:   () => api<{ data: SupplierSelfProfile }>('/api/me/supplier-profile'),
  patch: (body: Partial<SupplierSelfProfile>) =>
    api<{ data: { id: number; name: string } }>('/api/me/supplier-profile', { method: 'PATCH', body: JSON.stringify(body) }),
};

export const auth = {
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ data: { ok: boolean } }>('/api/me/change-password',
      { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
};

export const dm = {
  messages: (userId: number) => api<{ data: DMRow[] }>(`/api/me/dm/${userId}`),
  send:     (userId: number, body: string) => api<{ data: DMRow }>(`/api/me/dm/${userId}`, { method: 'POST', body: JSON.stringify({ body }) }),
  suppliers:  () => api<{ data: SupplierContact[] }>('/api/me/dm/contacts?kind=supplier'),
  volunteers: () => api<{ data: VolunteerContact[] }>('/api/me/dm/contacts?kind=volunteer'),
  office:     () => api<{ data: Array<{ user_id: number; first_name: string; last_name: string; role: string; name: string }> }>('/api/me/dm/contacts?kind=office'),
  unread:     () => api<{ data: { total: number; byPeer: Array<{ peerUserId: number; unread: number }> } }>('/api/me/dm/unread'),
  threads:    () => api<{ data: { total: number; threads: Array<{ peerUserId: number; lastBody: string; lastAt: string; lastFromMe: boolean; unread: number }> } }>('/api/me/dm/threads'),
};

export type VolunteerLocationRow = {
  id: number; first_name: string; last_name: string; phone_primary: string | null;
  location_area: string | null; lat: string; lng: string; accuracy_m: string | null; reported_at: string;
};

export const location = {
  reportMine: (body: { lat: number; lng: number; accuracy?: number }) =>
    api<{ data: { ok: boolean } }>('/api/me/location', { method: 'POST', body: JSON.stringify(body) }),
  driverLocations: () => api<{ data: VolunteerLocationRow[] }>('/api/volunteers/locations'),
};

// admin / coordinator views — list of pickup_instances by date range
export type AdminPickup = {
  id: number; scheduled_date: string; scheduled_time: string; status: string;
  suppliers: string | null; supplier_address: string | null;
  supplier_contact_name: string | null; supplier_contact_phone: string | null;
  notes: string | null; food_description: string | null; volunteers: string | null;
  slots_capacity: number;
};
// CRUD helpers for the coordinator portal — Suppliers, Volunteers, Steady
// Pickups, Sign-Ins, Options. All staff-only (the API hooks enforce that).
export const adminCRUD = {
  // Suppliers
  createSupplier: (body: any) => api<{ data: any }>('/api/suppliers', { method: 'POST', body: JSON.stringify(body) }),
  patchSupplier:  (id: number, body: any) => api<{ data: any }>(`/api/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSupplier: (id: number) => api(`/api/suppliers/${id}`, { method: 'DELETE' }),

  // Volunteers
  createVolunteer: (body: any) => api<{ data: any }>('/api/volunteers', { method: 'POST', body: JSON.stringify(body) }),
  patchVolunteer:  (id: number, body: any) => api<{ data: any }>(`/api/volunteers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteVolunteer: (id: number) => api(`/api/volunteers/${id}`, { method: 'DELETE' }),

  // Steady pickups
  steady:        () => api<{ data: any[] }>('/api/steady-pickups'),
  createSteady:  (body: any) => api<{ data: any }>('/api/steady-pickups', { method: 'POST', body: JSON.stringify(body) }),
  patchSteady:   (id: number, body: any) => api<{ data: any }>(`/api/steady-pickups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSteady:  (id: number) => api(`/api/steady-pickups/${id}`, { method: 'DELETE' }),

  // Office sign-ins
  signins:       () => api<{ data: any[] }>('/api/office-signins'),
  createSignin:  (body: any) => api<{ data: any }>('/api/office-signins', { method: 'POST', body: JSON.stringify(body) }),

  // Options (statuses, types, urgency levels)
  options:        (category?: string) => api<{ data: any[] }>(`/api/options${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  createOption:   (body: any) => api<{ data: any }>('/api/options', { method: 'POST', body: JSON.stringify(body) }),
  patchOption:    (id: number, body: any) => api<{ data: any }>(`/api/options/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOption:   (id: number) => api(`/api/options/${id}`, { method: 'DELETE' }),

  // Gifts ledger
  gifts:        (q: { recipientType?: 'volunteer' | 'supplier'; recipientId?: number } = {}) => {
    const qs = new URLSearchParams();
    if (q.recipientType) qs.set('recipientType', q.recipientType);
    if (q.recipientId)   qs.set('recipientId',   String(q.recipientId));
    return api<{ data: any[] }>(`/api/gifts${qs.toString() ? `?${qs}` : ''}`);
  },
  createGift:   (body: any) => api<{ data: any }>('/api/gifts', { method: 'POST', body: JSON.stringify(body) }),
  patchGift:    (id: number, body: any) => api<{ data: any }>(`/api/gifts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteGift:   (id: number) => api(`/api/gifts/${id}`, { method: 'DELETE' }),

  // Quick-add one-time pickup
  createPickup: (body: any) => api<{ data: any }>('/api/pickup-instances', { method: 'POST', body: JSON.stringify(body) }),
  patchPickup:  (id: number, body: any) => api<{ data: any }>(`/api/pickup-instances/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePickup: (id: number) => api(`/api/pickup-instances/${id}`, { method: 'DELETE' }),

  // Provision / reset the volunteer or supplier portal-app login. Username can
  // be an email or a phone (the backend normalizes); password is bcrypt-hashed
  // server-side. Used by the SupplierForm / VolunteerForm "Account login"
  // section.
  setVolunteerLogin: (id: number, body: { username: string; password: string }) =>
    api<{ data: { userId: number; username: string } }>(`/api/volunteers/${id}/login`,
      { method: 'POST', body: JSON.stringify(body) }),
  setSupplierLogin:  (id: number, body: { username: string; password: string }) =>
    api<{ data: { userId: number; username: string } }>(`/api/suppliers/${id}/login`,
      { method: 'POST', body: JSON.stringify(body) }),

  // Driver assignments — add a SECOND driver (POST), remove a specific one
  // (DELETE), or replace ALL drivers via PATCH volunteerId (in admin.pickups).
  addPickupDriver:    (piId: number, volunteerId: number) =>
    api(`/api/pickup-instances/${piId}/volunteers`, { method: 'POST', body: JSON.stringify({ volunteerId }) }),
  removePickupDriver: (piId: number, volunteerId: number) =>
    api(`/api/pickup-instances/${piId}/volunteers/${volunteerId}`, { method: 'DELETE' }),

  // Neighborhoods (Wesley Hills, Pomona, Monsey Center, …) + coverage report
  neighborhoods: () => api<{ data: Neighborhood[] }>('/api/neighborhoods'),
  coverage:      () => api<{ data: NeighborhoodCoverage[] }>('/api/neighborhoods/coverage'),
  createNeighborhood: (body: { name: string; sortOrder?: number }) =>
    api<{ data: Neighborhood }>('/api/neighborhoods', { method: 'POST', body: JSON.stringify(body) }),
  patchNeighborhood:  (id: number, body: Partial<Neighborhood>) =>
    api<{ data: Neighborhood }>(`/api/neighborhoods/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteNeighborhood: (id: number) => api(`/api/neighborhoods/${id}`, { method: 'DELETE' }),
};

export type Neighborhood = {
  id: number; name: string; slug: string; sortOrder: number;
  status: 'active' | 'archived'; createdAt?: string;
};
export type NeighborhoodCoverage = Neighborhood & {
  supplierCount: number; volunteerCount: number;
  coverage: 'none' | 'low' | 'ok' | 'healthy';
};

export type NotificationType = {
  id: number; name: string; description: string | null;
  defaultTitle: string; defaultBody: string;
  audienceType: 'all_drivers' | 'all_stores' | 'all_users' | 'specific_user';
  active: boolean; createdAt: string;
};

export const broadcast = {
  listTypes: () => api<{ data: NotificationType[] }>(`/api/admin/notification-types`),
  createType: (body: Omit<NotificationType, 'id' | 'active' | 'createdAt'> & { active?: boolean }) =>
    api(`/api/admin/notification-types`, { method: 'POST', body: JSON.stringify(body) }),
  updateType: (id: number, patch: Partial<Omit<NotificationType, 'id' | 'createdAt'>>) =>
    api(`/api/admin/notification-types/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteType: (id: number) => api(`/api/admin/notification-types/${id}`, { method: 'DELETE' }),
  send: (body: {
    notificationTypeId?: number | null;
    title: string; body: string;
    audienceType: 'all_drivers' | 'all_stores' | 'all_users' | 'specific_user';
    targetUserId?: number | null;
  }) => api<{ data: { sent: number; audience: string } }>(`/api/admin/broadcast`, { method: 'POST', body: JSON.stringify(body) }),
  pickupSms: (body: { pickupIds: number[]; volunteerIds: number[]; extraNote?: string | null }) =>
    api<{ data: { sent: number; failed: number; skipped: number; attempted: number; preview: string } }>(
      `/api/sms/pickup-broadcast`, { method: 'POST', body: JSON.stringify(body) }),
};

export const smsInbox = {
  list: () => api<{ data: Array<{ id: number; body: string; created_at: string; from_user_id: number; read_at: string | null; first_name: string; last_name: string; phone: string | null }> }>(
    '/api/admin/sms-inbox'),
};

// Kiosk device flag lives in localStorage. When set, App.tsx routes every
// visit on this device straight to /kiosk/<secret>. Cleared via the 5-tap
// escape gesture in KioskApp or the "Turn off kiosk mode" button in Settings.
const KIOSK_LS_KEY = 'zlz_kiosk_secret';
export const kioskDevice = {
  getSecret:   (): string | null => localStorage.getItem(KIOSK_LS_KEY),
  setSecret:   (secret: string) => localStorage.setItem(KIOSK_LS_KEY, secret),
  clear:       () => localStorage.removeItem(KIOSK_LS_KEY),
  fetchSecret: () => api<{ data: { secret: string | null } }>('/api/admin/kiosk-secret'),
};

export const admin = {
  pickups: (from: string, to: string) => api<{ data: AdminPickup[] }>(`/api/pickup-instances?from=${from}&to=${to}`),
  pickup:  async (id: number): Promise<AdminPickup | null> => {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10);
    const pastHorizon = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
    const r = await api<{ data: AdminPickup[] }>(`/api/pickup-instances?from=${pastHorizon}&to=${horizon}`);
    return r.data.find((p) => Number(p.id) === id) ?? null;
    void today;
  },
};

// ---------- supplier endpoints ----------

export type SupplierProfile = {
  id: number; name: string; contact_name: string | null; contact_phone: string | null;
  address_line1: string | null; city: string | null;
  pickup_instructions: string | null; typical_donation: string | null;
};
export type SupplierPickup = {
  pickup_instance_id: number; scheduled_date: string; scheduled_time: string;
  status: string; notes: string | null; volunteers: string | null;
};

export const supplier = {
  profile:  () => api<{ data: SupplierProfile }>('/api/me/supplier/profile'),
  pickups:  () => api<{ profile: any; data: SupplierPickup[] }>('/api/me/supplier-pickups'),
  notify:   (opts: { kind: 'ready' | 'left_behind' | 'additional'; time?: string; readyTill?: string; notes?: string }) =>
    api<{ data: { id: number } }>('/api/me/supplier/notify', { method: 'POST', body: JSON.stringify(opts) }),
  cancel:   (id: number) => api(`/api/me/supplier-pickups/${id}/cancel`, { method: 'POST' }),
};
