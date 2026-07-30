/**
 * Settings → Notifications panel. Per-event SMS routing — each event type
 * has a list of phone numbers and an enabled toggle per number. Call sites
 * in the backend pass the event key to notifyOffice(event, text).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Clock } from 'lucide-react';
import { notificationPrefs, type NotificationPref, type NotificationEvent, type OnCallWindow } from './api';
import { cx, Button } from './design';

export function NotificationsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notification-prefs'], queryFn: notificationPrefs.list });
  const events: NotificationEvent[] = q.data?.events ?? [];
  const prefs: NotificationPref[]   = q.data?.data ?? [];

  const grouped = events.map((ev) => ({
    event: ev,
    rows: prefs.filter((p) => p.eventType === ev.key),
  }));

  function invalidate() { qc.invalidateQueries({ queryKey: ['notification-prefs'] }); }

  if (q.isLoading) return <div className="text-[14px] text-muted">Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-[13.5px] text-muted">
        Each event below sends an SMS to the phones listed. Toggle a number off to mute that event for that phone, or add new phones per event.
      </p>
      {grouped.map(({ event, rows }) => (
        <EventBlock key={event.key} event={event} rows={rows} onChanged={invalidate} />
      ))}
    </div>
  );
}

function EventBlock({ event, rows, onChanged }: { event: NotificationEvent; rows: NotificationPref[]; onChanged: () => void }) {
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const add = useMutation({
    mutationFn: () => notificationPrefs.upsert({ eventType: event.key, phone: newPhone.trim(), label: newLabel.trim() || null, enabled: true }),
    onSuccess: () => { setNewPhone(''); setNewLabel(''); onChanged(); },
  });

  return (
    <div className="border border-line bg-paper rounded-[14px] overflow-hidden">
      <div className="px-4 py-2.5 bg-forest text-paper">
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em]">{event.label}</div>
        <div className="text-[11.5px] opacity-80 mt-0.5 font-mono">{event.key}</div>
      </div>
      <div className="p-3 space-y-2">
        {rows.length === 0 && <div className="text-[13px] text-muted">No phones — this event will silently drop.</div>}
        {rows.map((r) => <PrefRow key={r.id} row={r} onChanged={onChanged} />)}
        <form onSubmit={(e) => { e.preventDefault(); if (newPhone.trim().length >= 7) add.mutate(); }}
              className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-line">
          <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (10-digit or +E.164)"
                 className="flex-1 rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-forest" />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (optional)"
                 className="flex-1 rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-forest" />
          <Button size="sm" variant="forest" icon={<Plus size={14} />}
                  loading={add.isPending} disabled={newPhone.trim().length < 7}
                  onClick={() => add.mutate()}>
            Add number
          </Button>
        </form>
        {add.error && <p className="text-clay text-[12.5px]">{(add.error as Error).message}</p>}
      </div>
    </div>
  );
}

function PrefRow({ row, onChanged }: { row: NotificationPref; onChanged: () => void }) {
  const [showSched, setShowSched] = useState(false);
  const toggle = useMutation({
    mutationFn: () => notificationPrefs.patch(row.id, { enabled: !row.enabled }),
    onSuccess: onChanged,
  });
  const toggleOnCall = useMutation({
    mutationFn: () => notificationPrefs.patch(row.id, { onCallOnly: !row.onCallOnly }),
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: () => notificationPrefs.remove(row.id),
    onSuccess: onChanged,
  });
  const windowCount = row.onCallSchedule?.length ?? 0;
  return (
    <div className={cx('rounded-[10px]', row.enabled ? 'bg-sage/40' : 'bg-cream/60')}>
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="font-mono text-[13.5px] text-ink">{row.phone}</span>
        {row.label && <span className="text-[12.5px] text-muted">{row.label}</span>}
        <button onClick={() => setShowSched((v) => !v)}
                className={cx('haptic ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold border',
                              row.onCallOnly ? 'bg-amber/20 border-amber text-ink' : 'bg-paper/60 border-line text-muted hover:border-forest')}>
          <Clock size={11} /> {row.onCallOnly ? `on-call · ${windowCount} win` : 'always-on'}
        </button>
        <button onClick={() => toggle.mutate()} disabled={toggle.isPending}
                className={cx('relative inline-flex items-center w-12 h-6 rounded-full transition haptic',
                              row.enabled ? 'bg-forest' : 'bg-line')}>
          <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow transition',
                              row.enabled ? 'left-[26px]' : 'left-0.5')} />
        </button>
        <button onClick={() => { if (confirm(`Delete ${row.phone} from this event?`)) del.mutate(); }}
                className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
          <Trash2 size={13} />
        </button>
      </div>
      {showSched && (
        <div className="border-t border-line px-3 py-3 space-y-2 bg-paper/60 rounded-b-[10px]">
          <label className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
            <input type="checkbox" checked={!!row.onCallOnly}
                   onChange={() => toggleOnCall.mutate()}
                   className="h-4 w-4 accent-forest" />
            Only send during on-call windows below (times in NY)
          </label>
          <OnCallEditor row={row} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function OnCallEditor({ row, onChanged }: { row: NotificationPref; onChanged: () => void }) {
  const [draft, setDraft] = useState<OnCallWindow[]>(() => row.onCallSchedule ?? []);
  const [dirty, setDirty] = useState(false);
  const save = useMutation({
    mutationFn: () => notificationPrefs.patch(row.id, { onCallSchedule: draft }),
    onSuccess: () => { setDirty(false); onChanged(); },
  });
  function set(i: number, patch: Partial<OnCallWindow>) {
    setDraft((d) => d.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
    setDirty(true);
  }
  function add() {
    setDraft((d) => [...d, { dow: 1, start: '09:00', end: '17:00' }]);
    setDirty(true);
  }
  function remove(i: number) {
    setDraft((d) => d.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  return (
    <div className="space-y-2">
      {draft.length === 0 && (
        <div className="text-[12px] text-muted">No windows configured. When "on-call only" is on, this phone won't be paged until you add at least one window.</div>
      )}
      {draft.map((w, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <select value={w.dow} onChange={(e) => set(i, { dow: Number(e.target.value) })}
                  className="rounded-[8px] border-[1.4px] border-line bg-paper px-2 py-1 outline-none focus:border-forest">
            {DOW_LABELS.map((lbl, idx) => <option key={idx} value={idx}>{lbl}</option>)}
          </select>
          <input type="time" value={w.start} onChange={(e) => set(i, { start: e.target.value })}
                 className="rounded-[8px] border-[1.4px] border-line bg-paper px-2 py-1 outline-none focus:border-forest" />
          <span className="text-muted">→</span>
          <input type="time" value={w.end} onChange={(e) => set(i, { end: e.target.value })}
                 className="rounded-[8px] border-[1.4px] border-line bg-paper px-2 py-1 outline-none focus:border-forest" />
          <button onClick={() => remove(i)} className="haptic grid h-6 w-6 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={add} className="haptic flex items-center gap-1 rounded-[8px] border-[1.4px] border-forest px-2.5 py-1 text-[12px] font-bold text-forest hover:bg-sage/40">
          <Plus size={12} /> Add window
        </button>
        {dirty && (
          <Button size="sm" variant="forest" loading={save.isPending} onClick={() => save.mutate()}>
            Save schedule
          </Button>
        )}
        {save.error && <span className="text-clay text-[12px]">{(save.error as Error).message}</span>}
      </div>
      <div className="text-[11.5px] text-muted">
        End before start wraps past midnight (e.g. Fri 17:00 → 09:00 means Fri 5pm through Sat 9am).
      </div>
    </div>
  );
}
