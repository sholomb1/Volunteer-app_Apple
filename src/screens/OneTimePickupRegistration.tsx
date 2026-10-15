/**
 * Public one-time pickup intake — a donor fills this in when food is ready.
 *
 * Oct 9 client: simple public page, no office powers. Questions:
 *   date, time (AM/PM), store or hall (optional — picking one we know fills
 *   the address, and the store's phone on file is used if the phone is left
 *   blank), address, contact name + phone, "What food, about how much?",
 *   Small / Large, driver instructions.
 * Removed from the public page (office-only, the API ignores them now):
 *   drivers needed, assign drivers (and the public driver list), office notes,
 *   send-to group, urgency, keep-offering hours, test mode.
 * A new pickup is still texted to drivers right away (server side).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { cx } from '../design';
import { Field, FormShell, PHONE_HELP, Section, SubmitBar, ThankYou, TimeAmPm, phoneOk } from '../registration-fields';
import { AddressAutocomplete } from '../address-autocomplete';
import { StoreMatchPrompt, useStoreMatch } from '../store-match';
import { SubmittedByRow, type SubmittedByState, submittedByValue, submittedByError } from '../submitted-by'; // Oct 12 client
import { ExtraContactsEditor, extraContactsPayload, type ExtraContact } from '../extra-contacts'; // Oct 12 client

// Public store list: id + name + street + city only (no phones / contacts).
type PublicSupplier = { id: number | string; name: string; addressLine1: string | null; city: string | null };

const inputCls =
  'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[14.5px] ' +
  'focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';

export function OneTimePickupRegistration() {
  // NY-local today / now (rounded up to the next 5 minutes).
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const nyTimeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const nyH = Number(nyTimeParts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const nyM = Number(nyTimeParts.find((p) => p.type === 'minute')?.value ?? '0');
  const rounded = Math.min(23 * 60 + 55, nyH * 60 + Math.ceil(nyM / 5) * 5);
  const nowHHMM = `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;

  const [suppliers, setSuppliers] = useState<PublicSupplier[]>([]);
  useEffect(() => {
    api('/api/public/one-time-pickup/suppliers')
      .then((s: any) => setSuppliers(Array.isArray(s?.data) ? s.data : []))
      .catch(() => { /* form still works without the store list */ });
  }, []);

  const [date, setDate]           = useState(today);
  const [time, setTime]           = useState(nowHHMM);
  const [supplierId, setSupId]    = useState<number | ''>('');
  const [donorName, setDonor]     = useState('');
  const [contactName, setCN]      = useState('');
  const [contactPhone, setCP]     = useState('');
  const [extraContacts, setExtras] = useState<ExtraContact[]>([]); // Oct 12 client: "+ Add another contact"
  const [address, setAddress]     = useState('');
  const [pickupDetails, setPD]    = useState('');
  const [size, setSize]           = useState<'small' | 'large' | null>(null);
  // Oct 12 client: "Form submitted by" — required here (the API still takes it missing from old cached pages).
  const [subBy, setSubBy]         = useState<SubmittedByState>({ choice: '', name: '' });
  const [pickupInstructions, setPI] = useState('');
  // Hidden honeypot — people never see it; simple bots fill it in.
  const [website, setWebsite]     = useState<string>('');

  // Picking a store fills its address (unless the donor already typed one).
  const addrTouched = useRef(false);
  useEffect(() => {
    if (typeof supplierId !== 'number') return;
    const s = suppliers.find((r) => Number(r.id) === supplierId);
    if (!s) return;
    const line = [s.addressLine1, s.city].filter(Boolean).join(', ');
    if (line && (!addrTouched.current || !address)) setAddress(line);
  }, [supplierId, suppliers]);

  const [busy, setBusy] = useState(false);
  // Oct 8: one ticket per form — a double-tap on Submit can't make two pickups.
  const [clientRequestId] = useState(() => (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const storePicked = typeof supplierId === 'number';
  // Oct 11 client: a typed name that matches a store we work with → "Is this …? Use it / No".
  // Fills business info only (name, address, store phone) and links the pickup to the store.
  const match = useStoreMatch(donorName, !storePicked);
  const [noMatchId, setNoMatchId] = useState<number | null>(null);
  function useMatch() {
    if (!match) return;
    setSupId(match.id); setDonor(match.name);
    addrTouched.current = true; setAddress(match.address); // keep the matched address (the list effect would add the city again)
    if (!contactPhone.trim() && match.phone) setCP(match.phone);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (website.trim()) { setDone(true); return; }
    if (!date || !time)       { setErr('Please pick the date and time.'); return; }
    if (!address.trim())      { setErr('Please enter the pickup address.'); return; }
    if (!contactPhone.trim() && !storePicked) { setErr('Please enter a phone number we can call.'); return; }
    if (contactPhone.trim() && !phoneOk(contactPhone)) { setErr(PHONE_HELP); return; }
    { const sbErr = submittedByError(subBy, true); if (sbErr) { setErr(sbErr); return; } } // Oct 12 client
    if (extraContacts.some((c) => c.phone.trim() && !phoneOk(c.phone))) { setErr(`Other contact: ${PHONE_HELP}`); return; }
    setBusy(true); setErr(null);
    try {
      await api('/api/public/one-time-pickup', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId,
          // Never fall back to the contact name: donorName is shown to drivers.
          donorName:          donorName.trim() || null,
          contactName:        contactName.trim() || null,
          address:            address.trim(),
          contactPhone:       contactPhone.trim(),
          extraContacts:      extraContactsPayload(extraContacts),
          readyDate:          date,
          readyTime:          time,
          pickupDetails:      pickupDetails.trim(),
          pickupInstructions: pickupInstructions.trim(),
          supplierId:         storePicked ? supplierId : null,
          size,
          submittedBy:        submittedByValue(subBy), // Oct 12 client
          website:            website || '',
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="pickup" />;

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · One-time pickup"
      title="I have food ready for pickup"
      lede="Tell us when, where and what. We'll send a driver."
    >
      <form onSubmit={submit}>
        {/* Honeypot: off-screen, hidden from screen readers, not tabbable. */}
        <div aria-hidden="true"
             style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="ot-website">Website (leave empty)</label>
          <input id="ot-website" type="text" name="website" tabIndex={-1} autoComplete="off"
                 value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <Section title="When">
          <Field label="Date" htmlFor="ot-date">
            <input id="ot-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Time the food is ready">
            <TimeAmPm value={time} onChange={setTime} />
          </Field>
        </Section>

        <Section title="Where">
          <Field label="Store or hall name" optional htmlFor="ot-store"
                 help="Pick it from the list if we know it. Drivers see this name.">
            <StorePicker suppliers={suppliers} value={supplierId} name={donorName}
                         onPick={(id, name) => { setSupId(id); setDonor(name); }}
                         onType={(name) => { setSupId(''); setDonor(name); }} />
            {match && !storePicked && match.id !== noMatchId && (
              <StoreMatchPrompt match={match} onUse={useMatch} onNo={() => setNoMatchId(match.id)} />
            )}
          </Field>
          <Field label="Pickup address">
            <AddressAutocomplete value={address} lookupName={donorName}
                                 onChange={(v) => { addrTouched.current = true; setAddress(v); }}
                                 placeholder="Start typing the address…"
                                 className={inputCls} />
          </Field>
        </Section>

        <Section title="Contact">
          <Field label="Contact name" optional htmlFor="ot-cname" help="Who the driver can ask for.">
            <input id="ot-cname" value={contactName} onChange={(e) => setCN(e.target.value)}
                   placeholder="Name" className={inputCls} />
          </Field>
          <Field label="Contact phone" optional={storePicked} htmlFor="ot-cphone"
                 help={storePicked ? "Leave blank to use the store's phone we have on file." : 'In case the driver needs to call.'}>
            <input id="ot-cphone" type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setCP(e.target.value)}
                   placeholder="845-555-1234" className={inputCls} />
          </Field>
          {/* Oct 12 client: a second (or third) person / phone the driver can call. */}
          <div className="mt-1">
            <ExtraContactsEditor value={extraContacts} onChange={setExtras} inputCls={inputCls} big />
          </div>
        </Section>

        <Section title="The food">
          <Field label="What food, about how much?" optional htmlFor="ot-food">
            <textarea id="ot-food" rows={2} value={pickupDetails} onChange={(e) => setPD(e.target.value)}
                      placeholder='e.g. "8 trays of chicken and rice"'
                      className={cx(inputCls, 'min-h-[64px]')} />
          </Field>
          <Field label="Size" optional>
            <div className="flex gap-2">
              {(['small', 'large'] as const).map((opt) => (
                <button key={opt} type="button" onClick={() => setSize(size === opt ? null : opt)}
                        className={cx('rounded-[999px] border-[2px] px-4 py-1.5 text-[13px] font-bold transition',
                          size === opt ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                  {opt === 'small' ? 'Small' : 'Large'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Driver instructions" optional htmlFor="ot-instr"
                 help="Where to park, which door, who to ask for.">
            <textarea id="ot-instr" rows={3} value={pickupInstructions} onChange={(e) => setPI(e.target.value)}
                      placeholder='e.g. "Side door. Ring the bell."'
                      className={cx(inputCls, 'min-h-[80px]')} />
          </Field>
        </Section>

        {/* Oct 12 client: who filled out this form (required). */}
        <Section title="Form submitted by">
          <Field label="Who filled out this form?">
            <SubmittedByRow big value={subBy} onChange={setSubBy} />
          </Field>
        </Section>

        {err && <p className="text-clay text-[13px] mt-4 font-bold">{err}</p>}
        <SubmitBar busy={busy} label="Send pickup" />
      </form>
    </FormShell>
  );
}

// Type a store / hall name. Picking one from our list links the pickup to
// that store; typing a name that isn't listed just uses the typed name.
function StorePicker({ suppliers, value, name, onPick, onType }: {
  suppliers: PublicSupplier[]; value: number | ''; name: string;
  onPick: (id: number, name: string) => void; onType: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const list = useMemo(() => {
    const t = name.trim().toLowerCase();
    const all = suppliers.filter((s) => !!s?.name);
    if (!t) return all.slice(0, 100);
    return all.filter((s) => `${s.name} ${s.city ?? ''}`.toLowerCase().includes(t)).slice(0, 40);
  }, [name, suppliers]);
  return (
    <div className="relative" ref={wrap}>
      <input id="ot-store" value={name} autoComplete="off"
             onFocus={() => setOpen(true)}
             onChange={(e) => { setOpen(true); onType(e.target.value); }}
             placeholder="e.g. Bagel Bar, Chabad hall"
             className={inputCls} />
      {typeof value === 'number' && <div className="mt-1 text-[12px] font-bold text-forest">✓ Store we know</div>}
      {open && list.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-[300px] overflow-y-auto rounded-[10px] border border-line bg-paper shadow-lift">
          {list.map((s) => (
            <button key={s.id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); onPick(Number(s.id), s.name); setOpen(false); }}
                    className={cx('w-full text-left px-3 py-2 text-[13.5px] hover:bg-cream/60 border-b border-line last:border-b-0',
                                  Number(s.id) === Number(value) && 'bg-sage/40 font-bold')}>
              {s.name}
              {s.city ? <span className="text-muted"> · {s.city}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
