/**
 * Oct 30 client: the round label, drawn in HTML.
 *   LabelPage    — one 3-inch print page (browser print fallback, `.print-only`). New-kiosk labels
 *                  (a kind + container) get the round kind layout; others keep the older layout.
 *   LabelPreview — the on-screen preview on the new kiosk's "Labels: N will print" screen.
 * Black on white always (it is a sticker), whatever the app theme.
 */
import type { KioskLabel } from './kiosk-api';
import { kioskLabelFace } from './label-print';

export function LabelPage({ label }: { label: KioskLabel }) {
  const f = kioskLabelFace(label);
  if (!f.isKind) {
    // Each label is a full page (3-inch square) with a 3-inch circle centered.
    // Round-die thermal labels: printer only sees the paper as square; the die
    // hides everything outside the circle. Content clips inside the circle.
    return (
      <div className="label-page">
        <div className="label-circle">
          <div className="label-store">{label.supplierName}</div>
          <div className="label-date">{label.date}</div>
          <div className="label-idx">{label.index} of {label.total}</div>
          <div className="label-desc">{label.description}</div>
          <div className="label-meta">{label.category} · {label.unit}</div>
        </div>
      </div>
    );
  }
  const rule: React.CSSProperties = { width: '1.6in', height: '2pt', background: '#000', margin: '5pt 0' };
  return (
    <div className="label-page">
      <div className="label-circle" style={{ color: '#000' }}>
        {f.store.map((s, i) => <div key={i} style={{ fontSize: '13pt', fontWeight: 800, lineHeight: 1.1 }}>{s}</div>)}
        <div style={{ fontSize: '10pt', fontWeight: 600, marginTop: '2pt' }}>{f.date}</div>
        <div style={rule} />
        <div style={{ fontSize: f.kind.length > 8 ? '24pt' : '28pt', fontWeight: 900, letterSpacing: '.02em', lineHeight: 1 }}>{f.kind}</div>
        {f.container && <div style={{ fontSize: '15pt', fontWeight: 800, letterSpacing: '.14em', marginTop: '3pt' }}>{f.container}</div>}
        <div style={rule} />
        <div style={{ fontSize: '14pt', fontWeight: 900 }}>{f.count}</div>
      </div>
    </div>
  );
}

/** On-screen round preview. `size` in px of the design stage (portrait 470, landscape 330). */
export function LabelPreview({ label, size }: { label: Pick<KioskLabel, 'supplierName' | 'date' | 'category' | 'unit' | 'index' | 'total'>; size: number }) {
  const f = kioskLabelFace(label);
  const k = size / 470;
  const px = (n: number) => `${Math.round(n * k)}px`;
  const rule: React.CSSProperties = { width: '62%', height: px(3), background: '#111', margin: `${px(16)} 0` };
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#fff', border: `${Math.max(3, Math.round(4 * k))}px solid #111`, color: '#111',
                  boxShadow: '6px 8px 0 rgba(28,42,33,.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}
         aria-label="Label preview">
      {f.store.map((s, i) => <div key={i} style={{ fontSize: px(f.store.length > 1 ? 24 : 28), fontWeight: 800, lineHeight: 1.1 }}>{s}</div>)}
      <div style={{ fontSize: px(22), fontWeight: 600, marginTop: px(2) }}>{f.date}</div>
      <div style={rule} />
      <div style={{ fontSize: px(f.kind.length > 8 ? 56 : 66), fontWeight: 900, letterSpacing: '.03em', lineHeight: 1 }}>{f.kind}</div>
      {f.container && <div style={{ fontSize: px(38), fontWeight: 800, letterSpacing: '.14em', marginTop: px(6) }}>{f.container}</div>}
      <div style={rule} />
      <div style={{ fontSize: px(30), fontWeight: 900 }}>{f.count}</div>
    </div>
  );
}
