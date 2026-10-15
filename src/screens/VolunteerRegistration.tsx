/**
 * Public volunteer sign-up — mirrors "Volunteer Application.pdf" section by
 * section, question by question, verbatim. No auth required.
 *
 * Every answer (structured fields + free-text) is POSTed to
 * /api/public/vol-registration and preserved in the volunteers.intake_payload
 * JSONB column, so the office sees the whole form even for questions that
 * don't have a dedicated schema column.
 *
 * Oct 14 client: the same form (every question) is used by the driver app's
 * "My application" → "Update my answers" (VolunteerApplicationForm with
 * `initial`), and ApplicationSummary shows the answers read-only. Add a new
 * question here and it shows in both places.
 */
import { AddressAutocomplete } from '../address-autocomplete';
import { useState } from 'react';
import { api } from '../api';
import {
  CheckGroup, Field, FormShell, Input, PHONE_HELP, RadioGroup, Section, SubmitBar, Textarea, ThankYou, phoneOk,
} from '../registration-fields';
import { fmtTime } from '../time-format';
import { QuietDaysPicker } from '../quiet-days-picker'; // Oct 14 client: days of the quiet hours
import { daysLabel, normDays } from '../quiet-days';
import { ANYTIME_SLOTS, CALL_QUESTION, CallWhenPicker, callWhenOf, fmtCallTime, isAllDaySlot, type CallWhen } from '../on-call'; // Oct 14 client
import { PhoneListEditor, phonesStateFrom, phonesPayload, phonesError, callNumberOf, phonesLine, fmtPhone, type PhonesState } from '../phone-list'; // Oct 14 client: more than one number

