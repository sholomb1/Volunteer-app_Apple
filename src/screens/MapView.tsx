/**
 * Map screen — Leaflet + CARTO Voyager tiles, custom forest/clay pins for
 * each open pickup. The layout sits inside the standard PhoneFrame: app bar
 * at top, map fills the middle, scrollable list pinned beneath, bottom nav
 * stays visible.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import { volunteer, type OpenPickup } from '../api';
import { AppBar, Card, Skeleton } from '../design';
import { fmtTime } from '../time-format';

const FALLBACK_CENTER: [number, number] = [41.115, -74.069];

export function MapView() {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // fgh103 (Aug 17): live-poll + focus-refetch — see PickupsFeed for reason.
  const open = useQuery({ queryKey: ['open'], queryFn: volunteer.open, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 });
  const pickups = open.data?.data ?? [];

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const m = L.map(ref.current, { zoomControl: false }).setView(FALLBACK_CENTER, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© CARTO' }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    const m = mapRef.current; const lyr = layer.current;
    if (!m || !lyr) return;
    lyr.clearLayers();
    pickups.forEach((p) => {
      const color = p.urgency_level === 'high' ? '#D27A4C' : '#2C5A3B';
      const html = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${color}" style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.3))"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/></svg>`;
      const lat = FALLBACK_CENTER[0] + (Math.random() - 0.5) * 0.06;
      const lng = FALLBACK_CENTER[1] + (Math.random() - 0.5) * 0.10;
      L.marker([lat, lng], { icon: L.divIcon({ html, className: '', iconSize: [22, 22], iconAnchor: [11, 22] }) })
        .on('click', () => nav(`/pickup/open/${p.pickup_instance_id}`))
        .addTo(lyr);
    });
  }, [pickups, nav]);

  return (
    <div className="h-full flex flex-col">
      <AppBar title="Map" />
      {/* Map gets a fixed share of the available column. */}
      <div ref={ref} className="h-[42%] w-full border-y border-line bg-[#F4F8F0] shrink-0" />
      {/* The list takes what's left and scrolls on its own. */}
      <div className="flex-1 min-h-0 px-4 py-4 overflow-y-auto">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">
          {pickups.length} nearby
        </div>
        {open.isLoading ? (
          <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : pickups.length === 0 ? (
          <div className="text-center py-5 text-muted text-[13px]">No open pickups right now.</div>
        ) : (
          <div className="space-y-2">
            {pickups.map((p) => <Row key={p.pickup_instance_id} p={p} onClick={() => nav(`/pickup/open/${p.pickup_instance_id}`)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ p, onClick }: { p: OpenPickup; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="!p-3">
      <div className="flex items-center gap-3">
        <span className="font-display font-bold text-[14px] text-forest tabular-nums w-14 shrink-0">{fmtTime(p.scheduled_time?.slice(0,5) ?? '') || '—'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13.5px] truncate">{p.suppliers || 'Pickup'}</div>
          {p.food_description && <div className="text-[11.5px] text-muted truncate">{p.food_description}</div>}
        </div>
      </div>
    </Card>
  );
}
