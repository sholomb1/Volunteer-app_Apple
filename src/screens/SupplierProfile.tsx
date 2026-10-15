/**
 * Supplier self-edit screen — the store updates its own contact info,
 * pickup instructions, contact hours, etc. without bothering the office.
 * Backed by GET/PATCH /api/me/supplier-profile.
 *
 * Oct 9 client — shorter and honest:
 *   • Hours asked ONCE: "When can drivers pick up?" (preferred_pickup_window —
 *     the one the office sees on the supplier card). The free-text contact
 *     hours, both structured week-hour grids, typical donation and holiday
 *     schedule are gone from this screen (DB columns kept, values untouched —
 *     the office can still edit them).
 *   • Notification settings: quiet hours / quiet days / away dates and
 *     "Notify me via" were saved but nothing ever read them for stores —
 *     removed. One real question left: "Text me when a driver is on the way"
 *     → suppliers.sms_opt_in (what store-notices.ts reads).
 *   • Fields are <div>s; only single inputs get a real <label> (tapping a
 *     title used to pick an option / open the file picker).
 *   • Clearing logo / photo / email / hechsher now sticks (API change).
 *   • Logo help text matches the real limit (800 KB). 44px buttons, ≥14px text.
 *
 * Oct 11 client: "Text me when a driver is on the way" is replaced by
 * "How should we tell you?" — per notice (driver on the way / food picked up):
 * App pop-up / Text / Both / Off. Saved per store (API: noticeChoices). The
 * office switch still decides if a notice is used at all; when it's off the
 * row is greyed "Not in use yet" but the store can still pre-set it.
 * Old "No" to texts shows as App pop-up (same meaning, nothing lost).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { supplierSelf, account, setAuth } from '../api';
import { FadeUp, cx } from '../design';

const inputCls = 'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[15px] outline-none focus:border-forest';
// Oct 11 client: how the store wants each notice.
type NoticeChoice = 'app' | 'text' | 'both' | 'off';
type NoticeKey = 'onTheWay' | 'pickedUp';
const NOTICE_OPTIONS: Array<[NoticeChoice, string]> = [['app', 'App pop-up'], ['text', 'Text'], ['both', 'Both'], ['off', 'Off']];
const MAX_IMAGE = 800_000; // Oct 9 client: one limit for logo + entrance photo, and the help text says so.

export function SupplierProfile() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['supplier-self'], queryFn: supplierSelf.get });
  const profile = q.data?.data as any;

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
  const [kosherCertification, setHechsher] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [entrancePhotoUrl, setEntranceUrl] = useState<string | null>(null);
  const [entranceErr, setEntranceErr] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<NoticeKey, NoticeChoice>>({ onTheWay: 'both', pickedUp: 'both' });
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
    setHechsher(profile.kosherCertification ?? '');
    setLogoUrl(profile.logoUrl ?? null);
    setEntranceUrl(profile.entrancePhotoUrl ?? null);
    // Oct 11 client: the API already maps the old "No texts" / STOP to App pop-up.
    setChoices({ onTheWay: profile.noticeChoices?.onTheWay ?? (profile.smsOptIn === false ? 'app' : 'both'),
                 pickedUp: profile.noticeChoices?.pickedUp ?? (profile.smsOptIn === false ? 'app' : 'both') });
  }, [profile]);

  function readImageFile(file: File | null, setUrl: (s: string | null) => void, setErr: (s: string | null) => void) {
    setErr(null);
    if (!file) { setUrl(null); return; }
    if (!/^image\//.test(file.type)) { setErr('Please choose an image file.'); return; }
    if (file.size > MAX_IMAGE) { setErr('Image too big — keep it under 800 KB. Try a smaller version.'); return; }
    const r = new FileReader();
    r.onload = () => setUrl(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => setErr('Could not read this file.');
    r.readAsDataURL(file);
  }
  const onLogoFile     = (f: File | null) => readImageFile(f, setLogoUrl,     setLogoErr);
  const onEntranceFile = (f: File | null) => readImageFile(f, setEntranceUrl, setEntranceErr);

  const save = useMutation({
    // Only the fields on this screen are sent; anything not sent stays as is.
    // null / "" = clear it (Oct 9 API change).
    mutationFn: () => supplierSelf.patch({
      name, addressLine1, city, state, zip,
      contactName, contactPhone, contactEmail: contactEmail.trim() || null,
      pickupInstructions, preferredPickupWindow,
      kosherCertification: kosherCertification.trim() || null,
      logoUrl: logoUrl || null,
      entrancePhotoUrl: entrancePhotoUrl || null,
      noticeChoices: choices,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-self'] });
      qc.invalidateQueries({ queryKey: ['store-pickups'] });
      setDone(true); setTimeout(() => setDone(false), 3500);
    },
  });

  return (
    <div className="min-h-screen pb-[80px]">
      <div className="flex items-center gap-3 px-5 py-3">
        <button onClick={() => nav(-1)} aria-label="Back" className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line">
          <ArrowLeft size={20} />
        </button>
        <div className="font-display font-semibold text-[20px]">Edit store info</div>
      </div>
      <main className="px-5">
        {q.isLoading ? <p className="text-muted text-center py-10">Loading…</p> :
         !profile ? <p className="text-clay text-center py-10">No supplier profile linked to this account.</p> :
        <FadeUp>
          <Section title="Store">
            <Field id="sp-name" label="Store name"><input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
            <Field id="sp-hechsher" label="Hechsher / kosher certification" help="Shows on your pickup listings."><input id="sp-hechsher" value={kosherCertification} onChange={(e) => setHechsher(e.target.value)} className={inputCls} placeholder="e.g. OU, KAJ, Tartikov" /></Field>
            <Field label="Store logo" help="JPG or PNG, under 800 KB. Shows next to your name in the drivers' app.">
              <ImagePicker url={logoUrl} alt="Store logo" boxCls="h-16 w-16" empty="No logo"
                           onFile={onLogoFile} onRemove={() => setLogoUrl(null)} removeText="Remove logo" />
              {logoErr && <p className="text-[14px] text-clay mt-1.5">{logoErr}</p>}
            </Field>
          </Section>
          <Section title="Address">
            <Field id="sp-street" label="Street"><input id="sp-street" value={addressLine1} onChange={(e) => setAddr(e.target.value)} className={inputCls} /></Field>
            <Field id="sp-city" label="City"><input id="sp-city" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="sp-state" label="State"><input id="sp-state" value={state} onChange={(e) => setState(e.target.value)} className={inputCls} /></Field>
              <Field id="sp-zip" label="ZIP"><input id="sp-zip" value={zip} onChange={(e) => setZip(e.target.value)} className={inputCls} /></Field>
            </div>
          </Section>
          <Section title="Contact">
            <Field id="sp-cn" label="Contact name"><input id="sp-cn" value={contactName} onChange={(e) => setCN(e.target.value)} className={inputCls} /></Field>
            <Field id="sp-cp" label="Contact phone"><input id="sp-cp" type="tel" value={contactPhone} onChange={(e) => setCP(e.target.value)} className={inputCls} placeholder="(845) 555-1234" /></Field>
            <Field id="sp-ce" label="Contact email" optional><input id="sp-ce" type="email" value={contactEmail} onChange={(e) => setCE(e.target.value)} className={inputCls} /></Field>
          </Section>
          <Section title="Pickup">
            <Field id="sp-window" label="When can drivers pick up?"><input id="sp-window" value={preferredPickupWindow} onChange={(e) => setWindow(e.target.value)} className={inputCls} placeholder='e.g. "Sun–Thu after 4 PM, Fri until 1 PM"' /></Field>
            <Field id="sp-instr" label="Where should the driver park and go in?" help="Door, parking, who to ask for."><textarea id="sp-instr" rows={3} value={pickupInstructions} onChange={(e) => setInstr(e.target.value)} className={inputCls} placeholder="e.g. Park in the back lot, ring the bell at the side door" /></Field>
            <Field label="Entrance photo" help="Photo of the door the driver should go to. JPG or PNG, under 800 KB.">
              <ImagePicker url={entrancePhotoUrl} alt="Entrance" boxCls="h-24 w-32" empty="No photo"
                           onFile={onEntranceFile} onRemove={() => setEntranceUrl(null)} removeText="Remove photo" />
              {entranceErr && <p className="text-[14px] text-clay mt-1.5">{entranceErr}</p>}
            </Field>
          </Section>
          <Section title="How should we tell you?">
            {([['onTheWay', 'A driver is on the way'], ['pickedUp', 'Your food was picked up']] as Array<[NoticeKey, string]>).map(([k, label]) => {
              const inUse = profile.noticeOfficeOn?.[k] === true;
              return (
                <div key={k} className={cx(!inUse && 'opacity-60')}>
                  <div className="text-[15px] font-bold text-ink">{label}</div>
                  {!inUse && <div className="text-[14px] text-muted italic mt-0.5">Not in use yet — you can still choose now.</div>}
                  <div className="grid grid-cols-2 gap-2 mt-1.5" role="radiogroup" aria-label={label}>
                    {NOTICE_OPTIONS.map(([v, text]) => (
                      <button key={v} type="button" role="radio" aria-checked={choices[k] === v}
                              onClick={() => setChoices((c) => ({ ...c, [k]: v }))}
                              className={cx('haptic min-h-[44px] rounded-[12px] border-[1.4px] text-[15px] font-bold',
                                            choices[k] === v ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line')}>
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </Section>

          {save.error && <p className="text-clay font-bold text-[14px] mt-4">{(save.error as Error).message}</p>}
          {done && <p className="text-forest font-bold text-[15px] mt-4">✓ Saved.</p>}

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

// Oct 9 client: shared picker for logo + entrance photo. The "Upload…" label
// wraps only its own file input, so tapping the field title does nothing.
function ImagePicker({ url, alt, boxCls, empty, onFile, onRemove, removeText }: {
  url: string | null; alt: string; boxCls: string; empty: string;
  onFile: (f: File | null) => void; onRemove: () => void; removeText: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {url
        ? <img src={url} alt={alt} className={cx(boxCls, 'rounded-[12px] object-cover border border-line bg-paper')} />
        : <div className={cx(boxCls, 'rounded-[12px] border border-dashed border-line-2 grid place-items-center text-[14px] font-bold text-muted text-center px-1')}>{empty}</div>}
      <div className="flex flex-col gap-1.5">
        <label className="haptic cursor-pointer min-h-[44px] grid place-items-center rounded-[10px] border-[1.4px] border-line-2 bg-paper px-4 text-[15px] font-bold text-forest text-center">
          {url ? 'Replace…' : 'Upload…'}
          <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="hidden" />
        </label>
        {url && (
          <button type="button" onClick={onRemove} className="min-h-[44px] text-[14px] font-bold text-clay text-left">{removeText}</button>
        )}
      </div>
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
  const enabled = phrase.trim().toLowerCase() === 'delete';
  return (
    <>
      <div className="mt-10 rounded-[14px] border-2 border-clay/40 bg-clay/5 p-4">
        <div className="text-[14px] font-extrabold uppercase tracking-[.06em] text-clay mb-1">Danger zone</div>
        <div className="text-[14px] text-ink/80 leading-snug">
          Delete your account and personal info from Zeh L'Zeh. Past pickups stay in our records (anonymized). This can't be undone.
        </div>
        <button onClick={() => { setOpen(true); setPhrase(''); setErr(null); }}
                className="haptic mt-3 min-h-[44px] bg-clay text-paper font-bold text-[14px] px-4 rounded-[10px] shadow-ctag">
          Delete my account
        </button>
      </div>
      {open && (
        <div onClick={() => !mut.isPending && setOpen(false)}
             className="fixed inset-0 z-[3000] bg-ink/60 grid place-items-center p-4">
          <div onClick={(e) => e.stopPropagation()}
               className="bg-paper rounded-[18px] shadow-lift w-full max-w-sm p-5">
            <div className="font-display font-semibold text-[19px] text-clay">Delete your account?</div>
            <p className="text-[14px] text-ink/80 mt-2 leading-snug">
              This permanently removes your profile and personal info. Past pickups you completed stay in our records (anonymized). You can't undo this.
            </p>
            <div className="mt-4">
              <label htmlFor="sp-delete" className="block text-[14px] text-muted mb-1">Type <b>delete</b> to confirm:</label>
              <input id="sp-delete" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus
                     className="w-full rounded-[10px] border-[1.4px] border-line px-3 py-2.5 text-[15px] outline-none focus:border-clay" />
            </div>
            {err && <p className="text-clay font-bold text-[14px] mt-2">{err}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} disabled={mut.isPending}
                      className="haptic min-h-[44px] text-[14px] font-bold text-muted px-4">Cancel</button>
              <button onClick={() => mut.mutate()} disabled={!enabled || mut.isPending}
                      className="haptic min-h-[44px] text-[14px] font-bold bg-clay text-paper px-4 rounded-[10px] shadow-ctag disabled:opacity-50">
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
      <div className="text-[14px] font-extrabold uppercase tracking-[.06em] text-forest mb-3">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Oct 9 client: a <div>, not a <label> wrapping everything. Pass `id` (and
// the same id on the input) only when the field is a single input — then the
// title is a real <label htmlFor>.
function Field({ id, label, help, optional, children }: { id?: string; label: string; help?: string; optional?: boolean; children: React.ReactNode }) {
  const title = (
    <>
      {label}{optional && <span className="ml-1.5 text-[14px] font-normal text-muted">(optional)</span>}
    </>
  );
  return (
    <div>
      {id
        ? <label htmlFor={id} className="block text-[14px] font-bold text-muted">{title}</label>
        : <div className="text-[14px] font-bold text-muted">{title}</div>}
      {help && <div className="text-[14px] text-muted italic mt-0.5">{help}</div>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
