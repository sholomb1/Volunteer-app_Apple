/**
 * Supplier self-edit screen — the store updates its own contact info,
 * pickup instructions, contact hours, etc. without bothering the office.
 * Backed by GET/PATCH /api/me/supplier-profile.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { supplierSelf } from '../api';
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

          {save.error && <p className="text-clay font-bold text-[14px] mt-4">{(save.error as Error).message}</p>}
          {done && <p className="text-forest font-bold text-[14px] mt-4">✓ Saved.</p>}

          <button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}
                  className="haptic w-full bg-forest text-paper rounded-[14px] py-4 font-bold text-[15px] shadow-ctag flex items-center justify-center gap-2 disabled:opacity-50 mt-6">
            <Save size={18} /> {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </FadeUp>}
      </main>
    </div>
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
