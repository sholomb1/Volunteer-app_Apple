/**
 * Public one-time pickup intake — a donor / office link fills this in.
 * Aug 20 rewrite: mirrors the portal's QuickPickupModal (portal-sections.tsx
 * ~line 2259) field-for-field per client spec. Ordering:
 *   1. Date            5. Contact Name        9.  Drivers Needed          13. Send to [group]
 *   2. Time            6. Contact Phone       10. Assign Driver(s) opt    14. More options
 *   3. Supplier        7. Pickup Address      11. Pickup Instructions opt 15. Test pickup
 *   4. Store/Hall      8. Pickup Details      12. Send to Drivers
 *
 * Pickers are backed by three PUBLIC read-only endpoints
 * (/api/public/one-time-pickup/{suppliers,volunteers,groups}) so nothing on
 * this page requires a JWT — they return only id + display name (+ unit#
 * for volunteers, + city/address for suppliers). Phone / email are never
 * exposed to the public bundle.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { cx } from '../design';
import { Field, FormShell, Section, SubmitBar, ThankYou } from '../registration-fields';
import { AddressAutocomplete } from '../address-autocomplete';

// ─── Local types matching the shape returned by the public /one-time-pickup
// reference endpoints. Field lists are deliberately narrow — the public
// bundle never sees phones or emails for volunteers.
type PublicSupplier  = { id: number | string; name: string; addressLine1: string | null; city: string | null };
type PublicVolunteer = { id: number | string; firstName: string | null; lastName: string | null; unitNumber: number | null };
type PublicGroup     = { id: number; name: string; is_default_broadcast: boolean; member_count: number };

// Shared classnames — match the QuickPickupModal inputs so the two forms
// feel identical to the coordinator who tests both.
const inputCls =
  'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] ' +
  'focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';

// Tier-2 fix #6 (Aug 21): convert a datetime-local "YYYY-MM-DDTHH:MM" string
// that the user typed *in NY-local time* into a UTC ISO string. The naive
// `new Date(dtl).toISOString()` interprets the string in the browser's own
// zone, which loses an hour (or gains one) for callers in other timezones.
function nyLocalDatetimeToISO(dtl: string): string | null {
  if (!dtl) return null;
  const [datePart, timePart] = dtl.split('T');
  if (!datePart || !timePart) return null;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, m] = timePart.split(':').map(Number);
  if (![y, mo, d, h, m].every((n) => Number.isFinite(n))) return null;
  // Baseline instant, treating the naive parts as if they were UTC.
  const asUtc = Date.UTC(y, mo - 1, d, h, m);
  // Format that instant in NY tz — the difference between the intended
  // parts and what NY renders is exactly the NY→UTC offset at that instant.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(asUtc));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const nyMs = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  // Aug 21 tier-2 #6: shift by that offset so the returned ISO points at
  // the actual UTC moment corresponding to the intended NY-local wall time.
  return new Date(asUtc + (asUtc - nyMs)).toISOString();
}

// Tier-2 fix #7 (Aug 21): a permissive phone-number check that mirrors the
// backend's normalize rule — 10 digits, or 11 digits starting with '1',
// with any mix of spaces/dashes/parens.
const PHONE_OK = /^\+?1?[\s().-]*\d{3}[\s().-]*\d{3}[\s().-]*\d{4}$/;

export function OneTimePickupRegistration() {
  // ── NY-local today / now defaults (abc899, Aug 20 → tier-2 #5, Aug 21).
  // Date part unchanged (Intl en-CA already returns YYYY-MM-DD in NY tz).
  // Time part was still using browser-local getHours/getMinutes; on a Pacific
  // laptop that would seed the picker three hours behind NY. Use Intl to
  // read the NY-local hour+minute for the same instant.
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const nyTimeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const nyHH = nyTimeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const nyMM = nyTimeParts.find((p) => p.type === 'minute')?.value ?? '00';
  // Intl 'en-US' with hour12:false can return "24" for midnight in some
  // engines — clamp to "00" so the <input type=time> stays valid.
  const nowHHMM = `${nyHH === '24' ? '00' : nyHH}:${nyMM}`;

  // ── Reference data (public, no auth).
  const [suppliers, setSuppliers]   = useState<PublicSupplier[]>([]);
  const [volunteers, setVolunteers] = useState<PublicVolunteer[]>([]);
  const [groups, setGroups]         = useState<PublicGroup[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const s: any = await api('/api/public/one-time-pickup/suppliers');
        setSuppliers(Array.isArray(s?.data) ? s.data : []);
      } catch { /* form still usable without the supplier picker */ }
      try {
        const v: any = await api('/api/public/one-time-pickup/volunteers');
        setVolunteers(Array.isArray(v?.data) ? v.data : []);
      } catch { /* still usable — assignment stays blank */ }
      try {
        const g: any = await api('/api/public/one-time-pickup/groups');
        setGroups(Array.isArray(g?.data) ? g.data : []);
      } catch { /* still usable — server defaults to standard group */ }
    })();
  }, []);
  const defaultGroup = useMemo(
    () => groups.find((g) => g.is_default_broadcast) ?? groups[0],
    [groups],
  );

  // ── Form state (order matches the client spec + QuickPickupModal).
  const [date, setDate]           = useState(today);
  const [time, setTime]           = useState(nowHHMM);
  const [supplierId, setSupId]    = useState<number | ''>('');
  const [donorName, setDonor]     = useState('');
  const [contactName, setCN]      = useState('');
  const [contactPhone, setCP]     = useState('');
  const [address, setAddress]     = useState('');
  const [pickupDetails, setPD]    = useState('');
  const [driversNeeded, setDN]    = useState<number>(1);
  const [driverPicks, setDPicks]  = useState<Array<number | ''>>(['']);
  const [pickupInstructions, setPI] = useState('');
  const [sendToDrivers, setSTD]   = useState<boolean>(true);
  const [smsGroupId, setGid]      = useState<number | ''>('');
  const [showMore, setShowMore]   = useState(false);
  const [urgency, setUrgency]     = useState<'normal' | 'urgent'>('normal');
  const [mustPickupBy, setMPB]    = useState<string>('');
  const [isTest, setIsTest]       = useState<boolean>(false);
  // Tier-2 fix #9 (Aug 21): hidden honeypot — legit browsers leave it empty
  // because it's visually hidden; naive bots that walk the DOM auto-fill it.
  const [website, setWebsite]     = useState<string>('');

  // Once the groups list loads, pre-select the default broadcast group so
  // the "Send to" dropdown is never a stranded empty state (QuickPickupModal
  // does the same thing in its own useEffect).
  useEffect(() => { if (smsGroupId === '' && defaultGroup) setGid(defaultGroup.id); }, [defaultGroup?.id]);

  // Keep the per-slot driver-picker array in sync with the Drivers Needed
  // counter — add/remove trailing rows so setting 3 drivers shows 3 pickers.
  useEffect(() => {
    setDPicks((prev) => {
      const next = prev.slice(0, driversNeeded);
      while (next.length < driversNeeded) next.push('');
      return next;
    });
  }, [driversNeeded]);

  // Track which contact / address / donor fields the user has personally
  // touched so an auto-fill from a supplier pick doesn't clobber their
  // typing (mirrors QuickPickupModal's touchedRef pattern).
  const touchedRef = useRef({ donor: false, addr: false, cn: false, cp: false });
  useEffect(() => {
    if (typeof supplierId !== 'number') return;
    const s = suppliers.find((r) => Number(r.id) === supplierId);
    if (!s) return;
    if (!touchedRef.current.donor && !donorName) setDonor(String(s.name || ''));
    if (!touchedRef.current.addr && !address) {
      const line = [s.addressLine1, s.city].filter(Boolean).join(', ');
      if (line) setAddress(line);
    }
    // Public callers can't see contact_name / contact_phone from suppliers,
    // so those two stay whatever the donor types.
  }, [supplierId, suppliers]);

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Tier-2 fix #9 (Aug 21): honeypot — silently drop bot submissions so
    // they get a fake success page and don't retry with a different pattern.
    if (website.trim()) { setDone(true); return; }
    if (!date || !time)           { setErr('Date and time are required.'); return; }
    if (!donorName && !contactName) { setErr('Enter a Store/Hall Name or a Contact Name.'); return; }
    if (!address)                 { setErr('Pickup address is required.'); return; }
    if (!contactPhone)            { setErr('Contact phone is required.'); return; }
    // Tier-2 fix #7 (Aug 21): reject "N/A" and other junk. Match ~US phone
    // shapes with optional country code / punctuation.
    if (!PHONE_OK.test(contactPhone.trim())) {
      setErr('Please enter a valid 10-digit phone number (e.g. 845-555-1234).');
      return;
    }
    setBusy(true); setErr(null);
    // De-duplicate driver picks and drop the empty rows before sending.
    const assignedVolunteerIds = Array.from(new Set(
      driverPicks.filter((v): v is number => typeof v === 'number'),
    ));
    try {
      await api('/api/public/one-time-pickup', {
        method: 'POST',
        body: JSON.stringify({
          donorName:            donorName || contactName,
          contactName:          contactName || null,
          address,
          contactPhone,
          readyDate:            date,
          readyTime:            time,
          pickupDetails:        pickupDetails || '',
          pickupInstructions:   pickupInstructions || '',
          supplierId:           typeof supplierId === 'number' ? supplierId : null,
          driversNeeded,
          assignedVolunteerIds,
          smsGroupId:           (sendToDrivers && typeof smsGroupId === 'number') ? smsGroupId : null,
          sendToDrivers,
          urgencyLevel:         urgency,
          // Tier-2 fix #6 (Aug 21): datetime-local reads as NY-local wall
          // time — convert to a proper UTC ISO so the server stores the
          // right instant regardless of the browser's timezone.
          mustPickupBy:         nyLocalDatetimeToISO(mustPickupBy),
          isTest,
          // Tier-2 fix #9 (Aug 21): honeypot forwarded so the server can also
          // drop it and log the attempt. Legit clients send an empty string.
          website:              website || '',
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Submission failed'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="supplier" />;

  const groupOptions = groups;

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · One-time pickup"
      title="I have food ready for pickup"
      lede="Tell us what you've got, when, and where — a Zeh L'Zeh coordinator will arrange the pickup."
    >
      <form onSubmit={submit}>
        {/* Tier-2 fix #9 (Aug 21): honeypot. Absolutely-positioned off-screen
            + aria-hidden + tabIndex=-1 + autocomplete=off so legit users
            never see it, but naive bots that walk the DOM fill it in. Server
            silently drops any submission with this field non-empty. */}
        <div aria-hidden="true"
             style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="ot-website">Website (leave empty)</label>
          <input id="ot-website" type="text" name="website" tabIndex={-1} autoComplete="off"
                 value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <Section title="Pickup">
          {/* 1 & 2 — Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Time">
              <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </Field>
          </div>

          {/* 3 — Supplier picker (public list; optional). */}
          <Field label="Supplier" optional
                 help="If this pickup is from a store or donor we already have, pick them here to auto-fill the name and address.">
            <SupplierPicker
              suppliers={suppliers}
              value={supplierId}
              onChange={(v) => setSupId(v)}
            />
          </Field>

          {/* 4 — Store / Hall Name (the public-facing label on driver SMS). */}
          <Field label="Store / Hall Name"
                 help="Only fill this if it's actually a store, business, or hall — this name is sent to volunteers. For individual donors, use Contact Name instead.">
            <input value={donorName}
                   onChange={(e) => { touchedRef.current.donor = true; setDonor(e.target.value); }}
                   placeholder="e.g. Kroger Airmont, Bites Cafe, Chabad Center"
                   className={inputCls} />
          </Field>

          {/* 5 & 6 — Contact Name + Contact Phone */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Name">
              <input value={contactName}
                     onChange={(e) => { touchedRef.current.cn = true; setCN(e.target.value); }}
                     placeholder="Person we can reach if the driver has trouble"
                     className={inputCls} />
            </Field>
            <Field label="Contact Phone">
              <input required value={contactPhone}
                     onChange={(e) => { touchedRef.current.cp = true; setCP(e.target.value); }}
                     placeholder="(845) 555-1234"
                     className={inputCls} />
            </Field>
          </div>

          {/* 7 — Pickup Address (Google Places autocomplete via server proxy). */}
          <Field label="Pickup Address">
            <AddressAutocomplete value={address}
                                 onChange={(v) => { touchedRef.current.addr = true; setAddress(v); }}
                                 placeholder="Start typing… suggestions from Google"
                                 className={inputCls} />
          </Field>

          {/* 8 — Pickup Details (goes in food_description column). */}
          <Field label="Pickup Details" optional>
            <textarea rows={2} value={pickupDetails} onChange={(e) => setPD(e.target.value)}
                      placeholder='e.g. "8 catering trays, mostly chicken & rice"'
                      className={cx(inputCls, 'min-h-[64px]')} />
          </Field>
        </Section>

        <Section title="Drivers">
          {/* 9 — Drivers Needed (+/− stepper, 1–5) */}
          <Field label="Drivers Needed">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setDN((n) => Math.max(1, n - 1))}
                      className="haptic grid h-10 w-10 place-items-center rounded-full border border-line bg-paper text-muted hover:bg-cream">−</button>
              <span className="font-display font-bold text-[22px] text-forest w-8 text-center">{driversNeeded}</span>
              <button type="button" onClick={() => setDN((n) => Math.min(5, n + 1))}
                      className="haptic grid h-10 w-10 place-items-center rounded-full border border-line bg-paper text-forest hover:bg-cream">+</button>
              <span className="text-[12.5px] text-muted">
                {driversNeeded === 1 ? 'single-driver pickup' : `${driversNeeded}-driver pickup`}
              </span>
            </div>
          </Field>

          {/* 10 — Assign Driver(s) — one picker per slot, all optional */}
          <Field label="Assign Driver(s)" optional
                 help="Leave blank to let the system auto-assign when the pickup goes out.">
            <div className="space-y-2">
              {driverPicks.map((val, i) => (
                <VolunteerPicker
                  key={i}
                  volunteers={volunteers}
                  value={val}
                  onChange={(v) => setDPicks((prev) => prev.map((x, idx) => idx === i ? v : x))}
                  placeholder={`Driver ${i + 1} — leave blank to auto-fill`}
                />
              ))}
            </div>
          </Field>

          {/* 11 — Combined Pickup Instructions / Notes */}
          <Field label="Pickup Instructions / Notes" optional
                 help="One place for access notes, gate codes, loading dock, anything else the driver needs to know.">
            <textarea rows={3} value={pickupInstructions} onChange={(e) => setPI(e.target.value)}
                      placeholder='e.g. "Loading dock on the side. Ring the bell twice. Gate code 4567."'
                      className={cx(inputCls, 'min-h-[80px]')} />
          </Field>
        </Section>

        <Section title="Broadcast">
          {/* 12 & 13 — Send to Drivers gate + Send to [group] dropdown */}
          <div className="rounded-[12px] border border-forest/30 bg-sage/40 px-3 py-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sendToDrivers} onChange={(e) => setSTD(e.target.checked)}
                     className="accent-forest h-4 w-4" />
              <span className="text-[14px] font-bold text-ink">Send to drivers</span>
            </label>
            {sendToDrivers && groupOptions.length > 0 && (
              <div className="mt-2 flex items-center gap-2 pl-6">
                <span className="text-[12px] text-muted shrink-0">Send to</span>
                <select value={smsGroupId === '' ? '' : String(smsGroupId)}
                        onChange={(e) => setGid(e.target.value === '' ? '' : Number(e.target.value))}
                        className={cx(inputCls, 'py-1.5 text-[13px] flex-1')}>
                  {groupOptions.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.member_count})</option>
                  ))}
                </select>
              </div>
            )}
            {!sendToDrivers && (
              <div className="mt-2 pl-6 text-[12px] text-muted italic">
                Pickup will land in the coordinator queue only — no SMS goes out.
              </div>
            )}
          </div>

          {/* 14 — More options (Urgency + Must Pick Up By, collapsed) */}
          <div>
            <button type="button" onClick={() => setShowMore((v) => !v)}
                    className="haptic text-[13px] font-bold text-forest hover:underline">
              {showMore ? '− Hide more options' : '+ More options'}
            </button>
            {showMore && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Urgency">
                  <select value={urgency} onChange={(e) => setUrgency(e.target.value as any)} className={inputCls}>
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </Field>
                <Field label="Must Pick Up By">
                  <input type="datetime-local" value={mustPickupBy} onChange={(e) => setMPB(e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}
          </div>

          {/* 15 — Test pickup checkbox (xyz122) */}
          <label className="flex items-start gap-2 rounded-[10px] border border-amber/40 bg-amber/10 px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)}
                   className="mt-0.5 accent-amber h-4 w-4" />
            <span>
              <span className="text-[13px] font-bold text-ink">Test pickup (won't send SMS or appear to drivers)</span>
              <span className="block text-[11.5px] text-muted mt-0.5">
                Runs the create + broadcast pipeline end-to-end but logs the intended message body to <b>/admin/test-broadcasts</b> instead of texting real drivers. Use for QA — the pickup stays on the board with a TEST badge but never reaches drivers.
              </span>
            </span>
          </label>
        </Section>

        {err && <p className="text-clay text-[13px] mt-4 font-bold">{err}</p>}
        <SubmitBar busy={busy} label={isTest ? 'Create test pickup' : 'Submit pickup'} />
      </form>
    </FormShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SupplierPicker — public analogue of the portal's SupplierComboboxWithAdd
// (portal-sections.tsx). Search-as-you-type dropdown of the public list;
// no "add new" action (that would require auth). Includes an explicit
// "One-time donor (not in list)" clear-out row so the user can un-pick.
// ─────────────────────────────────────────────────────────────────────────
function SupplierPicker({ suppliers, value, onChange }: {
  suppliers: PublicSupplier[]; value: number | ''; onChange: (v: number | '') => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current) return;
      if (!wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const selected = suppliers.find((s) => Number(s.id) === Number(value));
  const displayValue = open ? q : (selected ? `${selected.name}${selected.city ? ` · ${selected.city}` : ''}` : '');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = suppliers.filter((s) => !!s?.name);
    if (!t) return all.slice(0, 200);
    return all.filter((s) => `${s.name} ${s.city ?? ''}`.toLowerCase().includes(t)).slice(0, 60);
  }, [q, suppliers]);
  return (
    <div className="relative" ref={wrap}>
      <input value={displayValue}
             onFocus={() => { setOpen(true); setQ(''); }}
             onChange={(e) => { setOpen(true); setQ(e.target.value); }}
             placeholder={suppliers.length === 0 ? 'Loading suppliers…' : 'Type to search suppliers'}
             className={inputCls} />
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-[300px] overflow-y-auto rounded-[10px] border border-line bg-paper shadow-lift">
          <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); setQ(''); }}
                  className="w-full text-left px-3 py-2 text-[13px] font-bold text-muted hover:bg-cream/60 border-b border-line">
            — One-time donor (not in list) —
          </button>
          {list.map((s) => (
            <button key={s.id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); onChange(Number(s.id)); setOpen(false); setQ(''); }}
                    className={cx('w-full text-left px-3 py-2 text-[13.5px] hover:bg-cream/60 border-b border-line last:border-b-0',
                                  Number(s.id) === Number(value) && 'bg-sage/40 font-bold')}>
              {s.name}
              {s.city ? <span className="text-muted"> · {s.city}</span> : null}
            </button>
          ))}
          {list.length === 0 && (
            <div className="px-3 py-3 text-[13px] text-muted italic">No matches.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// VolunteerPicker — public analogue of the internal one in portal-sections.
// Shows first + last + unit# only (public API never returns phone/email).
// ─────────────────────────────────────────────────────────────────────────
function VolunteerPicker({ volunteers, value, onChange, placeholder }: {
  volunteers: PublicVolunteer[]; value: number | ''; onChange: (v: number | '') => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current) return;
      if (!wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const selected = volunteers.find((v) => Number(v.id) === Number(value));
  const label = selected
    ? `${selected.firstName ?? ''} ${selected.lastName ?? ''}`.trim()
      + (selected.unitNumber != null ? ` #${selected.unitNumber}` : '')
    : '';
  const qq = q.trim().toLowerCase();
  // Tier-2 fix #8 (Aug 21): raise the picker cap from 200 → 2000 so drivers
  // late in the alphabet are actually visible when nothing's been typed yet.
  // The endpoint returns the whole active roster anyway; the cap was only a
  // guard against runaway DOM, and 2000 rows still renders comfortably.
  const filtered = !qq
    ? volunteers.slice(0, 2000)
    : volunteers.filter((v) => {
        const nm = `${v.firstName ?? ''} ${v.lastName ?? ''}`.toLowerCase();
        const un = v.unitNumber != null ? String(v.unitNumber) : '';
        return nm.includes(qq) || un === qq;
      }).slice(0, 2000);
  return (
    <div className="relative" ref={wrap}>
      <input type="text"
             value={open ? q : label}
             placeholder={placeholder}
             onFocus={() => { setOpen(true); setQ(''); }}
             onChange={(e) => { setQ(e.target.value); setOpen(true); }}
             className={inputCls} />
      {open && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-64 overflow-auto bg-paper border border-line rounded-[10px] shadow-lift">
          <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-[12.5px] text-muted hover:bg-cream/70 border-b border-line">
            {placeholder}
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-muted italic">No matches</div>
          ) : filtered.map((v) => {
            const nm = `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim();
            const un = v.unitNumber != null ? ` #${v.unitNumber}` : '';
            return (
              <button key={v.id} type="button"
                      onMouseDown={(e) => { e.preventDefault(); onChange(Number(v.id)); setOpen(false); }}
                      className={cx('w-full text-left px-3 py-2 text-[13.5px] hover:bg-cream/70',
                                    Number(v.id) === Number(value) && 'bg-sage/40 font-bold')}>
                {nm}{un}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
