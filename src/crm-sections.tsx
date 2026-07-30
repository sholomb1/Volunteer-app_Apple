/**
 * Recruiting CRM — log conversations with volunteers + suppliers, schedule
 * follow-ups, surface the calendar of who's due to be called next.
 *
 * Mounted as the "Recruiting" panel in the portal. The InteractionForm modal
 * is also reused inside SupplierForm / VolunteerForm so the recruiter can log
 * a touchpoint from the contact's edit dialog.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Phone, MessageSquare, Mail, Users2, Store, ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import { api, crm, staffUsers, adminCRUD, type CrmInteraction, type FollowupDay, type StaffUser } from './api';
import { Button, cx } from './design';
import { RegistrationLinkCard } from './portal-sections';
import { Gift } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New lead', interested: 'Interested', needs_followup: 'Needs follow-up',
  ready_to_onboard: 'Ready to onboard', active: 'Active', on_hold: 'On hold', not_interested: 'Not interested',
};
const STATUS_TONE: Record<string, string> = {
  new_lead:          'bg-sky-soft text-[#1d4a6a]',
  interested:        'bg-amber-soft text-[#8a6011]',
  needs_followup:    'bg-clay-soft text-clay',
  ready_to_onboard:  'bg-sage text-forest',
  active:            'bg-forest text-paper',
  on_hold:           'bg-line text-muted',
  not_interested:    'bg-paper border border-line text-muted',
};

const CHANNEL_ICON: Record<string, any> = {
  call: Phone, text: MessageSquare, whatsapp: MessageSquare, email: Mail,
  in_person: Users2, voicemail: Phone, other: MessageSquare,
};
const CHANNEL_LABEL: Record<string, string> = {
  call: 'Call', text: 'Text', whatsapp: 'WhatsApp', email: 'Email',
  in_person: 'In person', voicemail: 'Voicemail', other: 'Other',
};

const inputCls = 'w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2.5 text-[13.5px] focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';

// =============================== Top-level panel ============================

export function RecruitingPanel() {
  const [view, setView] = useState<'calendar' | 'feed' | 'due'>('calendar');
  const [editing, setEditing] = useState<CrmInteraction | 'new' | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <RegistrationLinkCard kind="volunteer" />
        <RegistrationLinkCard kind="supplier" />
        <RegistrationLinkCard kind="one-time-pickup" />
        <RegistrationLinkCard kind="steady-pickup" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <ViewTab label="Calendar"   active={view === 'calendar'} onClick={() => setView('calendar')} />
          <ViewTab label="All"        active={view === 'feed'}     onClick={() => setView('feed')} />
          <ViewTab label="Due now"    active={view === 'due'}      onClick={() => setView('due')} />
        </div>
        <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Log interaction</Button>
      </div>

      {view === 'calendar' ? <CalendarView onPick={setEditing} /> :
       view === 'feed'     ? <FeedView onPick={setEditing} /> :
                             <FeedView dueOnly onPick={setEditing} />}

      {editing && (
        <InteractionFormModal
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
            className={cx('text-[13px] font-bold px-3.5 py-1.5 rounded-full border haptic',
              active ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
      {label}
    </button>
  );
}

// =============================== Calendar view ==============================

function CalendarView({ onPick }: { onPick: (row: CrmInteraction) => void }) {
  const [cursor, setCursor] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd   = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const fromStr = monthStart.toISOString().slice(0, 10);
  const toStr   = monthEnd.toISOString().slice(0, 10);

  const followups = useQuery({
    queryKey: ['crm-followups', fromStr, toStr],
    queryFn:  () => crm.followups(fromStr, toStr),
  });
  const byDay: Record<string, FollowupDay> = useMemo(() => {
    const m: Record<string, FollowupDay> = {};
    (followups.data?.data ?? []).forEach((d) => { m[d.day] = d; });
    return m;
  }, [followups.data]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selected = selectedDay ? byDay[selectedDay] : null;

  const cells: Array<Date | null> = [];
  const firstDow = monthStart.getDay(); // 0 = Sun
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const today = new Date(); const todayStr = today.toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="haptic grid h-9 w-9 place-items-center rounded-full bg-paper border border-line text-muted hover:border-forest">
          <ChevronLeft size={16} />
        </button>
        <div className="font-display font-semibold text-[18px]">{monthLabel}</div>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="haptic grid h-9 w-9 place-items-center rounded-full bg-paper border border-line text-muted hover:border-forest">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const ds = d.toISOString().slice(0, 10);
          const day = byDay[ds];
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDay;
          return (
            <button key={i} onClick={() => setSelectedDay(ds === selectedDay ? null : ds)}
                    className={cx('aspect-square rounded-[10px] border flex flex-col items-stretch justify-between p-1 haptic text-left',
                      isSelected ? 'bg-forest text-paper border-forest'
                      : day        ? 'bg-sage border-sage-line'
                      : isToday    ? 'bg-paper border-forest/40'
                      :              'bg-paper border-line')}>
              <span className={cx('text-[11.5px] font-bold', isSelected ? 'text-paper' : 'text-ink')}>
                {d.getDate()}
              </span>
              {day && (
                <span className={cx('text-[11px] font-extrabold rounded-md px-1 py-0.5 self-start',
                                    isSelected ? 'bg-paper text-forest' : 'bg-forest text-paper')}>
                  {day.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected ? (
        <DaySheet day={selected} onPick={onPick} onClose={() => setSelectedDay(null)} />
      ) : (
        <div className="text-[12.5px] text-muted text-center py-3">
          Tap a day to see who's due. Green dots = at least one follow-up scheduled.
        </div>
      )}
    </div>
  );
}

function DaySheet({ day, onPick, onClose }: { day: FollowupDay; onPick: (row: CrmInteraction) => void; onClose: () => void }) {
  // Fetch full rows for the day to drive onPick → edit modal.
  const rows = useQuery({
    queryKey: ['crm-interactions-day', day.day],
    queryFn:  () => crm.interactions({ from: day.day, to: day.day, limit: 200 }),
  });
  return (
    <div className="border border-line bg-paper rounded-[14px] p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[14px] font-extrabold uppercase tracking-[.05em] text-forest">
          <CalIcon size={14} className="inline mr-1 -mt-0.5" />
          {new Date(day.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {day.count} follow-up{day.count === 1 ? '' : 's'}
        </div>
        <button onClick={onClose} className="haptic grid h-7 w-7 place-items-center rounded-full hover:bg-cream"><X size={14} /></button>
      </div>
      <div className="space-y-1.5">
        {day.items.map((it) => {
          const Icon = CHANNEL_ICON[it.channel] ?? MessageSquare;
          const fullRow = rows.data?.data?.find((r) => r.id === it.id);
          return (
            <button key={it.id} onClick={() => fullRow && onPick(fullRow)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-[10px] hover:bg-cream/40 haptic">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-cream/60 text-muted shrink-0"><Icon size={14} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold truncate flex items-center gap-2">
                  {it.targetType === 'volunteer' ? <Users2 size={13} className="text-forest" /> : <Store size={13} className="text-clay" />}
                  {it.targetName}
                  <span className="text-[11px] text-muted">· {it.time}</span>
                </div>
                <div className="text-[11.5px] text-muted">{CHANNEL_LABEL[it.channel]}</div>
              </div>
              <span className={cx('text-[10.5px] font-bold py-0.5 px-2 rounded-full', STATUS_TONE[it.status] ?? 'bg-line text-muted')}>
                {STATUS_LABEL[it.status] ?? it.status}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================== Feed view ==================================

function FeedView({ dueOnly, onPick }: { dueOnly?: boolean; onPick: (row: CrmInteraction) => void }) {
  const q = useQuery({
    queryKey: ['crm-interactions', { dueOnly: !!dueOnly }],
    queryFn:  () => crm.interactions({ dueOnly, limit: 300 }),
  });
  const rows = q.data?.data ?? [];
  if (q.isLoading) return <div className="text-[13.5px] text-muted py-3">Loading…</div>;
  if (rows.length === 0) {
    return <div className="text-[13.5px] text-muted py-6 text-center">
      {dueOnly ? 'No follow-ups due. ' : 'No interactions logged yet. '}
      Click "Log interaction" up top to get started.
    </div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => <InteractionRow key={r.id} row={r} onPick={() => onPick(r)} />)}
    </div>
  );
}

function InteractionRow({ row, onPick }: { row: CrmInteraction; onPick: () => void }) {
  const Icon = CHANNEL_ICON[row.channel] ?? MessageSquare;
  const due  = row.nextFollowupAt ? new Date(row.nextFollowupAt) : null;
  const occ  = new Date(row.occurredAt);
  const overdue = due ? due.getTime() <= Date.now() : false;
  return (
    <button onClick={onPick}
            className="w-full text-left bg-paper border border-line rounded-[14px] px-4 py-3 flex items-start gap-3 haptic hover:border-forest/40">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-cream/60 text-muted shrink-0"><Icon size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {row.targetType === 'volunteer' ? <Users2 size={14} className="text-forest" /> : <Store size={14} className="text-clay" />}
          <span className="font-bold text-[14px]">{row.targetName}</span>
          <span className="text-[11.5px] text-muted">
            · {CHANNEL_LABEL[row.channel]} · {row.direction === 'inbound' ? 'In' : 'Out'} · {occ.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
        {row.summary && <div className="text-[13px] text-ink mt-1 line-clamp-2">{row.summary}</div>}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={cx('text-[10.5px] font-bold py-0.5 px-2 rounded-full', STATUS_TONE[row.status] ?? 'bg-line text-muted')}>
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
          {due && (
            <span className={cx('text-[11px] font-bold',
                                overdue ? 'text-clay' : 'text-forest')}>
              Follow up {overdue ? 'overdue · ' : ''}{due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{ due.getHours() !== 0 ? `, ${due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// =============================== Form modal =================================

function InteractionFormModal({ row, lockContact, onClose, onDone }: {
  row: CrmInteraction | null;
  lockContact?: { targetType: 'volunteer' | 'supplier'; targetId: number; targetName: string };
  onClose: () => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!row;
  const locked = !!lockContact || editing;
  const suppliers  = useQuery({ queryKey: ['admin-suppliers'],  queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });
  const volunteers = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });

  const [targetType, setTType] = useState<'volunteer' | 'supplier'>(row?.targetType ?? lockContact?.targetType ?? 'volunteer');
  const [targetId,   setTId]   = useState<number | ''>(row?.targetId ?? lockContact?.targetId ?? '');
  const [channel, setChannel]  = useState<CrmInteraction['channel']>(row?.channel ?? 'call');
  const [direction, setDir]    = useState<CrmInteraction['direction']>(row?.direction ?? 'outbound');
  const [summary, setSummary]  = useState<string>(row?.summary ?? '');
  const [status, setStatus]    = useState<CrmInteraction['status']>(row?.status ?? 'needs_followup');
  const [occurredAt, setOcc]   = useState<string>(() => {
    const d = row?.occurredAt ? new Date(row.occurredAt) : new Date();
    return toLocalInput(d);
  });
  const [nextAt, setNext]      = useState<string>(() => row?.nextFollowupAt ? toLocalInput(new Date(row.nextFollowupAt)) : '');
  const [spokeWith, setSpokeWith] = useState<string>(() =>
    row?.spokeWithUserId != null ? `u:${row.spokeWithUserId}` :
    row?.spokeWithLabel       ? `l:${row.spokeWithLabel}` : '');
  const staffQ = useQuery({ queryKey: ['staff-users'], queryFn: staffUsers.list });
  const staff: StaffUser[] = staffQ.data?.data ?? [];

  const list = targetType === 'volunteer' ? (volunteers.data?.data ?? []) : (suppliers.data?.data ?? []);
  const labelFor = (r: any) => targetType === 'volunteer' ? `${r.firstName} ${r.lastName}` : r.name;

  const spokeFields = (() => {
    if (!spokeWith) return { spokeWithUserId: null, spokeWithLabel: null };
    if (spokeWith.startsWith('u:')) return { spokeWithUserId: Number(spokeWith.slice(2)), spokeWithLabel: null };
    return { spokeWithUserId: null, spokeWithLabel: spokeWith.slice(2) };
  })();
  const save = useMutation({
    mutationFn: async () => {
      // Defensive: server requires a real target on create; surface a clean
      // message instead of letting the server 400.
      if (!editing && (!targetType || !targetId || typeof targetId !== 'number')) {
        throw new Error(`Pick a ${targetType} from the list before saving.`);
      }
      const payload = editing
        ? { channel, direction, summary: summary || null, status,
            occurredAt: new Date(occurredAt).toISOString(),
            nextFollowupAt: nextAt ? new Date(nextAt).toISOString() : null,
            ...spokeFields }
        : { targetType, targetId: Number(targetId), channel, direction,
            summary: summary || null, status,
            occurredAt: new Date(occurredAt).toISOString(),
            nextFollowupAt: nextAt ? new Date(nextAt).toISOString() : null,
            ...spokeFields };
      return editing ? crm.patch(row.id, payload) : crm.create(payload as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-followups'] });
      qc.invalidateQueries({ queryKey: ['crm-history'] });
      onDone();
    },
  });
  const del = useMutation({
    mutationFn: () => crm.remove(row!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-interactions'] });
      qc.invalidateQueries({ queryKey: ['crm-followups'] });
      onDone();
    },
  });

  return (
    <div onClick={onClose} className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()}
           className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-paper border-b border-line px-5 py-3 flex items-center justify-between">
          <div className="font-display font-semibold text-[18px]">{editing ? 'Edit interaction' : 'Log interaction'}</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Contact</div>
            <div className="flex gap-2 mb-2">
              <Pill label="Volunteer" active={targetType === 'volunteer'} onClick={() => { setTType('volunteer'); setTId(''); }} />
              <Pill label="Supplier"  active={targetType === 'supplier'}  onClick={() => { setTType('supplier');  setTId(''); }} />
            </div>
            <select value={targetId === '' ? '' : String(targetId)}
                    onChange={(e) => setTId(e.target.value ? Number(e.target.value) : '')}
                    disabled={locked}
                    className={cx(inputCls, locked && 'opacity-70')}>
              <option value="">— pick a {targetType} —</option>
              {list.map((r: any) => (
                <option key={r.id} value={r.id}>{labelFor(r)}</option>
              ))}
            </select>
            {locked && <div className="text-[11px] text-muted mt-1">
              {editing ? `${row?.targetName} · can't switch contact while editing` : `${lockContact?.targetName} · locked to this contact`}
            </div>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Channel</div>
              <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className={inputCls}>
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Direction</div>
              <div className="flex gap-2">
                <Pill label="Outbound" active={direction === 'outbound'} onClick={() => setDir('outbound')} />
                <Pill label="Inbound"  active={direction === 'inbound'}  onClick={() => setDir('inbound')} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">When did it happen?</div>
              <input type="datetime-local" value={occurredAt} onChange={(e) => setOcc(e.target.value)} className={inputCls} />
            </div>
            <div>
              <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Status</div>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Who spoke with the {targetType === 'volunteer' ? 'driver' : 'store'}?</div>
            <select value={spokeWith} onChange={(e) => setSpokeWith(e.target.value)} className={inputCls}>
              <option value="">— Not recorded —</option>
              {staff.map((u) => <option key={u.id} value={`u:${u.id}`}>{u.name} <span>· {u.role}</span></option>)}
            </select>
            <div className="text-[11px] text-muted mt-1">Pick the staff member who actually had the conversation.</div>
          </div>

          <div>
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">What was said</div>
            <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} className={inputCls}
                      placeholder='e.g. "Yossi said he can do Tues + Sun mornings. Has a minivan, no cold-chain. Wants gas comp."' />
          </div>

          <div>
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Follow up on…</div>
            <input type="datetime-local" value={nextAt} onChange={(e) => setNext(e.target.value)} className={inputCls} />
            <div className="text-[11px] text-muted mt-1">Leave blank if no follow-up is needed.</div>
          </div>

          {(save.error || del.error) && <p className="text-clay text-[12.5px]">{((save.error || del.error) as Error).message}</p>}

          <div className="flex items-center justify-between pt-2">
            {editing ? (
              <button onClick={() => { if (confirm('Delete this interaction entry?')) del.mutate(); }}
                      className="haptic flex items-center gap-1.5 text-clay text-[13px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
                <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete'}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button size="sm" variant="plain" onClick={onClose}>Cancel</Button>
              <Button size="sm" loading={save.isPending} disabled={!editing && (!targetId || !channel)}
                      onClick={() => save.mutate()} icon={<Plus size={14} />}>
                {editing ? 'Save' : 'Save interaction'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
            className={cx('text-[13px] font-bold px-3.5 py-1.5 rounded-full border transition haptic',
              active ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
      {label}
    </button>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =============================== Gifts history ==============================

/**
 * Log of gifts given to this volunteer or supplier. Office records what was
 * given, when, optional dollar value, optional occasion. Drop into the
 * Volunteer/Supplier edit modal.
 */
