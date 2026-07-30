/**
 * Settings → Admin users panel. List + invite + role/active toggle.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, KeyRound, ShieldCheck } from 'lucide-react';
import { adminUsers, type AdminUser } from './api';
import { cx, Button } from './design';

const ROLES: AdminUser['role'][] = ['admin', 'coordinator', 'staff', 'dispatcher', 'read_only'] as any;
const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin:       'Super Admin — full access, can manage other admin users.',
  coordinator: 'Office staff — day-to-day office work.',
  staff:       'Office staff — same as coordinator.',
  dispatcher:  'Assigns drivers, edits pickups, sends SMS. No user management.',
  read_only:   'View-only. No changes allowed.',
};

export function AdminUsersPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-users'], queryFn: adminUsers.list });
  const rows = q.data?.data ?? [];

  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-muted">
          {rows.length} staff user{rows.length === 1 ? '' : 's'} · {rows.filter((r) => r.isActive).length} active
        </div>
        <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>Invite admin</Button>
      </div>

      {showAdd && <AddAdminForm onCancel={() => setShowAdd(false)} onDone={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['admin-users'] }); }} />}

      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {q.isLoading ? <div className="text-[13.5px] text-muted text-center py-8">Loading…</div> :
         rows.length === 0 ? <div className="text-[13.5px] text-muted text-center py-8">No staff users yet.</div> :
         rows.map((u) => <AdminUserRow key={u.id} row={u} onChanged={() => qc.invalidateQueries({ queryKey: ['admin-users'] })} />)}
      </div>
    </div>
  );
}

function AdminUserRow({ row, onChanged }: { row: AdminUser; onChanged: () => void }) {
  const patch = useMutation({
    mutationFn: (body: { role?: string; isActive?: boolean }) => adminUsers.patch(row.id, body),
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: () => adminUsers.remove(row.id),
    onSuccess: onChanged,
  });

  return (
    <div className={cx('flex items-center gap-3 px-4 py-3 border-b border-line last:border-b-0',
                       row.isActive ? 'bg-paper' : 'bg-cream/40 opacity-70')}>
      <span className={cx('grid h-10 w-10 place-items-center rounded-full font-bold text-[14px]',
                          row.role === 'admin' ? 'bg-forest text-paper'
                          : row.role === 'coordinator' ? 'bg-clay text-paper'
                          : 'bg-sage text-forest')}>
        <ShieldCheck size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[14.5px] truncate">{row.firstName} {row.lastName}</div>
        <div className="text-[12.5px] text-muted truncate">{row.email}{row.lastLoginAt ? ` · last login ${new Date(row.lastLoginAt).toLocaleDateString()}` : ' · never logged in'}</div>
      </div>
      <select value={row.role} onChange={(e) => patch.mutate({ role: e.target.value })}
              className="rounded-[10px] border-[1.4px] border-line bg-paper px-2 py-1.5 text-[12.5px] font-bold text-ink">
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <button onClick={() => patch.mutate({ isActive: !row.isActive })}
              className={cx('text-[11.5px] font-bold rounded-full px-3 py-1.5 haptic',
                            row.isActive ? 'bg-sage text-forest' : 'bg-clay-soft text-clay')}>
        {row.isActive ? 'Active' : 'Inactive'}
      </button>
      <button onClick={() => { if (confirm(`Deactivate ${row.firstName} ${row.lastName}? They will no longer be able to log in.`)) del.mutate(); }}
              className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function AddAdminForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [firstName, setFirst]   = useState('');
  const [lastName, setLast]     = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState<AdminUser['role']>('coordinator');
  const inputCls = 'w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2.5 text-[13.5px] outline-none focus:border-forest';
  const create = useMutation({
    mutationFn: () => adminUsers.create({ username: username.trim(), password, firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined, role }),
    onSuccess: onDone,
  });
  const canSubmit = username.trim().length >= 3 && password.length >= 8;

  return (
    <div className="rounded-[14px] border-2 border-forest/30 bg-sage/30 p-4 space-y-3">
      <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-forest">
        <KeyRound size={14} className="inline mr-1 -mt-0.5" /> Invite new staff user
      </div>
      <p className="text-[12.5px] text-muted">
        They'll log in with the username and password you set. They can change it later from their Change Password screen.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">First name</span>
          <input value={firstName} onChange={(e) => setFirst(e.target.value)} className={inputCls} placeholder="optional" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Last name</span>
          <input value={lastName} onChange={(e) => setLast(e.target.value)} className={inputCls} placeholder="optional" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Username (phone or email)</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="e.g. coordinator@zehlzeh.org" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Temp password (8+ chars)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as AdminUser['role'])} className={inputCls}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r === 'admin' ? 'Super Admin'
                 : r === 'coordinator' ? 'Office Staff (coordinator)'
                 : r === 'staff' ? 'Office Staff'
                 : r === 'dispatcher' ? 'Dispatcher'
                 : r === 'read_only' ? 'Read-Only'
                 : r}
              </option>
            ))}
          </select>
          <span className="text-[11.5px] text-muted mt-0.5">{ROLE_DESCRIPTIONS[role] ?? ''}</span>
        </label>
      </div>
      {create.error && <p className="text-clay text-[12.5px] font-bold">{(create.error as Error).message}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="forest" loading={create.isPending} disabled={!canSubmit}
                onClick={() => create.mutate()} icon={<Plus size={14} />}>
          Create user
        </Button>
      </div>
    </div>
  );
}
