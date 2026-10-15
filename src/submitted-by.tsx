// Oct 12 client: "Form submitted by" — required on the pickup forms (office New/Edit
// pickup and the public one-time form), so the office has data on who filled out each form.
// Saved as "Secretary" | "Swift Dial" | "SR" | "YT" | "Other: <name>" (pickup_instances.submitted_by).
import { cx } from './design';

export const SUBMITTED_BY_CHOICES = ['Secretary', 'Swift Dial', 'SR', 'YT', 'Other'] as const;
export const SUBMITTED_BY_MISSING = 'Please choose who filled out this form.';
export const SUBMITTED_BY_NO_NAME = 'Please type the name of who filled out this form.';
export type SubmittedByState = { choice: string; name: string };

const LS_KEY = 'zlz.submittedBy.last';

/** Saved value → form state. Auto tags ("Store app", "Text (...)") are not a pill: empty state. */
export function parseSubmittedBy(raw: unknown): SubmittedByState {
  const s = String(raw ?? '').trim();
  if (!s) return { choice: '', name: '' };
  const m = s.match(/^Other:\s*(.*)$/i);
  if (m) return { choice: 'Other', name: (m[1] ?? '').trim() };
  return (SUBMITTED_BY_CHOICES as readonly string[]).includes(s) ? { choice: s, name: '' } : { choice: '', name: '' };
}

/** Form state → value to send (null = nothing chosen). */
export function submittedByValue(v: SubmittedByState): string | null {
  if (!v.choice) return null;
  if (v.choice === 'Other') return v.name.trim() ? `Other: ${v.name.trim()}` : null;
  return v.choice;
}

/** Plain message when the row is not filled in right, else null. */
export function submittedByError(v: SubmittedByState, required: boolean): string | null {
  if (!v.choice) return required ? SUBMITTED_BY_MISSING : null;
  if (v.choice === 'Other' && !v.name.trim()) return SUBMITTED_BY_NO_NAME;
  return null;
}

/** For showing a saved value: "Other: Moshe" → "Moshe". */
export function submittedByLabel(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^Other:\s*/i, '');
}

/** Office form only: the last choice in this browser is the default. */
export function loadLastSubmittedBy(): SubmittedByState {
  try { return parseSubmittedBy(localStorage.getItem(LS_KEY)); } catch { return { choice: '', name: '' }; }
}
export function saveLastSubmittedBy(v: SubmittedByState) {
  try { const val = submittedByValue(v); if (val) localStorage.setItem(LS_KEY, val); } catch { /* private mode */ }
}

/** The compact required row: pills + a Name box for Other. */
export function SubmittedByRow({ value, onChange, savedNote, big }: {
  value: SubmittedByState; onChange: (v: SubmittedByState) => void;
  savedNote?: string | null; big?: boolean;
}) {
  return (
    <div data-testid="submitted-by">
      <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap">
        {SUBMITTED_BY_CHOICES.map((c) => (
          <button key={c} type="button" aria-pressed={value.choice === c}
                  onClick={() => onChange({ choice: c, name: c === 'Other' ? value.name : '' })}
                  className={cx('rounded-[999px] border-[1.5px] font-bold transition',
                    big ? 'px-4 py-1.5 text-[13px]' : 'px-3 py-1 text-[12px]',
                    value.choice === c ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
            {c}
          </button>
        ))}
        {savedNote && !value.choice && <span className="text-[11.5px] text-muted">Saved: {savedNote}</span>}
      </div>
      {value.choice === 'Other' && (
        <input value={value.name} onChange={(e) => onChange({ choice: 'Other', name: e.target.value })}
               placeholder="Name *" aria-label="Name" maxLength={100} autoFocus
               className={cx('mt-2 w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 outline-none focus:border-forest',
                 big ? 'py-2.5 text-[14.5px]' : 'py-1.5 text-[13px]')} />
      )}
    </div>
  );
}
