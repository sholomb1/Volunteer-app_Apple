/**
 * Supplier home — single "Post a Pickup" CTA up top, plus a list of recent
 * posts with their live status. The big create button uses the mockup's
 * clay tone since this is the supplier's primary "do it" action.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, MessageSquare, ArrowLeft, Edit3 } from 'lucide-react';
import { supplier, dm, type AuthUser, type SupplierPickup } from '../api';
import { AppBar, Avatar, Card, FadeUp, Skeleton, StatusPill, cx } from '../design';
import { ChatThread } from '../chat-thread';
import { fmtDateTimeFull } from '../time-format';

export function SupplierHome({ user }: { user: AuthUser }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: supplier.profile });
  const pickups = useQuery({ queryKey: ['supplier-pickups'], queryFn: supplier.pickups });
  const office = useQuery({ queryKey: ['dm-office'], queryFn: dm.office });
  const cancel = useMutation({ mutationFn: (id: number) => supplier.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-pickups'] }) });

  const [chatWithOffice, setChatWithOffice] = useState(false);
  const officeUser = office.data?.data?.[0];

  if (chatWithOffice && officeUser) {
    return (
      <div className="min-h-screen flex flex-col px-4 pt-3 pb-[88px]">
        <button onClick={() => setChatWithOffice(false)}
                className="haptic self-start flex items-center gap-1.5 text-[14px] font-bold text-forest mb-2">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex-1 min-h-0">
          <ChatThread userId={officeUser.user_id}
                      title="Zeh L'Zeh Office"
                      subtitle="Coordinator team" color="#2C5A3B" />
        </div>
      </div>
    );
  }

  const storeName = profile.data?.data.name || user.firstName;
  const active = pickups.data?.data.filter((p) => p.status !== 'completed' && p.status !== 'cancelled') ?? [];
  const recent = pickups.data?.data.filter((p) => p.status === 'completed' || p.status === 'cancelled').slice(0, 6) ?? [];

  return (
    <div className="min-h-screen pb-[90px]">
      <AppBar title="Zeh L'Zeh" leftMark="ז" altMark right={<Avatar initials="RK" />} />

      <main className="px-5">
        <FadeUp>
          <div className="text-[11px] font-bold text-muted">Donor</div>
          <h1 className="font-display font-semibold text-[24px] leading-tight">{storeName}</h1>
        </FadeUp>

        {/* Big CTA */}
        <FadeUp delay={0.05} className="mt-5">
          <button onClick={() => nav('/post')}
            className="haptic w-full relative overflow-hidden bg-clay text-paper rounded-[20px] p-6 text-left shadow-cta">
            <div className="absolute -top-10 -right-6 h-32 w-32 rounded-full bg-paper/15" />
            <div className="relative flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-[16px] bg-paper/20"><Plus size={28} /></span>
              <div className="flex-1">
                <div className="font-display font-semibold text-[22px] leading-tight">Food ready now</div>
                <div className="text-[13px] text-paper/80 mt-0.5">Post a pickup — drivers nearby get notified.</div>
              </div>
            </div>
          </button>
        </FadeUp>

        {/* Chat with office — single contact per the chat-permission matrix:
            suppliers may DM only the Zeh L'Zeh office. */}
        <FadeUp delay={0.08}>
          <button onClick={() => officeUser && setChatWithOffice(true)} disabled={!officeUser}
                  className="haptic mt-3 w-full bg-paper border border-sage-line rounded-[16px] p-4 text-left flex items-center gap-3 disabled:opacity-60">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-forest text-paper font-display font-bold text-[15px]">ZL</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[16px] truncate">Chat with Zeh L'Zeh Office</div>
              <div className="text-[13px] text-muted truncate">Coordinator team · any time</div>
            </div>
            <MessageSquare size={20} className="text-forest" />
          </button>
        </FadeUp>

        {/* Self-edit profile shortcut. */}
        <FadeUp delay={0.1}>
          <button onClick={() => nav('/profile')}
                  className="haptic mt-3 w-full bg-paper border border-line rounded-[16px] p-4 text-left flex items-center gap-3 hover:border-forest/40">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sage text-forest"><Edit3 size={18} /></span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[16px] truncate">Edit store info</div>
              <div className="text-[13px] text-muted truncate">Address, contact, pickup instructions, hours</div>
            </div>
          </button>
        </FadeUp>

        {/* Active list */}
        <div className="mt-7 mb-2 text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">Active</div>
        {pickups.isLoading ? <Skeleton className="h-20 rounded-[16px]" /> :
          active.length === 0 ? <div className="text-[13px] text-muted py-3">No active pickups yet.</div> :
          <div className="space-y-2.5">
            {active.map((p) => <SupplierRow key={p.pickup_instance_id} p={p}
                                onEdit={() => nav(`/pickups/${p.pickup_instance_id}/edit`)}
                                onCancel={() => { if (confirm('Cancel this pickup?')) cancel.mutate(Number(p.pickup_instance_id)); }} />)}
          </div>}

        {recent.length > 0 && <>
          <div className="mt-6 mb-2 text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">Recent</div>
          <div className="space-y-2.5">
            {recent.map((p) => <SupplierRow key={p.pickup_instance_id} p={p} muted />)}
          </div>
        </>}
      </main>
    </div>
  );
}

function SupplierRow({ p, muted, onCancel, onEdit }: { p: SupplierPickup; muted?: boolean; onCancel?: () => void; onEdit?: () => void }) {
  // p.scheduled_time is a wall-clock TIME (no timezone, already Eastern).
  // Combine with the date and treat as Eastern by constructing in local then
  // formatting in the Eastern zone for both consistency and 12-hour display.
  const dt = fmtDateTimeFull(`${p.scheduled_date.slice(0, 10)}T${p.scheduled_time}-05:00`);
  return (
    <Card className={cx('!p-3.5', muted && 'bg-cream/60 border-line/60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={p.status} />
            <span className="text-[11.5px] text-muted font-semibold">{dt}</span>
          </div>
          {p.notes && <div className="text-[13px] text-ink mt-1.5">{p.notes}</div>}
          {p.volunteers && <div className="text-[12px] text-forest font-bold mt-1">✓ {p.volunteers}</div>}
        </div>
        {(p.status === 'pending' || p.status === 'scheduled' || p.status === 'confirmed') && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button onClick={onEdit} title="Edit pickup"
                      className="haptic text-muted hover:text-forest rounded-full p-1.5"><Edit3 size={16} /></button>
            )}
            {onCancel && (
              <button onClick={onCancel} title="Cancel pickup"
                      className="haptic text-muted hover:text-clay rounded-full p-1.5"><X size={16} /></button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