type YesNo = 'yes' | 'no';
type MaritalStatus = 'married' | 'single';
type AppAccess = 'yes' | 'no';
type ContactMethod = 'notification' | 'text' | 'whatsapp' | 'call' | 'any';
const CONTACT_METHODS: { value: ContactMethod; label: string }[] = [
  { value: 'notification', label: 'Notification / app' },
  { value: 'text',         label: 'Text message' },
  { value: 'whatsapp',     label: 'WhatsApp' }, // Oct 6 client
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
const ON_CALL_DAYS: Array<[string, string]> = [
  ['sunday', 'Sunday'], ['monday', 'Monday'], ['tuesday', 'Tuesday'], ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Motzei Shabbos'],
];
// Oct 14 client: option labels in one place (form + read-only summary).
const PICKUP_INTEREST_OPTS: { label: string; value: PickupInterest }[] = [
  { label: 'Regular scheduled pickups', value: 'regular' },
  { label: 'As-needed pickups',         value: 'as-needed' },
  { label: 'Both',                      value: 'both' },
];
const CAPACITY_OPTS: { label: string; value: VehicleCapacity }[] = [
  { label: 'Small (1–3 boxes)',          value: 'small' },
  { label: 'Medium (4–8 boxes)',         value: 'medium' },
  { label: 'Large (9+ boxes)',           value: 'large' },
  { label: 'Extra Large (large pickups)', value: 'xl' },
];
const LOAD_OPTS: { label: string; value: LoadType }[] = [
  { label: 'Heavy loads',      value: 'heavy' },
  { label: 'Light loads only', value: 'light' },
  { label: 'Other',            value: 'other' },
];
const COMMIT_OPTS: { label: string; value: DispatchShiftsCommitment }[] = [
  { label: '1 shift',  value: '1' }, { label: '2 shifts', value: '2' }, { label: '3 shifts', value: '3' }, { label: '4 shifts', value: '4' },
];
const STOCKING_HOURS_OPTS: { label: string; value: StockingHours }[] = [
  { label: '1–2 hours', value: '1-2' }, { label: '2–4 hours', value: '2-4' }, { label: '4+ hours',  value: '4+' },
];
const REMINDER_OPTS: Array<[string, string]> = [['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['120', '2 hours'], ['180', '3 hours']];
const YES_NO = [{ label: 'Yes', value: 'yes' as const }, { label: 'No', value: 'no' as const }];

/** Oct 14 client: the saved answers (intake_payload shape) + `onCall` rows for the call-hours question. */
export type ApplicationAnswers = Record<string, any> & { onCall?: Array<{ day: string; start: string; end: string }> };
type OnCallRow = { day: string; start: string; end: string };

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (v == null ? '' : String(v));
const opt = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);

export function VolunteerRegistration() {
  const [done, setDone] = useState(false);
  if (done) return <ThankYou kind="volunteer" />;
  return (
    <FormShell
      eyebrow="Zeh L'Zeh · Volunteer sign-up"
      title="Volunteer Sign-Up Application"
      lede="Thank you for your interest in volunteering! Please fill out the information below so we can match you with the right volunteer opportunities."
    >
      <VolunteerApplicationForm submitLabel="Submit sign-up"
        onSubmit={async (body) => {
          await api('/api/public/vol-registration', { method: 'POST', body: JSON.stringify(body) });
          setDone(true);
        }} />
    </FormShell>
  );
}

/**
 * The sign-up questions. `initial` = saved answers (driver app "Update my answers");
 * without it the form is empty (public sign-up). `onSubmit` gets the same body the
 * public form always posted.
 */
export function VolunteerApplicationForm({ initial, onSubmit, submitLabel, selfEdit = false, onCancel }: {
  initial?: ApplicationAnswers;
  onSubmit: (body: Record<string, any>) => Promise<void>;
  submitLabel: string;
  selfEdit?: boolean;
  onCancel?: () => void;
}) {
  const a: ApplicationAnswers = initial ?? {};
  const ref = (a.reference && typeof a.reference === 'object') ? a.reference : {};
  const disp = (a.dispatching && typeof a.dispatching === 'object') ? a.dispatching : null;
  const stock = (a.centerStocking && typeof a.centerStocking === 'object') ? a.centerStocking : null;
  // ---- Contact Information ----
  const [fullName, setFullName]         = useState(`${str(a.firstName)} ${str(a.lastName)}`.trim());
  // Oct 14 client: up to 3 numbers — which gets texts, which is best to call.
  const [phones, setPhones]             = useState<PhonesState>(() => phonesStateFrom(a.phones, str(a.phone)));
  const phone = callNumberOf(phones);
  const [email, setEmail]               = useState(str(a.email));
  const [homeAddress, setHomeAddress]   = useState(str(a.homeAddress || a.homeNeighborhood));

  // ---- Marital Status ----
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | undefined>(opt(a.maritalStatus, ['married', 'single'] as const));

  // ---- Reference ----
  const [refName, setRefName]         = useState(str(ref.name));
  const [refNumber, setRefNumber]     = useState(str(ref.number));
  const [refRelationship, setRefRel]  = useState(str(ref.relationship));

  // ---- App access + preferred contact (multi-select per PDF update) ----
  const [appAccess, setAppAccess]           = useState<AppAccess | undefined>(opt(a.appAccess, ['yes', 'no'] as const));
  const [contactMethods, setContactMethods] = useState<ContactMethod[]>(
    arr<ContactMethod>(a.contactMethods).length ? arr<ContactMethod>(a.contactMethods) : (a.contactMethod ? [a.contactMethod as ContactMethod] : []));
  // batch abc811 Aug 10 — quiet-hours window (FROM/UNTIL, NY time).
  // Both optional. Wrap around midnight is supported (e.g. 11pm – 7am).
  const [smsQuietStart, setSmsQuietStart]   = useState(str(a.smsQuietStart).slice(0, 5));
  const [smsQuietEnd,   setSmsQuietEnd]     = useState(str(a.smsQuietEnd).slice(0, 5));
  const [smsQuietDays,  setSmsQuietDays]    = useState<number>(normDays(a.smsQuietDays)); // Oct 14 client
  // Oct 9 client: days + hours we may CALL them when a pickup is waiting for a driver.
  // Oct 14 client: asked plainly — Anytime / Only at these times / Please don't call — and
  // the answer IS the on-call setting (same hours as Settings → Phone calls).
  const savedCalls = arr<OnCallRow>(a.onCall ?? a.onCallSlots).map((o) => ({ day: o.day, start: str(o.start).slice(0, 5), end: str(o.end).slice(0, 5) }));
  const [callWhen, setCallWhen] = useState<CallWhen | undefined>(
    // Oct 14 client: never answered → nothing picked (was "Please don't call").
    opt(a.callWhen, ['anytime', 'times', 'never'] as const) ?? (initial && savedCalls.length > 0 ? callWhenOf(savedCalls) : undefined));
  const [onCall, setOnCall] = useState<OnCallRow[]>(callWhen === 'times' ? savedCalls : []);
  function pickCallWhen(v: CallWhen) {
    setCallWhen(v);
    if (v === 'times' && onCall.length === 0) setOnCall([{ day: 'weekdays', start: '09:00', end: '17:00' }]);
  }
  // Oct 9 client: which texts / alerts / reminders they want.
  const [wantsPickupTexts, setWantsPickupTexts]         = useState<YesNo | undefined>(opt(a.wantsPickupTexts, ['yes', 'no'] as const));
  const [wantsUncoveredAlerts, setWantsUncoveredAlerts] = useState<YesNo | undefined>(opt(a.wantsUncoveredAlerts, ['yes', 'no'] as const));
  const [wantsSteadyReminders, setWantsSteadyReminders] = useState<YesNo | undefined>(opt(a.wantsSteadyReminders, ['yes', 'no'] as const));
  const [steadyReminderMinutes, setSteadyReminderMinutes] = useState(a.steadyReminderMinutes != null ? String(a.steadyReminderMinutes) : '60');

  // ---- Pickup Preferences ----
  const [pickupInterest, setPickupInterest]     = useState<PickupInterest | undefined>(opt(a.pickupInterest, ['regular', 'as-needed', 'both'] as const));
  const [vehicleCapacity, setVehicleCapacity]   = useState<VehicleCapacity | undefined>(a.vehicleCapacity || undefined);
  const [loadType, setLoadType]                 = useState<LoadType | undefined>(opt(a.loadType, ['heavy', 'light', 'other'] as const));
  const [loadOther, setLoadOther]               = useState(str(a.loadOther));
  const [availableTimes, setAvailableTimes]     = useState<string[]>(arr<string>(a.availableTimes));
  const [preferredDayTime, setPreferredDayTime] = useState(str(a.preferredDayTime));
  const [flexibleContact, setFlexibleContact]   = useState<YesNo | undefined>(opt(a.flexibleContact, ['yes', 'no'] as const));
  const [areas, setAreas]                       = useState<string[]>(arr<string>(a.areas));
  const [areaOther, setAreaOther]               = useState(str(a.areaOther));

  // ---- Dispatching (opt-in) ----
  const [wantDispatch, setWantDispatch]     = useState(!!disp);
  const [dispatchDays, setDispatchDays]     = useState<string[]>(arr<string>(disp?.days));
  const [dispatchShifts, setDispatchShifts] = useState<string[]>(arr<string>(disp?.shifts));
  const [dispatchCommit, setDispatchCommit] = useState<DispatchShiftsCommitment | undefined>(opt(disp?.commitment, ['1', '2', '3', '4'] as const));

  // ---- Center Stocking (opt-in) ----
  const [wantStocking, setWantStocking]     = useState(!!stock);
  const [stockingTasks, setStockingTasks]   = useState<string[]>(arr<string>(stock?.tasks));
  const [stockingHours, setStockingHours]   = useState<StockingHours | undefined>(opt(stock?.hoursPerShift, ['1-2', '2-4', '4+'] as const));
  const [stockingDays, setStockingDays]     = useState<string[]>(arr<string>(stock?.days));
  const [stockingTimes, setStockingTimes]   = useState<string[]>(arr<string>(stock?.times));

  // ---- Suggestions & Feedback ----
  const [anythingElse, setAnythingElse] = useState(str(a.anythingElse));
  const [feedback, setFeedback]         = useState(str(a.feedback));

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed || !phone.trim()) {
      setErr(phonesError(phones) ?? 'Full name and phone number are required so we can reach you.'); return;
    }
    { const pe = phonesError(phones, { required: true }); if (pe) { setErr(pe); return; } } // Oct 14 client
    // Oct 9 client: same phone check as the store / pickup forms.
    if (!phoneOk(phone)) { setErr(PHONE_HELP); return; }
    // Reference: at least one of Name/Number/Relationship must be filled.
    // Oct 14 client: drivers updating their answers in the app aren't blocked by it
    // (many were added by the office and never had a reference).
    if (!selfEdit && !refName.trim() && !refNumber.trim() && !refRelationship.trim()) {
      setErr('Please fill out at least one field under Reference (name, number, or relationship).'); return;
    }
    // Oct 9: hours may run past midnight (e.g. Motzei Shabbos 9 PM – 1 AM); only same start/end is wrong.
    // Oct 14 client: the call question must be answered.
    if (!callWhen) { setErr(`Please answer: ${CALL_QUESTION}`); return; }
    if (callWhen === 'times' && onCall.length === 0) {
      setErr('Add at least one day and time we may call you, or pick Anytime / Please don\'t call.'); return;
    }
    if (callWhen === 'times' && onCall.some((o) => !o.start || !o.end || o.start === o.end)) {
      setErr('Call times: please pick a start and an end time.'); return;
    }
    // Split "Full Name" into first + last for the DB columns.
    const parts     = trimmed.split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName  = parts.slice(1).join(' ');

    setBusy(true); setErr(null);
    try {
      await onSubmit({
          // Legacy schema columns the backend still writes into dedicated rows.
          firstName, lastName,
          phone: phone.trim(),
          phones: phonesPayload(phones), // Oct 14 client: all numbers + texts go to / best to call
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
          // Oct 6: main way to reach them, in the portal's terms (contact badge).
          preferredContactMethod:
            contactMethods.includes('whatsapp')     ? 'whatsapp' :
            contactMethods.includes('text')         ? 'sms' :
            contactMethods.includes('call')         ? 'call' :
            contactMethods.includes('notification') ? 'push' : null,
          smsQuietStart: smsQuietStart || null,
          smsQuietEnd:   smsQuietEnd   || null,
          smsQuietDays:  smsQuietStart ? smsQuietDays : null, // Oct 14 client: days of the quiet hours
          // Oct 14 client: "Weekdays" / "Every day" → one row per day (stored meaning unchanged).
          // Oct 14 client: Anytime = every day all day; Please don't call = none (the API applies the same rule).
          callWhen,
          onCallSlots:   callWhen === 'anytime' ? ANYTIME_SLOTS.map((o) => ({ ...o }))
                       : callWhen === 'never' ? []
                       : onCall.flatMap((o) => o.day === 'weekdays' ? ['monday', 'tuesday', 'wednesday', 'thursday'].map((day) => ({ ...o, day }))
                           : o.day === 'everyday' ? ON_CALL_DAYS.map(([day]) => ({ ...o, day })) : [o]),
          wantsPickupTexts,
          wantsUncoveredAlerts,
          wantsSteadyReminders,
          steadyReminderMinutes: wantsSteadyReminders === 'yes' ? Number(steadyReminderMinutes) : undefined,

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
      });
    } catch (e: any) { setErr(e?.message ?? 'Submission failed'); }
    finally { setBusy(false); }
  }

  return (
      <form onSubmit={submit}>
        {/* ============================================================ */}
        <Section title="Contact Information">
          {/* Oct 9 client: htmlFor — tapping a question only focuses its own box. */}
          <Field label="Full Name" htmlFor="vol-name">
            <Input id="vol-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First and last name" />
          </Field>
          <Field label="Phone Number" htmlFor="vol-phone-0">
            {/* Oct 14 client: more than one number — pick which gets texts and which to call */}
            <PhoneListEditor value={phones} onChange={setPhones} big idPrefix="vol-phone" />
          </Field>
          <Field label="Email Address" htmlFor="vol-email">
            <Input id="vol-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Home Address">
            <AddressAutocomplete value={homeAddress} onChange={setHomeAddress} placeholder="Start typing your street…" className="w-full rounded-[12px] border border-line bg-paper px-4 py-3 text-[15px] outline-none focus:border-forest" />
          </Field>

          <Field label="Marital Status">
            <RadioGroup value={maritalStatus} onChange={setMaritalStatus}
              options={[
                { label: 'Married', value: 'married' },
                { label: 'Single',  value: 'single' },
              ]} />
          </Field>
        </Section>

        {/* ============================================================ */}


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
            <RadioGroup value={appAccess} onChange={setAppAccess} options={YES_NO} />
          </Field>
          <Field label="How should we contact you?" help="Choose one or more.">
            <CheckGroup<ContactMethod>
              values={contactMethods} onChange={setContactMethods}
              options={CONTACT_METHODS} />
          </Field>
          <Field label="Quiet hours" help="We won't send automatic texts during this time. It can cross midnight (e.g. 11 PM – 7 AM)." optional>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                From
                <Input type="time" value={smsQuietStart}
                       onChange={(e) => setSmsQuietStart(e.target.value)} />
              </label>
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                Until
                <Input type="time" value={smsQuietEnd}
                       onChange={(e) => setSmsQuietEnd(e.target.value)} />
              </label>
            </div>
            {/* Oct 14 client: which days (a night quiet time counts for the night it starts). */}
            {smsQuietStart && <QuietDaysPicker big value={smsQuietDays} onChange={setSmsQuietDays} />}
          </Field>
          <Field label="Do you want texts when a pickup needs a driver?" help="You'd be in our default text group. Reply with the pickup's number to take it.">
            <RadioGroup value={wantsPickupTexts} onChange={setWantsPickupTexts} options={YES_NO} />
          </Field>
          <Field label="Also text you when a pickup still has no driver (urgent)?" help="Only sent when food is waiting and nobody has taken it yet.">
            <RadioGroup value={wantsUncoveredAlerts} onChange={setWantsUncoveredAlerts} options={YES_NO} />
          </Field>
          <Field label="If you take a regular (steady) pickup, do you want a reminder text before it?">
            <RadioGroup value={wantsSteadyReminders} onChange={setWantsSteadyReminders} options={YES_NO} />
            {wantsSteadyReminders === 'yes' && (
              <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-muted">
                How long before?
                <select value={steadyReminderMinutes} onChange={(e) => setSteadyReminderMinutes(e.target.value)}
                        className="rounded-[10px] border-[1.4px] border-line-2 bg-paper px-2.5 py-2 text-[14px] text-ink outline-none focus:border-forest">
                  {REMINDER_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            )}
          </Field>
          {/* Oct 14 client: explicit question; the answer sets the real call hours. */}
          <Field label={CALL_QUESTION}
                 help="Our dispatcher calls drivers when food is waiting and nobody has taken it yet.">
            <CallWhenPicker value={callWhen} onChange={pickCallWhen} name="application" />
            {callWhen === 'times' && (
            <div className="space-y-2 mt-3" data-call-times>
              <div className="text-[13px] text-muted">The days and hours you're OK with a call. Hours can run past midnight (e.g. 9 PM – 1 AM).</div>
              {onCall.map((o, i) => {
                const set = (patch: Partial<typeof o>) => setOnCall(onCall.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <select value={o.day} onChange={(e) => set({ day: e.target.value })}
                            className="rounded-[10px] border-[1.4px] border-line-2 bg-paper px-2.5 py-2 text-[14px] outline-none focus:border-forest">
                      {/* Oct 14 client: Weekdays = Mon–Thu. */}
                      <option value="weekdays">Weekdays (Mon–Thu)</option>
                      <option value="everyday">Every day</option>
                      {ON_CALL_DAYS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <Input type="time" value={o.start} onChange={(e) => set({ start: e.target.value })} className="w-auto" />
                    <span className="text-[12px] font-semibold text-muted">to</span>
                    <Input type="time" value={o.end} onChange={(e) => set({ end: e.target.value })} className="w-auto" />
                    <button type="button" onClick={() => setOnCall(onCall.filter((_, j) => j !== i))}
                            className="text-[13px] font-bold text-clay px-1">Remove</button>
                  </div>
                );
              })}
              <button type="button"
                      onClick={() => setOnCall([...onCall, { day: onCall[onCall.length - 1]?.day ?? 'sunday', start: '09:00', end: '13:00' }])}
                      className="rounded-[10px] border border-forest/40 px-3 py-2 text-[13px] font-bold text-forest">
                + Add days and hours
              </button>
            </div>
            )}
          </Field>
        </Section>

        {/* ============================================================ */}
        <Section title="Pickup Preferences">
          <Field label="I am interested in:">
            <RadioGroup value={pickupInterest} onChange={setPickupInterest} options={PICKUP_INTEREST_OPTS} />
          </Field>

          <Field label="Vehicle — approximate pickup capacity">
            <RadioGroup value={vehicleCapacity} onChange={setVehicleCapacity} options={CAPACITY_OPTS} />
          </Field>

          <Field label="What type of loads can you handle?">
            <RadioGroup value={loadType} onChange={setLoadType} options={LOAD_OPTS} />
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
            <RadioGroup value={flexibleContact} onChange={setFlexibleContact} options={YES_NO} />
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
            <RadioGroup value={dispatchCommit} onChange={setDispatchCommit} options={COMMIT_OPTS} />
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
            <RadioGroup value={stockingHours} onChange={setStockingHours} options={STOCKING_HOURS_OPTS} />
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
        <SubmitBar busy={busy} label={submitLabel} />
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy}
                  className="haptic mt-3 w-full min-h-[48px] rounded-[14px] text-muted text-[16px] font-bold">
            Cancel
          </button>
        )}
      </form>
  );
}

