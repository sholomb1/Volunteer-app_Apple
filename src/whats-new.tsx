/**
 * Oct 9 client: "What's new" in the office portal (Admin → Activity) — every
 * update with its date, who it affects, and when it went live, so the owner
 * can follow progress. Plain data below; add a release (newest first) with
 * each batch, and set `liveAt` when it goes live (null = still on the test site).
 * Oct 14 client: an item may have a 3rd string — a short plain-English paragraph
 * (what changed, why, where to find it). Tapping the item opens it.
 * Oct 14 client: also opened from the ? menu for everyone (help-guide.tsx,
 * mode "menu": live releases first, liveAt null = "Coming soon" for admins only,
 * "New" tag on items newer than the user's last look). unseenCount() feeds the
 * "3 new" count and the dot on the ? button.
 * Oct 14 client: an opened item has "💬 Comment" / "🐞 Something's wrong with this"
 * (opens the Report a problem form about that item); admins see a 💬 count on
 * items with open comments (GET /api/help/whats-new-comments).
 * Oct 14 client: every item has a KIND as its 4th element — shown as a pill and a filter:
 *   'new'    = ✨ New     — something you could not do before (a new screen, button, text, setting).
 *   'fix'    = 🐞 Fix     — something was broken or wrong and now works.
 *   'change' = 🔄 Change  — existing behaviour, a rule, a time or wording now works differently.
 * HOW TO ADD AN ITEM (always set the kind; unsure → 'change'):
 *   ['Drivers', 'Short line.', 'Longer plain-English details shown when tapped.', 'new'],
 *   ['Office', 'Short line with no details.', null, 'fix'],
 * Old 2/3-element items still compile and show as 'change' — but please always give the kind.
 * Oct 25 client: optional 5th element = screenshots (file names in public/whats-new/, no extension):
 *   ['Office', 'Short line.', 'Details.', 'new', ['steady-week', 'steady-week-open']],
 * Make them .webp, max 1200 px wide, ~30-60 KB (they load only when tapped; .webp is not precached).
 * Shown to office logins only (they show real names).
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react'; // Oct 14 client
import { cx } from './design';
import { api, getUser } from './api'; // Oct 14 client
import { openReportProblem } from './report-problem'; // Oct 14 client

type Area = 'Drivers' | 'Stores' | 'Office' | 'Texts' | 'Kiosk' | 'Forms';
// Oct 14 client: [Area, text, details?] — details = the longer explanation shown when tapped.
// Oct 14 client: + kind (4th): [Area, text, details | null, Kind]. See the header for how to add one.
type Kind = 'new' | 'fix' | 'change';
type Item = [Area, string] | [Area, string, string] | [Area, string, string | null, Kind] | [Area, string, string | null, Kind, string[]];
type Release = { liveAt: string | null; title: string; items: Item[] };

// Newest first. liveAt = when it reached the live site (New York time).
const RELEASES_SRC: Release[] = [
  {
    liveAt: '2026-11-08T18:35',
    title: 'Kiosk: the sign-in tap can no longer pick a store',
    items: [
      // Nov 8 client: after sign-in the kiosk opened straight to a store
      ['Kiosk', 'The kiosk starts fresh after each person.', 'After a drop-off (or Start over, or 1 minute with no touch) the kiosk page reloads, so every person starts clean and the tablet always has the newest version, with no restart. If the internet is down at that moment it just clears the screen instead, so it never lands on an error page.', 'change'],
      ['Kiosk', 'Tapping "Yes, that is me" no longer also picks a store.', 'When a driver with no pickup signed in, the same tap could land on the store list that opened under the finger, so the kiosk went straight to a store. The store screen now ignores taps for a moment, counted from the tap itself.', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-08T18:19',
    title: 'Clean up the store list',
    items: [
      // Nov 8 client: store list full of junk, doubles and unused names
      ['Office', 'Suppliers: new 🧹 Clean up stores button.', 'It sorts the store list into: names that look like junk (just numbers, an address, a test), the same place listed twice, stores never used, and stores not used in 3+ months, plus the full list. Tick and press Hide to take stores off every list (their history stays). Merge into… moves all pickups, drop-offs and steady pickups to the right name and hides the other. A store with a steady pickup is never hidden by mistake. Admins only.', 'new'],
      ['Kiosk', 'A store name typed at the kiosk now waits for the office.', 'When a driver types a new store name, it is saved with the drop-off but does not show on the store lists until the office approves it under Suppliers. No more junk names on the kiosk list.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-08T17:39',
    title: 'Kiosk: no more store picked by mistake',
    items: [
      // Nov 8 client: the kiosk kept choosing 381 Viola - Yoily Tabak by itself
      // Nov 8 client: new label — QR code, small times, smaller kind
      ['Kiosk', 'New label: a QR code for each box, and small times.', 'Every label now has a small QR code at the bottom that says exactly which box it is and which store it came from (for scanning into the inventory system later). Under the date, in small print: the driver (Binyomin G.), then Accepted (when he took his pickup) and Drop-off time. The caterer still prints on top when the pickup has one. Milchig / Fleishig / Pareve is a little smaller to make room. Same printer and printer fonts as before.', 'change'],
      // Nov 8 client: tap the store chip to change the store
      ['Kiosk', 'Picked the wrong store? Tap the store name at the top to change it.', 'On the What did you bring? screen, the store name at the top now says Change. Tapping it opens the store list; the food already counted moves to the store you pick.', 'new'],
      // Nov 8 client: center help always offered, store screen first
      ['Kiosk', 'Center help: always the same start, and open to everyone.', 'After signing in, everyone first sees the store screen. Anyone can tap Here to help in the center at the bottom to punch in, even without a shift. Someone with a center help shift today (or already punched in) sees a big Center help button at the top. After punching in: Thanks for coming! Do not forget to punch out at the end of your shift, plus a link to send feedback.', 'change'],
      // Nov 8 client: buttons a drop too fast
      ['Kiosk', 'Kiosk buttons are a little calmer.', 'Big kiosk buttons light up when touched and act when the finger lifts, so a finger that only meant to scroll no longer presses them. Slow or heavy presses still work.', 'change'],
      // Nov 8 client: a note on a line, printed on the label
      ['Kiosk', 'Add a note to a line, and it prints on the label.', 'After tapping Trays, Boxes, Bags or Cases, the driver can tap 📝 Add note under that line (for example: Keep cold, or For Shabbos). The note prints at the bottom of every label for that line, and the office sees it in the drop-off notes. Caterers already print on the label when the pickup has a caterer.', 'new'],
      ['Kiosk', 'The kiosk no longer picks a store by itself.', 'When a driver had no pickup to show, his tap on the screen before also landed on the store list, so a store near the top (often 381 Viola - Yoily Tabak) was chosen by mistake. Now the store screen ignores taps for a moment when it opens, so only a real tap picks a store. The complete store list is still there.', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-08T14:01',
    title: 'Driver on the way: the right street',
    items: [
      // Nov 8 client: the form preview showed 57 Regina Ct
      ['Office', 'The "driver on the way" preview on the pickup form now shows that pickup\'s own street.', 'Before, the grey preview under "Text the contact when a driver is on the way" always showed a sample street (57 Regina Ct). Now it shows the street typed in the pickup address. Store texts also use the pickup address when there is one (before: the store\'s saved address).', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-08T01:47',
    title: 'Kiosk: 2-driver pickups stay open for the second driver',
    items: [
      // Nov 8 client: Emails tab said email isn't connected
      ['Office', 'Emails now really go out.', 'The Emails tab (Messaging) used to save emails without sending them, because it was never connected. Now it sends with the same Gmail login you saved under Food Donations, Email connection (the one dispatch replies already use). Only emails you write go out. The automatic Sunday emails stay off.', 'fix'],
      // Nov 8 client: the Dispatch screen loads way too slow
      ['Office', 'Speed meter: the app now notes which screens load slowly, so we can fix them.', 'For office logins only. When something takes half a second or more to load, the app quietly notes which part it was and how long it took. Nothing changes on screen. This helps us find and fix the slow parts of the Dispatch screen.', 'change'],
      // Nov 6 client: Rivermill 10:00 AM needed 2 drivers; the first kiosk check-in closed it
      ['Office', 'A pickup that needs 2 drivers stays open until the second driver checks in too.', 'Before, when a pickup needed 2 drivers (for example Rivermill 10:00 AM after the store asked for another driver), the first driver checking in at the kiosk closed the whole pickup and it left the drivers list. Now his part is marked done and the pickup stays open: the Live Board and the drivers list show it needs 1 more driver. When the second driver checks in at the kiosk it links to the same pickup and closes it. If nobody else comes, it closes by itself at the end of its time as done (never missed). In Close out it can only be marked Done. One-driver pickups, Mark done and a driver Done for a delivery work as before.', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-06T11:01',
    title: 'Neat dispatcher picker, one Dispatch page',
    items: [
      // Nov 6 client: "the unit number, name and phone number of the person who wrote it"
      ['Office', 'Handover notes show who wrote them, with a Call and Text button.', 'A new handover note now shows the name and unit number of the dispatcher who wrote it, his phone number, and 📞 Call and 💬 Text buttons, so the next dispatcher can ask him questions. Older notes show only the name.', 'new'],
      // Nov 6 client: "If I don't see the next dispatcher logged on, I should see it somewhere and have to call him"
      ['Office', 'Next dispatcher not signed in? You see it and can call him.', 'From 10 minutes before your dispatch shift ends until 30 minutes after, if the next dispatcher has not signed in yet, an orange line shows on top of Dispatch: for example Dovid L. starts at 8:00 PM and has not signed in yet, please call him, with 📞 Call and 💬 Text (a ready message). If no one is scheduled after you, it says so, and the office gets a bell alert. When you tap Turn forwarding off or Sign out while the next one has not signed in, it asks first: Call him before you go? At the end of your shift you also get one bell alert with 📞 Call. No alerts on Shabbos and Yom Tov.', 'new'],
      // Nov 6 client
      ['Office', 'Roster: Assigned shows everyone who has a shift coming up.', 'Before, it only showed shifts in the next 24 hours. On Deck / Available now means a dispatcher with no shifts scheduled.'],
      // Nov 6 Yakov: "Should be recurring, not only once"
      ['Office', '↻ Assign a dispatcher for every week.', 'In Dispatch → Shift calendar, tap Assign on an open shift. On top you pick: Every week (for example every Sunday 9:30 AM – 1:30 PM), which is the default, or Just this once (one date). Every week puts him on that shift for this week and all the coming weeks, and the list shows ↻ Every week under his name. A week someone else already has stays with them. Release on an every week shift asks: Just this week, or Every week from now on. New shift says Every week / Just this once too.', 'new'],
      // Nov 6 Yakov: "Sat 9:30 PM – Fri 1:16 AM No one" on every day
      ['Office', 'This week shows each day on its own.', 'In This week, a time with no one scheduled now shows only the part on that day (for example 1:30 PM – 5:30 PM No one). A day with nobody on it says No one scheduled all day. No more one long line with a strange time like Fri 1:16 AM on every day.', 'fix'],
      ['Office', 'Right now shows the next dispatcher shift too.', 'Under Right now, Dispatcher shifts: now and next lists the shift on now (✓ Signed in or Not signed in yet) and the next one (for example Moshe A. Next shift · starts Sun 9:30 AM). Dispatchers see it on My Dispatch too.', 'change'],
      // Nov 6 Yakov
      ['Office', 'Driver view shows the full driver menu.', 'When an office login switches to View: Driver, the menu now has Home, Pickups, Map, Chat, My Activity, My Profile and Settings, plus Back to the office.'],
      // Nov 6 Yakov: "he should be able to call him if they forget to sign in, or maybe they can see it on the Schedule"
      ['Office', '🕒 See if the dispatcher on shift signed in.', 'On the Dispatch page, Right now and today in This week show each dispatcher shift that started: ✓ Signed in 9:02 AM (green) or Not signed in yet — started 12 min ago (orange). A shift that starts within 30 minutes says Starts at 2:30 PM. If he did not sign in, tap 📞 Call or 💬 Text (a ready text asks him to please sign in; nothing is sent until you press Send). Dispatchers see only the status, no buttons. On the bar, ✓ = signed in, ⚠ = not yet.', 'new'],
      ['Office', '🔔 A bell alert when a dispatcher did not sign in.', 'If a dispatcher has not signed in 15 minutes after his shift started, the office bell shows: Moshe A. has not signed in, with a 📞 Call button. Once per shift, only in the bell (no phone alert), only for the office, never on Shabbos or Yom Tov. It goes away by itself when he signs in.', 'new'],
      // Nov 6 Yakov: "pause his steady pickup — it should be open for others"
      ['Office', '🚗 Open one steady pickup to other drivers for some days.', 'Open the steady pickup (Steady pickups → Edit). Under Usual driver off — open for others, pick From and To (and a note if you like). If the steady has more than one usual driver, tick who is off (all are ticked at first). Tap Open for other drivers. It works right away. For those days the usual driver is off this pickup only, and it goes out to other drivers like any open pickup. He still gets his texts, and his other steady pickups stay as they are. The list shows the days, who is off and who set it. Change dates or tap ✕ to put him back on the days still open with no other driver. On those days the pickup card and the pickup page say Usual driver off — open for others. The Pause question on the driver card is the same as before.', 'new'],
      // Nov 6 Yakov
      ['Office', 'Call someone: type a unit number or a name.', 'In Dispatch, Call someone now finds the driver as you type his unit number (or name) — pick him and press Call. A phone number still works.'],
      ['Office', 'Handover notes show who wrote them with the unit number.', 'For example: From Moshe A. #20.'],
      // Nov 6 Yakov
      ['Office', 'Center help has 6 kinds of work.', 'Packing orders, Scanning & restocking shelves, Preparing gifts, Sorting incoming food, Cleaning & organizing, Unloading incoming food (and Other). You can also change the kind of one day in Edit center help shift.'],
      // Nov 6 client: "Can we get a more neat thing for this?" (the Who dropdown) + one Dispatch page
      ['Office', '👤 A neat new way to pick a dispatcher.', 'Instead of the plain list, tap the box and a small window opens (on a phone it comes up from the bottom). It has a search box and a clear list: a round badge with initials, the name (like "Baruch R."), and small tags: on deck (green), on shift now, calls off, no cell (orange). On deck comes first, then the other dispatchers. People with no dispatcher login yet are folded at the bottom. If a dispatcher has calls off or no cell, you cannot pick him for calls: tap him to see why. In Put someone on right now and Plan a change for later, the last line is Type a phone number. Works with the keyboard too (arrows, Enter, Esc). The same picker is used in Assign dispatcher and in New shift / Edit shift.', 'new'],
      ['Office', '📞 Dispatch is one page now.', 'No more Today / Schedule switch. On top: the green line, the handover note (only when you did not read it yet) and the calls today line. Right under it: Right now, Put someone on right now, the Calendar switch and This week. The long parts at the bottom are folded: Shift calendar, Weekly shift template and Roster: who can dispatch. Tap one to open it; it stays open next time. Dispatchers see the same one page on My Dispatch (view only). Old links still work.', 'change'],
      ['Office', 'Driver replies and the 90-minute alert moved to Admin → Dispatch settings.', 'Who gets driver replies and Who gets the 90-minute alert are now on their own tab: Admin → Dispatch settings → Driver replies & alerts. Nothing about them changed.', 'change'],
      ['Office', 'A clear note about the Reliable phone app.', 'Under Put someone on right now it now says: putting someone on here overrides what is set for ext. 103 in the Reliable phone app. When nobody is put on (forwarding off), calls follow the rules set in the Reliable app. The Turn forwarding off question says the same.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-06T00:31',
    title: 'Simpler dispatch schedule',
    items: [
      // Nov 5 client: "I feel like there's some stale sessions … make the calendar a drop more friendly … offer dispatchers on deck first … take away the to-dos for right now"
      ['Office', '📅 Dispatch → Schedule is simpler: Right now, Put someone on right now, and one Calendar switch.', 'On top: who gets dispatch calls right now, for example "Moshe A. — put on by hand", with Stop. Under it, Put someone on right now: pick a dispatcher (the ones on deck are first) or type a phone number, choose until when (until the next shift, 1, 2 or 4 hours, or until you stop it), and tap Put on now. Calls go there right away. Then one switch: Calendar Active (calls follow the shifts) or Not active (the calendar is ignored). To plan a change for another day, tap Plan a change for later.', 'change'],
      ['Office', '📅 A friendlier week calendar.', 'Each day is one row with a bar from 6 AM to 2 AM: green = on shift, blue = put on by hand, light orange = no one scheduled. Today is highlighted, with a red line for now. Shifts that overlap are shown one under the other. Under the bar the same times are written out, easy to read on a phone. Tap any block to see the details, or to remove a hand pick. Names show short, like "Moshe A.". Dispatchers see the same calendar (without phone numbers or buttons).', 'new'],
      ['Office', '"No one scheduled" no longer covers real shifts, and old shifts are gone from the schedule.', 'The orange "no one scheduled" lines only show the hours nobody covers, even when shifts overlap. Old weekly shifts of people who are no longer dispatchers (for example Sunday 3 PM – 7 PM and 4 PM – 8 PM) do not show on the schedule any more, and calls never go to them.', 'fix'],
      ['Office', 'When you pick a dispatcher, the ones on deck come first.', 'In Put someone on right now, Plan a change for later, and when you assign a shift (Dispatcher shifts, New shift, Edit shift), the dispatchers who are On Deck / Available on the Roster are listed first, with a small "on deck" tag.', 'change'],
      ['Office', 'To do is hidden from Dispatch for now.', 'The To do list is not on Dispatch → Today or My Dispatch any more, and the red count is gone from the Dispatch menu item. It is saved and can come back later. Missed calls, texts and driver replies are still in Calls history, Texts and the driver messages.', 'change'],
      // Nov 5 client: "Today is still too much going on"
      ['Office', 'Dispatch → Today is short now.', 'Today shows only the green line on top, the handover note (only when there is one you did not read yet), and one line: 📞 calls today · missed. On My Dispatch, your shifts, phone alerts and settings are folded under one line: tap it to open.', 'change'],
      // Nov 5 client: "On Deck shows people who are not real dispatchers"
      ['Office', 'On Deck shows only people who can really dispatch.', 'On the Roster, On Deck / Available now lists only dispatchers with a dispatcher or office login. People who ticked "Dispatcher" under Helps with but have no dispatcher login yet are in a small folded list under it: Interested in dispatching — no dispatcher login yet. Their cards keep the same buttons (Create portal login, Remove). Nothing about them was changed. When you pick a dispatcher (Put someone on right now, Plan a change, Assign, New shift), they come last, marked no dispatcher login yet.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-05T23:13',
    title: 'Shorter driver on the way text',
    items: [
      // Nov 5 client: "as soon as you send a thank you, the count should restart"
      ['Texts', 'The Friday / erev Yom Tov thank-you now counts every pickup since the last weekly thank-you.', '"Together you covered N pickups" now counts every pickup scheduled since the last weekly thank-you went out, up to the moment this one goes out: Motzei Shabbos and late Thursday night pickups too, done yet or not. It leaves out cancelled pickups, test pickups, drop-off days nobody came to, and pickups the office marked missed (close-out or Mark missed). Pickups closed automatically as needs review or expired still count. Every kiosk drop-off that is not for a pickup (a walk-in) adds 1. The list of drivers who drove this week uses the same days. The nightly thank-you did not change.', 'change'],
      // Nov 5 client: "a setting in each dispatcher: if the person gets calls, gets a text reminder, how many minutes before … and a message when it's finishing … with on/off buttons for both"
      ['Office', '⚙️ Each dispatcher has his own settings now: gets calls, a reminder before the shift, and a thank-you after.', "Dispatch → 📅 Schedule → Roster. Each dispatcher's card has a small Settings area with three on/off switches, all on at the start. 📞 Gets dispatch calls: when off, calls never go to him. During his shift the calls go to the next dispatcher on shift, or the backup, and his shifts show \"no calls\". I'm dispatching now and overrides can't send calls to him while it is off. ⏰ Reminder before the shift: a text like \"Hi Yakov, just a reminder — your dispatch shift starts at 3 PM. Thank you!\" Pick 5, 10, 15 or 30 minutes before (5 at the start). 🙏 Thank-you at the end of the shift: when the shift ends he gets \"Thank you for your shift today, Yakov, and for all you did! – Zeh L'Zeh\". Each text goes once per shift, never on Shabbos or Yom Tov, not in his quiet times, and not if he turned texts off. Back-to-back shifts count as one. To change the wording for everyone, tap ✏️ Reminder and thank-you texts above the roster. Dispatchers can turn their own reminder and thank-you on or off on My Dispatch → ⚙️ My settings. Only the office can change Gets dispatch calls.", 'new'],
      // Nov 5 client
      ['Texts', 'Shorter "driver on the way" text to stores and donors.', 'It now says: Zeh L\'Zeh: A driver is on the way to 57 Regina Ct. If the address is wrong or anything is different, please call our dispatcher at (845) 363-5323 ext. 103. (Their own address is filled in.) A CANCEL reply still works.'],
      // Nov 5 client: "I don't want it in the store's profile. I want it in the steady profile. Each steady should have this."
      ['Stores', '⏰ The text to the store before a pickup is now set on each steady pickup, not on the store.', "Open a steady pickup (Steady pickups → Edit). Under Remind the store before pickup, tick Text the store a reminder before each pickup, pick how long before (30 minutes to 4 hours), and change the message if you like ({time} = the pickup time, {store} = the store name). You see an example of the text and which store phone it goes to (or that the store has no phone saved, or has texts off, so it gets only the app pop-up). Then Save. It is off for every steady until you turn it on. The store gets one text per pickup, never on Shabbos or Yom Tov, and not for a cancelled or finished pickup. One-time pickups don't get this reminder. The box is gone from the store profile; stores that had it on keep getting it: their steady pickups got the same setting.", 'change'],
    ],
  },
  {
    liveAt: '2026-11-05T22:36',
    title: 'Who gets dispatch calls: schedule and overrides',
    items: [
      // Nov 5 client: "it should show somewhere the upcoming schedules … an option to override the schedule … from this time to this time … with a checkbox"
      ['Office', '📞 New "Who gets calls" page: see who gets dispatch calls, the next 7 days, and override the schedule.', "Dispatch → 📅 Schedule, at the top (admins can change it). On top, one line says who gets calls to (845) 363-5323 ext. 103 right now, and why: \"by the regular schedule\", \"override until 6 PM\", or \"Nobody — only the dispatch line rings\", with Turn forwarding off. Under it, the checkbox Follow the regular schedule: when on, calls switch to whoever is on shift. Coming up shows the next 7 days: every shift in green, times with no one scheduled in orange, and overrides in blue with ✕ to remove one. ➕ Override the schedule: pick a dispatcher (or type a cell number and name), a From day and time and a To day and time, and Save. During that time the calls go to that person instead of the schedule; when it ends, they go back to the regular schedule (if the schedule is off, forwarding turns off). Overrides can be days ahead. 📲 I'm dispatching now still works the same. The phone settings tab is now called Phone system (Admin → Dispatch settings). Turn forwarding off now stays off until the next shift or override (before, the schedule could turn it back on a minute later).", 'new'],
      // Nov 5 client: "put by the dispatch tab these things … this just has dispatcher calendars … this screen should also be by Dispatch"
      ['Office', '📅 Dispatch has two views now: Today and Schedule.', "At the top of Dispatch there is a small switch: Today and 📅 Schedule. Today is the everyday screen, same as before: the green line, the handover note, To do and today's calls. 📅 Schedule has everything about who dispatches when: Who gets dispatch calls (Right now, Follow the regular schedule, ➕ Override the schedule, Coming up for the next 7 days), then the dispatcher shifts calendar and the weekly shift template, then the roster of who can dispatch (with who gets driver replies and the 90-minute alert). Admin → Dispatch setup is now called Dispatch settings and keeps only the bigger settings: Logins & attendance, Phone system and Voicemail. Dispatchers get 📅 Schedule on My Dispatch too: who gets calls now and the next 7 days, with 📲 I'm dispatching now. They can't change the schedule. Old links still open the right place.", 'change'],
      // Nov 5 client
      ['Office', '"Turn forwarding off" is on the Dispatch screen.', 'In the green strip on top. Admins can always turn it off; a dispatcher can turn it off when the calls are going to his own cell (for example at the end of his shift). Then calls to ext. 103 ring only the dispatch line.'],
    ],
  },
  {
    liveAt: '2026-11-05T01:18',
    title: 'Dispatch line only, driver stays off',
    items: [
      // Nov 6 client: steady driver sets Away dates → ask if his steady pickups should go to another driver
      ['Drivers', '✈️ Away dates: a steady driver is asked if his steady pickups should go to another driver.', "When a steady driver sets Away dates (in Settings, or Pause for today, a week or until a date), the app asks: \"You have steady pickups on those days (Hive Deli Tue, Nov 10, ...). Would you like your pickups to go out to another driver for those days?\" Yes: he is taken off those days only, the same way as \"not available today\", and the pickups are open for the group with the usual pickup texts. No: he stays on them. Steady days made later for those dates don't put him back on. When he clears or shortens his Away dates, it asks: \"Put you back on your steady pickups for those days?\" (only days that are still open with no other driver). The office gets the same questions when it pauses a driver on his card (Settings tab). Drivers who use texts only (no app) get the question only through the office for now.", 'new'],
      // Nov 6 client: "add an option from which caterer the food is coming from, and print it on the labels"
      ['Kiosk', '🍽 New "Caterer" box on pickups, and it prints on the food labels.', "On the office New pickup and Edit pickup forms there is a new box, Caterer (optional), mainly for one-time and event pickups. Start typing and it suggests caterer names you used before. The outside pickup request form has it too: \"Caterer (if the food is from a caterer)\". The caterer shows on the Live Board card (🍽 Caterer: Gourmet Glatt), on the pickup page and on the driver's pickup. At the center kiosk, the driver sees it when he picks his pickup, and every label from that pickup prints the caterer on top with the store or address under it. Long names go on 2 lines. Printed labels in Kiosk Activity shows it too. The kiosk tablet prints caterer labels after Sholo puts the new app on it.", 'new'],
      // Nov 5 client: "We need to simplify this … just the basic, very, very basic clear dispatching"
      ['Office', 'Dispatch is now one simple screen, with no tabs.', 'Office and dispatchers see the same screen (for dispatchers it is My Dispatch). On top, a thin green line shows who gets dispatch calls now, (845) 363-5323 ext. 103, with 📲 I\'m dispatching now, 📞 Call someone and 📝 Write handover note. The handover note only shows when there is a new note you haven\'t read. To do shows what is waiting, or just \"All clear ✓\". Today\'s calls is one line, like \"12 calls today · 1 missed\"; tap it to see them. Top right: Calls history (the tiles and all calls) and Texts. The Dispatcher guide is now in the ? help menu. The setup parts moved to Admin → Dispatch setup: Roster, Shifts, Logins & attendance, Forwarding & phone (with \"How dispatch phones work\") and Voicemail (admins only). The dispatcher reports and busiest-times chart are in Reports → Dispatchers. Old links still open the right place.', 'change'],
      // Nov 5 client: "three options: switch to driver, to their admin, and to dispatcher level"
      ['Office', 'One "View" switch at the top: Office, Dispatcher or Driver.', 'It replaces the "🚗 Driver view" and "🎧 Dispatcher view" buttons. Admins and the office get three choices: Office (everything), Dispatcher (what a dispatcher sees) and Driver (the driver app). Dispatchers get two: Dispatcher and Driver. Driver works for everyone now: if you also drive, it is your own driver app; if you don\'t have a driver profile, it shows how the driver app looks, with empty lists, and nothing you tap is saved. A yellow bar on top says "You\'re seeing the driver app" with a button to go back.', 'new'],
      // Nov 5 client
      ['Office', 'Calls list: one row per call you make, and one recording at a time.', 'When you press Call, the phone system first rings your own phone and then dials the person. That first ring used to show as an extra 0-second call to yourself; now only the real call shows. Starting a recording or voicemail stops any other one that is playing. The call note pickup box now says About which pickup.'],
      // Nov 5 client: the office's Dispatcher Guide in the app
      ['Office', '📖 The office\'s Dispatcher guide is in the app: ? help menu → 🎧 Dispatcher guide.', "It replaces the short quick guide. It opens folded to its section titles (Answering Calls, Following Up with Drivers, Handling Cancellations, End-of-Shift Handover and more); tap a title to read it. It uses the real button names and the dispatch line, (845) 363-5323 ext. 103. Section 4 says it plainly: only some stores get an automatic text when a driver is on the way (the office turns this on per store); for the others, text or call them yourself with 💬 Text store. Admins still also have \"How dispatch phones work\".", 'new'],
      // Nov 5 client: Dispatcher guide 5 — check-in after 2 hours
      ['Office', 'To do: check in on a driver 2 hours after he took a pickup and it is still not dropped off.', "To do shows \"Moshe K. took Hive 2 h ago — not dropped off yet\" with 💬 Text: the ready \"Driver check-in\" message opens for him (\"Hi Moshe, just checking in on the Hive pickup — is everything OK?\"), and you press Send. The 2 hours count from when he took it, or from the pickup time if that is later. If he doesn't answer in 30 minutes, it changes to \"No answer for 30 min — call him\" with 📞 Call. ✓ Handled clears it. Only today's pickups, never on Shabbos or Yom Tov, and nothing is ever sent by itself. Admins can change the message under 📝 Templates → Edit.", 'new'],
      // Nov 5 client: end-of-shift handover
      ['Office', 'New "📝 Handover note" for the end of a shift.', "On Dispatch and My Dispatch. Before you finish, tap 📝 Write handover note and write what the next dispatcher needs to know: open pickups, calls to return, follow-ups, anything urgent. A new note shows at the top in orange until someone taps ✓ Read (it saves who read it and when). \"Earlier notes\" shows the last 10.", 'new'],
      // Nov 5 client: Dispatcher guide 3
      ['Office', 'Call notes: new "🚫 Doesn\'t want calls" button.', "After a call, if the driver says he doesn't want calls, tap it. It is saved in his call log like the other notes, and admins get a bell alert \"Moshe K. said he doesn't want calls — update his settings\" with a link to his card. His settings are not changed by themselves.", 'new'],
      // Nov 5 client: Dispatcher guide 7
      ['Office', 'Admins are told when a store cancels 3 times in 30 days.', "One bell alert for admins and coordinators: \"Hive Deli cancelled 3 times in the last 30 days — follow up\", with the dates and a link to the store's card. It counts the store's CANCEL texts, cancels from the store's own app, and office cancels with a store reason (like \"Store closed\"). At most once per store every 30 days.", 'new'],
      // Nov 4 client: "whenever you say about dispatching, write extension 103"
      ['Office', 'The dispatch line now shows its number: (845) 363-5323 ext. 103.', 'Everywhere the office portal talks about the dispatch line, it now says which one: the guides, Phone settings and the green "Dispatch calls go to" card show "(845) 363-5323 ext. 103", and buttons, pop-ups and messages show "(ext. 103)". The extension comes from Phone settings, so if the dispatch extension is changed there, the text changes too.', 'change'],
      // Nov 4 Yakov: center help punch in / punch out
      ['Kiosk', 'Center helpers can punch in and punch out on the kiosk.', 'Someone on the center help list (or with a center help shift today) types their 4 digits or scans their name tag and sees a Center help card: Punch in / Punch out, "Coming with a group? How many people (including you)?", their shifts for the next 2 weeks and their visits of the last 2 months. Someone who also has pickups today first picks "I\'m dropping off food" or "I\'m here to help in the center". Forgot to punch out? It closes at the end of their shift (or 11 PM) and shows "no punch-out". The kiosk tablet gets this once its app is updated; the kiosk web page has it now.', 'new'],
      ['Office', 'Center Help: who is in the center now, today, and hours of the last 2 months.', 'Admin → People → Center Help → "Punch in / out (kiosk)": who is punched in now (with group size), earlier today, and hours per person for the last 2 months (tap a name to see each visit). "Fix time" changes the time in / out or the number of people; "Punch out now" for someone who left; "Remove" for a mistaken punch.', 'new'],
      // Nov 4 Yakov: "Can you add a Dispatcher View?"
      ['Office', 'New "🎧 Dispatcher view" button: see the office screen just like a dispatcher does.', 'At the top, next to "🚗 Driver view" (admins and office only). It shows the same short menu, the My Dispatch page, and hides what dispatchers don\'t see (recordings, voicemail, Food to handle, admin settings). A yellow bar says "You\'re seeing the dispatcher view"; tap "Back to office view" to return. It only changes what you see on this screen; your own access stays the same.', 'new'],
      // Nov 4 Yakov: crossed out in the dispatcher menu
      ['Office', 'Dispatchers no longer have "Food to handle" in their menu.', 'Admins and the office still have it.', 'change'],
      // Nov 4 Yakov: "Dispatchers should be able to send the link for a person who wants to volunteer."
      ['Office', 'Drivers page: "📨 Send sign-up link" for someone who wants to volunteer.', 'Office and dispatchers. Type the person\'s phone number (and name if you know it), tap "💬 Text it", and a ready, friendly text with the volunteer sign-up form opens. Check it and press Send; nothing goes out by itself. "🔗 Copy link" copies the link so you can paste it anywhere.', 'new'],
      // Nov 4 client
      ['Office', 'Live Board cards: "💬 Text store" on the left; "Send SMS" is now "📣 Text drivers".', 'Tap Text store and a ready message opens (driver buttons now say "📞 Call driver (Chaim)" and "💬 Text driver (Chaim)", so it is clear who he is): check it and press Send. The old 💬 Text button on the right is gone. "📣 Text drivers" (was Send SMS) texts the drivers in the pickup group about this pickup, or about every open pickup.'],
      // Nov 4 client: "All I want is extension 103"
      ['Office', 'Call pop-ups, missed calls and voicemails are only for the dispatch line (103).', 'The phone system reports calls for every extension. Before, missed calls to other extensions popped up too. Now only the dispatch line (the one picked in Phone settings) makes pop-ups and alerts. Texts to the office number still all come in.'],
      // Nov 3 client: Hive Deli
      ['Office', '"Not available today" takes the driver off completely.', 'If a driver was on a pickup twice (main driver and backup), only one was taken off, so the pickup later closed as done by him. Now he\'s taken off in both.'],
    ],
  },
  {
    liveAt: '2026-11-03T14:23',
    title: 'Steady driver stays off when taken off',
    items: [
      // Nov 3 client: Yoffee Coffee — "we cancel and the system puts it back on"
      ['Office', 'A steady driver you take off for one day now stays off.', 'Before, taking a steady driver off a pickup ("not available today" or Remove) was undone by the app\'s steady-pickup check, which runs every 15 minutes, so the driver came right back. Now he stays off for that day only; his other days don\'t change, and you can still add him back by hand.'],
    ],
  },
  {
    liveAt: '2026-11-03T13:23',
    title: 'Dispatch, texting, Asana, driver app and speed',
    items: [
      // Nov 3 client: Dispatch as its own menu item, lower down
      ['Office', 'Dispatch has its own place in the menu.', 'It used to be under Admin → People → Dispatchers. Now "Dispatch" is in the side menu (above Change password) with a red count of things waiting. Inside: To do, Now, Calls, Texts and Reports first; Roster, Shifts, Logins and Phone settings at the end.'],
      // Nov 3 client: tidier driver card
      ['Office', 'The driver card is tidier: 5 tabs instead of 7, and a small More ▾ button.', 'Open a driver. On top you still see 📞 Call, 💬 Text and ✉️ Email. "Ring me at…" and "🪪 Make name tag" are now under More ▾. The tabs are: Overview; Settings (was "Alerts & schedule"); History (pickups and changes together — tap Pickups or Changes); About them (the application and the sign-up info, one under the other); Notes (Asana notes for admins, and the calls you made to the driver with "📞 I called"). Long lists show the newest 5 — tap Show more to see the rest. Nothing was removed.', 'change'],
      // Nov 3 client: email templates + My signature
      ['Office', '📝 Email templates: pick a ready email, like "Thank you for your donation", and it fills in the subject and message.', 'In ✉️ New email (and in the reply box of a donation email), tap 📝 Templates and pick one: Thank you for your donation, Welcome new volunteer, Can you help this week?, Pickup time change, or Following up. The subject and message fill in, with the person\'s first name (and the store) put in for you. You can change anything before you press Send. Admins can add, change or remove templates: tap Edit next to 📝 Templates.', 'new'],
      ['Office', '✍️ My signature: your name at the end of emails and texts is now in the message box, so you see it and can change it.', 'Your signature now shows at the bottom of the message when you write an email, and at the end of your first text of the day to someone. Change it or delete it before you send. To set your own, tap "Edit my signature" (under the email message or under the text box). There is one for emails (a few lines, for example your name, Zeh L\'Zeh and the office phone) and one for texts (one short line). Each person has their own. Nothing is added after you press Send anymore.', 'new'],
      // Nov 3 client: Asana for the volunteer coordinator
      ['Office', 'Asana: each driver card shows Asana notes and follow-ups in the Notes tab (admins).', 'Open a driver → the Notes tab. You see the notes about this person (newest first, with who wrote them and when) and the follow-ups (to-dos), with due dates and who does them. Write a note and press Save note — it goes in Asana with your name. + Add follow-up adds a to-do (pick a due date and who does it if you like). Tick it when it is done. Other Asana tasks that mention the person are listed at the bottom. The app finds the person\'s tasks in all your Asana projects (by name, or by phone in the notes) and shows a small label with the project (Active, Past…). The 3 newest show first; tap Show more for the rest. Someone not in Asana yet gets a task like "Moshe Klein #20" with the first note or follow-up. First connect Asana in Admin → Settings → Asana.', 'new'],
      ['Office', 'Settings → Asana: connect Asana, and choose what the app adds there by itself (all off until you turn one on).', 'Paste your Asana key (Asana → My apps → Create new token), then tick which Asana projects to look in (all of them at first), pick where new tasks go (you can pick one for active drivers and one for past drivers), and who gets them. You can turn on, one by one: a new volunteer sign-up waiting for approval; a driver says "can\'t", gives back a pickup or did not come; a driver says "can\'t" 3 times in a row; a new driver\'s first pickup (call and thank him); a driver with no pickup in 30 days; and a weekly summary every Sunday morning (each driver\'s pickups and miles). Each thing is sent once. "Send a test task" makes one test task. The card shows the last 20 tasks sent and any error. The same page lists all open Asana follow-ups by person.', 'new'],
      // Nov 3 Yakov's answers
      ['Drivers', 'Drivers no longer press "Done" for a store pickup.', 'A store pickup is finished when the driver checks in at the kiosk, or when the dispatcher marks it. After "I picked it up" the app says: bring it to the center and check in at the kiosk. A delivery to a family can still be finished in the app.'],
      ['Drivers', 'No more "How much did you bring?" in the app.', 'The kiosk already asks it, so drivers don\'t answer twice.'],
      ['Drivers', 'The pickup chat is called "Chat with dispatcher".', 'Same chat as before, with a clearer name. "I can\'t make it" stays.'],
      ['Drivers', 'Sign-in code message fixed.', 'It said "If this number is ours". Now: "If we have this number on file, your code is on its way."'],
      // Nov 3 client: Food Donations = Email + Texts; back in the menu
      ['Office', 'Food Donations is back in the menu, with two tabs: ✉️ Email and 💬 Texts — (845) 363-5323.', 'Food Donations shows again in the side menu for office logins. The Email tab is the donation emails, as before (they also still show in ✅ To do). The Texts tab is the texts to the office number — the same conversations as Dispatchers → Texts: open one, reply, or 🚚 Make a pickup from it. For now every office text shows there.', 'change'],
      // Nov 3 client: send a new email from the app
      ['Office', '✉️ New email: write an email from the dispatch email, right in the app.', 'In Food Donations → Email, tap ✉️ New email. In To, type an email address, or start typing a driver, store or donor name and pick them. Add a subject and your message; your signature is at the bottom of the message, and you can change it. It goes out from the dispatch email that is already connected — nothing new to set up. Driver and store cards that have an email now have a ✉️ Email button that opens the same thing, filled in. Everything sent from the app (new emails and replies) is under the new Sent filter, with who sent it.', 'new'],
      // Nov 3 client: text a whole pickup
      ['Office', '💬 Text on a pickup: Driver, Store or Both — a ready message from the pickup, you check it and press Send.', 'On the pickup page and on each Live Board card, tap 💬 Text and choose Driver, Store or Both. A text opens already written from the pickup, for example to the store "Hi Tony, Moshe K. is on the way to pick up at 4:00 PM. – Yakov, Zeh L\'Zeh", or to the driver "Hi Moshe, reminder: Hive Discount Store, 51 Carlton Rd, 4:00 PM. Contact: Tony (845) 555-0210." The words fit where the pickup is at: still finding a driver, driver set, on the way, or picked up. Both = the store\'s text first, then the driver\'s: two separate texts, each one you check and send yourself. Nothing is sent by itself. Admins can change these messages under 📝 Templates → Edit.', 'new'],
      // Nov 3 client: text templates
      ['Office', '📝 Text templates: "Driver running late", "No driver yet", "Pickup cancelled", "Driver on the way", "Thank you" — filled in for you.', 'In the text box tap 📝 Templates and pick one. It fills in the person\'s name, the store, the time and the driver from their pickup today (blank if we don\'t know), and your first name at the end. Change anything you like, then Send — nothing goes out by itself. Admins can change the templates (name + words) or add new ones with Edit, in the same place as the quick replies. The quick replies still work as before.', 'new'],
      // Nov 3 client: busiest hours chart
      ['Office', '📈 Dispatchers → Reports (admins): the busiest times for calls, by time of day and day of the week.', 'A simple chart of the calls that came in (green = answered, red = missed) for the last 7, 31 or 90 days, by hour and by day. One sentence under the title sums it up, like "Busiest: Sunday 10 AM–12 PM. Most missed: Friday 1–2 PM." Good for planning who dispatches when. Tap "See the numbers" for the counts.', 'new'],
      // Nov 3 client: voicemail in the app (admins only)
      ['Office', '📼 Voicemail on Dispatchers → Now (admins only): who called, when, how long, ▶ Listen, 📞 Call back, ✓ Handled.', 'The dispatch line\'s voicemail box now shows right in the app, for admins only (dispatchers don\'t see it). Each message shows the caller\'s name when we know them, the time and how long it is. Tap ▶ Listen to hear it, 📞 Call back to call them, and ✓ Handled when it\'s taken care of (it saves who did it). New voicemail also shows in your To do list. If the phone system doesn\'t let us play a message here, it says so, and you can still hear it in the Reliable app.', 'new'],
      // Nov 3 client: who's calling + their pickup
      ['Office', '🚚 Who is calling + their pickup today, in one line: on the call pop-up, the call lists and To do.', 'Next to a caller you now see their pickup today. A store or donor: "Today 2:00 PM: driver Moshe #20 · driver on the way" (or "needs a driver", "picked up"). A driver: his pickups today, like "Today: Hive Discount Store 2:00 PM · picked up; Maple Bakery 5:00 PM · on the way". Tap the line to open the pickup.', 'new'],
      // Nov 3 client: call-back reminder
      ['Office', '📵 Missed call not called back after 10 minutes: a reminder in the 🔔 bell with 📞 Call back.', 'When a call to the dispatch line is missed and nobody calls that number back (and nobody marks it ✓ Handled in To do) within 10 minutes, the bell shows "Missed call from <name> 10 min ago — not called back yet" with a sound and 📞 Call back. The person on duty gets it on their phone the same way as other office alerts. One reminder per missed call. It goes away by itself once someone calls them back. Not on Shabbos or Yom Tov.', 'new'],
      // Nov 3 client: smart driver finder
      ['Office', '🔎 Find a driver on an open pickup: the best drivers to ask, with the reason in plain words.', 'On a pickup that still needs a driver, tap 🔎 Find a driver (next to Assign Driver). You get a list, best first, like "2.1 mi away · on call now · says yes 7 of 10 · free today". It counts how close they are (their shared location in the last 3 hours, else their home), whether they are on call now, how often they say yes and how fast, and how many pickups they already have today. Only drivers we may text now are listed (their quiet times, away, paused and other settings are kept). 📞 Call rings through the office phone. 💬 Text opens a ready message with the store and time — change it if you like; nothing is sent until you press Send.', 'new'],
      // Nov 3 client: two titles "Your pickups" and "My pickups" looked alike
      ['Drivers', 'Home: today\'s pickups are titled "Today".', 'The top of the driver Home screen said "Your pickups" right above "My pickups". The top one is now "Today" (what you have going now), and "My pickups" lists the coming days.'],
      // Nov 3 client: advanced dispatching — one dispatcher inbox
      ['Office', '✅ To do: one list of everything waiting for the dispatcher, on Now and on My Dispatch.', 'Missed calls nobody called back, texts to the office number nobody answered, driver text and WhatsApp replies waiting, food donation emails still New, and open alerts (a pickup that needs a driver, a driver gave one back…). Oldest first. The waiting time turns orange after 10 minutes and red after 30. Each row has 📞 Call, 💬 Text, Open and ✓ Handled. Handled takes it off the list for everyone (it saves who and when). Things also leave by themselves once you call back, text back or a driver takes the pickup.', 'new'],
      // Nov 3 client: dispatcher reports
      ['Office', 'Dispatchers → Reports (admins): what each dispatcher did today, in 7 or 31 days.', 'One line per dispatcher: hours on shift, calls answered (and talk time), calls missed and how many were called back and how fast, calls made from the app, texts sent, to-dos handled, pickups they assigned, and pickups that got a driver on their shift — plus a one-line summary. Calls count for whoever was on the dispatch shift then. How long a call rang isn\'t in the phone system\'s history, so it isn\'t shown.', 'new'],
      // Nov 3 client: one-tap call notes
      ['Office', '📝 How did the call go? One tap: Will take it · No answer · Can\'t · Left message · Other…', 'After you press 📞 Call in the app, a small box asks how it went. You can add a short note and pick which of today\'s pickups it was about. A driver\'s note goes in his call log. The answer then shows on that call in Dispatchers → Now and Calls. Older calls have a 📝 Note button.', 'new'],
      // Nov 3 client: advanced dispatching — text tools
      ['Office', 'New text to the office number: a 🔔 alert and a pop-up with the person\'s name and 💬 Reply.', 'When someone texts (845) 363-5323, the bell gets "New text from …" with a sound, and a pop-up shows the text. 💬 Reply opens the conversation right there. The alert goes away by itself once someone in the office texts them back.', 'new'],
      ['Office', 'Each text we send shows who sent it ("Yakov S.") under the bubble.', 'Texts from the office number now record which login sent them. The name shows in small letters under our green bubbles. Automatic texts say "Automatic". Older texts (before today) have no name.', 'new'],
      ['Office', 'Quick replies above the text box: "Thank you!", "A driver is on the way.", "We\'ll call you back soon."', 'Tap one and it goes in the box, ready to change or send. Admins can change the list: tap Edit next to the buttons (one per line, up to 12).', 'new'],
      ['Office', '🚚 Make a pickup from a text.', 'In a text conversation, 🚚 Make a pickup opens the new-pickup form filled in from the text: name, phone, the address if the text has one, and what they wrote. Check it and press Save — nothing is made until you do.', 'new'],
      // Nov 3 Yakov: driver app clean-up
      ['Drivers', 'Home shows the driver\'s full name and unit number.', 'The top of Home now says the driver\'s full name and unit number, like "Yakov Taub #20" (no "Shalom"). No unit number = just the name.'],
      // Nov 3 Yakov:
      ['Drivers', 'Home: the "Pickups by … Change" line is gone.', 'The line under the name that showed how pickup messages come (App / Text / WhatsApp, quiet hours) with Change is gone from Home. All of it is still in Settings.'],
      // Nov 3 Yakov:
      ['Drivers', 'Home: "Coming up" is now called "My pickups".', 'Same list as before (the driver\'s own pickups in the next few days), new title.'],
      // Nov 3 Yakov:
      ['Drivers', 'Activity: no Hours tile.', 'My Activity shows three tiles: Pickups, Miles and Stores. The time per trip is gone from the list too.'],
      // Nov 3 Yakov:
      ['Drivers', 'Drivers are no longer asked "How far did you drive?".', 'After Delivered the app says "Thank you! Delivery saved." and goes back to Home. No miles / minutes page.'],
      // Nov 3 Yakov:
      ['Drivers', 'Miles are counted by themselves.', 'Every done pickup gets miles, however it was finished: Delivered in the app, "DONE" by text, by the office, auto-close or the kiosk (also for drivers who only use texts). Miles = Google Maps driving route from the pickup place to the drop-off center (3 Regina Road, Airmont). If the driver shared his location for that whole trip, the real GPS miles are used instead. If Google can\'t answer, it saves an estimate (straight line × 1.25). More than one stop = stop to stop, then to 3 Regina; a delivery = 3 Regina to the family. Miles show for each pickup in My Activity and on the office driver profile (Recent pickups). Older pickups show the estimate. Miles a driver typed before are kept.'],
      // Nov 3 Yakov:
      ['Drivers', 'My profile: no Settings or My application rows at the top.', 'My profile starts with Share your location, then the photo and contact details. Settings is still in the ☰ menu.'],
      // Nov 3 Yakov:
      ['Drivers', 'Menu: "My application" is gone.', 'The ☰ menu no longer has My application.'],
      // Nov 3 Yakov:
      ['Drivers', 'Settings: no My application / My profile links at the bottom.', 'The two link rows at the bottom of Settings are gone.'],
      // Nov 3 Yakov:
      ['Drivers', 'My application: no "Update my answers" button.', 'Drivers can\'t change their sign-up answers in the app any more. The office can still edit them (driver profile → Application → Edit answers).'],
      // Nov 3 Yakov:
      ['Drivers', 'Pickups: "Mine" is now "Active pickups", with all the details.', 'Each of the driver\'s own active pickups shows the contact name and phone (tap to call), other contacts, the note from the store, and the Steps (Store posted it / You took it / On the way / Picked up / Delivered). Tap the pickup for the full page as before.'],
      // Nov 3 client: "I want to see more history"
      ['Office', 'Calls: Yesterday, 90 days and 6 months, plus search.', 'Dispatchers → Calls has Today, Yesterday, 7 days, 31 days, 90 days and 6 months, a search by name or number, and a count. On Now, "Yesterday" shows yesterday\'s calls and tiles. Older calls keep loading in the background until 6 months back.', 'new'],
      // Nov 3 client: "when I click to send a message … a delay till it opens"
      ['Office', '💬 Text opens right away as a pop-up, and your message shows the moment you press Send.', 'Before, 💬 Text first switched to Dispatchers → Texts and then loaded. Now it opens a pop-up over the screen you\'re on, ready to type. Your text shows at once marked "sending…" and turns "sent" (Reliable takes about a second). If it fails, it says so: tap it to try again. Enter sends; Shift+Enter makes a new line. The texts list also loads faster.'],
      ['Office', 'Texts show the office number: (845) 363-5323.', 'The Texts title and the reply box say which number the text goes out from.'],
      // HOLD (Nov 3): group members regardless of On the fly — waiting for Yakov; item removed until it ships
      // Nov 3 client: speed
      ['Office', 'The office portal opens faster and checks the server less often.', 'The Live Board loads less than half the code it used to; each other page loads its part the first time you open it (a short "Loading…"), and starts loading as soon as you point at its menu button. The board no longer downloads old cancelled pickups, and the Texts & WhatsApp list answers quicker. When the portal is in a browser tab you\'re not looking at, it stops checking for new things and catches up the moment you come back (alerts with sound on still check every 25 s). The unread-chat and bug-report counts, the texts-paused banner, the office Texts list and open Texts / WhatsApp conversations now refresh every 30–60 seconds.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-02T23:51',
    title: 'Store texts from the office number',
    items: [
      // Nov 2 client: "the message they get when a driver is on the way … from the office number and not from TextMagic"
      ['Stores', 'The "driver on the way" and "picked up" texts to stores and donors now come from the office number.', 'They go out from (845) 363-5323 through the phone system, so stores see the number they know. A CANCEL reply to the office number cancels the pickup and tells the driver, exactly like before; any other reply shows in Dispatchers → Texts. If the office number can\'t send, the text goes out the old way. Who gets these texts did not change (only stores that have it turned on).', 'change'],
      // Nov 2 client: "cancel it automatically, but we should not notify the driver. The dispatcher will have to call the driver."
      ['Stores', 'When a store replies CANCEL, the driver is no longer texted — the dispatcher calls him.', 'The pickup is still cancelled automatically and the store gets "Thanks — the pickup is cancelled." The office gets the alert "Call Moshe K: Hive cancelled" with his phone, to tell him.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-02T23:25',
    title: 'Texts from the office number',
    items: [
      // Nov 2 client: "send someone a message here or there … integrate it"
      ['Office', 'Text anyone from the office number: Dispatchers → Texts, and 💬 Text buttons.', 'Dispatchers → Texts (dispatchers: on My Dispatch) lists the office number\'s text conversations, newest first, with unread counts; open one to read it and reply. "New text to a number" starts one. 💬 Text sits next to 📞 Call on driver cards and on every call in the calls list. Texts go out from the office number through the phone system (driver pickup texts stay on the usual texting service). The list refreshes every 20 seconds.', 'new'],
      ['Office', 'Phone settings: a "Dispatch line key" just for forwarding.', 'The main connection can now be an admin login (like 104), so the app gets every call and text live, while forwarding uses the dispatch extension\'s own key (103).', 'new'],
      // Nov 2 client: "All I want is recordings from extension 103 and history from extension 103"
      ['Office', 'Calls and recordings: only the dispatch extension (103).', 'The calls list, talk time and ▶ Listen now cover only calls on the dispatch extension — never other extensions\' calls or recordings. The copies of other extensions\' calls the app had kept are removed (Reliable keeps its own).', 'change'],
      ['Office', 'Call recordings are for admins only.', 'Dispatchers do not see ▶ Listen anywhere (the server refuses it too). Admins still can.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-02T23:01',
    title: 'Calls list, tidier',
    items: [
      // Nov 2 client screenshot of Today's calls
      ['Office', 'Today\'s calls: right counts, one row per call, names instead of cell numbers; tap a tile to see those calls.', 'Answered and Missed count incoming calls only. Door-phone calls show as 🚪 Front Door; other extension-to-extension calls are hidden. A call that rang two phones shows once. "Answered by" shows a name (or "a cell") — never a personal cell number. Talk time over an hour reads like 2h 13m. Tap a tile (Missed, Not called back…) to list just those calls. ▶ Listen now plays the recording (it said "no recording" before by mistake).', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-02T22:48',
    title: 'Dispatch guides',
    items: [
      // Nov 2 client: "make instructions for dispatchers … and for my team, who are the admins"
      ['Office', 'A short "how it works" guide on the dispatch screens.', 'Dispatchers (My Dispatch): start a shift, take office calls, call a driver, Ring me at, missed calls, *20 texts, end of shift. Admins (Dispatchers → Now): one dispatch line, who gets the calls, the schedule, adding a dispatcher, change forwarding only in the app, phone settings, what is logged. Tap Hide to fold it.', 'new'],
      // Nov 2 client: "how long the conversation was … any more information"
      ['Office', 'Calls now come from the phone system\'s call history: talk time, who answered, called back or not.', 'Every 30 seconds the app reads Reliable\'s call history (every extension). Each call shows in / out, answered / missed / no answer, ⏱ talk time, who answered, who pressed 📞 Call, who was on shift, and for missed calls whether someone called them back. ▶ Listen plays the recording when there is one. Today\'s calls adds "Not called back" and total "Talk time".', 'new'],
    ],
  },
  {
    liveAt: '2026-11-02T21:31',
    title: 'Dispatchers screen, cleaner',
    items: [
      // Nov 2 client: "make the dispatcher screen better … the turn forwarding off button looks too low down"
      ['Office', 'Dispatchers → Now: a big "Dispatch calls go to" card, Call someone, and today\'s calls as tiles.', 'The top card shows who gets dispatch calls right now (green when forwarding is on), with "I\'m dispatching now" and "Turn forwarding off" right under it. The admin options (forward to a number, the schedule switch, the backup) fold under "Change forwarding". New "📞 Call someone": type a number and it calls from the office number. Today\'s calls show as big number tiles. "Ring me at…" lists only real people\'s phones. Dispatchers see the name, not the phone number.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-02T20:24',
    title: 'Dispatchers: one place for everything',
    items: [
      // Nov 2 client: "one new tab … Dispatchers … all the settings and reports and activity in one place"
      ['Office', 'Admin → Dispatchers now opens on "Now", with "Calls" and "Phone settings".', 'Now: where dispatch calls go (forwarding, I\'m dispatching now) and today\'s calls (in, answered, missed, voicemail, called out). Calls: every call of the last day / week / month, who was on shift, Listen to voicemails, Call back missed calls. Phone settings: the Reliable connection (admins). Roster, Shifts and Logins are still there. Reports come next.', 'new'],
      // Nov 2 client: "make a new dispatcher view … easier access … not give access to certain settings … confirmation"
      ['Office', 'Dispatchers get "My Dispatch": where calls go, I\'m dispatching now, and their calls — no settings.', 'A dispatcher login opens My Dispatch: who dispatch calls go to now, a big "📲 I\'m dispatching now", today\'s calls (answered / missed / voicemail) with Call back and Listen, and all calls of the week. Phone settings, forwarding numbers and the schedule switch stay admin-only. Turning forwarding off, forwarding to a number, the schedule switch and Subscribe again now ask "Are you sure?" first.', 'new'],
      // Nov 2 client: "it should really say the name of the person who forwarded it"
      ['Texts', 'The office alert for a *NN message says who sent it.', 'Was: "Dispatcher forwarded a message to Unit #20". Now: "Yakov S. forwarded a message to #20 (Moshe): …" — the name of the dispatcher whose phone sent it.', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-02T19:56',
    title: 'Office phone check',
    items: [
      // Nov 2 client: "why didn't it pop up in the app when the person was calling?"
      ['Office', 'The app now records every call notice from the phone system, even ones it refuses.', 'So we can see whether Reliable reports calls to the app at all, and why a call did not pop up.', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-02T19:17',
    title: 'Cleaner side menu; pickup names',
    items: [
      // Nov 2 client: "one of them is named Pickup … I don't need this things flying around in the bottom"
      ['Office', 'The side menu no longer lists pickups / drivers / stores at the bottom.', 'The list under the menu (Active pickups, Drivers, Donors) is gone — the pages themselves show everything.', 'change'],
      ['Office', 'A one-time pickup is never just called "Pickup".', 'With no store or hall name, the office screens use the contact\'s name, else the street address (a "name" like "000" is skipped). The dispatch line forwarding now also finds the office number in Reliable correctly.', 'fix'],
    ],
  },
  {
    liveAt: '2026-11-02T18:49',
    title: 'Smarter call pop-up',
    items: [
      // Nov 2 client: "a smarter pop-up … if we have this number on file, it should suggest it"
      ['Office', 'The call pop-up suggests who an unknown caller may be.', 'When a number is not a driver, store or donor on file, the pop-up looks everywhere else: a contact on a store\'s pickup or steady pickup ("Maybe Hive Deli" + an Open button), a store we\'re talking to, a donation email, their WhatsApp name, their last text to us. A driver calling with no pickup today also shows how many pickups still need a driver.', 'new'],
      // Nov 2 client: "I don't see the button to call someone" / "it should be based on my login"
      ['Office', 'Driver card: a 📞 Call button, and "Ring me at…" for each login.', 'Open a driver: 📞 Call rings your office phone first; pick it up and it calls the driver, who sees the office number. "Ring me at…" picks which extension rings for YOUR calls (saved for your login); not picked = the shared dispatch phone. Reliable rings an extension first, not a cell number.', 'new'],
      // Nov 2 client: "one extension for the whole dispatching … a few dispatchers"
      ['Office', 'Dispatch calls forward to whoever is dispatching.', 'Settings → ☎️ Office phone → "📲 Dispatch calls forward to": the dispatch line (ext 103) forwards to a cell — automatically by the Dispatching Shifts schedule, or "📲 I\'m dispatching now" (until the next shift), or an admin types a number. A backup number for when nobody is on shift. The first time, an admin confirms the phone options to keep (copied from Reliable), so nothing else on the phone changes.', 'new'],
    ],
  },
  {
    liveAt: '2026-11-02T16:33',
    title: 'Store reminder before pickup',
    items: [
      // Nov 2 client: "remind them 2 hours before, they'll put everything in boxes"
      ['Stores', 'Stores can get a reminder text before each pickup — your own message, your own timing.', 'Store profile → "⏰ Reminder before pickup": turn it on, pick how long before (30 minutes to 4 hours) and write the message ({time} = the pickup time). Example: "Zeh L\'Zeh: Reminder — our driver is coming for your food today at 4:00 PM. Please have it packed and ready. Thank you!" One text per pickup, at any hour (night pickups too); not on Shabbos / Yom Tov, not while a "food today?" question is waiting, and not if the store turned texts off. Off for every store until you turn it on.', 'new'],
      // Nov 2 client: "a big Pause button in the beginning … we want it to be a hidden setting"
      ['Drivers', 'Pause is no longer a big button on the driver Home screen.', 'Drivers who want a break find it at the bottom of Settings: a small "Need a break? Pause pickup messages" link. While paused, Home and Settings still show "Paused" with Resume.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-01T02:36',
    title: 'Pickup from email: address; Today list cleaner',
    items: [
      // Nov 1 client: "Why u no put in the address?"
      ['Office', 'Make a pickup from an email now fills in the address from the email text.', 'If the email says "at 3 Regina in Airmont" or "12 Main St, Monsey", the Pickup address is filled in for you (check it). The office phone in a staff signature is no longer used as the contact phone, and "Hi" is left out of the food line.', 'fix'],
      // Nov 1 client: "Why u show by pickups, its one time cancel or always?" → hide them
      ['Office', 'Pickups → Today no longer shows days taken off a steady schedule.', 'When a steady pickup no longer runs on a day (the schedule was changed), that day is not a real cancellation, so it no longer shows in Today. One-time cancellations (like a store saying no food today) still show. All of them stay in History.', 'change'],
    ],
  },
  {
    liveAt: '2026-11-01T02:23',
    title: 'Food Donations: reply + make a pickup',
    items: [
      // Oct 31 client: greyed-out "Make name tags" button
      ['Office', '"Make name tags" says what to do when nobody is ticked.', 'Before, the button was just grey. Now tapping it with no drivers ticked says: tick the box next to each driver first.', 'fix'],
      // Nov 1 client: "Can we reply from the dispatch email? … automate creating a pickup with our approval"
      ['Office', 'Food Donations: reply from the dispatch email, and make a pickup from an email.', 'Open a donation email: type your reply and tap Send reply — it goes out from dispatch@ as a reply to their email, and shows under the email (who sent it, when). "🚚 Make a pickup from this" opens the New pickup form already filled in (store if their email matches a store, contact name, phone from the email, the food), you check it and tap Create; the email moves to Pickup created. Google alerts and "no-reply" emails no longer count as donations and no longer text the office.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-31T22:47',
    title: 'Sign in with Google',
    items: [
      // Oct 31 client: "Can I login to our app with Gmail?"
      ['Office', 'Sign in with Google on the website (off until an admin turns it on).', 'Settings → Sign in with Google: paste the Google client ID and Save. Then the sign-in page shows a "Sign in with Google" button. Only someone whose Gmail is the email on their login gets in; phone code and password sign-in stay. Not in the phone app (Google does not allow it there).', 'new'],
    ],
  },
  {
    liveAt: '2026-10-31T21:55',
    title: 'Classier name tags',
    items: [
      // Oct 31 client: "make the name tags a little bit more classy looking, that the people should feel better" → chose cream & gold
      ['Office', 'Name tags have a new cream & gold look.', 'Cream card with a thin gold frame, the first name large in our heading font, the last name under it, a round photo with a gold ring, "Driver No. 20", and a small QR code in the corner for the kiosk. Make them as before: Drivers → tick drivers → Make name tags.', 'change'],
      ['Office', 'Name tags: Save as PDF button.', 'Next to Print there is now "Save as PDF". It opens the print window with a clear file name (Zeh L\'Zeh name tags + date); set Destination to Save as PDF. Good for sending the tags to a print shop.', 'new'],
      ['Drivers', 'Fit the photo: zoom in and choose the part.', 'After taking or picking a profile photo, a round "Fit your photo" window opens: drag to move, the slider (or two fingers) to zoom, then Use photo. A saved photo has a new Adjust button to fit it again. The same round photo shows on the name tag.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-31T21:33',
    title: 'HELP text lists the words drivers can text',
    items: [
      // Oct 30 client: "a help guide when a volunteer texts the word help … all available commands"
      ['Texts', 'A driver who texts HELP now gets the list of words they can text us.', 'The reply lists: 347 (take), 347 INFO, PICKUPS, 347 DONE, 347 CANCEL, LAKEWOOD / FALLSBURG (+ OFF), STOP and START, plus the office phone. The dispatcher is still alerted and texts them back, like before. Someone who is not a driver still gets only "The dispatcher has been notified".', 'new'],
      // Oct 31 client: "Center Help should not be able to see it" / "in your personal view you should only see what a regular person can see"
      ['Office', 'Food to handle is for office logins only (for now).', 'The Center Help people no longer see Food to handle in their app, and there is no Food to handle link in the driver app. The office opens it from the office menu as before.', 'change'],
      ['Drivers', 'Driver view shows exactly what a driver sees.', 'An office person who switches to "Driver view" now gets the regular driver screens only: opening a pickup shows the driver page (Take, call the store), not the office page. Switch back with the Dispatcher view button.', 'fix'],
      // Oct 31 client: "Can you see how the labels actually print? Is there a way that we can log it and see it?"
      ['Kiosk', 'Printed labels log: see every kiosk print.', 'Kiosk Activity → Printed labels shows each print: who, which store, how many printed, how it was sent (straight to the printer / through the server / print dialog), any error, and the first label as it was sent. It shows what was sent, not the paper itself. The kiosk tablet starts logging with the next app build.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-30T16:17',
    title: 'New, simpler kiosk drop-off',
    items: [
      // Oct 30 client: "I want to simplify things … get information and make it simple"
      ['Kiosk', 'A new, simpler kiosk drop-off: tap Trays · Boxes · Bags · Cases · Containers, how many, and Fleishig / Milchig / Pareve / Mixed / Not sure.', 'After the number: "Hi Moshe K. #20 — Yes, that\'s me". Pick the store, then tap a container to add a line (− / +) and its kind ("Not sure" is fine — our team will look into it). Several kinds = several lines. Then a round label preview, "Print N labels" or "Don\'t need labels" (for big drops). Each label shows the store, date, kind and container. After that: "Thank you! Any feedback?" — feedback goes to the office as a text and a problem report; otherwise it returns to the start after a few seconds. The keypad reacts on touch. The kiosk tablet gets the new screens with the next app build; until then the old screens keep working.', 'new'],
      ['Kiosk', 'The kiosk "?" help now shows the new steps.', 'The 4 help steps match the new screens: your code or name tag, the store, what you brought (container, how many, kind), then labels and feedback.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-30T16:05',
    title: 'Coverage map fixed, driver photos and name tags',
    items: [
      // Oct 30 client: "Why does it say zero by everyone?" (coverage map)
      ['Office', 'The Coverage map now counts the areas drivers picked on their application, and is easier to use.', 'It said 0 drivers everywhere because it only counted areas the office set, and none were set. Now it uses the application answers (or the office\'s choice, which wins). Each area shows "N drivers · N stores" in red / orange / green; tap an area to see its drivers with Call / Text and its stores (next pickup, usual drivers). On the map: store names on tap, pickups red if they need a driver, and "Show only what needs drivers". The driver card has an "Areas" row to set or change a driver\'s areas.', 'fix', ['coverage']],
      // Oct 30 client: "a volunteer can save a picture in their profile, and then we'll start giving out name tags"
      ['Drivers', 'Drivers can add a profile photo, and the office can print name tags with a QR code to sign in at the kiosk.', 'Drivers: My profile → My photo → Add photo. The office can add or change it on the driver card. Photos are seen only by the office, dispatchers and the driver himself. Drivers list → tick drivers → "🪪 Make name tags": a print page with standard ID-card size tags (10 per page, cut marks) — photo, name, #number, logo, role and a QR code. At the kiosk, "📷 Scan my name tag" signs the driver in (the kiosk tablet gets this button with the next app build).', 'new', ['nametags']],
    ],
  },
  {
    liveAt: '2026-10-30T10:31',
    title: 'Steady delivery to a family',
    items: [
      // Oct 30 client (office): "How do I create a steady pickup for family delivery? I don't see such an option."
      ['Office', 'Steady pickups can now be a delivery to a family: tick "🏠 This is a delivery to a family".', 'In the steady pickup form, tick it, pick the family (or add a new one), and choose days and time. It goes from the center by default ("From" can be changed). Each day is made as a normal delivery: drivers see only the street until someone takes it; the driver who takes it gets the address, the family\'s phone and notes; "DONE" finishes it. Steady drivers work as usual. Pickups → Steady shows it with a 🏠 DELIVERY tag and the family\'s first name and town only.', 'new', ['steady-delivery']],
    ],
  },
  {
    liveAt: '2026-10-30T08:23',
    title: 'Food to handle, ordering-portal stock link, calmer Reports, steady days come back, store linked by address',
    items: [
      // Oct 30 client: "everything we packed from the Hive … until there's a new Hive pickup should go under that Hive pickup"
      ['Office', 'Link to the ordering portal (read-only): food added to stock is credited to the pickup it came from.', 'Every 15 minutes the portal reads what was added to stock in the ordering portal (it never changes anything there), finds each item\'s store (from the supplier on the scan, the label\'s store code, or the name), and credits it to the latest pickup from that store, until the next one (up to 7 days). The pickup page and Food to handle show "→ added to stock: 14 products · 162 units", and Reports has a By store table. Admin → Settings → "Ordering portal store names" matches their names to ours (e.g. The Hive = Hive Deli + Hive Discount Store). It turns on once the live connection is set up.', 'new'],
      // Oct 30 client: "a way to keep track that they actually packaged all the food and dealt with each thing"
      ['Office', 'New "Food to handle" screen: every kiosk item gets "Packaged" and "Added to the ordering platform" ticks, with notes.', 'Under Pickups (and a "🥡 Food to handle" button for Center Help people in the app). Items are grouped by drop-off ("Hive Deli · 2:10 PM · driver Moshe K."), with "All packaged" / "All added" buttons, "Not usable / thrown out" with a reason, and notes on an item or a whole drop-off — who and when is saved. Each drop-off shows what came out of it ("6 items · 3 packaged · 2 added · 1 thrown") and there is a By store table for the day or week. At 5 PM (earlier on Friday) the office gets one text if anything isn\'t handled; unhandled items turn red. It starts from go-live day.', 'new', ['food-handle']],
      // Oct 30 client: "a little overwhelming how many tiles there are … remove the unimportant ones or put them under something else"
      ['Office', 'Reports is calmer: 8 tiles in two rows ("How pickups ended" and "Watch") with a one-line summary above.', 'The summary line reads "403 pickups · 57 drivers · 38 stores · still open: 2 need a driver, 14 have one" — each number still opens its list in one tap. Below: Done · Taken, not checked in · Missed · Nobody took it · Cancelled, then Typical wait · Taking to drop-off · Can\'t reach. Same big tiles, same date picker.', 'change', ['reports-tidy']],
      // Oct 30 client: Hatzlacha changed to Tuesdays 4:15 PM, but Tue Nov 3 and Nov 10 stayed cancelled
      ['Office', 'Changing a steady pickup no longer loses days: days still on the schedule come back with the new time.', 'Hatzlacha was changed to Tuesdays at 4:15 PM, but Tue Nov 3 and Nov 10 stayed cancelled (they had been cancelled by an earlier change, and the app couldn\'t make them again). Now a day that was cancelled only because the schedule changed comes back by itself when it is on the schedule again, with the new time and its driver. Days the office, store or driver cancelled never come back. Days taken off the schedule say "recurring schedule changed" and stay off the Live Board.', 'fix'],
      // Oct 30 client: "Bender does not say Yeshiva" (51 Carlton Road = Stamford Yeshiva)
      ['Office', 'A pickup with no store picked, at a saved store\'s address, is linked to that store.', 'For example "Bender" at 51 Carlton Road is linked to Stamford Yeshiva, so drivers and the office see "Stamford Yeshiva, 51 Carlton Rd". The New pickup form shows "This is Stamford Yeshiva\'s address — linked to Stamford Yeshiva" with "Not this store". Only when exactly one saved store has that address; never for deliveries or runs. The pickup history says "Store linked by address".', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-30T00:40',
    title: 'Lakewood / Fallsburg runs, confirm WhatsApp, Helps with (roles), Can\'t reach report, thank-you on WhatsApp',
    items: [
      // Oct 30 client: "please confirm they would like to get WhatsApp … send him a message saying they should please reply"
      ['Texts', 'WhatsApp now needs a one-time "hi" from the driver: until then he gets texts, and he gets one text with a tap-to-say-hi link.', 'Drivers who picked WhatsApp but never wrote to us (and whose WhatsApp fails) get one text: "Hi Tzvi, you chose to get pickup messages on WhatsApp. To turn it on, tap here and press Send: wa.me/… — until then we\'ll keep texting you." One reminder after 3 days, then nothing. Sent 9 AM–9 PM, never on Shabbos, not to STOP. When he writes, WhatsApp answers "✓ WhatsApp is on!". The driver card shows ✅ working / ⏳ waiting for Tzvi to say hi / ❌ last WhatsApp failed, with "Send the WhatsApp link again". Driver Settings shows an "Open WhatsApp and say hi" button.', 'new', ['wa-confirm']],
      // Oct 30 client: Lakewood / Fallsburg — "build it, and also add it to the application"
      ['Office', 'Runs to Lakewood / Fallsburg: a new kind of pickup texted only to drivers who go there.', 'New pickup → "🚚 Run to Lakewood / Fallsburg": where to, what\'s going, size, and "must be there by". Only drivers tagged "Goes to Lakewood / Fallsburg" get it ("🚚 Run to Lakewood by Thu 5 PM: 4 boxes of food from the center (3 Regina). Reply 531 to take it."), 8 AM–10 PM, never on Shabbos; it never goes in the general pickup texts. If nobody takes it a day before (or halfway for a short deadline), the managers get a text listing the drivers who go there. Drivers sign up by texting LAKEWOOD or FALLSBURG (then the days they usually go), or LAKEWOOD OFF to stop; there is a ready "🚚 Lakewood / Fallsburg sign-up" group text in the template picker. The volunteer application asks "Do you ever drive to Lakewood or Fallsburg? Which days?" and tags them. Set the two location addresses in Admin → Settings first.', 'new', ['runs']],
      // Oct 29 client (Yakov): "a person should be able to have more than one: On the fly, Steady, in center, Dispatcher"
      ['Office', 'Each person can help in more than one way: 🚗 On the fly · 📅 Steady · 🏠 In center · 🧭 Dispatcher (tick any mix), plus 🚚 Goes to Lakewood / Fallsburg.', 'On the driver card, "Helps with". Untick "On the fly" for someone who only helps in the center: he stops getting pickup texts / WhatsApp / app alerts (his own steady or assigned pickups still reach him). "In center" puts him on the Center Help list. "Steady" off = no steady reminders, and he shows greyed (still pickable) when choosing steady drivers. "Dispatcher" = one-login dispatcher access. Tags show in the Drivers list (with a filter) and in Center Help instead of "Driver". Everyone started as they were: the same people still get pickup texts. Drivers see "You help with: …" in their Settings.', 'new', ['roles']],
      // Oct 29 client (Yakov): "track volunteers who haven't received any texts or WhatsApp … and haven't signed in to the app for 2 weeks"
      ['Office', 'Reports: new tile "Can\'t reach (14 days)" — drivers who got no text, no WhatsApp and didn\'t open the app in 2 weeks, with the reason.', 'Tap it for the list, worst first: name, phone with a 📞 Call button, when we last reached him and how, and why ("Texted STOP", "Texts fail", "Paused", "Quiet all day", "Chose no messages", "No phone", "Not in the pickup-text group"). The weekly check-up also says how many. New drivers (added in the last 2 days) aren\'t counted.', 'new', ['cant-reach']],
      // Oct 29 client: "the WhatsApp users … not getting the thank you message at 10 p.m."
      ['Texts', 'The 10 PM thank-you (and the Friday one) now also goes on WhatsApp to drivers who picked WhatsApp.', 'Same rule as pickup texts: Text + WhatsApp drivers get both; WhatsApp-only drivers get it on WhatsApp, or as a text if WhatsApp can\'t reach them. Quiet hours are kept as before.', 'change'],
      // Oct 29 client: "Need more clear that was only to a few"
      ['Office', 'The text chip on a pickup shows the main text and how many more got it later: "Texted 4:53 PM to 52 · +10 more, last 8:38 PM".', 'Before, it showed only the last time ("Texted 8:38 PM"), which looked like the pickup was sent to everyone again, when really only a few drivers got it then (their quiet hours had just ended).', 'change'],
      // Oct 29 client: "First they got some like error code … then I did it again, and then it says no one to remind"
      ['Office', 'The "Remind old versions to update" button answers right away instead of showing an error while it sends.', 'It was waiting for every phone before answering, so the screen gave up and showed an error even though it was sending. Now it says "Sent to N people" at once and the pushes go out right after.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-29T15:18',
    title: 'One login per person, update reminder push',
    items: [
      // Oct 29 client: "push notification to anyone who doesn't have the latest version … one button to press"
      ['Office', 'Admin → App Usage: "📲 Remind old versions to update" sends a push to people on an older app version.', 'It shows how many people are on an older version (by phone type), a preview of the message you can edit ("Zeh L\'Zeh update ready 🔄 — A new version is out with a smoother, easier app. Tap to update."), and Send. Nobody gets it twice within 3 days; it shows when it was last sent and to how many. Not during Pause, Shabbos or Yom Tov. Office only. In app builds from now on, tapping it opens the store page; older apps just open the app, which then shows its own "update" message.', 'new', ['update-push']],
      // Oct 29 client (Yakov's idea): "one user account per person … a dispatcher can get additional access through their original user account"
      ['Office', 'One login per person: a dispatcher uses his own driver login, with a "Driver view / Dispatcher view" switch.', 'Admin → Dispatchers → "Make dispatcher (same login)" turns on dispatcher for a driver\'s own login: same username and password, no second login, no invite text. Turning it off puts it back to a driver login. Anyone who is both sees "🚗 Driver view" in the office header and "🧭 Dispatcher view" in the driver app. Signing in with the phone code goes straight in. People who have two logins today are merged only after the owner approves. The phone apps get the switch with the next app build.', 'new', ['one-login']],
    ],
  },
  {
    liveAt: '2026-10-29T14:25',
    title: 'Steady form: all options back for drop-off places',
    items: [
      // Oct 29 client: "You killed my steady pickup… You took away options for drivers"
      ['Office', 'The steady pickup form shows every option again when "Only counts when they show up" is ticked.', 'Drivers needed, drivers on it, reminders, needs confirmation, ask the store, and the full time choice (including before candle lighting) are all back. Days and time stay optional for a drop-off place.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-29T13:38',
    title: 'Drop-off places without set days, missing fields in red, Settings cleanup',
    items: [
      // Oct 29 client: drop-off places — "we should still have the option of selecting days, but we should not have to"
      ['Office', 'Drop-off places ("Only counts when they show up") don\'t need days or a time any more; the kiosk records the drop-off when they come.', 'In the steady form, days and time are optional for a drop-off place. With no days, nothing is made ahead: when someone signs in at the kiosk and picks that place, the drop-off is recorded right then (done, labels print, never texted). With days, those days work as before, and a drop-off on another day is also recorded at the kiosk. Steady → Drop-offs shows "3 drop-offs this month · last: Tue Oct 27, 2:10 PM". A drop-off place needs its store picked (the kiosk finds it by store).', 'change', ['dropoff-nodays']],
      // Oct 29 client: "It needs to tell me exactly in red which things are missing"
      ['Office', 'Forms now show exactly what is missing, in red.', 'In the steady pickup form and New / Edit pickup: each missing field gets a red border and a short note ("Pick a time", "Store or address is needed"), the top says "Missing: Store, Days, Time", and the form scrolls to the first one. The red goes away as soon as it is filled.', 'change', ['missing-red']],
      // Oct 29 client: "the preference that you like to get it by text or by whatever, and later on it asks you"
      ['Drivers', 'Driver Settings asks how to reach you only once.', 'The separate "Allow text messages" switch further down is gone; it is now one small line under "How should we reach you about pickups?": "Stop all texts, even about pickups I took" (or "Turn texts back on"). The WhatsApp note now says that if WhatsApp doesn\'t reach you, you get a text instead.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-29T00:57',
    title: 'Phone-code sign-in, drop-off time report, *44 answers back the right way',
    items: [
      // Oct 28 client: "a link that you enter your phone number and you get a verification code … 4-digit … forgot password like this"
      ['Drivers', 'Sign in with your phone number and a 4-digit code by text — no password needed. "Forgot password" works the same way.', 'On the sign-in page: "📱 Sign in with my phone number" → type the phone → a text "Your Zeh L\'Zeh code is 4829" → type the 4 digits → in. Drivers land on Settings and can set a password if they want. A driver who never had an app login gets one made from the phone number on file. "Forgot password? Get a code by text" ends on "Set a new password". Link for emails: staging.zehlzeh.org/rescue/phone. Codes work once, for 10 minutes; 5 wrong tries locks it; only our drivers\' and office numbers get a code; no codes on Shabbos / Yom Tov. The phone apps get the button with the next app build.', 'new', ['phone-code']],
      // Oct 28 client: "#118 did a drop off a couple hours after his pickup … add to reports the time from accept until the sign in at the center"
      ['Office', 'Reports: new tile "Time from taking a pickup to drop-off" — average, median and how many took over 2 hours; tap it for each one.', 'From when the driver took the pickup (accepted, or the office set him) to his kiosk sign-in at the center. The list is longest first; over 2 hours is red. It also shows the time after the pickup\'s own time. Tap the driver for his profile or the store for the pickup. Pickups with no kiosk sign-in aren\'t counted; very long ones (over 24 hours, mostly steady pickups set days ahead) are listed apart.', 'new', ['dropoff-time']],
      // Oct 28 client test: WhatsApp, then a text, then *44 — the answer came on WhatsApp
      ['Texts', 'A *44 answer now always goes back the way the driver wrote his last message: a text if he texted, WhatsApp if he wrote on WhatsApp.', 'Before, if he had written on WhatsApp in the last couple of minutes and then texted, the answer still went to WhatsApp.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-28T19:22',
    title: 'Replies to pickup texts show WhatsApp',
    items: [
      // Oct 28 client: "Can you say here also if they said it via WhatsApp or SMS?"
      ['Office', 'Driver messages → Replies to pickup texts: a reply that came on WhatsApp has a green "WhatsApp" tag.', 'Replies by text have no tag (most are texts), so only WhatsApp ones stand out.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-28T18:49',
    title: 'WhatsApp in Driver messages, closed-pickup driver, drivers pick App / WhatsApp / Text',
    items: [
      // Oct 28 client: "something feels separated" — WhatsApp inside the inbox
      ['Office', 'Driver messages now shows texts and WhatsApp together ("Texts & WhatsApp"), each tagged, and replies go back the same way.', 'One row per person, newest first. Each row and each message has a green "WhatsApp" or grey "Text" tag; "replied on WhatsApp" shows when the last reply came that way. Replying: above the box it says "Will send by WhatsApp" (or by text), with a switch to pick the other. The dispatcher text about a WhatsApp message says "replied via WhatsApp". Dispatchers see the same list (this also fixed dispatchers being blocked from WhatsApp conversations since Oct 22). The old "WA threads" tab still works.', 'change', ['wa-merged']],
      // Oct 28 client: Yakov — "Need to add a way to assign someone when the pickup is closed" + an error on save
      ['Office', 'A closed pickup (done, done no kiosk, missed, expired) has "Set driver" / "Change driver", and saving a finished pickup no longer shows an error.', 'The pickup page asks "Who did this pickup?". That driver gets the credit (reports, rewards, thank-you); a driver he replaces loses it; tick "both did it" to keep both. A missed or expired pickup becomes done ("added by the office"). No texts go out. History says "Office set Shmuel R. as the driver (after it was closed)". The Edit box error "column … is ambiguous" when saving a finished pickup is fixed.', 'fix', ['closed-driver']],
      // Oct 28 client: drivers pick push / WhatsApp / text, one, two, three or none — warn when none
      ['Drivers', 'Drivers choose how they get pickup messages: tick App notifications, WhatsApp and/or Text, any mix, or none.', 'In the driver app Settings: 📱 App notifications, 🟢 WhatsApp, 💬 Text message. Turning the last one off asks "With everything off, you won\'t get any pickup messages. Are you sure?" and then shows "🔕 You won\'t get pickup messages." The office driver card shows the same ticks. Backup: if WhatsApp can\'t reach a driver, he still gets the message as a text. The phone apps show the new screen after the next app build; the old app keeps working.', 'new', ['alert-choices']],
      // Oct 28 client: warn the managers before a pickup falls off the drivers' list; AGAIN = 6 more hours
      ['Texts', 'Managers get a text 30 minutes before an untaken pickup leaves the drivers\' list: reply 520 AGAIN or 520 CLOSE.', '"⏰ Newday Bakery (5 PM) leaves the drivers\' list at 11:00 PM — nobody has taken it. Reply 520 AGAIN to keep it 6 more hours and text the drivers again, or 520 CLOSE to close it." AGAIN works like Put back in queue (6 hours) and texts drivers; CLOSE closes it as missed. Text only 8 AM–9 PM (bell alert always), never on Shabbos. Drivers\' own "520", "520 CANCEL", "520 INFO" work as before. On / Off in the No-driver alerts settings.', 'new'],
      // Oct 28 client: "can you get rid of the no driver alerts?"
      ['Office', 'The "🚨 No driver for … it\'s time now" and "… 1h late" alerts to managers are off.', 'Only the 30-minute heads-up to the dispatcher on duty stays. They can be turned back on in Admin → Settings → No-driver alerts.', 'change'],
      // Oct 28 client: picture with the details (cost doesn't matter)
      ['Office', 'New switch: send the store\'s photo with the pickup details (off until you turn it on).', 'Admin → Settings → "Store photo for drivers". When on, a driver who takes a store post that has a photo gets the photo with his details text (as a picture text) or on WhatsApp, and so does a "520 INFO" reply. Some kosher phones don\'t show pictures; they still get the text.', 'new', ['photo-switch']],
      ['Office', 'The "steady pickups needed" flyer shows one clear name per pickup.', 'For example "Bravo Pizza (K) · 10:00 AM" instead of "Bravo · 10:00 AM · Bravo Pizza (K)", and "Hive Discount Store" instead of "The Hive · Hive Discount Store".', 'fix', ['flyer-names']],
      ['Office', 'A day cancelled because its steady schedule changed now says who changed it and when.', 'For example "Cancelled automatically: Hatzlacha was changed to Fridays only by Site Admin · Tue Oct 20, 2:03 PM".', 'change', ['cancel-who']],
      // Oct 28 client: "When I search in Maps the name of a store, like Monsey Takeout, by default it should place the name"
      ['Office', 'New pickup: picking a business from the Google address search (like "Monsey Takeout") also fills in its name.', 'If the store / donor name is still empty and no saved store is picked, choosing a business in the address suggestions puts its name in the name box, so drivers see "Monsey Takeout, 46 Main Street" instead of only the street. Picking a plain street address doesn\'t change the name.', 'fix'],
      // Oct 27 client: "Always write date" (chat bubbles showed only "6:42 PM")
      ['Office', 'Every message now shows its date with the time, also today\'s: "Tue Oct 27 · 6:42 PM".', 'In all chats and message lists: Chat: Stores / Drivers / App chat, Messages → Texts and the SMS inbox, WhatsApp threads, a driver\'s Messages and profile, the store app and driver app chats (the driver app\'s pickup chat now shows a time at all), and problem reports. Older years add the year: "Tue Dec 30, 2025 · 6:42 PM".', 'change', ['msg-dates']],
      // Oct 27 client: "Can you send a test picture to my number?"
      ['Texts', 'WhatsApp setup: "Send test" can include a test picture.', 'Messaging → SMS Composer → WhatsApp → WhatsApp Bridge (tablet): type a phone, tick "📷 With a test picture" and tap Send test. It sends our logo as a picture on WhatsApp, to check that pictures go through.', 'new'],
      // Oct 27 client: "when we replied star 44, it went as a text. Can it tell us that they're talking on WhatsApp? And can it reply always go back to the same place it came from?"
      ['Texts', 'Office alerts about a message that came in on WhatsApp now say "(on WhatsApp)", and a *44 answer goes back on WhatsApp.', 'When a driver writes on WhatsApp, the office text about it ends with "(on WhatsApp)". When a dispatcher answers with *44 and a message, it goes back the same way the driver last wrote: WhatsApp if his last message (in the last 7 days) came on WhatsApp, otherwise a text. The confirmation says which: "✓ Message forwarded to #44 (Yossi) by WhatsApp." A pickup taken on WhatsApp now says "(via WhatsApp)", not "(via text)".', 'change'],
    ],
  },
  {
    liveAt: '2026-10-27T21:26',
    title: 'Late pickups not closed right after a driver takes them',
    items: [
      // Oct 27 client: Ateres Charna 7:03 PM, taken 9:07 PM, already "Done (no kiosk)" at 9:10 PM
      ['Office', 'A pickup a driver takes late is no longer marked "Done (no kiosk)" a few minutes later.', 'The app marks a taken pickup "Done (no kiosk)" when nobody signed in at the kiosk 2 hours after its time. A pickup taken late (Ateres Charna was for 7:03 PM, taken at 9:07 PM) was marked done 3 minutes after he took it. Now the 2 hours also count from when the driver took it, so he has time to bring it to the kiosk. This happened about 6 times in the last two weeks (for example Newday Deli, Pinny Fried, Kzm hall).', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-27T17:40',
    title: 'Kiosk print fix, steady flyer, plainer cancel words',
    items: [
      // Oct 27 client: "Is there a reason why hive doesn't show up on Friday?" (flyer)
      ['Office', 'The "steady pickups needed" flyer now lists every day without a steady driver, also ones someone took just this week.', 'Before, a day a driver took once that week counted as covered and was left off the flyer (Hive on Friday, which Yermia took week by week but has no steady driver). Now those days are on it too, since they still need a steady driver.', 'fix'],
      // Oct 27 client: circled "Cancelled auto (day taken off the schedule)"
      ['Office', 'Plainer words on automatic cancellations.', '"Cancelled auto (day taken off the schedule)" now reads "Cancelled automatically: this day was taken off the steady schedule", and "auto (expired)" reads "automatically: the time passed and nobody took it".', 'change'],
      // Oct 27 client: "a volunteer put his number in the kiosk, it was just showing his history and not letting him print labels"
      ['Kiosk', 'After a driver types his number, the kiosk shows his store and "Done — print labels" first, not a long list of old pickups.', 'The kiosk listed 14 older pickups between his store (top) and the print button (bottom), and the screen could not scroll, so on the tablet only the old list showed. Now the screen scrolls and goes: his stores, Done — print labels, + Food from a different store, then at most 4 earlier pickups. An earlier pickup with no labels has a Print labels button, and with nothing listed there is a big "Drop off food now". No long internal pickup numbers on the kiosk. The tablet gets the new screen with the next app build; until then the shorter list already keeps the store and the print button on screen.', 'fix', ['kiosk-history-fix']],
    ],
  },
  {
    liveAt: '2026-10-27T08:03',
    title: 'Clearer failed texts, Food Donations hidden, fewer fake cancels',
    items: [
      // Oct 27 client: Pickups → Today showed "Hive Discount Store 9:00 AM · Cancelled … recurring schedule changed"
      ['Office', 'Days cancelled only because a steady schedule was changed or the steady pickup was archived, paused or deleted no longer show in Pickups → Today or on the Live Board.', 'For example Hive Discount Store on Tuesdays at 9:00 AM, after its Tuesdays moved to Hive Deli: that day was cancelled by the schedule change, not a real cancellation. These days stay in Pickups → History.', 'fix'],
      // Oct 26 client: "Remove till we ready"
      ['Office', 'Food Donations is hidden from the menu until it is ready.', 'The Food Donations page is off the side menu for everyone for now. Nothing was deleted; it comes back when the office is ready to use it.', 'change'],
      // Oct 26 client: Yakov's screenshot — "Able to take a pickup?" to David Horowitz #116 → "send failed"
      ['Texts', 'When a text to one person can\'t be sent, it now says why instead of "send failed".', 'For example: "Not sent: this person texted STOP, so texts to them are blocked. They can text START to our number to get texts again. You can call them or use App chat." Also for a number that can\'t get texts (landline) or a phone number that looks wrong. This shows in a driver\'s Messages, Driver messages and the other one-person text boxes.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-26T00:48',
    title: 'Deleted steady pickups off the Live Board',
    items: [
      // Oct 26 client: screenshot of "Bingo 1:00 PM · Cancelled by Site · Oct 21 — steady template deleted" on the board
      ['Office', 'Days of a steady pickup that was deleted no longer show on the Live Board as "cancelled".', 'Like archived or paused steady pickups (Oct 23), the days that were cancelled only because the steady pickup was deleted (for example Bingo, 1:00 PM) are not real cancellations, so they stay off the Live Board. They are still in Pickups → History.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-26T00:35',
    title: 'No double pickups, office text switches, Sending now…',
    items: [
      // Oct 25 client: "When I press send text, it takes a minute … it still says it was sent 49 minutes ago … I almost pressed it a second time"
      // Oct 26 client: "Why shows needed every week?" (Newday Monday 10 PM, Shaul S.)
      ['Office', 'A steady driver set for one day of the week is put back on his pickup if an old bug took him off.', 'Before Oct 5, steady drivers set for only one day (like Shaul S. on Mondays at Newday) were taken off pickups made ahead of time, so those days showed "needs a driver" and were texted out. The bug was fixed Oct 5, but pickups made before that stayed without him. Now the app puts him back by itself when nobody else is on the pickup. A driver who gave the day back, or one the office removed or cancelled, is not put back.', 'fix'],
      // Oct 25 client: the pickup came in twice — "it circles … we pressed it again"
      ['Office', 'New pickup can\'t be added twice by pressing Save again, and it saves faster.', 'The moment you press Save the button says "Saving…" and can\'t be pressed again (Enter can\'t send it twice either); then "Saved ✓", with the note right above the button. The server answers right away and texts the drivers after. If the same pickup (same store, or same address and contact, same day and time, same login) is sent again within 2 minutes, it is not added again: you see "This pickup was already added a moment ago. Opening it…" and the first one opens. The same 2-minute check covers NEW by text, store app posts and the public pickup form.', 'fix', ['no-double-pickup']],
      // Oct 25 client: "remove that big option to delete account … backend option only"
      ['Drivers', 'Drivers can\'t delete their account in the app anymore; they can only ask the office.', 'The big red Delete account button is gone from My profile. At the very bottom there is a small "Request to delete my account". It asks first ("Nothing is deleted now; the office will contact you") and then says "Request sent Oct 25". The office gets a bell alert "🗑️ Name asked to delete their account" with Open profile, a text (can be switched off), and a line in the driver\'s Change history. To remove a driver, use Drivers → trash icon as before. Store logins are not changed. The phone apps show this after the next app build; until then, the old button there does not delete a driver.', 'change', ['delete-request']],
      // Oct 25 client: "write a template there of what the message is … in the green"
      ['Office', 'Office texts settings are easier to read: each text shows what it says, in a green box.', 'Settings → SMS notifications is now in plain sections (Drivers, Pickups, Stores & donors, Texts that come in, Sign-ups & forms, System). Each kind has a plain title ("When a driver is on the way"), a green "The text says" box with an example, its On / Off switch and its phones.', 'change', ['office-texts-friendly']],
      // Oct 25 client: "can we tell when a driver accepted it from the app … via text or via the app?"
      ['Texts', 'The office text says how a driver took a pickup: via text, in the app, by phone call, or assigned by the office.', 'For example "Yitzi Klein #57 accepted a pickup (text code 347) (via text)" or "✅ Driver Yitzi Klein took the Hive Fish pickup (8:16 PM) — in the app." A pickup\'s History also says "took it by text" / "in the app" / "by phone call" (text accepts used to show as "in the app").', 'new'],
      // Oct 25 client: "Dov unit 57 replied this, and we should be able to write back *57"
      ['Texts', 'A pickup chat message texted to the office names the driver with his number, and you can answer by texting *57.', 'The text reads: 💬 Dov Moskowitz #57 (Hive pickup chat): "…" To answer, text *57 and your message. Texting *57 and your message from an office phone goes to that driver by text, the same as before.', 'change'],
      ['Office', 'The office "driver completed" / "on the way" texts name a pickup with no store by its donor, contact or street, not "Pickup".', 'For example "Driver Simcha Lefkowitz completed the pickup at Mairfeild on Sun, Oct 25 at 8:16 PM" instead of "at Pickup".', 'fix'],
      // Oct 25 client: "Can we turn off these types of reports" (driver on the way / picked up / completed texts)
      ['Office', 'Every kind of text the office gets now has its own On / Off switch.', 'Settings → SMS notifications: each kind (driver on the way, picked up, completed, chat messages, texts that came in, food check, store cancel, sign-ups and more) has "Text the office: On / Off" at the top. Off means nobody gets that text, not even the main office numbers. The bell alert in the portal still shows. Nothing was switched off by this update: every text keeps going where it went, until someone switches it off. The 9:15 PM daily summary has its own switch in Reports → Numbers, and the "No driver" texts in the No-driver alerts settings.', 'new', ['office-texts-off']],
      ['Office', 'Send SMS now says "Sending now…" the second you press it, so it isn\'t pressed twice.', 'On a Live Board card and on the pickup page, after "Send only this pickup" the text chip changes right away to "📤 Sending now…" and the button turns grey and says "Sending…" (it can\'t be pressed). The texts go out one person at a time, which can take a minute. As soon as they went out, the chip changes to "📤 Texted 11:31 PM · just now" and the button is back. If nothing shows up within 3 minutes, it goes back to normal by itself.', 'change', ['sending-now']],
    ],
  },
  {
    liveAt: '2026-10-25T01:38',
    title: 'Driver numbers, short timeline, What\'s new pictures',
    items: [
      // Oct 25 client: Hive pickup showed Chanie "claimed it in the app" at the moment the office saved the steady schedule
      ['Office', 'A pickup\'s History no longer says a driver "claimed it in the app" when the office only saved the steady schedule.', 'Before Oct 20, saving a steady pickup\'s drivers also wrote a sign-up for each driver on the day, even one already taken off. History showed that as "claimed it in the app" (for example on The Hive, Sun Oct 25, at the minute the office moved Sundays to Hive Deli). The Oct 20 fix stopped new ones; now the old ones (on 77 pickups) are hidden too. Real app claims still show.', 'fix', ['r1-history-steady']],
      // Oct 25 client: "add by what's new a place that you can click on, like view picture and see a screenshot"
      ['Office', 'What\'s new can show pictures: open an update and tap "📷 View picture" to see a screenshot.', 'Updates with a screenshot have a "📷 View picture" button (or "View 2 pictures") next to Comment when you open them. The picture opens big in a pop-up; use Back / Next for more than one, and ✕, Esc or tapping outside closes it. Pictures load only when you tap, so What\'s new stays fast. Only office logins see the button, since the pictures show real names. The recent updates have pictures now, and new ones will get a picture when there is something to see.', 'new', ['whats-new-pictures']],
      // Oct 25 client: option E
      ['Drivers', 'New button in Drivers: "📨 Send driver numbers" texts each driver his own Zeh L\'Zeh number.', 'Tick drivers in the Drivers list (or tap "Select all with a number") and tap "📨 Send driver numbers". You first see the exact text for the first person, for example "Hi Moshe! Your personal Zeh L\'Zeh number is #36. When you see #36 in our messages, that\'s you. Thanks for being on the team!", and the count: "Send to 42 drivers. Skipped: 3 (no number), 2 (texted STOP), 1 (archived / do not contact / outside helper)". Then tap Send. Each driver gets his own personal text at his texting number, one at a time in the background; results are in Reports → SMS delivery. After 10 PM it asks "Send now or schedule?", and on Shabbos / Yom Tov it can only be scheduled. A driver who already got it in the last 24 hours is skipped unless you tick "Send again". Office only (not dispatchers).', 'new', ['driver-numbers-preview', 'driver-numbers-list']],
      // Oct 24 client: "There's too many steps … this is just for a dispatcher to see the timeline. Make it shorter."
      ['Office', 'A pickup\'s History is now a short, plain timeline, usually 3 to 6 lines, like "9:32 PM Posted and texted to drivers · 10:34 PM Yisroel H. took it · 11:20 PM ✓ Dropped off at the kiosk (Yisroel H.)".', 'Steps that happen together are one line: posted + texted, accepted + assigned, kiosk check-in + done. Office-only steps (alerts to the dispatcher, "needs a driver started", reply codes, offer deadlines) are left out. Still shown in plain words: a driver giving it back, the office taking a driver off, cancelled (by whom and why), un-cancelled, a store\'s CANCEL text or food check answer, put back in the queue, texted again, "Ask driver: dropped off?" and the answer, missed or no-show, and drivers needed changed. Names are "First L." and the day shows only when it isn\'t the pickup\'s day. Tap "Show all details" for the full list as before.', 'change', ['timeline-short', 'timeline-busier']],
      // Oct 24 client: "released from the pickup" after a kiosk check-in
      ['Office', 'A pickup\'s History no longer says the driver "released" it right after he checked in at the kiosk.', 'When a driver checks in at the kiosk, the app quietly closes his app claim at the same moment. The History showed that as "released from the pickup", which looked like he gave it back. That line is now hidden in that case.', 'fix', ['r1-history-kiosk']],
      // Oct 23 client: option 2
      ['Texts', 'The thank-you text now also counts the steady driver when a steady pickup closed as "done, no kiosk sign-in".', 'Before, a steady driver only got counted with proof (kiosk sign-in, DONE, marked done or accepted). Now the steady driver on a steady pickup that closed automatically as done without a kiosk sign-in is counted too (not backups).', 'change', ['r1-text-thankyou-steady']],
    ],
  },
  {
    liveAt: '2026-10-23T15:57',
    title: 'Steady pickups timed from candle lighting',
    items: [
      // Oct 23 client: "a bakery we get from every Friday, 2 hours before candle lighting"
      ['Office', 'Steady pickups can be timed from candle lighting: "2 h before candles" on Fridays only, or Fridays and erev Yom Tov.', 'In the steady pickup form, Time now has two choices: Fixed time, or Before candle lighting (hours and minutes, at least 30 minutes). Under Before candle lighting you pick Fridays only (the default) or Fridays and erev Yom Tov. With Fridays only, an erev Yom Tov on a weekday keeps the fixed time like any other day; a Friday that is erev Yom Tov still goes by candle lighting. With candle lighting the form shows the times right away, for example "This Friday: 3:45 PM (candles 5:45 PM)" and "Summer Fridays ~6:10 PM". Every Friday (and, if you picked it, an erev Yom Tov that falls on one of the pickup\'s days) gets candle lighting minus that time, rounded down to 5 minutes. If the pickup also runs on other weekdays, those keep the fixed time (both show in the form). Upcoming days that were already made move to the new time when you change it; past days, done or cancelled ones, and a day you changed by hand stay as they are. The steady list, the weekly calendar, the store profile, the flyer and the weekly email show "2 h before candles, Fridays (Fri 3:45 PM)" (or "Fridays & erev Yom Tov"). Texts, reminders, the Live Board and the store "food today?" text all follow each day\'s time as before.', 'new', ['candle-form', 'candle-calendar']],
      // Oct 23 client: Friday / erev Yom Tov weekly thank-you
      ['Texts', 'On Friday and erev Yom Tov, the thank-you text also thanks everyone who drove this week.', 'The Friday text now reads: "Thank you to all our drivers this week, together you covered 79 pickups! #20, #22, #28, #36, #40, #43, #72, #91, and #117. From the stores, simchas, or wherever it may be, to the families\' homes - you\'re the ones who keep it all moving. Hashem should pay you back! Have a wonderful Shabbos!" "This week" is Sunday through today, counted the same way as today\'s list. Before Yom Tov it ends "Have a wonderful Yom Tov!" (a Friday before Yom Tov: "Shabbos and Yom Tov"). If nobody drove today but some did this week, it starts "Zeh L\'Zeh: Thank you to all our drivers this week: ...". Each list shows up to 40 numbers, then "and more". Other days the text is the same as before.', 'change', ['r1-text-friday-week']],
    ],
  },
  {
    liveAt: '2026-10-23T12:24',
    title: 'Friday thank-you an hour before candle lighting',
    items: [
      // Oct 23 client
      ['Texts', 'On Friday and erev Yom Tov, the daily thank-you text goes out 1 hour before candle lighting.', 'It used to go out 45 minutes before candle lighting. Other days it still goes out at 10 PM.', 'change', ['r1-rules-thankyou-time']],
    ],
  },
  {
    liveAt: '2026-10-23T11:21',
    title: 'Archived steady pickups off the Live Board',
    items: [
      // Oct 23 client: "Same style everywhere" (src/display.ts)
      ['Office', 'Same style everywhere: names, phones, addresses, dates and status colors look the same on every screen.', 'One pass across the office screens, the dispatcher view, the driver app, the store app and the kiosk. Phone numbers always show as 845-356-1637 (tapping still calls). Addresses show short, street and town ("8 Hershel Terrace, Monsey"), no ", NY 10952, USA" (the full address is in the tooltip and on the map link). Hebrew names sit right next to English. Driver numbers (#36) show only in the Drivers list and the driver\'s profile (and the driver search boxes, so you can still type #36). Status pills use the same words and colors everywhere: Done, Done (no kiosk), Cancelled, No drop-off today, Missed, Expired, Needs a driver, Covered, Needs confirmation, On the way, Needs review (Live Board, Pickups Today / History / Calendar, Close out, the pickup page, store and driver histories, Reports). Dates and times read one way: "4:00 PM" today, "tomorrow 9:00 AM", "Thu Oct 23 · 4:00 PM". CSV exports and the texts drivers get are not changed.', 'change', ['r1-pickups-today']],
      // Oct 23 client: steady pickups set to 2 drivers by mistake were cancelled instead of fixed
      ['Office', 'New button: "✓ Only needs 1 driver" when a pickup already has a driver but still asks for more.', 'On a Live Board card and on the pickup page, a pickup that has a driver but still says "Needs 1 more" (for example a steady pickup set to 2 drivers by mistake) now has "✓ Only needs 1 driver" (the number is how many drivers are already on it). It asks "Just today, or every week?". Just today: only this pickup stops asking for more drivers. Every week (steady pickups): the steady pickup is set to that many drivers, and its upcoming days that ask for more go down too (never below the drivers already on a day). Nobody gets a text, and it shows in the pickup\'s History ("Drivers needed 2 → 1 (every week) by …"). Dispatchers can use it too. Cancelling or dismissing a pickup that has a driver now warns first: "Moshe Klein is assigned to this pickup. Cancelling removes the whole pickup …" with "Only needs 1 driver", "Cancel the pickup anyway" or "Go back". In the steady pickup form, "Drivers needed" above 1 shows "Each day will ask for 2 drivers."', 'new', ['only-needs-1-card', 'only-needs-1-choice']],
      // Oct 23 client: "Why is this showing if it's archived?"
      ['Office', 'Days of a steady pickup that was archived or paused no longer show on the Live Board as "cancelled".', 'When a steady pickup is archived or paused, its upcoming days are closed automatically. Those days used to show on the Live Board under "cancelled" (e.g. "Cancelled by Site … steady template archived"). They are now left off the board; real cancellations still show.', 'fix', ['r1-lb-finished-calm']],
    ],
  },
  {
    liveAt: '2026-10-23T10:49',
    title: 'Drop-off pickups hidden until they come',
    items: [
      // Oct 23 client: Steady weekly coverage calendar — neater, colors, tap to open
      ['Office', 'Steady weekly calendar is neater: colors, one line per pickup, tap to open it.', 'Pickups → Steady → "Weekly coverage": each pickup is one short line, time first ("9:00 AM · The Hive"), with its driver under it ("Moshe K. +1"). The store name only shows when it adds something (no more "Bravo / Bravo Pizza (K)"). Colors instead of word tags: green = has a steady driver, red = needs a steady driver, orange = covered this week only, grey = paused or drop-off, ⏳ = ending soon (hover a card for the exact words). Cards are smaller and sorted by time, empty days (like Saturday) are hidden, and each day says how many still need a driver ("TUE · 13 · ⚠️ 3 need driver"). Click a card to open that steady pickup. The filter buttons now fade the other pickups instead of hiding them (click again or All to clear). On a phone you see one day at a time with ◀ ▶ (or swipe), starting on today. The Download flyer button and the list below are the same.', 'change', ['steady-week', 'steady-week-open']],
      // Oct 23 client: a text typed by hand at 2:02 AM woke a driver
      ['Texts', 'Late at night, a text you type asks first: "It\'s 1:12 AM. Send now, or schedule it?"', 'From 10 PM to 8 AM (New York time), pressing Send on a text to one person (💬 Text on a pickup card or the pickup page, a driver\'s Messages, Driver messages → Texts, WhatsApp replies, "Text them" on a problem report, "Ask driver: dropped off?") opens a small box instead of sending: "Send now anyway", "Schedule for 8:00 AM", "Pick a time…" or "Cancel". On Shabbos / Yom Tov only scheduling is offered, and it goes out after. A scheduled text shows in the conversation as "⏰ Scheduled for 8:00 AM" with Send now and Cancel, and in Messaging → Upcoming. When it goes out it is the same as a text you send yourself (it shows in the conversation, a driver who texted STOP doesn\'t get it, and his YES to a scheduled "dropped off?" still counts). The Send now button of a group text in the SMS composer asks the same way. Automatic texts are not changed.', 'new', ['r1-late-night-prompt']],
      // Oct 23 client: drivers list looked messy (phones, Hebrew names)
      ['Office', 'Drivers list is neater: phones all look the same, Hebrew names sit right, shorter addresses.', 'Phone numbers in the Drivers list now all show as 845-356-1637 (no more "+1" on some). A name typed in Hebrew no longer pushes the driver number to the wrong side. Addresses drop ", NY 10952, USA".', 'change', ['r1-drivers-list']],
      // Oct 23 client: new wording for the drop-off question
      ['Texts', 'New wording for "Ask driver: dropped off?" — it names the store and its address.', 'The text now says: "Hi Moshe, we didn\'t see a kiosk sign-in for your pickup from Hive Deli, 250 NY-59 (4:00 PM). We just want to make sure you dropped off the food and everything worked out. Please reply YES or NO. Thank you!" A YES gets "Thank you!".', 'change', ['r1-text-ask-dropped']],
      // Oct 22 client: Live Board stuck on "Loading…" (Thursday evening)
      ['Office', 'Live Board no longer gets stuck on "Loading…" when several office tabs are open.', 'Each open office tab or window kept one live-update line to the server open all the time. A browser only opens 6 lines to our site, so with 6 tabs open every other request waited and the Live Board stayed on "Loading…". Now only one tab keeps the live line and shares the updates with the other tabs (if it closes, another tab takes over). And if the pickups still don\'t load within 30 seconds, the board says "Couldn\'t load the pickups" with a Try again button instead of loading forever.', 'fix', ['r1-lb-top']],
      // Oct 22 client: "the school dropping off … we don't want it to show unless it was completed"
      // Oct 22 client: "need all this stuff to be neater"
      ['Office', 'Neater Live Board: finished pickups fold into one line at the top.', 'Done and cancelled pickups now sit in one short line at the top ("✓ 8 done earlier today · 1 cancelled"). Tap Show to see them as a tidy list: time, name, status and driver (first name + last initial). The board remembers if you left it open. Names drop ", NY, USA" and street tails like " - 51 Carlton Rd", cards no longer show unit numbers, and the "usually … drivers out" box is now one short line under the header. The "Hide finished" switch is gone.', 'change', ['r1-lb-finished-fold']],
      ['Office', 'Drop-off steady pickups (like the school) show on the Live Board only once they came.', 'Steady pickups marked "Only counts when they show up" no longer appear on the Live Board while they are waiting. They show up only after a kiosk sign-in marks them done. They are still listed under Pickups and in the Steady → Drop-offs tab.', 'change', ['dropoff-tab']],
      // Oct 22 client: "For the schools they give sometimes. If that's checked off, it should not show any missed pickups from them."
      ['Office', 'Drop-off steady pickups (like the school) never show as missed.', 'For steady pickups marked "Only counts when they show up", a day with no kiosk sign-in is never missed, expired, needs review or "no kiosk sign-in" anywhere: not in Needs attention, Waiting, Close out, Numbers, Reports, the store or driver profile, the Calendar, the schedule export or the daily / weekly summary. Where a list shows it, it says "No drop-off today" in grey. They also never count as "needs a driver" or "uncovered". When you tick the box on a steady pickup, its missed days from the last 60 days (no kiosk sign-in, no driver who took them) change to "No drop-off today", and a message tells you how many. Days that were done, or that a driver took, stay as they are. Unticking does not change the past.', 'change', ['r1-admin-steady-dropoffs']],
    ],
  },
  {
    liveAt: '2026-10-22T18:04',
    title: 'Live Board tweaks; ask driver if dropped off',
    items: [
      ['Office', '"🏷️ 3 taken, no kiosk sign-in" is back at the top of the Live Board.',
        'A small strip that stays on top while you scroll. Tap it for the list: pickups a driver took but never signed in for at the kiosk (also ones more than 1 hour past their time that are not closed yet), each with Mark done and Mark missed.', 'change', ['r1-lb-taken-strip']],
      ['Office', 'New button on those rows: "💬 Ask driver: dropped off?"',
        'It shows the text first, then texts the driver(s): "Zeh L\'Zeh: Hi Moshe, did you drop off the food from Hive Deli (4:00 PM) at the center? Reply YES or NO. Thanks!" The row then says "Asked Moshe 3:10 PM · waiting". If he answers YES within 24 hours, the pickup counts as dropped off (like a kiosk sign-in, note "Drop-off confirmed by driver text (YES)") and he gets "Thanks! Marked as dropped off." If he answers NO, he gets "Thanks for letting us know — the office will follow up." and the bell rings ("Moshe says he did NOT drop off Hive Deli (4 PM)"); the pickup waits for you. A YES only counts when nothing newer is waiting for his answer (a NEW / SEND by text, a store "food today?" question, or a newer pickup text). Never to a phone that texted STOP; not on Shabbos / Yom Tov; it warns at night. The ask and the answer show in the pickup\'s History. The automatic "Did you drop it off?" reminder stays off.', 'new', ['ask-driver-board', 'ask-driver-preview']],
      ['Office', 'Finished and cancelled pickups on the Live Board are no longer grey.',
        'They stay on the board (Hide finished still hides them) as calm white rows with a small "✓ Done 2:40 PM", "Cancelled" or "Missed" tag.', 'change', ['r1-lb-finished-calm']],
      ['Texts', 'The "💬 Text <driver>" box names the pickup: "Hi Shmueli, about the Hive Deli pickup (4:00 PM): ".',
        'Store name, else the donor or contact name, else the street address; the day is added when it is not today. Same on the pickup card, the pickup page and the alert pop-up.', 'change', ['r1-lb-text-prefill']],
      ['Office', 'Pickups are shown by name, never by their number.',
        'Everywhere a pickup was shown as "#1313768": the call log picker ("About which pickup?" now lists "Hive Discount Store · 9:00 AM", or the street when it is not a store), call logs, Close out, pickup cards, pickup page, store and driver profiles, response times, automatic phone calls, the SMS composer lists, the kiosk, bell alerts and office texts (driver accepted / gave back / picked up / rescheduled / chat), and the store history. The texting code drivers reply with (e.g. "Reply 463") stays. The pickup page keeps a tiny grey "ref" for support.', 'change', ['r1-lb-named']],
    ],
  },
  {
    liveAt: '2026-10-22T00:58',
    title: 'Sign-in screen: apply, contact, reset password',
    items: [
      ['Drivers', 'Sign-in screen: "New volunteer? Apply here" opens the volunteer application, no login needed.',
        'For people who download the app before they have a login. The form is the same one on the website; the office reviews it as usual.', 'new', ['r1-login-apply']],
      ['Drivers', 'Sign-in screen: "Contact us" with Call, Text and Email buttons for the office.', null, 'new', ['r1-login-contact']],
      ['Drivers', 'Sign-in screen: "Forgot or reset password?" texts a link to choose a new password.',
        'Type the phone number on the account and a link is texted to that phone. The link works 30 minutes and only once; using it signs out the account on other phones and computers. The screen always shows the same answer, so nobody can use it to check who has an account. 3 tries per phone and 10 per internet address each hour. If an office login (admin, dispatcher...) is reset this way, the admins get a 🔑 bell alert. "Forgot password? Call the office" is still there. In the phone app this shows after the next app store update; the website gets it at go-live.', 'new', ['r1-login-forgot']],
    ],
  },
  {
    liveAt: '2026-10-22T00:58',
    title: 'Dispatcher view and drop-off steady pickups',
    items: [
      ['Office', 'Dispatcher logins: a driver opens on just two tabs, Pickup history and Messages.',
        'Messages is the whole conversation with the driver (texts, app chat and WhatsApp) with a box to send a new message. No edit button, status, application, alerts & schedule, sign-up info, notes, change history, rewards, response times or call settings. The Drivers list shows name, unit # and phone only (no filters, export or New sign-ups). The office sees drivers exactly as before.', 'change', ['r1-disp-driver-tabs']],
      ['Office', 'Dispatcher logins: no Suppliers page. New pickup still finds a store and fills its name, address and contact.', null, 'change', ['r1-disp-menu']],
      ['Office', 'Dispatcher logins: Messaging is Texts, App chat and WhatsApp conversations (read and reply).',
        'Who gets texts, How texting works, Code words, Replies to pickup texts, Chat: Stores and the SMS Composer (Upcoming, Compose, Groups, Broadcast) are office only, and the server refuses group / send-all texts from a dispatcher login. Send SMS on a pickup card ("Send only this pickup") stays.', 'change', ['r1-disp-messaging']],
      ['Office', 'Pickup cards: "💬 Text" next to each driver\'s 📞 Call button.',
        'A short box to text that driver about the pickup. It shows in Driver messages → Texts and in the driver\'s Messages.', 'new', ['r1-disp-card-text']],
      ['Office', 'Steady pickups: new tick box "Only counts when they show up (drop-off when they have food)".',
        'For places that come only when they have extra (for example a school). Their days are never texted to drivers (no hourly, new, morning or catch-up texts, not in PICKUPS or the app list, no escalation, uncovered alerts or calls), never red on the Live Board, and driver reminders start off. A day with a kiosk sign-in for that place is completed as usual; a day without one closes quietly after the day ends as "No drop-off today" (not missed, not counted in Numbers, Close out or Reports).', 'new', ['dropoff-tickbox']],
      ['Office', 'Steady pickups: a "Drop-offs (when they have food)" tab lists these places, apart from the regular steady list.', null, 'new', ['r1-admin-steady-dropoffs']],
    ],
  },
  {
    liveAt: '2026-10-22T00:58',
    title: 'Cleaner Live Board',
    items: [
      ['Office', 'The Live Board shows the whole day on one page and opens at the current time.',
        'Earlier pickups stay in the list above (scroll up to see them); finished and cancelled ones are a short grey line, and "Hide finished" hides them. A "Now" line marks the current time. Still-open pickups from an earlier day with no driver stay at the top until someone resolves them. The same for the office and for dispatchers.', 'change', ['r1-lb-top']],
      ['Office', 'One color per pickup: green = covered, red = needs attention, orange = needs confirmation today, grey = finished or cancelled, white = open but not urgent yet.',
        'Red: it still needs a driver and its time is 30 minutes away or past (this includes "No driver 1h late"), a store or donor replied CANCEL and it was not cancelled, the store did not answer "food today?", or a confirmation is still open after its time. Orange: a pickup that needs a Confirm or Decline call, shown from 3 hours before its time, with Confirm and Decline right on the card (today only). The count words at the top ("Waiting 2", "1 overdue, needs a driver", "1 to confirm") are gone; the colors say it.', 'change', ['r1-lb-colors']],
      ['Office', 'The "Needs confirmation" box and the "On call now" card are off the page.',
        'Pickups that need confirmation are orange cards in the list. On call now is the small "📞 Drivers happy to be called (4)" button at the top of the Live Board: tap it for the list with the call buttons and "I called".', 'change', ['r1-lb-header']],
      ['Office', 'Texts on each card: one small chip, "📤 Texted 2:06 PM · 12 min ago".',
        'Or "Not texted yet" / "Opens to drivers 3:00 PM". Tap it for who got the text (how many times and to how many drivers is in there too). The top of the Live Board says when the last pickup text went out and when the next one goes.', 'change', ['r1-lb-texted-chip']],
      ['Office', 'Pickups: the List tab is gone. Use History (its dates can be in the future too).', null, 'change', ['r1-pickups-tabs']],
    ],
  },
  {
    liveAt: '2026-10-22T00:58',
    title: 'No-driver escalation and day close-out',
    items: [
      ['Office', 'A pickup with no driver now goes up step by step: 30 min before, at its time, and 1 hour late.',
        'For pickups drivers can see that still need a driver (not on hold), 8 AM to 9 PM, never on Shabbos or Yom Tov, each step once. 60 min before: the alert to the dispatcher on duty, as today. 30 min before: "⏰ Hive Deli 4 PM still has no driver (30 min)" to the dispatcher on duty and every office phone with alerts on, with the drivers who did that store in the last 6 months and 📞 buttons to call them. At its time: "🚨 No driver for Hive Deli (4 PM) — it\'s time now." to the managers (bell, phone alert and one text). 1 hour late: one more alert to the managers, a red "No driver 1h late" badge on the Live Board, and the pickup page offers Put back in queue / Cancel / Mark missed. Every step shows in the pickup\'s History.', 'new', ['r1-alert-escalation']],
      ['Office', 'Pickups → Close out: say what happened to each of today\'s pickups.',
        'Lists today\'s pickups that are not closed: taken with no DONE or kiosk sign-in, still open after their time, expired, or missed with no reason. Each has ✓ Done (how much food: small / medium / large, and pounds if you know), ✗ Missed with a reason (driver no-show, store had no food, store closed, cancelled late, other) and Driver didn\'t show (saved as a no-show for that driver). "All taken ones were done" closes every taken one in one tap. Who closed it is saved and shown in the pickup\'s History. At 9 PM (Sunday to Thursday) the bell reminds the office when some of today\'s pickups are not closed.', 'new', ['r1-closeout']],
      ['Office', 'Reports → Close-out & no-shows: food rescued by size, pounds, why pickups were missed, and no-shows per driver.', null, 'new', ['r1-closeout-report']],
      ['Office', 'Settings → 🚨 No-driver escalation: each step on or off, its minutes, and who the managers are.',
        'Admins only. Steps 2 and 3 go to the Escalation contacts (office logins get the bell and phone alert, phone numbers get the text). With no contacts set, they go to every admin login.', 'new', ['r1-escalation-settings']],
    ],
  },
  {
    liveAt: '2026-10-22T00:58',
    title: 'Daily numbers',
    items: [
      ['Office', 'Reports → "Numbers": today, yesterday, this week and last week on one page.',
        'Admins see pickups (one-time, steady, deliveries), how many had a driver at their start time ("covered on time"), the typical time to get a driver, how many still had no driver at start and 90 minutes late, done / missed / cancelled (and who cancelled: store, office or automatic), food size and weight once they are recorded, active, new and lapsed drivers (no pickup in 30 days), the top 5 drivers\' share, stores that gave, texts sent and failed, and app opens. Arrows compare this week with last week on the same days. Below: 8 weekly bars for "covered on time" and "missed", so a bad week stands out. Counts only, no names.', 'new', ['r1-numbers']],
      ['Office', 'A short summary every evening at 9:15 PM, and a weekly one on Sunday morning.',
        'One bell alert for admins and one text, for example: "ZLZ today: 14 pickups, 12 done, 1 missed, 1 cancelled, covered on time 86%, 9 drivers. Week so far: 61 pickups, 89% covered." Never on Shabbos or Yom Tov: Friday\'s goes out Motzei Shabbos at about 9 PM. Sunday at 9 AM: last week vs the week before, with the last 8 weeks of "covered on time" and "missed". Reports → Numbers → Daily summary: turn each one on or off and choose the phones ("Daily summary to"; empty = the office numbers).', 'new', ['r1-alert-numbers']],
    ],
  },
  {
    liveAt: '2026-10-22T00:58',
    title: 'Alarms when something stops working',
    items: [
      ['Office', 'Reports → Check-up → "Health now": background jobs, texts in the last hour, the WhatsApp phone and stuck sends, green or red.',
        'A new box at the top of Reports → Check-up (admins). Background jobs: the about 30 automatic jobs (9 AM texts, steady reminders, auto-missed, no-driver alerts and so on) with when each last ran; red when one stopped. Texts in the last hour: how many went out and how many failed (people who texted STOP, landlines and bad numbers are not counted as failures). WhatsApp phone: last message received and sent, and how many are waiting. Stuck sends: sends still "requested" after 30 minutes (shown only, nothing is changed). It refreshes every minute.', 'new', ['r1-checkup-health']],
      ['Office', 'Bell alert when an automatic job stops running.',
        'If one of the automatic jobs has not run for 3 times its usual gap, or failed 3 times in a row, admins get one bell alert, for example "Background job \'steady reminders\' hasn\'t run since 2:05 PM". At most once a day per job. The alert clears itself when the job runs again.', 'new', ['r1-alert-job']],
      ['Texts', 'Alarm when many texts fail.',
        'Every 10 minutes the server looks at the last hour. If 10 or more texts were sent and half or more failed, admins get a bell alert and the office gets a text: "Texts are failing: 37 of 52 failed in the last hour (reason: …). Check TextDrip." At most once every 3 hours, and a "working again" note when texts go out again. Texts refused for one person (STOP, landline, bad number) do not count.', 'new', ['r1-alert-texts-failing']],
      ['Office', 'Alarm when the WhatsApp phone stops working.',
        'If WhatsApp messages wait more than 15 minutes, the last WhatsApp send failed and nothing went out after it, or nothing was sent or received for 24 hours while WhatsApp messages were being tried: admins get a bell alert (at most every 6 hours) and the office a text (at most once a day). Check that the WhatsApp tablet is on, online and the bridge app is running. Never on Shabbos or Yom Tov: it waits until after.', 'new', ['r1-alert-whatsapp']],
    ],
  },
  {
    liveAt: '2026-10-22T00:58',
    title: 'Force app updates; app usage',
    items: [
      ['Office', 'Settings → 📱 Phone app versions: make old phone apps update.',
        'Admin → Settings → "📱 Phone app versions". Shows the version in the stores (1.0.43), the version now required and the latest version. Pick "Require at least version: 1.0.43" and Save (you are asked to confirm): anyone on an older phone app sees "Please update to keep using the app" and cannot continue until they update. Works on Android apps and iPhone apps 1.0.43 and newer; the website is not affected. Off = nobody is forced. A version that is not in the stores yet cannot be picked, so nobody can be locked out. Every change is saved with who made it.', 'new', ['r1-app-versions']],
      ['Office', 'Reports → App usage: totals, days used, old versions in red, filters.',
        'Top line: how many drivers, how many used the app this week, how many are on an old version and how many never opened it. Per driver: last opened, on how many days they opened the app in the last 7 and 30 days, platform, version (red when older than the store version). Filters: Old version / Not opened in 14 days / Never opened; tap a column to sort. Day counts start when this update goes live.', 'new', ['r1-app-usage']],
    ],
  },
  {
    liveAt: '2026-10-21T17:01',
    title: 'Confirm on the day; STOP kept in sync',
    items: [
      ['Office', 'Steady pickups that need a confirmation can be confirmed or declined only on their day. Later days say "Confirm on the day".', 'The Needs confirmation list, the pickup cards and the pickup page show Confirm / Decline (and Send to drivers / Cancel today for the store food check) only for today\'s pickups. A pickup on a later day shows "Confirm on the day" and no buttons. If someone already confirmed or declined it, pressing a button now says so, for example "Already declined on Oct 2 by Site Admin." Each Confirm and Decline is also shown in the pickup\'s History with who did it.', 'change', ['r1-confirm-on-day']], // Oct 21 client
      ['Texts', 'When the texting service says a person texted STOP, their texts are now turned off in our app too.', 'Some people texted STOP to the texting service, but our app still showed their texts as on, so every text to them failed. Now, the first time the texting service refuses a text because they opted out, we turn texts off for that number (drivers and stores), add a line to their change history, and send the office a short note. Other failures do not turn texts off. If they text START, texts go back on.', 'fix', ['r1-change-history-stop']], // Oct 21 client
    ],
  },
  {
    liveAt: '2026-10-21T15:16',
    title: 'Steady reminder retries',
    items: [
      // Oct 21 client: "needed 3 drivers, 1 accepted, and it's off the queue"
      ['Drivers', 'A pickup that needs more than one driver stays open until it has them all.', 'Before, 2 hours after its time a pickup was closed as done as soon as one driver had taken it, even if it needed 3. Now it stays in the texts and PICKUPS until it has all its drivers or its normal open time ends (6 hours, or the store\'s "ready until" time).', 'fix', ['r1-driver-multi']],
      // Oct 21 client (Yakov): "When setting someone for not now, it should go to Archive, not to inactive"
      ['Drivers', 'New sign-ups marked "Not now" now go to Archive instead of Inactive.', 'Pressing "Not now" on a new sign-up now sets them to Past / Archived. They get no text, and archived people never get pickup texts.', 'change', ['r1-signups']],
      // Oct 21 client: "for a 2 o'clock I got already 5 messages"
      ['Texts', 'A steady pickup reminder that can\'t reach the driver is no longer tried again every 5 minutes.', 'When the texting service refused a reminder (for example the driver had texted STOP), the system tried again every 5 minutes until the pickup time. The driver never got them, but the attempts piled up. Now a refusal like that counts as done, and other failures are tried at most 3 times.', 'fix', ['r1-checkup-stop']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Dispatcher access',
    items: [
      // Oct 21 client (Yakov): dispatcher role review — Messaging, admin settings, remove driver, Steady, My Shift.
      ['Office', 'Dispatchers now have Messaging in their menu.', 'Driver messages, Who gets texts, How texting works, Chat: Stores and SMS Composer (Upcoming, Compose, Groups, Broadcast (push), WA threads). They can read and send texts as before. Settings inside Messaging (message templates, text groups, push types, WhatsApp setup) are view-only for dispatchers.', 'change', ['r1-disp-menu']],
      ['Office', 'Only the office can change admin settings.', 'Dispatchers can no longer change message templates, push notification types, dropdown lists, neighborhoods, text groups (or who is in them), saved families, Center Help templates, or the office-texts phone list. They can still see the lists their screens use, and can still add a new family when making a delivery pickup.', 'change', ['r1-disp-menu']],
      ['Office', 'Dispatchers can remove a driver from a pickup.', 'Same as the office: the driver gets a text that they are off it, and the pickup is texted to drivers again if it needs one.', 'change', ['r1-disp-edit']],
      ['Office', 'Delete driver and delete store buttons are hidden for dispatchers.', 'Only the office can delete a driver or a store, so dispatchers no longer see those buttons.', 'change', ['r1-disp-drivers-list']],
      ['Office', 'Dispatchers can see all steady pickups (Pickups → Steady).', 'The list and the weekly coverage now show for dispatchers. Adding, changing, archiving or deleting a steady pickup stays with the office ("View only. To add or change a steady pickup, ask the office."). Editing a steady day from a dispatcher login changes only that one pickup.', 'change', ['r1-disp-steady']],
      ['Office', 'My Shift shows the dispatcher\u2019s own shifts.', 'Shifts are found from the login, its linked driver record, or the same phone number. With no shifts it says "No shifts assigned to you yet — the office assigns shifts in Shifts."', 'change', ['r1-disp-myshift']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Buttons answer right away',
    items: [
      // Oct 20 client: "Things take a bit too long" — Create pickup with "Text drivers now" spun 15-30 s while the texts went out one person at a time.
      ['Office', 'Buttons that text drivers (New pickup with “Text drivers now”, Send SMS, Remove driver, Put back in queue) now answer right away.', 'Before, the button kept spinning until every driver was texted one by one, which could take 15–30 seconds. Now the pickup is saved at once and the screen says “Texting 55 drivers now”, while the texts keep going in the background. Open “Who got the text” a minute later to see who got it; who gets texted and what the text says did not change.', 'fix', ['r1-send-only-this']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Send SMS opens faster',
    items: [
      // Oct 20 client: Live Board → Send SMS → "Send all currently open pickups" was stuck on "Checking…".
      ['Office', 'Send SMS on the Live Board now shows the number of open pickups right away.', 'The "Send all currently open pickups" button no longer gets stuck on "Checking…": it shows the count at once (with a small spinner while it is still counting) and asks before sending as before. If the count can’t be checked, a short message with a Retry button shows.', 'fix', ['r1-lb-send-sms']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Office phone connected (Reliable PBX)',
    items: [
      // Oct 20 client: connect the office phone system (Reliable PBX) to the app. OFF until the office connects it.
      ['Office', 'The office phone system (Reliable PBX) can now be connected to the app. It is OFF until the office connects it.', 'Settings → ☎️ Office phone (admins). Paste the Reliable PBX client ID and client secret, press Test connection, pick the office number calls come from and the dispatch extension (the one shared dispatch phone), then press Subscribe webhooks. Until that is done nothing changes: Call buttons open your own phone, as today.', 'new', ['r1-pbx-settings']],
      ['Office', 'See who is calling: a pop-up in the corner of every office screen with the caller’s name and their pickup today.', 'When the office phone rings, the portal shows for 30 seconds “📞 Moshe Klein #20 calling (ext 101)” with their pickup today (store, time, how it’s going) — for a store, today’s pickup and its driver — and Open profile / Open pickup buttons. A number we don’t know shows “Unknown caller” with Add as driver / Add as store. Only after the office phone is connected.', 'new', ['r1-pbx-popup']],
      ['Office', 'Missed calls and voicemails come in as alerts (the bell) with a Call back button.', '“Missed call from Moshe Klein #20 — Call back”. A voicemail alert has a ▶ Listen button when the phone system sends the recording. Call back rings the dispatch phone (or opens your own phone if the dispatch phone isn’t set).', 'new', ['r1-pbx-bell']],
      ['Office', 'Every call to the office phone is written in the driver’s or store’s call log.', 'Who called, “answered at the dispatch line” (with who was on the dispatcher shift then, when there is one) and for how long — or that it was missed or left a voicemail — in the same call log as On call now and Call the driver. Texts sent to the office phone number are also noted there; texting drivers stays the same as before.', 'new', ['r1-pbx-calllog']],
      ['Office', '📞 Call buttons can ring the dispatch phone first, then call the person from the office number.', 'Once the dispatch extension is set (Settings → Office phone), pressing a 📞 Call button or a phone number in the office portal — by anyone in the office — shows “Ringing the dispatch phone…”; pick it up and it calls the driver or store. The call is logged like today. Not set = your own phone, as before. If the connection or the call events stop working, admins get one alert a day.', 'new', ['r1-pbx-ringing']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Steady pickup texted by mistake',
    items: [
      // Oct 20 client (Hive Deli): texted at 12 though the steady driver had it; "someone beat you" yet still listed as open.
      ['Texts', 'A pickup that already has its steady driver is no longer texted out or listed as open.', 'On Oct 20 the Hive Deli pickup was texted to drivers and still showed in PICKUPS, though its steady driver had it, and everyone who replied got "Someone just beat you to it". The texts and the take-it reply counted drivers in two different ways; now every text, list and reply uses one rule, and the double driver entry that caused it is cleaned up. If the steady driver gives the pickup back, it is still texted to other drivers as before.', 'fix', ['r1-lb-steady-covered']],
      // Oct 20 client: pickup chat goes only to the office.
      ['Drivers', 'Pickup chat messages from a driver now go only to the office — not to other drivers or the store.', 'Before, a message a driver wrote in a pickup\'s chat in the app went to every other driver on that pickup (and the store), even by text — and a driver who had given the pickup back still got them. Now a driver\'s or store\'s message goes only to the office; drivers and stores see only their own messages and the office\'s replies. Office messages still reach the drivers on the pickup.', 'change', ['r1-driver-chat']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Kiosk keypad presses better',
    items: [
      // Oct 19 client: "it's hard to click the sign in … the buttons don't press"
      ['Kiosk', 'The kiosk number keys now react the moment a finger touches them.', 'Before, a key only counted when the finger lifted without moving, so slow, heavy or slightly sliding presses were lost. Now the number counts right away, the key flashes green (and buzzes on tablets that can), and a long press no longer opens a menu or zooms. The same goes for the office PIN pads on the kiosk.', 'fix', ['r1-kiosk-keypad']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Automatic phone calls',
    items: [
      // Oct 19 client: switch on the automatic calls and make them reliable.
      ['Office', 'Automatic phone calls for pickups nobody takes. They are OFF until the office connects Twilio and turns them on.', 'When a pickup was texted and still has no driver after a few minutes, the site can phone drivers: it reads the pickup and says "Press 1 to take it". Pressing 1 takes the pickup, just like answering the text, and the driver gets the usual details text. Nothing is called until an admin connects Twilio and presses On in Settings → 📞 Phone calls.', 'new', ['r1-voice-off']],
      ['Drivers', 'Only drivers who are on call right now get a call, and drivers who chose "Please don\'t call" are never called.', 'A driver is called only inside the hours they gave for "When can we call you?", and only if they also get the pickup texts now (not paused, away, in quiet hours, or STOP). Drivers who never answered are not called. Drivers who usually do that store are called first, nobody is called twice for the same pickup, and the calls stop the moment the pickup is covered. Never on Shabbos or Yom Tov.', 'new', ['r1-voice-who']],
      ['Office', 'Admins connect Twilio from the site: Settings → 📞 Phone calls.', 'Paste the Account SID, the Auth Token and the Twilio phone number, press Test connection, then Save. The Auth Token is saved locked and never shown again. "Test call to my phone" calls you with a sample pickup message so you can hear how it sounds.', 'new', ['r1-voice-connect']],
      ['Office', 'The office chooses how the calls work, and sees how they went.', 'In the same box: how long to wait after the text, how many drivers per round, minutes between rounds, the most calls for one pickup, and the calling hours. It shows "Last 7 days: calls, answered, pickups taken by phone". Every call and how it went (answered, pressed 1, voicemail, no answer, failed) is in the driver\'s call log, on the pickup under "Who got the text", and in the weekly check-up.', 'new', ['r1-voice-settings']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Donation email from the site',
    items: [
      // Oct 18 client: "Do you have a way that I can log on to it from the site?"
      ['Office', 'Admins can now connect the food-donation mailbox themselves: Food Donations → ⚙️ Email connection.', 'Food Donations is back in the menu for admins. Type the email address and a Google app password (not the normal password), press Test connection to check it, then Save. New donation emails show up within a minute; Disconnect stops it. The password is saved locked and is never shown again.', 'new', ['r1-donations-conn']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Application: no automatic "No"',
    items: [
      // Oct 18 client (Yakov): "filling out automatic … this is happening by everyone"
      ['Office', 'Applications no longer show "No" for dispatching or center help when the person never answered.', 'Before, every application showed "I would like to help with dispatching: No" and the same for the center, even for people who were never asked. Now it says "Not answered" unless they actually signed up for it.', 'fix', ['r1-application']],
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Weekly check-up and speed alerts',
    items: [
      ['Office', 'Reports → "Check-up" lists data problems to fix, made by itself every Sunday at 10 AM.', 'It lists drivers whose phone can\'t get texts (a wrong number, a landline, texts failing), Default group drivers who got no pickup texts in 2 weeks and why, drivers who texted STOP but still get tried, stores with no address or map spot or an odd name, and problem reports open over 3 days. Each line has a button to open the driver, store or report and fix it. Admins get one bell alert and the office gets a short text with the counts; press "Run now" any time. The check-up only looks, it never changes anything.', 'new', ['r1-checkup-weekly']], // Oct 16 client (idea 9)
      ['Office', 'The app now watches its own speed and tells admins once a day if screens were slow.', 'When a screen takes more than 3 seconds to show, the app quietly tells the server. If that happens 10 times in an hour, or the day had slow screens, admins get one bell alert like "Speed: Live Board was slow 12 times today". Reports → Check-up → Speed shows the last 24 hours: which screens were slow and the slowest server calls.', 'new', ['r1-alert-speed', 'r1-checkup-speed']], // Oct 16 client (idea 7)
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Sleeping stores and call the driver',
    items: [
      ['Stores', 'Suppliers → "😴 Sleeping stores" lists stores that gave before but not lately, so someone can call them.', 'It shows stores with 2 or more pickups in the last 6 months but none in the last 30 days (you can pick 60 or 90), and stores whose steady pickup is paused. Each one shows the last pickup, how many pickups it had, its usual days and the contact with a phone you can tap. Tap "📞 Called" to write down how it went (No answer, Will donate again, Closed or Not now), or "Hide for 30 days".', 'new', ['r1-sleeping-stores']], // Oct 16 client (idea 5)
      ['Office', 'Call a driver in one tap from a pickup card or the pickup page, and the call is written down for you.', 'Every driver on a pickup has a "📞 Call" button that opens the phone with their best number to call. The call is saved in the driver\'s call log and in On call now, and you can tap how it went (Answered, No answer or Left message). The card then shows "Called 2:14 PM — No answer" under the driver.', 'new', ['r1-lb-call-driver']], // Oct 16 client (idea 8)
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Tidy store names',
    items: [
      ['Stores', 'Suppliers → "✨ Tidy store names" suggests a full, professional name for each store.', 'It checks each store with Google and offers the name Google lists for the same place (it shows Google\'s address and phone so you can confirm), or a clean-up of spacing and capitals, with an address moved out of the name into the address box. You can edit any name, untick it, or tick "Keep as is" so it isn\'t suggested again. Only the ticked stores are renamed; their pickups and history stay linked. Test or junk names are listed apart.', 'new', ['r1-tidy-names']], // Oct 16 client
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Text the person who reported',
    items: [
      ['Office', 'Text the person who sent a problem report or comment, copy it all in one click, and a new "Bug reports" tab in Tasks & follow-ups.', 'Open a report (Tasks & follow-ups → Bug reports, or Problem reports) and you see who sent it and their phone, with "💬 Text them" (a ready text you can change, then Send) and "📋 Copy for Claude" (copies everything about it: what they wrote, the page, the device, the picture link and the history). The text is saved in the task history, and other tasks have "📋 Copy for Claude" too. Reports now have their own "Bug reports" tab with a count of open ones, so they no longer show twice in the general task list.', 'new', ['r1-bug-text-them']], // Oct 16 client
    ],
  },
  {
    liveAt: '2026-10-21T07:36',
    title: 'Who got the text: clearer before the first text',
    items: [
      // Oct 16 client: "Would get it now" was listed under "Who wouldn't get it now"
      ['Office', 'Before a pickup is texted, "Would get it now" has its own section instead of sitting inside "Who wouldn\'t get it now".', 'When a pickup has not been texted yet, the popup now shows two parts: "Would get it now" (green) and "Who wouldn\'t get it now" with the reasons. Before, the people who would get it were listed inside the "wouldn\'t" section, which was confusing.', 'fix', ['r1-who-got-text']],
    ],
  },
  {
    liveAt: '2026-10-16T02:46',
    title: 'Faster office portal',
    items: [
      ['Office', 'The office portal is faster: the Live Board, Driver messages and the driver profile load quicker.', 'The Live Board list now comes back from the server about 4 times faster, Driver messages about 40% faster, and a driver\'s texts on the driver profile almost at once. When many things change at the same moment, the Live Board refreshes once instead of many times in a row. The map program now loads only when you open the Coverage map.', 'change', ['r1-checkup-speed-fast']], // Oct 16 client: speed
    ],
  },
  {
    liveAt: '2026-10-16T02:46',
    title: 'Change history',
    items: [
      ['Office', 'Driver profile → "Change history": every change to a driver\'s settings and profile, who did it, from where, and what changed.', 'Open a driver and tap the "Change history" tab. Each line shows the date and time, who did it (the driver in the app, the office person by name, a STOP/START text, or the system) and what changed in plain words, like "Phone calls: Don\'t call → Any time" or "Pause: Off → Until turned back on". Older changes from before today show too, where they were saved. Under Pause and On call there is now a "Last changed by … · when" line.', 'new', ['r1-change-history']], // Oct 16 client
    ],
  },
  {
    liveAt: '2026-10-16T02:46',
    title: 'Problem reports',
    items: [
      // Oct 16 client: thank-you text with the case number
      ['Office', 'Right after someone sends a problem report, they get a thank-you text with their case number.', 'The text says: "Hi Moshe, thanks for your feedback! Your case number is #12. This helps us make a better experience. Our developers have been notified and we\'ll look into this shortly. — The Zeh L\'Zeh team". It goes to the phone number they typed in the report (not on Shabbos or Yom Tov).', 'new', ['r1-text-bug-thanks']],
      // Oct 16 client: bug tracking tool — phone required, simple list, "Tell them it's fixed"
      ['Office', 'Report a problem now asks for your phone number.', 'The form fills in your phone number by itself if we have it. It must be 10 digits. We use it to text you when the problem is fixed.', 'change', ['r1-bug-form']],
      ['Office', 'Problem reports is now a simple list: one line per report.', 'Each line shows the number, who sent it and their phone, a short line of what happened, when, and New or Fixed. Tap a line to see everything: the full text, the picture and the page. Device and technical details are under "More details".', 'change', ['r1-bug-list']],
      ['Office', 'Mark fixed now lets you text the person that it is fixed.', 'When you press Mark fixed, a small box opens with a ready text, like "Hi Moshe, thanks for reporting the problem (#12: …). It\'s fixed now". You can change the words, then press Send text or Skip text. The report shows who got the text and when.', 'new', ['r1-bug-fixed-box']],
      ['Office', 'The person who reported it gets a notice in the app when it is fixed.', 'They see it in the bell and get a phone notification, even if you skip the text. The admins still get the bell, a phone notification and a text for every new report (problems and comments), with who sent it and a short summary.', 'new', ['r1-alert-bug-fixed']],
    ],
  },
  {
    liveAt: '2026-10-16T02:46',
    title: 'Center help list',
    items: [
      // Oct 16 client: "For the center help, can you make the calendar view as well? Make it really the same as the dispatcher ... We can edit the schedules and create templates."
      ['Office', 'Center Help has a week calendar now, the same as Shifts.', 'Under the people list, switch between Calendar and List. The calendar shows the week like Shifts → Calendar, and a shift that still needs people is marked "OPEN — needs center help" or "+ needs 2 more". Tap a shift to edit or cancel it. Use + on a day or "New shift" to add one, weekly or one-time.', 'new', ['r1-ch-calendar']],
      ['Office', 'Center Help has a Weekly template, like the dispatcher one.', 'Click "Weekly template" to see the regular week at the center. Tap a box to change the task, the times, how many people are needed, the notes and who comes every week. "+ Add" adds a shift to that day and "Remove this shift" stops it. Save asks from which date the change starts; past days never change.', 'new', ['r1-ch-template']],
      ['Office', 'Put people on a center help shift from the "willing to help" list, typed names too.', 'When you edit a day or a weekly shift, "Add a person" shows the people willing to help in the center first, including names you typed, and you can search all drivers below. Tap the x next to a name to take them off. Drivers can still sign up by themselves in the app.', 'new', ['r1-ch-assign']],
      ['Office', 'Weekly center help shifts now show up on the calendar.', 'The weekly center help schedule was not being turned into days, so the calendar stayed empty and drivers had nothing to sign up for. It now fills in the next 6 weeks automatically.', 'fix', ['r1-ch-listview']],
      // Oct 16 client: New pickup - picking a store from the Supplier list filled only the name
      ['Office', 'New pickup: picking a store now fills its address too.', 'When a saved store has no address on file but its name has one (like "Stamford Yeshiva - 51 Carlton Rd"), the Pickup Address is now filled with "51 Carlton Rd". You can also pick a store with the arrow keys and Enter. Anything you typed yourself is not changed.', 'fix', ['r1-newpickup-store']],
      // Oct 16 client: On call now closed by default
      ['Office', 'Live Board: "On call now (4)" is closed by default. Tap it to see who is on call.', 'The On call now box on the Live Board now shows only the title and how many drivers are on call. Tap it to open the list with their phone numbers and the "I called" buttons, and tap again to close it.', 'change', ['r1-lb-oncall-closed']],
      // Oct 15 client (Yakov): "a place to add names of people who say they're willing to do in Center, same as by dispatcher"
      ['Office', 'Center Help has a new list: people willing to help in the center.', 'At the top of Center Help, click "+ Add person". Pick a driver from the list, or type a name (and phone if you have it) for someone who is not a driver. You can add notes, edit them, or remove a person. It works like the Dispatcher roster on Shifts.', 'new', ['r1-ch-list']],
      // Oct 15: on-call fix (5e2aa90 API, 2c24396 FE) — on call all day = "Any time"; hours ending 24:00 = "until midnight"
      ['Office', 'On call now: drivers who said "call any time" show "Any time" instead of "until 12:00 PM".', 'Drivers who answered "Anytime" are on call all day, which the list wrongly showed as "until 12:00 PM". It now says "Any time" (and hours that end at midnight say "until midnight").', 'fix', ['r1-lb-oncall-anytime']],
    ],
  },
  {
    liveAt: '2026-10-16T02:46',
    title: 'Small texting fixes',
    items: [
      // Oct 14 client: "any number can write PICKUPS, not only members — big issue"
      ['Texts', 'Only our drivers get the pickup list by text. Other numbers asking PICKUPS or "<number> INFO" get a short note instead.', 'Before, anyone who texted PICKUPS to our number got the list of open pickups with addresses. Now the list and pickup details go only to our drivers (and dispatchers). A number we don\'t know, an outside helper, or someone marked do not contact / alumni / archived gets: "This number is for Zeh L\'Zeh volunteer drivers. If you drive with us and this is a new number, please ask the office to add it." The office sees a note in Driver messages.', 'fix', ['r2-text-pickups-not-member']],
      // Oct 14 client: "What does that mean?" (Status group in Who got the text)
      ['Office', 'Who got the text: people skipped because of their status now show which status (do not contact, alumni or archived).', 'In "Who didn\'t get it", the "Status" group lists people who never get texts because of the status on their profile. Each name now shows which status it is, for example "(do not contact)". To text them again, change the status on their profile.', 'change', ['r2-who-got-status']],
    ],
  },
  {
    liveAt: '2026-10-14T23:09',
    title: 'Driver text fixes',
    items: [
      // Oct 14 client (driver #118): his unit number "118" got "Someone just beat you to All Fresh"
      ['Texts', 'Texting an old pickup number no longer says "Someone just beat you" with an old store.', 'A driver texted "118" (his own driver number) and got "Someone just beat you to All Fresh Supermarket", though there was no All Fresh pickup that day. Pickup numbers are never reused, so 118 still belonged to a pickup from August. Now a number only counts for a pickup from today or the last few hours. Any other number gets "Sorry, 118 isn\'t an open pickup number" with what is open now, and a driver who texts his own driver number gets "Thanks! You\'re on the list…". Numbers of finished or past pickups are closed every 10 minutes.', 'fix', ['r2-text-old-pickup-number']],
      // Oct 14 client: profile popup texts were one-sided
      ['Office', 'The driver popup\'s "Texts with" now shows the whole conversation, both sides.', 'Before, it showed only texts the office typed, so you couldn\'t see what the driver sent (like "118" or "pickups") or our automatic answers. Now it shows the same texts as Driver messages → Texts, from all of his numbers, including an older number if the office changed it. Each text says who sent it: him, or Us (and "automatic" for texts the system sent).', 'fix', ['r2-popup-texts-both-sides']],
      ['Office', 'Pickup history in the driver popup no longer lists pickups another driver did.', 'When a steady pickup\'s driver was changed, the old driver was taken off but his sign-up stayed, so the pickup still showed in his history (and could hold a spot). Now he is fully taken off, and old cases no longer show in his history.', 'fix', ['r2-popup-pickup-history']],
      // Oct 14 client: phone saved as "+8452933973" -> TextDrip "invalid number"
      ['Texts', 'Phone numbers saved with a "+" but no country code now get texts.', 'A number saved like +8452933973 (a plus sign but no 1) was sent to the texting service as is, and it said "invalid number", so the driver got no pickup texts. These numbers now go out as US numbers (+1 845-293-3973), and new ones are saved without the stray "+".', 'fix', ['r2-text-plus-number-fixed']],
    ],
  },
  {
    liveAt: '2026-10-14T23:09',
    title: 'Store / donor CANCEL',
    items: [
      // Oct 14 client: "do it automatic, but with a notification for the dispatcher to call the driver"
      ['Stores', 'A store or donor CANCEL reply now cancels the pickup automatically, texts the driver kindly, and tells the dispatcher to call him.', 'When a store or donor answers CANCEL to "A driver accepted your pickup… reply CANCEL", that day\'s pickup is cancelled right away (never the steady pickup, and it is not sent out to other drivers). The driver gets an app alert and a warm text: "Sorry, Hive just let us know the food isn\'t needed anymore, so the 4:00 PM pickup is cancelled. Thank you so much for heading out for it, it really means a lot. The office will give you a call." The store gets "Thanks — the pickup is cancelled and the driver has been told." The dispatcher gets an alert "Call Moshe: Hive cancelled" with the driver\'s phone, to make sure he got the message; it stays until dismissed. If the food was already picked up nothing is cancelled and the office is alerted as before; a second CANCEL does nothing.', 'change', ['r2-text-store-cancel', 'r2-text-store-cancel-driver']],
    ],
  },
  {
    liveAt: '2026-10-14T21:24',
    title: 'Text results per person',
    items: [
      // Oct 14 client: TextDrip one-by-one texts — results per person, reasons, resend to failed
      ['Texts', 'Text results are recorded per person — one failed number no longer marks everyone as failed.', 'Our texting service (TextDrip) sends each text one person at a time. Before, if even one number failed (for example a landline or a number on a do-not-text list), the whole send was marked failed: "Who got the text" said "Text failed" for everyone and the texts were missing from the drivers\' text threads, even though almost everyone got them. Now each person has their own result: "Text ✓" for the ones who got it and "Text failed (not a mobile number)" — with the reason — for the ones who didn\'t. Replies to drivers\' texts (INFO, PICKUPS, accepting a pickup…) are logged the same way, and replies that went out on WhatsApp now show in the text thread too. Texts are now sent a little slower and tried again if the texting service is busy, so fewer fail. Reports → SMS delivery has a new "Texts that failed" list with the reason for each person and a "Resend to failed" button (it asks first, and goes only to the people whose text failed). A send to many drivers now keeps going in the background instead of the page waiting.', 'fix', ['r2-sms-failed-resend']],
    ],
  },
  {
    liveAt: '2026-10-14T21:24',
    title: 'Simpler texting info',
    items: [
      // Oct 14 client (Yakov): wrong office number + office chat error
      ['Drivers', 'Office phone number fixed to (845) 363-5323, and office logins can open the office chat in the driver app.', 'The "Call the office" number in the app (Chat, sign-in, store screens) showed the wrong number (845) 587-5777. It is now (845) 363-5323. Also, someone signed in with an office login who opened Chat in the driver app saw "Can\'t reach the office chat right now". That is fixed.', 'fix', ['r2-drv-chat-office-number']],
      // Oct 14 client: "Show all auto there as well"
      ['Office', 'Driver messages → Texts now shows automated texts too (pickup texts, reminders, thank-yous).', 'Before, the Texts list hid threads that only had automated texts, so you only saw real conversations. Now everything shows by default. Untick "Show automated" at the top of the list to hide them again.', 'change', ['r2-text-show-automated']],
      // Oct 14 client: "The new texting info is very messy and hard to follow"
      ['Office', 'Simpler texting info: one short line on each card; the popup shows the last text first, details folded away.', 'Each pickup card now has one short line about texts: "📤 Texted 4× · last 8:29 PM to 55" (or "Not texted yet" / "Opens to drivers at 3:00 PM"). Tap it for "Who got the text": first the last text in plain words ("Last text: 8:29 PM — 55 got it · 9 didn\'t", plus how many failed), then when the next text goes out. "Who got it", "Who didn\'t get it" (grouped by reason, failed ones first) and "Earlier texts" are folded closed — tap to open. Names still open the driver\'s profile, and WhatsApp ✓ / failed tags are still shown. "More details" at the bottom shows the full view from before.', 'change', ['r2-card-text-chip', 'r2-texting-simple-popup']],
    ],
  },
  {
    liveAt: '2026-10-14T18:44',
    title: 'Second phone for texts',
    items: [
      // Oct 14 client: the call question no longer says "Please don't call" for people who never answered
      ['Drivers', 'Application no longer shows "Please don\'t call" for people who never answered — it says "Not answered".', '"When can we call you if a pickup needs a driver?" used to show "Please don\'t call" for every volunteer who never answered it, because having no call hours looked the same as choosing not to be called. Now the app remembers the actual answer: My application, the office driver profile ("Call: not answered") and the New sign-ups panel say "Not answered" unless the person really picked "Please don\'t call". In Settings → Phone calls nothing is picked yet for them, with "Not answered yet." Who gets called did not change — with no call hours, nobody calls them.', 'fix', ['r2-drv-call-not-answered']],
      // Oct 14 client: more than one phone number — which gets texts, which is best to call
      ['Drivers', 'Drivers can add up to 3 phone numbers and pick which one gets texts and which one we should call.', 'In the driver app (My profile) and on the sign-up form / "Update my answers" there is now a list of phone numbers: tap "+ Add another number" (up to 3) and give each one a label (Cell / Home / Work) if you like. With two or more numbers you pick "Texts go to" and "Best number to call" — they can be the same number. All automatic texts and WhatsApp messages (new pickups, reminders, "you got it", the food check, the app invite…) go to the texting number; phone calls go to the call number. A text back from ANY of the numbers (a code, PICKUPS, DONE, CANCEL, STOP…) is recognised as the same driver. With one number nothing changes.', 'new', ['r2-drv-profile-phones']],
      ['Office', 'Driver profile: phone list with "Texts go to" and "Best number to call".', 'Edit a driver → "Phone numbers": add up to 3 numbers with labels and choose where texts go and which number to call. The Sign-up info tab shows "📞 845-… · 💬 Texts to 845-…" when they differ. "Who got the text" and "Who gets texts" show which number the text went to (last 4 digits) for drivers with more than one number. A driver\'s text conversation shows the messages from all of his numbers together, each marked with the number, and a reply goes to his texting number.', 'new', ['r2-office-driver-phones']],
    ],
  },
  {
    liveAt: '2026-10-14T18:44',
    title: 'Driver profile: clear load errors',
    items: [
      // Oct 14 client: office-only pickup notes never sent to drivers or stores
      ['Drivers', 'Office-only notes on a pickup are never sent to drivers\' phones.', 'The "Internal office notes — Admin only" box on a pickup was still sent to the driver app with the open list, Your pickups and the pickup page (and to the store app with its pickups), even though the screens didn\'t show it. Now the app never gets it at all. Drivers still see everything they need: the food, how much, the instructions, the contact and the store\'s photo. The office sees the notes as before.', 'fix', ['r2-drv-pickup-page-no-office-notes']],
      // Oct 14 client: delivery privacy
      ['Texts', 'Deliveries: before a driver takes it, they only see the street — the family\'s address, phone and notes come after they take it.', 'Before, anyone who texted "435 INFO" saw the family\'s full address and phone (from the delivery\'s contact and instructions). Now, until a driver takes a delivery, the texts (new pickup, hourly list, "Also still open", PICKUPS, INFO, the 90-minute alert and the WhatsApp copies) and the app (open list, pickup page, map) show only the street and town, like "to a family on Viola Rd, Monsey" — no house number, no phone, no notes and no instructions ("Details sent after you take it"). The driver who takes it gets the full address, the family\'s phone, the family notes and the instructions in the "You are now assigned" text and in the app. The office still sees everything. Store pickups are unchanged.', 'fix', ['r2-drv-delivery-street-only']],
      ['Office', 'Delivery form: the phone and instructions boxes say they are shown only after a driver takes it.', 'When "Delivery" is picked, Contact Phone is called "Family\'s phone (shown only after they take it)" and Instructions is called "Notes for the driver (shown only after they take it)". Under the family picker: "Drivers only see the street until they take it."', 'change', ['r2-form-delivery-labels-1', 'r2-form-delivery-labels-2']],
      // Oct 14 client: driver Profile load errors
      ['Drivers', 'Profile no longer says "not linked" when it just couldn\'t load — it says what went wrong, with Try again.', 'Before, My profile said "No volunteer profile linked to this account" for ANY problem — no signal, an internet filter, a server error — so a driver whose login is fine thought it was broken. Now it says the real reason ("Can\'t connect — check your signal", the internet-filter message, or "Couldn\'t load your profile — …") with a Try again button. Only when the login really has no driver record does it say "Your login isn\'t connected to your volunteer profile yet. Please call the office." Settings, My application, Home and Pickups show the same clear reasons.', 'fix', ['r2-drv-profile-load-error']],
    ],
  },
  {
    liveAt: '2026-10-14T13:02',
    title: 'Form submitted by, extra contacts, quiet-time days, no double reminder',
    items: [
      // Oct 14 client: who cancelled
      ['Office', 'Cancelled pickups say who cancelled and when (office person, store, driver or automatic).', 'Under the grey "Cancelled" tag (Pickups list, History and the Live Board) is a small line like "by Chaya · Oct 14, 2:14 PM", "by Hive (app)", "by the store (text)" or "auto (expired)", plus the reason if there is one. The pickup page says the same. Pickups cancelled before today may show only the time, because who did it was not saved then.', 'new', ['r2-cancelled-by-who']],
      // Oct 14 client: WhatsApp
      ['Texts', 'A driver who chose WhatsApp now really gets the pickup messages — on WhatsApp, or a text if WhatsApp can\'t be used.', 'Before, a driver who picked "WhatsApp" (in the app Settings or by the office) got no pickup text AND no WhatsApp unless they had already messaged our WhatsApp number — so they got nothing. Now choosing WhatsApp counts as their OK for WhatsApp. If we can\'t reach them on WhatsApp (no phone, the WhatsApp phone isn\'t picking up messages, or their last WhatsApp failed), they get the same message as a text instead. If the WhatsApp phone reports a send failed, a WhatsApp-only driver gets it as a text within minutes. This covers the new-pickup text, the hourly list, the catch-up after quiet hours, the office "Send" button, steady "not covered" texts and the 90-minute alert.', 'fix', ['r2-who-got-whatsapp-tags']],
      ['Texts', '"Who got the text" shows what each driver actually got: Text ✓, WhatsApp ✓, WhatsApp queued, or WhatsApp failed → texted.', 'Open "Show names" in the popup: next to each name is what really went out for that send, from the real logs (the text log and the WhatsApp phone\'s queue), and a count line on top (e.g. "Text ✓ 40 · WhatsApp ✓ 2"). Older sends: a WhatsApp-only driver shows whether any WhatsApp went out to them then.', 'new', ['r2-who-got-delivery']],
      ['Office', 'WhatsApp status for every driver, from real things only: "✓ Has WhatsApp — messaged us on WhatsApp", "✓ … our WhatsApp went through", "✗ WhatsApp failed", or "? Not confirmed yet".', 'Shown on the driver profile (Alerts & schedule → Pause & how we reach them), in Who gets texts (with a new "WhatsApp confirmed" filter) and in the "Who got the text" popup. It never uses what the driver chose in the app — only messages they sent us on WhatsApp and our WhatsApps that went through or failed. "Went through" means our WhatsApp phone sent it; WhatsApp can\'t open a chat with a number that has no WhatsApp.', 'new', ['r2-whatsapp-status']],
      ['Office', '"Send test WhatsApp" button on the driver profile (Alerts & schedule → Pause & how we reach them).', 'Sends one line ("this is a test WhatsApp from the office") through our WhatsApp phone and shows the result: queued, sent, or failed. Use it to check the Office profile or any driver. The result updates their WhatsApp status. On the test site it goes to the test phone.', 'new', ['r2-send-test-whatsapp']],
      // Oct 14 client: review follow-ups
      ['Office', 'No more blank board or "too many requests" when the office, the kiosk and tablets are busy at the same time.', 'They all share one internet address, and one office page load asks the server about 23 things, so the old limit (200 a minute per address) was easy to reach. Now each person who is logged in has their own limit (600 a minute). Not-logged-in forms keep their strict limits.', 'fix', ['r2-board-loaded']],
      ['Office', 'View-only logins can look at everything but can\'t change anything — for example the texting settings.', 'A "View-only" (Read-Only) login could still save some settings, like "Show pickups to drivers __ hours before". The server now refuses any change from a view-only login (they can still change their own password and settings). Texting settings are for admin / coordinator / staff only.', 'fix', ['r2-view-only-refused']],
      ['Texts', '"Who got the text" check shows the right reason for each driver.', 'The group check (who got a group text and why not) only looked at the first quiet time. It now uses the same rule as the texts themselves, so extra quiet times, quiet days, Away, WhatsApp only and outside helpers show the real reason.', 'fix', ['r2-who-got-reasons']],
      ['Office', 'After 8 PM, lists no longer jump to tomorrow.', 'Some lists used the server\'s date (world time, UTC), which turns to tomorrow at 8 PM New York time: "Used before" contacts on a new pickup, previous drivers of a pickup, a store\'s 30-day counts and a driver\'s last 90 days. They all use the New York date now.', 'fix', ['r2-form-used-before-9pm']],
      ['Office', 'On a phone, office buttons and icons are easier to tap (at least 40px).', 'Top bar icons, tabs, pickup card buttons, the (i), "+ Add another contact", − / + in "Drivers on this pickup", the × in the "Who got the text" and wait-time popups, the Clean up tick boxes and the Dispatchers buttons. Only on phone-size screens; the computer screen looks the same.', 'fix', ['r2-phone-office-buttons']],
      ['Office', 'App invite can\'t reset an office login.', 'Inviting a volunteer to the app could reset the password of an office (staff) login that used the same phone. It now never touches office logins.', 'fix', ['r2-invite-reset-only-driver']],
      ['Kiosk', 'The kiosk sign-in log is for the office only.', 'The list of kiosk sign-ins could be opened by any logged-in user. Now only office logins can see it.', 'fix', ['r2-kiosk-signins-office']],
      ['Drivers', 'A driver can\'t take a pickup that is already closed.', 'Taking a pickup in the app now checks that it is still open; a cancelled or finished pickup says it is closed instead of adding the driver.', 'fix', ['r2-drv-closed-pickup-msg']],
      ['Office', 'A cancelled pickup\'s page shows the right buttons.', 'No "Cancel pickup" button on a pickup that is already cancelled, and no "Tap Assign Driver" hint when that button is hidden.', 'fix', ['r2-cancelled-pickup-page']],
      ['Texts', 'Removed old unused texting code.', 'Nothing changes in who gets texts or when; old copies of rules that were no longer used (one of them was wrong) are gone so nobody fixes the wrong copy.', 'change'],
      ['Office', 'Pickup cards show who filled out the form (✍️ Secretary), and Reports shows how many forms each one filled.', 'Live Board and Pickups cards now have a small grey tag next to ONE-TIME / STEADY with who filled out the pickup form, e.g. "✍️ Secretary", "✍️ SR" or the typed name; pickups that came in by text show "✍️ By text". Store-app pickups keep their 📱 STORE APP badge. In Reports, under the tiles, a line reads "Forms filled by: Secretary 24 · SR 9 · … · Not recorded 40" for the dates and filters you picked. Tap a name to see only those pickups (same as the "Form by" filter); tap it again to see all.', 'new', ['r2-card-form-by-tags', 'r2-reports-forms-filled-by']], // Oct 14 client
      ['Office', 'What\'s new marks each update as ✨ New, 🐞 Fix or 🔄 Change, with filters.', 'Every update in What\'s new now has a small tag before it: ✨ New (something you could not do before), 🐞 Fix (something was broken or wrong and now works) or 🔄 Change (something now works differently: a rule, a time or the wording). Tap "✨ New", "🐞 Fixes" or "🔄 Changes" above the list to see only those; they work together with the area buttons and the search. The go-live table shows how many of each came in every update, and typing "fix" or "new" in the search finds them too.', 'new', ['r2-whats-new-kind-filters']], // Oct 14 client
      ['Office', 'Reports: "Typical wait until taken" tile — tap for each pickup\'s wait and a weekly chart (getting faster or slower).', 'New tile in the Reports tile row: the typical (middle) wait from when drivers were first texted about a pickup (or it was posted, if it was never texted) until a driver took it, e.g. "42 min", with the average and how many pickups under it. It follows the report\'s dates, store, driver and "Form by" filters. Tap it: a bar for each week (Sun–Sat, at least the last 12 weeks) with "↓ 12 min faster" or "↑ slower than the week before", and a list of every pickup (date, store, texted/posted time, taken at, by whom, wait) — Slowest first / Fastest first / Newest first, and Export CSV. Office-assigned pickups, test pickups, cancelled ones and waits over 7 days are not counted. It uses the very same rule as "Usually takes a pickup within…" on driver and store profiles, so the numbers agree.', 'new', ['r2-reports-typical-wait']], // Oct 14 client
      ['Texts', 'No more double text: a driver who just took a pickup doesn\'t also get the reminder for it.', 'Example: a driver texts a steady pickup\'s code at 8:19 for a 9:00 pickup and gets "Thank you! You are now assigned…" — the "reminder from Zeh L\'Zeh" text no longer follows 2 minutes later. A driver who took the pickup after the reminder time (or in the last 3 hours) is skipped and the reminder is marked done for that pickup. Drivers on the steady list from before still get the reminder as usual, and when the store\'s "food today?" YES was already texted to the drivers there is still no second reminder.', 'fix', ['r2-text-no-double-reminder']], // Oct 14 client
      ['Office', 'New pickup / Edit pickup and the public one-time form ask "Form submitted by" again (Secretary, Swift Dial, SR, YT, or Other + name) — required on a new pickup.', 'Brought back from Oct 12 (it was held back until the database change is approved). The office New pickup form remembers this computer\'s last choice; Edit shows the saved one and does not block old pickups that have none. The public one-time form requires it too (an old copy of the page still sends). Pickups a store sends from its app are marked "Store app", and a NEW text is marked "Text (NEW command, <name>)". The pickup page shows "Form by: …"; Reports has a "Form by" filter and the export a "Form submitted by" column (next to Source). Old installed phone apps still save without it.', 'new', ['r2-form-submitted-by']], // Oct 14 client
      ['Forms', '"+ Add another contact" on pickups: up to 3 more names / phones besides the main contact — office New/Edit pickup, the public one-time form, and the store app\'s "food ready" form.', 'Brought back from Oct 12. Some donors give two phone numbers: tap "+ Add another contact" under the contact phone (name optional + phone, × to remove). The main contact stays first, so the contact text and store texts work as before. Drivers see a Call button for each on the pickup page, the accept text and pickup info texts list them ("Contact: Shmuel — (845) 746-1927; also Yossi — …"), the office pickup page lists them as "Other contact", and "Used before" / "Use info from a previous pickup" fill them in too. Never shown on a delivery. In the store app\'s new form it is inside "Who should the driver ask for?". Works next to the office form\'s "Text the contact when a driver is on the way" box.', 'new', ['r2-form-extra-contacts']], // Oct 14 client
      ['Drivers', 'Each quiet time can have its own days: Every day / Weekdays (Mon–Thu) / Sun–Thu / Pick days — in the office\'s Alerts & schedule, the driver app Settings and the volunteer application.', 'Under every quiet time row there is now a day choice (Every day is the default, so nothing changes for anyone until a day is picked). Example: 9 AM – 5 PM on Mon–Thu means a driver gets pickup texts on Friday at 10 AM. A quiet time that crosses midnight counts for the night it starts: "11 PM – 7 AM · Thu" is quiet Thursday night into Friday 2 AM, but Friday 11 PM is not quiet (unless Friday is picked). Quiet times show as "11 PM – 7 AM · Mon–Thu". The same rule is used by the pickup texts, PICKUPS replies, uncovered alerts, steady and shift reminders, Who gets texts (now and by time), the office profile and the "Will go to N drivers" line on the cards, so they all agree. The catch-up text after quiet hours end only goes to drivers whose quiet time really ended that morning.', 'new', ['r2-drv-quiet-time-days']], // Oct 14 client
      ['Drivers', 'The "📱 Texting hours" line changes as you edit quiet times (before Save), and shows each day when the days differ: "Mon until 11 PM; Tue–Thu 7 AM – 11 PM; Fri from 7 AM; Sat, Sun all day".', 'In the driver app Settings and the office\'s Alerts & schedule tab, the texting-hours line now follows what is on screen (times, days, quiet days, away dates) with "Not saved yet" until Save; after Save it shows the server\'s own line again. It uses the very same rule as the server (the same code is in the app). When all quiet times are every day it reads as before ("7 AM – 10 PM").', 'change', ['r2-drv-texting-hours-live']], // Oct 14 client
      ['Office', 'Needs Sholo: these three come with database changes 081, 082 and 083 (only new columns, nothing removed). They go live once Sholo approves them.', '081 adds pickup_instances.submitted_by (text, empty allowed). 082 adds pickup_instances.extra_contacts (jsonb, empty allowed). 083 adds volunteer_quiet_windows.days and volunteers.sms_quiet_days (number, default 127 = every day). No existing data is changed.', 'change'], // Oct 14 client
    ],
  },
  {
    liveAt: '2026-10-14T01:57',
    title: 'Big update: Help & guide, driver Settings, store form & photos, shifts, food check, 2-hour rule, morning texts at 9', // Oct 14 client: was 'Steady button, reposted pickups'
    items: [
      ['Drivers', 'Pause has a new choice: "Until a date…" — pick the day messages start again ("Paused until Tue, Oct 20"); it ends by itself.', 'Pause (Home or Settings) now offers For today / For a week / Until a date… / Until I turn it back on. "Until a date…" opens a date box (tomorrow up to about 6 months ahead) and says "No pickup messages until Tue, Oct 20. They start again that day by themselves." While paused, Home and Settings show "⏸ Paused until Tue, Oct 20", what it means ("No pickup messages until Tue, Oct 20. You can still open the app and take pickups.") and a big "Resume now" button. It is saved like "For a week" (away dates), so nothing new is stored. Also fixed: "Until I turn it back on" did nothing before (the app sent a setting the server ignored); it now really pauses until Resume now.', 'new', ['r2-drv-pause-until-date', 'r2-drv-paused-until']], // Oct 14 client
      ['Drivers', 'Sign-up form and "Update my answers" ask plainly: "When can we call you if a pickup needs a driver?" — Anytime / Only at these times / Please don\'t call. The answer IS the call setting.', 'Anytime = the office may call any day, any hour (saved as all-day call hours for every day). Only at these times = the driver picks days and hours (incl. "Weekdays (Mon–Thu)" and "Every day"). Please don\'t call = no call hours. Saving the application changes the real call hours right away (the same ones the Live Board "On call now" list and the office use), and the driver\'s Settings → Phone calls shows the same three choices — change it in either place and the other shows it. The office driver profile (Alerts & schedule → On call) shows "Call: anytime", the hours, or "Don\'t call"; New sign-ups show the same.', 'change', ['r2-drv-call-question-form']], // Oct 14 client
      ['Drivers', 'Pickup page: the "Drivers" box now shows the driver after they took the pickup (it said "No driver yet" while the steps said "You took it / Picked up").', 'The box read only the sign-up list, which is cleared once a pickup is underway (and is empty when the office assigned the driver or the driver took it by text). It now lists the drivers on the pickup, plus anyone still signed up, once each.', 'fix', ['r2-drv-pickup-drivers-box']], // Oct 14 client
      ['Office', 'Driver profile → new "Application" tab: the same "My application" page the driver sees, with "Edit answers" for drivers who can\'t use the app.', 'Open a driver (Drivers → the name) → Application. It shows every answer from the sign-up form, incl. "When can we call you?". "Edit answers" opens the same form; saving changes the same things the driver\'s own save does (call hours, quiet hours, steady reminders, name, phone…), is written in the history under the office user\'s name, and does not send the office the "updated his application" message. The driver sees the change in the app at once.', 'new', ['r2-office-application-tab']], // Oct 14 client
      ['Office', 'Driver profile → Alerts & schedule: "Pause & how we reach them" — the same Pause choices (For today / A week / Until a date… / Until turned back on, Resume now) and the same Text / WhatsApp / Both / App only / Nothing choice as the driver app, with who set it.', 'For drivers who can\'t use the app. It uses the same settings as the driver\'s app, so a pause or a choice made here shows on the driver\'s Home and Settings, and the other way round. The box says who set it and when: "Paused until Tue, Oct 20 — set by the driver in the app on Oct 14" or "— set by the office (Chaya) on Oct 14" (the driver also sees when the office paused them). The "does NOT get the texts" box uses the same words ("Paused (away) until Tue, Oct 20", "Paused until turned back on"). An automatic test changes each choice from the office side and from the app side and checks that the text sender, Who gets texts, the driver Home and the office profile all agree.', 'new', ['r2-office-pause-reach']], // Oct 14 client
      // Oct 14 client
      ['Texts', 'First pickup text of the day is back at 9:00 AM; an 8:00 AM text goes out only when a pickup is before 9.', 'The first full pickup text of the day goes out at 9:00 AM again (it was moved to 8:00 AM on Oct 12 only because of an early 8:15 AM pickup). If a pickup is set for before 9:00 AM, an 8:00 AM text still goes out for it, and it lists only the pickups before 9 (and late ones). Pickups at 9:00 or later, like the Hive, go in the 9 AM text. Drivers whose quiet time ends overnight get the open pickups at about 9:05 AM (8:05 only when a pickup is before 9). "Pause all texts until tomorrow" now ends at 9 AM.', 'change', ['r2-board-next-text-9am']],
      ['Drivers', '"Invite to the app" on a driver\'s profile sends them the download links and a link to set their password.', 'Open a driver (Volunteers → the driver → Overview) and tap "📲 Invite to the app". If they have no app login yet, one is made for them (their login is their cell phone number); if they already have one, they get a link to set a new password. The ready message shows first and you can change it: "Hi Moshe! Get the Zeh L\'Zeh volunteer app to see and take pickups: Android: … iPhone: … Then set your password here: … Your login: …". Then Send by text (only to that driver; not if they texted STOP), Send by WhatsApp, or Copy. The link works for 7 days. The driver opens it, chooses a password and sees "You\'re all set" with buttons to get the app. The profile and Admin → App Usage show "Invite sent Oct 14 · not used yet" (or "used") with a Resend button. App Usage also has "Invite all with no login (N)": it lists the names first (untick anyone), then texts them one by one, skipping people who texted STOP or have no cell phone. The iPhone links (invites and the update pop-up) now go straight to the Zeh L\'Zeh app in the App Store.', 'new', ['r2-invite-to-app']], // Oct 14 client
      ['Stores', 'A photo a store adds shows to drivers on the pickup and to the office on the card and pickup page.', 'When a store adds a photo to its "food ready" post, drivers see a small 📷 picture on the pickup card and a "📷 Photo from the store" box on the pickup page (tap it to see it full screen, × to close). The office sees a small 📷 picture next to the food line on the Live Board card (tap = large) and the photo under Food on the pickup page. The store sees it in My pickups. Before, a post with a photo could fail to send (the photo was too big to save); now it is saved as a file. The driver\'s own drop-off photo no longer replaces the store\'s photo.', 'new', ['r2-store-photo-driver', 'r2-store-photo-office']], // Oct 14 client
      ['Office', 'New pickup / Edit pickup: "Text the contact when a driver is on the way" — a checkbox per pickup, with the phone and the exact text shown under it.', 'Under "Text drivers now" there is a new box. Ticked = when a driver accepts, the contact gets one text: "Zeh L\'Zeh: A driver accepted your pickup and will be there soon. If it\'s no longer needed, reply CANCEL. Thanks!" The grey line under the box shows the phone it goes to and that exact text. One-time pickups start UNTICKED for now (until we are ready). Store pickups start ticked only if that store\'s "driver on the way" switch is on; ticking it for a store that is off texts just this pickup, unticking it for a store that is on skips just this pickup. The office card and pickup page show "Contact will be texted when a driver accepts" while it is on.', 'new', ['r2-form-contact-on-the-way']], // Oct 14 client
      ['Texts', 'One-time donors are no longer texted automatically when a driver accepts — only when the office ticked the box. New wording, no driver name or time.', 'Before, every one-time donor got "<Driver> is coming for your food today at 4:00 PM…". Now the text is "Zeh L\'Zeh: A driver accepted your pickup and will be there soon. If it\'s no longer needed, reply CANCEL. Thanks!" and it goes only for pickups ticked on the office form. Pickups from the store app follow the store\'s switch as before; one-time pickups from the public form or a NEW text are not texted. A CANCEL reply still only alerts the dispatcher and the contact gets "Thanks — the dispatcher has been notified." Same hours as before (8 AM–10 PM donors, 8 AM–9 PM stores, never on Shabbos / Yom Tov or while texts are paused).', 'change', ['r2-text-donor-new-wording']], // Oct 14 client
      ['Stores', 'Simpler "food ready" form: tap the food type, kosher type, how many (counter), when, and a summary before sending.', 'Stores tap what\'s ready (🍲 Cooked, 🥖 Baked, 🥕 Fruit/Veg, 🥛 Dairy, 🍗 Meat, 🥫 Packaged, 🧃 Drinks, ➕ Other), optionally Fleishig / Milchig / Pareve and a photo, then how many with − / + and Trays / Boxes / Bags / Pans; the form shows "🚗 Fits in one car", "Car trunk full" or "🚐 Needs a van or 2 cars". New "How many drivers?" (1 / 2 / 3+, set to 2 for a van-size load) sets how many drivers the pickup needs. "When" is Now / In 1 hour / Later, with an optional "Must be gone by" time, and a line like "✓ 6 trays of cooked food (fleishig), ready now · 1 driver" shows above Send. Drivers see it as "Fleishig · Cooked — chicken & rice" and "About: 6 trays · fits in one car"; "Same as last time" fills all of it in.', 'change', ['r2-store-food-ready-form']], // Oct 14 client
      ['Office', 'Admin → Settings → "Store post form": change the store form\'s food types, units and kosher choices without code.', 'Add, remove, rename (with emoji) and reorder the food-type chips, the units (with how many fit in one car or a trunk) and the kosher choices, and turn the photo and kosher rows on or off. "Reset to standard" goes back to the built-in list. Stores see the change the next time they open the form.', 'new', ['r2-admin-store-post-form']], // Oct 14 client
      ['Drivers', 'Driver app: new Settings — choose how we reach you about pickups: Text, WhatsApp (new), Both (new), App only or Nothing.', 'Drivers open Settings from the ☰ menu, from My profile, or with "Change" on the Home screen. One screen in plain words: "How should we reach you about pickups?" (Text messages / WhatsApp / Both / App notifications only / Nothing), Pause (for today, a week, or until turned back on), quiet hours with the texting hours shown first, quiet days, away dates, the hours they are happy to be called (incl. Weekdays), steady pickup reminders on/off, "Allow text messages", and the text commands. WhatsApp and Both have a small "new" tag while WhatsApp is still being tested. These settings left My profile (it links to Settings).', 'new', ['r2-drv-settings-reach']], // Oct 14 client
      ['Texts', 'A driver who chooses WhatsApp gets pickup messages on WhatsApp instead of texts; Both = text + WhatsApp; Text = text only.', 'The choice in the driver\'s Settings now does what it says. WhatsApp: no pickup texts, the WhatsApp copy goes out (once we know the driver uses WhatsApp). Both: text and WhatsApp. Text messages: texts only (before, every texted driver who had used WhatsApp also got a WhatsApp copy). App only: just the app alert. Nothing: no pickup messages. Pause, away, quiet hours and quiet days work the same for WhatsApp as for texts. The office "Who gets texts" and "who got the text" lists show these drivers as "WhatsApp only". Messages about a pickup the driver already took still come by text.', 'new', ['r2-wgt-whatsapp-only']], // Oct 14 client
      ['Drivers', 'Home: the "Getting pickup texts" switch is now a short line with the real setting ("📩 Pickups by: Text · Quiet 10 PM–7 AM", "Paused until …"), with Pause and Change.', 'The old switch only showed on/off and was misleading. The Home screen now says how pickups reach the driver and their quiet hours, or "⏸ Paused until Thu, Oct 16" with Resume. Pause asks for how long (today / a week / until I turn it back on); Change opens Settings. Open now lists only pickups that are open to drivers (from 2 hours before their time), so the "Later & tomorrow" line is gone; the driver\'s own upcoming pickups stay under Coming up.', 'change', ['r2-drv-home-pickups-by']], // Oct 14 client
      ['Drivers', '"My application": drivers see their sign-up answers and can update them; the office is told what changed.', 'In the driver app (☰ menu, or My profile → My application) the driver sees every question from the volunteer sign-up form with their answers. "Update my answers" opens the same questions filled in. Saving updates their record (name, phone, email, address, quiet hours, steady reminders, call hours and all the answers — never status, groups or unit #), writes what changed in the history (audit log), and sends the office a "📝 Moshe updated his application (areas, vehicle size)" message like a new sign-up. Every question of the form is kept.', 'new', ['r2-drv-my-application']], // Oct 14 client
      ['Drivers', 'Map: short pin labels ("Now", "2 PM", "Wed"), pins close together become one bubble with a number, labels stay inside the map; tapping a pin shows that pickup in the list.', 'Map pins used to say "Wed 9:00 AM+14", overlapped and were cut off at the edges. Now each pin shows a short time, pins that would overlap are one round bubble with how many pickups are there (tap it to zoom in), and labels never go past the edge of the map. Tapping a pin scrolls to that pickup in the list under the map and lights it up, with Take this pickup right there.', 'change', ['r2-drv-map-pins']], // Oct 14 client
      ['Office', 'Comment on, or report a problem with, a single update here in What\'s new.', 'Open an update (tap it) and use "💬 Comment" or "🐞 Something\'s wrong with this". The Report a problem form opens with that update filled in; at the top you pick "Comment / idea" or "Problem" (a comment has no "How bad?"). It is saved in Tasks & follow-ups ("Comment on update: …" / "Problem with update: …") and admins get a bell alert (a problem also a phone alert). Admins see a 💬 count next to updates with open comments, and Problem reports now has a Type (Problem / Comment) with a filter.', 'new', ['r2-whats-new-comment-form']], // Oct 14 client
      ['Office', '"What\'s new" is in the ? menu for everyone, with a count of updates you haven\'t seen.', 'The ? button at the top now has "✨ What\'s new": the list of every update, newest first, with the day it went live. A small dot on the ? and "3 new" in the menu show updates you have not seen yet; opening What\'s new marks them seen, and the new ones get a "New" tag. Dispatchers see only updates that are already live; the Guide has a short "See what changed" part about it.', 'new', ['r2-help-menu-whats-new']], // Oct 14 client
      ['Texts', 'Drivers see a pickup only from 2 hours before its time (PICKUPS, texts, app). The office still sees everything.', 'A pickup is not in the drivers\' queue until 2 hours before its time: after midnight, PICKUPS no longer lists this afternoon\'s or tomorrow\'s pickups, and the texts\' "Also still open" lists, the app\'s Open list and map follow the same rule (late and reposted pickups stay open). A driver who tries to take one early is told "This pickup opens at 3:00 PM — we\'ll text you then"; the office card shows "Opens to drivers at 3:00 PM". Change the hours in Admin → Settings ("Show pickups to drivers __ hours before their time"); texting a pickup by hand (Send SMS) opens it right away.', 'change', ['r2-card-opens-to-drivers']], // Oct 14 client
      ['Office', 'App Usage: "Today" means today\'s date, platforms say iPhone app / Android app / Website, and drivers on the old Android app now show.', 'Admin → App Usage: "Today" now means the same calendar day (before, someone who opened the app at 7 PM yesterday showed as Today). The Platform column says "iPhone app", "Android app" or "Website". Drivers on the old Android app (1.0.17) were missing because that app never reported opening; their last use and version now come from their phone\'s notification sign-up, with "old app — please update" next to the version.', 'fix', ['r2-app-usage-platforms']], // Oct 14 client
      ['Drivers', 'Phone app 1.0.43 (coming to the stores): fits iPhones with a notch, and says when a newer app is in the store.', 'The new phone app version 1.0.43 is being sent to Google Play and the App Store. On iPhones with a notch, the top and bottom of the app no longer hide behind the notch or the home bar. The app now checks the live site\'s version, and when a newer app has been out for a few days it shows a bar "update it in the store". The app no longer keeps an old offline copy of its screens (that could show outdated screens).', 'change', ['r2-app-usage-old-version']], // Oct 14 client
      ['Drivers', 'Phone app: a popup asks to update when a new version is out (Later hides it for a day).', 'When a newer phone app is in the store, the app now shows a pop-up "New version available" when it opens, with Update now (goes to the store) and Later (hides it for 24 hours; the slim bar stays). If the app is more than 30 days behind, or the office sets a minimum version, the pop-up says the version is too old and has no Later. This is in the phone app 1.0.43 and later; the website is not changed.', 'new', ['r2-admin-app-versions']], // Oct 14 client
      ['Office', 'A volunteer who was removed can no longer see or take open pickups in the app.', 'If the office removed (deleted) a volunteer, their app login can no longer list open pickups or take one. They get a message to call the office.', 'fix', ['r2-drv-removed-call-office']], // Oct 14 client
      ['Texts', 'Food check: when the store says YES, the steady driver gets "Hive confirmed food today — your pickup is at 9:00 AM"; NO → "No pickup today"; no answer → nothing to the driver, the office is alerted.', null, 'new', ['r2-text-food-check-yes']], // Oct 14 client
      ['Office', 'Pickups → Steady: "New steady pickup" is now at the top right.', 'The "New steady pickup" button is now at the top right of Pickups → Steady, where it is easy to find. It opens the same steady pickup form as before.', 'change', ['r2-steady-new-button-top']],
      ['Texts', 'A reposted or late pickup says "now" to drivers instead of its old time.', 'When the office reposts a pickup, or a pickup is already late, the text to drivers no longer shows its old time — it says "now". This way drivers don\'t think the pickup is over when it still needs someone. The office still sees the real time on the pickup.', 'change', ['r2-text-repost-now']],
      ['Office', 'Reposted pickups show a "Reposted" tag with when, under today.', 'A pickup that was reposted gets a "Reposted" tag with the time it was reposted, under today\'s pickups. It helps the office see which pickups came back. It works on iPhones too.', 'new', ['r2-today-reposted-tag']],
      ['Office', 'Pickups a store sent through its app show a "📱 STORE APP" badge and "Submitted through the store app" on the pickup page.', 'When a store posts a pickup itself in the store app, the office card shows a "📱 STORE APP" badge, and the pickup page says "Submitted through the store app". So you know the store sent it, not the office.', 'new', ['r2-card-store-app-badge', 'r2-store-app-badge']],
      ['Office', 'Shifts can be seen as a week calendar (like Pickups → Calendar), with open shifts marked.', 'Dispatching shifts can be shown as a week calendar, like Pickups → Calendar. Shifts that still need a dispatcher are marked, so they are easy to fill.', 'new', ['r2-shifts-week-calendar']], // Oct 13 client
      ['Texts', 'A reopened pickup gets its text code back right away, so drivers can reply with the same number.', 'When a driver comes off a pickup and it needs a driver again, it gets back the same text number it had. Drivers who got the earlier text can still reply with that number. Before, the card showed no text code until the next text went out.', 'fix', ['r2-text-code-back']], // Oct 13 client
      ['Office', 'Kiosk drop-off messages list one pickup per line with short names and addresses.', 'The kiosk drop-off message now puts each pickup on its own line, with a short store name and address. It is quicker to read.', 'change', ['r2-text-kiosk-dropoff-lines']], // Oct 13 client
      ['Stores', 'Steady pickups can text the store "Do you have food today?" — YES sends it to drivers, NO cancels today, no answer alerts the office to call.', 'For steady pickups where the office turns it on, we text the store about 2 hours before: "Do you have food for pickup today? Reply YES or NO." The pickup waits for the answer. YES sends it to drivers, NO cancels today and tells the office, and no answer by 30 minutes before alerts the office to call. The "Needs confirmation" list shows the answer, with Send to drivers / Cancel today buttons.', 'new', ['r2-board-food-check-confirm']], // Oct 13 client
      ['Texts', 'One-time donors get "<driver> is coming for your food… reply CANCEL if no longer needed"; a CANCEL reply alerts the dispatcher (the pickup is not cancelled automatically).', 'When a driver takes a one-time pickup, the donor gets a text with the driver\'s first name and the time, and "If it\'s no longer needed, reply CANCEL." A CANCEL reply never cancels the pickup by itself: the dispatcher gets an alert to check, and the donor is told the dispatcher was notified. Stores get this text only if the office turned it on for that store.', 'new', ['r2-text-donor-cancel-alerts']], // Oct 13 client
      ['Office', 'On-call hours: pick "Weekdays (Mon–Thu)" or "Every day" instead of one day at a time.', 'When you set a driver\'s on-call hours, you can choose "Weekdays (Mon–Thu)" or "Every day" in one step, instead of setting each day by itself.', 'new', ['r2-oncall-weekdays']], // Oct 14 client
      ['Drivers', 'A pickup you gave back ("I can\'t make it") no longer stays under Your pickups, and you can take it again.', 'After a driver taps "I can\'t make it", that pickup leaves their "Your pickups" list. If they change their mind, they can take it again like any open pickup.', 'fix', ['r2-drv-open-list-take-again']], // Oct 14 client
      ['Drivers', 'The pickup page shows the store\'s note for this pickup, and Call uses the contact the store gave (same as the texts).', 'In the driver app, the pickup page shows the note the store wrote for this pickup. The Call button calls the contact the store gave — the same person as in our texts.', 'change', ['r2-drv-store-note-call']], // Oct 14 client
      ['Drivers', 'After "Picked up", the card button goes to the drop-off instead of back to the store.', 'Once a driver taps "Picked up", the button on the pickup card takes them to the drop-off, not back to the store.', 'fix', ['r2-drv-go-to-dropoff']], // Oct 14 client
      ['Drivers', 'No signal → a bar says so. Bigger back, menu and map buttons. Clearer messages when a pickup is already taken.', 'When the phone has no signal, a bar at the top of the driver app says so. The back, menu and map buttons are bigger, and the message is clearer when someone else already took a pickup.', 'change', ['r2-drv-no-signal-bar']], // Oct 14 client
      ['Stores', 'My pickups: a late or reposted pickup still being handled stays under Today (it said "No driver came").', 'In the store app, a pickup that is late or was reposted and is still being handled stays under Today. Before, it wrongly said "No driver came".', 'fix', ['r2-store-late-stays-today']], // Oct 14 client
      ['Stores', 'A steady pickup waiting for your YES / NO says so (it said "Looking for a driver").', 'In the store app, a steady pickup that is waiting for the store\'s YES or NO answer says so. Before, it said "Looking for a driver".', 'fix', ['r2-store-waiting-yes-no']], // Oct 14 client
      ['Office', 'Shifts: "Weekly template" to edit the regular schedule in one place, and "Clean up…" to remove duplicate, test and old shifts (you approve each).', 'Dispatching shifts have a "Weekly template": the regular weekly schedule in one place, so you change it once. "Clean up…" finds duplicate, test and old shifts; you look at each one and approve before it is removed.', 'new', ['r2-shifts-weekly-template', 'r2-shifts-clean-up']], // Oct 14 client
      ['Office', 'Cancelling a repeating shift asks: just this one, or this and all future ones.', 'When you cancel a shift that repeats every week, it asks if you mean just this one, or this one and all the ones after it.', 'new', ['r2-shifts-cancel-series']], // Oct 14 client
      ['Office', 'What\'s new items open for more detail; Code words list is complete; new "How texting works" page explains all the texting rules.', 'Tap an update on this page (the ones with a small arrow) to read more about it. Messaging → Driver messages → Code words now lists every word drivers, stores, donors and dispatchers can text us, with who can use each one. The new page Messaging → How texting works explains the texting rules in short points. Drivers see their text words in the app under Profile → Text commands.', 'new', ['r2-code-words', 'r2-how-texting-works']], // Oct 14 client
      ['Office', 'Help (?) button: a welcome tour and a guide to every part of the office portal; "Report a problem" sends a bug report to the admins.', null, 'new', ['r2-help-guide']], // Oct 14 client
      ['Office', 'The ? (Help) button shows a "NEW" badge until you open it once, so everyone notices it.', 'Each office user sees a small orange "NEW" badge and a soft glow on the ? button at the top, plus (on a computer) a short note "New: Help, guide & report a problem". Both go away for good once that person opens the ? menu. The welcome tour still opens once for each person, and its last step shows where the ? button is.', 'new', ['r2-help-new-badge']], // Oct 14 client
    ],
  },
  {
    liveAt: '2026-10-13T00:37',
    title: 'New pickups text 1 hour before',
    items: [
      ['Texts', 'A new pickup is texted at the top of the hour before its time (9:53 PM → 9:00 PM), or right away if that time has passed. Tick "Text drivers now" to send it immediately.', 'A new pickup is no longer texted the moment it is saved. It goes out at the top of the hour before its time — a 9:53 PM pickup is texted at 9:00 PM. If that time already passed, it goes right away. Tick "Text drivers now" to send it at once. Drivers\' own quiet hours, Shabbos and Pause still apply.', 'change', ['r2-guide-one-hour-rule']],
      ['Office', '"Use info from a previous pickup" also finds it by phone number or contact name.', 'On the New pickup form, "Use info from a previous pickup" now also searches by phone number or contact name, not only by store. Pick one to fill in the form, then change what you need.', 'new', ['r2-form-previous-found']],
      ['Office', '"+ Someone not on our list" in Drivers on this pickup: record an outside helper who covered a pickup. They never get our texts; one tap makes them a volunteer.', 'If someone who is not our volunteer covered a pickup (for example, the office phoned a friend), add them in the pickup\'s "Drivers on this pickup" with "+ Someone not on our list". The pickup counts as covered and reports show who did it. They never get our automatic texts. "Make a volunteer" turns them into a regular volunteer in one tap.', 'new', ['r2-assign-outside-helper']], // Oct 13 client
    ],
  },
  {
    liveAt: '2026-10-12T17:35',
    title: 'Each text, who got it',
    items: [
      ['Office', 'Tap a send time on a pickup to see who got that text, who didn\'t and why, and who is new this time.', 'A pickup shows each time it was texted. Tap a time to see who got that text, who did not and why (quiet hours, away, app only…), and who is new compared to the text before.', 'new', ['r2-who-got-per-send']],
    ],
  },
  {
    liveAt: '2026-10-12T16:33',
    title: 'Plainer pickup times',
    items: [
      ['Office', 'Pickup page in plain English: "Pickup time", "Must be picked up by", "Drivers can take it for 8 more days" with "1 hour more / 1 hour less" buttons.', 'The time rows on the pickup page are now in plain words: "Pickup time", "Must be picked up by", and how long drivers can still take it. Use "1 hour more" or "1 hour less" to change how long it stays open.', 'change', ['r2-pickup-plain-times']],
    ],
  },
  {
    liveAt: '2026-10-12T07:32',
    title: 'Texts start at 8 AM, dismiss alerts',
    items: [
      ['Texts', 'The first automatic pickup text of the day is now at 8:00 AM (was 9:00). Drivers\' own quiet hours still apply.', 'The office texting day now starts at 8:00 AM instead of 9:00 AM. The first hourly pickup text, and the catch-up text for drivers whose quiet time ended overnight, now come at 8 AM. Each driver\'s own quiet hours still come first.', 'change', ['r2-text-8am-early-pickup']],
      ['Office', 'Alerts have a Dismiss button (and Dismiss all); dismissed alerts clear for everyone in the office and from the tablet.', 'Office alerts (the bell and the pop-ups) have a Dismiss button and a Dismiss all button. A dismissed alert is gone for everyone in the office and on the tablet, so two people don\'t handle the same thing.', 'new', ['r2-alerts-dismiss']],
    ],
  },
  {
    liveAt: '2026-10-12T01:45',
    title: 'Re-adding a driver, text info on cards',
    items: [
      ['Office', 'Pickup cards say how many drivers the next text will reach and when, and how many times it was already sent.', 'Each pickup card shows how many drivers the next text will reach and when, for example "Will go to 23 drivers at 8:00 AM". It also shows how many times it was already texted, and when.', 'new', ['r2-popup-will-go-to']],
      ['Office', 'Drivers\' texting hours show first, quiet hours under them.', 'On a driver\'s profile, the hours they can get texts are shown first, with their quiet hours under them. It is easier to see when they can be reached.', 'change', ['r2-texting-hours-first']],
      ['Office', 'Adding back a driver who was taken off a pickup works now (it said "already changed by someone else").', 'If a driver was taken off a pickup and you add them back, it works now. Before, it showed an error saying someone else already changed the pickup.', 'fix', ['r2-driver-added-back']],
    ],
  },
  {
    liveAt: '2026-10-12T00:42',
    title: 'Who gets texts by time of day',
    items: [
      ['Office', 'Who gets texts shows who would get a text right now vs. quiet now, and a day chart: tap any time to see who gets it and who doesn\'t, and why.', 'Messaging → Who gets texts shows who would get a pickup text right now and who is quiet now. A chart of the day lets you tap any time to see who gets a text then, who does not, and why.', 'new', ['r2-wgt-now-and-chart']],
      ['Office', 'Who gets texts: a Quiet hours view (every quiet time, quiet day and away date; quiet times that cover most of the day are marked "check?") and an Inactive view (who made them inactive and when, last pickup, "Make active again"). The "turned off since Oct 9" part is gone.', 'Two more views in Who gets texts. Quiet hours lists every driver\'s quiet times, quiet days and away dates; a quiet time that covers most of the day is marked "check?" in case it is a mistake. Inactive lists who made a driver inactive and when, their last pickup, and a "Make active again" button.', 'new', ['r2-wgt-quiet-hours-view', 'r2-wgt-inactive-view']],
      ['Texts', '"Inactive" is now just a label for the office — inactive drivers in the Default text group keep getting pickup texts.', 'Marking a driver "Inactive" no longer stops their texts — it is only a note for the office. If they are in the Default text group, they still get pickup texts. To stop texts, take them out of the group or turn their texts off.', 'change', ['r2-wgt-inactive-still-texted']],
    ],
  },
  {
    liveAt: '2026-10-12T00:22',
    title: 'Long text conversations, alerts clean up',
    items: [
      ['Office', 'Taking a driver off a pickup texts the driver a confirmation and sends the pickup out again as new.', 'When the office takes a driver off a pickup, the driver gets a text saying they are off it. If the pickup still needs someone, it is texted again right away as a new pickup, so another driver can take it. The driver who came off is not texted about it.', 'change', ['r2-text-taken-off-pickup']],
      ['Office', 'Tap "36 drivers" on a pickup to see who got the text and why the others didn\'t (quiet hours, away, app only…).', 'On a pickup, tap the number of drivers it was texted to (for example "36 drivers") to see who got the text. Drivers who did not get it are listed with the reason, like quiet hours, away or app only.', 'new', ['r2-who-got-36-drivers-link']],
      ['Office', 'Messaging → Who gets texts: everyone on and off texts right now and why, incl. who turned texts off since Oct 9 — turn back on in one tap.', 'A new page, Messaging → Who gets texts, lists every driver whose texts are on or off right now, and why. It also listed who turned texts off since Oct 9, with one tap to turn them back on.', 'new', ['r2-wgt-list-why']],
      ['Office', 'Long text conversations now show the newest messages (they used to stop at an old date after 500). "Show all" loads the whole history.', 'A text conversation with many messages now opens on the newest ones. Before, it stopped at an old date after 500 messages. Tap "Show all" to load the whole history.', 'fix', ['r2-text-long-show-all']],
      ['Office', 'Alerts that are no longer needed (a driver took it, the text was answered) clear themselves from the bell and from the tablet\'s pop-ups.', 'Alerts that don\'t need you anymore go away by themselves — for example, when a driver took the pickup or someone in the office answered the text. They leave the bell and close on the tablet too.', 'new', ['r2-alerts-cleared-themselves']],
    ],
  },
  {
    liveAt: '2026-10-11T08:18',
    title: 'Faster app',
    items: [
      ['Office', 'Office opens much faster: it loads this week\'s pickups and anything still open, not 3 months of history. History and List load their own dates when you open them. All counts stay the same.', 'The office portal opens much faster. At first it loads only this week\'s pickups and anything still open, not three months of history. History and List load their own dates when you open them. Counts and reports stay the same.', 'change', ['r3-office-opens-fast']],
      ['Office', 'Pickups → History and List show 50 at a time, with "Show more" at the bottom (Export still includes everything).', 'Pickups → History and List show 50 pickups at a time. Tap "Show more" at the bottom for more. Export still includes everything.', 'change', ['r3-history-show-more']],
      ['Office', 'The pickup list refreshes on every change as before, and checks every minute instead of every 30 seconds.', 'The pickup list still updates right away when anything changes. The extra background check now runs every minute instead of every 30 seconds, which saves data.', 'change', ['r3-pickups-today-list']],
      ['Office', 'Store lists and store chats no longer download big store pictures each time; logos load on their own.', 'Store lists and store chats no longer download big store pictures every time. Logos load by themselves, so these screens open faster.', 'change', ['r3-store-chat-logos']],
      ['Drivers', 'The app downloads much less: replies are compressed, and screens like the office portal, map, sign-up forms and kiosk load only when opened.', 'The app uses less data. Replies from the server are compressed, and big screens (office portal, map, sign-up forms, kiosk) load only when someone opens them.', 'change', ['r3-driver-app-home']],
      ['Drivers', 'Filter-proof mode turns on by itself only on devices where an internet filter blocked something (and it tries again right away).', 'Some internet filters block parts of the app. Filter-proof mode now turns on by itself only on a device where a filter blocked something, and it tries again right away. Other devices work as usual.', 'change', ['r3-filter-proof-phone']],
    ],
  },
  {
    liveAt: '2026-10-11T08:18',
    title: 'Pickup contact choice',
    items: [
      ['Forms', 'The public form\'s store list shows only real, approved stores — no test or private entries.', 'The store list on the public forms shows only real stores we approved. Test entries and private ones are hidden.', 'change', ['r3-public-store-list']],
      ['Stores', 'Store app: posting a pickup suggests your past contacts and addresses, most used first.', 'When a store posts a pickup in its app, the form suggests the contacts and addresses it used before, most used first. Tap one to fill it in.', 'new', ['r3-store-post-contacts']],
      ['Forms', 'Public pickup forms recognize a store we already work with and fill its address and phone.', 'When someone fills a public pickup form for a store we already work with, the form knows the store and fills in its address and phone. Only business info is filled in, nothing private.', 'new', ['r3-public-store-match']],
      ['Office', 'New pickup: when the store, name, address or phone was used before, it shows past contacts and addresses — most used first — to pick from, or type someone else.', 'On the office New pickup form, if the store, name, address or phone was used before, it shows the past contacts and addresses, most used first. Pick one, or type someone new.', 'new', ['r3-used-before']],
    ],
  },
  {
    liveAt: '2026-10-11T04:21',
    title: 'New pickup form',
    items: [
      ['Office', 'Picking a saved store fills its name, address and phone (this was broken: the form read the store\'s address and phone under the wrong names, so only the name and town came through).', 'Picking a saved store on the New pickup form now fills its name, address and phone. Before, because of a bug, only the name and town came through.', 'fix', ['r3-saved-store-fills']],
      ['Office', 'The address shows as one line with "change"; stores without an address are looked up by name and saved, so you type it only once.', 'The address shows as one line with a "change" link. If a store has no address on file, we look it up by name and save it, so you type it only once.', 'change', ['r3-address-one-line']],
    ],
  },
  {
    liveAt: '2026-10-11T04:00',
    title: 'Filter-proof data, store texts',
    items: [
      ['Office', 'Type a store\'s name (e.g. "Evergreen") and pick it — address, phone and map spot fill in.', 'On the pickup form, start typing a store\'s name (for example "Evergreen") and pick it from the list. The address, phone and map spot fill in by themselves.', 'new', ['r3-type-store-name']],
      ['Office', 'Suppliers → "Find missing locations" puts stores without a map spot on the map (you approve each).', 'Suppliers → "Find missing locations" looks up stores that are not on the map yet. You check each one and approve it before it is saved.', 'new', ['r3-find-missing-locations']],
      ['Stores', 'Texts to stores ("driver on the way" and "your food was picked up") are off. Each store profile has switches to turn them on later.', 'The texts to stores — "driver on the way" and "your food was picked up" — are off for every store. Each store profile has two switches to turn them on later, one store at a time.', 'change', ['r3-store-texts-switches']],
      ['Stores', 'Stores choose in their app how to hear from us — app pop-up, text, both or off — for "driver on the way" and "picked up". The office switch still decides if a notice is used at all.', 'When the office turns a store notice on, the store chooses in its own app how to get it: app pop-up, text, both, or off. The office switch still decides if the notice is used at all. STOP still stops texts.', 'new', ['r3-store-notice-choice']],
      ['Office', 'If an internet filter blocks part of a page, the screen now says so plainly. All data is sent scrambled so filters can\'t read or block it.', 'If an internet filter blocks part of a page, the screen now says so in plain words instead of showing a strange error. The data is sent scrambled, so filters can\'t read it or block it.', 'new', ['r3-filter-blocked-plain']],
      ['Office', 'Driver and store profiles show how fast pickups usually get taken, with View all (who took it and after how long).', 'Driver and store profiles show how fast their pickups usually get taken. Tap "View all" to see each pickup, who took it, and how long it took.', 'new', ['r3-how-fast-taken']],
      ['Office', 'If an internet filter blocks something, a banner at the top says so.', 'When an internet filter blocks something, a banner at the top of the screen says so. Then you know it is the filter, not the app.', 'new', ['r3-filter-banner-office']],
    ],
  },
  {
    liveAt: '2026-10-11T03:06',
    title: 'Driver map, store picked-up text, New sign-ups, call log, dispatcher alerts, At a glance, kiosk mode, store profile, code words',
    items: [
      ['Office', 'Driver messages → Code words: every word drivers can text (PICKUPS, INFO, DONE, CANCEL, STOP…), what it does, who used it and when. DONE / CANCEL work but are no longer mentioned in our texts.', 'Messaging → Driver messages → Code words lists the words people can text us (like PICKUPS, INFO, DONE, CANCEL, STOP), what each does, how often it was used, and by whom. DONE and CANCEL still work, but our texts no longer mention them.', 'new', ['r3-code-words']],
      ['Office', 'One "Messaging" menu item again (as before Oct 9): Driver messages (texts, app chat, replies, code words), Store chat, Send texts, Emails — with the unread count on it.', 'The menu has one "Messaging" item again, like before Oct 9. Inside are Driver messages (texts, app chat, replies, code words), Store chat, Send texts and Emails. The unread count shows on Messaging.', 'change', ['r3-messaging-menu']],
      ['Drivers', 'A real map in the app: open pickups as pins (yours in green), tap a pin to Take it or get Directions; "Show my location"; a list under the map.', 'The driver app has a real map. Open pickups are pins, and your own pickups are green. Tap a pin to take the pickup or get directions. "Show my location" puts you on the map, and there is a list under it.', 'new', ['r3-driver-map']],
      ['Stores', 'Stores get a text when their food is picked up: "Moshe picked up your donation at 3:12 PM. Thank you!" (8 AM–9 PM, never Shabbos).', 'Stores could get a text when their food is picked up, with the driver\'s first name and the time. It goes only 8 AM–9 PM and never on Shabbos. (Later the same day this text was turned off by default — see "Filter-proof data, store texts".)', 'new', ['r3-store-texts-convo']],
      ['Office', 'Drivers → New sign-ups: everyone waiting for review, their answers, and one-click Approve (Active + Default text group + optional welcome text) or Not now.', 'Drivers → New sign-ups shows everyone who applied and is waiting for review, with their answers. Approve makes them active, adds them to the Default text group and can send a welcome text. "Not now" declines them.', 'new', ['r3-new-signups']],
      ['Office', 'On call now: "Log call" after calling a driver (Will take it / Can\'t / No answer / Left a message + note); the card shows who was already called today.', 'On the Live Board under "On call now", tap "Log call" after you call a driver and pick what happened: Will take it, Can\'t, No answer, or Left a message, with a note. The card shows who was already called today, so nobody calls twice.', 'new', ['r3-on-call-log-call']],
      ['Office', 'Driver profile → Alerts & schedule → On call: "Recent calls" with who called, when, what happened.', 'On a driver\'s profile, Alerts & schedule → On call shows "Recent calls": who called them, when, and what happened.', 'new', ['r3-recent-calls']],
      ['Texts', 'Automatic checks of the text replies run before every go-live (117 tests).', 'Before each go-live, automatic checks test how text replies are read and how our texts are written (117 checks at the time; more now). They catch mistakes before they reach drivers.', 'new'],
      ['Office', 'Dispatcher alerts: pop-up with a beep + a bell in the portal, and a phone notification to whoever is on duty — new text reply, driver gave a pickup back, store post with no driver after 15 min, pickup starting within an hour with no driver, reply not opened in 10 min.', 'The office gets alerts with a beep and a bell in the portal, and a phone notification for the dispatcher on duty. They come for a new text reply, a driver giving back a pickup, a store post with no driver after 15 minutes, a pickup starting within an hour with no driver, and a reply nobody opened in 10 minutes.', 'new', ['r3-alerts-popups']],
      ['Office', '"Turn on phone alerts" (bell menu, Settings, My shift): add the portal to the phone\'s Home Screen first.', 'To get alerts on your phone, tap "Turn on phone alerts" in the bell menu, Settings or My shift. On a phone, first add the portal to the Home Screen, or the phone won\'t allow alerts.', 'new', ['r3-alerts-bell']],
      ['Office', 'Driver Overview → "At a glance": a one-line verdict, their latest texts/tries/app use, and last-30-day numbers; "Show all activity" opens the full list.', 'A driver\'s Overview starts with "At a glance": a one-line summary, their latest texts, tries and app use, and numbers for the last 30 days. "Show all activity" opens the full list.', 'new', ['r3-driver-at-a-glance']],
      ['Kiosk', 'Kiosk mode: ⚙ on the kiosk start screen → Start kiosk mode (PIN). The browser stays on the kiosk — back, reload, other pages and shortcuts are blocked — until someone taps 🔒 and enters the PIN.', 'On the kiosk start screen, tap ⚙ → Start kiosk mode and use the PIN. The browser then stays on the kiosk — back, reload and other pages are blocked — until someone taps 🔒 and types the PIN.', 'new', ['r3-kiosk-mode-start']],
      ['Kiosk', 'Kiosk mode: the browser Back button stays on the kiosk; exiting with the PIN also turns off the old "this device is the kiosk" switch.', 'In kiosk mode, the browser Back button stays on the kiosk page. Leaving kiosk mode with the PIN also turns off the old "this device is the kiosk" switch.', 'fix', ['r3-kiosk-mode-exit-pin']],
      ['Office', 'Store profile → Overview: At a glance (how often they give, how many get picked up, steady days with no driver), stats, usual drivers, days, steady schedule, what they give, texts, and "Show all".', 'A store profile\'s Overview starts with At a glance: how often they give, how much gets picked up, and steady days with no driver. Under it are stats, usual drivers, days, the steady schedule, what they give, and texts, with "Show all".', 'new', ['r3-store-at-a-glance']],
      ['Office', 'Driver "Gave back" and Reliability count only real give-backs (released before the pickup, not office-cancelled) — old cleanups no longer count against drivers.', 'A driver\'s "Gave back" number and reliability count only real give-backs: pickups the driver let go before the time. Pickups the office cancelled or cleaned up no longer count against them.', 'fix', ['r3-gave-back-reliability']],
      ['Stores', '"Same as last time" says it opens the form filled in — every field can be changed before posting.', 'In the store app, the "Same as last time" button now says it opens the form already filled in. The store can change any field before posting.', 'change', ['r3-store-home-same-as-last']],
      ['Kiosk', 'The old "Make this device the kiosk" switch is gone — use ⚙ → Start kiosk mode on the kiosk page. Settings has "Open the kiosk" and "Copy kiosk link". Tablets that used the old switch move to the new mode by themselves.', 'The old "Make this device the kiosk" switch is gone; use ⚙ → Start kiosk mode on the kiosk page. Settings has "Open the kiosk" and "Copy kiosk link". Tablets that used the old switch moved to the new mode by themselves.', 'change', ['r3-settings-kiosk']],
    ],
  },
  {
    liveAt: '2026-10-11T00:38',
    title: 'Cancelled pickups show as cancelled, with Un-cancel',
    items: [
      ['Office', 'A cancelled pickup shows a grey "Cancelled" tag (reason on hover) and no "Assign driver" button.', 'A cancelled pickup shows a grey "Cancelled" tag (point at it to see why) and no "Assign driver" button — in History, lists and Live Board cards.', 'fix', ['r3-cancelled-tag']],
      ['Office', 'Inside a cancelled pickup: a banner at the top with when and why, and an "Un-cancel" button (text drivers now, or just put it back). The history shows who un-cancelled it.', 'When you open a cancelled pickup, a banner at the top says when and why it was cancelled. "Un-cancel" brings it back: you choose to text drivers now, or just put it back. The history shows who un-cancelled it.', 'new', ['r3-uncancel-banner']],
    ],
  },
  {
    liveAt: '2026-10-10T23:41',
    title: 'Clearer pickup texts, text bug fixes, "Text drivers now"',
    items: [
      ['Texts', 'The newest pickup is on top of the text, marked "NEW:", then "Also still open:" with the rest — each line keeps its own reply number.', 'In pickup texts, the newest pickup is on top with "NEW:", then "Also still open:" with the others. Every line keeps its own reply number, so drivers can take any of them.', 'change', ['r3-text-new-on-top']],
      ['Office', 'Admin → What\'s new: this page, with every update and its go-live date.', 'This page: Admin → What\'s new. It lists every update, who it affects, and when it went live. Tap an update with an arrow to read more.', 'new', ['r3-whats-new-page']],
      ['Texts', 'A bare "Cancel" gives back your pickup (or asks which one) — only STOP stops all texts.', 'If a driver texts just "Cancel", it gives back their pickup (or asks which one if they have several). Only STOP turns off all texts. Before, "Cancel" could turn off a driver\'s texts by mistake.', 'fix', ['r3-text-bare-cancel']],
      ['Texts', '"347." or "#347" counts as taking pickup 347.', 'Drivers often type "347." or "#347". Both now count as taking pickup 347, the same as "347".', 'fix', ['r3-text-number-with-dot']],
      ['Texts', 'Drivers whose quiet time ends early morning get the open pickups at about 9:05 AM.', 'Drivers whose quiet time ends before the texting day starts now get the open pickups a few minutes after it starts. It was about 9:05 AM; since Oct 12 the texting day starts at 8 AM, so it is about 8:05 AM.', 'change', ['r3-text-after-quiet-time']],
      ['Texts', 'The 90-minute "still no driver" text is plain, shows the store, never a family name, and follows drivers\' settings.', 'When a pickup still has no driver after 90 minutes, drivers get a reminder text. It is now short and plain, shows the store name (never a family\'s name), and follows each driver\'s text settings.', 'change', ['r3-text-90-min-reminder']],
      ['Stores', 'Store cancel/edit texts to drivers never go out on Shabbos.', 'When a store cancels or changes a pickup, the texts to its drivers never go out on Shabbos.', 'fix', ['r3-text-store-cancelled']],
      ['Office', 'The office new-pickup alert shows the real number and group (no more "code undefined").', 'The office alert for a new pickup now shows the real pickup number and text group. Before, it sometimes said "code undefined".', 'fix', ['r3-new-pickup-alert']],
      ['Texts', 'A driver writing "call my landline" no longer gets their texts turned off.', 'Before, a driver who wrote something like "call my landline" could have their texts turned off by mistake. Now only real phone auto-replies (like "this number cannot receive texts") turn texts off.', 'fix', ['r3-text-landline']],
      ['Office', '"Text drivers now" unticked on a new pickup = no text right away; it goes out with the next pickup text and shows in PICKUPS. (HOLD by text still waits for SEND.)', 'On a new pickup, if "Text drivers now" is not ticked, there is no text right away. The pickup still goes out with the next pickup text and shows in PICKUPS. A pickup added by text with HOLD still waits for SEND.', 'change', ['r3-text-drivers-now']],
    ],
  },
  {
    liveAt: '2026-10-09T17:52',
    title: 'Driver app round 2, smarter texts, Shabbos by candle lighting, simpler forms, store app, kiosk, office',
    items: [
      ['Drivers', '"I can\'t make it" and "Decline" buttons on a pickup; the office is told.', 'A pickup in the driver app has "I can\'t make it" and "Decline" buttons. When a driver taps one, the office is told and the pickup can go to someone else.', 'new', ['r3-cant-make-it']],
      ['Drivers', 'Each pickup shows its text number ("Text code: 37").', 'Each pickup in the driver app shows its text number, for example "Text code: 37", so drivers can match it with our texts.', 'new', ['r3-text-code']],
      ['Drivers', '"Done — dropped off" from any step and from pickup cards; miles optional.', 'Drivers can tap "Done — dropped off" from any step of a pickup and from the pickup cards. Miles are optional.', 'change', ['r3-done-dropped-off']],
      ['Drivers', 'Home: "Coming up" pickups; pausing texts asks For today / For a week / Until I turn it back on.', 'The driver home screen shows "Coming up" pickups. When a driver pauses texts, the app asks for how long: today, a week, or until they turn it back on.', 'new', ['r3-driver-pause-choice']],
      ['Drivers', '"Can\'t connect — try again" when there is no signal, instead of "Nothing open".', 'When the phone has no signal, the app says "Can\'t connect — try again" instead of "Nothing open", so drivers don\'t think there are no pickups.', 'fix', ['r3-cant-connect']],
      ['Drivers', 'My Activity counts every finished pickup.', 'A driver\'s My Activity now counts every pickup they finished, not only some kinds.', 'fix', ['r3-my-activity']],
      ['Drivers', 'Profile on the bottom bar, bigger text and buttons, unsaved-changes warning, friendly crash screen.', 'Profile is on the bottom bar of the driver app. Text and buttons are bigger, the app warns before you leave unsaved changes, and a friendly screen shows if something breaks.', 'change', ['r3-profile-bottom-bar']],
      ['Drivers', 'Away dates, Quiet days and "App only" settings are now followed.', 'Before, drivers could set Away dates, Quiet days and "App only" in the app, but our texts did not follow them. Now every pickup text and app alert follows these settings.', 'fix', ['r3-away-quiet-days']],
      ['Texts', 'STOP / START; "309 CANCEL" gives a pickup back; a bare DONE or "yes" is understood.', 'Drivers can text STOP to stop all texts and START to get them again. "309 CANCEL" gives back pickup 309. A bare DONE is understood, and a bare "yes" gets the question "Which one? Reply its number".', 'new', ['r3-text-stop-start']],
      ['Texts', '"You already have pickup 309" instead of "someone beat you".', 'If a driver texts the number of a pickup they already took, the answer is "You already have pickup 309" instead of "someone beat you".', 'fix', ['r3-text-already-have']],
      ['Texts', 'PICKUPS shows the same pickups as the new-pickup text; "Pickup", "List", "Open" and typos work.', 'The answer to PICKUPS lists the same pickups as the new-pickup text. "Pickup", "List", "Open" and small typos work too.', 'fix', ['r3-text-pickups-list']],
      ['Texts', 'Shorter pickup lines; accept text says how to finish (DONE) and give back (CANCEL).', 'Lines in pickup texts are shorter. The text a driver gets after taking a pickup said how to finish (DONE) and give back (CANCEL). Since Oct 11 our texts no longer mention DONE and CANCEL, but both still work.', 'change', ['r3-text-accept-short']],
      ['Texts', 'Texts stop 15 minutes before Monsey candle lighting until Motzei Shabbos; Yom Tov through 2028.', 'Automatic texts stop 15 minutes before Monsey candle lighting and start again after Motzei Shabbos, worked out for each week. Yom Tov works the same way, with dates through 2028. Before, a fixed Friday 5 PM time was used.', 'change', ['r3-rules-shabbos-pause']],
      ['Texts', 'Drivers coming out of their quiet time get one text with the pickups still open.', 'A driver whose own quiet time just ended gets one text with the pickups still open, so they don\'t miss what came in while they were quiet.', 'new', ['r3-text-out-of-quiet']],
      ['Texts', 'Store replies reach the office with the store\'s name; the store gets a thank-you.', 'When a store texts back, the office sees the store\'s name with the message, and the store gets a short thank-you. A plain "thank you" from a store is not sent to the office.', 'new', ['r3-store-reply-alert']],
      ['Forms', 'Store, steady-pickup and one-time donation forms are short and simple.', 'The sign-up forms for stores, steady pickups and one-time donations are shorter and easier, with fewer questions.', 'change', ['r3-form-store-signup']],
      ['Forms', 'The public one-time form no longer shows drivers or office tools.', 'The public one-time donation form no longer shows the driver list or office tools. Donors see only what they need to fill in.', 'fix', ['r3-form-one-time']],
      ['Office', 'New stores from the public sign-up wait for approval (Suppliers → Approve).', 'Stores that sign up on the public form wait for approval. In Suppliers they have a "Waiting for approval" tag; tap Approve to add them. Until then they are hidden from public lists and the kiosk.', 'new', ['r3-waiting-approval']],
      ['Stores', 'Drivers are told when a store cancels or edits; 5-second Undo on cancel.', 'When a store cancels or changes a pickup in its app, the drivers on it are told. After cancelling, the store has 5 seconds to tap Undo.', 'new', ['r3-store-cancel-undo']],
      ['Stores', 'My Pickups shows today and tomorrow first; shorter store profile; plain errors.', 'In the store app, My Pickups shows today and tomorrow first. The store profile is shorter, and errors are in plain words.', 'change', ['r3-store-my-pickups']],
      ['Kiosk', '"Your drop-off is saved ✓" when labels don\'t print; no double saves; longer thank-you.', 'If labels don\'t print at the kiosk, it still says "Your drop-off is saved ✓". A drop-off can\'t be saved twice, and the thank-you screen stays longer.', 'fix', ['r3-kiosk-saved-no-print']],
      ['Office', 'Assign a driver shows everyone: recommended, on call and regulars first; search by unit #.', 'The "Assign a driver" list shows everyone, with recommended, on-call and regular drivers first. You can search by unit number.', 'change', ['r3-assign-driver-list']],
      ['Office', 'Rewards can\'t pay twice if a reward is renamed.', 'Rewards are tracked so a driver can\'t be paid twice for the same period, even if a reward\'s name is changed.', 'fix', ['r3-rewards']],
      ['Office', '"Did these happen?" has 7/30 days and Mark all done.', 'The "Did these happen?" list can show the last 7 or 30 days, and "Mark all done" clears many at once.', 'new', ['r3-did-these-happen']],
      ['Office', 'Reports split Done from Took it, not checked in.', 'Reports show "Done" (signed in at the kiosk or marked done) apart from "Took it, not checked in" (a driver took it but never signed in at the kiosk).', 'change', ['r3-reports-tiles']],
      ['Office', 'One Driver messages inbox; Repost on cards; Waiting N chip; "Are you sure?" on one-click actions.', 'Driver texts and app messages are in one Driver messages inbox. Pickup cards have a Repost button, a "Waiting N" chip shows how long a pickup has waited, and one-click actions ask "Are you sure?" first.', 'change', ['r3-driver-messages-inbox']],
      ['Office', 'Phone-app alerts to a pickup\'s drivers work again.', 'App notifications to the drivers on a pickup (for example when it changes) had stopped working. They work again.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-09T09:46',
    title: 'Deliveries, rewards, on-call hours, Alerts & schedule tab, texting rules',
    items: [
      ['Office', 'Deliveries from 3 Regina Road to a family; drivers never see the family\'s name.', 'The office can set up deliveries from 3 Regina Road to a family. The driver gets the address (and with INFO, the family\'s phone), but never sees the family\'s name.', 'new', ['r3-delivery-form']],
      ['Office', 'Rewards: each driver\'s own 30-day period; 4+ = $10 ice cream, 8+ = $25 gas card.', 'Rewards are counted per driver over their own 30-day period: 4 or more pickups = $10 ice cream, 8 or more = $25 gas card. See Reports → Rewards. Giving a reward does not restart the count.', 'change', ['r3-rewards']],
      ['Office', 'Alerts & schedule tab on every driver: texts, groups, quiet times, on-call, steady pickups and reminders, what\'s coming up.', 'Every driver\'s profile has an "Alerts & schedule" tab: their texts, groups, quiet times, on-call hours, steady pickups and reminders, and what is coming up — all in one place.', 'new', ['r3-alerts-schedule-tab']],
      ['Office', 'Profile says plainly whether a driver really gets pickup texts, and why not.', 'A driver\'s profile says in plain words if they really get pickup texts right now, and if not, why not (for example quiet hours, or not in the group).', 'new', ['r3-why-no-texts']],
      ['Office', 'The big group is now "Default text group"; adding someone to it is the review.', 'The main texting group is now called "Default text group". Adding a driver to it is how the office approves them for pickup texts.', 'change', ['r3-default-text-group']],
      ['Office', 'Pickup page shows time left in the queue with −1 / +1 / +3 / +6 hour buttons.', 'The pickup page shows how much time drivers still have to take it, with buttons to change it by −1, +1, +3 or +6 hours. (Since Oct 12 this reads in plain English.)', 'new', ['r3-time-left-buttons']],
      ['Office', 'Reposting an expired pickup asks "Text drivers now?" or "just the queue".', 'When you repost a pickup that expired, it asks: text drivers now, or just put it back in the queue?', 'new', ['r3-repost-ask']],
      ['Office', '"Did you drop it off?" text is a per-driver switch, off for everyone.', 'The "Did you drop it off?" reminder text is a switch on each driver\'s profile. It is off for everyone until the office turns it on.', 'change', ['r3-dropoff-text-switch']],
      ['Office', 'Do-not-contact drivers get no steady reminders unless you turn them on.', 'Drivers marked do-not-contact don\'t get steady pickup reminders. The office can still turn them on for one driver (it asks first).', 'change', ['r3-dnc-steady-reminders']],
      ['Office', 'Style pass: 12-hour times, "Thu, Oct 9" dates, plain sentences instead of codes.', 'Across the office, times are in 12-hour style (4:00 PM), dates look like "Thu, Oct 9", and codes were replaced with plain sentences.', 'change', ['r3-coming-up-dates']],
      ['Drivers', 'On-call hours ("happy to be called") in the profile; "On call now" on the Live Board.', 'Drivers can set the hours when they are happy to get a phone call about a waiting pickup. The Live Board shows "On call now" with who can be called.', 'new', ['r3-driver-on-call-hours']],
      ['Drivers', 'Several quiet times allowed; hours can run past midnight.', 'A driver can have more than one quiet time, for example morning and night. Hours can go past midnight, like 10 PM–7 AM.', 'new', ['r3-several-quiet-times']],
      ['Texts', 'A new pickup\'s text also lists all the other open pickups.', 'When a new pickup is texted, the same text also lists all the other pickups still open, with the new one first.', 'change', ['r3-text-new-lists-others']],
      ['Texts', 'Pause and Shabbos also stop app notifications.', 'When the office pauses texts, and on Shabbos, app notifications about pickups stop too — not only texts.', 'change', ['r3-rules-shabbos-pause']],
      ['Stores', 'Stores get a text when a driver is on the way.', 'Stores that posted a pickup got a text when a driver was on the way. Since Oct 11 this text is off unless the office turns it on for that store.', 'new', ['r3-store-texts-convo']],
      ['Forms', 'Volunteer application asks about texts, urgent alerts, reminders and on-call hours.', 'The volunteer application asks if they want texts, urgent alerts and steady reminders, and when they are happy to be called (on-call hours).', 'new', ['r3-form-volunteer']],
    ],
  },
  {
    liveAt: '2026-10-08T10:32',
    title: 'Audit fixes, store summary, gas rewards, text fixes',
    items: [
      ['Office', 'Security: dev can\'t text real people; open admin pages locked.', null, 'fix', ['r3-sandbox-pill']],
      ['Office', 'Store profile shows "What they usually give".', null, 'new', ['r3-store-usually-gives']],
      ['Office', 'Send SMS asks before texting a pickup again.', null, 'new', ['r3-send-sms-again']],
      ['Texts', 'INFO only while a pickup is open; closed INFO offers what is open.', null, 'change', ['r3-text-info-closed']],
      ['Stores', 'Store My Pickups page and a friendlier thank-you.', null, 'new', ['r3-store-post-thanks']],
      ['Office', 'Form popups no longer close on an outside click (lost typing).', null, 'fix', ['r3-form-popup']],
    ],
  },
  {
    liveAt: '2026-10-07T01:43',
    title: 'Reports, store posts, Live Board',
    items: [
      ['Office', 'Reports tiles: counts match the filters; distinct stores and drivers lists.', null, 'fix', ['r3-reports-tiles']],
      ['Stores', 'Simpler store post form with a confirmation.', null, 'change', ['r3-store-post-form']],
      ['Office', 'Live Board "usually active now" card.', null, 'new', ['r3-usually-active-now']],
    ],
  },
];

// Oct 14 client: on the LIVE site (and the phone app), a release still marked liveAt: null is in this
// bundle, so it IS live — show it with this bundle's build time instead of "Coming soon".
// Only the test site (zlz.zehlzeh.org) shows not-yet-live releases as "Testing / Coming soon".
const ON_TEST_SITE = typeof window !== 'undefined' && window.location.hostname === 'zlz.zehlzeh.org';
const BUILT_AT_NY = (() => {
  try {
    const d = new Date(typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '');
    if (isNaN(d.getTime())) return null;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch { return null; }
})();
const RELEASES: Release[] = ON_TEST_SITE || !BUILT_AT_NY ? RELEASES_SRC
  : RELEASES_SRC.map((r) => (r.liveAt ? r : { ...r, liveAt: BUILT_AT_NY }));

const AREAS: Area[] = ['Drivers', 'Texts', 'Stores', 'Office', 'Forms', 'Kiosk'];
const AREA_STYLE: Record<Area, string> = {
  Drivers: 'bg-sage text-forest', Texts: 'bg-sky-soft text-sky-deep', Stores: 'bg-amber-soft text-[#9a7415]',
  Office: 'bg-cream text-ink', Forms: 'bg-clay-soft text-clay', Kiosk: 'bg-cream text-muted',
};
// Oct 14 client: New / Fix / Change pill + filter (missing kind → 'change').
const KINDS: Kind[] = ['new', 'fix', 'change'];
const KIND_META: Record<Kind, { pill: string; chip: string; cls: string; words: string; one: string; many: string }> = {
  new: { pill: '✨ New', chip: '✨ New', cls: 'bg-sage text-forest', words: 'new feature added', one: 'new', many: 'new' },
  fix: { pill: '🐞 Fix', chip: '🐞 Fixes', cls: 'bg-clay-soft text-clay', words: 'fix fixed bug broken', one: 'fix', many: 'fixes' },
  change: { pill: '🔄 Change', chip: '🔄 Changes', cls: 'bg-sky-soft text-sky-deep', words: 'change changed', one: 'change', many: 'changes' },
};
const kindOf = (it: Item): Kind => (it.length === 4 || it.length === 5 ? it[3] : 'change');
// Oct 25 client: screenshots for an item (5th element).
const picsOf = (it: Item): string[] => (it.length === 5 ? it[4] : []);
// The phone app build leaves the pictures out (vite.config.ts) and loads them from the website.
const PIC_BASE = import.meta.env.BASE_URL === './' ? 'https://staging.zehlzeh.org/rescue/' : import.meta.env.BASE_URL;
const picUrl = (name: string) => `${PIC_BASE}whats-new/${name}.webp`;
const kindCounts = (items: Item[]) => {
  const c: Record<Kind, number> = { new: 0, fix: 0, change: 0 };
  for (const it of items) c[kindOf(it)] += 1;
  return c;
};
const countsLine = (c: Record<Kind, number>) => KINDS.filter((k) => c[k] > 0)
  .map((k) => `${c[k]} ${c[k] === 1 ? KIND_META[k].one : KIND_META[k].many}`).join(' · ');
const fmtWhen = (iso: string) => new Date(`${iso}:00`).toLocaleString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
});

// Oct 14 client: "What's new" in the ? menu — per-user unseen count.
// Stamps are 'YYYY-MM-DDTHH:MM' New York time, so plain string compare works.
/** Is a live release newer than the user's last look? Oct 14 client: never looked → only the newest live release. */
const isFresh = (liveAt: string | null, seenAt: string | null) =>
  !!liveAt && (seenAt ? liveAt > seenAt : liveAt === latestLiveAt());
