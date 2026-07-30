/**
 * Coordinator-portal sections: Suppliers add/edit, Volunteers add/edit,
 * Steady Pickups, Sign-In sheet, Settings. Each is a self-contained panel
 * the portal renders in the right pane based on the active tab.
 *
 * All endpoints already existed in the volunteer-portal API — these panels
 * are pure UI wrappers around them, themed to the rescue-app design.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, Check, Eye } from 'lucide-react';
import { adminCRUD, api, canWrite, getUser } from './api';
// Cached at module scope — role doesn't change during a session, and reading
// from every panel on every render churns for no reason.
const readOnly = !canWrite(getUser()?.role);
import { fmtTime } from './time-format';
import { Button, cx } from './design';
import { ContactRecruitingHistory, GiftsHistory } from './crm-sections';
import { AccountLoginSection } from './account-login-section';
import { NotificationsPanel } from './notifications-panel';
import { AdminUsersPanel } from './admin-users-panel';
import { AddressAutocomplete } from './address-autocomplete';
import { broadcast, kioskDevice, pickupAlerts, portalReload, smsInbox, type NotificationType, type PickupAlertRecipient } from './api';
import { useNavigate } from 'react-router-dom';
import { Send, Megaphone, Bell, MessageSquare, Phone } from 'lucide-react';
import { ChatThread } from './chat-thread';

// =============================== Field helpers ==============================

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cx('block', full && 'col-span-2')}>
      <span className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
const inputCls = 'w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[13.5px] focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';

// =============================== Modal ======================================

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  // z-index must clear Leaflet's panes (200–700) and control container (~800)
  // so the edit dialog sits ABOVE the coordinator portal map.
  return (
    <div onClick={onClose} className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className={cx('relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-h-[80vh] overflow-y-auto', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="sticky top-0 bg-paper border-b border-line px-5 py-3 flex items-center justify-between">
          <div className="font-display font-semibold text-[18px]">{title}</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// =============================== Suppliers ==================================

export function SuppliersPanel({ rows, refetch, openId, onOpenConsumed }: { rows: any[]; refetch: () => void; openId?: number | null; onOpenConsumed?: () => void }) {
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  // Open a specific supplier's edit modal when the search bar (or any parent)
  // passes an id via openId. Only consume when we actually found the row —
  // otherwise a search click that arrives before rows have loaded would
  // clear the openId and never open the modal.
  useEffect(() => {
    if (openId == null) return;
    const match = rows.find((s: any) => Number(s.id) === Number(openId));
    if (match) {
      setEditing(match);
      onOpenConsumed?.();
    }
  }, [openId, rows]);
  const delRow = useMutation({
    mutationFn: (id: number) => adminCRUD.deleteSupplier(id),
    onSettled: () => { setDeleting(null); refetch(); },
  });
  return (
    <div className="space-y-3">
      <RegistrationLinkCard kind="supplier" />
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} donors</div>
        {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New supplier</Button>}
      </div>
      <div className="space-y-2">
        {rows.map((s) => (
          <div key={s.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-[13.5px] truncate">{s.name}</div>
              <div className="text-[11px] text-muted truncate">{[s.addressLine1, s.city].filter(Boolean).join(', ')}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setEditing(s)} title={readOnly ? 'View' : 'Edit'}
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                <Pencil size={14} />
              </button>
              {!readOnly && (
                <button onClick={() => {
                          if (confirm(`Permanently delete ${s.name}? Linked pickups and steady templates at this supplier will be affected.`)) {
                            setDeleting(s.id); delRow.mutate(s.id);
                          }
                        }} title="Delete"
                        disabled={deleting === s.id}
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20 disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && <SupplierForm row={editing === 'new' ? null : editing} onDone={() => { setEditing(null); refetch(); }} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function SupplierForm({ row, onDone, onCancel }: { row: any | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName]          = useState(row?.name ?? '');
  const [contactName, setCN]     = useState(row?.contactName ?? '');
  const [contactPhone, setCP]    = useState(row?.contactPhone ?? '');
  const [addressLine1, setAddr]  = useState(row?.addressLine1 ?? '');
  const [city, setCity]          = useState(row?.city ?? '');
  const [pickupInstructions, setInstr] = useState(row?.pickupInstructions ?? '');
  const [typicalDonation, setTd] = useState(row?.typicalDonation ?? '');
  const [neighborhoodId, setNb]  = useState<number | null>(row?.neighborhoodId ?? null);
  const neighborhoods = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });

  const save = useMutation({
    mutationFn: () => row
      ? adminCRUD.patchSupplier(row.id, { name, contactName, contactPhone, addressLine1, city, pickupInstructions, typicalDonation, neighborhoodId })
      : adminCRUD.createSupplier({ name, contactName, contactPhone, addressLine1, city, pickupInstructions, typicalDonation, neighborhoodId }),
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteSupplier(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.name}` : 'New supplier'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <Field label="Contact name"><input value={contactName} onChange={(e) => setCN(e.target.value)} className={inputCls} /></Field>
        <Field label="Contact phone"><input value={contactPhone} onChange={(e) => setCP(e.target.value)} className={inputCls} /></Field>
        <Field label="Address" full><AddressAutocomplete value={addressLine1} onChange={setAddr} placeholder="Start typing… suggestions from Google" className={inputCls} /></Field>
        <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} /></Field>
        <Field label="Neighborhood" full>
          <select value={neighborhoodId ?? ''} onChange={(e) => setNb(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
            <option value="">— Not assigned —</option>
            {(neighborhoods.data?.data ?? []).filter((n) => n.status === 'active').map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Pickup instructions" full><textarea rows={2} value={pickupInstructions} onChange={(e) => setInstr(e.target.value)} className={inputCls} placeholder="gate codes, door, etc." /></Field>
        <Field label="What they typically donate" full><textarea rows={2} value={typicalDonation} onChange={(e) => setTd(e.target.value)} className={inputCls} placeholder='e.g. "6–8 trays of pasta"' /></Field>
      </div>
      {row && (
        <AccountLoginSection kind="supplier" id={row.id} suggestedUsername={contactPhone || ''} />
      )}
      {row?.intakePayload && (
        <IntakeInfoCard payload={row.intakePayload} receivedAt={row.intakeReceivedAt} kind="supplier" />
      )}
      {row && (
        <ContactRecruitingHistory targetType="supplier" targetId={row.id} targetName={row.name} />
      )}
      {row && (
        <GiftsHistory targetType="supplier" targetId={row.id} targetName={row.name} />
      )}
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row ? (
          <button onClick={() => { if (confirm(`Permanently delete ${row.name}? This removes it and any linked pickups/steady templates only at this supplier.`)) del.mutate(); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{row ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================== Volunteers =================================

export function VolunteersPanel({ rows, refetch, openId, onOpenConsumed }: { rows: any[]; refetch: () => void; openId?: number | null; onOpenConsumed?: () => void }) {
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  // Open a specific volunteer's edit modal when the search bar (or any parent)
  // passes an id via openId. Only consume when we actually found the row —
  // otherwise a search click that arrives before rows have loaded would
  // clear the openId and never open the modal.
  useEffect(() => {
    if (openId == null) return;
    const match = rows.find((v: any) => Number(v.id) === Number(openId));
    if (match) {
      setEditing(match);
      onOpenConsumed?.();
    }
  }, [openId, rows]);
  const delRow = useMutation({
    mutationFn: (id: number) => adminCRUD.deleteVolunteer(id),
    onSettled: () => { setDeleting(null); refetch(); },
  });
  return (
    <div className="space-y-3">
      <RegistrationLinkCard kind="volunteer" />
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} drivers</div>
        {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New volunteer</Button>}
      </div>
      <div className="space-y-2">
        {rows.map((v) => (
          <div key={v.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-[13.5px] truncate">{v.firstName} {v.lastName}</div>
              <div className="text-[11px] text-muted truncate">{v.phonePrimary ?? '—'} {v.locationArea ? `· ${v.locationArea}` : ''}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setViewing(v)} title="View full sign-up info"
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-cream text-ink hover:bg-line">
                <Eye size={14} />
              </button>
              <button onClick={() => setEditing(v)} title="Edit"
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                <Pencil size={14} />
              </button>
              <button onClick={() => {
                        if (confirm(`Remove ${v.firstName} ${v.lastName} from the roster? Their past pickup history is preserved.`)) {
                          setDeleting(v.id); delRow.mutate(v.id);
                        }
                      }} title="Remove from roster"
                      disabled={deleting === v.id}
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20 disabled:opacity-40">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing && <VolunteerForm row={editing === 'new' ? null : editing} onDone={() => { setEditing(null); refetch(); }} onCancel={() => setEditing(null)} />}
      {viewing && <VolunteerViewModal row={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/**
 * Read-only modal that shows the full sign-up information the volunteer
 * submitted. No form fields, no save button, no accidental edits — for
 * office/managers who just want to look at what someone answered.
 */
