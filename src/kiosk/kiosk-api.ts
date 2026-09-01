/**
 * Kiosk API client. The kiosk is unauthenticated — access is gated by a
 * shared secret embedded in the URL (matches the backend /kiosk/:secret/*
 * routes). No JWT header. All calls go through here so nothing in the
 * regular authed api.ts leaks into the kiosk flow.
 */
import { API_BASE, maybeForcePortalReload } from '../api';

async function ksh<T>(secret: string, path: string, init: RequestInit = {}): Promise<T> {
  const url = API_BASE.replace(/\/$/, '') + `/api/kiosk/${encodeURIComponent(secret)}${path}`;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const r = await fetch(url, { ...init, headers });
  // Honor the portal-wide reload epoch so a stale kiosk bundle self-heals
  // on its next API call instead of shipping day-old print code forever.
  maybeForcePortalReload(r.headers.get('X-Portal-Reload-Since'));
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leave null */ }
  if (!r.ok) {
    const err = new Error(json?.message || json?.error || `HTTP ${r.status}`) as any;
    err.status = r.status;
    err.body = json;
    throw err;
  }
  return json as T;
}

export type KioskStore = {
  supplierId: number;
  supplierName: string;
  pickupIds: number[];
  scheduledDate: string;
};

// C5 Aug 13 — recently-completed pickups the driver can reprint labels for.
export type KioskRecentCompleted = {
  pickupId: number;
  refNumber: string | null;
  supplierId: number;
  supplierName: string;
  scheduledDate: string;
  completedAt: string | null;
  labelsPrinted: boolean;
};

// Aug 26 client rule: when a driver has multiple accepted pickups still in
// their queue (accepted within the last 12 hours), the kiosk shows a picker
// so they can select one, some, or none of them before proceeding. Each
// option is a supplier plus the pickup ids at that supplier.
export type KioskPickupOption = {
  supplierId: number;
  supplierName: string;
  pickupIds: number[];
  scheduledDate: string;
  scheduledTime: string | null;
};

export type KioskSigninResp = {
  data:
    | { needsDriverPick: true; adminName: string; drivers: Array<{ volunteerId: number; name: string; pendingPickups: number }> }
    | { needsVolunteerPick: true; code: string; candidates: Array<{ volunteerId: number; name: string }> }
    | { needsPickupSelection: true; volunteerId: number; volunteerName: string; greeting: string; options: KioskPickupOption[]; allSuppliers: Array<{ supplierId: number; supplierName: string; city: string }> }
    | { needsVendorPick: true; dropoffId: number; volunteerId: number; volunteerName: string; greeting: string; allSuppliers: Array<{ supplierId: number; supplierName: string; city: string }> }
    // Aug 19 client bug 1: assigned-driver signin now also returns allSuppliers
    // so the kiosk's Stores screen can offer a "Choose a different store" option.
    | { dropoffId: number; volunteerId: number; volunteerName: string; stores: KioskStore[]; recentCompleted?: KioskRecentCompleted[]; allSuppliers?: Array<{ supplierId: number; supplierName: string; city: string }>; needsDriverPick?: false; needsVolunteerPick?: false; needsVendorPick?: false; needsPickupSelection?: false };
};

export type KioskLine = {
  id: number;
  dropoffId: number;
  supplierId: number;
  pickupInstanceId: number | null;
  category: string;
  description: string;   // may be empty when the driver skipped it
  quantity: number;
  unit: string;
};

export type KioskLabel = {
  supplierName: string;
  date: string;
  description: string;
  category: string;
  unit: string;
  index: number;
  total: number;
};

export const kiosk = {
  signin: (secret: string, body: {
    code?: string;
    resolveVolunteerId?: number;
    username?: string;
    password?: string;
    simulateAsVolunteerId?: number;
    guestName?: string;
    guestPhone?: string;
  }) => ksh<KioskSigninResp>(secret, '/signin', { method: 'POST', body: JSON.stringify(body) }),

  // Aug 26 client rule: resolve the pickup-selection screen. `pickupIds`
  // is the subset the driver ticked; `skipAll` sends them to the walk-in
  // vendor picker instead. Server responds with the same shape as signin.
  resolvePickups: (secret: string, body: {
    volunteerId: number;
    pickupIds: number[];
    skipAll?: boolean;
  }) => ksh<KioskSigninResp>(secret, '/signin/resolve-pickups', { method: 'POST', body: JSON.stringify(body) }),

  // Auto-create a supplier from a manually-typed name + address.
  manualVendor: (secret: string, body: {
    name: string; address?: string; city?: string;
    hashgacha?: string; catering_company?: string;
  }) =>
    ksh<{ data: { supplierId: number; supplierName: string; city: string } }>(
      secret, '/manual-vendor', { method: 'POST', body: JSON.stringify(body) }),

  addLine: (secret: string, body: {
    dropoffId: number; supplierId: number; pickupInstanceId?: number | null;
    category: string; description: string | null; quantity: number; unit: string;
  }) => ksh<{ data: KioskLine }>(secret, '/lines', { method: 'POST', body: JSON.stringify(body) }),

  patchLine: (secret: string, id: number, patch: Partial<Pick<KioskLine, 'category' | 'description' | 'quantity' | 'unit'>>) =>
    ksh<{ data: KioskLine }>(secret, `/lines/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteLine: (secret: string, id: number) =>
    ksh<{ data: { id: number; deleted: true } }>(secret, `/lines/${id}`, { method: 'DELETE' }),

  complete: (secret: string, dropoffId: number, notes: string | null, timeIssues: string | null) =>
    ksh<{ data: { dropoffId: number; labels: KioskLabel[] } }>(
      secret,
      `/dropoff/${dropoffId}/complete`,
      { method: 'POST', body: JSON.stringify({ notes, timeIssues }) },
    ),

  read: (secret: string, dropoffId: number) =>
    ksh<{ data: { dropoff: any; lines: KioskLine[] } }>(secret, `/dropoff/${dropoffId}`),

  // Send pre-rendered TSPL to the printer via vp-api → Tailscale relay
  // bridge → TSC printer on the LAN. Works from any device with internet.
  printTspl: (secret: string, tsplBase64: string) =>
    ksh<{ data: { ok: boolean; sent?: number } }>(secret, '/print-tspl', {
      method: 'POST',
      body: JSON.stringify({ tspl: tsplBase64 }),
    }),

  // Aug 13 client redesign: single admin entry point via the Help popup.
  // Kiosk POSTs the entered PIN; server compares to portal_settings.kiosk_admin_pin.
  verifyAdminPin: (secret: string, pin: string) =>
    ksh<{ data: { ok: true } }>(secret, '/verify-admin-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
};
