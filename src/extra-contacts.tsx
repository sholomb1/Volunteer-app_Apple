/**
 * Oct 12 client: "Some donors give two phone numbers." "+ Add another contact" under the
 * contact name / phone — each extra row is a name (optional) + phone with a remove ×, up to 3.
 * Used by the office New/Edit pickup form, the public one-time form and the store app.
 * Saved as extraContacts (pickup_instances.extra_contacts); the main contact stays first, so
 * store texts / SMS that read contact_phone are unchanged.
 */
import { cx } from './design';

export type ExtraContact = { name: string; phone: string };
export const MAX_EXTRA_CONTACTS = 3;

/** From the API (array, its JSON text, or null) → rows with a phone. */
export function readExtraContacts(v: unknown): ExtraContact[] {
  let a: unknown = v;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { return []; } }
  if (!Array.isArray(a)) return [];
  return a
    .filter((x) => x && typeof x === 'object' && String((x as any).phone ?? '').trim())
    .slice(0, MAX_EXTRA_CONTACTS)
    .map((x: any) => ({ name: String(x.name ?? '').trim(), phone: String(x.phone ?? '').trim() }));
}

/** What the forms send: rows with a phone only; a blank name is null. */
export function extraContactsPayload(list: ExtraContact[]): Array<{ name: string | null; phone: string }> {
  return list
    .filter((c) => c.phone.trim())
    .slice(0, MAX_EXTRA_CONTACTS)
    .map((c) => ({ name: c.name.trim() || null, phone: c.phone.trim() }));
}

/** 10 digits (a leading 1 is fine) — same rule the forms use for the main phone. */
export function extraPhonesBad(list: ExtraContact[]): boolean {
  return list.some((c) => c.phone.trim() && c.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10);
}

export const telHref = (p: string) => `tel:${String(p).replace(/[^\d+]/g, '')}`;

export function ExtraContactsEditor({ value, onChange, inputCls, big }: {
  value: ExtraContact[];
  onChange: (next: ExtraContact[]) => void;
  inputCls: string;
  big?: boolean;          // public / store app: bigger tap targets
}) {
  const set = (i: number, k: keyof ExtraContact, v: string) => onChange(value.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  return (
    <div data-extra-contacts className="space-y-2">
      {value.map((c, i) => (
        <div key={i} data-extra-contact className="flex items-center gap-2">
          <input value={c.name} onChange={(e) => set(i, 'name', e.target.value)}
                 placeholder="Name (optional)" aria-label={`Other contact ${i + 1}: name`}
                 className={cx(inputCls, 'min-w-0 flex-1')} />
          <input type="tel" inputMode="tel" value={c.phone} onChange={(e) => set(i, 'phone', e.target.value)}
                 placeholder="Phone" aria-label={`Other contact ${i + 1}: phone`}
                 className={cx(inputCls, 'min-w-0 flex-1')} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Remove other contact ${i + 1}`} title="Remove"
                  className={cx('haptic grid shrink-0 place-items-center rounded-full border border-line bg-paper text-muted hover:text-clay',
                                big ? 'h-11 w-11 text-[20px]' : 'h-9 w-9 text-[17px]')}>×</button>
        </div>
      ))}
      {value.length < MAX_EXTRA_CONTACTS && (
        <button type="button" onClick={() => onChange([...value, { name: '', phone: '' }])}
                className={cx('haptic font-bold text-forest underline underline-offset-2', big ? 'min-h-[44px] text-[14px]' : 'text-[12.5px]')}>
          + Add another contact
        </button>
      )}
    </div>
  );
}
