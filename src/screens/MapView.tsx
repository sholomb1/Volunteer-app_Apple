/**
 * Map screen.
 * Oct 11 client: a real map again. Pins sit at the store's STORED coordinates
 * (the API fills a store's coordinates once and saves them) — never random spots.
 * Open pickups = same list/rule as the Open tab; the driver's own pickups for
 * today get a green pin. Deliveries pin at the office (3 Regina Rd, Airmont),
 * never the family's house.
 * A plain list (sorted by time) stays under the map for people who prefer lists.
 * Oct 14 client: labels were long, overlapped and were cut off ("Wed 9:00 AM+14").
 * Now: short labels ("Now", "2 PM", "Wed"); pins close together on the screen
 * become one round bubble with the number of pickups; labels stay inside the
 * map; tapping a pin goes to its pickup in the list (a bubble zooms in first).
 * The list is the driver queue (pickups open 2 hours before their time).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { LocateFixed } from 'lucide-react';
import { volunteer, type OpenPickup, type MyPickup } from '../api';
import { AppBar, Skeleton, cx } from '../design';
import { fmtTime, nyToday, driverShowsNow } from '../time-format';
import { DriverCard, useTakePickup } from './driver-card';
import { LoadError } from './VolunteerHome';

// Oct 11 client: extra fields the driver API sends for the map.
type Pinnable = {
  lat?: number | string | null; lng?: number | string | null;
  text_code?: string | number | null;
  delivery_to_name?: string | null; delivery_to_city?: string | null;
};
type MapOpen = OpenPickup & Pinnable;
type MapMine = MyPickup & Pinnable;
type Item = { kind: 'open'; p: MapOpen } | { kind: 'mine'; p: MapMine };
type Place = { key: string; at: [number, number]; items: Item[] };

const MONSEY: [number, number] = [41.1112, -74.0685];
const FINISHED = new Set(['completed', 'delivered', 'cancelled', 'missed']);
// Pins whose labels would touch on the screen are drawn as one bubble.
const NEAR_X = 78, NEAR_Y = 42;

function coords(p: Pinnable): [number, number] | null {
  const lat = Number(p.lat), lng = Number(p.lng);
  if (p.lat == null || p.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
}
function sortKey(p: OpenPickup) { return `${String(p.scheduled_date).slice(0, 10)} ${p.scheduled_time ?? ''}`; }
const itemId = (it: Item) => `map-item-${it.kind}-${it.p.pickup_instance_id}`;
/** Oct 14 client: short pin label — "Now", "2 PM" / "2:30 PM" today, "Wed" another day. */
export function pinLabel(p: { scheduled_date?: string | null; scheduled_time?: string | null; status?: string | null }, today = nyToday()): string {
  if (driverShowsNow(p)) return 'Now'; // Oct 13 client: reposted / late → "Now"
  const key = String(p.scheduled_date ?? '').slice(0, 10);
  if (!key || key === today) return (fmtTime(p.scheduled_time ? String(p.scheduled_time).slice(0, 5) : '') || 'Today').replace(':00', '');
  return /^\d{4}-\d{2}-\d{2}$/.test(key)
    ? new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : 'Later';
}

/** Ask for the phone's location: Capacitor in the app, the browser on the web. */
async function getMyLocation(): Promise<[number, number]> {
  const native = (window as any).Capacitor?.isNativePlatform?.() === true;
  if (native) {
    let st = 'prompt';
    try { st = (await Geolocation.checkPermissions()).location; } catch { /* ignore */ }
    if (st !== 'granted') {
      try { st = (await Geolocation.requestPermissions({ permissions: ['location'] })).location; } catch { st = 'denied'; }
    }
    if (st !== 'granted') throw new Error('denied');
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
    return [pos.coords.latitude, pos.coords.longitude];
  }
  if (!('geolocation' in navigator)) throw new Error('unavailable');
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
    (err) => reject(new Error(err.code === 1 ? 'denied' : 'unavailable')),
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
  ));
}