function VolunteerViewModal({ row, onClose }: { row: any; onClose: () => void }) {
  return (
    <Modal title={`${row.firstName ?? ''} ${row.lastName ?? ''} — Sign-up info`.trim()} onClose={onClose} wide>
      <div className="space-y-2 text-[13px]">
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <div className="text-[11.5px] font-bold text-muted">Phone</div>
          <div>{row.phonePrimary ?? '—'}</div>
        </div>
        {row.email && (
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <div className="text-[11.5px] font-bold text-muted">Email</div>
            <div>{row.email}</div>
          </div>
        )}
        {row.locationArea && (
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <div className="text-[11.5px] font-bold text-muted">Area</div>
            <div>{row.locationArea}</div>
          </div>
        )}
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <div className="text-[11.5px] font-bold text-muted">Status</div>
          <div className="uppercase text-[11px] font-extrabold tracking-wider">{row.status ?? '—'}</div>
        </div>
      </div>
      {row.intakePayload
        ? <IntakeInfoCard payload={row.intakePayload} receivedAt={row.intakeReceivedAt} kind="volunteer" />
        : <div className="mt-5 rounded-[14px] border border-line bg-cream/60 px-4 py-3 text-[12.5px] text-muted">
            No sign-up form on file for this volunteer (they were added directly by the office).
          </div>}
      <div className="flex justify-end mt-4">
        <Button size="sm" variant="plain" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function VolunteerForm({ row, onDone, onCancel }: { row: any | null; onDone: () => void; onCancel: () => void }) {
  const [firstName, setFN]    = useState(row?.firstName ?? '');
  const [lastName, setLN]     = useState(row?.lastName ?? '');
  const [phonePrimary, setPh] = useState(row?.phonePrimary ?? '');
  const [email, setEmail]     = useState(row?.email ?? '');
  const [locationArea, setLA] = useState(row?.locationArea ?? '');
  const [hasCar, setHasCar]   = useState<boolean>(row?.hasCar ?? true);
  const [wantsSteadyPickup, setSteady] = useState<boolean>(row?.wantsSteadyPickup ?? false);
  const [neighborhoodIds, setNbIds] = useState<number[]>(row?.neighborhoodIds ?? []);
  const neighborhoods = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });
  const toggleNb = (id: number) => setNbIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const save = useMutation({
    mutationFn: () => row
      ? adminCRUD.patchVolunteer(row.id, { firstName, lastName, phonePrimary, email: email || null, locationArea, hasCar, wantsSteadyPickup, neighborhoodIds })
      : adminCRUD.createVolunteer({ firstName, lastName, phonePrimary, email: email || null, locationArea, hasCar, wantsSteadyPickup, neighborhoodIds }),
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteVolunteer(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.firstName} ${row.lastName}` : 'New volunteer'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><input value={firstName} onChange={(e) => setFN(e.target.value)} className={inputCls} /></Field>
        <Field label="Last name"><input value={lastName} onChange={(e) => setLN(e.target.value)} className={inputCls} /></Field>
        <Field label="Phone"><input value={phonePrimary} onChange={(e) => setPh(e.target.value)} className={inputCls} /></Field>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
        <Field label="Area (notes)" full><input value={locationArea} onChange={(e) => setLA(e.target.value)} className={inputCls} placeholder="Spring Valley / Monsey / Suffern…" /></Field>
        <Field label="Neighborhoods they can serve" full>
          <div className="flex flex-wrap gap-1.5">
            {(neighborhoods.data?.data ?? []).filter((n) => n.status === 'active').map((n) => {
              const on = neighborhoodIds.includes(n.id);
              return (
                <button type="button" key={n.id} onClick={() => toggleNb(n.id)}
                        className={cx('text-[12px] font-bold px-3 py-1.5 rounded-full border transition haptic',
                          on ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                  {n.name}
                </button>
              );
            })}
            {(neighborhoods.data?.data ?? []).length === 0 && (
              <span className="text-[11px] text-muted">No neighborhoods yet — add them in Settings → Neighborhoods.</span>
            )}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={hasCar} onChange={(e) => setHasCar(e.target.checked)} className="accent-forest h-4 w-4" /> Has car</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={wantsSteadyPickup} onChange={(e) => setSteady(e.target.checked)} className="accent-forest h-4 w-4" /> Wants steady pickup</label>
      </div>
      {row && (
        <AccountLoginSection kind="volunteer" id={row.id} suggestedUsername={phonePrimary || ''} />
      )}
      {row?.intakePayload && (
        <IntakeInfoCard payload={row.intakePayload} receivedAt={row.intakeReceivedAt} kind="volunteer" />
      )}
      {row && (
        <ContactRecruitingHistory targetType="volunteer" targetId={row.id} targetName={`${row.firstName} ${row.lastName}`} />
      )}
      {row && (
        <GiftsHistory targetType="volunteer" targetId={row.id} targetName={`${row.firstName} ${row.lastName}`} />
      )}
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row ? (
          <button onClick={() => { if (confirm(`Hide ${row.firstName} from the roster? (Soft delete)`)) del.mutate(); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Remove'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{row ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================== Steady pickups =============================

export function SteadyPickupsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-steady'], queryFn: adminCRUD.steady });
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-3">
      <RegistrationLinkCard kind="steady-pickup" />
      <RegistrationLinkCard kind="one-time-pickup" />
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} recurring templates</div>
        {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New steady pickup</Button>}
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       rows.length === 0 ? <div className="text-[13px] text-muted">No steady pickups yet. Create one to generate weekly occurrences.</div> :
       <div className="space-y-2">
         {rows.map((p) => (
           <div key={p.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3">
             <div className="min-w-0">
               <div className="font-bold text-[13.5px] truncate">{p.name}</div>
               <div className="text-[11px] text-muted truncate">
                 {p.days?.join(', ') ?? '—'} · {fmtTime(p.pickup_time?.slice(0, 5)) || '—'} · {p.suppliers || 'no supplier'}
               </div>
             </div>
             <button onClick={() => setEditing(p)} className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line shrink-0"><Pencil size={14} /></button>
           </div>
         ))}
       </div>}
      {editing && <SteadyForm row={editing === 'new' ? null : editing} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['admin-steady'] }); }} onCancel={() => setEditing(null)} />}
    </div>
  );
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
function SteadyForm({ row, onDone, onCancel }: { row: any | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(row?.name ?? '');
  const [pickupTime, setTime] = useState((row?.pickup_time ?? '14:00').slice(0, 5));
  const [days, setDays] = useState<string[]>(row?.days ?? []);
  const [supplierId, setSupplierId] = useState<string>(row?.supplier_id ? String(row.supplier_id) : '');
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });

  function toggleDay(d: string) { setDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]); }

  const save = useMutation({
    mutationFn: () => row
      ? adminCRUD.patchSteady(row.id, { name, pickupTime, days, supplierId: supplierId ? Number(supplierId) : undefined })
      : adminCRUD.createSteady({ name, pickupTime, days, supplierId: supplierId ? Number(supplierId) : undefined }),
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteSteady(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.name}` : 'New steady pickup'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder='e.g. "Hive Tuesday afternoon"' /></Field>
        <Field label="Pickup time"><input type="time" value={pickupTime} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
        <Field label="Supplier">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
            <option value="">{row ? '— Leave unchanged —' : '—'}</option>
            {suppliers.data?.data.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Days of the week" full>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={cx('chip', days.includes(d) && 'on')}>
                {d.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
      </div>
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row ? (
          <button onClick={() => { if (confirm(`Delete steady pickup ${row.name}? Future generated occurrences are unlinked.`)) del.mutate(); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px]">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{row ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================== Sign-In sheet ==============================

/**
 * Office sign-in — volunteers sign in when they drop off food and report what
 * they picked up. Multiple pickup rows per sign-in: location + supplier.
 */
export function SignInPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-signins'], queryFn: adminCRUD.signins });
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [pickups, setPickups] = useState<{ location: string; supplier: string }[]>([{ location: '', supplier: '' }]);
  const [notes, setNotes] = useState('');
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });

  const save = useMutation({
    mutationFn: () => adminCRUD.createSignin({
      name, unitNumber: unit || null,
      notes: notes.trim() || null,
      pickups: pickups.filter((p) => p.location || p.supplier),
    }),
    onSuccess: () => {
      setName(''); setUnit(''); setPickups([{ location: '', supplier: '' }]); setNotes('');
      qc.invalidateQueries({ queryKey: ['admin-signins'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="border border-line bg-paper rounded-[14px] p-4 space-y-3">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">New sign-in</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Volunteer name" full><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Unit number (3 Regina)"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} /></Field>
        </div>
        <div>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Pickups dropped off</div>
          <div className="space-y-2">
            {pickups.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input list="signin-suppliers" placeholder="Supplier"
                       value={p.supplier} onChange={(e) => setPickups((arr) => arr.map((x, j) => j === i ? { ...x, supplier: e.target.value } : x))}
                       className={cx(inputCls, 'flex-1')} />
                <input placeholder="Location / shelf"
                       value={p.location} onChange={(e) => setPickups((arr) => arr.map((x, j) => j === i ? { ...x, location: e.target.value } : x))}
                       className={cx(inputCls, 'flex-1')} />
                {pickups.length > 1 && (
                  <button onClick={() => setPickups((arr) => arr.filter((_, j) => j !== i))}
                          className="haptic grid h-10 w-10 place-items-center rounded-full bg-clay-soft text-clay"><X size={14} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setPickups((arr) => [...arr, { location: '', supplier: '' }])}
                    className="haptic text-[12px] font-bold text-forest mt-1 flex items-center gap-1.5"><Plus size={13} /> Add another pickup</button>
          </div>
          <datalist id="signin-suppliers">
            {(suppliers.data?.data ?? []).map((s: any) => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
        <div>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Notes</div>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything the office should know — issues at the store, items that need to be flagged, follow-ups, etc."
                    className={cx(inputCls, 'resize-y min-h-[72px]')} />
        </div>
        {save.error && <p className="text-clay text-[12px]">{(save.error as Error).message}</p>}
        <Button size="md" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()} icon={<Check size={15} />}>
          Save sign-in
        </Button>
      </div>

      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Recent</div>
        {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
         (q.data?.data ?? []).length === 0 ? <div className="text-[13px] text-muted">No sign-ins yet.</div> :
         <div className="space-y-2">
           {(q.data?.data ?? []).slice(0, 30).map((s: any) => (
             <div key={s.id} className="border border-line bg-paper rounded-[14px] px-4 py-2.5 flex items-start justify-between gap-3">
               <div className="min-w-0">
                 <div className="font-bold text-[13.5px] truncate">{s.name} {s.unitNumber ? <span className="text-muted font-semibold">· #{s.unitNumber}</span> : null}</div>
                 <div className="text-[11px] text-muted">{new Date(s.signedInAt ?? s.createdAt).toLocaleString()}</div>
                 {Array.isArray(s.pickups) && s.pickups.length > 0 && (
                   <div className="text-[11.5px] text-ink mt-1">{s.pickups.map((p: any) => `${p.supplier ?? ''}${p.location ? ` (${p.location})` : ''}`.trim()).filter(Boolean).join(' · ')}</div>
                 )}
               </div>
             </div>
           ))}
         </div>}
      </div>
    </div>
  );
}

// =============================== Settings ===================================

/**
 * Settings — manage the option_items lookup so admins can rename/add/remove
 * statuses, types, urgency levels, container kinds, etc.
 */
const CATEGORIES = [
  { key: 'pickup_status',     label: 'Pickup statuses' },
  { key: 'pickup_type',       label: 'Pickup types' },
  { key: 'urgency_level',     label: 'Urgency levels' },
  { key: 'volunteer_status',  label: 'Volunteer statuses' },
  { key: 'supplier_status',   label: 'Supplier statuses' },
  { key: 'volunteer_question', label: 'Driver sign-up questions' },
  { key: 'supplier_question',  label: 'Store sign-up questions' },
];

export function SettingsPanel() {
  const [active, setActive] = useState<string>('options');
  const [optionCat, setOptionCat] = useState<string>(CATEGORIES[0]!.key);
  return (
    <div className="space-y-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Admin settings</div>
      {/* Portal-wide force refresh — always visible so it's one click away
          from any tab, since it's the "we just shipped a fix, pull it now
          on every tablet" action. */}
      <ForcePortalReloadCard />
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setActive('options')} className={cx('chip', active === 'options' && 'on')}>Status & type lists</button>
        <button onClick={() => setActive('notifications')} className={cx('chip', active === 'notifications' && 'on')}>SMS notifications</button>
        <button onClick={() => setActive('admins')} className={cx('chip', active === 'admins' && 'on')}>Admin users</button>
        <button onClick={() => setActive('kiosk')} className={cx('chip', active === 'kiosk' && 'on')}>Kiosk mode</button>
        <button onClick={() => setActive('autosms')} className={cx('chip', active === 'autosms' && 'on')}>Auto SMS</button>
      </div>
      {active === 'options' ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => setOptionCat(c.key)}
                      className={cx('chip', optionCat === c.key && 'on')}>{c.label}</button>
            ))}
          </div>
          <OptionsForCategory category={optionCat} />
        </>
      ) : active === 'notifications' ? (
        <NotificationsPanel />
      ) : active === 'admins' ? (
        <AdminUsersPanel />
      ) : active === 'kiosk' ? (
        <KioskModePanel />
      ) : (
        <PickupAlertsPanel />
      )}
    </div>
  );
}

/**
 * Manages the "always-notified" list of drivers who auto-receive an SMS
 * when a new pickup is created. Drivers can be added or removed here;
 * the fan-out is fire-and-forget from the pickup-create endpoint.
 */
function PickupAlertsPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['pickup-alerts'], queryFn: pickupAlerts.list });
  const volsQ = useQuery({
    queryKey: ['pickup-alerts-vol-picker'],
    queryFn:  () => api<{ data: any[] }>('/api/volunteers?limit=1000'),
  });
  const [pickVolId, setPickVolId] = useState<number | ''>('');
  const [err, setErr] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: (vid: number) => pickupAlerts.add(vid),
    onSuccess: () => { setPickVolId(''); setErr(null); qc.invalidateQueries({ queryKey: ['pickup-alerts'] }); },
    onError:   (e: any) => setErr(e?.message ?? 'add failed'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => pickupAlerts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pickup-alerts'] }),
    onError:   (e: any) => setErr(e?.message ?? 'remove failed'),
  });

  const currentIds = new Set((list.data?.data ?? []).map((r) => r.volunteerId));
  const candidates = (volsQ.data?.data ?? [])
    .filter((v: any) => !v.deletedAt && !currentIds.has(Number(v.id)) && v.phonePrimary)
    .sort((a: any, b: any) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-4 text-[13px] text-forest">
        <div className="font-extrabold text-[14px] mb-1">Auto SMS on new pickup</div>
        <p className="leading-snug">
          When any coordinator creates a new pickup, every driver in this list is texted a summary with "Reply YES to accept." Keep it to your rotating on-call / hotshot group — for a one-off blast to more drivers, use <b>Broadcast</b> instead.
        </p>
        <p className="leading-snug mt-2">
          Drivers only receive the auto-SMS if they have a phone on file and haven't opted out.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={pickVolId} onChange={(e) => setPickVolId(e.target.value ? Number(e.target.value) : '')}
                className={cx(inputCls, 'max-w-[420px]')}>
          <option value="">— Pick a driver to add —</option>
          {candidates.map((v: any) => (
            <option key={v.id} value={v.id}>
              {v.firstName} {v.lastName}{v.phonePrimary ? ` · ${v.phonePrimary}` : ''}{v.locationArea ? ` · ${v.locationArea}` : ''}
            </option>
          ))}
        </select>
        <Button size="sm" variant="forest" icon={<Plus size={14} />}
                loading={add.isPending} disabled={!pickVolId}
                onClick={() => pickVolId && add.mutate(pickVolId)}>Add</Button>
      </div>
      {err && <div className="text-clay text-[13px] font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}

      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {list.isLoading ? (
          <div className="text-[13px] text-muted px-4 py-6 text-center">Loading…</div>
        ) : (list.data?.data ?? []).length === 0 ? (
          <div className="text-[13.5px] text-muted px-4 py-6 text-center">
            No drivers set up yet. Pick one above to start the on-call group.
          </div>
        ) : (
          (list.data!.data as PickupAlertRecipient[]).map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line/60 last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13.5px] text-ink truncate">{r.name}</div>
                <div className="text-[11.5px] text-muted mt-0.5">
                  {r.phone ?? 'no phone'} {!r.smsOptIn && <span className="ml-2 text-clay font-bold">(SMS opted out — will NOT receive)</span>}
                </div>
              </div>
              <button onClick={() => { if (confirm(`Remove ${r.name} from the auto-SMS list?`)) remove.mutate(r.id); }}
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Force every portal tablet / browser to hard-refresh on the next API
 * response after the click. Server bumps `X-Portal-Reload-Since`; every
 * client's fetch wrapper detects a newer epoch than it's seen, unregisters
 * service workers, clears CacheStorage, and reloads with a cache-buster.
 * Meant for exactly this case: "we shipped a fix — pull it now, everywhere."
 */
function ForcePortalReloadCard() {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  async function bump() {
    if (!confirm('Force EVERY logged-in portal browser and tablet to refresh now?\n\nUsers on the kiosk in the middle of a drop-off are skipped and picked up on their next boot.')) return;
    setBusy(true); setErr(null); setFlash(null);
    try {
      const r = await portalReload.bump();
      setFlash(`Bumped. All portal tabs will refresh on their next API call. Epoch: ${r.data.reloadSince}`);
    } catch (e: any) {
      setErr(e?.message || 'Could not bump portal reload epoch.');
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-[14px] border border-clay/30 bg-clay/5 p-4 text-[13px] text-ink space-y-2">
      <div className="font-extrabold text-[14px] text-clay-deep">Force refresh on every device</div>
      <p className="leading-snug">
        Kicks every open portal tab/tablet into a hard reload (clears the service worker + cache and reloads with a cache-buster). Use after a critical fix so nobody's stuck on the old bundle.
      </p>
      {err && <div className="text-clay font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}
      {flash && <div className="text-forest font-bold bg-sage/40 rounded-[10px] px-3 py-2">{flash}</div>}
      <Button size="sm" variant="clay" loading={busy} onClick={bump}>Force refresh everyone now</Button>
    </div>
  );
}

/**
 * Kiosk mode toggle for the current device. Enabling stores the shared
 * kiosk secret in localStorage on this device; App.tsx's Root() redirects
 * every visit to /kiosk/<secret> until it's cleared. Any other device
 * (with a different localStorage) continues to see the normal portal.
 */
function KioskModePanel() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(() => !!kioskDevice.getSecret());

  async function enable() {
    setBusy(true); setErr(null);
    try {
      const r = await kioskDevice.fetchSecret();
      if (!r.data.secret) {
        setErr('Kiosk secret not configured on the server (KIOSK_SECRET env var).');
        return;
      }
      kioskDevice.setSecret(r.data.secret);
      setEnabled(true);
      nav(`/kiosk/${r.data.secret}`, { replace: true });
    } catch (e: any) {
      setErr(e?.message || 'Could not enable kiosk mode.');
    } finally { setBusy(false); }
  }
  function disable() {
    kioskDevice.clear();
    setEnabled(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-4 text-[13px] text-forest">
        <div className="font-extrabold text-[14px] mb-1">Kiosk mode on this device</div>
        <p className="leading-snug">
          When on, this device shows the office drop-off kiosk instead of the normal portal. Any other device (phone, laptop, another tablet) still signs in as usual — kiosk mode is per-device and lives in this browser's local storage.
        </p>
        <p className="leading-snug mt-2">
          To exit kiosk mode from the kiosk screen, tap the small "Kiosk mode" text at the bottom-right of the Welcome screen five times fast.
        </p>
      </div>
      {err && <div className="text-clay text-[13px] font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}
      <div className="flex items-center gap-3">
        {enabled ? (
          <>
            <div className="flex items-center gap-2 rounded-full bg-forest text-paper px-4 py-2 text-[13px] font-extrabold">
              <span className="w-2 h-2 rounded-full bg-paper" /> Kiosk mode is ON for this device
            </div>
            <Button size="sm" variant="plain" onClick={disable}>Turn off on this device</Button>
          </>
        ) : (
          <>
            <div className="text-[13px] text-muted">Kiosk mode is off. This device shows the normal portal.</div>
            <Button size="sm" variant="forest" loading={busy} onClick={enable}>Make this device the kiosk</Button>
          </>
        )}
      </div>
    </div>
  );
}

function OptionsForCategory({ category }: { category: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-options', category], queryFn: () => adminCRUD.options(category) });
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const rows = (q.data?.data ?? []) as any[];

  const create = useMutation({
    mutationFn: () => adminCRUD.createOption({ category, value: newValue, label: newLabel || newValue }),
    onSuccess: () => { setAdding(false); setNewValue(''); setNewLabel(''); qc.invalidateQueries({ queryKey: ['admin-options', category] }); },
  });

  return (
    <div className="border border-line bg-paper rounded-[14px] overflow-hidden">
      {rows.map((o) => <OptionRow key={o.id} row={o} category={category} onChanged={() => qc.invalidateQueries({ queryKey: ['admin-options', category] })} />)}
      {adding ? (
        <div className="border-t border-line p-3 grid grid-cols-2 gap-2">
          <input className={inputCls} value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value (e.g. en_route)" />
          <input className={inputCls} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="label (e.g. En route)" />
          <div className="col-span-2 flex justify-end gap-2">
            <Button size="sm" variant="plain" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" loading={create.isPending} disabled={!newValue.trim()} onClick={() => create.mutate()}>Add</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="haptic w-full border-t border-line py-2.5 text-[12.5px] font-bold text-forest flex items-center justify-center gap-1.5">
          <Plus size={13} /> Add option
        </button>
      )}
    </div>
  );
}

function OptionRow({ row, category, onChanged }: { row: any; category: string; onChanged: () => void }) {
  const [label, setLabel] = useState(row.label);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setLabel(row.label); setDirty(false); }, [row.id, row.label]);

  const patch = useMutation({ mutationFn: () => adminCRUD.patchOption(row.id, { label }), onSuccess: () => { onChanged(); setDirty(false); } });
  const del   = useMutation({ mutationFn: () => adminCRUD.deleteOption(row.id), onSuccess: onChanged });

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-b-0">
      <span className="text-[11px] font-mono text-muted w-[110px] truncate">{row.value}</span>
      <input value={label} onChange={(e) => { setLabel(e.target.value); setDirty(true); }} className={cx(inputCls, 'flex-1 !py-1.5 !text-[12.5px]')} />
      {dirty && <button onClick={() => patch.mutate()} className="haptic text-forest text-[12px] font-bold px-2 py-1 rounded-[8px] bg-sage">Save</button>}
      <button onClick={() => { if (confirm(`Remove "${row.value}" from ${category}?`)) del.mutate(); }}
              className="haptic text-clay grid h-7 w-7 place-items-center rounded-full hover:bg-clay-soft"><Trash2 size={13} /></button>
    </div>
  );
}

// =============================== Neighborhoods ==============================

export function NeighborhoodsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });
  const [newName, setNewName] = useState('');
  const create = useMutation({
    mutationFn: () => adminCRUD.createNeighborhood({ name: newName.trim() }),
    onSuccess: () => { setNewName(''); qc.invalidateQueries({ queryKey: ['neighborhoods'] }); },
  });
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} neighborhoods</div>

      <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(); }}
            className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
               placeholder="e.g. Spring Valley"
               className={cx(inputCls, '!py-2 !text-[13px] flex-1')} />
        <Button size="sm" variant="forest" icon={<Plus size={14} />}
                loading={create.isPending} onClick={() => create.mutate()}
                disabled={!newName.trim()}>Add</Button>
      </form>
      {create.error && <p className="text-clay text-[12px]">{(create.error as Error).message}</p>}

      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {rows.length === 0 && <div className="text-[13px] text-muted px-4 py-6 text-center">No neighborhoods yet.</div>}
        {rows.map((n) => <NeighborhoodRow key={n.id} row={n} onChanged={() => qc.invalidateQueries({ queryKey: ['neighborhoods'] })} />)}
      </div>
    </div>
  );
}

function NeighborhoodRow({ row, onChanged }: { row: any; onChanged: () => void }) {
  const [name, setName] = useState(row.name);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setName(row.name); setDirty(false); }, [row.id, row.name]);
  const patch = useMutation({ mutationFn: () => adminCRUD.patchNeighborhood(row.id, { name }), onSuccess: () => { onChanged(); setDirty(false); } });
  const archive = useMutation({ mutationFn: () => adminCRUD.patchNeighborhood(row.id, { status: row.status === 'active' ? 'archived' : 'active' }), onSuccess: onChanged });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteNeighborhood(row.id), onSuccess: onChanged });

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-b-0">
      <span className={cx('inline-block w-2 h-2 rounded-full shrink-0', row.status === 'active' ? 'bg-forest' : 'bg-line')} />
      <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }}
             className={cx(inputCls, 'flex-1 !py-1.5 !text-[12.5px]')} />
      {dirty && <button onClick={() => patch.mutate()} className="haptic text-forest text-[12px] font-bold px-2 py-1 rounded-[8px] bg-sage">Save</button>}
      <button onClick={() => archive.mutate()} title={row.status === 'active' ? 'Archive' : 'Restore'}
              className="haptic text-[11.5px] font-bold text-muted px-2 py-1 rounded-[8px] hover:bg-cream">
        {row.status === 'active' ? 'Archive' : 'Restore'}
      </button>
      <button onClick={() => { if (confirm(`Delete "${row.name}" permanently? Suppliers in this neighborhood become unassigned; volunteer assignments are removed.`)) del.mutate(); }}
              className="haptic text-clay grid h-7 w-7 place-items-center rounded-full hover:bg-clay-soft"><Trash2 size={13} /></button>
    </div>
  );
}

