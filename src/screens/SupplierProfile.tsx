/**
 * Supplier self-edit screen — the store updates its own contact info,
 * pickup instructions, contact hours, etc. without bothering the office.
 * Backed by GET/PATCH /api/me/supplier-profile.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { supplierSelf, account, setAuth, type WeekHours, type DayHours } from '../api';
import { FadeUp } from '../design';

const inputCls = 'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[14.5px] outline-none focus:border-forest';

export function SupplierProfile() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['supplier-self'], queryFn: supplierSelf.get });
  const profile = q.data?.data;

  const [name, setName] = useState('');
  const [addressLine1, setAddr] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [contactName, setCN] = useState('');
  const [contactPhone, setCP] = useState('');
  const [contactEmail, setCE] = useState('');
  const [pickupInstructions, setInstr] = useState('');
  const [preferredPickupWindow, setWindow] = useState('');
  const [contactHours, setHours] = useState('');
  const [typicalDonation, setTd] = useState('');
  const [holidaySchedule, setHoliday] = useState('');
  const [kosherCertification, setHechsher] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [entrancePhotoUrl, setEntranceUrl] = useState<string | null>(null);
  const [entranceErr, setEntranceErr] = useState<string | null>(null);
  // C10 Aug 13 — structured store hours + notification prefs.
  const [storeHours, setStoreHours] = useState<WeekHours>({});
  const [contactHoursStructured, setContactHoursStructured] = useState<WeekHours>({});
  const [notifChannel, setNotifChannel] = useState<'app'|'sms'|'both'|'none'>('both');
  const [notifWindow, setNotifWindow] = useState<'anytime'|'store_hours'|'custom'>('anytime');
  const [quietHoursStart, setQuietStart] = useState<string>('');
  const [quietHoursEnd,   setQuietEnd]   = useState<string>('');
  const [quietDays,       setQuietDays]  = useState<number>(0);
  const [awayFrom,        setAwayFrom]   = useState<string>('');
  const [awayUntil,       setAwayUntil]  = useState<string>('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setAddr(profile.addressLine1 ?? '');
    setCity(profile.city ?? '');
    setState(profile.state ?? '');
    setZip(profile.zip ?? '');
    setCN(profile.contactName ?? '');
    setCP(profile.contactPhone ?? '');
    setCE(profile.contactEmail ?? '');
    setInstr(profile.pickupInstructions ?? '');
    setWindow(profile.preferredPickupWindow ?? '');
    setHours(profile.contactHours ?? '');
    setTd(profile.typicalDonation ?? '');
    setHoliday(profile.holidaySchedule ?? '');
    setHechsher(profile.kosherCertification ?? '');
    setLogoUrl(profile.logoUrl ?? null);
    setEntranceUrl(profile.entrancePhotoUrl ?? null);
    setStoreHours((profile.storeHours ?? {}) as WeekHours);
    setContactHoursStructured((profile.contactHoursStructured ?? {}) as WeekHours);
    setNotifChannel((profile.notifChannel ?? 'both') as any);
    setNotifWindow((profile.notifWindow ?? 'anytime') as any);
    setQuietStart(profile.quietHoursStart ?? '');
    setQuietEnd(profile.quietHoursEnd ?? '');
    setQuietDays(profile.quietDays ?? 0);
    setAwayFrom(profile.awayFrom ?? '');
    setAwayUntil(profile.awayUntil ?? '');
  }, [profile]);

  function readImageFile(file: File | null, setUrl: (s: string | null) => void, setErr: (s: string | null) => void) {
    setErr(null);
    if (!file) { setUrl(null); return; }
    if (!/^image\//.test(file.type)) { setErr('Please choose an image file.'); return; }
    // Entrance photos are more useful when larger — allow 800 KB. Logos still
    // capped at 200 KB to keep contact-list rows light.
    if (file.size > 800_000) { setErr('Image too big — keep it under 800 KB. Try a smaller version.'); return; }
    const r = new FileReader();
    r.onload = () => setUrl(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => setErr('Could not read this file.');
    r.readAsDataURL(file);
  }
  const onLogoFile     = (f: File | null) => readImageFile(f, setLogoUrl,     setLogoErr);
  const onEntranceFile = (f: File | null) => readImageFile(f, setEntranceUrl, setEntranceErr);

  const save = useMutation({
    mutationFn: () => supplierSelf.patch({
      name, addressLine1, city, state, zip,
      contactName, contactPhone, contactEmail: contactEmail || null,
      pickupInstructions, preferredPickupWindow, contactHours,
      typicalDonation, holidaySchedule,
      kosherCertification: kosherCertification || null,
      logoUrl: logoUrl || null,
      entrancePhotoUrl: entrancePhotoUrl || null,
      storeHours,
      contactHoursStructured,
      notifChannel,
      notifWindow,
      quietHoursStart: quietHoursStart || null,
      quietHoursEnd:   quietHoursEnd   || null,
      quietDays,
      awayFrom:  awayFrom  || null,
      awayUntil: awayUntil || null,
    }),
    onSuccess: () => { setDone(true); setTimeout(() => setDone(false), 3500); },
  });

  return (
    <div className="min-h-screen pb-[80px]">
      <div className="flex items-center gap-3 px-5 py-3">
        <button onClick={() => nav(-1)} className="haptic grid h-9 w-9 place-items-center rounded-full bg-paper border border-line">
          <ArrowLeft size={18} />
        </button>
        <div className="font-display font-semibold text-[20px]">Edit store info</div>
      </div>
      <main className="px-5">
        {q.isLoading ? <p className="text-muted text-center py-10">Loading…</p> :
         !profile ? <p className="text-clay text-center py-10">No supplier profile linked to this account.</p> :
        <FadeUp>
          <Section title="Store">
            <Field label="Store name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
            <Field label="Hechsher / kosher certification" help="Will show on your pickup listings."><input value={kosherCertification} onChange={(e) => setHechsher(e.target.value)} className={inputCls} placeholder="e.g. OU, KAJ, Tartikov" /></Field>
            <Field label="Store logo" help="JPG or PNG, under 200 KB. Shows next to your name in the drivers' app.">
              <div className="flex items-center gap-3">
                {logoUrl
                  ? <img src={logoUrl} alt="Store logo" className="h-16 w-16 rounded-[12px] object-cover border border-line bg-paper" />
                  : <div className="h-16 w-16 rounded-[12px] border border-dashed border-line-2 grid place-items-center text-[10px] font-bold text-muted">No logo</div>}
                <div className="flex flex-col gap-1.5">
                  <label className="haptic cursor-pointer rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2 text-[13px] font-bold text-forest text-center">
                    {logoUrl ? 'Replace…' : 'Upload…'}
                    <input type="file" accept="image/*" onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)} className="hidden" />
                  </label>
                  {logoUrl && (
                    <button type="button" onClick={() => setLogoUrl(null)}
                            className="text-[12px] font-bold text-clay text-left">Remove logo</button>
                  )}
                </div>
              </div>
              {logoErr && <p className="text-[12px] text-clay mt-1.5">{logoErr}</p>}
            </Field>
          </Section>
          <Section title="Address">
            <Field label="Street"><input value={addressLine1} onChange={(e) => setAddr(e.target.value)} className={inputCls} /></Field>
            <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State"><input value={state} onChange={(e) => setState(e.target.value)} className={inputCls} /></Field>
              <Field label="ZIP"><input value={zip} onChange={(e) => setZip(e.target.value)} className={inputCls} /></Field>
            </div>
          </Section>
          <Section title="Contact">
            <Field label="Contact name"><input value={contactName} onChange={(e) => setCN(e.target.value)} className={inputCls} /></Field>
            <Field label="Contact phone"><input value={contactPhone} onChange={(e) => setCP(e.target.value)} className={inputCls} placeholder="(845) 555-1234" /></Field>
            <Field label="Contact email"><input value={contactEmail} onChange={(e) => setCE(e.target.value)} className={inputCls} placeholder="optional" /></Field>
            <Field label="Best hours to reach you"><input value={contactHours} onChange={(e) => setHours(e.target.value)} className={inputCls} placeholder='e.g. "Mon–Thu 9am–5pm"' /></Field>
          </Section>
          <Section title="Pickup">
            <Field label="Preferred pickup window"><input value={preferredPickupWindow} onChange={(e) => setWindow(e.target.value)} className={inputCls} placeholder='e.g. "After 4pm Sun–Fri"' /></Field>
            <Field label="Pickup instructions" help="What the driver should know — door, parking, who to ask for."><textarea rows={3} value={pickupInstructions} onChange={(e) => setInstr(e.target.value)} className={inputCls} /></Field>
            <Field label="Entrance photo" help="Photo of the door/dock the driver should pull up to. JPG or PNG, under 800 KB.">
              <div className="flex items-center gap-3">
                {entrancePhotoUrl
                  ? <img src={entrancePhotoUrl} alt="Entrance" className="h-24 w-32 rounded-[12px] object-cover border border-line bg-paper" />
                  : <div className="h-24 w-32 rounded-[12px] border border-dashed border-line-2 grid place-items-center text-[10px] font-bold text-muted text-center px-1">No photo</div>}
                <div className="flex flex-col gap-1.5">
                  <label className="haptic cursor-pointer rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2 text-[13px] font-bold text-forest text-center">
                    {entrancePhotoUrl ? 'Replace…' : 'Upload…'}
                    <input type="file" accept="image/*" onChange={(e) => onEntranceFile(e.target.files?.[0] ?? null)} className="hidden" />
                  </label>
                  {entrancePhotoUrl && (
                    <button type="button" onClick={() => setEntranceUrl(null)}
                            className="text-[12px] font-bold text-clay text-left">Remove photo</button>
                  )}
                </div>
              </div>
              {entranceErr && <p className="text-[12px] text-clay mt-1.5">{entranceErr}</p>}
            </Field>
            <Field label="What you typically donate"><textarea rows={2} value={typicalDonation} onChange={(e) => setTd(e.target.value)} className={inputCls} placeholder='e.g. "6–8 trays of bread"' /></Field>
            <Field label="Holiday schedule" optional><textarea rows={2} value={holidaySchedule} onChange={(e) => setHoliday(e.target.value)} className={inputCls} placeholder="e.g. Closed Pesach week, Tisha BAv" /></Field>
          </Section>

          {/* C10 Aug 13 — structured hours + notification preferences.
              Sits below the existing free-text fields (which stay for backward
              compat) so the office gets machine-readable schedules to gate
              notifications against. */}
          <Section title="Store hours (structured)">
            <div className="text-[12px] text-muted mb-2 italic">Set the days and times your store is normally open. Leave a day off if closed.</div>
            <WeekHoursEditor value={storeHours} onChange={setStoreHours} />
          </Section>
          <Section title="Preferred contact hours (structured)">
            <div className="text-[12px] text-muted mb-2 italic">When drivers or the office should be able to reach you.</div>
            <WeekHoursEditor value={contactHoursStructured} onChange={setContactHoursStructured} />
          </Section>
          <Section title="Notifications">
            <Field label="Notify me via">
              <div className="flex flex-wrap gap-2">
                {(['app','sms','both','none'] as const).map((k) => (
                  <button key={k} type="button"
                          onClick={() => setNotifChannel(k)}
                          className={`px-3 py-1.5 rounded-full text-[13px] font-bold border-[1.4px] ${notifChannel === k ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line'}`}>
                    {k === 'app' ? 'App only' : k === 'sms' ? 'SMS only' : k === 'both' ? 'Both' : 'None'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Notification window">
              <div className="flex flex-wrap gap-2">
                {(['anytime','store_hours','custom'] as const).map((k) => (
                  <button key={k} type="button"
                          onClick={() => setNotifWindow(k)}
                          className={`px-3 py-1.5 rounded-full text-[13px] font-bold border-[1.4px] ${notifWindow === k ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line'}`}>
                    {k === 'anytime' ? 'Anytime' : k === 'store_hours' ? 'During store hours' : 'Custom quiet hours'}
                  </button>
                ))}
              </div>
            </Field>
            {notifWindow === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quiet from"><input type="time" value={quietHoursStart} onChange={(e) => setQuietStart(e.target.value)} className={inputCls} /></Field>
                <Field label="Quiet until"><input type="time" value={quietHoursEnd}   onChange={(e) => setQuietEnd(e.target.value)}   className={inputCls} /></Field>
              </div>
            )}
            <Field label="Quiet days (no notifications on)">
              <div className="flex flex-wrap gap-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((lbl, i) => {
                  const bit = 1 << i;
                  const on = (quietDays & bit) !== 0;
                  return (
                    <button key={lbl} type="button"
                            onClick={() => setQuietDays(on ? quietDays & ~bit : quietDays | bit)}
                            className={`px-3 py-1.5 rounded-full text-[13px] font-bold border-[1.4px] ${on ? 'bg-clay text-paper border-clay' : 'bg-paper text-muted border-line'}`}>
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Away from" help="Optional — pause optional pickup notifications."><input type="date" value={awayFrom}  onChange={(e) => setAwayFrom(e.target.value)}  className={inputCls} /></Field>
              <Field label="Away until"><input type="date" value={awayUntil} onChange={(e) => setAwayUntil(e.target.value)} className={inputCls} /></Field>
            </div>
            {awayFrom && awayUntil && (
              <div className="text-[12.5px] text-forest font-semibold">Notifications will resume after {awayUntil}.</div>
            )}
          </Section>

          {save.error && <p className="text-clay font-bold text-[14px] mt-4">{(save.error as Error).message}</p>}
          {done && <p className="text-forest font-bold text-[14px] mt-4">✓ Saved.</p>}

          <button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}
                  className="haptic w-full bg-forest text-paper rounded-[14px] py-4 font-bold text-[15px] shadow-ctag flex items-center justify-center gap-2 disabled:opacity-50 mt-6">
            <Save size={18} /> {save.isPending ? 'Saving…' : 'Save changes'}
          </button>

          <DangerZone />
        </FadeUp>}
      </main>
    </div>
  );
}

