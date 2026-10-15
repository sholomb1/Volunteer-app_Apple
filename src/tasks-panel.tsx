/**
 * Task Management (client New UI Plan §6, Oct 2 2026).
 * One list for recruiting, prospect, follow-up and general office tasks:
 * assignee, due date, priority, status, notes, next follow-up and history.
 * Driver / supplier conversations stay under Messaging.
 * Backend: apps/api/src/routes/tasks.ts (zlz.tasks / zlz.task_history).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx, SearchBar, DateInput } from './design';

type Task = {
  id: number; title: string; kind: Kind; relatedType: 'volunteer' | 'supplier' | 'prospect' | null;
  relatedId: number | null; relatedName: string | null; assigneeUserId: number | null; assigneeName: string | null;
  dueDate: string | null; priority: Priority; status: Status; notes: string | null; nextFollowupDate: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
};
type Kind = 'general' | 'recruiting' | 'prospect' | 'follow_up';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type Status = 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled';

const KIND_LABEL: Record<Kind, string> = { general: 'General', recruiting: 'Recruiting', prospect: 'Prospect', follow_up: 'Follow-up' };
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const STATUS_LABEL: Record<Status, string> = { open: 'Open', in_progress: 'In progress', waiting: 'Waiting', done: 'Done', cancelled: 'Cancelled' };
const PRIORITY_TONE: Record<Priority, string> = {
  urgent: 'bg-clay text-paper', high: 'bg-clay-soft text-clay', normal: 'bg-line/70 text-muted', low: 'bg-cream text-muted',
};
const FIELD_LABEL: Record<string, string> = {
  title: 'Title', kind: 'Type', relatedType: 'Related to', relatedId: 'Related record', assigneeUserId: 'Assignee',
  dueDate: 'Due date', priority: 'Priority', status: 'Status', notes: 'Notes', nextFollowupDate: 'Next follow-up',
};

function nyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
function fmtDay(d: string | null): string {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TasksPanel() {
  const [scope, setScope] = useState<'open' | 'mine' | 'done' | 'all'>('open');
  const [kind, setKind] = useState<'' | Kind>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Task | 'new' | null>(null);
  const params = new URLSearchParams();
  params.set('status', scope === 'mine' ? 'open' : scope === 'done' ? 'done' : scope);
  if (scope === 'mine') params.set('assignee', 'me');
  if (kind) params.set('kind', kind);
  const tasks = useQuery({
    queryKey: ['tasks', scope, kind],
    queryFn: () => api<{ data: Task[] }>(`/api/tasks?${params.toString()}`),
  });
  const today = nyToday();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = tasks.data?.data ?? [];
    if (!needle) return all;
    return all.filter((t) => [t.title, t.notes, t.assigneeName, t.relatedName, KIND_LABEL[t.kind], STATUS_LABEL[t.status]]
      .filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [tasks.data, q]);
  const chip = (on: boolean) => cx('haptic px-3 py-1.5 rounded-full text-[12px] font-bold border',
    on ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line hover:text-ink');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['open', 'mine', 'done', 'all'] as const).map((k) => (
          <button key={k} onClick={() => setScope(k)} className={chip(scope === k)}>
            {k === 'open' ? 'Open' : k === 'mine' ? 'Assigned to me' : k === 'done' ? 'Done' : 'All'}
          </button>
        ))}
        <select value={kind} onChange={(e) => setKind(e.target.value as any)}
                className="rounded-[9px] border border-line bg-paper px-2 py-1.5 text-[12px]">
          <option value="">All types</option>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <SearchBar value={q} onChange={setQ} placeholder="Search tasks…" />
        <button onClick={() => setOpen('new')}
                className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper shadow-ctag hover:brightness-110">
          + New task
        </button>
      </div>

      {tasks.isLoading ? (
        <div className="text-[13px] text-muted">Loading…</div>
      ) : tasks.isError ? (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-clay">
          Couldn't load tasks. <button onClick={() => tasks.refetch()} className="font-bold underline">Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">No tasks here.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => {
            const overdue = t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled';
            const followDue = t.nextFollowupDate && t.nextFollowupDate <= today && t.status !== 'done' && t.status !== 'cancelled';
            return (
              <div key={t.id} onClick={() => setOpen(t)}
                   className={cx('cursor-pointer hover:shadow-card transition bg-paper rounded-[14px] px-4 py-3 border',
                                 overdue ? 'border-clay/60' : 'border-line')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[13.5px] text-ink">{t.title}</span>
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wide bg-sky-soft text-sky-deep px-1.5 py-0.5 rounded-full">{KIND_LABEL[t.kind]}</span>
                  <span className={cx('text-[10.5px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full', PRIORITY_TONE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span>
                  <span className="ml-auto text-[11.5px] font-bold text-muted">{STATUS_LABEL[t.status]}</span>
                </div>
                <div className="mt-1 text-[11.5px] text-muted flex flex-wrap gap-x-3">
                  <span>{t.assigneeName ? `👤 ${t.assigneeName}` : 'Unassigned'}</span>
                  {t.dueDate && <span className={overdue ? 'text-clay font-bold' : ''}>Due {fmtDay(t.dueDate)}{overdue ? ' · overdue' : ''}</span>}
                  {t.nextFollowupDate && <span className={followDue ? 'text-clay font-bold' : ''}>Follow up {fmtDay(t.nextFollowupDate)}</span>}
                  {t.relatedName && <span>Re: {t.relatedName}</span>}
                </div>
                {t.notes && <div className="mt-1 text-[11.5px] text-ink line-clamp-1">{t.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
      {open && <TaskModal task={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TaskModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const qc = useQueryClient();
  const assignees = useQuery({ queryKey: ['task-assignees'], queryFn: () => api<{ data: { id: number; name: string | null; role: string }[] }>('/api/tasks/assignees') });
  const volunteers = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500&logo=url') });
  const history = useQuery({
    queryKey: ['task-history', task?.id], enabled: !!task,
    queryFn: () => api<{ data: { id: number; action: string; changes: any; note: string | null; createdAt: string; userName: string | null }[] }>(`/api/tasks/${task!.id}/history`),
  });
  const [title, setTitle] = useState(task?.title ?? '');
  const [kind, setKind] = useState<Kind>(task?.kind ?? 'general');
  const [assignee, setAssignee] = useState<number | ''>(task?.assigneeUserId ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [status, setStatus] = useState<Status>(task?.status ?? 'open');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [follow, setFollow] = useState(task?.nextFollowupDate ?? '');
  const [relType, setRelType] = useState<'' | 'volunteer' | 'supplier' | 'prospect'>(task?.relatedType ?? '');
  const [relId, setRelId] = useState<number | ''>(task?.relatedId ?? '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const body = {
    title: title.trim(), kind, assigneeUserId: assignee === '' ? null : assignee,
    dueDate: dueDate || null, priority, status, notes: notes.trim() || null, nextFollowupDate: follow || null,
    relatedType: relType || null, relatedId: relType && relId !== '' ? relId : null,
  };
  const refresh = () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task-history'] }); };
  const save = useMutation({
    mutationFn: () => task
      ? api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      : api('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { refresh(); onClose(); },
    onError: (e: any) => setErr(e?.message || 'Save failed'),
  });
  const addNote = useMutation({
    mutationFn: () => api(`/api/tasks/${task!.id}/notes`, { method: 'POST', body: JSON.stringify({ note: note.trim() }) }),
    onSuccess: () => { setNote(''); refresh(); },
    onError: (e: any) => setErr(e?.message || 'Could not add note'),
  });
  const inp = 'mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal';
  const lbl = 'block text-[12px] font-bold';
  const relOptions: { id: number; name: string }[] = relType === 'volunteer'
    ? (volunteers.data?.data ?? []).map((v: any) => ({ id: Number(v.id), name: `${v.firstName} ${v.lastName}${v.unitNumber != null ? ` #${v.unitNumber}` : ''}` }))
    : relType === 'supplier'
    ? (suppliers.data?.data ?? []).map((s: any) => ({ id: Number(s.id), name: s.name }))
    : [];
  const describe = (h: { action: string; changes: any; note: string | null }) => {
    if (h.action === 'note') return h.note ?? '';
    if (h.action === 'created') return 'Created the task';
    const c = h.changes && typeof h.changes === 'object' ? Object.keys(h.changes) : [];
    return c.length ? `Changed ${c.map((k) => FIELD_LABEL[k] ?? k).join(', ')}` : 'Updated';
  };

  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-lg p-5 space-y-3 mb-10">
        <div className="flex items-center justify-between">
          <div className="font-display font-semibold text-[16px]">{task ? 'Task' : 'New task'}</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream text-muted">✕</button>
        </div>
        <label className={lbl}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>Type
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inp}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select></label>
          <label className={lbl}>Assignee
            <select value={assignee} onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : '')} className={inp}>
              <option value="">Unassigned</option>
              {(assignees.data?.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name ?? `User #${a.id}`}</option>)}
            </select></label>
          <label className={lbl}>Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inp}>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
            </select></label>
          <label className={lbl}>Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={inp}>
              {(Object.keys(STATUS_LABEL) as Status[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select></label>
          <label className={lbl}>Due date<DateInput value={dueDate} onChange={setDueDate} className={inp} /></label>
          <label className={lbl}>Next follow-up<DateInput value={follow} onChange={setFollow} className={inp} /></label>
          <label className={lbl}>Related to
            <select value={relType} onChange={(e) => { setRelType(e.target.value as any); setRelId(''); }} className={inp}>
              <option value="">Nothing</option>
              <option value="volunteer">Volunteer</option>
              <option value="supplier">Supplier</option>
              {relType === 'prospect' && <option value="prospect">Prospect</option>}
            </select></label>
          {relType && relType !== 'prospect' && (
            <label className={lbl}>{relType === 'volunteer' ? 'Volunteer' : 'Supplier'}
              <select value={relId} onChange={(e) => setRelId(e.target.value ? Number(e.target.value) : '')} className={inp}>
                <option value="">Choose…</option>
                {relOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></label>
          )}
          {relType === 'prospect' && <div className="text-[12px] text-muted pt-6">{task?.relatedName ?? 'Prospect'}</div>}
        </div>
        <label className={lbl}>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inp} /></label>
        {err && <div className="text-[12px] text-clay">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted hover:bg-cream">Cancel</button>
          <button disabled={!title.trim() || save.isPending} onClick={() => { setErr(null); save.mutate(); }}
                  className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
            {save.isPending ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </button>
        </div>

        {task && (
          <div className="border-t border-line pt-3 space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">History</div>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the history…"
                     className="flex-1 rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[13px]" />
              <button disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}
                      className="haptic rounded-[10px] border border-line px-3 py-1.5 text-[12px] font-bold text-forest disabled:opacity-50">Add</button>
            </div>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {(history.data?.data ?? []).map((h) => (
                <div key={h.id} className="text-[12px]">
                  <span className="text-muted">{new Date(h.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  {' · '}<span className="font-bold">{h.userName ?? 'Someone'}</span>{' · '}{describe(h)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
