/**
 * Public volunteer sign-up — mirrors "Volunteer Application.pdf" section by
 * section, question by question, verbatim. No auth required.
 *
 * Every answer (structured fields + free-text) is POSTed to
 * /api/public/vol-registration and preserved in the volunteers.intake_payload
 * JSONB column, so the office sees the whole form even for questions that
 * don't have a dedicated schema column.
 */
import { useState } from 'react';
import { api } from '../api';
import {
  CheckGroup, Field, FormShell, Input, RadioGroup, Section, SubmitBar, Textarea, ThankYou,
} from '../registration-fields';

type YesNo = 'yes' | 'no';
type MaritalStatus = 'married' | 'single';
type AppAccess = 'yes' | 'no';
type ContactMethod = 'notification' | 'text' | 'call' | 'any';
const CONTACT_METHODS: { value: ContactMethod; label: string }[] = [
  { value: 'notification', label: 'Notification / app' },
  { value: 'text',         label: 'Text message' },
  { value: 'call',         label: 'Phone call' },
  { value: 'any',          label: 'Any method' },
];
type PickupInterest = 'regular' | 'as-needed' | 'both';
type VehicleCapacity = 'small' | 'medium' | 'large' | 'xl';
type LoadType = 'heavy' | 'light' | 'other';
type DispatchShiftsCommitment = '1' | '2' | '3' | '4';
type StockingHours = '1-2' | '2-4' | '4+';

const TIME_BLOCKS = ['Morning', 'Afternoon', 'Evening / Night', 'Flexible (Any time)'] as const;
const AREAS = [
  'Monsey Center', 'Wesley Hills', 'Pomona', 'New Square', 'Airmont',
  'Brooklyn', 'Fallsburg', 'Lakewood', 'Passaic', 'Upstate',
] as const;
const DISPATCH_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Motzei Shabbos'] as const;
const DISPATCH_SHIFTS = [
  '4:00 AM – 8:00 AM', '8:00 AM – 12:00 PM', '12:00 PM – 4:00 PM',
  '4:00 PM – 8:00 PM', '8:00 PM – 12:00 AM', '12:00 AM – 4:00 AM',
] as const;
const STOCKING_TASKS = [
  'Sorting incoming food',
  'Preparing orders for pickup',
  'Take phone orders',
  'Cleaning and organizing the pantry',
  'Inventory counting',
  'Anything needed',
] as const;
const STOCKING_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const STOCKING_TIMES = ['Morning', 'Afternoon', 'Evening'] as const;

