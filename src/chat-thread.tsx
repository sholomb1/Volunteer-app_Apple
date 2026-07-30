/**
 * In-app DM thread component — used by the coordinator portal's Chat tabs
 * and any other "send a message to user X" surface. Auto-polls every 5s.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { dm, getUser } from './api';
import { cx } from './design';
import { fmtTimeEastern } from './time-format';

export function ChatThread({ userId, title, subtitle, color }: {
  userId: number; title: string; subtitle?: string; color?: string;
}) {
  const me = getUser();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const messages = useQuery({
    queryKey: ['dm', userId],
    queryFn:  () => dm.messages(userId),
    refetchInterval: 5000,
  });
  const send = useMutation({
    mutationFn: (body: string) => dm.send(userId, body),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['dm', userId] }); },
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e6 }); }, [messages.data]);

  return (
    <div className="flex flex-col h-full bg-paper rounded-[14px] border border-line overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        {color && <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />}
        <div className="min-w-0">
          <div className="font-bold text-[14px] truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-muted truncate">{subtitle}</div>}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 bg-cream/50">
        {messages.isLoading ? (
          <div className="text-center text-muted text-[12px] py-4">Loading…</div>
        ) : (messages.data?.data.length ?? 0) === 0 ? (
          <div className="text-center text-muted text-[12px] py-6">No messages yet. Say hi 👋</div>
        ) : messages.data?.data.map((m) => {
          const mine = m.from_user_id === me?.id;
          return (
            <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[78%] rounded-[14px] px-3 py-2 text-[13px]',
                                 mine ? 'bg-forest text-paper' : 'bg-paper border border-line text-ink')}>
                <div>{m.body}</div>
                <div className={cx('text-[10px] mt-0.5', mine ? 'text-paper/70' : 'text-muted')}>
                  {fmtTimeEastern(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}
            className="flex items-center gap-2 px-3 py-2.5 border-t border-line bg-paper">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
               className="flex-1 bg-cream/50 rounded-[10px] px-3 py-2.5 text-[13px] outline-none border border-line focus:bg-paper focus:border-forest" />
        <button type="submit" disabled={!text.trim() || send.isPending}
                className="haptic grid h-10 w-10 place-items-center rounded-[10px] bg-forest text-paper disabled:opacity-40">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
