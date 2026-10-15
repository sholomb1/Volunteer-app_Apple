/**
 * Oct 14 client: "On the application and the profile you should be able to put more
 * than one number, and then select which one gets text messages and which one is the
 * best one to call them at."
 *
 * One editor for the office driver form, the driver app Profile and the application
 * form (sign-up + "Update my answers"). Up to 3 numbers, each with an optional label
 * (Cell / Home / Work). With 2+ numbers: "Texts go to" and "Best number to call" picks
 * (they can be the same number). With one number both picks are automatic and hidden.
 * The API (volunteer-phones.ts) saves: call number = phone_primary, texts = phone_secondary
 * when different, the whole list (order + labels) in portal_settings.
 */
import { Plus, X } from 'lucide-react';

export const MAX_PHONES = 3;
export const PHONE_LABELS = ['Cell', 'Home', 'Work'];

export type PhoneRow = { phone: string; label: string };
export type PhonesState = { rows: PhoneRow[]; textTo: string; callAt: string }; // textTo / callAt = 10 digits
export type PhonesView = { numbers: Array<{ phone: string; label: string | null; call?: boolean; text?: boolean }>; callAt: string | null; textTo: string | null } | null | undefined;

/** A typed number -> 10 digits, or '' when it isn't a 10-digit US number (a leading 1 is dropped). */
export function digits10(p: unknown): string {
  let d = String(p ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : '';
}
export function fmtPhone(p: unknown): string {
  const d = digits10(p);
  return d ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(p ?? '');
}

/** Editor state from what the API returned (`phones`), or from a single old phone field. */
export function phonesStateFrom(view: PhonesView, fallbackPhone?: string | null): PhonesState {
  const rows: PhoneRow[] = (view?.numbers ?? []).map((n) => ({ phone: fmtPhone(n.phone), label: n.label ?? '' }));
  if (rows.length === 0) rows.push({ phone: fallbackPhone ? fmtPhone(fallbackPhone) : '', label: '' });
  const first = digits10(rows[0]?.phone);
  return { rows, callAt: view?.callAt ?? first, textTo: view?.textTo ?? view?.callAt ?? first };
}

/** The numbers that are filled in and valid (10 digits), once each. */
function validNumbers(s: PhonesState): string[] {
  const out: string[] = [];
  for (const r of s.rows) { const d = digits10(r.phone); if (d && !out.includes(d)) out.push(d); }
  return out;
}

/** What is wrong (plain words), or null. */
export function phonesError(s: PhonesState, opts: { required?: boolean } = {}): string | null {
  const filled = s.rows.filter((r) => r.phone.trim());
  if (opts.required && filled.length === 0) return 'Please enter a phone number.';
  const bad = filled.find((r) => !digits10(r.phone));
  if (bad) return `"${bad.phone}" is not a 10-digit phone number.`;
  return null;
}

/** Request body for the API ({ numbers, textTo, callAt }). */
export function phonesPayload(s: PhonesState) {
  const nums = validNumbers(s);
  const pick = (d: string) => (nums.includes(d) ? d : nums[0] ?? null);
  const callAt = pick(s.callAt);
  const textTo = nums.includes(s.textTo) ? s.textTo : callAt;
  return {
    numbers: s.rows.filter((r) => r.phone.trim()).map((r) => ({ phone: r.phone.trim(), label: r.label || null })),
    callAt, textTo,
  };
}

/** The best-to-call number (10 digits) — sent as the old single "phone" field too. */
export function callNumberOf(s: PhonesState): string {
  return phonesPayload(s).callAt ?? '';
}

/** "📞 845-111-2222 · 💬 Texts to 845-333-4444" (just the number when they are the same). */
export function phonesLine(view: PhonesView, fallbackPhone?: string | null): string {
  const call = view?.callAt ?? digits10(fallbackPhone);
  const text = view?.textTo ?? call;
  if (!call) return '—';
  return text && text !== call ? `📞 ${fmtPhone(call)}  ·  💬 Texts to ${fmtPhone(text)}` : fmtPhone(call);
}

export function PhoneListEditor({ value, onChange, big = false, idPrefix = 'ph' }: {
  value: PhonesState; onChange: (s: PhonesState) => void; big?: boolean; idPrefix?: string;
}) {
  const inputCls = big
    ? 'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[16px] outline-none focus:border-forest'
    : 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] outline-none focus:border-forest';
  const txt = big ? 'text-[15px]' : 'text-[12.5px]';
  const set = (i: number, patch: Partial<PhoneRow>) => {
    const rows = value.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    // A number that was picked and is now changed: keep the pick on the new number.
    const old = digits10(value.rows[i]?.phone);
    const now = digits10(rows[i]?.phone);
    onChange({ rows, callAt: value.callAt === old && now ? now : value.callAt, textTo: value.textTo === old && now ? now : value.textTo });
  };
  const remove = (i: number) => {
    const rows = value.rows.filter((_, j) => j !== i);
    onChange({ ...value, rows: rows.length ? rows : [{ phone: '', label: '' }] });
  };
  const nums = validNumbers(value);
  const labelOf = (d: string) => value.rows.find((r) => digits10(r.phone) === d)?.label;
  const callAt = nums.includes(value.callAt) ? value.callAt : nums[0];
  const textTo = nums.includes(value.textTo) ? value.textTo : callAt;
  const Pick = ({ title, current, onPick, name }: { title: string; current: string | undefined; onPick: (d: string) => void; name: string }) => (
    <div>
      <div className={`${txt} font-bold text-muted`}>{title}</div>
      <div className="flex flex-wrap gap-2 mt-1">
        {nums.map((d) => (
          <label key={d} className={`haptic flex items-center gap-1.5 rounded-full border px-3 ${big ? 'min-h-[44px] text-[15px]' : 'py-1 text-[12.5px]'} font-bold cursor-pointer ${current === d ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line'}`}>
            <input type="radio" name={`${idPrefix}-${name}`} checked={current === d} onChange={() => onPick(d)} className="sr-only" />
            {fmtPhone(d)}{labelOf(d) ? ` (${labelOf(d)})` : ''}
          </label>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      {value.rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input id={i === 0 ? `${idPrefix}-0` : undefined} type="tel" inputMode="tel" value={r.phone} placeholder="(845) 555-1234"
                 aria-label={`Phone number ${i + 1}`}
                 onChange={(e) => set(i, { phone: e.target.value })} className={inputCls + ' flex-1 min-w-0'} />
          <select value={r.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Label for number ${i + 1}`}
                  className={inputCls.replace('w-full ', '') + (big ? ' w-[96px]' : ' w-[84px]') + ' shrink-0'}> {/* Oct 14 client: w-full here squeezed the number box to nothing */}
            <option value="">Label</option>
            {PHONE_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {value.rows.length > 1 && (
            <button type="button" onClick={() => remove(i)} aria-label={`Remove number ${i + 1}`}
                    className={`haptic grid place-items-center rounded-full border border-line text-muted hover:text-clay shrink-0 ${big ? 'h-[44px] w-[44px]' : 'h-8 w-8'}`}>
              <X size={big ? 18 : 14} />
            </button>
          )}
        </div>
      ))}
      {value.rows.length < MAX_PHONES && (
        <button type="button" onClick={() => onChange({ ...value, rows: [...value.rows, { phone: '', label: '' }] })}
                className={`haptic flex items-center gap-1.5 font-bold text-forest ${big ? 'text-[15px] min-h-[44px]' : 'text-[12.5px]'}`}>
          <Plus size={big ? 18 : 14} /> Add another number
        </button>
      )}
      {nums.length > 1 && (
        <div className={`rounded-[12px] border border-line bg-cream/50 ${big ? 'p-3' : 'p-2.5'} space-y-2`}>
          <Pick title="Texts go to:" name="text" current={textTo} onPick={(d) => onChange({ ...value, textTo: d })} />
          <Pick title="Best number to call:" name="call" current={callAt} onPick={(d) => onChange({ ...value, callAt: d })} />
        </div>
      )}
    </div>
  );
}
