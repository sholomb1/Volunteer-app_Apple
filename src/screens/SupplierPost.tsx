/**
 * Supplier "Post a Pickup" — Oct 7 client: three quick questions (what /
 * how much / when) plus an optional driver note; see SupplierCreate.
 *
 * Also serves as the EDIT form (client Aug 7 abc783): when the route matches
 * /supplier/pickups/:id/edit, we prefill from GET /me/supplier-pickups/:id and
 * PATCH on save instead of POST /supplier/notify. The edit UI hides the
 * chip-quantity-container synthesizer (those don't round-trip from a stored
 * notes string) and shows the actual editable columns directly.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, supplier, supplierSelf, type AuthUser } from '../api';
import { AppBar, Avatar, StickyCTA, cx } from '../design';
import { fmtTime } from '../time-format';
import { storeInitials } from './SupplierHome';
// Oct 14 client: office-editable choices + text helpers for the new store form.
import { CAR_SIZE, STORE_POST_FORM_DEFAULTS, carSize, composeAmount, composeFood, parseLast, unitWord, type StorePostFormCfg } from '../store-post-config';
import { ExtraContactsEditor, extraContactsPayload, extraPhonesBad, type ExtraContact } from '../extra-contacts'; // Oct 12 client

// Oct 9 client: same office number the driver screens use.
const OFFICE_PHONE = '(845) 363-5323';
const IN_PROGRESS_MSG = "A driver is already on the way, so this can't be changed here. Please call the office: (845) 363-5323.";

export function SupplierPost({ user }: { user: AuthUser }) {
  const params = useParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const isEditing = editingId != null && Number.isFinite(editingId);
  if (isEditing) return <SupplierEdit id={editingId!} user={user} />;
  return <SupplierCreate user={user} />;
}

// Oct 14 client: store post form redesign (owner-approved layout, no "keep cold"):
//   1 What's ready?   food chips (+ Other), "Or type it", kosher (optional), photo (optional)
//   2 How many?       counter 1-99 + unit chips -> automatic car-size line
//   3 How many drivers? 1 / 2 / 3+ (defaults from the car size) -> slots_capacity
//   4 When?           Now / In 1 hour / Later (time) + optional "Must be gone by"
//   5 Who to ask for  "Used before" box
// Stored without a migration (see store-post-config.ts):
//   food_description "Fleishig · Cooked, Baked — chicken & rice", estimated_quantity "6 trays · fits in one car",
//   slots_capacity = drivers, must_pickup_by = gone by, photo_url = photo.
// The choices come from GET /api/me/store-post-form (office edits them in Admin -> Settings).
const AMOUNTS = [
  { v: 'A few boxes / bags', hint: 'fits on a car seat' },
  { v: 'Car trunk full',     hint: 'one car' },
  { v: 'Big load',           hint: 'van or 2 cars' },
];

type When = 'now' | 'hour' | 'later';
type Repeat = { food: string; amount: string; note?: string; driversNeeded?: number };

function SupplierCreate({ user }: { user: AuthUser }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['supplier-self'], queryFn: supplierSelf.get });
  const prof: any = profileQ.data?.data ?? {};
  const storeName = prof.name || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Your store';
  const storeAddr = [prof.addressLine1, prof.city].filter(Boolean).join(', ');

  // Oct 14 client: office-editable choices; falls back to the built-in list.
  const cfgQ = useQuery({
    queryKey: ['store-post-form'],
    queryFn: () => api<{ data: StorePostFormCfg }>('/api/me/store-post-form'),
    staleTime: 5 * 60_000, retry: 1,
  });
  const cfg: StorePostFormCfg = cfgQ.data?.data ?? STORE_POST_FORM_DEFAULTS;
  const cfgReady = !cfgQ.isLoading;

  // Oct 8 client: "Same as last time" on the home screen opens this already filled in.
  const repeat = ((useLocation().state as any)?.repeat ?? null) as null | Repeat;
  const [types, setTypes] = useState<string[]>([]);
  const [otherOn, setOtherOn] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [detail, setDetail] = useState('');
  const [kosher, setKosher] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [count, setCount] = useState(1);
  const [unitLabel, setUnitLabel] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<number | null>(null); // null = follow the car-size suggestion
  const [when, setWhen] = useState<When>('now');
  const [laterTime, setLaterTime] = useState<string>(() => defaultTime(60));
  const [goneBy, setGoneBy] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<null | { sent: boolean; noAddress: boolean; summary: string }>(null);
  const [needFood, setNeedFood] = useState(false);

  // Oct 14 client: "Same as last time" fills the new taps (once the choices are loaded).
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !cfgReady) return;
    setPrefilled(true);
    if (!repeat) return;
    const p = parseLast(cfg, repeat.food, repeat.amount);
    setKosher(p.kosher); setTypes(p.types); setDetail(p.detail);
    if (p.other) { setOtherOn(true); setOtherText(p.other); }
    setCount(p.count); if (p.unit) setUnitLabel(p.unit);
    if (repeat.driversNeeded && repeat.driversNeeded > 1) setDrivers(Math.min(3, repeat.driversNeeded));
  }, [cfgReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Oct 11 client: "Used before" — this store's own past contacts (name + phone) with the
  // address and note used with them, most used first; default = most used; or someone else.
  // Served by GET /api/me/supplier/past-contacts (scoped to this login's store on the server).
  const pastQ = useQuery({
    queryKey: ['supplier-past-contacts'],
    queryFn: () => api<{ data: { storeAddress: string | null; options: StorePastOpt[] } }>('/api/me/supplier/past-contacts'),
    staleTime: 60_000,
  });
  const pastOpts = pastQ.data?.data?.options ?? [];
  const homeAddr = pastQ.data?.data?.storeAddress ?? storeAddr;
  const [pickKey, setPickKey] = useState<string | null>(null);
  const [pastMore, setPastMore] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [otherAddr, setOtherAddr] = useState('');
  const [contactErr, setContactErr] = useState<string | null>(null);
  // Oct 12 client: "+ Add another contact" — up to 3 more (name optional + phone).
  const [extras, setExtras] = useState<ExtraContact[]>([]);
  const extrasBad = extraPhonesBad(extras);
  const [extrasErr, setExtrasErr] = useState(false);
  const selKey = pickKey ?? pastOpts[0]?.key ?? null;
  const sel = pastOpts.find((o) => o.key === selKey) ?? null;
  const isOther = selKey === 'other';
  const sameAddr = (a: string | null | undefined) => !a || normAddr(a) === normAddr(homeAddr) || normAddr(a) === normAddr(prof.addressLine1);
  const useAddr = isOther ? otherAddr.trim() : (sel?.address ?? '');
  const sendAddr = useAddr && !sameAddr(useAddr) ? useAddr : undefined;
  const contactBody = isOther
    ? { contactName: otherName.trim() || undefined, contactPhone: otherPhone.trim() || undefined, pickupAddress: sendAddr }
    : sel ? { contactName: sel.name ?? undefined, contactPhone: sel.phone ?? undefined, pickupAddress: sendAddr } : {};
  const contactBad = isOther && !!otherPhone.trim() && otherPhone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10;
  function choosePast(o: StorePastOpt | null) {
    setContactErr(null);
    if (!o) {
      setPickKey('other');
      // Prefill the store's own address / phone when empty.
      if (!otherAddr.trim() && homeAddr) setOtherAddr(homeAddr);
      if (!otherPhone.trim() && prof.contactPhone) setOtherPhone(String(prof.contactPhone));
      return;
    }
    setPickKey(o.key);
    if (o.instructions && !note.trim()) { setNote(o.instructions); setShowNote(true); }
  }

  const toggleType = (t: string) => { setNeedFood(false); setTypes((s) => s.includes(t) ? s.filter((x) => x !== t) : [...s, t]); };
  // Keep the order of the chips, whatever order they were tapped in.
  const pickedTypes = [
    ...cfg.foods.map((f) => f.label).filter((l) => types.includes(l)),
    ...types.filter((t) => !cfg.foods.some((f) => f.label === t)),
    ...(otherOn ? [otherText.trim() ? `Other: ${otherText.trim()}` : 'Other'] : []),
  ];
  const kosherOn = cfg.showKosher && cfg.kosher.length > 0;
  const kosherPick = kosherOn ? kosher : '';
  const food = composeFood(kosherPick, pickedTypes, detail);
  const hasFood = pickedTypes.length > 0 || !!detail.trim();
  const unit = cfg.units.find((u) => u.label === unitLabel) ?? cfg.units[0];
  const size = carSize(count, unit);
  const amount = composeAmount(count, unit);
  const suggestDrivers = size === 'van' ? 2 : 1;
  const driversN = drivers ?? suggestDrivers;

  // Oct 9 client: "Later today" can't be earlier than now, and close to
  // midnight there's no "later today" left — ask them to post tomorrow.
  const nowHHMM = defaultTime(0);
  const lateNight = nowHHMM >= '23:00';
  const time = when === 'later' ? laterTime : when === 'hour' ? defaultTime(60) : nowHHMM;
  const timeErr = when === 'now' ? null
    : lateNight ? `It's almost midnight. For tomorrow, please post in the morning, or call the office: ${OFFICE_PHONE}.`
    : when === 'later' && laterTime < nowHHMM ? 'That time already passed. Pick a later time, or tap Now.'
    : null;
  const goneErr = goneBy && goneBy <= time ? 'The "gone by" time must be after the driver can come.' : null;

  // Summary: "✓ 6 trays of cooked food (fleishig), ready now · 1 driver"
  const qtyText = unit ? `${count} ${unitWord(unit.label, count)}` : '';
  const typesText = pickedTypes.map((t) => t.replace(/^Other: /, '').toLowerCase()).join(', ');
  const whatText = typesText ? `${qtyText} of ${typesText}${pickedTypes.length === 1 && !otherOn ? ' food' : ''}` : detail.trim() ? `${qtyText}: ${detail.trim()}` : qtyText;
  const whenText = when === 'now' ? 'ready now' : `ready at ${fmtTime(time)}`;
  const summary = `${whatText}${kosherPick ? ` (${kosherPick.toLowerCase()})` : ''}, ${whenText}${goneBy ? `, gone by ${fmtTime(goneBy)}` : ''} · ${driversN} driver${driversN === 1 ? '' : 's'}`;

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setPhotoBusy(true);
    try { setPhoto(await shrinkPhoto(f)); } catch { setPhoto(null); } finally { setPhotoBusy(false); }
  }

  const notify = useMutation({
    mutationFn: () => api<{ data: { id: number }; autoBroadcast?: { sent: number; reason?: string } }>('/api/me/supplier/notify', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'ready',
        time,
        readyTill: goneBy || undefined,
        foodDescription: food || undefined,
        estimatedQuantity: amount || undefined,
        drivers: driversN,
        photoUrl: photo || undefined,
        pickupInstructions: note.trim() || undefined,
        // Office-only summary (older office screens read notes).
        notes: [food, amount, driversN > 1 ? `${driversN} drivers` : '', goneBy ? `gone by ${fmtTime(goneBy)}` : ''].filter(Boolean).join(' · ') || undefined,
        ...contactBody,
        extraContacts: extraContactsPayload(extras), // Oct 12 client: + Add another contact
      }),
    }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['supplier-pickups'] });
      qc.invalidateQueries({ queryKey: ['store-pickups'] });
      setDone({ sent: !!r?.autoBroadcast?.sent, noAddress: /no-addressable/.test(String(r?.autoBroadcast?.reason ?? '')), summary });
    },
  });

  // Oct 8 client: one store-friendly message (no "text round" talk) + a recap
  // of what they sent, so they know it went through right.
  if (done) {
    const row = (label: string, value: string) => (
      <div className="flex justify-between gap-3 py-1.5 text-[14px]">
        <span className="text-muted">{label}</span><span className="font-semibold text-right">{value}</span>
      </div>
    );
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-sage text-forest text-[40px] font-bold">✓</div>
        <h1 className="font-display font-semibold text-[26px] mt-4">Thank you, {storeName}!</h1>
        {done.noAddress ? (
          <p className="text-[15px] text-clay font-semibold mt-2 max-w-[320px]">
            We saved your post, but couldn't text drivers because your store address is missing. Please call the office.
          </p>
        ) : (
          <p className="text-[15px] text-muted mt-2 max-w-[320px]">
            We got your pickup and we're letting our drivers know. We'll text you when a driver is on the way, and you'll see their name under <b>My pickups</b>.
          </p>
        )}
        <div className="mt-4 w-full max-w-[320px] rounded-[14px] border border-line bg-paper px-4 py-2 text-left divide-y divide-line/60">
          {row('What', food || '—')}
          {amount && row('How many', amount)}
          {row('Drivers', String(driversN))}
          {row('When', when === 'now' ? 'Now' : fmtTime(time))}
          {goneBy && row('Gone by', fmtTime(goneBy))}
        </div>
        <button onClick={() => nav('/my-pickups', { replace: true })}
                className="haptic mt-5 w-full max-w-[320px] rounded-[14px] bg-forest py-3.5 text-[16px] font-bold text-paper">See my pickups</button>
        <button onClick={() => nav('/', { replace: true })}
                className="haptic mt-2 w-full max-w-[320px] rounded-[14px] border border-line bg-paper py-3 text-[15px] font-bold text-ink">Done</button>
        <p className="mt-4 text-[14px] text-muted max-w-[320px]">Something changed? Edit or cancel it under My pickups, or chat with the office from the home screen.</p>
      </div>
    );
  }

  const pill = (on: boolean) => cx('haptic min-h-[44px] rounded-[12px] border-[1.4px] px-3 text-[15px] font-bold', on ? 'border-forest bg-sage text-forest' : 'border-line-2 bg-paper text-ink');

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => nav(-1)} aria-label="Back" className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={20} /></button>
        <Avatar initials={storeInitials(storeName)} />
      </div>
      <AppBar title="New Pickup" leftMark="ז" altMark right={null} />

      {/* Oct 14 client: room under the last card for the sticky Send button + phone safe area. */}
      <main className="px-5 flex-1" style={{ paddingBottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}>
        {repeat && (
          <div className="mb-3 rounded-[12px] bg-clay-soft border border-clay/30 px-3.5 py-2.5 text-[14px]">
            {/* Oct 11 client: clearly a draft they can change. */}
            <b>Filled in from last time.</b> Every field below can be changed — check them all, then tap <b>Send to drivers</b>.
          </div>
        )}
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
          <div className="text-[14px] font-bold text-muted">Pickup from</div>
          <div className="font-display font-semibold text-[18px] leading-tight">{storeName}</div>
          {storeAddr && <div className="text-[14px] text-muted">{storeAddr}</div>}
          {sendAddr && <div className="text-[14px] font-bold text-clay">This time: 📍 {sendAddr}</div>}
          <button onClick={() => nav('/profile')} className="min-h-[44px] text-[14px] font-bold text-forest hover:underline">Wrong address? Edit store info</button>
        </div>

        <Field label="1 · What's ready? (tap any)">
          <div data-food-chips className="flex flex-wrap gap-2">
            {cfg.foods.map((f) => (
              <button key={f.label} type="button" onClick={() => toggleType(f.label)} aria-pressed={types.includes(f.label)}
                      className={cx('chip min-h-[44px]', types.includes(f.label) && 'clay-on')}>{f.emoji ? `${f.emoji} ` : ''}{f.label}</button>
            ))}
            <button type="button" onClick={() => { setNeedFood(false); setOtherOn((v) => !v); }} aria-pressed={otherOn}
                    className={cx('chip min-h-[44px]', otherOn && 'clay-on')}>➕ Other</button>
          </div>
          {otherOn && (
            <input value={otherText} onChange={(e) => setOtherText(e.target.value.slice(0, 40))} placeholder="What is it? e.g. soup"
                   className="mt-2 w-full min-h-[44px] rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[15px] outline-none focus:border-forest" />
          )}
          <input value={detail} onChange={(e) => { setNeedFood(false); setDetail(e.target.value); }}
                 placeholder="Or type it — e.g. chicken & rice"
                 className={cx('mt-2 w-full min-h-[44px] rounded-[12px] border-[1.4px] bg-paper px-3.5 py-2.5 text-[15px] outline-none focus:border-forest', needFood ? 'border-clay' : 'border-line-2')} />
          {needFood && <div className="mt-1.5 text-[14px] font-bold text-clay">Please tap what's ready, or type it.</div>}
          {kosherOn && (
            <div className="mt-3">
              <div className="text-[14px] font-bold text-muted mb-1.5">Kosher (optional)</div>
              <div className="flex flex-wrap gap-2">
                {cfg.kosher.map((k) => (
                  <button key={k} type="button" onClick={() => setKosher(kosher === k ? '' : k)} aria-pressed={kosher === k} className={pill(kosher === k)}>{k}</button>
                ))}
              </div>
            </div>
          )}
          {cfg.showPhoto && (
            <div className="mt-3">
              {photo ? (
                <div className="flex items-center gap-3">
                  <img src={photo} alt="Your photo" className="h-16 w-16 rounded-[10px] object-cover border border-line" />
                  <button type="button" onClick={() => setPhoto(null)} className="haptic min-h-[44px] text-[14px] font-bold text-clay underline underline-offset-2">Remove photo</button>
                </div>
              ) : (
                <label className="haptic inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[12px] border-[1.4px] border-dashed border-line-2 bg-paper px-3.5 text-[15px] font-bold text-ink">
                  📷 {photoBusy ? 'Adding…' : 'Add a photo'} <span className="font-normal text-muted">(optional)</span>
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              )}
            </div>
          )}
        </Field>

        <Field label="2 · How many?">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="One less" onClick={() => setCount((c) => Math.max(1, c - 1))}
                    className="haptic grid h-[52px] w-[52px] place-items-center rounded-[12px] border-[1.4px] border-line-2 bg-paper text-[26px] font-bold">−</button>
            <input data-count inputMode="numeric" value={count} aria-label="How many"
                   onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '').slice(0, 2)); setCount(Math.min(99, Math.max(1, n || 1))); }}
                   className="h-[52px] w-[64px] rounded-[12px] border-[1.4px] border-line-2 bg-paper text-center font-display text-[24px] font-bold outline-none focus:border-forest" />
            <button type="button" aria-label="One more" onClick={() => setCount((c) => Math.min(99, c + 1))}
                    className="haptic grid h-[52px] w-[52px] place-items-center rounded-[12px] border-[1.4px] border-line-2 bg-paper text-[26px] font-bold">+</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {cfg.units.map((u) => (
              <button key={u.label} type="button" onClick={() => setUnitLabel(u.label)} aria-pressed={unit?.label === u.label} className={pill(unit?.label === u.label)}>{u.label}</button>
            ))}
          </div>
          <div data-car-size className="mt-2 text-[15px] font-bold text-forest">{CAR_SIZE[size].icon} {CAR_SIZE[size].label}</div>
        </Field>

        <Field label="3 · How many drivers?">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => setDrivers(n)} aria-pressed={driversN === n} className={pill(driversN === n)}>{n === 3 ? '3+' : n}</button>
            ))}
          </div>
          {drivers == null && suggestDrivers > 1 && <div className="mt-1.5 text-[14px] text-muted">We picked 2 because it needs a van or 2 cars.</div>}
        </Field>

        <Field label="4 · When can a driver come?">
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setWhen('now')} aria-pressed={when === 'now'} className={pill(when === 'now')}>Now</button>
            <button type="button" onClick={() => setWhen('hour')} aria-pressed={when === 'hour'} className={pill(when === 'hour')}>In 1 hour</button>
            <button type="button" onClick={() => setWhen('later')} aria-pressed={when === 'later'} className={pill(when === 'later')}>Later…</button>
          </div>
          {when === 'later' && !lateNight && (
            <input type="time" value={laterTime} min={nowHHMM} onChange={(e) => setLaterTime(e.target.value)} aria-label="Ready at"
                   className="mt-2 w-full min-h-[44px] rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[15px] font-semibold outline-none focus:border-forest" />
          )}
          {timeErr && <div className="mt-1.5 text-[14px] font-bold text-clay">{timeErr}</div>}
          <label className="mt-3 flex items-center gap-2 text-[14px] font-bold text-muted">
            <span className="shrink-0">Must be gone by</span>
            <input type="time" value={goneBy} onChange={(e) => setGoneBy(e.target.value)} aria-label="Must be gone by"
                   className="min-h-[44px] min-w-0 flex-1 rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3 py-2 text-[15px] font-semibold text-ink outline-none focus:border-forest" />
            {goneBy && <button type="button" onClick={() => setGoneBy('')} className="haptic min-h-[44px] px-1 text-[14px] font-bold text-forest underline">Clear</button>}
          </label>
          <div className="mt-0.5 text-[13px] text-muted">Optional.</div>
          {goneErr && <div className="mt-1.5 text-[14px] font-bold text-clay">{goneErr}</div>}
        </Field>

        {/* Oct 11 client: "Used before" — past contacts, most used first; or someone else. */}
        {pastOpts.length > 0 && (
          <Field label="5 · Who should the driver ask for?">
          <div data-used-before className="rounded-[14px] border border-line bg-paper px-4 py-3">
            <div className="text-[13px] font-extrabold uppercase tracking-[.05em] text-muted">Used before</div>
            <div className="mt-1 flex flex-col gap-1" role="radiogroup">
              {[...(pastMore ? pastOpts : pastOpts.slice(0, 3)).map((o) => ({ key: o.key, o })), { key: 'other', o: null as StorePastOpt | null }].map(({ key, o }) => {
                const on = selKey === key;
                const label = o ? (o.name || (o.isStore ? 'Store phone' : 'No name')) : 'Someone else / type new';
                const extra = o ? [o.isStore ? 'store' : '', o.uses > 0 ? `used ${o.uses}×` : ''].filter(Boolean).join(' · ') : '';
                return (
                  <button key={key} type="button" role="radio" aria-checked={on} onClick={() => choosePast(o)}
                          className={cx('haptic flex min-h-[44px] items-start gap-2.5 rounded-[10px] px-2 py-2 text-left text-[14px]', on ? 'bg-sage/50' : 'hover:bg-cream/60')}>
                    <span className={cx('mt-[3px] inline-block h-4 w-4 shrink-0 rounded-full border-[1.5px]', on ? 'border-forest bg-forest shadow-[inset_0_0_0_3px_white]' : 'border-line-2 bg-paper')} />
                    <span className="min-w-0">
                      <span className={cx('text-ink', on && 'font-bold')}>{label}</span>
                      {o?.phone && <span className="text-ink"> — {fmtPhone(o.phone)}</span>}
                      {extra && <span className="text-muted"> · {extra}</span>}
                      {o?.address && !sameAddr(o.address) && <span className="block truncate text-[13px] text-muted">📍 {o.address}</span>}
                      {o?.instructions && <span className="block truncate text-[13px] text-muted">📝 {o.instructions}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {pastOpts.length > 3 && (
              <button type="button" onClick={() => setPastMore((v) => !v)} className="haptic min-h-[44px] text-[14px] font-bold text-forest underline underline-offset-2">
                {pastMore ? 'Show less' : `Show more (${pastOpts.length - 3})`}
              </button>
            )}
            {isOther && (
              <div className="mt-2 grid gap-2">
                <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Name"
                       className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
                <input type="tel" inputMode="tel" value={otherPhone} onChange={(e) => { setContactErr(null); setOtherPhone(e.target.value); }} placeholder="Phone, e.g. 845-555-1234"
                       className={cx('w-full rounded-[12px] border-[1.4px] bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest', contactErr ? 'border-clay' : 'border-line-2')} />
                <input value={otherAddr} onChange={(e) => setOtherAddr(e.target.value)} placeholder="Pickup address"
                       className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
              </div>
            )}
            {contactErr && <div className="mt-1.5 text-[14px] font-bold text-clay">{contactErr}</div>}
          </div>
          {/* Oct 12 client: another person / phone the driver can call. Oct 14 client: inside "Who should the driver ask for?" on the new form. */}
          <div className="mt-2">
            <ExtraContactsEditor value={extras} onChange={(v) => { setExtrasErr(false); setExtras(v); }} big
                                 inputCls="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
            {extrasErr && <div className="mt-1.5 text-[14px] font-bold text-clay">Please enter a 10-digit phone for each other contact, like 845-555-1234.</div>}
          </div>
          </Field>
        )}

        {showNote ? (
          <Field label="Note for the driver (optional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                      placeholder={prof.pickupInstructions ? `Otherwise we send your saved note: “${prof.pickupInstructions}”` : 'e.g. Back door, ring the bell'}
                      className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
          </Field>
        ) : (
          <button onClick={() => setShowNote(true)} className="mt-3 min-h-[44px] text-[14px] font-bold text-forest hover:underline">+ Add a note for the driver</button>
        )}

        {/* Oct 14 client: one-line summary right above the Send button. */}
        <div data-summary className={cx('mt-4 rounded-[12px] border px-3.5 py-3 text-[15px] font-bold', hasFood ? 'border-sage-line bg-sage text-forest' : 'border-line bg-paper text-muted')}>
          {hasFood ? `✓ ${summary}` : 'Tap what\'s ready to see your summary here.'}
        </div>
        {notify.isError && <div className="mt-3 text-[14px] font-bold text-clay">Couldn't send. {(notify.error as any)?.status === 400 && (notify.error as Error).message ? (notify.error as Error).message : `Please try again or call the office: ${OFFICE_PHONE}.`}</div>}
      </main>

      <StickyCTA tone="forest" loading={notify.isPending || photoBusy}
                 onClick={() => { if (!hasFood) { setNeedFood(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return; } if (timeErr || goneErr) return; if (contactBad) { setContactErr('Please enter a 10-digit phone, like 845-555-1234.'); return; } if (extrasBad) { setExtrasErr(true); return; } notify.mutate(); }}>
        Send to drivers
      </StickyCTA>
    </div>
  );
}

// Oct 14 client: phone photos are big — shrink to ~1024px JPEG before sending
// (the API takes the photo as a data URL into pickup_instances.photo_url).
function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 1024;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

// ==========================================================================
// Edit mode — Oct 8 client: same 3 questions as posting (what / how much /
// when) + the driver note. Store name, contact and address come from the
// store profile, so they're not asked again here.
// ==========================================================================
function SupplierEdit({ id, user }: { id: number; user: AuthUser }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['supplier-pickup', id], queryFn: () => supplier.get(id) });

  const [food, setFood] = useState('');
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = q.data?.data;
    if (!p) return;
    setFood(p.food_description ?? '');
    setAmount(p.estimated_quantity ?? '');
    setTime(String(p.scheduled_time ?? '').slice(0, 5));
    setNote(p.pickup_instructions ?? '');
    setStatus(String(p.status ?? ''));
    setDate(String(p.scheduled_date ?? '').slice(0, 10));
  }, [q.data]);
  // Oct 9 client: a pickup for today can't be moved to a time that already passed.
  const isToday = date === new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const pastTime = isToday && !!time && toMin(time) < toMin(defaultTime(0)) - 10;

  const save = useMutation({
    mutationFn: () => supplier.edit(id, {
      foodDescription: food.trim() || null,
      estimatedQuantity: amount || null,
      scheduledTime: time || undefined,
      pickupInstructions: note.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-pickups'] });
      qc.invalidateQueries({ queryKey: ['store-pickups'] });
      qc.invalidateQueries({ queryKey: ['supplier-pickup', id] });
      setSaved(true);
      setTimeout(() => nav('/my-pickups', { replace: true }), 1200);
    },
    // Oct 9 client: no raw server text ("pickup is in_progress — supplier can only edit…").
    onError: (e: any) => setErr(
      e?.status === 409 || /supplier can only edit/i.test(String(e?.message ?? '')) ? (String(e?.message ?? '').includes('office') ? e.message : IN_PROGRESS_MSG)
      : `Could not save. Please try again or call the office: ${OFFICE_PHONE}.`),
  });

  const locked = status && !['pending', 'scheduled', 'confirmed'].includes(status);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => nav(-1)} aria-label="Back" className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={20} /></button>
        <Avatar initials={storeInitials(user.firstName)} />
      </div>
      <AppBar title="Edit Pickup" leftMark="ז" altMark right={null} />

      <main className="px-5 flex-1 pb-2">
        {q.isLoading && <div className="mt-4 text-[14px] text-muted">Loading…</div>}
        {q.isError && <div className="mt-4 text-[14px] text-clay font-bold">Couldn't load this pickup. Please go back and try again.</div>}
        {locked && <div className="mt-2 text-[14px] text-clay font-bold">{['in_progress', 'picked_up', 'en_route'].includes(status) ? IN_PROGRESS_MSG : `This pickup can't be changed anymore. Call the office if something's wrong: ${OFFICE_PHONE}.`}</div>}
        {saved && <div className="mt-2 rounded-[12px] bg-sage border border-sage-line px-3.5 py-2.5 text-[15px] font-bold text-forest">✓ Changes saved</div>}

        {q.data && !locked && (
          <>
            <Field label="What's ready?">
              <input value={food} onChange={(e) => setFood(e.target.value)} placeholder="e.g. Baked goods — 6 trays"
                     className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
            </Field>
            <Field label="How much?">
              <div className="grid grid-cols-3 gap-2">
                {AMOUNTS.map((a) => (
                  <button key={a.v} type="button" onClick={() => setAmount(amount === a.v ? '' : a.v)}
                          className={cx('haptic rounded-[12px] border-[1.4px] px-2 py-2.5 text-center',
                                        amount === a.v ? 'border-forest bg-sage text-forest' : 'border-line-2 bg-paper text-ink')}>
                    <div className="text-[13px] font-bold leading-tight">{a.v}</div>
                    <div className="text-[14px] leading-tight text-muted mt-0.5">{a.hint}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Ready at">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                     className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[15px] font-semibold outline-none focus:border-forest" />
            </Field>
            <Field label="Note for the driver (optional)">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Back door, ring the bell"
                        className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
            </Field>
            {err && <div className="mt-3 text-[14px] text-clay font-bold">{err}</div>}
          </>
        )}
      </main>

      {!locked && !saved && (
        <StickyCTA tone="forest" loading={save.isPending} onClick={() => { setErr(null); if (pastTime) { setErr('That time already passed. Pick a later time.'); return; } save.mutate(); }}>
          Save changes
        </StickyCTA>
      )}
    </div>
  );
}
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-[14px] font-extrabold uppercase tracking-[.04em] text-muted mb-2">{label}</div>
      {children}
    </div>
  );
}

// Oct 11 client: "Used before" helpers.
type StorePastOpt = { key: string; name: string | null; phone: string | null; uses: number; lastDate: string | null; address: string | null; instructions: string | null; isStore: boolean };
function normAddr(v: unknown) { return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function fmtPhone(v: string) {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
}

function defaultTime(offsetMinutes: number) {
  // Tier-2 fix: previously used the device's local HH:MM, which is wrong
  // whenever a driver/donor is not physically on NY time (or when the app
  // runs in a webview that reports UTC). Format in America/New_York so the
  // ready-from / ready-till defaults match the ops window regardless of tz.
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Intl in some engines returns "24" at the top of the hour; normalize it.
  return `${hh === '24' ? '00' : hh}:${mm}`;
}