/**
 * Oct 14 client: the answers, read-only, question by question in the form's
 * order (driver app → My application). Unanswered questions say "Not answered".
 */
export function ApplicationSummary({ answers }: { answers: ApplicationAnswers }) {
  const a = answers;
  const ref = (a.reference && typeof a.reference === 'object') ? a.reference : {};
  const disp = (a.dispatching && typeof a.dispatching === 'object') ? a.dispatching : null;
  const stock = (a.centerStocking && typeof a.centerStocking === 'object') ? a.centerStocking : null;
  const label = <T extends string>(opts: { label: string; value: T }[], v: unknown) => opts.find((o) => o.value === v)?.label ?? str(v);
  const yn = (v: unknown) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '');
  const list = (v: unknown) => arr<string>(v).join(', ');
  const dayName = (d: string) => (d === 'weekdays' ? 'Weekdays (Mon–Thu)' : d === 'everyday' ? 'Every day' : ON_CALL_DAYS.find(([k]) => k === d)?.[1] ?? d);
  const quiet = a.smsQuietStart ? `${fmtTime(str(a.smsQuietStart).slice(0, 5))} – ${fmtTime(str(a.smsQuietEnd || '07:00').slice(0, 5))}${normDays(a.smsQuietDays) !== 127 ? ` · ${daysLabel(a.smsQuietDays)}` : ''}` : ''; // Oct 14 client: + days
  // Oct 14 client: Anytime / the hours / Please don't call (from the real call hours).
  const callRows = arr<OnCallRow>(a.onCall ?? a.onCallSlots);
  // Oct 14 client: no answer and no hours = "Not answered" (was "Please don't call" for everyone).
  const callAns = opt(a.callWhen, ['anytime', 'times', 'never'] as const) ?? (callRows.length > 0 ? callWhenOf(callRows) : null);
  const calls = callAns == null ? '' : callAns === 'anytime' ? 'Anytime' : callAns === 'never' ? "Please don't call"
    : `Only at these times:\n${callRows.map((o) => `${dayName(o.day)} ${isAllDaySlot(o) ? 'all day' : `${fmtCallTime(str(o.start))} – ${fmtCallTime(str(o.end))}`}`).join('\n')}`;
  const steady = a.wantsSteadyReminders === 'yes'
    ? `Yes${a.steadyReminderMinutes != null ? ` — ${REMINDER_OPTS.find(([v]) => v === String(a.steadyReminderMinutes))?.[1] ?? `${a.steadyReminderMinutes} minutes`} before` : ''}`
    : yn(a.wantsSteadyReminders);
  const sections: Array<[string, Array<[string, string]>]> = [
    ['Contact Information', [
      ['Full Name', `${str(a.firstName)} ${str(a.lastName)}`.trim()],
      ['Phone Number', a.phones && (a.phones.numbers ?? []).length > 1 // Oct 14 client: all numbers
        ? `${phonesLine(a.phones)}\n${(a.phones.numbers as any[]).map((n) => `${fmtPhone(n.phone)}${n.label ? ` (${n.label})` : ''}`).join(', ')}`
        : str(a.phone)],
      ['Email Address', str(a.email)],
      ['Home Address', str(a.homeAddress || a.homeNeighborhood)],
      ['Marital Status', label([{ label: 'Married', value: 'married' }, { label: 'Single', value: 'single' }], a.maritalStatus)],
    ]],
    ['Reference', [
      ['Reference — someone who knows you', [ref.name, ref.number, ref.relationship].map(str).filter(Boolean).join(' · ')],
    ]],
    ['Contact Preferences', [
      ['Do you have access to use our volunteer app?', yn(a.appAccess)],
      ['How should we contact you?', arr<string>(a.contactMethods).map((m) => label(CONTACT_METHODS, m)).join(', ') || (a.contactMethod ? label(CONTACT_METHODS, a.contactMethod) : '')],
      ['Quiet hours', quiet],
      ['Do you want texts when a pickup needs a driver?', yn(a.wantsPickupTexts)],
      ['Also text you when a pickup still has no driver (urgent)?', yn(a.wantsUncoveredAlerts)],
      ['If you take a regular (steady) pickup, do you want a reminder text before it?', steady],
      [CALL_QUESTION, calls],
    ]],
    ['Pickup Preferences', [
      ['I am interested in:', label(PICKUP_INTEREST_OPTS, a.pickupInterest)],
      ['Vehicle — approximate pickup capacity', label(CAPACITY_OPTS, a.vehicleCapacity)],
      ['What type of loads can you handle?', a.loadType === 'other' ? `Other${a.loadOther ? `: ${a.loadOther}` : ''}` : label(LOAD_OPTS, a.loadType)],
      ['What times are you usually available?', list(a.availableTimes)],
      ['Preferred day or time', str(a.preferredDayTime)],
      ['In case of need, can we contact you at a different time?', yn(a.flexibleContact)],
      ['Which areas can you serve?', [list(a.areas), str(a.areaOther)].filter(Boolean).join(', ')],
    ]],
    ['Dispatching Volunteer', disp ? [
      ['Available days', list(disp.days)],
      ['Available shifts', list(disp.shifts)],
      ['How many shifts can you commit to?', label(COMMIT_OPTS, disp.commitment)],
    ] : [['I would like to help with dispatching', 'No']]],
    ['Center Stocking Volunteer', stock ? [
      ['I would like to help with:', list(stock.tasks)],
      ['How many hours can you volunteer per shift?', label(STOCKING_HOURS_OPTS, stock.hoursPerShift)],
      ['What days are you available?', list(stock.days)],
      ['What time of day?', list(stock.times)],
    ] : [['I would like to help at the center', 'No']]],
    ['Suggestions, Comments & Feedback', [
      ["Anything else you'd like us to know?", str(a.anythingElse)],
      ['Do you have any suggestions or feedback that would help improve the program?', str(a.feedback)],
    ]],
  ];
  return (
    <div>
      {sections.map(([title, rows]) => (
        <section key={title} className="mt-6">
          <h2 className="text-[13px] font-extrabold uppercase tracking-[.06em] text-forest border-b-2 border-forest pb-1.5 mb-2">{title}</h2>
          <dl className="divide-y divide-line">
            {rows.map(([q, ans]) => (
              <div key={q} className="py-2.5">
                <dt className="text-[14px] font-bold text-muted leading-snug">{q}</dt>
                <dd className={ans ? 'text-[16px] text-ink mt-0.5 whitespace-pre-wrap leading-snug' : 'text-[15px] text-muted italic mt-0.5'}>{ans || 'Not answered'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
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