export function GiftsHistory({ targetType, targetId, targetName }: {
  targetType: 'volunteer' | 'supplier'; targetId: number; targetName: string;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const q = useQuery({
    queryKey: ['gifts', targetType, targetId],
    queryFn:  () => adminCRUD.gifts({ recipientType: targetType, recipientId: targetId }),
  });
  const rows = q.data?.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['gifts', targetType, targetId] });

  return (
    <div className="mt-5 border-2 border-amber/30 bg-amber-soft/40 rounded-[16px] overflow-hidden">
      <div className="px-4 py-2.5 bg-amber text-paper flex items-center justify-between">
        <div className="text-[12px] font-extrabold uppercase tracking-[.08em] flex items-center gap-1.5">
          <Gift size={13} /> Gifts log
        </div>
        <button onClick={() => setAdding(true)}
                className="haptic flex items-center gap-1 text-[12px] font-bold bg-paper text-[#8a6011] rounded-[8px] px-2.5 py-1">
          <Plus size={12} /> Record gift
        </button>
      </div>
      <div className="p-3 space-y-2">
        {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
         rows.length === 0 ? <div className="text-[13px] text-muted">No gifts recorded yet for {targetName}.</div> :
         rows.map((r: any) => (
           <button key={r.id} onClick={() => setEditing(r)}
                   className="w-full text-left bg-paper border border-line rounded-[12px] px-3 py-2 hover:border-amber/50 haptic">
             <div className="flex items-center gap-2 text-[13px]">
               <span className="font-bold">{r.gift}</span>
               {r.amountUsd != null && <span className="text-[12px] font-bold text-[#8a6011]">${Number(r.amountUsd).toFixed(2)}</span>}
               <span className="ml-auto text-[11.5px] text-muted">{new Date(r.givenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
             </div>
             <div className="text-[11.5px] text-muted mt-0.5">
               {r.occasion && <span>{r.occasion} · </span>}
               {r.givenByName ? `Given by ${r.givenByName}` : ''}
             </div>
             {r.notes && <div className="text-[12px] text-ink mt-1 line-clamp-2">{r.notes}</div>}
           </button>
         ))}
      </div>

      {(adding || editing) && (
        <GiftForm
          row={editing}
          targetType={targetType}
          targetId={targetId}
          targetName={targetName}
          onClose={() => { setAdding(false); setEditing(null); }}
          onDone={() => { setAdding(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function GiftForm({ row, targetType, targetId, targetName, onClose, onDone }: {
  row: any | null;
  targetType: 'volunteer' | 'supplier'; targetId: number; targetName: string;
  onClose: () => void; onDone: () => void;
}) {
  const [gift, setGift]         = useState(row?.gift ?? '');
  const [occasion, setOccasion] = useState(row?.occasion ?? '');
  const [amount, setAmount]     = useState<string>(row?.amountUsd != null ? String(row.amountUsd) : '');
  const [givenAt, setGivenAt]   = useState(row?.givenAt ? String(row.givenAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [notes, setNotes]       = useState(row?.notes ?? '');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        recipientType: targetType, recipientId: targetId,
        gift: gift.trim(), occasion: occasion.trim() || null,
        amountUsd: amount.trim() ? Number(amount) : null,
        givenAt, notes: notes.trim() || null,
      };
      return row ? adminCRUD.patchGift(row.id, body) : adminCRUD.createGift(body);
    },
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteGift(row.id), onSuccess: onDone });

  return (
    <div className="fixed inset-0 z-[3000] bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-paper rounded-[18px] shadow-lift w-full max-w-md p-5">
        <div className="font-display font-semibold text-[18px] mb-1">{row ? 'Edit gift' : 'Record a gift'}</div>
        <div className="text-[12px] text-muted mb-3">For {targetName}</div>
        <div className="space-y-2.5">
          <label className="block">
            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Gift</div>
            <input value={gift} onChange={(e) => setGift(e.target.value)}
                   placeholder='e.g. "Pesach wine + flowers"'
                   className="mt-1 w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-forest" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Occasion</div>
              <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Pesach / birthday / thanks"
                     className="mt-1 w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-forest" />
            </label>
            <label className="block">
              <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Amount (USD, optional)</div>
              <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                     className="mt-1 w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-forest" />
            </label>
          </div>
          <label className="block">
            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Date given</div>
            <input type="date" value={givenAt} onChange={(e) => setGivenAt(e.target.value)}
                   className="mt-1 w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-forest" />
          </label>
          <label className="block">
            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Notes</div>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                      className="mt-1 w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
          </label>
        </div>
        {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
        <div className="flex items-center justify-between mt-4">
          {row ? (
            <button onClick={() => { if (confirm('Delete this gift entry?')) del.mutate(); }}
                    className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
              <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button size="sm" variant="plain" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={save.isPending} disabled={!gift.trim()} onClick={() => save.mutate()}>{row ? 'Save' : 'Record'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================== Contact-history block ======================

/**
 * Drop into a Supplier/Volunteer edit modal to show that contact's recruiting
 * history and a quick "Log a touchpoint" button.
 */
export function ContactRecruitingHistory({ targetType, targetId, targetName }: {
  targetType: 'volunteer' | 'supplier'; targetId: number; targetName: string;
}) {
  const [adding, setAdding] = useState<CrmInteraction | 'new' | null>(null);
  const q = useQuery({
    queryKey: ['crm-history', targetType, targetId],
    queryFn:  () => crm.interactions({ targetType, targetId, limit: 100 }),
  });
  const rows = q.data?.data ?? [];

  return (
    <div className="mt-5 border-2 border-clay/15 bg-clay-soft/30 rounded-[16px] overflow-hidden">
      <div className="px-4 py-2.5 bg-clay text-paper flex items-center justify-between">
        <div className="text-[12px] font-extrabold uppercase tracking-[.08em]">Recruiting history</div>
        <button onClick={() => setAdding('new')}
                className="haptic flex items-center gap-1 text-[12px] font-bold bg-paper text-clay rounded-[8px] px-2.5 py-1">
          <Plus size={12} /> Log touchpoint
        </button>
      </div>
      <div className="p-3 space-y-2">
        {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
         rows.length === 0 ? <div className="text-[13px] text-muted">No interactions logged yet for {targetName}.</div> :
         rows.slice(0, 20).map((r) => (
           <button key={r.id} onClick={() => setAdding(r)}
                   className="w-full text-left bg-paper border border-line rounded-[12px] px-3 py-2 hover:border-clay/40 haptic">
             <div className="flex items-center gap-2 text-[12.5px]">
               <span className="font-bold">{CHANNEL_LABEL[r.channel]}</span>
               <span className="text-muted">· {new Date(r.occurredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
               <span className={cx('ml-auto text-[10.5px] font-bold py-0.5 px-2 rounded-full', STATUS_TONE[r.status] ?? 'bg-line text-muted')}>
                 {STATUS_LABEL[r.status] ?? r.status}
               </span>
             </div>
             {r.summary && <div className="text-[12.5px] text-ink mt-1 line-clamp-2">{r.summary}</div>}
             {r.nextFollowupAt && (
               <div className="text-[11px] text-clay font-bold mt-1">
                 Follow up {new Date(r.nextFollowupAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
               </div>
             )}
           </button>
         ))}
      </div>

      {adding && (
        <PrefilledInteractionForm
          row={adding === 'new' ? null : adding}
          targetType={targetType}
          targetId={targetId}
          targetName={targetName}
          onClose={() => setAdding(null)}
          onDone={() => setAdding(null)}
        />
      )}
    </div>
  );
}

/** Same form, but the contact is locked to the parent supplier/volunteer. */
function PrefilledInteractionForm(props: {
  row: CrmInteraction | null;
  targetType: 'volunteer' | 'supplier';
  targetId: number;
  targetName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <InteractionFormModal
      row={props.row}
      lockContact={{ targetType: props.targetType, targetId: props.targetId, targetName: props.targetName }}
      onClose={props.onClose} onDone={props.onDone}
    />
  );
}
