/**
 * Oct 16 client (ideas 7 + 9): Reports → Check-up (admins).
 *
 *  - Weekly check-up: the list the server makes every Sunday 10 AM (GET /api/checkup) —
 *    phones that can't be texted, Default-group drivers with no pickup texts, STOP drivers
 *    still texted, stores to fix, old problem reports, leftover "taken" marks (count).
 *    Each row opens the driver / store / report to fix it. "Run now" makes a fresh list.
 *    Nothing is changed by the check-up.
 *  - Speed (last 24 h): slow screens the office app reported (over 3 s) and the slowest
 *    API calls (p95) — GET /api/speed/summary.
 *  - Oct 22 client: Health now (top): background jobs, texts in the last hour, the WhatsApp
 *    phone, stuck sends — GET /api/checkup/health-now.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiNotify } from './ui-dialogs';

type Item = { kind: 'driver' | 'store' | 'report'; id: number; name: string; why: string };
type Section = { key: string; title: string; hint: string; items: Item[]; count?: number };
type Result = { ranAt: string; by: string; sections: Section[]; total: number; ms?: number };
type RouteRow = { route: string; calls: number; avgMs: number; p95Ms: number; maxMs: number };
type Speed = {
  since: string; upSince: string; slowScreenMs: number; routes: RouteRow[];
  slowScreens: Array<{ screen: string; count: number; worstMs: number; avgMs: number }>;
  slowScreensToday: number; slowScreensLastHour: number;
};

const fmtWhen = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const sec = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const FIX_LABEL: Record<Item['kind'], string> = { driver: 'Open driver', store: 'Open store', report: 'Open reports' };
const SHOW = 8;

export function CheckupPage({ onOpenDriver, onOpenStore, onOpenReports }: {
  onOpenDriver: (id: number) => void; onOpenStore: (id: number) => void; onOpenReports: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['checkup'], queryFn: () => api<{ data: Result | null }>('/api/checkup').then((r) => r.data), staleTime: 60_000 });
  const run = useMutation({
    mutationFn: () => api<{ data: Result }>('/api/checkup/run', { method: 'POST', body: '{}' }).then((r) => r.data),
    onSuccess: (d) => { qc.setQueryData(['checkup'], d); uiNotify(d.total ? `Check-up done: ${d.total} thing${d.total === 1 ? '' : 's'} to look at.` : 'Check-up done: all clear.', 'ok'); },
    onError: (e: any) => uiNotify(e?.message || "Couldn't run the check-up. Try again.", 'err'),
  });
  const open = (it: Item) => (it.kind === 'driver' ? onOpenDriver(it.id) : it.kind === 'store' ? onOpenStore(it.id) : onOpenReports());
  const d = q.data;

  return (
    <div className="space-y-3 max-w-[900px]">
      <HealthCard />{/* Oct 22 client */}
      <div className="rounded-[14px] border border-line bg-paper p-3.5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">
            Weekly check-up{d ? <>: <span className={d.total ? 'text-clay' : 'text-forest'}>{d.total ? `${d.total} thing${d.total === 1 ? '' : 's'} to look at` : 'all clear'}</span></> : null}
          </div>
          <div className="text-[12.5px] text-muted mt-0.5">
            {d ? `Last run ${fmtWhen(d.ranAt)} · ${d.by}. ` : q.isLoading ? 'Loading… ' : 'Not run yet. '}
            Runs by itself every Sunday at 10 AM (the office gets a bell alert and a text). It only looks: nothing is changed.
          </div>
        </div>
        <button type="button" onClick={() => run.mutate()} disabled={run.isPending}
                className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {run.isPending ? 'Checking…' : 'Run now'}
        </button>
      </div>

      {q.isError && <div className="text-[13px] text-clay">Couldn't load the check-up.</div>}
      {d?.sections.map((s) => <SectionCard key={s.key} s={s} onOpen={open} />)}

      <SpeedCard />
    </div>
  );
}

