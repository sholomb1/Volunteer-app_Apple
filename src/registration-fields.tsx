/**
 * Reusable form primitives for the public registration questionnaires.
 * Match the rescue-kit design tokens (cream/forest/sage/clay) and the
 * questionnaire layout from zehlzeh-info-cards.pdf.
 */
import type { ReactNode } from 'react';
import { cx } from './design';

const inputCls =
  'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[14.5px] ' +
  'focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';

// Oct 9 client: one phone check for every public form (same rule as the API):
// 10 digits, or 11 starting with 1, any dashes / spaces / dots / brackets.
export const PHONE_HELP = 'Please enter a 10-digit phone number, like 845-555-1234.';
export function phoneOk(raw: string): boolean {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!/^[\d\s().+-]*$/.test(String(raw ?? '').trim())) return false;
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[12px] font-extrabold uppercase tracking-[.08em] text-forest border-b-2 border-forest pb-2 mb-5">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// Oct 9 client: Field used to be one big <label>, so tapping a question's
// text pressed its first button (a chip, "−", "Add row"). Now it is a <div>;
// pass htmlFor (the input's id) only when the question is one text box, so
// tapping the question text just puts the cursor in that box.
export function Field({
  label, help, children, optional, htmlFor,
}: { label: string; help?: string; children: ReactNode; optional?: boolean; htmlFor?: string }) {
  const title = (
    <>
      {label}
      {optional && <span className="ml-1.5 text-[11px] font-normal text-muted uppercase tracking-[.06em]">optional</span>}
    </>
  );
  return (
    <div className="block">
      {htmlFor
        ? <label htmlFor={htmlFor} className="block font-bold text-[14.5px] text-ink">{title}</label>
        : <div className="font-bold text-[14.5px] text-ink">{title}</div>}
      {help && <div className="text-[12.5px] text-muted italic mt-0.5">{help}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-[72px]', props.className)} />;
}

export function RadioGroup<T extends string>({
  value, onChange, options,
}: { value: T | undefined; onChange: (v: T) => void; options: { label: string; value: T }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button type="button" key={o.value} onClick={() => onChange(o.value)}
                  className={cx('text-[13px] font-bold px-4 py-2 rounded-full border transition haptic',
                    on ? 'bg-forest text-paper border-forest'
                       : 'bg-paper text-ink border-line hover:border-forest')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function CheckGroup<T extends string | number>({
  values, onChange, options,
}: { values: T[]; onChange: (next: T[]) => void; options: { label: string; value: T }[] }) {
  const toggle = (v: T) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button type="button" key={String(o.value)} onClick={() => toggle(o.value)}
                  className={cx('text-[13px] font-bold px-4 py-2 rounded-full border transition haptic',
                    on ? 'bg-forest text-paper border-forest'
                       : 'bg-paper text-ink border-line hover:border-forest')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Oct 9 client: 12-hour time picker (hour, minutes, AM/PM). Value in and out
// is "HH:MM" (24-hour) so the API is unchanged.
export function TimeAmPm({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const [hRaw, mRaw] = String(value || '').split(':');
  const h24 = Number.isFinite(Number(hRaw)) && hRaw !== '' && hRaw !== undefined ? Number(hRaw) : NaN;
  const hasTime = Number.isFinite(h24);
  const mm = hasTime ? String(mRaw ?? '00').slice(0, 2).padStart(2, '0') : '';
  const pm = hasTime ? h24 >= 12 : false;
  const h12 = hasTime ? ((h24 + 11) % 12) + 1 : NaN;
  const emit = (h: number, m: string, isPm: boolean) => {
    const hh = (h % 12) + (isPm ? 12 : 0);
    onChange(`${String(hh).padStart(2, '0')}:${m || '00'}`);
  };
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
  if (mm && !minutes.includes(mm)) minutes.push(mm);
  minutes.sort();
  const sel = 'rounded-[12px] border-[1.4px] border-line bg-paper px-3 py-3 text-[14.5px] outline-none focus:border-forest';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select id={id} aria-label="Hour" value={hasTime ? String(h12) : ''} className={sel}
              onChange={(e) => emit(Number(e.target.value), mm || '00', pm)}>
        {!hasTime && <option value="">Hour</option>}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={String(h)}>{h}</option>)}
      </select>
      <span className="font-bold">:</span>
      <select aria-label="Minutes" value={mm} className={sel}
              onChange={(e) => emit(hasTime ? h12 : 12, e.target.value, pm)}>
        {!hasTime && <option value="">00</option>}
        {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <RadioGroup<'AM' | 'PM'> value={hasTime ? (pm ? 'PM' : 'AM') : undefined}
        onChange={(v) => emit(hasTime ? h12 : 12, mm || '00', v === 'PM')}
        options={[{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]} />
    </div>
  );
}

export function SubmitBar({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" disabled={busy}
            className="mt-8 w-full bg-forest text-paper rounded-[14px] py-4 font-bold text-[15px] shadow-ctag flex items-center justify-center gap-2 disabled:opacity-50">
      {busy ? 'Sending…' : label}
    </button>
  );
}

export function FormShell({
  eyebrow, title, lede, children,
}: { eyebrow: string; title: string; lede: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream pb-16">
      <header className="bg-forest text-paper px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-[11px] font-extrabold uppercase tracking-[.12em] text-paper/70">{eyebrow}</div>
          <h1 className="font-display font-semibold text-[30px] leading-[1.1] mt-1">{title}</h1>
          <p className="text-paper/85 text-[14px] mt-2 max-w-lg">{lede}</p>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-6">{children}</div>
    </div>
  );
}

// Oct 6 client: say plainly what happens next, per form.
// Oct 9 client: one-time pickups from the public page are not store-posted,
// so no "driver is on the way" text goes out — don't promise one.
const THANKS: Record<string, string> = {
  volunteer: "Your sign-up is in. We'll review it and text you with next steps. Once you're approved, you'll start getting pickup texts.",
  supplier:  "Your store info is in. We'll text you to confirm pickup details.",
  steady:    "Your steady pickup is in. We'll text you to confirm, then drivers will come on the days you picked.",
  pickup:    "Thanks! We got it. We'll find a driver and be in touch.",
};
export function ThankYou({ kind }: { kind: 'volunteer' | 'supplier' | 'steady' | 'pickup' }) {
  return (
    <div className="min-h-screen bg-cream grid place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-sage grid place-items-center text-forest font-display font-extrabold text-[26px]">✓</div>
        <h1 className="font-display font-semibold text-[26px] mt-5">Thank you!</h1>
        <p className="text-muted text-[15px] mt-2">{THANKS[kind]}</p>
        {kind === 'pickup'
          ? <a href="" onClick={(e) => { e.preventDefault(); window.location.reload(); }} className="mt-6 inline-block text-forest font-bold underline">Add another pickup</a>
          : <a href="/rescue/" className="mt-6 inline-block text-forest font-bold underline">Back to home</a>}
      </div>
    </div>
  );
}
