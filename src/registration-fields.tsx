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

export function Field({
  label, help, children, optional,
}: { label: string; help?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className="block">
      <div className="font-bold text-[14.5px] text-ink">
        {label}
        {optional && <span className="ml-1.5 text-[11px] font-normal text-muted uppercase tracking-[.06em]">optional</span>}
      </div>
      {help && <div className="text-[12.5px] text-muted italic mt-0.5">{help}</div>}
      <div className="mt-2">{children}</div>
    </label>
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

export function ThankYou({ kind }: { kind: 'volunteer' | 'supplier' }) {
  return (
    <div className="min-h-screen bg-cream grid place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-sage grid place-items-center text-forest font-display font-extrabold text-[26px]">✓</div>
        <h1 className="font-display font-semibold text-[26px] mt-5">Thank you!</h1>
        <p className="text-muted text-[15px] mt-2">
          {kind === 'volunteer'
            ? "Your volunteer info is in. A Zeh L'Zeh coordinator will reach out shortly with next steps."
            : "Your store info is in. A Zeh L'Zeh coordinator will reach out shortly to confirm pickup details."}
        </p>
        <a href="/rescue/" className="mt-6 inline-block text-forest font-bold underline">Back to home</a>
      </div>
    </div>
  );
}
