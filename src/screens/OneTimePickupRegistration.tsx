/**
 * Public one-time pickup intake — a donor with surplus food fills this in.
 * Creates a status='pending' pickup_instance the coordinator can confirm.
 */
import { useState } from 'react';
import { api } from '../api';
import {
  CheckGroup, Field, FormShell, Input, RadioGroup, Section, SubmitBar, Textarea, ThankYou,
} from '../registration-fields';
import { AddressAutocomplete } from '../address-autocomplete';

type Urgency = 'now' | 'today' | 'this_week';
type FoodType = 'refrigerated' | 'frozen' | 'dry' | 'prepared' | 'produce' | 'bakery';

export function OneTimePickupRegistration() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hh = String((now.getHours() + 1) % 24).padStart(2, '0');

  const [donorName, setDonor]       = useState('');
  const [contactName, setContact]   = useState('');
  const [address, setAddress]       = useState('');
  const [contactPhone, setPhone]    = useState('');
  const [contactEmail, setEmail]    = useState('');
  const [pickupInstructions, setInstr] = useState('');
  const [readyDate, setReadyDate]   = useState(today);
  const [readyTime, setReadyTime]   = useState(`${hh}:00`);
  const [mustPickupBy, setCutoff]   = useState('');
  const [foodTypes, setFoodTypes]   = useState<FoodType[]>([]);
  const [foodDescription, setFood]  = useState('');
  const [estimatedQuantity, setQty] = useState('');
  const [urgency, setUrgency]       = useState<Urgency>('today');
  const [notes, setNotes]           = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!donorName || !address || !contactPhone) { setErr('Name, address and phone are required.'); return; }
    setBusy(true); setErr(null);
    try {
      await api('/api/public/one-time-pickup', {
        method: 'POST',
        body: JSON.stringify({
          donorName, contactName: contactName || null,
          address, contactPhone, contactEmail: contactEmail || null,
          readyDate, readyTime,
          mustPickupBy: mustPickupBy ? new Date(`${readyDate}T${mustPickupBy}:00`).toISOString() : null,
          foodTypes, foodDescription, estimatedQuantity,
          pickupInstructions: pickupInstructions || null,
          notes: [notes, `Urgency: ${urgency}`].filter(Boolean).join('\n'),
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Submission failed'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="supplier" />;

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · One-time pickup"
      title="I have food ready for pickup"
      lede="Tell us what you've got, when, and where — a Zeh L'Zeh coordinator will arrange the pickup."
    >
      <form onSubmit={submit}>
        <Section title="Who you are">
          <Field label="Store / Hall name (shows on driver text)"
                 help="Public name — e.g. Kroger Airmont, Cohen family simcha, Bites Cafe.">
            <Input required value={donorName} onChange={(e) => setDonor(e.target.value)} placeholder="e.g. Kroger Airmont, Cohen family simcha" />
          </Field>
          <Field label="Contact name (goes to driver on accept)" optional>
            <Input value={contactName} onChange={(e) => setContact(e.target.value)} placeholder="Person we can reach if the driver has trouble" />
          </Field>
          <Field label="Pickup address">
            <AddressAutocomplete value={address} onChange={setAddress}
                                 placeholder="Start typing — pick from suggestions" />
          </Field>
          <Field label="Contact phone">
            <Input required value={contactPhone} onChange={(e) => setPhone(e.target.value)} placeholder="(845) 555-1234" />
          </Field>
          <Field label="Email" optional>
            <Input type="email" value={contactEmail} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Access / pickup instructions" optional
                 help="Anything the driver needs to know on arrival — door code, loading dock, ring bell, etc.">
            <Textarea value={pickupInstructions} onChange={(e) => setInstr(e.target.value)} placeholder='e.g. "Loading dock on the side. Ring the bell twice."' />
          </Field>
        </Section>

        <Section title="When is it ready?">
          <Field label="Ready date">
            <Input required type="date" value={readyDate} onChange={(e) => setReadyDate(e.target.value)} />
          </Field>
          <Field label="Ready time">
            <Input required type="time" value={readyTime} onChange={(e) => setReadyTime(e.target.value)} />
          </Field>
          <Field label="Must be picked up by (time on the same day)" help="Latest cutoff before the food spoils or you close." optional>
            <Input type="time" value={mustPickupBy} onChange={(e) => setCutoff(e.target.value)} />
          </Field>
          <Field label="How soon do you need this picked up?">
            <RadioGroup value={urgency} onChange={setUrgency}
              options={[
                { label: 'Right now (within 1–2 hours)', value: 'now' },
                { label: 'Today',                         value: 'today' },
                { label: 'This week',                     value: 'this_week' },
              ]} />
          </Field>
        </Section>

        <Section title="What it is">
          <Field label="Type of food">
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
          <Field label="Description">
            <Textarea value={foodDescription} onChange={(e) => setFood(e.target.value)} placeholder='e.g. "Catering trays, mostly chicken & rice"' />
          </Field>
          <Field label="Estimated quantity">
            <Input value={estimatedQuantity} onChange={(e) => setQty(e.target.value)} placeholder='e.g. "8 trays" or "2 bins"' />
          </Field>
          <Field label="Anything else the driver should know" optional>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="parking, gate code, ring the doorbell, etc." />
          </Field>
        </Section>

        {err && <p className="text-clay text-[13px] mt-4 font-bold">{err}</p>}
        <SubmitBar busy={busy} label="Submit pickup" />
      </form>
    </FormShell>
  );
}
