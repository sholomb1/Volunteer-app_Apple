/**
 * Chat tab — surfaces:
 *  • A "Zeh L'Zeh Office" entry that opens a direct in-app DM with the
 *    coordinator/office (matches the chat-permission matrix: drivers may DM
 *    suppliers + office, never other drivers).
 *  • The user's currently-active pickups so they can tap into per-pickup
 *    chat (the multi-driver chat inside the trip).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { volunteer, dm } from '../api';
import { AppBar, Avatar, Card, Skeleton, cx } from '../design';
import { ChatThread } from '../chat-thread';
import { fmtTime, fmtDateEastern } from '../time-format';

export function Chat() {
  const nav = useNavigate();
  const mine = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine });
  const office = useQuery({ queryKey: ['dm-office'], queryFn: dm.office });
  const unread = useQuery({ queryKey: ['dm-unread'], queryFn: dm.unread, refetchInterval: 20_000 });
  const unreadByPeer = (unread.data?.data?.byPeer ?? []).reduce(
    (acc, r) => { acc[Number(r.peerUserId)] = r.unread; return acc; }, {} as Record<number, number>);
  // Last-message previews + unread per DM peer (office) and per pickup chat.
  const threads = useQuery({ queryKey: ['dm-threads'], queryFn: dm.threads, refetchInterval: 20_000 });
  const threadByPeer = (threads.data?.data?.threads ?? []).reduce(
    (acc, t) => { acc[Number(t.peerUserId)] = t; return acc; },
    {} as Record<number, { lastBody: string; lastAt: string; lastFromMe: boolean; unread: number }>);
  const chatSum = useQuery({ queryKey: ['pickup-chat-summary'], queryFn: volunteer.chatSummary, refetchInterval: 20_000 });
  const sumByPickup = (chatSum.data?.data?.byPickup ?? []).reduce(
    (acc, s) => { acc[Number(s.pickupInstanceId)] = s; return acc; },
    {} as Record<number, { lastBody: string; lastAt: string; unread: number }>);
  const list = mine.data?.data.filter((p) => p.status !== 'completed' && p.status !== 'cancelled') ?? [];
  const officeUser = office.data?.data?.[0];
  const officeUnread = officeUser ? (unreadByPeer[officeUser.user_id] ?? 0) : 0;
  const officeThread = officeUser ? threadByPeer[officeUser.user_id] : undefined;
  const officePreview = officeThread?.lastBody
    ? `${officeThread.lastFromMe ? 'You: ' : ''}${officeThread.lastBody}`
    : 'Coordinator team · any time';

  const [chatWithOffice, setChatWithOffice] = useState(false);

  if (chatWithOffice && officeUser) {
    return (
      <div className="min-h-screen flex flex-col px-4 pt-3 pb-[88px]">
        <button onClick={() => setChatWithOffice(false)}
                className="haptic self-start flex items-center gap-1.5 text-[14px] font-bold text-forest mb-2">
          <ArrowLeft size={16} /> Back to chats
        </button>
        <div className="flex-1 min-h-0">
          <ChatThread userId={officeUser.user_id}
                      title="Zeh L'Zeh Office"
                      subtitle="Coordinator team" color="#2C5A3B" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[80px]">
      <AppBar title="Chat" right={<Avatar initials="DG" />} />

      <main className="px-5">
        <h1 className="font-display font-semibold text-[24px]">Your chats</h1>
        <p className="text-[14px] text-muted mt-1 mb-5">
          Reach the Zeh L'Zeh office anytime, or jump into a pickup chat with the donor + co-drivers.
        </p>

        {/* Office contact — always shown at the top. */}
        <Card onClick={() => officeUser && setChatWithOffice(true)} className="!p-4 mb-4 cursor-pointer">
          <div className="flex items-center gap-3">
            <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-forest text-paper font-display font-bold text-[15px]">
              ZL
              {officeUnread > 0 && (
                <span className="absolute -top-1 -right-1 inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-clay text-paper text-[11px] font-extrabold border-2 border-cream">
                  {officeUnread > 99 ? '99+' : officeUnread}
                </span>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[16px] truncate">Zeh L'Zeh Office</div>
              <div className={cx('text-[13px] truncate', officeUnread > 0 ? 'text-ink font-semibold' : 'text-muted')}>{officePreview}</div>
            </div>
            <MessageSquare size={20} className="text-forest" />
          </div>
        </Card>

        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted mt-4 mb-2">Pickup chats</div>
        {mine.isLoading ? <Skeleton className="h-20 rounded-[16px]" /> :
         list.length === 0 ? (
           <div className="text-center py-10">
             <div className="mx-auto h-14 w-14 rounded-2xl bg-sage grid place-items-center mb-3"><MessageSquare size={26} className="text-forest" /></div>
             <div className="font-display font-semibold text-[16px]">No active pickup chats</div>
             <p className="text-[14px] text-muted mt-1 max-w-[32ch] mx-auto">Sign up for a pickup to start chatting with the donor.</p>
           </div>
         ) : (
           <div className="space-y-2.5">
             {list.map((p) => {
               const sum = sumByPickup[p.pickup_instance_id];
               const unreadN = sum?.unread ?? 0;
               return (
               <Card key={p.pickup_instance_id} onClick={() => nav(`/pickup/mine/${p.pickup_instance_id}`)}
                     className="!p-4">
                 <div className="flex items-center gap-3">
                   <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-sage text-forest font-bold text-[16px]">
                     {(p.suppliers ?? '?').slice(0, 1).toUpperCase()}
                     {unreadN > 0 && (
                       <span className="absolute -top-1 -right-1 inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-clay text-paper text-[11px] font-extrabold border-2 border-cream">
                         {unreadN > 99 ? '99+' : unreadN}
                       </span>
                     )}
                   </span>
                   <div className="flex-1 min-w-0">
                     <div className="font-bold text-[15px] truncate">{p.suppliers || 'Pickup'}</div>
                     <div className={cx('text-[13px] truncate', unreadN > 0 ? 'text-ink font-semibold' : 'text-muted')}>
                       {sum?.lastBody ?? `${fmtDateEastern(p.scheduled_date)} · ${fmtTime(p.scheduled_time?.slice(0,5))}`}
                     </div>
                   </div>
                   <MessageSquare size={20} className="text-forest" />
                 </div>
               </Card>
             );})}
           </div>
         )}
      </main>
    </div>
  );
}