/** Newest liveAt of any live release (what "seen" is set to when What's new is opened). */
export const latestLiveAt = (): string | null =>
  RELEASES.reduce<string | null>((m, r) => (r.liveAt && (!m || r.liveAt > m) ? r.liveAt : m), null);
/** How many live items came out after `seenAt`. */
export const unseenCount = (seenAt: string | null): number =>
  RELEASES.reduce((n, r) => n + (isFresh(r.liveAt, seenAt) ? r.items.length : 0), 0);

// Oct 14 client: mode "menu" (the ? menu pop-up): live releases first, liveAt null
// shown as "Coming soon" only when showComingSoon (admins); newSince → "New" tags.
export function WhatsNewPanel({ mode = 'admin', showComingSoon = true, newSince, isAdmin }: {
  mode?: 'admin' | 'menu'; showComingSoon?: boolean; newSince?: string | null; isAdmin?: boolean;
} = {}) {
  const menuMode = mode === 'menu';
  // Oct 14 client: admins — open comments per item (matched by the item's text).
  const admin = isAdmin ?? ['admin', 'staff', 'coordinator'].includes(String(getUser()?.role ?? '').toLowerCase());
  const [comments, setComments] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const load = () => api<{ data: { text: string; open: number }[] }>('/api/help/whats-new-comments')
      .then((r) => {
        if (!alive) return;
        const m: Record<string, number> = {};
        for (const x of r?.data ?? []) m[x.text] = (m[x.text] ?? 0) + (Number(x.open) || 0);
        setComments(m);
      }).catch(() => {});
    void load();
    window.addEventListener('zlz:report-sent', load);
    return () => { alive = false; window.removeEventListener('zlz:report-sent', load); };
  }, [admin]);
  const list = useMemo(() => (menuMode
    ? [...RELEASES.filter((r) => r.liveAt), ...(showComingSoon ? RELEASES.filter((r) => !r.liveAt) : [])]
    : RELEASES), [menuMode, showComingSoon]);
  const soon = menuMode ? 'Coming soon' : 'Testing — not live yet';
  const [area, setArea] = useState<Area | 'All'>('All');
  const [kind, setKind] = useState<Kind | 'All'>('All'); // Oct 14 client
  const [q, setQ] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(() => new Set()); // Oct 14 client: opened details
  const [viewer, setViewer] = useState<{ pics: string[]; title: string } | null>(null); // Oct 25 client
  const toggle = (k: string) => setOpenItems((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // Oct 14 client: search also looks in the details; keep each item's own index as its key.
  const shown = useMemo(() => list.map((r) => ({
    ...r,
    // Oct 14 client: + kind filter; search also matches the kind words ("fix", "new", "change").
    items: r.items.map((it, i) => ({ it, i })).filter(({ it }) => {
      const [a, t, d] = it;
      const kd = kindOf(it);
      return (area === 'All' || a === area) && (kind === 'All' || kd === kind)
        && (!q.trim() || `${t} ${d ?? ''} ${KIND_META[kd].words}`.toLowerCase().includes(q.trim().toLowerCase()));
    }),
  })).filter((r) => r.items.length > 0), [area, kind, q, list]);
  const total = list.reduce((n, r) => n + r.items.length, 0);
  const allCounts = useMemo(() => kindCounts(list.flatMap((r) => r.items)), [list]); // Oct 14 client

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
        <div className="text-[14px] font-extrabold text-ink">Go-live dates</div>
        <div className="text-[12px] text-muted mb-2">Every update that reached the live site, newest first ({total} updates: {countsLine(allCounts)}). Tap an update with an arrow to read more.</div>
        <table className="w-full text-[13px]">
          <tbody>
            {list.map((r) => (
              <tr key={r.liveAt ?? r.title} className="border-t border-line first:border-t-0">
                <td className="py-1.5 pr-3 font-bold whitespace-nowrap align-top">{r.liveAt ? fmtWhen(r.liveAt) : <span className="text-[#9a7415]">{soon}</span>}</td>
                <td className="py-1.5 pr-3 text-ink">{r.title}</td>
                {/* Oct 14 client: e.g. "7 updates · 4 new · 1 fix · 2 changes" */}
                <td className="py-1.5 text-right text-muted align-top">
                  <div className="whitespace-nowrap">{r.items.length} updates</div>
                  <div className="text-[11.5px]">{countsLine(kindCounts(r.items))}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['All', ...AREAS] as const).map((a) => (
          <button key={a} onClick={() => setArea(a)}
                  className={cx('haptic rounded-full border px-3 py-1.5 text-[12.5px] font-bold',
                                area === a ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream')}>
            {a}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search updates…"
               className="ml-auto min-w-[180px] flex-1 rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[13px] outline-none focus:border-forest sm:flex-none" />
      </div>
      {/* Oct 14 client: New / Fixes / Changes filter */}
      <div className="flex flex-wrap items-center gap-2" data-wn-kinds>
        {(['All', ...KINDS] as const).map((kd) => (
          <button key={kd} onClick={() => setKind(kd)} aria-pressed={kind === kd}
                  className={cx('haptic rounded-full border px-3 py-1.5 text-[12.5px] font-bold',
                                kind === kd ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream')}>
            {kd === 'All' ? 'All kinds' : `${KIND_META[kd].chip} (${allCounts[kd]})`}
          </button>
        ))}
      </div>

      {shown.length === 0 && <div className="text-[13px] italic text-muted">Nothing matches.</div>}
      {shown.map((r) => (
        <section key={r.liveAt ?? r.title} className="rounded-[14px] border border-line bg-paper px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[14px] font-extrabold text-ink">{r.title}</div>
            <div className={cx('text-[12px] font-bold', r.liveAt ? 'text-forest' : 'text-[#9a7415]')}>
              {r.liveAt ? `Live ${fmtWhen(r.liveAt)}` : soon}
            </div>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {r.items.map(({ it, i }) => {
              const [a, t, d] = it;
              const kd = kindOf(it); // Oct 14 client
              const k = `${r.liveAt ?? r.title}#${i}`;
              const open = openItems.has(k);
              const tag = <span className={cx('mt-[1px] shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.04em]', AREA_STYLE[a])}>{a}</span>;
              // Oct 14 client: "New" = came out after the user's last look (? menu only).
              const fresh = newSince !== undefined && isFresh(r.liveAt, newSince);
              const nComments = admin ? (comments[t] ?? 0) : 0;
              const cTag = nComments > 0 ? <span data-wn-comments title={`${nComments} open comment${nComments === 1 ? '' : 's'}`} className="mt-[1px] shrink-0 rounded-full bg-sky-soft px-1.5 py-0.5 text-[10.5px] font-extrabold text-sky-deep">💬 {nComments}</span> : null;
              const ref = { liveAt: r.liveAt, release: r.title, index: i, area: a, text: t };
              const kindTag = <span data-wn-kind={kd} className={cx('mt-[1px] shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-extrabold', KIND_META[kd].cls)}>{KIND_META[kd].pill}</span>;
              const newTag = fresh ? <span data-wn-new className="mt-[1px] shrink-0 rounded-full bg-clay px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.04em] text-white">New</span> : null;
              // Oct 14 client: items with details are a button (keyboard: Tab + Enter / Space) that opens them.
              return (
                <li key={i} className="py-1.5 text-[13px] text-ink">
                  {d ? (
                    <>
                      <button type="button" onClick={() => toggle(k)} aria-expanded={open} aria-controls={`wn-${k}`}
                              title={open ? 'Hide details' : 'Show more about this'}
                              className="haptic flex w-full items-start gap-2 rounded-[8px] text-left hover:bg-cream/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest">
                        {kindTag}{tag}{newTag}{cTag}
                        <span className="flex-1">{t}</span>
                        <ChevronDown size={16} aria-hidden className={cx('mt-[2px] shrink-0 text-muted transition-transform', open ? 'rotate-180' : '')} />
                      </button>
                      {open && (
                        <div id={`wn-${k}`} className="mt-1.5 mb-1 ml-1 rounded-[10px] border-l-[3px] border-forest/40 bg-cream/60 px-3 py-2 text-[13px] leading-snug text-ink">
                          {d}
                          {/* Oct 14 client: comment on / report this update */}
                          <div className="mt-2 flex flex-wrap gap-2" data-wn-actions>
                            {/* Oct 25 client: screenshots, office only; load only when tapped */}
                            {admin && picsOf(it).length > 0 && (
                              <button type="button" onClick={() => setViewer({ pics: picsOf(it), title: t })} data-wn-pics
                                      className="haptic rounded-full border border-forest bg-sage px-3 py-1 text-[12px] font-bold text-forest hover:bg-cream">
                                📷 {picsOf(it).length === 1 ? 'View picture' : `View ${picsOf(it).length} pictures`}
                              </button>
                            )}
                            <button type="button" onClick={() => openReportProblem({ kind: 'comment', whatsNewItem: ref })}
                                    className="haptic rounded-full border border-line bg-paper px-3 py-1 text-[12px] font-bold text-ink hover:bg-cream">💬 Comment</button>
                            <button type="button" onClick={() => openReportProblem({ kind: 'problem', whatsNewItem: ref })}
                                    className="haptic rounded-full border border-line bg-paper px-3 py-1 text-[12px] font-bold text-ink hover:bg-cream">🐞 Something&apos;s wrong with this</button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-start gap-2">{kindTag}{tag}{newTag}{cTag}<span className="flex-1">{t}</span>
                      {/* Oct 25 client: an update with no details can still have a picture */}
                      {admin && picsOf(it).length > 0 && (
                        <button type="button" onClick={() => setViewer({ pics: picsOf(it), title: t })} data-wn-pics title="View picture"
                                className="haptic shrink-0 rounded-full border border-forest bg-sage px-2 py-0.5 text-[11.5px] font-bold text-forest hover:bg-cream">📷</button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {viewer && <PicViewer pics={viewer.pics} title={viewer.title} onClose={() => setViewer(null)} />}
    </div>
  );
}

// Oct 25 client: full-size screenshot pop-up for a What's new item (arrows / swipe-free buttons, Esc closes).
function PicViewer({ pics, title, onClose }: { pics: string[]; title: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const n = pics.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((x) => Math.min(n - 1, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [n, onClose]);
  const nav = 'haptic rounded-full border border-line bg-paper px-3 py-1 text-[12.5px] font-bold text-ink disabled:opacity-40';
  return (
    <div role="dialog" aria-modal="true" aria-label="Picture" data-wn-viewer onClick={onClose}
         className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3">
      <div onClick={(e) => e.stopPropagation()}
           className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-[14px] bg-paper shadow-xl">
        <div className="flex items-start gap-2 border-b border-line px-4 py-2">
          <div className="flex-1 text-[13px] font-bold text-ink">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="haptic -mr-1 rounded-full px-2 text-[18px] font-bold leading-none text-muted hover:text-ink">✕</button>
        </div>
        <div className="min-h-[120px] flex-1 overflow-auto bg-cream/60 p-2">
          <img key={pics[i]} src={picUrl(pics[i])} alt={`Picture ${i + 1} of ${n}`} decoding="async"
               className="mx-auto block h-auto max-w-full rounded-[8px] border border-line" />
        </div>
        {n > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-2">
            <button type="button" className={nav} disabled={i === 0} onClick={() => setI(i - 1)}>‹ Back</button>
            <span className="text-[12.5px] text-muted">{i + 1} of {n}</span>
            <button type="button" className={nav} disabled={i === n - 1} onClick={() => setI(i + 1)}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}