export function MapView() {
  const nav = useNavigate();
  // fgh103 (Aug 17): live-poll + focus-refetch — see PickupsFeed for reason.
  const open = useQuery({ queryKey: ['open'], queryFn: volunteer.open, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 });
  const mine = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine, refetchOnWindowFocus: true, staleTime: 5_000 });
  const { take, busy } = useTakePickup();
  const [flash, setFlash] = useState<string[]>([]);

  // Everything on the screen, sorted by time: open pickups + my pickups today.
  const items: Item[] = useMemo(() => {
    const today = nyToday();
    const o: Item[] = ((open.data?.data ?? []) as MapOpen[]).map((p) => ({ kind: 'open', p }));
    const m: Item[] = ((mine.data?.data ?? []) as MapMine[])
      .filter((p) => String(p.scheduled_date).slice(0, 10) === today && !FINISHED.has(p.status)
        && !['declined', 'cancelled', 'completed'].includes(p.assignment_status))
      .map((p) => ({ kind: 'mine', p }));
    return [...o, ...m].sort((a, b) => (sortKey(a.p) < sortKey(b.p) ? -1 : sortKey(a.p) > sortKey(b.p) ? 1 : 0));
  }, [open.data, mine.data]);

  // One pin per place (many pickups can share a store).
  const places: Place[] = useMemo(() => {
    const byKey = new Map<string, Place>();
    for (const it of items) {
      const at = coords(it.p);
      if (!at) continue;
      const key = `${at[0].toFixed(5)},${at[1].toFixed(5)}`;
      (byKey.get(key) ?? byKey.set(key, { key, at, items: [] }).get(key)!).items.push(it);
    }
    return Array.from(byKey.values());
  }, [items]);
  const noPin = items.filter((it) => !coords(it.p));

  // ---- Leaflet map (same library, tiles and CSS as the office map) ----
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const [view, setView] = useState(0); // bumps on every pan / zoom → pins re-group
  const showMap = !(open.isError && !open.data);

  useEffect(() => {
    if (!showMap || !divRef.current || mapRef.current) return;
    const m = L.map(divRef.current, { zoomControl: false, attributionControl: true }).setView(MONSEY, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    pinLayer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    m.on('moveend zoomend resize', () => setView((v) => v + 1));
    mapRef.current = m;
    const t = setTimeout(() => { m.invalidateSize(); setView((v) => v + 1); }, 150);
    return () => { clearTimeout(t); m.remove(); mapRef.current = null; pinLayer.current = null; meLayer.current = null; fitted.current = false; };
  }, [showMap]);

  /** Scroll the list to these pickups and light them up for a moment. */
  function showInList(list: Item[]) {
    const ids = list.map(itemId);
    setFlash(ids);
    window.setTimeout(() => setFlash((f) => (f === ids ? [] : f)), 2600);
    window.setTimeout(() => document.getElementById(ids[0]!)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
  }

  useEffect(() => {
    const m = mapRef.current, lyr = pinLayer.current;
    if (!m || !lyr) return;
    // Default view: fit all pins once; with none, stay on Monsey.
    if (!fitted.current && open.data && places.length > 0) {
      fitted.current = true;
      if (places.length === 1) m.setView(places[0]!.at, 15, { animate: false });
      else m.fitBounds(L.latLngBounds(places.map((p) => p.at)), { padding: [56, 56], maxZoom: 15, animate: false });
    }
    lyr.clearLayers();
    const size = m.getSize();
    // Group places that would overlap on the screen (greedy, earliest pickups first).
    const groups: Array<{ pt: L.Point; places: Place[] }> = [];
    for (const pl of places) {
      const pt = m.latLngToContainerPoint(pl.at);
      const g = groups.find((x) => Math.abs(x.pt.x - pt.x) < NEAR_X && Math.abs(x.pt.y - pt.y) < NEAR_Y);
      if (g) g.places.push(pl); else groups.push({ pt, places: [pl] });
    }
    for (const g of groups) {
      const all = g.places.flatMap((pl) => pl.items);
      const isMine = all.some((i) => i.kind === 'mine');
      const color = isMine ? 'rgb(var(--c-forest))' : 'rgb(var(--c-clay))';
      // Anchor: the first place of the group (where the pointer points).
      const at = g.places[0]!.at;
      const pt = m.latLngToContainerPoint(at);
      if (pt.x < -20 || pt.y < -20 || pt.x > size.x + 20 || pt.y > size.y + 20) continue; // off screen
      let html: string;
      if (all.length > 1) {
        // Bubble with the number of pickups here (44px tap target).
        const n = all.length;
        const d = 40;
        const dx = Math.max(4 - pt.x, Math.min(size.x - 4 - pt.x - d, -d / 2));
        const dy = Math.max(4 - pt.y, Math.min(size.y - 4 - pt.y - d, -d / 2));
        html = `<div data-map-pin="cluster" style="position:absolute;left:0;top:0;transform:translate(${dx}px,${dy}px);width:${d}px;height:${d}px;border-radius:50%;
          background:${color};color:#fff;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;
          font:800 16px/1 system-ui,sans-serif;cursor:pointer">${n}</div>`;
      } else {
        const label = pinLabel(all[0]!.p);
        const w = Math.round(22 + label.length * 9);
        const h = 34, tip = 8;
        // Keep the whole label inside the map; the little pointer still points at the place.
        const dx = Math.max(4 - pt.x, Math.min(size.x - 4 - pt.x - w, -w / 2));
        const below = pt.y - h - tip < 4;
        const dy = below ? tip : -(h + tip);
        const tipLeft = Math.max(8, Math.min(w - 8, -dx));
        const tipCss = below
          ? `top:${-tip}px;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:${tip + 1}px solid ${color}`
          : `bottom:${-tip}px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:${tip + 1}px solid ${color}`;
        html = `<div data-map-pin="one" style="position:absolute;left:0;top:0;transform:translate(${dx}px,${dy}px);width:${w}px;height:${h}px;
          background:${color};color:#fff;border:2px solid #fff;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center;font:700 14px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer">${label}
          <span style="position:absolute;left:${tipLeft - 7}px;width:0;height:0;${tipCss}"></span></div>`;
      }
      L.marker(at, { icon: L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: isMine ? 500 : 0, keyboard: false })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e as any);
          // Several places in a bubble → zoom in to split them; otherwise go to the list.
          if (g.places.length > 1 && m.getZoom() < 17) {
            m.fitBounds(L.latLngBounds(g.places.map((p) => p.at)), { padding: [64, 64], maxZoom: 17 });
          } else {
            showInList(all);
          }
        })
        .addTo(lyr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, open.data, view]);

  // ---- Show my location ----
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  async function showMe() {
    setLocating(true); setLocMsg(null);
    try {
      const at = await getMyLocation();
      const m = mapRef.current, lyr = meLayer.current;
      if (m && lyr) {
        lyr.clearLayers();
        L.circleMarker(at, { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(lyr);
        m.setView(at, Math.max(m.getZoom(), 14));
      }
    } catch (e: any) {
      setLocMsg(e?.message === 'denied'
        ? "Location is turned off for this app. To use it, allow location in your phone's settings."
        : "Couldn't find your location. Please try again outside or in a minute.");
      mapRef.current?.setView(MONSEY, 13);
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <AppBar title="Map" />
      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        {!showMap ? (
          <div className="px-5"><LoadError onRetry={() => open.refetch()} busy={open.isFetching} /></div>
        ) : (
          <>
            {/* relative + z-0 keeps Leaflet's layers under the app's menus and dialogs. */}
            <div className="relative z-0 mx-3 rounded-[16px] overflow-hidden border border-line h-[58vh] min-h-[300px] max-h-[560px]">
              <div ref={divRef} className="absolute inset-0" />
              {open.isLoading && (
                <div className="absolute inset-0 z-[1000] grid place-items-center bg-paper/70 text-[15px] font-bold text-ink">Loading map…</div>
              )}
              {open.data && items.length === 0 && (
                <div className="absolute top-3 left-3 right-16 z-[1000] rounded-[12px] bg-paper/95 border border-line px-3 py-2 text-[15px] font-bold text-ink shadow-soft">
                  No open pickups right now.
                </div>
              )}
              <button onClick={() => void showMe()} disabled={locating}
                      className="haptic absolute left-3 bottom-3 z-[1000] min-h-[48px] px-4 rounded-[12px] bg-paper border border-line shadow-soft text-forest font-bold text-[15px] flex items-center gap-2 disabled:opacity-60">
                <LocateFixed size={18} /> {locating ? 'Finding you…' : 'Show my location'}
              </button>
            </div>

            <div className="px-5">
              {locMsg && (
                <div className="mt-3 rounded-[12px] border border-line bg-paper px-3 py-2.5 text-[15px] text-ink">{locMsg}</div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-ink/80">
                <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-full bg-clay" /> Open — needs a driver</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-full bg-forest" /> Yours today</span>
                <span className="flex items-center gap-1.5"><span className="inline-grid h-4 w-4 place-items-center rounded-full bg-clay text-paper text-[10px] font-extrabold">2</span> Pickups close together</span>
              </div>
              <div className="mt-1 text-[14px] text-muted">Tap a pin to see the pickup below.</div>
              {open.isError && open.data && (
                <div className="mt-2 text-[14px] text-clay font-bold">Can't connect — showing the last list we got.</div>
              )}

              <div className="text-[14px] font-extrabold uppercase tracking-[.05em] text-muted mt-5 mb-2">
                List{open.data ? ` (${items.length})` : ''}
              </div>
              {open.isLoading ? (
                <div className="space-y-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
              ) : items.length === 0 ? (
                <div className="text-center py-6 text-muted text-[15px]">No open pickups right now.</div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((it) => (
                    <div key={itemId(it)} id={itemId(it)}
                         className={cx('rounded-[18px] transition-shadow duration-300', flash.includes(itemId(it)) && 'ring-4 ring-amber shadow-lift')}>
                      {!coords(it.p) && <div className="text-[13px] font-bold text-muted mb-1">Not on the map yet</div>}
                      <DriverCard p={it.p} mine={it.kind === 'mine'} busy={busy}
                                  onOpen={() => nav(`/pickup/${it.kind === 'mine' ? 'mine' : 'open'}/${it.p.pickup_instance_id}`)}
                                  onTake={it.kind === 'open' ? () => void take(it.p) : undefined} />
                    </div>
                  ))}
                </div>
              )}
              {noPin.length > 0 && items.length > 0 && (
                <div className="mt-3 text-[14px] text-muted">{noPin.length} {noPin.length === 1 ? 'pickup has' : 'pickups have'} no map spot yet — they are in the list above.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
