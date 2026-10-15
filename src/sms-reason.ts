/**
 * Oct 9 client: the office was seeing raw API reason codes ("No SMS sent:
 * shabbos-quiet"). Turn them into plain sentences, and word every "texted
 * drivers" result the same way.
 */
const REASONS: Record<string, string> = {
  'shabbos-quiet': "It's Shabbos — texts wait until after Shabbos.",
  'shabbos': "It's Shabbos — texts wait until after Shabbos.",
  'no-address': "This pickup has no address, so drivers weren't texted.",
  'no-addressable-pickups': "The open pickups have no address, so drivers weren't texted.",
  'empty-group': 'Nobody in the Default text group can get texts right now.',
  'no-members': 'Nobody in the Default text group can get texts right now.',
  'no-group-members': 'Nobody in the Default text group can get texts right now.',
  'no-group': "There's no Default text group set up.",
  'no-default-group': "There's no Default text group set up.",
  'already-fully-assigned': 'It already has all its drivers.',
  'dry-run': 'Test site — not really sent.',
  'test-mode': 'Test pickup — not really sent.',
  'paused': 'Texts are paused.',
  'no-open-pickups': 'There are no open pickups to send.',
  'pickup-not-found': "This pickup wasn't found.",
  deferred: 'Will be texted at the top of the hour before its time.', // Oct 12 client
  'send-to-drivers-off': 'Not texted now — it goes out with the next pickup text and shows when drivers text PICKUPS.',
  held: 'On hold — not texted until a dispatcher texts SEND.',
  'queued-for-next-drop': 'It goes out in the next hourly text.',
  'not-texted': 'No text sent.',
};

/** Reason code → plain sentence. Unknown codes → "Not sent (<code>)." */
export function smsReasonText(code: string | null | undefined): string {
  const c = String(code ?? '').trim();
  if (!c) return 'Not sent.';
  if (REASONS[c]) return REASONS[c]!;
  if (c.startsWith('quiet-hours') || c.startsWith('quiet_hours')) return 'Quiet hours — it goes out in the next morning text.';
  // Already a sentence from the server (e.g. "This pickup is already being sent…").
  if (/\s/.test(c) && !/^[a-z-]+\s*\(/.test(c)) return c;
  return `Not sent (${c}).`;
}

/** "Texted 5 drivers." or "Texted 4 of 5 drivers." when some failed. */
export function textedText(sent: number | null | undefined, of?: number | null): string {
  const n = Number(sent ?? 0);
  const m = Number(of ?? 0);
  if (m > n) return `Texted ${n} of ${m} driver${m === 1 ? '' : 's'}.`;
  return `Texted ${n} driver${n === 1 ? '' : 's'}.`;
}
