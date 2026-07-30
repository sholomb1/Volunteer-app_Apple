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
import { volunteerSelf } from '../api';
import { FadeUp } from '../design';

const inputCls = 'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[14.5px] outline-none focus:border-forest';
const VEHICLE_TYPES = ['sedan', 'suv', 'minivan', 'pickup', 'cargo-van'];

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
    }),
    onSuccess: () => { setDone(true); setTimeout(() => setDone(false), 3500); },
  });

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

          <Section title="Notifications">
            <label className="flex items-center gap-3 rounded-[12px] border border-line px-3.5 py-3 cursor-pointer">
              <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="h-5 w-5 accent-forest" />
              <div>
                <div className="text-[13.5px] font-bold text-ink">SMS alerts for new pickups</div>
                <div className="text-[11.5px] text-muted">Uncheck if you only want in-app push.</div>
              </div>
            </label>
          </Section>

          {save.error && <p className="text-clay font-bold text-[14px] mt-4">{(save.error as Error).message}</p>}
          {done && <p className="text-forest font-bold text-[14px] mt-4">✓ Saved.</p>}

          <button onClick={() => save.mutate()} disabled={save.isPending || !firstName.trim()}
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

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12.5px] font-bold text-muted">{label}</div>
      {help && <div className="text-[12px] text-muted italic mt-0.5">{help}</div>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
