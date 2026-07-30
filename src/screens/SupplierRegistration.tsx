/**
 * Public supplier (store) sign-up — mirrors the questionnaire in
 * zehlzeh-info-cards.pdf section 1. No auth required.
 *
 * Submits to POST /api/public/sup-registration which creates a
 * status='pending' supplier row the coordinator can review in the portal.
 */
import { useState } from 'react';
import { api } from '../api';
import {
  CheckGroup, Field, FormShell, Input, RadioGroup, Section, SubmitBar, Textarea, ThankYou,
} from '../registration-fields';

type YesNoMaybe = 'yes' | 'no' | 'sometimes';
type Frequency  = 'daily' | 'weekdays' | 'on-call';
type FoodType   = 'refrigerated' | 'frozen' | 'dry' | 'prepared' | 'produce' | 'bakery';

export function SupplierRegistration() {
  const [storeName, setStoreName]                 = useState('');
  const [address, setAddress]                     = useState('');
  const [hoursAvailable, setHours]                = useState('');
  const [latestPickupCutoff, setCutoff]           = useState('');
  const [parking, setParking]                     = useState('');
  const [arrivalLocation, setArrival]             = useState('');
  const [loadHelp, setLoadHelp]                   = useState<YesNoMaybe | undefined>(undefined);
  const [avgQuantity, setAvgQuantity]             = useState('');
  const [foodTypes, setFoodTypes]                 = useState<FoodType[]>([]);
  const [coldChainNotes, setColdChain]            = useState('');
  const [primaryContactName, setPrimaryName]      = useState('');
  const [primaryContactPhone, setPrimaryPhone]    = useState('');
  const [backupContactName, setBackupName]        = useState('');
  const [backupContactPhone, setBackupPhone]      = useState('');
  const [frequency, setFrequency]                 = useState<Frequency | undefined>(undefined);

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeName || !address) { setErr('Store name and address are required.'); return; }
    setBusy(true); setErr(null);
    try {
      await api('/api/public/sup-registration', {
        method: 'POST',
        body: JSON.stringify({
          storeName, address, hoursAvailable, latestPickupCutoff,
          parking, arrivalLocation, loadHelp,
          avgQuantity, foodTypes, coldChainNotes,
          primaryContactName, primaryContactPhone,
          backupContactName, backupContactPhone,
          frequency,
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Submission failed'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="supplier" />;

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · Supplier sign-up"
      title="Tell us about your store"
      lede="A short questionnaire so we can pick up your surplus food efficiently and consistently."
    >
      <form onSubmit={submit}>
        <Section title="Store details">
          <Field label="Store / business name">
            <Input required value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. Bagel Bar" />
          </Field>
          <Field label="Full address" help="Used to map the pickup and calculate distance & time.">
            <Textarea required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state, zip" />
          </Field>
          <Field label="Days & hours food is typically available for pickup">
            <Textarea value={hoursAvailable} onChange={(e) => setHours(e.target.value)} placeholder="e.g. Mon–Fri 4–6 pm, Sun 11 am" />
          </Field>
        </Section>

        <Section title="Pickup logistics">
          <Field label="By what time must the food be picked up?" help="Latest pickup cutoff.">
            <Input value={latestPickupCutoff} onChange={(e) => setCutoff(e.target.value)} placeholder="e.g. 7:00 pm" />
          </Field>
          <Field label="Where should the volunteer park?">
            <Textarea value={parking} onChange={(e) => setParking(e.target.value)} placeholder="Loading zone, back lot, street, etc." />
          </Field>
          <Field label="Where does the volunteer go on arrival?" help="Loading dock, back entrance, front, ask for a person, etc.">
            <Textarea value={arrivalLocation} onChange={(e) => setArrival(e.target.value)} />
          </Field>
          <Field label="Is there equipment / staff to help load the car?">
            <RadioGroup value={loadHelp} onChange={setLoadHelp}
              options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Sometimes', value: 'sometimes' }]} />
          </Field>
        </Section>

        <Section title="About the donation">
          <Field label="Average quantity / volume per pickup" help="Boxes, bags, pallets — helps match the right vehicle.">
            <Input value={avgQuantity} onChange={(e) => setAvgQuantity(e.target.value)} placeholder='e.g. "6–8 trays" or "2 bins"' />
          </Field>
          <Field label="Type of food typically donated">
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
          <Field label="Any cold-chain or handling requirements?" help="Needs cooler / insulated bags / quick turnaround." optional>
            <Textarea value={coldChainNotes} onChange={(e) => setColdChain(e.target.value)} />
          </Field>
        </Section>

        <Section title="Contact">
          <Field label="Primary contact — name & phone" help="Who the volunteer can call.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input value={primaryContactName} onChange={(e) => setPrimaryName(e.target.value)} placeholder="Name" />
              <Input value={primaryContactPhone} onChange={(e) => setPrimaryPhone(e.target.value)} placeholder="Phone" />
            </div>
          </Field>
          <Field label="Backup contact & phone" optional>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input value={backupContactName} onChange={(e) => setBackupName(e.target.value)} placeholder="Name" />
              <Input value={backupContactPhone} onChange={(e) => setBackupPhone(e.target.value)} placeholder="Phone" />
            </div>
          </Field>
          <Field label="Preferred pickup frequency">
            <RadioGroup value={frequency} onChange={setFrequency}
              options={[
                { label: 'Daily',           value: 'daily' },
                { label: 'Certain weekdays', value: 'weekdays' },
                { label: 'On-call',         value: 'on-call' },
              ]} />
          </Field>
        </Section>

        {err && <p className="text-clay text-[13px] mt-4 font-bold">{err}</p>}
        <SubmitBar busy={busy} label="Submit sign-up" />
      </form>
    </FormShell>
  );
}
