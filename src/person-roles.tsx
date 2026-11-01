/**
 * Oct 29 client (owner + dispatcher Yakov): each person can have MORE THAN ONE role.
 *   🚗 On the fly · 📅 Steady · 🏠 In center · 🧭 Dispatcher (office admins only)
 *   + 🚚 Goes to Lakewood / 🚚 Goes to Fallsburg (optional "usual days" note), no texting effects.
 * Shown as tick boxes on the driver card ("Helps with") and as small tags on the Drivers list
 * and Center Help. Nothing changes on day one: the server computes the defaults and keeps only
 * the office's changes (GET/PUT /api/person-roles, no migration).
 * Dispatcher = Admin → Dispatchers "Make dispatcher (same login)": ticking opens that same box,
 * unticking = "Turn off dispatcher" (POST /api/admin-users/:id/driver-only).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { uiConfirm, uiNotify } from './ui-dialogs';
import { InviteStaffModal } from './staff-invite';
import { changeHistoryKey } from './change-history';

export type PersonRoles = {
  fly: boolean; steady: boolean; center: boolean;
  lakewood: boolean; lakewoodDays: string | null; fallsburg: boolean; fallsburgDays: string | null;
  dispatcher?: boolean; loginRole?: string | null; loginId?: number | null; ownLogin?: boolean;
};
export type PersonRolesData = { roles: Record<string, PersonRoles>; canEdit: boolean; canDispatcher: boolean };
export type RoleKey = 'fly' | 'steady' | 'center' | 'dispatcher' | 'lakewood' | 'fallsburg';

export const ROLE_TAGS: Array<{ key: RoleKey; icon: string; label: string; cls: string }> = [
  { key: 'fly',        icon: '🚗', label: 'On the fly',        cls: 'bg-sky-soft text-sky-deep' },
  { key: 'steady',     icon: '📅', label: 'Steady',            cls: 'bg-sage text-forest' },
  { key: 'center',     icon: '🏠', label: 'In center',         cls: 'bg-amber-soft text-[#8a6011]' },
  { key: 'dispatcher', icon: '🧭', label: 'Dispatcher',        cls: 'bg-line text-ink' },
  { key: 'lakewood',   icon: '🚚', label: 'Goes to Lakewood',  cls: 'bg-clay-soft text-clay' },
  { key: 'fallsburg',  icon: '🚚', label: 'Goes to Fallsburg', cls: 'bg-clay-soft text-clay' },
];

/** Every driver's roles, one request for the whole page (cached 30 s, like the server). */
export function usePersonRoles(enabled = true) {
  return useQuery({
    queryKey: ['person-roles'],
    queryFn: () => api<{ data: PersonRolesData }>('/api/person-roles'),
    staleTime: 30_000, enabled,
  });
}

export function rolesOf(data: PersonRolesData | undefined, id: number | null | undefined): PersonRoles | null {
  if (!data || id == null) return null;
  return data.roles[String(id)] ?? null;
}

/** True = has this role (filter on the Drivers list). */
export function hasRole(r: PersonRoles | null, key: RoleKey): boolean {
  return !!r && !!r[key];
}

/** Small tags: "🚗 On the fly  📅 Steady …". `only` = the roles to show (default: all ticked). */
export function RoleTags({ r, className, first }: { r: PersonRoles | null; className?: string; first?: RoleKey }) {
  if (!r) return null;
  const tags = ROLE_TAGS.filter((t) => r[t.key]);
  if (first) tags.sort((a, b) => (a.key === first ? -1 : b.key === first ? 1 : 0));
  if (!tags.length) return null;
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-1', className)} data-testid="role-tags">
      {tags.map((t) => {
        const days = t.key === 'lakewood' ? r.lakewoodDays : t.key === 'fallsburg' ? r.fallsburgDays : null;
        return (
          <span key={t.key} className={cx('text-[10.5px] font-bold rounded-full px-1.5 py-0.5 whitespace-nowrap', t.cls)}
                title={days ? `${t.label}: ${days}` : t.label}>
            {t.icon} {t.label}{days ? ` · ${days}` : ''}
          </span>
        );
      })}
    </span>
  );
}

