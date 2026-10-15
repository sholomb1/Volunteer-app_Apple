/**
 * Public supplier (store) sign-up. No auth required.
 *
 * Submits to POST /api/public/sup-registration which creates a
 * status='pending' supplier row the coordinator can review in the portal.
 *
 * Oct 9 client: short form that matches how pickups work now — store, address,
 * contact + phone, email, "OK to text you when a driver is on the way?",
 * where to park / go in, food types, about how much, optional backup contact.
 * Dropped: hours, latest cutoff, load help, cold-chain notes, frequency,
 * WhatsApp / call choices.
 */
import { AddressAutocomplete } from '../address-autocomplete';
// Oct 11 client: type the store name, pick it, the address (and map spot) fill in.
import { PlaceNameInput, shortAddress, type PickedPlace } from '../place-name-lookup';
import { useState } from 'react';
import { api } from '../api';
import {
  CheckGroup, Field, FormShell, Input, PHONE_HELP, RadioGroup, Section, SubmitBar, Textarea, ThankYou, phoneOk,
} from '../registration-fields';

type FoodType = 'refrigerated' | 'frozen' | 'dry' | 'prepared' | 'produce' | 'bakery';
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SupplierRegistration() {
  const [storeName, setStoreName]              = useState('');
  const [address, setAddressRaw]               = useState('');
  const [geo, setGeo]                          = useState<{ latitude: number; longitude: number } | null>(null);
  function setAddress(v: string) { setAddressRaw(v); setGeo(null); }
  const [primaryContactName, setPrimaryName]   = useState('');
  const [primaryContactPhone, setPrimaryPhone] = useState('');
  const [email, setEmail]                      = useState('');
  const [textsOk, setTextsOk]                  = useState<'yes' | 'no' | undefined>(undefined);
  const [driverDirections, setDirections]      = useState('');
  const [foodTypes, setFoodTypes]              = useState<FoodType[]>([]);
  const [avgQuantity, setAvgQuantity]          = useState('');
  const [backupContactName, setBackupName]     = useState('');
  const [backupContactPhone, setBackupPhone]   = useState('');

  function pickPlace(p: PickedPlace) {
    if (p.name) setStoreName(p.name);
    setAddressRaw(shortAddress(p));
    setGeo(p.lat != null && p.lng != null ? { latitude: p.lat, longitude: p.lng } : null);
    if (p.phone && !primaryContactPhone.trim()) setPrimaryPhone(p.phone);
  }

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeName.trim() || !address.trim()) { setErr('Please enter the store name and address.'); return; }
    if (!primaryContactName.trim())           { setErr('Please enter a contact name.'); return; }
    if (!phoneOk(primaryContactPhone))        { setErr(PHONE_HELP); return; }
    if (email.trim() && !EMAIL_OK.test(email.trim())) { setErr('Please check the email address.'); return; }
    if (!textsOk)                             { setErr('Please answer: OK to text you when a driver is on the way?'); return; }
    if (backupContactPhone.trim() && !phoneOk(backupContactPhone)) { setErr(`Backup phone: ${PHONE_HELP}`); return; }
    setBusy(true); setErr(null);
    try {
      await api('/api/public/sup-registration', {
        method: 'POST',
        body: JSON.stringify({
          storeName: storeName.trim(), address: address.trim(),
          primaryContactName: primaryContactName.trim(), primaryContactPhone: primaryContactPhone.trim(),
          email: email.trim() || null, textsOk,
          driverDirections: driverDirections.trim(),
          foodTypes, avgQuantity: avgQuantity.trim(),
          backupContactName: backupContactName.trim(), backupContactPhone: backupContactPhone.trim(),
          ...(geo ?? {}),
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="supplier" />;

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · Store sign-up"
      title="Tell us about your store"
      lede="A few quick questions so our drivers can pick up your extra food."
    >
      <form onSubmit={submit}>
        <Section title="Your store">
          <Field label="Store name" htmlFor="sup-name">
            <PlaceNameInput id="sup-name" required value={storeName} onChange={setStoreName} onPick={pickPlace} placeholder="e.g. Bagel Bar"
                            className="w-full rounded-[12px] border border-line bg-paper px-4 py-3 text-[15px] outline-none focus:border-forest" />
          </Field>
          <Field label="Address">
            <AddressAutocomplete value={address} onChange={setAddress} lookupName={storeName} placeholder="Start typing the address…" className="w-full rounded-[12px] border border-line bg-paper px-4 py-3 text-[15px] outline-none focus:border-forest" />
          </Field>
          <Field label="Where should the driver park and go in?" optional htmlFor="sup-directions"
                 help="Back door, loading dock, ask for someone, etc.">
            <Textarea id="sup-directions" value={driverDirections} onChange={(e) => setDirections(e.target.value)} />
          </Field>
        </Section>

        <Section title="Contact">
          <Field label="Contact name" htmlFor="sup-cname">
            <Input id="sup-cname" required value={primaryContactName} onChange={(e) => setPrimaryName(e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Contact phone" htmlFor="sup-cphone">
            <Input id="sup-cphone" required type="tel" inputMode="tel" value={primaryContactPhone} onChange={(e) => setPrimaryPhone(e.target.value)} placeholder="845-555-1234" />
          </Field>
          <Field label="Email" optional htmlFor="sup-email">
            <Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" />
          </Field>
          <Field label="OK to text you when a driver is on the way?">
            <RadioGroup value={textsOk} onChange={setTextsOk}
              options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]} />
          </Field>
          <Field label="Backup contact" optional help="Someone else we can call if you're not there.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input aria-label="Backup contact name" value={backupContactName} onChange={(e) => setBackupName(e.target.value)} placeholder="Name" />
              <Input aria-label="Backup contact phone" type="tel" inputMode="tel" value={backupContactPhone} onChange={(e) => setBackupPhone(e.target.value)} placeholder="Phone" />
            </div>
          </Field>
        </Section>

        <Section title="The food">
          <Field label="What kind of food?" optional help="Pick all that apply.">
            <CheckGroup values={foodTypes} onChange={setFoodTypes}
              options={[
                { label: 'Refrigerated', value: 'refrigerated' },
                { label: 'Frozen',       value: 'frozen' },
                { label: 'Dry / shelf-stable', value: 'dry' },
                { label: 'Prepared',     value: 'prepared' },
                { label: 'Produce',      value: 'produce' },
                { label: 'Bakery',       value: 'bakery' },
              ]} />
          </Field>
          <Field label="About how much each time?" optional htmlFor="sup-qty">
            <Input id="sup-qty" value={avgQuantity} onChange={(e) => setAvgQuantity(e.target.value)} placeholder='e.g. "6–8 trays" or "2 bins"' />
          </Field>
        </Section>

        {err && <p className="text-clay text-[13px] mt-4 font-bold">{err}</p>}
        <SubmitBar busy={busy} label="Send sign-up" />
      </form>
    </FormShell>
  );
}
