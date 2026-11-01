/**
 * Oct 28 client: Admin -> Settings "Send the store's photo with the pickup details" (On / Off, default Off).
 * When a store posts food with a photo, the driver who takes it gets the photo with his "Thank you! You are
 * now assigned…" text, and with the "<number> INFO" reply (picture message on text, picture on WhatsApp).
 * GET/PUT /api/settings/store-photo (portal_settings 'send_store_photo_with_details', API store-photo.ts).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

type StorePhotoSetting = { data: { on: boolean; base: string | null } };

export function StorePhotoSettingCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['store-photo-setting'], queryFn: () => api<StorePhotoSetting>('/api/settings/store-photo'), staleTime: 30_000 });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation({
    mutationFn: (on: boolean) => api<StorePhotoSetting>('/api/settings/store-photo', { method: 'PUT', body: JSON.stringify({ on }) }),
    onSuccess: (r) => {
      qc.setQueryData(['store-photo-setting'], r);
      setMsg({ ok: true, text: r.data.on ? 'On — drivers get the store’s photo with the pickup details.' : 'Off — drivers get the text only.' });
    },
    onError: (e: any) => setMsg({ ok: false, text: String(e?.message ?? 'Could not save') }),
  });
  const on = !!q.data?.data.on;
  const label = 'Send the store’s photo with the pickup details';
  return (
    <div data-testid="store-photo-setting" className="rounded-[14px] border border-line bg-paper p-4">
      <div className="font-display font-semibold text-[16px]">Store photo for drivers</div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink">{label}</div>
          <div className="mt-0.5 text-[12.5px] text-muted leading-snug">
            When a store posts food with a photo, the driver who takes it gets the photo with his “You are now assigned” text,
            and with the “INFO” reply. Text: a picture message. WhatsApp: a picture. Off = text only.
          </div>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={!q.data || save.isPending}
                onClick={() => { setMsg(null); save.mutate(!on); }}
                className={cx('haptic shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold border disabled:opacity-50',
                              on ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line')}>
          {save.isPending ? '…' : on ? 'On' : 'Off'}
        </button>
      </div>
      {on && q.data && !q.data.data.base && (
        <div className="mt-1.5 text-[12.5px] font-bold text-clay">The site’s web address is not set on the server, so no photo can be sent yet. Ask Sholo.</div>
      )}
      {q.isError && <div className="mt-1.5 text-[12.5px] text-clay">Couldn’t load this setting.</div>}
      {msg && <div className={cx('mt-1.5 text-[12.5px] font-bold', msg.ok ? 'text-forest' : 'text-clay')}>{msg.text}</div>}
    </div>
  );
}