/** Role filter chips for the Drivers list. */
export function RoleFilter({ value, onChange, counts, showDispatcher }: {
  value: RoleKey | null; onChange: (k: RoleKey | null) => void; counts: Partial<Record<RoleKey, number>>; showDispatcher: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="role-filter">
      <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mr-0.5">Helps with</span>
      {ROLE_TAGS.filter((t) => showDispatcher || t.key !== 'dispatcher').map((t) => {
        const on = value === t.key;
        return (
          <button key={t.key} onClick={() => onChange(on ? null : t.key)}
                  className={cx('haptic text-[12px] font-bold px-2.5 py-1 rounded-full border inline-flex items-baseline gap-1.5',
                    on ? 'bg-forest text-paper border-forest' : `${t.cls} border-line hover:brightness-95`)}>
            <span>{t.icon} {t.label}</span>
            <span className={cx('text-[10.5px] font-extrabold', on ? 'text-paper/85' : 'opacity-80')}>{counts[t.key] ?? 0}</span>
          </button>
        );
      })}
      {value && <button onClick={() => onChange(null)} className="haptic text-[11.5px] font-bold text-forest underline underline-offset-2 ml-1">Clear</button>}
    </div>
  );
}

type Driver = { id: number; firstName?: string | null; lastName?: string | null; phonePrimary?: string | null; email?: string | null };

