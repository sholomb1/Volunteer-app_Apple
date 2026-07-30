/**
 * Standalone driver drop-off + label-printing module.
 *
 * Mounted at /dropoff/* — login-required but doesn't share the volunteer app
 * shell (no bottom nav, no other screens). The driver authenticates, fills
 * the drop-off form, and prints 3" round labels — one per item, expanded by
 * quantity. After printing the page returns to "start over".
 */
import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, getUser, setAuth, login as apiLogin, type AuthUser } from '../api';
import { Printer, Plus, Trash2, Check } from 'lucide-react';

const FALLBACK_CATS = ['Dairy', 'Deli', 'Bakery', 'Produce', 'Prepared', 'Dry goods', 'Other'];
const CONTAINER_OPTIONS = ['Boxes', 'Trays', 'Bags', 'Crates', 'Other'];

export function DropoffStandalone() {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());

  // Drivers + office staff can use this module. Suppliers shouldn't.
  if (!user) return <DropoffLogin onAuthed={setUser} />;
  if (user.role === 'supplier') {
    return (
      <Centered>
        <Card>
          <h1 className="text-[20px] font-bold">Not available</h1>
          <p className="text-[14px] text-muted mt-2">This sign-in page is for drivers. Stores don't drop off — log into the supplier app instead.</p>
          <button onClick={() => { setAuth(null, null); setUser(null); }}
                  className="haptic mt-4 bg-forest text-paper px-4 py-2 rounded-[10px] font-bold text-[14px]">Sign out</button>
        </Card>
      </Centered>
    );
  }

  return (
    <Routes>
      <Route path="/"               element={<DropoffForm user={user} onSignOut={() => { setAuth(null, null); setUser(null); }} />} />
      <Route path="/labels/:signinId" element={<LabelPreview />} />
      <Route path="*"               element={<Navigate to="/dropoff" replace />} />
    </Routes>
  );
}

// =============================================================================
//   Login screen — slimmed-down version of Login.tsx, tailored to /dropoff
// =============================================================================
function DropoffLogin({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { onAuthed(await apiLogin(username, password)); }
    catch (e: any) { setErr(e?.message ?? 'Sign-in failed'); }
    finally { setBusy(false); }
  }

  return (
    <Centered>
      <Card>
        <div className="text-center mb-4">
          <h1 className="font-display font-semibold text-[24px]">Drop-off sign-in</h1>
          <p className="text-[14px] text-muted mt-1">Sign in to record what you brought.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-[12.5px] font-bold text-muted">Phone or email</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required
                   className="w-full mt-1 rounded-[12px] border border-line bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-forest" />
          </label>
          <label className="block">
            <span className="text-[12.5px] font-bold text-muted">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                   className="w-full mt-1 rounded-[12px] border border-line bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-forest" />
          </label>
          {err && <p className="text-clay text-[13px] font-bold">{err}</p>}
          <button type="submit" disabled={busy}
                  className="w-full haptic bg-forest text-paper rounded-[12px] py-3 font-bold text-[15px] disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </Card>
    </Centered>
  );
}

// =============================================================================
//   Sign-in form — supplier picker + line items + submit
// =============================================================================
type Item = {
  supplierId: number | '';
  category:   string;
  categoryId: number | null;
  quantity:   number;
  container:  string;
  description: string;
};

function emptyItem(): Item {
  return { supplierId: '', category: '', categoryId: null, quantity: 1, container: 'Boxes', description: '' };
}