export function VolunteerRegistration() {
  // ---- Contact Information ----
  const [fullName, setFullName]         = useState('');
  const [phone, setPhone]               = useState('');
  const [email, setEmail]               = useState('');
  const [homeAddress, setHomeAddress]   = useState('');

  // ---- Marital Status ----
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | undefined>(undefined);

  // ---- Reference ----
  const [refName, setRefName]         = useState('');
  const [refNumber, setRefNumber]     = useState('');
  const [refRelationship, setRefRel]  = useState('');

  // ---- App access + preferred contact (multi-select per PDF update) ----
  const [appAccess, setAppAccess]           = useState<AppAccess | undefined>(undefined);
  const [contactMethods, setContactMethods] = useState<ContactMethod[]>([]);

  // ---- Pickup Preferences ----
  const [pickupInterest, setPickupInterest]     = useState<PickupInterest | undefined>(undefined);
  const [vehicleCapacity, setVehicleCapacity]   = useState<VehicleCapacity | undefined>(undefined);
  const [loadType, setLoadType]                 = useState<LoadType | undefined>(undefined);
  const [loadOther, setLoadOther]               = useState('');
  const [availableTimes, setAvailableTimes]     = useState<string[]>([]);
  const [preferredDayTime, setPreferredDayTime] = useState('');
  const [flexibleContact, setFlexibleContact]   = useState<YesNo | undefined>(undefined);
  const [areas, setAreas]                       = useState<string[]>([]);
  const [areaOther, setAreaOther]               = useState('');

  // ---- Dispatching (opt-in) ----
  const [wantDispatch, setWantDispatch]     = useState(false);
  const [dispatchDays, setDispatchDays]     = useState<string[]>([]);
  const [dispatchShifts, setDispatchShifts] = useState<string[]>([]);
  const [dispatchCommit, setDispatchCommit] = useState<DispatchShiftsCommitment | undefined>(undefined);

  // ---- Center Stocking (opt-in) ----
  const [wantStocking, setWantStocking]     = useState(false);
  const [stockingTasks, setStockingTasks]   = useState<string[]>([]);
  const [stockingHours, setStockingHours]   = useState<StockingHours | undefined>(undefined);
  const [stockingDays, setStockingDays]     = useState<string[]>([]);
  const [stockingTimes, setStockingTimes]   = useState<string[]>([]);

  // ---- Suggestions & Feedback ----
  const [anythingElse, setAnythingElse] = useState('');
  const [feedback, setFeedback]         = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed || !phone.trim()) {
      setErr('Full name and phone number are required so we can reach you.'); return;
    }
    // Reference: at least one of Name/Number/Relationship must be filled.
    if (!refName.trim() && !refNumber.trim() && !refRelationship.trim()) {
      setErr('Please fill out at least one field under Reference (name, number, or relationship).'); return;
    }
    // Split "Full Name" into first + last for the DB columns.
    const parts     = trimmed.split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName  = parts.slice(1).join(' ');

    setBusy(true); setErr(null);
    try {
      await api('/api/public/vol-registration', {
        method: 'POST',
        body: JSON.stringify({
          // Legacy schema columns the backend still writes into dedicated rows.
          firstName, lastName,
          phone: phone.trim(),
          email: email.trim() || null,
          homeNeighborhood: homeAddress,   // repurpose: whole address ends up in location_area + intake_payload
          homeAddress,
          // Prefer the first selected contact method as the primary
          // notification channel (matches the old single-select column).
          notificationMethod:
            contactMethods.includes('text')         ? 'text' :
            contactMethods.includes('call')         ? 'call' :
            contactMethods.includes('notification') ? 'push' :
            'push',

          // PDF-only fields — stored in intake_payload.
          maritalStatus,
          reference: {
            name:         refName,
            number:       refNumber,
            relationship: refRelationship,
          },
          appAccess,
          contactMethods,
          // Keep legacy single-value in the payload for downstream code
          // that still reads `contactMethod`.
          contactMethod: contactMethods[0] ?? null,
          pickupInterest,
          vehicleCapacity,
          loadType,
          loadOther: loadType === 'other' ? loadOther : '',
          availableTimes,
          preferredDayTime,
          flexibleContact,
          areas,
          areaOther,
          dispatching: wantDispatch ? {
            days: dispatchDays,
            shifts: dispatchShifts,
            commitment: dispatchCommit,
          } : null,
          centerStocking: wantStocking ? {
            tasks: stockingTasks,
            hoursPerShift: stockingHours,
            days: stockingDays,
            times: stockingTimes,
          } : null,
          anythingElse,
          feedback,
        }),
      });
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Submission failed'); }
    finally { setBusy(false); }
  }

  if (done) return <ThankYou kind="volunteer" />;

  return (
    <FormShell
      eyebrow="Zeh L'Zeh · Volunteer sign-up"
      title="Volunteer Sign-Up Application"
      lede="Thank you for your interest in volunteering! Please fill out the information below so we can match you with the right volunteer opportunities."
    >
      <form onSubmit={submit}>
        {/* ============================================================ */}
        <Section title="Contact Information">
          <Field label="Full Name">
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First and last name" />
          </Field>
          <Field label="Phone Number">
            <Input required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(845) 555-1234" />
          </Field>
          <Field label="Email Address">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Home Address">
            <Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="Street, city" />
          </Field>
        </Section>

        {/* ============================================================ */}
        <Section title="Marital Status">
          <Field label="Marital Status">
            <RadioGroup value={maritalStatus} onChange={setMaritalStatus}
              options={[
                { label: 'Married', value: 'married' },
                { label: 'Single',  value: 'single' },
              ]} />
          </Field>
        </Section>

        {/* ============================================================ */}
        <Section title="Reference">
          <Field label="Reference — someone who knows you"
                 help="At least one of Name / Number / Relationship is required.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input value={refName}    onChange={(e) => setRefName(e.target.value)}   placeholder="Name" />
              <Input value={refNumber}  onChange={(e) => setRefNumber(e.target.value)} placeholder="Phone number" inputMode="tel" />
              <Input value={refRelationship} onChange={(e) => setRefRel(e.target.value)} placeholder="Relationship" />
            </div>
          </Field>
        </Section>

        {/* ============================================================ */}
        <Section title="Contact Preferences">
          <Field label="Do you have access to use our volunteer app?">
            <RadioGroup value={appAccess} onChange={setAppAccess}
              options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]} />
          </Field>
          <Field label="How should we contact you?" help="Choose one or more.">
            <CheckGroup<ContactMethod>
              values={contactMethods} onChange={setContactMethods}
              options={CONTACT_METHODS} />
          </Field>
        </Section>

        {/* ============================================================ */}
        <Section title="Pickup Preferences">
          <Field label="I am interested in:">
            <RadioGroup value={pickupInterest} onChange={setPickupInterest}
              options={[
                { label: 'Regular scheduled pickups', value: 'regular' },
                { label: 'As-needed pickups',         value: 'as-needed' },
                { label: 'Both',                      value: 'both' },
              ]} />
          </Field>

          <Field label="Vehicle — approximate pickup capacity">
            <RadioGroup value={vehicleCapacity} onChange={setVehicleCapacity}
              options={[
                { label: 'Small (1–3 boxes)',          value: 'small' },
                { label: 'Medium (4–8 boxes)',         value: 'medium' },
                { label: 'Large (9+ boxes)',           value: 'large' },
                { label: 'Extra Large (large pickups)', value: 'xl' },
              ]} />
          </Field>

          <Field label="What type of loads can you handle?">
            <RadioGroup value={loadType} onChange={setLoadType}
              options={[
                { label: 'Heavy loads',      value: 'heavy' },
                { label: 'Light loads only', value: 'light' },
                { label: 'Other',            value: 'other' },
              ]} />
            {loadType === 'other' && (
              <div className="mt-2">
                <Input value={loadOther} onChange={(e) => setLoadOther(e.target.value)} placeholder="Describe" />
              </div>
            )}
          </Field>

          <Field label="What times are you usually available?" help="Pick all that apply.">
            <CheckGroup<string>
              values={availableTimes} onChange={setAvailableTimes}
              options={TIME_BLOCKS.map((t) => ({ label: t, value: t }))} />
          </Field>

          <Field label="Preferred day or time" help="Example: Mon/Wed evenings, Sunday mornings">
            <Input value={preferredDayTime} onChange={(e) => setPreferredDayTime(e.target.value)}
                   placeholder="e.g. Mon/Wed evenings" />
          </Field>

          <Field label="In case of need, can we contact you at a different time?">
            <RadioGroup value={flexibleContact} onChange={setFlexibleContact}
              options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]} />
          </Field>

          <Field label="Which areas can you serve?" help="Check all that apply.">
            <CheckGroup<string>
              values={areas} onChange={setAreas}
              options={AREAS.map((a) => ({ label: a, value: a }))} />
            <div className="mt-3">
              <Input value={areaOther} onChange={(e) => setAreaOther(e.target.value)}
                     placeholder="Other area (optional)" />
            </div>
          </Field>
        </Section>

        {/* ============================================================ */}
        <OptInSection
          title="Dispatching Volunteer"
          hint="Optional — I would like to help with dispatching approximately 4 hours per week."
          on={wantDispatch} onToggle={setWantDispatch}
        >
          <Field label="Available days">
            <CheckGroup<string>
              values={dispatchDays} onChange={setDispatchDays}
              options={DISPATCH_DAYS.map((d) => ({ label: d, value: d }))} />
          </Field>
          <Field label="Available shifts">
            <CheckGroup<string>
              values={dispatchShifts} onChange={setDispatchShifts}
              options={DISPATCH_SHIFTS.map((s) => ({ label: s, value: s }))} />
          </Field>
          <Field label="How many shifts can you commit to?">
            <RadioGroup value={dispatchCommit} onChange={setDispatchCommit}
              options={[
                { label: '1 shift',  value: '1' },
                { label: '2 shifts', value: '2' },
                { label: '3 shifts', value: '3' },
                { label: '4 shifts', value: '4' },
              ]} />
          </Field>
        </OptInSection>

        {/* ============================================================ */}
        <OptInSection
          title="Center Stocking Volunteer"
          hint="Optional — help at the center with sorting, prep, cleaning, or inventory."
          on={wantStocking} onToggle={setWantStocking}
        >
          <Field label="I would like to help with:">
            <CheckGroup<string>
              values={stockingTasks} onChange={setStockingTasks}
              options={STOCKING_TASKS.map((t) => ({ label: t, value: t }))} />
          </Field>
          <Field label="How many hours can you volunteer per shift?">
            <RadioGroup value={stockingHours} onChange={setStockingHours}
              options={[
                { label: '1–2 hours', value: '1-2' },
                { label: '2–4 hours', value: '2-4' },
                { label: '4+ hours',  value: '4+' },
              ]} />
          </Field>
          <Field label="What days are you available?">
            <CheckGroup<string>
              values={stockingDays} onChange={setStockingDays}
              options={STOCKING_DAYS.map((d) => ({ label: d, value: d }))} />
          </Field>
          <Field label="What time of day?">
            <CheckGroup<string>
              values={stockingTimes} onChange={setStockingTimes}
              options={STOCKING_TIMES.map((t) => ({ label: t, value: t }))} />
          </Field>
        </OptInSection>

        {/* ============================================================ */}
        <Section title="Suggestions, Comments & Feedback">
          <Field label="Anything else you'd like us to know?" optional>
            <Textarea value={anythingElse} onChange={(e) => setAnythingElse(e.target.value)}
                      placeholder="Share anything that would help us match you." />
          </Field>
          <Field label="Do you have any suggestions or feedback that would help improve the program?" optional>
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Your thoughts help us improve." />
          </Field>
        </Section>

        {err && (
          <div className="text-clay text-[13.5px] mt-6 font-bold bg-clay/10 border border-clay/30 rounded-[12px] px-4 py-3">
            {err}
          </div>
        )}
        <SubmitBar busy={busy} label="Submit sign-up" />
      </form>
    </FormShell>
  );
}

/**
 * An opt-in section rendered as a card with a title + explanation and a
 * toggle. Contents render only when the volunteer opts in — keeps the form
 * short for people who only want to drive pickups.
 */
function OptInSection({
  title, hint, on, onToggle, children,
}: {
  title: string; hint: string; on: boolean;
  onToggle: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-[18px] border-2 border-line bg-cream/40 p-5">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)}
               className="mt-1 h-5 w-5 accent-forest" />
        <div>
          <div className="text-[15px] font-extrabold text-forest">{title}</div>
          <div className="text-[13px] text-muted mt-0.5">{hint}</div>
        </div>
      </label>
      {on && <div className="mt-5 space-y-5 pl-8">{children}</div>}
    </section>
  );
}