/** Driver card: "Helps with" — the tick boxes. Office admins change them; others only see them. */
export function HelpsWithRow({ driver }: { driver: Driver }) {
  const qc = useQueryClient();
  const q = usePersonRoles();
  const data = q.data?.data;
  const r = rolesOf(data, driver.id);
  const [days, setDays] = useState<{ lakewood?: string; fallsburg?: string }>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['person-roles'] });
    qc.invalidateQueries({ queryKey: ['center-help-people'] });
    qc.invalidateQueries({ queryKey: ['center-help-people-candidates'] });
    qc.invalidateQueries({ queryKey: changeHistoryKey(driver.id) });
  };
  const save = useMutation({
    mutationFn: (patch: Partial<Record<RoleKey | 'lakewoodDays' | 'fallsburgDays', boolean | string | null>>) =>
      api<{ data: PersonRoles }>(`/api/person-roles/${driver.id}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onSuccess: (res) => {
      qc.setQueryData(['person-roles'], (old: any) => old?.data
        ? { data: { ...old.data, roles: { ...old.data.roles, [String(driver.id)]: res.data } } } : old);
      refresh();
    },
    onError: (e: any) => uiNotify(e?.message || 'Could not save', 'err'),
  });
  const offDispatcher = useMutation({
    mutationFn: () => api(`/api/admin-users/${r?.loginId}/driver-only`, { method: 'POST', body: '{}' }),
    onSuccess: () => { refresh(); for (const k of ['admin-dispatchers', 'dispatchers', 'dispatcher-roster']) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e: any) => uiNotify(e?.message || 'Could not turn off dispatcher', 'err'),
  });
  if (q.isLoading) return <div className="text-[12px] text-muted mb-3">Loading roles…</div>;
  if (!r || !data) return null;
  const edit = data.canEdit;
  const name = `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || 'this driver';
  const busy = save.isPending || offDispatcher.isPending;
  const loginRole = String(r.loginRole ?? '').toLowerCase();
  const officeLogin = r.dispatcher && loginRole !== 'dispatcher';
  async function toggle(key: RoleKey, on: boolean) {
    if (!edit || busy) return;
    if (key === 'dispatcher') {
      if (on) { setInviteOpen(true); return; }
      if (officeLogin) { uiNotify(`${name}'s login is an office login (${loginRole}). Change it in Admin → Dispatchers.`, 'err'); return; }
      if (!r!.ownLogin || !r!.loginId) { uiNotify('Change this in Admin → Dispatchers.', 'err'); return; }
      if (await uiConfirm(`Turn off dispatcher for ${name}?\n\nThe same login goes back to the driver app only (same username and password).`)) offDispatcher.mutate();
      return;
    }
    if (key === 'fly' && !on && !(await uiConfirm(`Untick "On the fly" for ${name}?\n\nThey will stop getting texts, WhatsApp and app alerts about one-time pickups. Their steady pickups and pickups they are on still reach them.`))) return;
    save.mutate({ [key]: on });
  }
  const box = (key: RoleKey, sub: string) => {
    const t = ROLE_TAGS.find((x) => x.key === key)!;
    const on = !!r[key];
    const disabled = !edit || busy || (key === 'dispatcher' && !!officeLogin);
    return (
      <label key={key} className={cx('flex items-start gap-2 rounded-[10px] border px-2.5 py-2',
                                      on ? 'border-forest/40 bg-sage/40' : 'border-line bg-paper',
                                      edit && !disabled ? 'cursor-pointer' : 'cursor-default')}
             title={key === 'dispatcher' && officeLogin ? `Office login (${loginRole})` : undefined}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-forest" checked={on} disabled={disabled}
               onChange={(e) => void toggle(key, e.target.checked)} data-testid={`role-${key}`} />
        <span className="min-w-0">
          <span className="block text-[13px] font-bold">{t.icon} {t.label}</span>
          <span className="block text-[11px] text-muted leading-snug">{sub}</span>
        </span>
      </label>
    );
  };
  const travel = (key: 'lakewood' | 'fallsburg') => {
    const t = ROLE_TAGS.find((x) => x.key === key)!;
    const on = r[key];
    const saved = (key === 'lakewood' ? r.lakewoodDays : r.fallsburgDays) ?? '';
    const val = days[key] ?? saved;
    return (
      <div key={key} className={cx('flex flex-wrap items-center gap-2 rounded-[10px] border px-2.5 py-1.5',
                                   on ? 'border-clay/40 bg-clay-soft/40' : 'border-line bg-paper')}>
        <label className={cx('flex items-center gap-2 text-[12.5px] font-bold', edit ? 'cursor-pointer' : 'cursor-default')}>
          <input type="checkbox" className="h-4 w-4 accent-forest" checked={on} disabled={!edit || busy}
                 onChange={(e) => save.mutate({ [key]: e.target.checked })} data-testid={`role-${key}`} />
          {t.icon} {t.label}
        </label>
        {on && (edit
          ? <input value={val} maxLength={60} placeholder="Usual days (e.g. Thursdays)"
                   onChange={(e) => setDays((d) => ({ ...d, [key]: e.target.value }))}
                   onBlur={() => { if (val.trim() !== saved) save.mutate({ [`${key}Days`]: val.trim() || null }); }}
                   className="flex-1 min-w-[140px] rounded-[8px] border border-line bg-paper px-2 py-1 text-[12px]" />
          : saved ? <span className="text-[12px] text-muted">{saved}</span> : null)}
      </div>
    );
  };
  return (
    <div className="mb-3 rounded-[12px] border border-line bg-cream/40 px-3 py-2.5" data-testid="helps-with">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-[12px] font-extrabold uppercase tracking-[.05em] text-muted">Helps with</div>
        {!edit && <div className="text-[11px] text-muted">Only the office can change these.</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {box('fly', 'Gets pickup texts / WhatsApp for one-time pickups')}
        {box('steady', 'Can be a steady driver; gets steady reminders')}
        {box('center', 'On the Center Help list; center shifts')}
        {data.canDispatcher && box('dispatcher', officeLogin ? `Office login (${loginRole})` : 'Dispatcher access, same login')}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1.5">
        {travel('lakewood')}
        {travel('fallsburg')}
      </div>
      {inviteOpen && (
        <InviteStaffModal onClose={() => { setInviteOpen(false); refresh(); }}
                          prefill={{ firstName: driver.firstName ?? '', lastName: driver.lastName ?? '', phone: driver.phonePrimary ?? '',
                                     email: driver.email ?? '', hasVolunteerLogin: !!r.ownLogin, volunteerId: driver.id }} />
      )}
    </div>
  );
}

/** Driver app Settings: read-only "You help with: On the fly, Steady". */
export function HelpsWithLine() {
  const q = useQuery({ queryKey: ['me-roles'], queryFn: () => api<{ data: { text: string } | null }>('/api/me/roles'), staleTime: 60_000 });
  const text = q.data?.data?.text;
  if (!text) return null;
  return (
    <div className="mb-3 rounded-[14px] border border-line bg-paper px-4 py-3 text-[15px]" data-testid="helps-with-line">
      <span className="text-muted">You help with:</span> <b>{text}</b>
      <div className="text-[12.5px] text-muted mt-0.5">The office sets this. Ask them to change it.</div>
    </div>
  );
}
