/**
 * Oct 14 client: driver app Profile → "Text commands" — the words a driver can
 * text us, from the one shared list on the server (apps/api/src/code-words.ts,
 * GET /api/me/text-commands), so it always matches the office Code words.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

type Cmd = { key: string; word: string; what: string };

export function TextCommandsCard() {
  const q = useQuery({ queryKey: ['me-text-commands'], staleTime: 60 * 60_000,
    queryFn: () => api<{ data: Cmd[] }>('/api/me/text-commands') });
  const rows = q.data?.data ?? [];
  if (q.isLoading || q.isError || rows.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-forest mb-3">Text commands</div>
      <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
        <div className="text-[14px] text-muted mb-2">Reply to our texts with:</div>
        <ul className="divide-y divide-line">
          {rows.map((c) => (
            <li key={c.key} className="flex items-baseline gap-3 py-2">
              <span className="shrink-0 min-w-[92px] font-mono text-[16px] font-extrabold text-ink">{c.word}</span>
              <span className="text-[15px] text-ink leading-snug">{c.what}</span>
            </li>
          ))}
        </ul>
        <div className="text-[13px] text-muted mt-2">347 is an example — use the number from our text.</div>
      </div>
    </div>
  );
}
