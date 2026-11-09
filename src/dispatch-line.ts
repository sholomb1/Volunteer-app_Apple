/**
 * Nov 4 client: "whenever you say about dispatching, write extension 103 in parentheses — you can even write
 * the phone number 845-363-5323 extension 103." One place for the dispatch line's wording.
 * The extension comes from Phone settings (GET /api/pbx/my-extension → { shared } = the dispatch extension);
 * until it is known (or if the phone is not set up) it is 103.
 *   useDispatchLine()  → { ext: '103', full: '(845) 363-5323 ext. 103', short: 'ext. 103' }  (React)
 *   dispatchLine()     → the same, from the module cache                                        (plain strings)
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const DISPATCH_NUMBER = '(845) 363-5323';
const DEFAULT_EXT = '103';
let cachedExt: string | null = null;

export type DispatchLine = { ext: string; full: string; short: string };

/** The dispatch line's wording. `ext` = a known extension (e.g. from Phone settings); else the cached one, else 103. */
export function dispatchLine(ext?: string | null): DispatchLine {
  const e = String(ext || cachedExt || DEFAULT_EXT).trim() || DEFAULT_EXT;
  return { ext: e, full: `${DISPATCH_NUMBER} ext. ${e}`, short: `ext. ${e}` };
}

/** Remember the dispatch extension (when another screen already loaded it). */
export function setDispatchExt(ext: string | null | undefined) { if (ext) cachedExt = String(ext); }

export function useDispatchLine(): DispatchLine {
  const q = useQuery({
    queryKey: ['pbx-dispatch-ext'],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const r = await api<{ data: { shared: string | null } }>('/api/pbx/my-extension');
        setDispatchExt(r?.data?.shared);
        return r?.data?.shared ?? null;
      } catch { return null; } // not set up / no access: keep 103
    },
  });
  return dispatchLine(q.data);
}