// Apple 2.1 (Aug 14) — mirrors the volunteer profile's Danger Zone.
function DangerZone() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => account.delete(),
    onSuccess: () => { setAuth(null, null); nav('/', { replace: true }); window.location.reload(); },
    onError: (e: any) => setErr(e?.message ?? 'Could not delete account. Try again.'),
  });
  const enabled = phrase.trim().toLowerCase() === 'delete my account';
  return (
    <>
      <div className="mt-10 rounded-[14px] border-2 border-clay/40 bg-clay/5 p-4">
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-clay mb-1">Danger zone</div>
        <div className="text-[13.5px] text-ink/80 leading-snug">
          Delete your account and personal info from Zeh L'Zeh. Past pickups stay in our records (anonymized). This can't be undone.
        </div>
        <button onClick={() => { setOpen(true); setPhrase(''); setErr(null); }}
                className="haptic mt-3 bg-clay text-paper font-bold text-[13.5px] px-4 py-2 rounded-[10px] shadow-ctag">
          Delete my account
        </button>
      </div>
      {open && (
        <div onClick={() => !mut.isPending && setOpen(false)}
             className="fixed inset-0 z-[3000] bg-ink/60 grid place-items-center p-4">
          <div onClick={(e) => e.stopPropagation()}
               className="bg-paper rounded-[18px] shadow-lift w-full max-w-sm p-5">
            <div className="font-display font-semibold text-[19px] text-clay">Delete your account?</div>
            <p className="text-[13.5px] text-ink/80 mt-2 leading-snug">
              This permanently removes your profile and personal info. Past pickups you completed stay in our records (anonymized). You can't undo this.
            </p>
            <div className="mt-4">
              <div className="text-[12px] text-muted mb-1">Type <b>delete my account</b> to confirm:</div>
              <input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus
                     className="w-full rounded-[10px] border-[1.4px] border-line px-3 py-2 text-[15px] outline-none focus:border-clay" />
            </div>
            {err && <p className="text-clay font-bold text-[13px] mt-2">{err}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} disabled={mut.isPending}
                      className="haptic text-[13px] font-bold text-muted px-3 py-2">Cancel</button>
              <button onClick={() => mut.mutate()} disabled={!enabled || mut.isPending}
                      className="haptic text-[13px] font-bold bg-clay text-paper px-4 py-2 rounded-[10px] shadow-ctag disabled:opacity-50">
                {mut.isPending ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-forest mb-3">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// C10 Aug 13 — 7-day open/close picker. Compact row-per-day layout with a
// Closed toggle so a supplier can flip a day off without touching the times.
const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'] as const;
const DAY_LABELS: Record<typeof DAY_KEYS[number], string> =
  { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
function WeekHoursEditor({ value, onChange }: { value: WeekHours; onChange: (v: WeekHours) => void }) {
  function setDay(key: typeof DAY_KEYS[number], patch: DayHours) {
    onChange({ ...value, [key]: patch });
  }
  return (
    <div className="border border-line rounded-[12px] overflow-hidden">
      {DAY_KEYS.map((k) => {
        const h = value[k] ?? null;
        const closed = h == null;
        return (
          <div key={k} className="flex items-center gap-2 px-3 py-2 border-t border-line first:border-t-0">
            <div className="w-10 font-extrabold text-[13px] text-forest">{DAY_LABELS[k]}</div>
            <button type="button"
                    onClick={() => setDay(k, closed ? { open: '09:00', close: '17:00' } : null)}
                    className={`text-[12px] font-bold px-2.5 py-1 rounded-full border ${closed ? 'bg-cream border-line text-muted' : 'bg-sage border-sage-line text-forest'}`}>
              {closed ? 'Closed' : 'Open'}
            </button>
            {!closed && (
              <>
                <input type="time" value={h!.open}  onChange={(e) => setDay(k, { open: e.target.value, close: h!.close })}
                       className="border border-line rounded-[8px] px-2 py-1 text-[13px] flex-1 max-w-[110px]" />
                <span className="text-muted text-[12px]">to</span>
                <input type="time" value={h!.close} onChange={(e) => setDay(k, { open: h!.open, close: e.target.value })}
                       className="border border-line rounded-[8px] px-2 py-1 text-[13px] flex-1 max-w-[110px]" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, help, optional, children }: { label: string; help?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12.5px] font-bold text-muted">
        {label}{optional && <span className="ml-1.5 text-[11px] font-normal uppercase tracking-[.06em]">optional</span>}
      </div>
      {help && <div className="text-[12px] text-muted italic mt-0.5">{help}</div>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
