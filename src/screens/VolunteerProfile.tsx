/**
 * VolunteerProfile — self-edit screen for a driver. Backed by
 * GET/PATCH /api/me/volunteer-profile. Same shape as SupplierProfile so
 * drivers can maintain their contact info + service preferences without
 * bothering the office.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { volunteerSelf, account, setAuth } from '../api';
import { FadeUp } from '../design';

const inputCls = 'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[14.5px] outline-none focus:border-forest';
const VEHICLE_TYPES = ['sedan', 'suv', 'minivan', 'pickup', 'cargo-van'];
// C9 Aug 14 — day bitmask matches server: Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64.
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function VolunteerProfile() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['volunteer-self'], queryFn: volunteerSelf.get });
  const profile = q.data?.data;

  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [phonePrimary, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [homeAddress, setHome] = useState('');
  const [locationArea, setArea] = useState('');
  const [vehicleType, setVehicle] = useState('');
  const [vehicleCapacity, setCapacity] = useState('');
  const [refrigeratedHandling, setRefrig] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(true);
  // C9 Aug 14 — notification prefs state.
  const [notifChannel, setNotifChannel] = useState<'app' | 'sms' | 'both' | 'none'>('both');
  const [quietStart, setQuietStart] = useState<string>('');
  const [quietEnd, setQuietEnd] = useState<string>('');
  const [quietDays, setQuietDays] = useState<number>(0);
  const [vacationFrom, setVacationFrom] = useState<string>('');
  const [vacationUntil, setVacationUntil] = useState<string>('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFirst(profile.firstName ?? '');
    setLast(profile.lastName ?? '');
    setPhone(profile.phonePrimary ?? '');
    setEmail(profile.email ?? '');
    setHome(profile.homeAddress ?? '');
    setArea(profile.locationArea ?? '');
    setVehicle(profile.vehicleType ?? '');
    setCapacity(profile.vehicleCapacity ?? '');
    setRefrig(profile.refrigeratedHandling ?? '');
    setSmsOptIn(profile.smsOptIn ?? true);
    setNotifChannel(profile.notifChannel ?? 'both');
    setQuietStart((profile.quietHoursStart ?? '').slice(0, 5));
    setQuietEnd((profile.quietHoursEnd ?? '').slice(0, 5));
    setQuietDays(profile.quietDays ?? 0);
    setVacationFrom(profile.vacationFrom ?? '');
    setVacationUntil(profile.vacationUntil ?? '');
  }, [profile]);

  const save = useMutation({
    mutationFn: () => volunteerSelf.patch({
      firstName, lastName,
      phonePrimary: phonePrimary || null,
      email: email || null,
      homeAddress: homeAddress || null,
      locationArea: locationArea || null,
      vehicleType: vehicleType || null,
      vehicleCapacity: vehicleCapacity || null,
      refrigeratedHandling: refrigeratedHandling || null,
      smsOptIn,
      notifChannel,
      quietHoursStart: quietStart || null,
      quietHoursEnd:   quietEnd || null,
      quietDays,
      vacationFrom:  vacationFrom || null,
      vacationUntil: vacationUntil || null,
    }),
    onSuccess: () => { setDone(true); setTimeout(() => setDone(false), 3500); },
  });

  function toggleDay(idx: number) {
    setQuietDays((prev) => prev ^ (1 << idx));
  }

  return (
    <div className="min-h-screen pb-[80px]">
      <div className="flex items-center gap-3 px-5 py-3">
        <button onClick={() => nav(-1)} className="haptic grid h-9 w-9 place-items-center rounded-full bg-paper border border-line">
          <ArrowLeft size={18} />
        </button>
        <div className="font-display font-semibold text-[20px]">My profile</div>
      </div>
      <main className="px-5">
        {q.isLoading ? <p className="text-muted text-center py-10">Loading…</p> :
         !profile ? <p className="text-clay text-center py-10">No volunteer profile linked to this account.</p> :
        <FadeUp>
          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name"><input value={firstName} onChange={(e) => setFirst(e.target.value)} className={inputCls} /></Field>
              <Field label="Last name"><input value={lastName} onChange={(e) => setLast(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Phone"><input value={phonePrimary} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="(845) 555-1234" /></Field>
            <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="optional" /></Field>
            <Field label="Home address"><input value={homeAddress} onChange={(e) => setHome(e.target.value)} className={inputCls} /></Field>
          </Section>

          <Section title="Service preferences">
            <Field label="Preferred pickup area(s)" help="e.g. Monsey, Spring Valley, Wesley Hills">
              <input value={locationArea} onChange={(e) => setArea(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Vehicle type">
              <select value={vehicleType} onChange={(e) => setVehicle(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1).replace('-', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Vehicle capacity" help='e.g. "10 boxes" or "trunk + back seat"'>
              <input value={vehicleCapacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Refrigeration capability">
              <select value={refrigeratedHandling} onChange={(e) => setRefrig(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                <option value="yes">Yes — I have coolers / insulated bags</option>
                <option value="no">No</option>
              </select>
            </Field>
          </Section>

          {/* C9 Aug 14 — notification preferences: channel radio, quiet hours,
              quiet days, and Away/vacation range. Operational messages about
              already-accepted pickups still come through per client note. */}
          <Section title="Notification preferences">
            <Field label="How should we reach you?">
              <div className="grid grid-cols-2 gap-2">
                {(['both','app','sms','none'] as const).map((v) => (
                  <label key={v} className={`flex items-center gap-2 rounded-[10px] border-[1.4px] px-3 py-2.5 cursor-pointer transition ${notifChannel === v ? 'border-forest bg-sage/30 text-forest' : 'border-line bg-paper text-ink'}`}>
                    <input type="radio" name="notif-channel" checked={notifChannel === v} onChange={() => setNotifChannel(v)} className="h-4 w-4 accent-forest" />
                    <span className="font-bold text-[13.5px]">
                      {v === 'both' ? 'App + SMS' : v === 'app' ? 'App only' : v === 'sms' ? 'SMS only' : 'None'}
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Quiet hours" help="Broadcasts during this window are skipped.">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-[11.5px] font-bold text-muted mb-1">From</div>
                  <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <div className="text-[11.5px] font-bold text-muted mb-1">Until</div>
                  <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className={inputCls} />
                </label>
              </div>
              {(quietStart || quietEnd) && (
                <button type="button" onClick={() => { setQuietStart(''); setQuietEnd(''); }}
                        className="mt-2 text-[12px] font-bold text-clay">Clear quiet hours</button>
              )}
            </Field>

            <Field label="Quiet days" help="Tap a day to skip broadcasts on it (e.g. Shabbos).">
              <div className="flex flex-wrap gap-2">
                {DOW_LABELS.map((label, idx) => {
                  const on = (quietDays & (1 << idx)) !== 0;
                  return (
                    <button key={label} type="button" onClick={() => toggleDay(idx)}
                            className={`px-3.5 py-2 rounded-[10px] border-[1.4px] text-[13px] font-bold transition ${on ? 'border-forest bg-sage/40 text-forest' : 'border-line bg-paper text-ink'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Away / vacation">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-[11.5px] font-bold text-muted mb-1">From</div>
                  <input type="date" value={vacationFrom} onChange={(e) => setVacationFrom(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <div className="text-[11.5px] font-bold text-muted mb-1">Until</div>
                  <input type="date" value={vacationUntil} onChange={(e) => setVacationUntil(e.target.value)} className={inputCls} />
                </label>
              </div>
              {(vacationFrom || vacationUntil) && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="text-[12px] text-muted italic">
                    While Away you won't receive optional broadcasts.
                  </div>
                  <button type="button" onClick={() => { setVacationFrom(''); setVacationUntil(''); }}
                          className="ml-auto text-[12px] font-bold text-clay">Resume now</button>
                </div>
              )}
            </Field>

            <div className="rounded-[10px] border border-sage-line bg-sage/30 px-3 py-2.5 text-[12.5px] text-forest leading-snug">
              <b>Note:</b> Operational messages about pickups you've already accepted — schedule changes, cancellations, urgent updates — will still come through.
            </div>

            <label className="flex items-center gap-3 rounded-[12px] border border-line px-3.5 py-3 cursor-pointer">
              <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="h-5 w-5 accent-forest" />
              <div>
                <div className="text-[13.5px] font-bold text-ink">SMS alerts globally on</div>
                <div className="text-[11.5px] text-muted">Unchecking hard-mutes all SMS regardless of the channel above.</div>
              </div>
            </label>
          </Section>

          {save.error && <p className="text-clay font-bold text-[14px] mt-4">{(save.error as Error).message}</p>}
          {done && <p className="text-forest font-bold text-[14px] mt-4">✓ Saved.</p>}

          <button onClick={() => save.mutate()} disabled={save.isPending || !firstName.trim()}
                  className="haptic w-full bg-forest text-paper rounded-[14px] py-4 font-bold text-[15px] shadow-ctag flex items-center justify-center gap-2 disabled:opacity-50 mt-6">
            <Save size={18} /> {save.isPending ? 'Saving…' : 'Save changes'}
          </button>

          <DangerZone />
        </FadeUp>}
      </main>
    </div>
  );
}

// Apple 2.1 (Aug 14) — Danger Zone card at the bottom of profile. Two-step
// confirm: user must type "delete my account" (case-insensitive) to enable
// the destructive button. Server scrubs PII + anonymizes users row.
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

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12.5px] font-bold text-muted">{label}</div>
      {help && <div className="text-[12px] text-muted italic mt-0.5">{help}</div>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
