/**
 * Public steady pickup sign-up — a store that has food on the same days each
 * week. Creates a status='pending', paused steady pickup the office reviews
 * and turns on.
 *
 * Oct 9 client: "Which store?" (pick one we know, or "New store" → name +
 * address), days (Sun–Fri + Motzei Shabbos), time (AM/PM), "What food, about
 * how much?", driver instructions, contact name + phone. Dropped: email,
 * other notes, food-type chips.
 */
import { SearchSelect } from '../design';
import { AddressAutocomplete } from '../address-autocomplete';
import { StoreMatchPrompt, useStoreMatch, type StoreMatch } from '../store-match';
import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  CheckGroup, Field, FormShell, Input, PHONE_HELP, Section, SubmitBar, Textarea, ThankYou, TimeAmPm, phoneOk,
} from '../registration-fields';

// 0 = Sunday … 6 = Saturday night (Motzei Shabbos). Never "Sat".
const DAYS = [
  { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 }, { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 },
  { label: 'Motzei Shabbos', value: 6 },
];

type Store = { id: number; name: string; addressLine1: string | null; city: string | null };

export function SteadyPickupRegistration() {
  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => { api<{ data: any[] }>('/api/public/one-time-pickup/suppliers').then((r) => setStores((r.data ?? []).map((x: any) => ({ ...x, id: Number(x.id) })))).catch(() => {}); }, []);

  const [storeMode, setStoreMode]   = useState<'pick' | 'new'>('pick');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [donorName, setDonor]       = useState('');
  const [address, setAddress]       = useState('');
  const [daysOfWeek, setDays]       = useState<number[]>([]);
  const [pickupTime, setTime]       = useState('17:00');
  const [foodDescription, setFood]  = useState('');
  const [pickupInstructions, setInstr] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setPhone]    = useState('');

  // Oct 11 client: a typed "new store" name that matches a store we work with → "Is this …?
  // Use it / No". Fills business info only (name, address, store phone) and links the store.
  const match = useStoreMatch(donorName, storeMode === 'new');
  const [noMatchId, setNoMatchId] = useState<number | null>(null);
  const [usedMatch, setUsedMatch] = useState<StoreMatch | null>(null);
  function useMatch() {
    if (!match) return;
    setUsedMatch(match); setStoreMode('pick'); setSupplierId(match.id); setDonor(match.name); setAddress(match.address);
    if (!contactPhone.trim() && match.phone) setPhone(match.phone);
  }

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (storeMode === 'pick' && !supplierId) { setErr('Please pick your store, or tap "New store".'); return; }
    if (storeMode === 'new' && !donorName.trim()) { setErr('Please enter the store name.'); return; }
    if (!address.trim())                      { setErr('Please enter the pickup address.'); return; }
    if (daysOfWeek.length === 0)              { setErr('Please pick at least one day.'); return; }
    if (!pickupTime)                          { setErr('Please pick the pickup time.'); return; }
    if (!contactName.trim())                  { setErr('Please enter a contact name.'); return; }
    if (!phoneOk(contactPhone))               { setErr(PHONE_HELP); return; }
    setBusy(true); setErr(null);
    try {
      await api('/api/public/steady-pickup', {
        method: 'POST',
        body: JSON.stringify({
          supplierId:   storeMode === 'pick' ? supplierId : null,
          newStore:     storeMode === 'new',
          donorName:    donorName.trim(),
          address:      address.trim(),
          daysOfWeek, pickupTime,
          foodDescription:    foodDescription.trim(),
          pickupInstructions: pickupInstructions.trim(),
          contactName:  contactName.trim(),
          contactPhone: contactPhone.trim(),
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="steady" />;

  const pickedStore = stores.find((s) => s.id === supplierId) ?? (usedMatch && usedMatch.id === supplierId ? { id: usedMatch.id, name: usedMatch.name, addressLine1: usedMatch.address, city: null } : null);

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · Steady pickup"
      title="Set up a steady pickup"
      lede="Have food on the same days every week? Pick the days and time. We'll confirm and send drivers."
    >
      <form onSubmit={submit}>
        <Section title="Your store">
          <Field label="Which store?">
            {storeMode === 'pick' ? (
              <>
                {pickedStore
                  ? <div className="rounded-[12px] border-[1.4px] border-forest bg-sage/40 px-3.5 py-3 text-[14.5px] font-bold flex items-center justify-between gap-2">
                      <span>{pickedStore.name}</span>
                      <button type="button" className="text-[13px] text-forest underline"
                              onClick={() => { setSupplierId(null); setDonor(''); }}>Change</button>
                    </div>
                  : <SearchSelect items={stores} getKey={(x) => x.id} getLabel={(x) => x.name}
                                  getHint={(x) => [x.addressLine1, x.city].filter(Boolean).join(', ')}
                                  onPick={(x) => { setSupplierId(x.id); setDonor(x.name); setAddress([x.addressLine1, x.city].filter(Boolean).join(', ')); }}
                                  placeholder={stores.length ? 'Type your store name…' : 'Loading stores…'}
                                  emptyText='Not in the list? Tap "New store" below.' />}
                <button type="button" onClick={() => { setStoreMode('new'); setSupplierId(null); setDonor(''); setAddress(''); }}
                        className="mt-2 text-[13px] font-bold text-forest underline">New store (not in the list)</button>
              </>
            ) : (
              <>
                <Input aria-label="Store name" value={donorName} onChange={(e) => setDonor(e.target.value)} placeholder="Store name, e.g. Bagel Bar" />
                {match && match.id !== noMatchId && (
                  <StoreMatchPrompt match={match} onUse={useMatch} onNo={() => setNoMatchId(match.id)} />
                )}
                <button type="button" onClick={() => { setStoreMode('pick'); setDonor(''); setAddress(''); }}
                        className="mt-2 text-[13px] font-bold text-forest underline">Pick from the list instead</button>
              </>
            )}
          </Field>
          <Field label="Pickup address">
            <AddressAutocomplete value={address} onChange={setAddress} lookupName={donorName} placeholder="Start typing the address…" className="w-full rounded-[12px] border border-line bg-paper px-4 py-3 text-[15px] outline-none focus:border-forest" />
          </Field>
        </Section>

        <Section title="When">
          <Field label="Which days?" help="Pick all that apply.">
            <CheckGroup<number> values={daysOfWeek} onChange={setDays} options={DAYS} />
          </Field>
          <Field label="What time?" help="Same time each day you picked.">
            <TimeAmPm value={pickupTime} onChange={setTime} />
          </Field>
        </Section>

        <Section title="The food">
          <Field label="What food, about how much?" optional htmlFor="sp-food">
            <Textarea id="sp-food" value={foodDescription} onChange={(e) => setFood(e.target.value)} placeholder='e.g. "Bread and rolls, about 2 bins"' />
          </Field>
          <Field label="Driver instructions" optional htmlFor="sp-instr" help="Where to park, which door, who to ask for.">
            <Textarea id="sp-instr" value={pickupInstructions} onChange={(e) => setInstr(e.target.value)} placeholder='e.g. "Back door. Ask for Malik."' />
          </Field>
        </Section>

        <Section title="Contact">
          <Field label="Contact name" htmlFor="sp-cname" help="Who the driver should ask for.">
            <Input id="sp-cname" required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Contact phone" htmlFor="sp-cphone">
            <Input id="sp-cphone" required type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setPhone(e.target.value)} placeholder="845-555-1234" />
          </Field>
        </Section>

        {err && <p className="text-clay text-[13px] mt-4 font-bold">{err}</p>}
        <SubmitBar busy={busy} label="Send steady pickup" />
      </form>
    </FormShell>
  );
}