function DropoffForm({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const nav = useNavigate();

  const suppliers = useQuery<{ data: Array<{ id: number; name: string }> }>({
    queryKey: ['dropoff-suppliers'],
    queryFn:  () => api('/api/dropoff/suppliers'),
  });
  const categories = useQuery<{ data: Array<{ id: number; name: string }>; fallback?: boolean }>({
    queryKey: ['dropoff-categories'],
    queryFn:  () => api('/api/dropoff/categories'),
  });

  const [supplierIds, setSupplierIds] = useState<number[]>([]);
  const [items, setItems]             = useState<Item[]>([emptyItem()]);
  const [notes, setNotes]             = useState('');

  // Convenience: when there's only one supplier picked, default new item rows
  // to that supplier so the driver doesn't have to pick it on every line.
  const defaultSupplierId = supplierIds.length === 1 ? supplierIds[0]! : '';

  const submit = useMutation({
    mutationFn: () => api<{ data: { id: number } }>('/api/dropoff/signin', {
      method: 'POST',
      body: JSON.stringify({
        supplierIds,
        items: items.map((it) => ({
          supplierId:  Number(it.supplierId || defaultSupplierId),
          category:    it.category,
          categoryId:  it.categoryId,
          quantity:    it.quantity,
          container:   it.container || null,
          description: it.description || null,
        })),
        notes: notes || null,
      }),
    }),
    onSuccess: (res) => nav(`/dropoff/labels/${res.data.id}`),
  });

  const totalLabels = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const canSubmit = supplierIds.length > 0
                 && items.length > 0
                 && items.every((it) => (it.supplierId || defaultSupplierId) && it.category && it.quantity > 0);

  return (
    <Centered wide>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display font-semibold text-[22px]">Welcome, {user.firstName}</h1>
            <p className="text-[13px] text-muted">Tell us what you brought in.</p>
          </div>
          <button onClick={onSignOut} className="text-[12px] font-bold text-muted underline-offset-2 hover:underline">Sign out</button>
        </div>

        {/* Supplier(s) you're delivering from */}
        <section className="mt-2">
          <SectionHeader>1. Where did the food come from?</SectionHeader>
          {suppliers.isLoading ? <p className="text-muted text-[13px]">Loading stores…</p> :
            <div className="flex flex-wrap gap-2">
              {(suppliers.data?.data ?? []).map((s) => {
                const on = supplierIds.includes(s.id);
                return (
                  <button key={s.id} onClick={() => setSupplierIds(on ? supplierIds.filter((id) => id !== s.id) : [...supplierIds, s.id])}
                          className={`px-3 py-1.5 rounded-full text-[13px] font-bold border ${on ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line'}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>}
        </section>

        {/* Line items */}
        <section className="mt-6">
          <SectionHeader>2. What did you bring?</SectionHeader>
          {categories.data?.fallback && (
            <p className="text-[12px] text-muted mb-2">Showing default categories (couldn't reach InvenTree).</p>
          )}
          <div className="space-y-3">
            {items.map((it, i) => (
              <ItemRow key={i} it={it}
                       suppliers={suppliers.data?.data ?? []}
                       defaultSupplierId={defaultSupplierId}
                       categories={categories.data?.data ?? FALLBACK_CATS.map((n, k) => ({ id: -(k + 1), name: n }))}
                       onChange={(next) => setItems(items.map((x, j) => j === i ? next : x))}
                       onRemove={items.length > 1 ? () => setItems(items.filter((_, j) => j !== i)) : null}
                       restrictTo={supplierIds} />
            ))}
          </div>
          <button onClick={() => setItems([...items, emptyItem()])}
                  className="mt-3 flex items-center gap-1.5 text-[13.5px] font-bold text-forest border border-forest/30 bg-sage px-3 py-2 rounded-[10px] haptic">
            <Plus size={14} /> Add another item
          </button>
        </section>

        {/* Notes */}
        <section className="mt-6">
          <SectionHeader>3. Notes for the office (optional)</SectionHeader>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="Anything we should know — refrigeration, special handling, broken seal, etc."
                    className="w-full rounded-[12px] border border-line bg-paper px-3 py-2 text-[14px] outline-none focus:border-forest resize-none" />
        </section>

        {/* Submit */}
        <div className="mt-6 flex items-center justify-between bg-cream/60 rounded-[14px] p-3">
          <div>
            <div className="font-bold text-[15px]">Ready to sign in</div>
            <div className="text-[12.5px] text-muted">{totalLabels} label{totalLabels === 1 ? '' : 's'} will print after you submit.</div>
          </div>
          <button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending}
                  className="haptic bg-forest text-paper px-5 py-3 rounded-[12px] font-bold text-[15px] disabled:opacity-40 flex items-center gap-2">
            <Check size={16} /> {submit.isPending ? 'Signing in…' : 'Sign in & print labels'}
          </button>
        </div>
        {submit.error && <p className="mt-2 text-clay text-[13px] font-bold">{(submit.error as Error).message}</p>}
      </Card>
    </Centered>
  );
}

function ItemRow({ it, suppliers, defaultSupplierId, categories, onChange, onRemove, restrictTo }: {
  it: Item;
  suppliers: Array<{ id: number; name: string }>;
  defaultSupplierId: number | '';
  categories: Array<{ id: number; name: string }>;
  onChange: (next: Item) => void;
  onRemove: (() => void) | null;
  restrictTo: number[];
}) {
  const eligibleSuppliers = restrictTo.length > 0 ? suppliers.filter((s) => restrictTo.includes(s.id)) : suppliers;
  const showSupplierPicker = restrictTo.length !== 1;
  return (
    <div className="border border-line bg-paper rounded-[14px] p-3 space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {showSupplierPicker && (
          <label className="block col-span-2 md:col-span-2">
            <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-muted">Store</span>
            <select value={it.supplierId} onChange={(e) => onChange({ ...it, supplierId: e.target.value ? Number(e.target.value) : '' })}
                    className="w-full mt-1 rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[14px]">
              <option value="">{defaultSupplierId ? 'Use default' : '— Pick one above first —'}</option>
              {eligibleSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-muted">Category</span>
          <select value={it.category} onChange={(e) => {
                    const cat = categories.find((c) => c.name === e.target.value);
                    onChange({ ...it, category: e.target.value, categoryId: cat?.id ?? null });
                  }}
                  className="w-full mt-1 rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[14px]">
            <option value="">— Pick category —</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-muted">Quantity</span>
          <input type="number" min={1} max={500} value={it.quantity}
                 onChange={(e) => onChange({ ...it, quantity: Math.max(1, Number(e.target.value) || 1) })}
                 className="w-full mt-1 rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[14px]" />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-muted">Container</span>
          <select value={it.container} onChange={(e) => onChange({ ...it, container: e.target.value })}
                  className="w-full mt-1 rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[14px]">
            {CONTAINER_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block col-span-1 md:col-span-2">
          <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-muted">Description (optional)</span>
          <input value={it.description} onChange={(e) => onChange({ ...it, description: e.target.value })}
                 placeholder='e.g. "rotisserie chicken, fully cooked"'
                 className="w-full mt-1 rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[14px]" />
        </label>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="flex items-center gap-1 text-[12.5px] font-bold text-clay">
          <Trash2 size={12} /> Remove this item
        </button>
      )}
    </div>
  );
}

// =============================================================================
//   Label print preview — 3" round, one per page
// =============================================================================
function LabelPreview() {
  const { signinId } = useParams<{ signinId: string }>();
  const nav = useNavigate();
  const q = useQuery<{ data: { signin: any; labels: Array<{ supplierName: string; category: string; description: string | null; container: string | null; date: string; index: number; of: number }> } }>({
    queryKey: ['dropoff-labels', signinId],
    queryFn:  () => api(`/api/dropoff/signin/${signinId}/labels`),
  });

  const labels = q.data?.data?.labels ?? [];

  const print = () => {
    window.print();
    void api(`/api/dropoff/signin/${signinId}/printed`, { method: 'POST' }).catch(() => {});
  };

  useEffect(() => {
    // Auto-open the print dialog on first paint (drivers don't have to hunt for the button).
    if (labels.length) {
      const t = setTimeout(print, 400);
      return () => clearTimeout(t);
    }
  }, [labels.length]);

  if (q.isLoading) return <Centered><p className="text-muted">Loading labels…</p></Centered>;
  if (!labels.length) return <Centered><p className="text-muted">No items to print.</p></Centered>;

  return (
    <>
      {/* Screen-only controls — hidden when printing. */}
      <div className="print:hidden bg-cream min-h-screen p-4">
        <div className="max-w-[600px] mx-auto bg-paper border border-line rounded-[16px] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-display font-semibold text-[20px]">{labels.length} label{labels.length === 1 ? '' : 's'} ready</div>
              <div className="text-[13px] text-muted">3" round — load the label roll or sheet and print.</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => nav('/dropoff')} className="haptic text-[13px] font-bold border border-line bg-paper px-3 py-2 rounded-[10px]">Done</button>
              <button onClick={print} className="haptic bg-forest text-paper px-4 py-2 rounded-[10px] font-bold text-[14px] flex items-center gap-1.5">
                <Printer size={14} /> Print
              </button>
            </div>
          </div>
          <p className="text-[13px] text-muted">If the print preview didn't open automatically, click <strong>Print</strong>. In the browser's print dialog, set paper size to <strong>3" × 3"</strong> (or your label printer's roll) and margins to <strong>None</strong>.</p>
        </div>
      </div>

      {/* Print-only label sheet — each label is its own 3in × 3in page. */}
      <div className="print:block hidden">
        {labels.map((L, i) => <LabelTile key={i} L={L} />)}
      </div>

      {/* Print-only CSS — owns the page geometry for label-roll printers. */}
      <style>{`
        @media print {
          @page { size: 3in 3in; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .label-tile { width: 3in; height: 3in; page-break-after: always; }
          .label-tile:last-child { page-break-after: auto; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
        .label-tile {
          width: 3in; height: 3in;
          display: flex; align-items: center; justify-content: center;
          padding: 0.3in;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1c1e22;
        }
        .label-inner {
          width: 100%; height: 100%;
          border: 2px solid #1c1e22;
          border-radius: 50%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 0.18in;
          box-sizing: border-box;
          text-align: center;
          gap: 4px;
        }
        .label-supplier { font-size: 18px; font-weight: 800; line-height: 1.05; }
        .label-category { font-size: 26px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; color: #2C5A3B; }
        .label-desc     { font-size: 12px; line-height: 1.15; }
        .label-date     { font-size: 11px; font-weight: 700; color: #555; }
        .label-count    { font-size: 10px; color: #888; }
      `}</style>
    </>
  );
}

function LabelTile({ L }: { L: { supplierName: string; category: string; description: string | null; container: string | null; date: string; index: number; of: number } }) {
  const date = new Date(L.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="label-tile">
      <div className="label-inner">
        <div className="label-supplier">{L.supplierName}</div>
        <div className="label-category">{L.category}</div>
        {L.description && <div className="label-desc">{L.description}</div>}
        <div className="label-date">{date}</div>
        {L.of > 1 && <div className="label-count">{L.index} of {L.of}</div>}
      </div>
    </div>
  );
}

// =============================================================================
//   Shared layout helpers
// =============================================================================
function Centered({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="bg-cream min-h-screen flex items-start justify-center p-4 md:p-8">
      <div className={wide ? 'w-full max-w-[820px]' : 'w-full max-w-[420px]'}>{children}</div>
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-paper border border-line rounded-[18px] p-5 md:p-6 shadow-soft">{children}</div>;
}
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-extrabold uppercase tracking-[.06em] text-forest mb-2.5">{children}</div>;
}