function SectionCard({ s, onOpen }: { s: Section; onOpen: (it: Item) => void }) {
  const [all, setAll] = useState(false);
  const n = s.items.length || (s.count ?? 0);
  const rows = all ? s.items : s.items.slice(0, SHOW);
  return (
    <div className="rounded-[14px] border border-line bg-paper" data-checkup={s.key}>
      <div className="px-3.5 pt-3 pb-2">
        <div className="text-[14px] font-bold text-ink">
          {s.title} <span className={`ml-1 rounded-full px-2 py-0.5 text-[12px] ${n ? 'bg-clay/10 text-clay' : 'bg-forest/10 text-forest'}`}>{n}</span>
        </div>
        <div className="text-[12.5px] text-muted mt-0.5">{s.hint}</div>
      </div>
      {rows.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          {rows.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="px-3.5 py-2 flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1 text-[13.5px]">
                <button type="button" onClick={() => onOpen(it)} className="haptic font-bold text-ink hover:underline text-left">{it.name}</button>
                <div className="text-[12.5px] text-muted">{it.why}</div>
              </div>
              <button type="button" onClick={() => onOpen(it)}
                      className="haptic shrink-0 rounded-[9px] border border-line px-2.5 py-1 text-[12px] font-bold text-forest hover:bg-cream">
                {FIX_LABEL[it.kind]}
              </button>
            </div>
          ))}
          {s.items.length > SHOW && (
            <button type="button" onClick={() => setAll((v) => !v)} className="haptic w-full px-3.5 py-2 text-left text-[12.5px] font-bold text-forest hover:bg-cream">
              {all ? 'Show fewer' : `Show all ${s.items.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SpeedCard() {
  const q = useQuery({ queryKey: ['speed-summary'], queryFn: () => api<{ data: Speed }>('/api/speed/summary').then((r) => r.data), staleTime: 60_000 });
  const d = q.data;
  return (
    <div className="rounded-[14px] border border-line bg-paper" data-checkup="speed">
      <div className="px-3.5 pt-3 pb-2">
        <div className="text-[14px] font-bold text-ink">Speed (last 24 hours)</div>
        <div className="text-[12.5px] text-muted mt-0.5">
          Screens that took over {d ? d.slowScreenMs / 1000 : 3} s to show in the office app, and the slowest server calls (95% of calls were faster than "usually under").
          {d ? ` Counting since ${fmtWhen(d.since)}.` : ''} One bell alert a day at most when things are slow.
        </div>
      </div>
      {q.isLoading && <div className="px-3.5 pb-3 text-[13px] text-muted">Loading…</div>}
      {d && (
        <div className="border-t border-line px-3.5 py-2.5 space-y-3">
          <div>
            <div className="text-[13px] font-bold text-ink">
              Slow screens: {d.slowScreens.reduce((n, s) => n + s.count, 0)}
              <span className="font-normal text-muted"> · today {d.slowScreensToday} · last hour {d.slowScreensLastHour}</span>
            </div>
            {d.slowScreens.length === 0
              ? <div className="text-[12.5px] text-forest">None. Every screen showed within {d.slowScreenMs / 1000} s.</div>
              : (
                <table className="mt-1 w-full text-[12.5px]">
                  <thead><tr className="text-left text-muted"><th className="py-1 font-semibold">Screen</th><th className="font-semibold">Times slow</th><th className="font-semibold">Average</th><th className="font-semibold">Slowest</th></tr></thead>
                  <tbody>{d.slowScreens.map((s) => (
                    <tr key={s.screen} className="border-t border-line"><td className="py-1 font-bold text-ink">{s.screen}</td><td>{s.count}</td><td>{sec(s.avgMs)}</td><td className="text-clay">{sec(s.worstMs)}</td></tr>
                  ))}</tbody>
                </table>
              )}
          </div>
          <div>
            <div className="text-[13px] font-bold text-ink">Slowest server calls</div>
            {d.routes.length === 0
              ? <div className="text-[12.5px] text-muted">Not enough calls yet.</div>
              : (
                <table className="mt-1 w-full text-[12.5px]">
                  <thead><tr className="text-left text-muted"><th className="py-1 font-semibold">Call</th><th className="font-semibold">Calls</th><th className="font-semibold">Average</th><th className="font-semibold">Usually under</th><th className="font-semibold">Slowest</th></tr></thead>
                  <tbody>{d.routes.map((r) => (
                    <tr key={r.route} className="border-t border-line">
                      <td className="py-1 font-mono text-[11.5px] text-ink break-all">{r.route}</td><td>{r.calls}</td><td>{sec(r.avgMs)}</td>
                      <td className={r.p95Ms > 1000 ? 'text-clay font-bold' : r.p95Ms > 400 ? 'text-[#9a7415] font-bold' : ''}>{sec(r.p95Ms)}</td><td>{sec(r.maxMs)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

// Oct 22 client: "Health now" — background jobs, texts in the last hour, the WhatsApp phone, stuck sends.
// GET /api/checkup/health-now (admins, fast). Red = the office gets (or got) an alarm for it.
type HealthJob = { name: string; everyMs: number; lastOk: string | null; lastStart: string | null; lastErrMsg: string | null; fails: number; runs: number; running: boolean; ok: boolean; problem: string | null };
type Health = {
  at: string;
  jobs: HealthJob[];
  texts: { total: number; failed: number; ok: number; refused: number; pct: number; topReason: string | null; alarm: boolean };
  wa: { lastInboundAt: string | null; lastSentAt: string | null; lastFailAt: string | null; waiting: number; oldestWaitingAt: string | null; attempted24h: number; lastPollAt: string | null; problems: string[] };
  stuck: { count: number; olderThanDay: number; whatsapp: number; oldest: string | null; newest: string | null };
};
const nyDay = (d: Date) => d.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
const fmtShort = (iso: string | null) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  const today = nyDay(d) === nyDay(new Date());
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', ...(today ? {} : { weekday: 'short', month: 'short', day: 'numeric' }) }).format(d);
};
const everyLabel = (ms: number) => (ms >= 3_600_000 ? `${ms / 3_600_000} h` : ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`);
const Dot = ({ ok }: { ok: boolean }) => <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-forest' : 'bg-clay'}`} />;

function HealthCard() {
  const q = useQuery({ queryKey: ['health-now'], queryFn: () => api<{ data: Health }>('/api/checkup/health-now').then((r) => r.data), staleTime: 30_000, refetchInterval: 60_000 });
  const [showJobs, setShowJobs] = useState(false);
  const d = q.data;
  const bad = d ? d.jobs.filter((j) => !j.ok) : [];
  const jobsOk = bad.length === 0;
  const waOk = d ? d.wa.problems.length === 0 : true;
  const tile = 'rounded-[12px] border border-line px-3 py-2.5';
  return (
    <div className="rounded-[14px] border border-line bg-paper" data-checkup="health">
      <div className="px-3.5 pt-3 pb-2">
        <div className="text-[15px] font-bold text-ink">Health now</div>
        <div className="text-[12.5px] text-muted mt-0.5">
          {d ? `Updated ${fmtShort(d.at)}. ` : q.isLoading ? 'Loading… ' : ''}
          Red = something stopped working. Admins get a bell alert (and the office a text for failing texts or the WhatsApp phone); never on Shabbos or Yom Tov.
        </div>
      </div>
      {q.isError && <div className="px-3.5 pb-3 text-[13px] text-clay">Couldn't load the health check.</div>}
      {d && (
        <div className="grid gap-2 border-t border-line px-3.5 py-3 sm:grid-cols-2">
          <div className={tile} data-health="jobs">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <Dot ok={jobsOk} /> Background jobs
              <span className={`ml-auto text-[12.5px] ${jobsOk ? 'text-forest' : 'text-clay'}`}>{jobsOk ? `All ${d.jobs.length} running` : `${bad.length} of ${d.jobs.length} stopped`}</span>
            </div>
            {bad.map((j) => <div key={j.name} className="mt-1 text-[12.5px] text-clay">{j.problem}</div>)}
            <button type="button" onClick={() => setShowJobs((v) => !v)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">
              {showJobs ? 'Hide the list' : 'Show every job'}
            </button>
            {showJobs && (
              <div className="mt-1 max-h-[320px] overflow-auto divide-y divide-line">
                {d.jobs.map((j) => (
                  <div key={j.name} className="flex items-start gap-2 py-1 text-[12.5px]">
                    <span className="mt-1"><Dot ok={j.ok} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink">{j.name}</div>
                      <div className="text-muted">
                        {j.lastOk ? `Last ran ${fmtShort(j.lastOk)}` : 'Not run yet since the server restarted'} · every {everyLabel(j.everyMs)}{j.running ? ' · running now' : ''}{j.fails ? ` · ${j.fails} error${j.fails === 1 ? '' : 's'} in a row` : ''}
                      </div>
                      {j.lastErrMsg && j.fails > 0 && <div className="text-clay">{j.lastErrMsg}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={tile} data-health="texts">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <Dot ok={!d.texts.alarm} /> Texts in the last hour
              <span className={`ml-auto text-[12.5px] ${d.texts.alarm ? 'text-clay' : 'text-forest'}`}>{d.texts.total ? `${d.texts.pct}% failed` : 'none sent'}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">
              {d.texts.ok} went out · {d.texts.failed} failed{d.texts.topReason && d.texts.failed ? ` (mostly: ${d.texts.topReason})` : ''}
              {d.texts.refused ? ` · ${d.texts.refused} refused for that person (STOP, landline, bad number), not counted` : ''}.
            </div>
            <div className="mt-0.5 text-[12px] text-muted">Alarm: 10 or more texts and half of them failed.</div>
          </div>

          <div className={tile} data-health="whatsapp">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <Dot ok={waOk} /> WhatsApp phone
              <span className={`ml-auto text-[12.5px] ${waOk ? 'text-forest' : 'text-clay'}`}>{waOk ? 'OK' : 'Needs a look'}</span>
            </div>
            {d.wa.problems.map((p) => <div key={p} className="mt-1 text-[12.5px] text-clay">{p.charAt(0).toUpperCase() + p.slice(1)}.</div>)}
            <div className="mt-1 text-[12.5px] text-muted">
              Last message received {fmtShort(d.wa.lastInboundAt)} · last sent {fmtShort(d.wa.lastSentAt)}
              {' · '}{d.wa.waiting ? `${d.wa.waiting} waiting (oldest ${fmtShort(d.wa.oldestWaitingAt)})` : 'nothing waiting'}
              {d.wa.lastPollAt ? ` · phone last checked in ${fmtShort(d.wa.lastPollAt)}` : ' · phone has not checked in since the server restarted'}.
            </div>
          </div>

          <div className={tile} data-health="stuck">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <Dot ok={d.stuck.count === 0} /> Stuck sends
              <span className={`ml-auto text-[12.5px] ${d.stuck.count ? 'text-clay' : 'text-forest'}`}>{d.stuck.count}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">
              {d.stuck.count
                ? `${d.stuck.count} send${d.stuck.count === 1 ? '' : 's'} still "requested" after 30 minutes (oldest ${fmtShort(d.stuck.oldest)}${d.stuck.whatsapp ? `; ${d.stuck.whatsapp} of them WhatsApp` : ''}${d.stuck.olderThanDay ? `; ${d.stuck.olderThanDay} older than a day` : ''}). Shown only: nothing is changed.`
                : 'None. Every send got an answer within 30 minutes.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
