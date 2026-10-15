/**
 * Oct 5 client: edit the invite text and the welcome-to-pickup-texts message.
 * Backend: GET/PUT /api/admin/message-templates.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { IOS_APP_STORE_URL, PLAY_HTTPS_URL } from './app-version-check'; // Oct 14 client

type Tpl = { key: string; label: string; placeholders: string[]; defaultText: string; text: string; isCustom: boolean; updatedAt: string | null };

const SAMPLE: Record<string, string> = {
  first_name: 'Sarah', username: 'sarah.cohen', link: 'https://zlz.zehlzeh.org/rescue/welcome/…',
  portal: 'https://zlz.zehlzeh.org/rescue', android: PLAY_HTTPS_URL,
  iphone: IOS_APP_STORE_URL, // Oct 14 client: the real App Store link days: '7', group: 'Monsey drivers',
  name: 'Malik', store: 'Hive Discount Store', address: '250 NY-59, Airmont, NY 10901', when: 'Today at 9:00 AM',
  contact: 'Yanky — (848) 525-3270', notes: 'Ring at the back door', food: '', code: '361',
};
function preview(text: string) {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    let empty = false;
    const f = line.replace(/\{(\w+)\}/g, (m, k) => { if (!(k in SAMPLE)) return m; const v = SAMPLE[k]; if (!v) { empty = true; return ''; } return v; });
    if (!empty) out.push(f);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function TemplateEditor({ t }: { t: Tpl }) {
  const qc = useQueryClient();
  const [text, setText] = useState(t.text);
  const [msg, setMsg] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: string | null) => api(`/api/admin/message-templates/${t.key}`, { method: 'PUT', body: JSON.stringify({ text: v }) }),
    onSuccess: (_r, v) => { setMsg(v ? 'Saved.' : 'Back to the standard text.'); if (!v) setText(t.defaultText); qc.invalidateQueries({ queryKey: ['message-templates'] }); },
    onError: (e: any) => setMsg(e?.message || 'Could not save'),
  });
  const p = preview(text);
  return (
    <div className="rounded-[12px] border border-line bg-paper p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-extrabold text-ink">{t.label}</div>
        <span className="text-[10.5px] font-bold text-muted">{t.isCustom ? 'Your version' : 'Standard text'}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} rows={9}
                    className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[12.5px] font-mono leading-snug" />
          <div className="text-[11px] text-muted">
            Fill-ins: {t.placeholders.join(' ')} — a line with an empty fill-in is left out.
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted mb-1">Preview (as a text message)</div>
          <div className="whitespace-pre-wrap rounded-[14px] bg-sky-soft/60 border border-line px-3 py-2 text-[12.5px] text-ink">{p}</div>
          <div className="text-[11px] text-muted mt-1">{p.length} characters · about {Math.max(1, Math.ceil(p.length / 153))} text{p.length > 160 ? 's' : ''}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={save.isPending || !text.trim()} onClick={() => save.mutate(text)}
                className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper disabled:opacity-50">Save</button>
        {t.isCustom && <button disabled={save.isPending} onClick={() => save.mutate(null)}
                               className="haptic rounded-[10px] border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted">Use standard text</button>}
        {msg && <span className="text-[12px] text-forest font-semibold">{msg}</span>}
      </div>
    </div>
  );
}

export function MessageTemplatesCard({ only }: { only?: string[] }) {
  const q = useQuery({ queryKey: ['message-templates'], queryFn: () => api<{ data: Tpl[] }>('/api/admin/message-templates') });
  const rows = (q.data?.data ?? []).filter((t) => !only || only.includes(t.key));
  return (
    <section className="rounded-[14px] border border-line bg-cream/40 p-3 space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Message templates</div>
      {q.isLoading ? <div className="text-[12.5px] text-muted">Loading…</div> :
       q.isError ? <div className="text-[12.5px] text-clay">Couldn't load the templates. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div> :
       rows.map((t) => <TemplateEditor key={t.key + (t.updatedAt ?? '')} t={t} />)}
    </section>
  );
}
