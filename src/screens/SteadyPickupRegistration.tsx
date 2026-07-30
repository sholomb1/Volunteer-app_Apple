/**
 * Public steady-pickup intake — a donor who can give consistently sets up a
 * recurring schedule. Creates a status='pending' steady_pickup template.
 */
import { useState } from 'react';
import { api } from '../api';
import {
  CheckGroup, Field, FormShell, Input, Section, SubmitBar, Textarea, ThankYou,
} from '../registration-fields';

type FoodType = 'refrigerated' | 'frozen' | 'dry' | 'prepared' | 'produce' | 'bakery';
const DAYS = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export function SteadyPickupRegistration() {
  const [donorName, setDonor]      = useState('');
  const [address, setAddress]      = useState('');
  const [contactPhone, setPhone]   = useState('');
  const [contactEmail, setEmail]   = useState('');
  const [daysOfWeek, setDays]      = useState<number[]>([]);
  const [pickupTime, setTime]      = useState('17:00');
  const [foodTypes, setFoodTypes]  = useState<FoodType[]>([]);
  const [foodDescription, setFood] = useState('');
  const [typicalQuantity, setQty]  = useState('');
  const [specialInstructions, setInstr] = useState('');
  const [notes, setNotes]          = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!donorName || !address || !contactPhone) { setErr('Name, address and phone are required.'); return; }
    if (daysOfWeek.length === 0)                  { setErr('Pick at least one day of the week.'); return; }
    setBusy(true); setErr(null);
    try {
      await api('/api/public/steady-pickup', {
        method: 'POST',
        body: JSON.stringify({
          donorName, address, contactPhone, contactEmail: contactEmail || null,
          daysOfWeek, pickupTime,
          foodTypes, foodDescription, typicalQuantity, specialInstructions, notes,
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Submission failed'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="supplier" />;

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · Steady pickup"
      title="Set up a regular pickup schedule"
      lede="If you can donate consistently each week, pick the day(s) and time. A coordinator will confirm and start the route."
    >
      <form onSubmit={submit}>
        <Section title="Who you are">
          <Field label="Business / donor name">
            <Input required value={donorName} onChange={(e) => setDonor(e.target.value)} placeholder="e.g. Bagel Bar" />
          </Field>
          <Field label="Pickup address">
            <Textarea required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state, zip" />
          </Field>
          <Field label="Contact phone">
            <Input required value={contactPhone} onChange={(e) => setPhone(e.target.value)} placeholder="(845) 555-1234" />
          </Field>
          <Field label="Email" optional>
            <Input type="email" value={contactEmail} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
          </Field>
        </Section>

        <Section title="When">
          <Field label="Days of the week">
            <CheckGroup<number> values={daysOfWeek} onChange={setDays} options={DAYS} />
          </Field>
          <Field label="Pickup time" help="Same time each chosen day.">
            <Input required type="time" value={pickupTime} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </Section>

        <Section title="What you donate">
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
          <Field label="What you typically have ready">
            <Textarea value={foodDescription} onChange={(e) => setFood(e.target.value)} placeholder='e.g. "End-of-day bread, bagels, rolls"' />
          </Field>
          <Field label="Typical quantity">
            <Input value={typicalQuantity} onChange={(e) => setQty(e.target.value)} placeholder='e.g. "6–8 trays" or "2 bins"' />
          </Field>
        </Section>

        <Section title="Logistics">
          <Field label="Special instructions for every pickup" help="Cold-chain, parking, where to find the food, etc." optional>
            <Textarea value={specialInstructions} onChange={(e) => setInstr(e.target.value)} />
          </Field>
          <Field label="Other notes" optional>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Section>

        {err && <p className="text-clay text-[13px] mt-4 font-bold">{err}</p>}
        <SubmitBar busy={busy} label="Submit schedule" />
      </form>
    </FormShell>
  );
}
