/**
 * Nov 2 client: "can we make instructions for dispatchers? … and for my team, who are the admins?"
 * Nov 5 client: the office's own Dispatcher Guide replaces the short dispatcher quick guide — its words, lightly
 * matched to the app (real button names, the dispatch line). Shown on Dispatch → Now and My Dispatch, folded to
 * its section titles (tap one to open it); "Hide" folds the whole card (remembered on this device).
 * Section 4 (owner decision): the app does NOT text every store — store texts are on only where the office turned
 * them on. Admins also keep "How dispatch phones work (admins)".
 */
import { useState } from 'react';
import { useDispatchLine } from './dispatch-line'; // Nov 4 client: "(845) 363-5323 ext. 103"

const KEY = 'zlz-dispatch-guide-closed';
const GUIDE_KEY = 'zlz-dispatcher-guide-closed'; // Nov 5 client

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 h-7 w-7 rounded-full bg-forest text-paper grid place-items-center text-[13px] font-extrabold">{n}</span>
      <div className="text-[13.5px] leading-snug"><b className="text-ink">{title}</b><div className="text-ink/80">{children}</div></div>
    </li>
  );
}

function useFold(key: string): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem(key) !== '1'; } catch { return true; } });
  const toggle = () => { const n = !open; setOpen(n); try { localStorage.setItem(key, n ? '0' : '1'); } catch { /* private mode */ } };
  return [open, toggle];
}

type Section = { n?: number; title: string; body: React.ReactNode };