// =============================== Coverage ===================================

export function CoveragePanel() {
  const q = useQuery({ queryKey: ['coverage'], queryFn: adminCRUD.coverage, refetchInterval: 30000 });
  const rows = q.data?.data ?? [];
  const low = rows.filter((r) => r.coverage === 'none' || r.coverage === 'low');

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading coverage…</div>;

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Volunteer coverage by neighborhood</div>

      {low.length > 0 && (
        <div className="rounded-[14px] border border-clay/40 bg-clay-soft/60 px-4 py-3">
          <div className="text-[12px] font-extrabold text-clay uppercase tracking-[.05em] mb-1">Low coverage — needs more drivers</div>
          <div className="text-[13px] text-ink">
            {low.map((r) => r.name).join(' · ')}
          </div>
        </div>
      )}

      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {rows.length === 0 && <div className="text-[13px] text-muted px-4 py-6 text-center">No neighborhoods configured yet.</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-b-0">
            <span className={cx('grid h-8 w-8 place-items-center rounded-full text-[11px] font-extrabold shrink-0',
              r.coverage === 'healthy' ? 'bg-sage text-forest'
              : r.coverage === 'ok'    ? 'bg-amber-soft text-[#9a7415]'
              :                          'bg-clay-soft text-clay')}>
              {r.volunteerCount}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[13.5px] truncate">{r.name}</div>
              <div className="text-[11px] text-muted">{r.supplierCount} {r.supplierCount === 1 ? 'store' : 'stores'} · {r.volunteerCount} {r.volunteerCount === 1 ? 'driver' : 'drivers'}</div>
            </div>
            <span className={cx('text-[10.5px] font-bold py-1 px-2.5 rounded-full uppercase tracking-[.04em]',
              r.coverage === 'healthy' ? 'bg-sage text-forest'
              : r.coverage === 'ok'    ? 'bg-amber-soft text-[#9a7415]'
              : r.coverage === 'low'   ? 'bg-clay-soft text-clay'
              :                          'bg-clay text-paper')}>
              {r.coverage}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================== Sign-up Info Cards ==========================

/**
 * Renders the raw answers a supplier / volunteer gave in the public sign-up
 * questionnaire (intake_payload JSONB). Shown inside the edit modal so the
 * coordinator can see WHAT THE PERSON TYPED, not just what got normalized
 * into the columns.
 */
export function IntakeInfoCard({ payload, receivedAt, kind }: {
  payload: any | null | undefined;
  receivedAt: string | null | undefined;
  kind: 'supplier' | 'volunteer';
}) {
  if (!payload || typeof payload !== 'object') return null;

  const groups = kind === 'supplier' ? SUPPLIER_GROUPS : VOLUNTEER_GROUPS;
  const dt = receivedAt ? new Date(receivedAt) : null;

  return (
    <div className="mt-5 border-2 border-forest/15 bg-sage/30 rounded-[16px] overflow-hidden">
      <div className="px-4 py-2.5 bg-forest text-paper flex items-center justify-between">
        <div className="text-[12px] font-extrabold uppercase tracking-[.08em]">Sign-up info card</div>
        {dt && (
          <div className="text-[11px] font-bold opacity-80">
            Received {dt.toLocaleDateString()} {dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
      <div className="p-4 space-y-4">
        {groups.map((g) => {
          // Field keys may be dotted (e.g. "dispatching.days"), so use getPath
          // to walk into nested payload objects. Hide fields where the value
          // is missing/empty; hide the whole group if nothing survives.
          const visible = g.fields
            .map((f) => ({ f, v: getPath(payload, f.key) }))
            .filter(({ v }) => hasValue(v));
          if (visible.length === 0) return null;
          return (
            <div key={g.title}>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-forest mb-1.5">{g.title}</div>
              <dl className="space-y-1.5">
                {visible.map(({ f, v }) => (
                  <div key={f.key} className="grid grid-cols-[140px_1fr] gap-3 items-start">
                    <dt className="text-[11.5px] font-bold text-muted pt-0.5">{f.label}</dt>
                    <dd className="text-[13px] text-ink">{f.render ? f.render(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hasValue(v: any) {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}
function pretty(v: string) { return v.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function joinList(arr: any) { return Array.isArray(arr) ? arr.map(pretty).join(', ') : String(arr); }

type IntakeField = { key: string; label: string; render?: (v: any) => string };
type IntakeGroup = { title: string; fields: IntakeField[] };

const SUPPLIER_GROUPS: IntakeGroup[] = [
  { title: 'Store details', fields: [
    { key: 'storeName',          label: 'Store name' },
    { key: 'address',            label: 'Address' },
    { key: 'hoursAvailable',     label: 'Days & hours' },
  ]},
  { title: 'Pickup logistics', fields: [
    { key: 'latestPickupCutoff', label: 'Latest cutoff' },
    { key: 'parking',            label: 'Parking' },
    { key: 'arrivalLocation',    label: 'On arrival' },
    { key: 'loadHelp',           label: 'Load help', render: pretty },
  ]},
  { title: 'About the donation', fields: [
    { key: 'avgQuantity',        label: 'Avg quantity' },
    { key: 'foodTypes',          label: 'Food types', render: joinList },
    { key: 'coldChainNotes',     label: 'Cold-chain notes' },
  ]},
  { title: 'Contact', fields: [
    { key: 'primaryContactName', label: 'Primary contact' },
    { key: 'primaryContactPhone',label: 'Primary phone' },
    { key: 'backupContactName',  label: 'Backup contact' },
    { key: 'backupContactPhone', label: 'Backup phone' },
    { key: 'frequency',          label: 'Frequency', render: pretty },
  ]},
];

// Reach into nested payload keys like `dispatching.days` so the admin card can
// break out every sub-field as its own row instead of one crammed line.
function getPath(obj: any, path: string) {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
}

const VOLUNTEER_GROUPS: IntakeGroup[] = [
  { title: 'Contact', fields: [
    { key: 'firstName',                     label: 'First name' },
    { key: 'lastName',                      label: 'Last name' },
    { key: 'phone',                         label: 'Phone' },
    { key: 'email',                         label: 'Email' },
    { key: 'homeAddress',                   label: 'Home address' },
    { key: 'homeNeighborhood',              label: 'Home base' },
    { key: 'emergencyContact',              label: 'Emergency contact' },
    { key: 'maritalStatus',                 label: 'Marital status', render: pretty },
  ]},
  { title: 'Reference', fields: [
    { key: 'reference.name',                label: 'Name' },
    { key: 'reference.number',              label: 'Phone' },
    { key: 'reference.relationship',        label: 'Relationship' },
  ]},
  { title: 'App & communication', fields: [
    { key: 'appAccess',                     label: 'Has app access?',    render: pretty },
    { key: 'contactMethods',                label: 'Contact methods',    render: joinList },
    { key: 'contactMethod',                 label: 'Contact method (legacy)', render: pretty },
    { key: 'notificationMethod',            label: 'Notify by (legacy)', render: pretty },
  ]},
  { title: 'Pickup preferences', fields: [
    { key: 'pickupInterest',                label: 'Interested in',      render: pretty },
    { key: 'vehicleType',                   label: 'Vehicle',            render: pretty },
    { key: 'vehicleCapacity',               label: 'Capacity',           render: pretty },
    { key: 'loadType',                      label: 'Loads',              render: pretty },
    { key: 'loadOther',                     label: 'Load — other' },
    { key: 'refrigeratedHandling',          label: 'Refrigerated OK',    render: pretty },
    { key: 'liftHeavier',                   label: 'Lift',               render: pretty },
  ]},
  { title: 'Availability', fields: [
    { key: 'availableTimes',                label: 'Times available',     render: joinList },
    { key: 'preferredDayTime',              label: 'Preferred day / time' },
    { key: 'flexibleContact',               label: 'Flex contact time',   render: pretty },
    { key: 'pickupsPerWeek',                label: 'Per week (legacy)' },
    { key: 'daysTimesAvailable',            label: 'Days/times (legacy)' },
    { key: 'extraPickupOk',                 label: 'Extra pickup OK',     render: pretty },
    { key: 'moreOnDayOk',                   label: 'More on day OK',      render: pretty },
    { key: 'reliablyOnTime',                label: 'Reliably on time',    render: pretty },
  ]},
  { title: 'Service area', fields: [
    { key: 'areas',                         label: 'Areas',               render: joinList },
    { key: 'areaOther',                     label: 'Area — other' },
  ]},
  { title: 'Dispatching (opt-in)', fields: [
    { key: 'dispatching.days',              label: 'Available days',      render: joinList },
    { key: 'dispatching.shifts',            label: 'Available shifts',    render: joinList },
    { key: 'dispatching.commitment',        label: 'Shifts committed', render: (v) => `${v} shift${String(v) === '1' ? '' : 's'}` },
  ]},
  { title: 'Center Stocking (opt-in)', fields: [
    { key: 'centerStocking.tasks',          label: 'Tasks',               render: joinList },
    { key: 'centerStocking.hoursPerShift',  label: 'Hours per shift', render: (v) => `${v} hours` },
    { key: 'centerStocking.days',           label: 'Available days',      render: joinList },
    { key: 'centerStocking.times',          label: 'Available times',     render: joinList },
  ]},
  { title: 'Suggestions & Feedback', fields: [
    { key: 'anythingElse',                  label: 'Anything else' },
    { key: 'feedback',                      label: 'Feedback' },
  ]},
  { title: 'Other', fields: [
    { key: 'gasCompensation',               label: 'Gas comp',            render: pretty },
  ]},
];

// =============================== Quick-add pickup ===========================

/**
 * Modal for the coordinator to quickly add a one-time pickup that's not tied
 * to a steady-pickup template. Either picks an existing supplier or types in
 * a one-time donor's address. Optionally pre-assigns a driver in one step.
 */
export function QuickPickupModal({ pickup, onClose, onDone }: { pickup?: any | null; onClose: () => void; onDone: () => void }) {
  const editing = !!pickup;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Default to *right now* (HH:MM) — for walk-ins the pickup goes on the queue
  // immediately. If a coordinator needs a future slot they can just edit the
  // time field. Previously we defaulted to the next round hour, which pushed
  // 8:30 arrivals to a 9:00 pickup for no good reason.
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });
  const volunteers = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  // For an editing modal, find the supplier id from the comma-joined name(s) on the row.
  const initialSupId = (() => {
    if (!editing) return '' as number | '';
    const list = suppliers.data?.data ?? [];
    const firstName = (pickup.suppliers ?? '').split(',')[0]?.trim();
    const match = list.find((s: any) => s.name === firstName);
    return (match?.id as number | undefined) ?? ('' as number | '');
  })();
  const initialVId = (() => {
    if (!editing) return '' as number | '';
    const firstSignup = (pickup.signups ?? [])[0];
    return (firstSignup?.volunteer_id ? Number(firstSignup.volunteer_id) : '') as number | '';
  })();

  const [date, setDate]         = useState<string>(editing ? String(pickup.scheduled_date).slice(0, 10) : today);
  const [time, setTime]         = useState<string>(editing ? String(pickup.scheduled_time ?? '').slice(0, 5) : nowHHMM);
  const [supplierId, setSupId]  = useState<number | ''>(initialSupId);
  const [donorName, setDonor]   = useState('');
  const [foodDescription, setFood] = useState<string>(editing ? (pickup.food_description ?? '') : '');
  const [estimatedQuantity, setQty] = useState<string>(editing ? (pickup.estimated_quantity ?? '') : '');
  const [pickupAddress, setAddr] = useState<string>(editing ? (pickup.pickup_address ?? '') : '');
  const [contactName, setCN]    = useState<string>(editing ? (pickup.contact_name ?? '') : '');
  const [contactPhone, setCP]   = useState<string>(editing ? (pickup.contact_phone ?? '') : '');
  const [urgency, setUrgency]   = useState<'normal' | 'urgent'>(editing && pickup.urgency_level === 'urgent' ? 'urgent' : 'normal');
  const [notes, setNotes]       = useState<string>(editing ? (pickup.notes ?? '') : '');
  const [volunteerId, setVId]   = useState<number | ''>(initialVId);
  const [slotsCapacity, setSlots] = useState<number>(editing ? Number(pickup.slots_capacity ?? 1) : 1);
  // Admin-control additions: full edit surface.
  const [status, setStatus]     = useState<string>(editing ? String(pickup.status ?? '') : '');
  const [contactEmail, setCE]   = useState<string>(editing ? (pickup.contact_email ?? '') : '');
  const [pickupWindow, setPW]   = useState<string>(editing ? (pickup.pickup_window ?? '') : '');
  const [specialInstructions, setSI] = useState<string>(editing ? (pickup.special_instructions ?? '') : '');
  const toLocalInput = (ts: any) => {
    if (!ts) return '';
    const d = new Date(ts); if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [mustPickupBy, setMustBy] = useState<string>(editing ? toLocalInput(pickup.must_pickup_by) : '');

  // When loading suppliers list resolves AFTER first render, re-sync the id.
  useEffect(() => {
    if (editing && supplierId === '' && suppliers.data?.data?.length) {
      const list = suppliers.data.data;
      const firstName = (pickup.suppliers ?? '').split(',')[0]?.trim();
      const match = list.find((s: any) => s.name === firstName);
      if (match) setSupId(match.id);
    }
  }, [editing, suppliers.data, pickup]);

  const isOneTime = supplierId === '';

  const payload = () => ({
    scheduledDate: date,
    scheduledTime: time.length === 5 ? `${time}:00` : time,
    supplierId: typeof supplierId === 'number' ? supplierId : undefined,
    isOneTime,
    pickupType: isOneTime ? 'one_time' : (editing ? undefined : 'extra'),
    urgencyLevel: urgency,
    slotsCapacity,
    contactName:   contactName || null,
    contactPhone:  contactPhone || null,
    contactEmail:  contactEmail || null,
    pickupAddress: pickupAddress || null,
    pickupWindow:  pickupWindow || undefined,
    specialInstructions: specialInstructions || null,
    foodDescription: foodDescription || (isOneTime && donorName ? `One-time donor: ${donorName}` : null),
    estimatedQuantity: estimatedQuantity || null,
    mustPickupBy: mustPickupBy ? new Date(mustPickupBy).toISOString() : (editing ? null : undefined),
    notes: notes || null,
    // Edit-only: status change, and driver reassignment (full-replace) only when
    // the admin actually changed the selection — otherwise leave drivers intact.
    ...(editing
      ? {
          status: status || undefined,
          volunteerId: (typeof volunteerId === 'number' && volunteerId !== initialVId) ? volunteerId : undefined,
        }
      : { volunteerId: typeof volunteerId === 'number' ? volunteerId : undefined }),
  });

  const save = useMutation({
    mutationFn: () => editing
      ? adminCRUD.patchPickup(pickup.id, payload())
      : adminCRUD.createPickup(payload()),
    onSuccess: onDone,
  });
  const del = useMutation({
    mutationFn: () => adminCRUD.deletePickup(pickup.id),
    onSuccess: onDone,
  });

  // Quick action: put a pickup on the queue right now (today, this minute, urgent).
  // Only shown on the "add" flow — not when editing an existing pickup.
  function queueNow() {
    const n = new Date();
    const d = n.toISOString().slice(0, 10);
    const t = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    setDate(d);
    setTime(t);
    setUrgency('urgent');
    // Fire the mutation on the next tick so setState has committed.
    setTimeout(() => save.mutate(), 0);
  }

  return (
    <Modal title={editing ? `Edit pickup · ${pickup.suppliers || 'one-time'}` : 'Add one-time pickup'} onClose={onClose} wide>
      {!editing && (
        <div className="mb-4 rounded-[12px] border border-clay/40 bg-clay-soft/60 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-ink">Food is here right now?</div>
            <div className="text-[11.5px] text-muted">One click puts it on the queue for today · this minute · urgent. Fill any extra details below only if you want to.</div>
          </div>
          <button
            onClick={queueNow}
            disabled={save.isPending}
            className="haptic shrink-0 flex items-center gap-2 rounded-[10px] bg-clay text-paper font-bold text-[13px] px-4 py-2.5 shadow-ctag hover:brightness-110 disabled:opacity-60">
            <span className="text-[15px] leading-none">🟢</span>
            {save.isPending ? 'Adding…' : 'On the queue now'}
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>

        <Field label="Supplier (existing donor)" full>
          <select value={supplierId === '' ? '' : String(supplierId)}
                  onChange={(e) => setSupId(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputCls}>
            <option value="">— One-time donor (not in list) —</option>
            {(suppliers.data?.data ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}</option>
            ))}
          </select>
        </Field>

        {isOneTime && (
          <>
            <Field label="One-time donor name" full>
              <input value={donorName} onChange={(e) => setDonor(e.target.value)} placeholder="e.g. Cohen family simcha"
                     className={inputCls} />
            </Field>
            <Field label="Pickup address" full>
              <AddressAutocomplete value={pickupAddress} onChange={setAddr} placeholder="Start typing… suggestions from Google"
                                   className={inputCls} />
            </Field>
            <Field label="Contact name"><input value={contactName} onChange={(e) => setCN(e.target.value)} className={inputCls} /></Field>
            <Field label="Contact phone"><input value={contactPhone} onChange={(e) => setCP(e.target.value)} className={inputCls} /></Field>
          </>
        )}

        <Field label="Food description" full>
          <textarea rows={2} value={foodDescription} onChange={(e) => setFood(e.target.value)}
                    placeholder='e.g. "Catering trays, mostly chicken & rice"' className={inputCls} />
        </Field>
        <Field label="Estimated quantity">
          <input value={estimatedQuantity} onChange={(e) => setQty(e.target.value)} placeholder='e.g. "8 trays"' className={inputCls} />
        </Field>
        <Field label="Urgency">
          <select value={urgency} onChange={(e) => setUrgency(e.target.value as any)} className={inputCls}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>

        {editing && (
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              {['pending','scheduled','confirmed','in_progress','completed','cancelled','missed']
                .map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
        )}

        <Field label="Must pick up by">
          <input type="datetime-local" value={mustPickupBy} onChange={(e) => setMustBy(e.target.value)} className={inputCls} />
        </Field>

        <Field label="Drivers needed" full>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSlots((n) => Math.max(1, n - 1))}
                    className="haptic grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-muted hover:bg-cream">−</button>
            <span className="font-display font-bold text-[20px] text-forest w-6 text-center">{slotsCapacity}</span>
            <button type="button" onClick={() => setSlots((n) => Math.min(20, n + 1))}
                    className="haptic grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-forest hover:bg-cream">+</button>
            <span className="text-[12px] text-muted">
              {slotsCapacity === 1 ? 'single-driver pickup' : `${slotsCapacity}-driver pickup (large load)`}
            </span>
          </div>
        </Field>

        <Field label={editing ? 'Reassign driver' : 'Assign driver now (optional)'} full>
          <select value={volunteerId === '' ? '' : String(volunteerId)}
                  onChange={(e) => setVId(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputCls}>
            <option value="">{editing ? '— Leave drivers unchanged —' : '— Leave unassigned —'}</option>
            {(volunteers.data?.data ?? [])
              .filter((v: any) => !v.deletedAt && v.status !== 'inactive')
              .map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.firstName} {v.lastName}{v.phonePrimary ? ` · ${v.phonePrimary}` : ''}{v.locationArea ? ` · ${v.locationArea}` : ''}
                </option>
              ))}
          </select>
          {editing && <p className="text-[11px] text-muted mt-1">Choosing a driver replaces the current assignment. For multi-driver pickups, use “Assign driver” on the board to add/remove individually.</p>}
        </Field>

        <Field label="Pickup window"><input value={pickupWindow} onChange={(e) => setPW(e.target.value)} placeholder='e.g. "2–4 PM"' className={inputCls} /></Field>
        <Field label="Contact email"><input value={contactEmail} onChange={(e) => setCE(e.target.value)} placeholder="store@example.com" className={inputCls} /></Field>
        <Field label="Special instructions" full>
          <textarea rows={2} value={specialInstructions} onChange={(e) => setSI(e.target.value)}
                    placeholder="Gate code, loading dock, ask for manager…" className={inputCls} />
        </Field>

        <Field label="Notes" full>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything the driver needs to know" className={inputCls} />
        </Field>
      </div>

      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {editing ? (
          <button onClick={() => { if (confirm(`Delete this pickup? This removes it and any driver assignments.`)) del.mutate(); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete pickup'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={save.isPending} disabled={!date || !time}
                  onClick={() => save.mutate()} icon={<Plus size={14} />}>
            {editing ? 'Save changes' : 'Create pickup'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================== Change Password ============================

export function ChangePasswordPanel() {
  const [cur, setCur] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: async () => {
      const { auth } = await import('./api');
      return auth.changePassword(cur, pw1);
    },
    onSuccess: () => { setDone(true); setCur(''); setPw1(''); setPw2(''); },
  });
  const tooShort  = pw1.length > 0 && pw1.length < 8;
  const mismatch  = pw2.length > 0 && pw1 !== pw2;
  const canSubmit = cur.length > 0 && pw1.length >= 8 && pw1 === pw2 && !change.isPending;

  return (
    <div className="space-y-3 max-w-md">
      <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">Change my password</div>
      <p className="text-[13.5px] text-muted">
        Prove the current password, then pick a new one (8+ characters). After saving you stay logged in on this device.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) change.mutate(); }} className="space-y-3 mt-2">
        <Field label="Current password">
          <input type="password" autoComplete="current-password"
                 value={cur} onChange={(e) => setCur(e.target.value)}
                 className={inputCls} />
        </Field>
        <Field label="New password">
          <input type="password" autoComplete="new-password"
                 value={pw1} onChange={(e) => setPw1(e.target.value)}
                 className={inputCls} />
          {tooShort && <p className="text-clay text-[12px] mt-1">Must be at least 8 characters.</p>}
        </Field>
        <Field label="Confirm new password">
          <input type="password" autoComplete="new-password"
                 value={pw2} onChange={(e) => setPw2(e.target.value)}
                 className={inputCls} />
          {mismatch && <p className="text-clay text-[12px] mt-1">Passwords don't match.</p>}
        </Field>

        {change.error && <p className="text-clay text-[13px]">{(change.error as Error).message}</p>}
        {done       && <p className="text-forest text-[13px] font-bold">✓ Password updated.</p>}

        <Button size="md" variant="forest" loading={change.isPending}
                disabled={!canSubmit} onClick={() => change.mutate()}>
          Save new password
        </Button>
      </form>
    </div>
  );
}

// =============================== Registration link card =====================

/**
 * Public sign-up URL surfaced inside the portal so the recruiter can hand it
 * out (paste into a message, open it on a phone, point a prospect at it).
 * Copy + Open buttons; switches text by kind.
 */
type LinkKind = 'volunteer' | 'supplier' | 'one-time-pickup' | 'steady-pickup';
export function RegistrationLinkCard({ kind }: { kind: LinkKind }) {
  const path =
    kind === 'volunteer' ? 'vol-registration' :
    kind === 'supplier'  ? 'sup-registration' :
    kind === 'one-time-pickup' ? 'one-time-pickup' :
                                 'steady-pickup';
  const url = `${window.location.origin}/rescue/${path}`;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  const label =
    kind === 'volunteer' ? 'Share this link with prospective drivers — they fill out the volunteer questionnaire and the entry lands in this list.' :
    kind === 'supplier'  ? 'Share this link with prospective donor stores — they fill out the supplier questionnaire and the entry lands in this list.' :
    kind === 'one-time-pickup' ? 'Share this link with someone with food ready right now — they fill in the details and the pickup appears in the portal as pending.' :
                                 'Share this link with a donor who can give consistently — they pick days + time and the steady template appears as pending.';
  const accent =
    kind === 'volunteer' ? 'border-forest/40 bg-sage' :
    kind === 'supplier'  ? 'border-clay/30 bg-clay-soft/40' :
    kind === 'one-time-pickup' ? 'border-amber/40 bg-amber-soft' :
                                 'border-sky/30 bg-sky-soft';
  const dotColor =
    kind === 'volunteer' ? 'bg-forest' :
    kind === 'supplier'  ? 'bg-clay' :
    kind === 'one-time-pickup' ? 'bg-amber' :
                                 'bg-sky';
  const heading =
    kind === 'volunteer' ? 'Volunteer sign-up link' :
    kind === 'supplier'  ? 'Supplier sign-up link' :
    kind === 'one-time-pickup' ? 'One-time pickup link' :
                                 'Steady pickup link';
  return (
    <div className={cx('rounded-[14px] border-2 px-4 py-3 mb-3', accent)}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cx('inline-block h-2 w-2 rounded-full', dotColor)} />
        <div className="text-[12px] font-extrabold uppercase tracking-[.06em] text-ink">{heading}</div>
      </div>
      <p className="text-[12.5px] text-muted mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate bg-paper border border-line rounded-[10px] px-3 py-2 text-[12.5px] font-mono text-ink">
          {url}
        </code>
        <button onClick={copy}
                className="haptic shrink-0 bg-forest text-paper text-[12.5px] font-bold rounded-[10px] px-3 py-2">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <a href={url} target="_blank" rel="noreferrer"
           className="haptic shrink-0 bg-paper border border-line text-ink text-[12.5px] font-bold rounded-[10px] px-3 py-2 hover:border-forest">
          Open
        </a>
      </div>
    </div>
  );
}

// =============================== Broadcast ==================================

const AUDIENCE_LABEL: Record<string, string> = {
  all_drivers:   'All drivers',
  all_stores:    'All stores',
  all_users:     'Everyone (drivers + stores + office)',
  specific_user: 'One specific person',
};

/**
 * SMS Inbox — surfaces recent inbound SMS replies (the [SMS]-prefixed rows
 * the webhook threads into direct_messages) so a coordinator can eyeball
 * driver traffic without hunting through every driver chat. Clicking a row
 * opens the full ChatThread with that driver — replies from that thread go
 * back to the driver as SMS via the same notifyDirectRecipient path used
 * by the driver-chat tab.
 */
export function SmsInboxPanel() {
  const [selected, setSelected] = useState<{ userId: number; name: string; phone: string | null } | null>(null);
  const inbox = useQuery({
    queryKey: ['sms-inbox'],
    queryFn: () => smsInbox.list(),
    refetchInterval: 20_000,
  });

  if (selected) {
    return (
      <div className="flex flex-col h-[calc(100vh-180px)]">
        <button onClick={() => setSelected(null)} className="self-start text-[12px] text-forest font-bold mb-2 hover:underline">
          ← Back to SMS inbox
        </button>
        <ChatThread userId={selected.userId} title={selected.name}
                    subtitle={selected.phone ? `SMS · ${selected.phone}` : 'SMS'} color="#3E6F8E" />
      </div>
    );
  }

  const rows = inbox.data?.data ?? [];
  // Group by sender so the panel shows one line per driver — most recent
  // first, with the message body as a preview. Clicking opens the full
  // thread with that driver.
  type Row = typeof rows[number];
  const bySender = new Map<number, Row>();
  for (const r of rows) if (!bySender.has(r.from_user_id)) bySender.set(r.from_user_id, r);
  const threads = Array.from(bySender.values());

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">
        Recent SMS replies · last 30 days
      </div>
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12px] text-forest font-bold">
        These are text-message replies drivers sent to our office number. Tap one to reply — the driver receives your reply as an SMS.
      </div>
      {inbox.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {!inbox.isLoading && threads.length === 0 && (
        <div className="text-[13px] text-muted">No SMS replies in the last 30 days.</div>
      )}
      {threads.map((r) => {
        const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown driver';
        const body = String(r.body || '').replace(/^\[SMS\]\s*/, '');
        return (
          <button key={r.id}
                  onClick={() => setSelected({ userId: r.from_user_id, name, phone: r.phone })}
                  className="haptic w-full text-left rounded-[14px] border border-line bg-paper p-3 hover:border-forest transition">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-sky/20 text-sky flex items-center justify-center shrink-0">
                <MessageSquare size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13.5px] font-extrabold text-ink truncate">{name}</div>
                  <div className="text-[11px] text-muted shrink-0">{formatSmsAgo(r.created_at)}</div>
                </div>
                {r.phone && (
                  <div className="flex items-center gap-1 text-[11px] text-muted mt-0.5">
                    <Phone size={10} /> {r.phone}
                  </div>
                )}
                <div className="text-[12.5px] text-ink/85 mt-1 line-clamp-2">{body}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatSmsAgo(iso: string) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Broadcast panel — coordinator sends a custom notification to one person or
 * a whole audience (all drivers, all stores, everyone). Types are reusable
 * templates: define once and pick from the dropdown next time. Editing the
 * title/body before sending is always allowed.
 */
export function BroadcastPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'send' | 'types'>('send');

  const typesQ = useQuery<{ data: NotificationType[] }>({
    queryKey: ['notification-types'],
    queryFn:  () => broadcast.listTypes(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <TabBtn active={tab === 'send'}  onClick={() => setTab('send')}  icon={<Send size={13} />}      label="Send" />
        <TabBtn active={tab === 'types'} onClick={() => setTab('types')} icon={<Megaphone size={13} />} label="Types" />
      </div>
      {tab === 'send'
        ? <SendBroadcast types={typesQ.data?.data ?? []} typesLoading={typesQ.isLoading} />
        : <TypesLibrary types={typesQ.data?.data ?? []} loading={typesQ.isLoading}
                        refetch={() => qc.invalidateQueries({ queryKey: ['notification-types'] })} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
            className={cx('haptic flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-bold rounded-t-[8px]',
                          active ? 'text-forest border-b-2 border-forest bg-sage/40' : 'text-muted hover:text-ink')}>
      {icon} {label}
    </button>
  );
}

function SendBroadcast({ types, typesLoading }: { types: NotificationType[]; typesLoading: boolean }) {
  const [typeId, setTypeId] = useState<number | ''>('');
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [audience, setAudience] = useState<'all_drivers' | 'all_stores' | 'all_users' | 'specific_user'>('all_drivers');
  const [targetUserId, setTUI]  = useState<number | ''>('');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);

  // When admin picks a saved type, pre-fill title/body/audience from it.
  useEffect(() => {
    if (typeId === '') return;
    const t = types.find((x) => x.id === Number(typeId));
    if (!t) return;
    setTitle(t.defaultTitle);
    setBody(t.defaultBody);
    setAudience(t.audienceType);
  }, [typeId, types]);

  const users = useQuery<{ data: any[] }>({
    queryKey: ['broadcast-user-picker'],
    // Correct endpoint is /api/admin-users (dash, not slash). The wrong path
    // returned 404 → the "Pick a user" dropdown was empty.
    queryFn:  () => api<{ data: any[] }>('/api/admin-users'),
    enabled:  audience === 'specific_user',
  });

  const send = useMutation({
    mutationFn: () => broadcast.send({
      notificationTypeId: typeId === '' ? null : Number(typeId),
      title, body, audienceType: audience,
      targetUserId: audience === 'specific_user' ? (targetUserId === '' ? null : Number(targetUserId)) : null,
    }),
    onSuccess: (res: any) => {
      setFlash({ tone: 'ok', msg: `Sent to ${res?.data?.sent ?? '?'} user${(res?.data?.sent ?? 0) === 1 ? '' : 's'}.` });
      setTitle(''); setBody(''); setTypeId('');
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });

  const disabled = !title.trim() || !body.trim() || send.isPending ||
                   (audience === 'specific_user' && !targetUserId);

  return (
    <div className="space-y-3 max-w-xl">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12px] text-forest">
        <span className="font-bold">Broadcast</span> — sends a push notification to the audience below. Pick a saved type to pre-fill, or type a one-off message.
      </div>

      <Field label="Type (optional — pre-fills below)" full>
        <select value={typeId === '' ? '' : String(typeId)}
                onChange={(e) => setTypeId(e.target.value === '' ? '' : Number(e.target.value))}
                className={inputCls}>
          <option value="">— One-off message (no template) —</option>
          {typesLoading && <option disabled>Loading types…</option>}
          {types.filter((t) => t.active).map((t) => (
            <option key={t.id} value={t.id}>{t.name} · {AUDIENCE_LABEL[t.audienceType] ?? t.audienceType}</option>
          ))}
        </select>
      </Field>

      <Field label="Audience" full>
        <select value={audience} onChange={(e) => setAudience(e.target.value as any)} className={inputCls}>
          {(Object.keys(AUDIENCE_LABEL) as Array<keyof typeof AUDIENCE_LABEL>).map((k) => (
            <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>
          ))}
        </select>
      </Field>

      {audience === 'specific_user' && (
        <Field label="Recipient" full>
          <select value={targetUserId === '' ? '' : String(targetUserId)}
                  onChange={(e) => setTUI(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputCls}>
            <option value="">— Pick a user —</option>
            {(users.data?.data ?? []).map((u: any) => (
              <option key={u.id} value={u.id}>{u.first_name ?? u.firstName} {u.last_name ?? u.lastName} · {u.role}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Title" full>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls}
               placeholder="e.g. Weather alert - deliveries delayed" maxLength={200} />
      </Field>

      <Field label="Message" full>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls}
                  placeholder="Everything the recipient needs to know. Line breaks are OK." maxLength={2000} />
      </Field>

      {flash && (
        <div className={cx('rounded-[10px] px-3 py-2 text-[12.5px] font-bold',
                           flash.tone === 'ok' ? 'bg-sage text-forest' : 'bg-clay-soft text-clay')}>
          {flash.msg}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="forest" icon={<Send size={13} />}
                onClick={() => { setFlash(null); send.mutate(); }} disabled={disabled}>
          {send.isPending ? 'Sending…' : 'Send now'}
        </Button>
      </div>
    </div>
  );
}

function TypesLibrary({ types, loading, refetch }: { types: NotificationType[]; loading: boolean; refetch: () => void }) {
  const [editing, setEditing] = useState<NotificationType | 'new' | null>(null);
  const del = useMutation({
    mutationFn: (id: number) => broadcast.deleteType(id),
    onSuccess: refetch,
  });
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {loading ? 'Loading…' : `${types.length} saved type${types.length === 1 ? '' : 's'}`}
        </div>
        <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New type</Button>
      </div>
      <div className="space-y-2">
        {types.map((t) => (
          <div key={t.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Bell size={13} className="text-forest" />
                <div className="font-bold text-[13.5px]">{t.name}</div>
                {!t.active && <span className="text-[10px] font-bold uppercase text-muted bg-line rounded-full px-2 py-0.5">inactive</span>}
                <span className="text-[10px] font-bold uppercase text-muted bg-cream rounded-full px-2 py-0.5">
                  {AUDIENCE_LABEL[t.audienceType] ?? t.audienceType}
                </span>
              </div>
              <div className="text-[11.5px] text-muted mt-1"><b>Title:</b> {t.defaultTitle}</div>
              <div className="text-[11.5px] text-muted mt-0.5 line-clamp-2 whitespace-pre-line">{t.defaultBody}</div>
              {t.description && <div className="text-[10.5px] text-muted mt-1 italic">{t.description}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setEditing(t)} title="Edit"
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                <Pencil size={14} />
              </button>
              <button onClick={() => { if (confirm(`Delete "${t.name}"?`)) del.mutate(t.id); }} title="Delete"
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!loading && types.length === 0 && (
          <div className="text-[13px] text-muted italic p-4 text-center border border-dashed border-line rounded-[14px]">
            No saved types yet. Click "New type" to add your first template.
          </div>
        )}
      </div>
      {editing && (
        <TypeEditor row={editing === 'new' ? null : editing}
                    onDone={() => { setEditing(null); refetch(); }}
                    onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

function TypeEditor({ row, onDone, onCancel }: { row: NotificationType | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(row?.name ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [defaultTitle, setTitle] = useState(row?.defaultTitle ?? '');
  const [defaultBody, setBody]   = useState(row?.defaultBody ?? '');
  const [audienceType, setAudience] = useState<NotificationType['audienceType']>(row?.audienceType ?? 'all_drivers');
  const [active, setActive] = useState(row?.active ?? true);

  const save = useMutation({
    mutationFn: () => row
      ? broadcast.updateType(row.id, { name, description, defaultTitle, defaultBody, audienceType, active })
      : broadcast.createType({ name, description, defaultTitle, defaultBody, audienceType, active }),
    onSuccess: onDone,
  });

  return (
    <Modal title={row ? `Edit "${row.name}"` : 'New notification type'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls}
                 placeholder="e.g. Weather alert" maxLength={120} />
        </Field>
        <Field label="Short description" full>
          <input value={description ?? ''} onChange={(e) => setDescription(e.target.value)} className={inputCls}
                 placeholder="What this type is for (internal note)" maxLength={500} />
        </Field>
        <Field label="Default audience" full>
          <select value={audienceType} onChange={(e) => setAudience(e.target.value as any)} className={inputCls}>
            {(Object.keys(AUDIENCE_LABEL) as Array<keyof typeof AUDIENCE_LABEL>).map((k) => (
              <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Default title" full>
          <input value={defaultTitle} onChange={(e) => setTitle(e.target.value)} className={inputCls}
                 placeholder="Weather alert - deliveries delayed" maxLength={200} />
        </Field>
        <Field label="Default message" full>
          <textarea value={defaultBody} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls}
                    placeholder="Longer body - the coordinator can still edit before sending." maxLength={2000} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] col-span-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-forest h-4 w-4" />
          Active - shows up in the Send picker
        </label>
      </div>
      {save.error && <p className="text-clay text-[12px] mt-3">{(save.error as Error).message}</p>}
      <div className="flex items-center justify-end gap-2 mt-4">
        <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="forest" icon={<Check size={13} />}
                onClick={() => save.mutate()}
                disabled={!name.trim() || !defaultTitle.trim() || !defaultBody.trim() || save.isPending}>
          {save.isPending ? 'Saving…' : (row ? 'Save changes' : 'Create type')}
        </Button>
      </div>
    </Modal>
  );
}
