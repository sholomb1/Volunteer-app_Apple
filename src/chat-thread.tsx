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

// Oct 9 client: `big` = driver app (16px input so iPhones don't zoom, larger
// messages + send button). Office screens leave it off and look the same.
export function ChatThread({ userId, title, subtitle, color, big = false }: {
  userId: number; title: string; subtitle?: string; color?: string; big?: boolean;
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
          <div className={cx('font-bold truncate', big ? 'text-[17px]' : 'text-[14px]')}>{title}</div>
          {subtitle && <div className={cx('text-muted truncate', big ? 'text-[13px]' : 'text-[11px]')}>{subtitle}</div>}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 bg-cream/50">
        {messages.isLoading ? (
          <div className="text-center text-muted text-[12px] py-4">Loading…</div>
        ) : (messages.data?.data.length ?? 0) === 0 ? (
          <div className={cx('text-center text-muted py-6', big ? 'text-[15px]' : 'text-[12px]')}>No messages yet. Say hi 👋</div>
        ) : messages.data?.data.map((m) => {
          const mine = m.from_user_id === me?.id;
          return (
            <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[78%] rounded-[14px] px-3 py-2', big ? 'text-[16px]' : 'text-[13px]',
                                 mine ? 'bg-forest text-paper' : 'bg-paper border border-line text-ink')}>
                <div>{m.body}</div>
                <div className={cx('mt-0.5', big ? 'text-[12px]' : 'text-[10px]', mine ? 'text-paper/70' : 'text-muted')}>
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
               className={cx('flex-1 bg-cream/50 rounded-[10px] px-3 py-2.5 outline-none border border-line focus:bg-paper focus:border-forest', big ? 'text-[16px] min-h-[44px]' : 'text-[13px]')} />
        <button type="submit" disabled={!text.trim() || send.isPending}
                aria-label="Send"
                className={cx('haptic grid place-items-center rounded-[10px] bg-forest text-paper disabled:opacity-40', big ? 'h-12 w-12' : 'h-10 w-10')}>
          <Send size={big ? 20 : 16} />
        </button>
      </form>
    </div>
  );
}
