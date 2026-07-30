/**
 * Kiosk API client. The kiosk is unauthenticated — access is gated by a
 * shared secret embedded in the URL (matches the backend /kiosk/:secret/*
 * routes). No JWT header. All calls go through here so nothing in the
 * regular authed api.ts leaks into the kiosk flow.
 */
import { API_BASE } from '../api';

async function ksh<T>(secret: string, path: string, init: RequestInit = {}): Promise<T> {
  const url = API_BASE.replace(/\/$/, '') + `/api/kiosk/${encodeURIComponent(secret)}${path}`;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const r = await fetch(url, { ...init, headers });
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

export type KioskSigninResp = {
  data:
    | { needsDriverPick: true; adminName: string; drivers: Array<{ volunteerId: number; name: string; pendingPickups: number }> }
    | { needsVolunteerPick: true; code: string; candidates: Array<{ volunteerId: number; name: string }> }
    | { needsVendorPick: true; dropoffId: number; volunteerId: number; volunteerName: string; greeting: string; allSuppliers: Array<{ supplierId: number; supplierName: string; city: string }> }
    | { dropoffId: number; volunteerId: number; volunteerName: string; stores: KioskStore[]; needsDriverPick?: false; needsVolunteerPick?: false; needsVendorPick?: false };
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

  // Auto-create a supplier from a manually-typed name + address.
  manualVendor: (secret: string, body: { name: string; address?: string; city?: string }) =>
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
};