/** Nov 5 client: the office's Dispatcher Guide. `inHelp` = shown in the ? help menu pop-up (always open, no Hide). */
export function DispatcherGuide({ inHelp = false }: { inHelp?: boolean } = {}) {
  const dl = useDispatchLine();
  const [folded, toggle] = useFold(GUIDE_KEY);
  const open = inHelp || folded;
  const [shown, setShown] = useState<Set<string>>(new Set());
  const flip = (t: string) => setShown((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const P = ({ children }: { children: React.ReactNode }) => <p className="text-[13.5px] leading-snug text-ink/85">{children}</p>;
  const UL = ({ items }: { items: React.ReactNode[] }) => <ul className="list-disc pl-5 space-y-1 text-[13.5px] leading-snug text-ink/85">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  const App = ({ children }: { children: React.ReactNode }) => <div className="mt-1.5 rounded-[10px] bg-sage/50 px-3 py-1.5 text-[12.5px] text-forest"><b>In the app:</b> {children}</div>;
  const sections: Section[] = [
    { n: 1, title: 'Answering Calls', body: <><P>Answer incoming phone calls from suppliers and drivers on the dispatch line, {dl.full}. Be helpful and courteous. Enter all pickup information into the system accurately.</P></> },
    { n: 2, title: 'Entering and Posting Pickups', body: <P>Post pickups on the system so drivers can see and accept them. Make sure all information is complete and accurate.</P> },
    { n: 3, title: 'Following Up with Drivers', body: <>
      <P>Send follow-up messages to drivers when needed (<b>📣 Text drivers</b> on the pickup). If you see a driver who regularly covers these pickups or is already in the area, you may reach out to him directly by text (<b>💬 Text driver (name)</b>).</P>
      <P>Some drivers have indicated that they are comfortable receiving calls. If you call someone and discover that they only selected this option as part of the application and do not want calls, please let us know so their preferences can be updated.</P>
      <App>after the call, tap <b>🚫 Doesn't want calls</b> in the call note. The office gets the message and updates his settings.</App></> },
    { n: 4, title: 'Supplier Notifications', body: <P>Some stores get an automatic text when a driver is on the way (the office turns this on per store). For other stores, if they need to know, text or call them yourself (<b>💬 Text store</b> on the pickup). Make sure the pickup is properly assigned in the system.</P> },
    { n: 5, title: 'Monitoring Pickups and Routes', body: <>
      <P>Make sure routes are assigned properly and pickups are running smoothly. If a driver has not arrived within 2 hours after accepting the pickup, send him a check-in text. The system has a ready-made message for this. If there is no response within 30 minutes, call the driver to check in and make sure everything is okay.</P>
      <App>keep an eye on pickups that were taken a while ago and are not dropped off yet. To check in, tap <b>💬 Text</b> and pick the "Driver check-in" message (you press Send). No answer in 30 minutes? Tap <b>📞 Call</b>.</App></> },
    { n: 6, title: 'Responding to Drivers', body: <P>Every message from a driver should receive a response (check the driver messages often). If something is not running smoothly or a situation needs clarification, call the driver directly (<b>📞 Call driver (name)</b>). Make sure drivers feel supported and know who to contact when they need help.</P> },
    { n: 7, title: 'Handling Cancellations', body: <>
      <P>If a supplier cancels a pickup, notify the driver personally as soon as possible. If the driver has already started driving, apologize and explain the situation. Let the driver know that his effort is appreciated and that the pickup will still count as a covered pickup. Make sure the cancellation is properly updated in the system.</P>
      <P>If a supplier repeatedly cancels pickups, notify the coordinator for follow-up.</P>
      <App>when a store texts CANCEL, the app cancels the pickup. Then call the driver who had it. When a store cancels 3 times in 30 days, the office is told too.</App></> },
    { n: 8, title: 'Uncovered Pickups', body: <P>Keep track of pickups that are still waiting for a driver. Follow up with available drivers when needed. If a pickup is urgent or difficult to cover, notify the appropriate coordinator.</P> },
    { n: 9, title: 'Center Entry', body: <P>If someone rings the doorbell, ask for their name and unit number. Only open the door for a driver.</P> },
    { n: 10, title: 'System Issues', body: <P>If something is not working properly in the system, report it. Don't assume an issue has been resolved until it is confirmed.</P> },
    { n: 11, title: 'Driver and Supplier Information', body: <P>Make sure all information entered into the system is accurate. Keep driver and supplier information private and only share it when necessary for the pickup.</P> },
    { n: 12, title: 'Urgent Situations', body: <P>If a driver is unreachable, a pickup is delayed, or something unusual happens, contact the appropriate coordinator. Don't hesitate to ask for help when needed.</P> },
    { title: 'Dispatcher Shift Responsibilities', body: <P>Dispatchers are responsible for their assigned shifts. If you need to change or remove a shift, please update it within the required timeframe so alternative coverage can be arranged. Please make sure your shift is properly covered before making changes.</P> },
    { title: 'End-of-Shift Handover', body: <>
      <P>Before finishing your shift:</P>
      <UL items={['Make sure any open pickups are communicated to the next dispatcher.', 'Pass along pending calls, follow-ups, or unresolved issues.',
        'Make sure the next dispatcher knows about anything that needs immediate attention.', "Don't leave important matters without communicating them."]} />
      <App>write it in <b>📝 Handover note</b> on this page. The next dispatcher sees it at the top until they tap <b>✓ Read</b>.</App></> },
    { title: 'Feedback and Improvements', body: <P>As this is a new system, feedback is very important and will help us improve. If you notice something that could work better, have a question, or encounter an issue, please feel free to let us know. Thank you for being part of the Zeh L'Zeh team and helping make everything run smoothly!</P> },
  ];
  return (
    <section className="rounded-[18px] border border-line bg-paper" data-dispatcher-guide>
      {inHelp ? <div className="px-5 py-3 font-display font-semibold text-[16px] text-ink">📖 Dispatcher guide</div> : (
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between px-5 py-3 text-left">
        <span className="font-display font-semibold text-[16px] text-ink">📖 Dispatcher guide</span>
        <span className="text-muted font-bold text-[13px]">{open ? 'Hide' : 'Show'}</span>
      </button>)}
      {open && (
        <div className="px-5 pb-5 space-y-2">
          <P><b>Welcome!</b> Dispatchers play a vital role in keeping Zeh L'Zeh running smoothly. Your job is to make sure every pickup is handled properly, drivers are supported, and all information is entered into the system. This guide will walk you through your main responsibilities during your shift.</P>
          <div className="text-[11.5px] text-muted">Tap a title to open it.</div>
          <div className="divide-y divide-line/70 rounded-[12px] border border-line">
            {sections.map((s) => {
              const on = shown.has(s.title);
              return (
                <div key={s.title}>
                  <button type="button" onClick={() => flip(s.title)} aria-expanded={on} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-cream/60">
                    <span className={`shrink-0 h-6 w-6 rounded-full grid place-items-center text-[12px] font-extrabold ${s.n ? 'bg-forest text-paper' : 'bg-sage text-forest'}`}>{s.n ?? '•'}</span>
                    <span className="flex-1 text-[13.5px] font-bold text-ink">{s.title}</span>
                    <span className="text-muted text-[12px]">{on ? '▲' : '▼'}</span>
                  </button>
                  {on && <div className="px-3 pb-3 pl-12 space-y-1.5">{s.body}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Admins: "How dispatch phones work". Nov 5 client: on Admin → Dispatch settings → Phone system (was Dispatch → Now). */
export function AdminPhonesGuide() {
  const dl = useDispatchLine();
  const [open, toggle] = useFold(KEY);
  return (
    <section className="rounded-[18px] border border-line bg-paper">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between px-5 py-3 text-left">
        <span className="font-display font-semibold text-[16px] text-ink">📖 How dispatch phones work (admins)</span>
        <span className="text-muted font-bold text-[13px]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ol className="px-5 pb-5 space-y-3">
          <Step n={1} title="One dispatch line">All dispatch calls go to {dl.full}. The app moves {dl.short}'s forwarding to whoever is dispatching — nobody needs to log in or out of Reliable.</Step>
          <Step n={2} title="Who gets the calls">The <b>Dispatch</b> page shows it. Ways it changes: the <b>regular schedule</b> (tick "Follow the regular schedule"), a dispatcher tapping <b>I'm dispatching now</b>, or <b>➕ Override the schedule</b>. Gaps go to the saved <b>backup</b> cell.</Step>
          <Step n={3} title="Set up the schedule">Dispatch → <b>▸ Weekly shift template</b>: put each dispatcher on their slots. Every dispatcher needs a <b>cell number</b> on their profile ("no cell!" warns you).</Step>
          <Step n={4} title="Adding a dispatcher">Admin → Dispatch settings → Logins & attendance → invite with the <b>Dispatcher</b> role. They see only My Dispatch — no settings.</Step>
          <Step n={5} title="Only change forwarding here">Not in Reliable's own website — the app can't see changes made there. Never press ⟳ / delete on Reliable's Webhooks or API keys pages: it cuts the app off.</Step>
          <Step n={6} title="Phone settings">Admin → Dispatch settings → <b>Phone system</b>: the Reliable connection (key under {dl.short}), Subscribe webhooks, and the phone options. Risky buttons ask "Are you sure?".</Step>
          <Step n={7} title="Everything is logged">Dispatch → Calls history: every call in and out, who was on shift. Voicemails: Admin → Dispatch settings → Voicemail. Each forwarding change is saved (who, when, which number).</Step>
        </ol>
      )}
    </section>
  );
}

