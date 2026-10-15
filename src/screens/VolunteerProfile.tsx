/**
 * VolunteerProfile — self-edit screen for a driver. Backed by
 * GET/PATCH /api/me/volunteer-profile. Same shape as SupplierProfile so
 * drivers can maintain their contact info + service preferences without
 * bothering the office.
 * Oct 14 client: how we reach you (Text / WhatsApp / Both / App only), quiet
 * times, away, call hours and text commands moved to Settings; the sign-up
 * answers are under My application. Both are linked at the top.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, FileText, Save, Settings as SettingsIcon } from 'lucide-react';
import { volunteerSelf, account, setAuth } from '../api';
import { FadeUp, setUnsavedGuard, confirmLeaveIfUnsaved } from '../design';
import { LocationShareCard, LoadError, NOT_LINKED_TEXT, isNotLinked } from './VolunteerHome';
import { driverError } from './driver-card';
import { REACH_SHORT, useDriverSettings } from '../driver-settings';
import { PhoneListEditor, phonesStateFrom, phonesPayload, phonesError, callNumberOf, type PhonesState } from '../phone-list'; // Oct 14 client: more than one number

// Oct 9 client: 16px so iPhones don't zoom in when a field is tapped.
const inputCls = 'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[16px] outline-none focus:border-forest';
const VEHICLE_TYPES = ['sedan', 'suv', 'minivan', 'pickup', 'cargo-van'];

export function VolunteerProfile() {
  const nav = useNavigate();
  // Oct 14 client: a failed load (no signal, filter, server error) used to say "No volunteer profile
  // linked" — now only the API's 404 "not linked" says that (no retries for it), anything else says why.
  const q = useQuery({ queryKey: ['volunteer-self'], queryFn: volunteerSelf.get,
    retry: (n, e) => !isNotLinked(e) && n < 2 });
  const profile = q.data?.data;
  const settings = useDriverSettings();
  const st = settings.data?.data;

  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  // Oct 14 client: up to 3 numbers — which gets texts, which is best to call.
  const [phones, setPhones] = useState<PhonesState>(() => phonesStateFrom(null));
  const phonePrimary = callNumberOf(phones);
  const phonesErr = phonesError(phones);
  const [email, setEmail] = useState('');
  const [homeAddress, setHome] = useState('');
  const [locationArea, setArea] = useState('');
  const [vehicleType, setVehicle] = useState('');
  const [vehicleCapacity, setCapacity] = useState('');
  const [refrigeratedHandling, setRefrig] = useState('');
  const [done, setDone] = useState(false);
  // Oct 9 client: track unsaved edits so we can show a Save bar and ask
  // "Leave without saving?" instead of silently dropping changes.
  const [baseline, setBaseline] = useState<string | null>(null);
  const snapshot = JSON.stringify([firstName, lastName, phonesPayload(phones), email, homeAddress, locationArea, vehicleType,
    vehicleCapacity, refrigeratedHandling]);
  const dirty = baseline !== null && snapshot !== baseline;
  useEffect(() => { setUnsavedGuard(dirty); }, [dirty]);
  useEffect(() => () => setUnsavedGuard(false), []);

  useEffect(() => {
    if (!profile) return;
    const ph = phonesStateFrom(profile.phones as any, profile.phonePrimary);
    setBaseline(JSON.stringify([profile.firstName ?? '', profile.lastName ?? '', phonesPayload(ph), profile.email ?? '',
      profile.homeAddress ?? '', profile.locationArea ?? '', profile.vehicleType ?? '', profile.vehicleCapacity ?? '',
      profile.refrigeratedHandling ?? '']));
    setFirst(profile.firstName ?? '');
    setLast(profile.lastName ?? '');
    setPhones(ph);
    setEmail(profile.email ?? '');
    setHome(profile.homeAddress ?? '');
    setArea(profile.locationArea ?? '');
    setVehicle(profile.vehicleType ?? '');
    setCapacity(profile.vehicleCapacity ?? '');
    setRefrig(profile.refrigeratedHandling ?? '');
  }, [profile]);

  const save = useMutation({
    mutationFn: (_snap: string) => volunteerSelf.patch({
      // Tier-2 fix: server has firstName/lastName as string().min(1) when
      // present, and the save used to blow up with a zod error the moment a
      // driver blanked their last name. Omit the field entirely when empty
      // so we don't paint a required-name over a truly optional edit; the
      // Save button already guards against blanking the first name.
      ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
      ...(lastName.trim()  ? { lastName:  lastName.trim()  } : {}),
      phonePrimary: phonePrimary || null,
      phones: phonesPayload(phones), // Oct 14 client
      email: email || null,
      homeAddress: homeAddress || null,
      locationArea: locationArea || null,
      vehicleType: vehicleType || null,
      vehicleCapacity: vehicleCapacity || null,
      refrigeratedHandling: refrigeratedHandling || null,
      // Oct 14 client: notification settings are saved from Settings (/api/me/settings).
    }),
    // Oct 9: the snapshot taken when Save was tapped becomes the new "saved" state.
    onSuccess: (_r, snap: string) => { setBaseline(snap); setDone(true); setTimeout(() => setDone(false), 3500); },
  });

  const go = async (to: string) => { if (await confirmLeaveIfUnsaved()) nav(to); };
  const reachLine = !st ? 'How we reach you, pause, quiet hours, call hours'
    : st.channel === 'none' ? 'Pickups by: nothing · pause, quiet hours, call hours'
    : `Pickups by: ${REACH_SHORT[st.channel]} · pause, quiet hours, call hours`;

  return (
    <div className="min-h-screen pb-[80px]">
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Oct 9 client: 44px back button; asks before dropping unsaved edits. */}
        {/* Oct 14 client: opened from the tab bar there is no page to go back to → Home. */}
        <button onClick={async () => { if (await confirmLeaveIfUnsaved()) { if (window.history.length <= 1) nav('/', { replace: true }); else nav(-1); } }} aria-label="Back"
                className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line">
          <ArrowLeft size={20} />
        </button>
        <div className="font-display font-semibold text-[20px]">My profile</div>
      </div>
      <main className="px-5">
        {/* Oct 14 client: Settings + My application */}
        <div className="rounded-[16px] border border-line bg-paper divide-y divide-line overflow-hidden">
          <LinkRow icon={<SettingsIcon size={19} />} label="Settings" sub={reachLine} onClick={() => void go('/settings')} />
          <LinkRow icon={<FileText size={19} />} label="My application" sub="See or update your sign-up answers" onClick={() => void go('/application')} />
        </div>
        <LocationShareCard />
        {q.isLoading ? <p className="text-muted text-center py-10">Loading…</p> :
         q.isError && !profile ? <LoadError onRetry={() => q.refetch()} busy={q.isFetching} error={q.error} what="your profile" /> :
         !profile ? <p className="text-clay text-center py-10">{NOT_LINKED_TEXT}</p> :
        <FadeUp>
          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" htmlFor="vp-first"><input id="vp-first" value={firstName} onChange={(e) => setFirst(e.target.value)} className={inputCls} /></Field>
              <Field label="Last name" htmlFor="vp-last"><input id="vp-last" value={lastName} onChange={(e) => setLast(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Phone numbers" help="Have more than one? Add it, then pick which one gets texts and which one we should call." htmlFor="vp-phone-0">
              <PhoneListEditor value={phones} onChange={setPhones} big idPrefix="vp-phone" />
              {phonesErr && <div className="text-clay text-[14px] font-bold mt-1">{phonesErr}</div>}
            </Field>
            <Field label="Email" htmlFor="vp-email"><input id="vp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="optional" /></Field>
            <Field label="Home address" htmlFor="vp-home"><input id="vp-home" value={homeAddress} onChange={(e) => setHome(e.target.value)} className={inputCls} /></Field>
          </Section>

          <Section title="Service preferences">
            <Field label="Preferred pickup area(s)" help="e.g. Monsey, Spring Valley, Wesley Hills" htmlFor="vp-area">
              <input id="vp-area" value={locationArea} onChange={(e) => setArea(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Vehicle type" htmlFor="vp-vehicle">
              <select id="vp-vehicle" value={vehicleType} onChange={(e) => setVehicle(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1).replace('-', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Vehicle capacity" help='e.g. "10 boxes" or "trunk + back seat"' htmlFor="vp-capacity">
              <input id="vp-capacity" value={vehicleCapacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Refrigeration capability" htmlFor="vp-refrig">
              <select id="vp-refrig" value={refrigeratedHandling} onChange={(e) => setRefrig(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                <option value="yes">Yes — I have coolers / insulated bags</option>
                <option value="no">No</option>
              </select>
            </Field>
          </Section>

          <DangerZone />

          {/* Oct 9 client: sticky Save bar — shows when something changed, so
              edits aren't lost by scrolling away from a button at the bottom. */}
          {(dirty || done || save.error) && (
            <div className="sticky bottom-0 z-10 -mx-5 mt-6 border-t border-line bg-paper/95 backdrop-blur px-5 py-3 shadow-lift">
              {save.error ? <p className="text-clay font-bold text-[15px] mb-2">{driverError(save.error, "Couldn't save. Please try again.")}</p> : null}{/* Oct 14 client: no raw errors */}
              {dirty ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-[15px] font-bold text-ink leading-snug">You have unsaved changes</div>
                  <button onClick={() => save.mutate(snapshot)} disabled={save.isPending || !firstName.trim() || !!phonesErr}
                          className="haptic shrink-0 bg-forest text-paper rounded-[12px] px-5 min-h-[48px] font-bold text-[16px] shadow-ctag flex items-center gap-2 disabled:opacity-50">
                    <Save size={18} /> {save.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : done ? (
                <div className="text-forest font-bold text-[15px]">✓ Saved.</div>
              ) : null}
              {dirty && !firstName.trim() && <div className="text-clay text-[14px] font-bold mt-1">First name can't be empty.</div>}
            </div>
          )}
        </FadeUp>}
      </main>
    </div>
  );
}

function LinkRow({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="haptic w-full min-h-[60px] flex items-center gap-3 px-4 py-3 text-left">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-sage text-forest shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-bold text-ink">{label}</span>
        <span className="block text-[14px] text-muted leading-snug">{sub}</span>
      </span>
      <ChevronRight size={18} className="text-muted shrink-0" />
    </button>
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
  const enabled = phrase.trim().toLowerCase() === 'delete';
  return (
    <>
      <div className="mt-10 rounded-[14px] border-2 border-clay/40 bg-clay/5 p-4">
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-clay mb-1">Danger zone</div>
        <div className="text-[13.5px] text-ink/80 leading-snug">
          Delete your account and personal info from Zeh L'Zeh. Past pickups stay in our records (anonymized). This can't be undone.
        </div>
        <button onClick={() => { setOpen(true); setPhrase(''); setErr(null); }}
                className="haptic mt-3 bg-clay text-paper font-bold text-[15px] px-4 min-h-[44px] rounded-[10px] shadow-ctag">
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
              <div className="text-[13px] text-muted mb-1">Type <b>delete</b> to confirm:</div>
              <input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus
                     className="w-full rounded-[10px] border-[1.4px] border-line px-3 py-2 min-h-[44px] text-[16px] outline-none focus:border-clay" />
            </div>
            {err && <p className="text-clay font-bold text-[13px] mt-2">{err}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} disabled={mut.isPending}
                      className="haptic text-[15px] font-bold text-muted px-4 min-h-[44px]">Cancel</button>
              {/* Oct 9 client: 44px / 15px buttons. */}
              <button onClick={() => mut.mutate()} disabled={!enabled || mut.isPending}
                      className="haptic text-[15px] font-bold bg-clay text-paper px-4 min-h-[44px] rounded-[10px] shadow-ctag disabled:opacity-50">
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

// Oct 9 client: was a <label> wrapping the whole group, so tapping a heading
// ("Quiet days", "How should we reach you?") toggled the first control inside.
// Now a plain div; single-input fields pass `htmlFor` to get a real label.
function Field({ label, help, htmlFor, children }: { label: string; help?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="block">
      {htmlFor
        ? <label htmlFor={htmlFor} className="block text-[14px] font-bold text-muted">{label}</label>
        : <div className="text-[14px] font-bold text-muted">{label}</div>}
      {help && <div className="text-[14px] text-muted italic mt-0.5">{help}</div>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
