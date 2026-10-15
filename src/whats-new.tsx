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
type Item = [Area, string] | [Area, string, string] | [Area, string, string | null, Kind];
type Release = { liveAt: string | null; title: string; items: Item[] };

// Newest first. liveAt = when it reached the live site (New York time).
const RELEASES_SRC: Release[] = [
  {
    liveAt: null,
    title: 'Small texting fixes',
    items: [
      // Oct 14 client: "any number can write PICKUPS, not only members — big issue"
      ['Texts', 'Only our drivers get the pickup list by text. Other numbers asking PICKUPS or "<number> INFO" get a short note instead.', 'Before, anyone who texted PICKUPS to our number got the list of open pickups with addresses. Now the list and pickup details go only to our drivers (and dispatchers). A number we don\'t know, an outside helper, or someone marked do not contact / alumni / archived gets: "This number is for Zeh L\'Zeh volunteer drivers. If you drive with us and this is a new number, please ask the office to add it." The office sees a note in Driver messages.', 'fix'],
      // Oct 14 client: "What does that mean?" (Status group in Who got the text)
      ['Office', 'Who got the text: people skipped because of their status now show which status (do not contact, alumni or archived).', 'In "Who didn\'t get it", the "Status" group lists people who never get texts because of the status on their profile. Each name now shows which status it is, for example "(do not contact)". To text them again, change the status on their profile.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-14T23:09',
    title: 'Driver text fixes',
    items: [
      // Oct 14 client (driver #118): his unit number "118" got "Someone just beat you to All Fresh"
      ['Texts', 'Texting an old pickup number no longer says "Someone just beat you" with an old store.', 'A driver texted "118" (his own driver number) and got "Someone just beat you to All Fresh Supermarket", though there was no All Fresh pickup that day. Pickup numbers are never reused, so 118 still belonged to a pickup from August. Now a number only counts for a pickup from today or the last few hours. Any other number gets "Sorry, 118 isn\'t an open pickup number" with what is open now, and a driver who texts his own driver number gets "Thanks! You\'re on the list…". Numbers of finished or past pickups are closed every 10 minutes.', 'fix'],
      // Oct 14 client: profile popup texts were one-sided
      ['Office', 'The driver popup\'s "Texts with" now shows the whole conversation, both sides.', 'Before, it showed only texts the office typed, so you couldn\'t see what the driver sent (like "118" or "pickups") or our automatic answers. Now it shows the same texts as Driver messages → Texts, from all of his numbers, including an older number if the office changed it. Each text says who sent it: him, or Us (and "automatic" for texts the system sent).', 'fix'],
      ['Office', 'Pickup history in the driver popup no longer lists pickups another driver did.', 'When a steady pickup\'s driver was changed, the old driver was taken off but his sign-up stayed, so the pickup still showed in his history (and could hold a spot). Now he is fully taken off, and old cases no longer show in his history.', 'fix'],
      // Oct 14 client: phone saved as "+8452933973" -> TextDrip "invalid number"
      ['Texts', 'Phone numbers saved with a "+" but no country code now get texts.', 'A number saved like +8452933973 (a plus sign but no 1) was sent to the texting service as is, and it said "invalid number", so the driver got no pickup texts. These numbers now go out as US numbers (+1 845-293-3973), and new ones are saved without the stray "+".', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-14T23:09',
    title: 'Store / donor CANCEL',
    items: [
      // Oct 14 client: "do it automatic, but with a notification for the dispatcher to call the driver"
      ['Stores', 'A store or donor CANCEL reply now cancels the pickup automatically, texts the driver kindly, and tells the dispatcher to call him.', 'When a store or donor answers CANCEL to "A driver accepted your pickup… reply CANCEL", that day\'s pickup is cancelled right away (never the steady pickup, and it is not sent out to other drivers). The driver gets an app alert and a warm text: "Sorry, Hive just let us know the food isn\'t needed anymore, so the 4:00 PM pickup is cancelled. Thank you so much for heading out for it, it really means a lot. The office will give you a call." The store gets "Thanks — the pickup is cancelled and the driver has been told." The dispatcher gets an alert "Call Moshe: Hive cancelled" with the driver\'s phone, to make sure he got the message; it stays until dismissed. If the food was already picked up nothing is cancelled and the office is alerted as before; a second CANCEL does nothing.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-14T21:24',
    title: 'Text results per person',
    items: [
      // Oct 14 client: TextDrip one-by-one texts — results per person, reasons, resend to failed
      ['Texts', 'Text results are recorded per person — one failed number no longer marks everyone as failed.', 'Our texting service (TextDrip) sends each text one person at a time. Before, if even one number failed (for example a landline or a number on a do-not-text list), the whole send was marked failed: "Who got the text" said "Text failed" for everyone and the texts were missing from the drivers\' text threads, even though almost everyone got them. Now each person has their own result: "Text ✓" for the ones who got it and "Text failed (not a mobile number)" — with the reason — for the ones who didn\'t. Replies to drivers\' texts (INFO, PICKUPS, accepting a pickup…) are logged the same way, and replies that went out on WhatsApp now show in the text thread too. Texts are now sent a little slower and tried again if the texting service is busy, so fewer fail. Reports → SMS delivery has a new "Texts that failed" list with the reason for each person and a "Resend to failed" button (it asks first, and goes only to the people whose text failed). A send to many drivers now keeps going in the background instead of the page waiting.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-14T21:24',
    title: 'Simpler texting info',
    items: [
      // Oct 14 client (Yakov): wrong office number + office chat error
      ['Drivers', 'Office phone number fixed to (845) 363-5323, and office logins can open the office chat in the driver app.', 'The "Call the office" number in the app (Chat, sign-in, store screens) showed the wrong number (845) 587-5777. It is now (845) 363-5323. Also, someone signed in with an office login who opened Chat in the driver app saw "Can\'t reach the office chat right now". That is fixed.', 'fix'],
      // Oct 14 client: "Show all auto there as well"
      ['Office', 'Driver messages → Texts now shows automated texts too (pickup texts, reminders, thank-yous).', 'Before, the Texts list hid threads that only had automated texts, so you only saw real conversations. Now everything shows by default. Untick "Show automated" at the top of the list to hide them again.', 'change'],
      // Oct 14 client: "The new texting info is very messy and hard to follow"
      ['Office', 'Simpler texting info: one short line on each card; the popup shows the last text first, details folded away.', 'Each pickup card now has one short line about texts: "📤 Texted 4× · last 8:29 PM to 55" (or "Not texted yet" / "Opens to drivers at 3:00 PM"). Tap it for "Who got the text": first the last text in plain words ("Last text: 8:29 PM — 55 got it · 9 didn\'t", plus how many failed), then when the next text goes out. "Who got it", "Who didn\'t get it" (grouped by reason, failed ones first) and "Earlier texts" are folded closed — tap to open. Names still open the driver\'s profile, and WhatsApp ✓ / failed tags are still shown. "More details" at the bottom shows the full view from before.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-14T18:44',
    title: 'Second phone for texts',
    items: [
      // Oct 14 client: the call question no longer says "Please don't call" for people who never answered
      ['Drivers', 'Application no longer shows "Please don\'t call" for people who never answered — it says "Not answered".', '"When can we call you if a pickup needs a driver?" used to show "Please don\'t call" for every volunteer who never answered it, because having no call hours looked the same as choosing not to be called. Now the app remembers the actual answer: My application, the office driver profile ("Call: not answered") and the New sign-ups panel say "Not answered" unless the person really picked "Please don\'t call". In Settings → Phone calls nothing is picked yet for them, with "Not answered yet." Who gets called did not change — with no call hours, nobody calls them.', 'fix'],
      // Oct 14 client: more than one phone number — which gets texts, which is best to call
      ['Drivers', 'Drivers can add up to 3 phone numbers and pick which one gets texts and which one we should call.', 'In the driver app (My profile) and on the sign-up form / "Update my answers" there is now a list of phone numbers: tap "+ Add another number" (up to 3) and give each one a label (Cell / Home / Work) if you like. With two or more numbers you pick "Texts go to" and "Best number to call" — they can be the same number. All automatic texts and WhatsApp messages (new pickups, reminders, "you got it", the food check, the app invite…) go to the texting number; phone calls go to the call number. A text back from ANY of the numbers (a code, PICKUPS, DONE, CANCEL, STOP…) is recognised as the same driver. With one number nothing changes.', 'new'],
      ['Office', 'Driver profile: phone list with "Texts go to" and "Best number to call".', 'Edit a driver → "Phone numbers": add up to 3 numbers with labels and choose where texts go and which number to call. The Sign-up info tab shows "📞 845-… · 💬 Texts to 845-…" when they differ. "Who got the text" and "Who gets texts" show which number the text went to (last 4 digits) for drivers with more than one number. A driver\'s text conversation shows the messages from all of his numbers together, each marked with the number, and a reply goes to his texting number.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-14T18:44',
    title: 'Driver profile: clear load errors',
    items: [
      // Oct 14 client: office-only pickup notes never sent to drivers or stores
      ['Drivers', 'Office-only notes on a pickup are never sent to drivers\' phones.', 'The "Internal office notes — Admin only" box on a pickup was still sent to the driver app with the open list, Your pickups and the pickup page (and to the store app with its pickups), even though the screens didn\'t show it. Now the app never gets it at all. Drivers still see everything they need: the food, how much, the instructions, the contact and the store\'s photo. The office sees the notes as before.', 'fix'],
      // Oct 14 client: delivery privacy
      ['Texts', 'Deliveries: before a driver takes it, they only see the street — the family\'s address, phone and notes come after they take it.', 'Before, anyone who texted "435 INFO" saw the family\'s full address and phone (from the delivery\'s contact and instructions). Now, until a driver takes a delivery, the texts (new pickup, hourly list, "Also still open", PICKUPS, INFO, the 90-minute alert and the WhatsApp copies) and the app (open list, pickup page, map) show only the street and town, like "to a family on Viola Rd, Monsey" — no house number, no phone, no notes and no instructions ("Details sent after you take it"). The driver who takes it gets the full address, the family\'s phone, the family notes and the instructions in the "You are now assigned" text and in the app. The office still sees everything. Store pickups are unchanged.', 'fix'],
      ['Office', 'Delivery form: the phone and instructions boxes say they are shown only after a driver takes it.', 'When "Delivery" is picked, Contact Phone is called "Family\'s phone (shown only after they take it)" and Instructions is called "Notes for the driver (shown only after they take it)". Under the family picker: "Drivers only see the street until they take it."', 'change'],
      // Oct 14 client: driver Profile load errors
      ['Drivers', 'Profile no longer says "not linked" when it just couldn\'t load — it says what went wrong, with Try again.', 'Before, My profile said "No volunteer profile linked to this account" for ANY problem — no signal, an internet filter, a server error — so a driver whose login is fine thought it was broken. Now it says the real reason ("Can\'t connect — check your signal", the internet-filter message, or "Couldn\'t load your profile — …") with a Try again button. Only when the login really has no driver record does it say "Your login isn\'t connected to your volunteer profile yet. Please call the office." Settings, My application, Home and Pickups show the same clear reasons.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-14T13:02',
    title: 'Form submitted by, extra contacts, quiet-time days, no double reminder',
    items: [
      // Oct 14 client: who cancelled
      ['Office', 'Cancelled pickups say who cancelled and when (office person, store, driver or automatic).', 'Under the grey "Cancelled" tag (Pickups list, History and the Live Board) is a small line like "by Chaya · Oct 14, 2:14 PM", "by Hive (app)", "by the store (text)" or "auto (expired)", plus the reason if there is one. The pickup page says the same. Pickups cancelled before today may show only the time, because who did it was not saved then.', 'new'],
      // Oct 14 client: WhatsApp
      ['Texts', 'A driver who chose WhatsApp now really gets the pickup messages — on WhatsApp, or a text if WhatsApp can\'t be used.', 'Before, a driver who picked "WhatsApp" (in the app Settings or by the office) got no pickup text AND no WhatsApp unless they had already messaged our WhatsApp number — so they got nothing. Now choosing WhatsApp counts as their OK for WhatsApp. If we can\'t reach them on WhatsApp (no phone, the WhatsApp phone isn\'t picking up messages, or their last WhatsApp failed), they get the same message as a text instead. If the WhatsApp phone reports a send failed, a WhatsApp-only driver gets it as a text within minutes. This covers the new-pickup text, the hourly list, the catch-up after quiet hours, the office "Send" button, steady "not covered" texts and the 90-minute alert.', 'fix'],
      ['Texts', '"Who got the text" shows what each driver actually got: Text ✓, WhatsApp ✓, WhatsApp queued, or WhatsApp failed → texted.', 'Open "Show names" in the popup: next to each name is what really went out for that send, from the real logs (the text log and the WhatsApp phone\'s queue), and a count line on top (e.g. "Text ✓ 40 · WhatsApp ✓ 2"). Older sends: a WhatsApp-only driver shows whether any WhatsApp went out to them then.', 'new'],
      ['Office', 'WhatsApp status for every driver, from real things only: "✓ Has WhatsApp — messaged us on WhatsApp", "✓ … our WhatsApp went through", "✗ WhatsApp failed", or "? Not confirmed yet".', 'Shown on the driver profile (Alerts & schedule → Pause & how we reach them), in Who gets texts (with a new "WhatsApp confirmed" filter) and in the "Who got the text" popup. It never uses what the driver chose in the app — only messages they sent us on WhatsApp and our WhatsApps that went through or failed. "Went through" means our WhatsApp phone sent it; WhatsApp can\'t open a chat with a number that has no WhatsApp.', 'new'],
      ['Office', '"Send test WhatsApp" button on the driver profile (Alerts & schedule → Pause & how we reach them).', 'Sends one line ("this is a test WhatsApp from the office") through our WhatsApp phone and shows the result: queued, sent, or failed. Use it to check the Office profile or any driver. The result updates their WhatsApp status. On the test site it goes to the test phone.', 'new'],
      // Oct 14 client: review follow-ups
      ['Office', 'No more blank board or "too many requests" when the office, the kiosk and tablets are busy at the same time.', 'They all share one internet address, and one office page load asks the server about 23 things, so the old limit (200 a minute per address) was easy to reach. Now each person who is logged in has their own limit (600 a minute). Not-logged-in forms keep their strict limits.', 'fix'],
      ['Office', 'View-only logins can look at everything but can\'t change anything — for example the texting settings.', 'A "View-only" (Read-Only) login could still save some settings, like "Show pickups to drivers __ hours before". The server now refuses any change from a view-only login (they can still change their own password and settings). Texting settings are for admin / coordinator / staff only.', 'fix'],
      ['Texts', '"Who got the text" check shows the right reason for each driver.', 'The group check (who got a group text and why not) only looked at the first quiet time. It now uses the same rule as the texts themselves, so extra quiet times, quiet days, Away, WhatsApp only and outside helpers show the real reason.', 'fix'],
      ['Office', 'After 8 PM, lists no longer jump to tomorrow.', 'Some lists used the server\'s date (world time, UTC), which turns to tomorrow at 8 PM New York time: "Used before" contacts on a new pickup, previous drivers of a pickup, a store\'s 30-day counts and a driver\'s last 90 days. They all use the New York date now.', 'fix'],
      ['Office', 'On a phone, office buttons and icons are easier to tap (at least 40px).', 'Top bar icons, tabs, pickup card buttons, the (i), "+ Add another contact", − / + in "Drivers on this pickup", the × in the "Who got the text" and wait-time popups, the Clean up tick boxes and the Dispatchers buttons. Only on phone-size screens; the computer screen looks the same.', 'fix'],
      ['Office', 'App invite can\'t reset an office login.', 'Inviting a volunteer to the app could reset the password of an office (staff) login that used the same phone. It now never touches office logins.', 'fix'],
      ['Kiosk', 'The kiosk sign-in log is for the office only.', 'The list of kiosk sign-ins could be opened by any logged-in user. Now only office logins can see it.', 'fix'],
      ['Drivers', 'A driver can\'t take a pickup that is already closed.', 'Taking a pickup in the app now checks that it is still open; a cancelled or finished pickup says it is closed instead of adding the driver.', 'fix'],
      ['Office', 'A cancelled pickup\'s page shows the right buttons.', 'No "Cancel pickup" button on a pickup that is already cancelled, and no "Tap Assign Driver" hint when that button is hidden.', 'fix'],
      ['Texts', 'Removed old unused texting code.', 'Nothing changes in who gets texts or when; old copies of rules that were no longer used (one of them was wrong) are gone so nobody fixes the wrong copy.', 'change'],
      ['Office', 'Pickup cards show who filled out the form (✍️ Secretary), and Reports shows how many forms each one filled.', 'Live Board and Pickups cards now have a small grey tag next to ONE-TIME / STEADY with who filled out the pickup form, e.g. "✍️ Secretary", "✍️ SR" or the typed name; pickups that came in by text show "✍️ By text". Store-app pickups keep their 📱 STORE APP badge. In Reports, under the tiles, a line reads "Forms filled by: Secretary 24 · SR 9 · … · Not recorded 40" for the dates and filters you picked. Tap a name to see only those pickups (same as the "Form by" filter); tap it again to see all.', 'new'], // Oct 14 client
      ['Office', 'What\'s new marks each update as ✨ New, 🐞 Fix or 🔄 Change, with filters.', 'Every update in What\'s new now has a small tag before it: ✨ New (something you could not do before), 🐞 Fix (something was broken or wrong and now works) or 🔄 Change (something now works differently: a rule, a time or the wording). Tap "✨ New", "🐞 Fixes" or "🔄 Changes" above the list to see only those; they work together with the area buttons and the search. The go-live table shows how many of each came in every update, and typing "fix" or "new" in the search finds them too.', 'new'], // Oct 14 client
      ['Office', 'Reports: "Typical wait until taken" tile — tap for each pickup\'s wait and a weekly chart (getting faster or slower).', 'New tile in the Reports tile row: the typical (middle) wait from when drivers were first texted about a pickup (or it was posted, if it was never texted) until a driver took it, e.g. "42 min", with the average and how many pickups under it. It follows the report\'s dates, store, driver and "Form by" filters. Tap it: a bar for each week (Sun–Sat, at least the last 12 weeks) with "↓ 12 min faster" or "↑ slower than the week before", and a list of every pickup (date, store, texted/posted time, taken at, by whom, wait) — Slowest first / Fastest first / Newest first, and Export CSV. Office-assigned pickups, test pickups, cancelled ones and waits over 7 days are not counted. It uses the very same rule as "Usually takes a pickup within…" on driver and store profiles, so the numbers agree.', 'new'], // Oct 14 client
      ['Texts', 'No more double text: a driver who just took a pickup doesn\'t also get the reminder for it.', 'Example: a driver texts a steady pickup\'s code at 8:19 for a 9:00 pickup and gets "Thank you! You are now assigned…" — the "reminder from Zeh L\'Zeh" text no longer follows 2 minutes later. A driver who took the pickup after the reminder time (or in the last 3 hours) is skipped and the reminder is marked done for that pickup. Drivers on the steady list from before still get the reminder as usual, and when the store\'s "food today?" YES was already texted to the drivers there is still no second reminder.', 'fix'], // Oct 14 client
      ['Office', 'New pickup / Edit pickup and the public one-time form ask "Form submitted by" again (Secretary, Swift Dial, SR, YT, or Other + name) — required on a new pickup.', 'Brought back from Oct 12 (it was held back until the database change is approved). The office New pickup form remembers this computer\'s last choice; Edit shows the saved one and does not block old pickups that have none. The public one-time form requires it too (an old copy of the page still sends). Pickups a store sends from its app are marked "Store app", and a NEW text is marked "Text (NEW command, <name>)". The pickup page shows "Form by: …"; Reports has a "Form by" filter and the export a "Form submitted by" column (next to Source). Old installed phone apps still save without it.', 'new'], // Oct 14 client
      ['Forms', '"+ Add another contact" on pickups: up to 3 more names / phones besides the main contact — office New/Edit pickup, the public one-time form, and the store app\'s "food ready" form.', 'Brought back from Oct 12. Some donors give two phone numbers: tap "+ Add another contact" under the contact phone (name optional + phone, × to remove). The main contact stays first, so the contact text and store texts work as before. Drivers see a Call button for each on the pickup page, the accept text and pickup info texts list them ("Contact: Shmuel — (845) 746-1927; also Yossi — …"), the office pickup page lists them as "Other contact", and "Used before" / "Use info from a previous pickup" fill them in too. Never shown on a delivery. In the store app\'s new form it is inside "Who should the driver ask for?". Works next to the office form\'s "Text the contact when a driver is on the way" box.', 'new'], // Oct 14 client
      ['Drivers', 'Each quiet time can have its own days: Every day / Weekdays (Mon–Thu) / Sun–Thu / Pick days — in the office\'s Alerts & schedule, the driver app Settings and the volunteer application.', 'Under every quiet time row there is now a day choice (Every day is the default, so nothing changes for anyone until a day is picked). Example: 9 AM – 5 PM on Mon–Thu means a driver gets pickup texts on Friday at 10 AM. A quiet time that crosses midnight counts for the night it starts: "11 PM – 7 AM · Thu" is quiet Thursday night into Friday 2 AM, but Friday 11 PM is not quiet (unless Friday is picked). Quiet times show as "11 PM – 7 AM · Mon–Thu". The same rule is used by the pickup texts, PICKUPS replies, uncovered alerts, steady and shift reminders, Who gets texts (now and by time), the office profile and the "Will go to N drivers" line on the cards, so they all agree. The catch-up text after quiet hours end only goes to drivers whose quiet time really ended that morning.', 'new'], // Oct 14 client
      ['Drivers', 'The "📱 Texting hours" line changes as you edit quiet times (before Save), and shows each day when the days differ: "Mon until 11 PM; Tue–Thu 7 AM – 11 PM; Fri from 7 AM; Sat, Sun all day".', 'In the driver app Settings and the office\'s Alerts & schedule tab, the texting-hours line now follows what is on screen (times, days, quiet days, away dates) with "Not saved yet" until Save; after Save it shows the server\'s own line again. It uses the very same rule as the server (the same code is in the app). When all quiet times are every day it reads as before ("7 AM – 10 PM").', 'change'], // Oct 14 client
      ['Office', 'Needs Sholo: these three come with database changes 081, 082 and 083 (only new columns, nothing removed). They go live once Sholo approves them.', '081 adds pickup_instances.submitted_by (text, empty allowed). 082 adds pickup_instances.extra_contacts (jsonb, empty allowed). 083 adds volunteer_quiet_windows.days and volunteers.sms_quiet_days (number, default 127 = every day). No existing data is changed.', 'change'], // Oct 14 client
    ],
  },
  {
    liveAt: '2026-10-14T01:57',
    title: 'Big update: Help & guide, driver Settings, store form & photos, shifts, food check, 2-hour rule, morning texts at 9', // Oct 14 client: was 'Steady button, reposted pickups'
    items: [
      ['Drivers', 'Pause has a new choice: "Until a date…" — pick the day messages start again ("Paused until Tue, Oct 20"); it ends by itself.', 'Pause (Home or Settings) now offers For today / For a week / Until a date… / Until I turn it back on. "Until a date…" opens a date box (tomorrow up to about 6 months ahead) and says "No pickup messages until Tue, Oct 20. They start again that day by themselves." While paused, Home and Settings show "⏸ Paused until Tue, Oct 20", what it means ("No pickup messages until Tue, Oct 20. You can still open the app and take pickups.") and a big "Resume now" button. It is saved like "For a week" (away dates), so nothing new is stored. Also fixed: "Until I turn it back on" did nothing before (the app sent a setting the server ignored); it now really pauses until Resume now.', 'new'], // Oct 14 client
      ['Drivers', 'Sign-up form and "Update my answers" ask plainly: "When can we call you if a pickup needs a driver?" — Anytime / Only at these times / Please don\'t call. The answer IS the call setting.', 'Anytime = the office may call any day, any hour (saved as all-day call hours for every day). Only at these times = the driver picks days and hours (incl. "Weekdays (Mon–Thu)" and "Every day"). Please don\'t call = no call hours. Saving the application changes the real call hours right away (the same ones the Live Board "On call now" list and the office use), and the driver\'s Settings → Phone calls shows the same three choices — change it in either place and the other shows it. The office driver profile (Alerts & schedule → On call) shows "Call: anytime", the hours, or "Don\'t call"; New sign-ups show the same.', 'change'], // Oct 14 client
      ['Drivers', 'Pickup page: the "Drivers" box now shows the driver after they took the pickup (it said "No driver yet" while the steps said "You took it / Picked up").', 'The box read only the sign-up list, which is cleared once a pickup is underway (and is empty when the office assigned the driver or the driver took it by text). It now lists the drivers on the pickup, plus anyone still signed up, once each.', 'fix'], // Oct 14 client
      ['Office', 'Driver profile → new "Application" tab: the same "My application" page the driver sees, with "Edit answers" for drivers who can\'t use the app.', 'Open a driver (Drivers → the name) → Application. It shows every answer from the sign-up form, incl. "When can we call you?". "Edit answers" opens the same form; saving changes the same things the driver\'s own save does (call hours, quiet hours, steady reminders, name, phone…), is written in the history under the office user\'s name, and does not send the office the "updated his application" message. The driver sees the change in the app at once.', 'new'], // Oct 14 client
      ['Office', 'Driver profile → Alerts & schedule: "Pause & how we reach them" — the same Pause choices (For today / A week / Until a date… / Until turned back on, Resume now) and the same Text / WhatsApp / Both / App only / Nothing choice as the driver app, with who set it.', 'For drivers who can\'t use the app. It uses the same settings as the driver\'s app, so a pause or a choice made here shows on the driver\'s Home and Settings, and the other way round. The box says who set it and when: "Paused until Tue, Oct 20 — set by the driver in the app on Oct 14" or "— set by the office (Chaya) on Oct 14" (the driver also sees when the office paused them). The "does NOT get the texts" box uses the same words ("Paused (away) until Tue, Oct 20", "Paused until turned back on"). An automatic test changes each choice from the office side and from the app side and checks that the text sender, Who gets texts, the driver Home and the office profile all agree.', 'new'], // Oct 14 client
      // Oct 14 client
      ['Texts', 'First pickup text of the day is back at 9:00 AM; an 8:00 AM text goes out only when a pickup is before 9.', 'The first full pickup text of the day goes out at 9:00 AM again (it was moved to 8:00 AM on Oct 12 only because of an early 8:15 AM pickup). If a pickup is set for before 9:00 AM, an 8:00 AM text still goes out for it, and it lists only the pickups before 9 (and late ones). Pickups at 9:00 or later, like the Hive, go in the 9 AM text. Drivers whose quiet time ends overnight get the open pickups at about 9:05 AM (8:05 only when a pickup is before 9). "Pause all texts until tomorrow" now ends at 9 AM.', 'change'],
      ['Drivers', '"Invite to the app" on a driver\'s profile sends them the download links and a link to set their password.', 'Open a driver (Volunteers → the driver → Overview) and tap "📲 Invite to the app". If they have no app login yet, one is made for them (their login is their cell phone number); if they already have one, they get a link to set a new password. The ready message shows first and you can change it: "Hi Moshe! Get the Zeh L\'Zeh volunteer app to see and take pickups: Android: … iPhone: … Then set your password here: … Your login: …". Then Send by text (only to that driver; not if they texted STOP), Send by WhatsApp, or Copy. The link works for 7 days. The driver opens it, chooses a password and sees "You\'re all set" with buttons to get the app. The profile and Admin → App Usage show "Invite sent Oct 14 · not used yet" (or "used") with a Resend button. App Usage also has "Invite all with no login (N)": it lists the names first (untick anyone), then texts them one by one, skipping people who texted STOP or have no cell phone. The iPhone links (invites and the update pop-up) now go straight to the Zeh L\'Zeh app in the App Store.', 'new'], // Oct 14 client
      ['Stores', 'A photo a store adds shows to drivers on the pickup and to the office on the card and pickup page.', 'When a store adds a photo to its "food ready" post, drivers see a small 📷 picture on the pickup card and a "📷 Photo from the store" box on the pickup page (tap it to see it full screen, × to close). The office sees a small 📷 picture next to the food line on the Live Board card (tap = large) and the photo under Food on the pickup page. The store sees it in My pickups. Before, a post with a photo could fail to send (the photo was too big to save); now it is saved as a file. The driver\'s own drop-off photo no longer replaces the store\'s photo.', 'new'], // Oct 14 client
      ['Office', 'New pickup / Edit pickup: "Text the contact when a driver is on the way" — a checkbox per pickup, with the phone and the exact text shown under it.', 'Under "Text drivers now" there is a new box. Ticked = when a driver accepts, the contact gets one text: "Zeh L\'Zeh: A driver accepted your pickup and will be there soon. If it\'s no longer needed, reply CANCEL. Thanks!" The grey line under the box shows the phone it goes to and that exact text. One-time pickups start UNTICKED for now (until we are ready). Store pickups start ticked only if that store\'s "driver on the way" switch is on; ticking it for a store that is off texts just this pickup, unticking it for a store that is on skips just this pickup. The office card and pickup page show "Contact will be texted when a driver accepts" while it is on.', 'new'], // Oct 14 client
      ['Texts', 'One-time donors are no longer texted automatically when a driver accepts — only when the office ticked the box. New wording, no driver name or time.', 'Before, every one-time donor got "<Driver> is coming for your food today at 4:00 PM…". Now the text is "Zeh L\'Zeh: A driver accepted your pickup and will be there soon. If it\'s no longer needed, reply CANCEL. Thanks!" and it goes only for pickups ticked on the office form. Pickups from the store app follow the store\'s switch as before; one-time pickups from the public form or a NEW text are not texted. A CANCEL reply still only alerts the dispatcher and the contact gets "Thanks — the dispatcher has been notified." Same hours as before (8 AM–10 PM donors, 8 AM–9 PM stores, never on Shabbos / Yom Tov or while texts are paused).', 'change'], // Oct 14 client
      ['Stores', 'Simpler "food ready" form: tap the food type, kosher type, how many (counter), when, and a summary before sending.', 'Stores tap what\'s ready (🍲 Cooked, 🥖 Baked, 🥕 Fruit/Veg, 🥛 Dairy, 🍗 Meat, 🥫 Packaged, 🧃 Drinks, ➕ Other), optionally Fleishig / Milchig / Pareve and a photo, then how many with − / + and Trays / Boxes / Bags / Pans; the form shows "🚗 Fits in one car", "Car trunk full" or "🚐 Needs a van or 2 cars". New "How many drivers?" (1 / 2 / 3+, set to 2 for a van-size load) sets how many drivers the pickup needs. "When" is Now / In 1 hour / Later, with an optional "Must be gone by" time, and a line like "✓ 6 trays of cooked food (fleishig), ready now · 1 driver" shows above Send. Drivers see it as "Fleishig · Cooked — chicken & rice" and "About: 6 trays · fits in one car"; "Same as last time" fills all of it in.', 'change'], // Oct 14 client
      ['Office', 'Admin → Settings → "Store post form": change the store form\'s food types, units and kosher choices without code.', 'Add, remove, rename (with emoji) and reorder the food-type chips, the units (with how many fit in one car or a trunk) and the kosher choices, and turn the photo and kosher rows on or off. "Reset to standard" goes back to the built-in list. Stores see the change the next time they open the form.', 'new'], // Oct 14 client
      ['Drivers', 'Driver app: new Settings — choose how we reach you about pickups: Text, WhatsApp (new), Both (new), App only or Nothing.', 'Drivers open Settings from the ☰ menu, from My profile, or with "Change" on the Home screen. One screen in plain words: "How should we reach you about pickups?" (Text messages / WhatsApp / Both / App notifications only / Nothing), Pause (for today, a week, or until turned back on), quiet hours with the texting hours shown first, quiet days, away dates, the hours they are happy to be called (incl. Weekdays), steady pickup reminders on/off, "Allow text messages", and the text commands. WhatsApp and Both have a small "new" tag while WhatsApp is still being tested. These settings left My profile (it links to Settings).', 'new'], // Oct 14 client
      ['Texts', 'A driver who chooses WhatsApp gets pickup messages on WhatsApp instead of texts; Both = text + WhatsApp; Text = text only.', 'The choice in the driver\'s Settings now does what it says. WhatsApp: no pickup texts, the WhatsApp copy goes out (once we know the driver uses WhatsApp). Both: text and WhatsApp. Text messages: texts only (before, every texted driver who had used WhatsApp also got a WhatsApp copy). App only: just the app alert. Nothing: no pickup messages. Pause, away, quiet hours and quiet days work the same for WhatsApp as for texts. The office "Who gets texts" and "who got the text" lists show these drivers as "WhatsApp only". Messages about a pickup the driver already took still come by text.', 'new'], // Oct 14 client
      ['Drivers', 'Home: the "Getting pickup texts" switch is now a short line with the real setting ("📩 Pickups by: Text · Quiet 10 PM–7 AM", "Paused until …"), with Pause and Change.', 'The old switch only showed on/off and was misleading. The Home screen now says how pickups reach the driver and their quiet hours, or "⏸ Paused until Thu, Oct 16" with Resume. Pause asks for how long (today / a week / until I turn it back on); Change opens Settings. Open now lists only pickups that are open to drivers (from 2 hours before their time), so the "Later & tomorrow" line is gone; the driver\'s own upcoming pickups stay under Coming up.', 'change'], // Oct 14 client
      ['Drivers', '"My application": drivers see their sign-up answers and can update them; the office is told what changed.', 'In the driver app (☰ menu, or My profile → My application) the driver sees every question from the volunteer sign-up form with their answers. "Update my answers" opens the same questions filled in. Saving updates their record (name, phone, email, address, quiet hours, steady reminders, call hours and all the answers — never status, groups or unit #), writes what changed in the history (audit log), and sends the office a "📝 Moshe updated his application (areas, vehicle size)" message like a new sign-up. Every question of the form is kept.', 'new'], // Oct 14 client
      ['Drivers', 'Map: short pin labels ("Now", "2 PM", "Wed"), pins close together become one bubble with a number, labels stay inside the map; tapping a pin shows that pickup in the list.', 'Map pins used to say "Wed 9:00 AM+14", overlapped and were cut off at the edges. Now each pin shows a short time, pins that would overlap are one round bubble with how many pickups are there (tap it to zoom in), and labels never go past the edge of the map. Tapping a pin scrolls to that pickup in the list under the map and lights it up, with Take this pickup right there.', 'change'], // Oct 14 client
      ['Office', 'Comment on, or report a problem with, a single update here in What\'s new.', 'Open an update (tap it) and use "💬 Comment" or "🐞 Something\'s wrong with this". The Report a problem form opens with that update filled in; at the top you pick "Comment / idea" or "Problem" (a comment has no "How bad?"). It is saved in Tasks & follow-ups ("Comment on update: …" / "Problem with update: …") and admins get a bell alert (a problem also a phone alert). Admins see a 💬 count next to updates with open comments, and Problem reports now has a Type (Problem / Comment) with a filter.', 'new'], // Oct 14 client
      ['Office', '"What\'s new" is in the ? menu for everyone, with a count of updates you haven\'t seen.', 'The ? button at the top now has "✨ What\'s new": the list of every update, newest first, with the day it went live. A small dot on the ? and "3 new" in the menu show updates you have not seen yet; opening What\'s new marks them seen, and the new ones get a "New" tag. Dispatchers see only updates that are already live; the Guide has a short "See what changed" part about it.', 'new'], // Oct 14 client
      ['Texts', 'Drivers see a pickup only from 2 hours before its time (PICKUPS, texts, app). The office still sees everything.', 'A pickup is not in the drivers\' queue until 2 hours before its time: after midnight, PICKUPS no longer lists this afternoon\'s or tomorrow\'s pickups, and the texts\' "Also still open" lists, the app\'s Open list and map follow the same rule (late and reposted pickups stay open). A driver who tries to take one early is told "This pickup opens at 3:00 PM — we\'ll text you then"; the office card shows "Opens to drivers at 3:00 PM". Change the hours in Admin → Settings ("Show pickups to drivers __ hours before their time"); texting a pickup by hand (Send SMS) opens it right away.', 'change'], // Oct 14 client
      ['Office', 'App Usage: "Today" means today\'s date, platforms say iPhone app / Android app / Website, and drivers on the old Android app now show.', 'Admin → App Usage: "Today" now means the same calendar day (before, someone who opened the app at 7 PM yesterday showed as Today). The Platform column says "iPhone app", "Android app" or "Website". Drivers on the old Android app (1.0.17) were missing because that app never reported opening; their last use and version now come from their phone\'s notification sign-up, with "old app — please update" next to the version.', 'fix'], // Oct 14 client
      ['Drivers', 'Phone app 1.0.43 (coming to the stores): fits iPhones with a notch, and says when a newer app is in the store.', 'The new phone app version 1.0.43 is being sent to Google Play and the App Store. On iPhones with a notch, the top and bottom of the app no longer hide behind the notch or the home bar. The app now checks the live site\'s version, and when a newer app has been out for a few days it shows a bar "update it in the store". The app no longer keeps an old offline copy of its screens (that could show outdated screens).', 'change'], // Oct 14 client
      ['Drivers', 'Phone app: a popup asks to update when a new version is out (Later hides it for a day).', 'When a newer phone app is in the store, the app now shows a pop-up "New version available" when it opens, with Update now (goes to the store) and Later (hides it for 24 hours; the slim bar stays). If the app is more than 30 days behind, or the office sets a minimum version, the pop-up says the version is too old and has no Later. This is in the phone app 1.0.43 and later; the website is not changed.', 'new'], // Oct 14 client
      ['Office', 'A volunteer who was removed can no longer see or take open pickups in the app.', 'If the office removed (deleted) a volunteer, their app login can no longer list open pickups or take one. They get a message to call the office.', 'fix'], // Oct 14 client
      ['Texts', 'Food check: when the store says YES, the steady driver gets "Hive confirmed food today — your pickup is at 9:00 AM"; NO → "No pickup today"; no answer → nothing to the driver, the office is alerted.', null, 'new'], // Oct 14 client
      ['Office', 'Pickups → Steady: "New steady pickup" is now at the top right.', 'The "New steady pickup" button is now at the top right of Pickups → Steady, where it is easy to find. It opens the same steady pickup form as before.', 'change'],
      ['Texts', 'A reposted or late pickup says "now" to drivers instead of its old time.', 'When the office reposts a pickup, or a pickup is already late, the text to drivers no longer shows its old time — it says "now". This way drivers don\'t think the pickup is over when it still needs someone. The office still sees the real time on the pickup.', 'change'],
      ['Office', 'Reposted pickups show a "Reposted" tag with when, under today.', 'A pickup that was reposted gets a "Reposted" tag with the time it was reposted, under today\'s pickups. It helps the office see which pickups came back. It works on iPhones too.', 'new'],
      ['Office', 'Pickups a store sent through its app show a "📱 STORE APP" badge and "Submitted through the store app" on the pickup page.', 'When a store posts a pickup itself in the store app, the office card shows a "📱 STORE APP" badge, and the pickup page says "Submitted through the store app". So you know the store sent it, not the office.', 'new'],
      ['Office', 'Shifts can be seen as a week calendar (like Pickups → Calendar), with open shifts marked.', 'Dispatching shifts can be shown as a week calendar, like Pickups → Calendar. Shifts that still need a dispatcher are marked, so they are easy to fill.', 'new'], // Oct 13 client
      ['Texts', 'A reopened pickup gets its text code back right away, so drivers can reply with the same number.', 'When a driver comes off a pickup and it needs a driver again, it gets back the same text number it had. Drivers who got the earlier text can still reply with that number. Before, the card showed no text code until the next text went out.', 'fix'], // Oct 13 client
      ['Office', 'Kiosk drop-off messages list one pickup per line with short names and addresses.', 'The kiosk drop-off message now puts each pickup on its own line, with a short store name and address. It is quicker to read.', 'change'], // Oct 13 client
      ['Stores', 'Steady pickups can text the store "Do you have food today?" — YES sends it to drivers, NO cancels today, no answer alerts the office to call.', 'For steady pickups where the office turns it on, we text the store about 2 hours before: "Do you have food for pickup today? Reply YES or NO." The pickup waits for the answer. YES sends it to drivers, NO cancels today and tells the office, and no answer by 30 minutes before alerts the office to call. The "Needs confirmation" list shows the answer, with Send to drivers / Cancel today buttons.', 'new'], // Oct 13 client
      ['Texts', 'One-time donors get "<driver> is coming for your food… reply CANCEL if no longer needed"; a CANCEL reply alerts the dispatcher (the pickup is not cancelled automatically).', 'When a driver takes a one-time pickup, the donor gets a text with the driver\'s first name and the time, and "If it\'s no longer needed, reply CANCEL." A CANCEL reply never cancels the pickup by itself: the dispatcher gets an alert to check, and the donor is told the dispatcher was notified. Stores get this text only if the office turned it on for that store.', 'new'], // Oct 13 client
      ['Office', 'On-call hours: pick "Weekdays (Mon–Thu)" or "Every day" instead of one day at a time.', 'When you set a driver\'s on-call hours, you can choose "Weekdays (Mon–Thu)" or "Every day" in one step, instead of setting each day by itself.', 'new'], // Oct 14 client
      ['Drivers', 'A pickup you gave back ("I can\'t make it") no longer stays under Your pickups, and you can take it again.', 'After a driver taps "I can\'t make it", that pickup leaves their "Your pickups" list. If they change their mind, they can take it again like any open pickup.', 'fix'], // Oct 14 client
      ['Drivers', 'The pickup page shows the store\'s note for this pickup, and Call uses the contact the store gave (same as the texts).', 'In the driver app, the pickup page shows the note the store wrote for this pickup. The Call button calls the contact the store gave — the same person as in our texts.', 'change'], // Oct 14 client
      ['Drivers', 'After "Picked up", the card button goes to the drop-off instead of back to the store.', 'Once a driver taps "Picked up", the button on the pickup card takes them to the drop-off, not back to the store.', 'fix'], // Oct 14 client
      ['Drivers', 'No signal → a bar says so. Bigger back, menu and map buttons. Clearer messages when a pickup is already taken.', 'When the phone has no signal, a bar at the top of the driver app says so. The back, menu and map buttons are bigger, and the message is clearer when someone else already took a pickup.', 'change'], // Oct 14 client
      ['Stores', 'My pickups: a late or reposted pickup still being handled stays under Today (it said "No driver came").', 'In the store app, a pickup that is late or was reposted and is still being handled stays under Today. Before, it wrongly said "No driver came".', 'fix'], // Oct 14 client
      ['Stores', 'A steady pickup waiting for your YES / NO says so (it said "Looking for a driver").', 'In the store app, a steady pickup that is waiting for the store\'s YES or NO answer says so. Before, it said "Looking for a driver".', 'fix'], // Oct 14 client
      ['Office', 'Shifts: "Weekly template" to edit the regular schedule in one place, and "Clean up…" to remove duplicate, test and old shifts (you approve each).', 'Dispatching shifts have a "Weekly template": the regular weekly schedule in one place, so you change it once. "Clean up…" finds duplicate, test and old shifts; you look at each one and approve before it is removed.', 'new'], // Oct 14 client
      ['Office', 'Cancelling a repeating shift asks: just this one, or this and all future ones.', 'When you cancel a shift that repeats every week, it asks if you mean just this one, or this one and all the ones after it.', 'new'], // Oct 14 client
      ['Office', 'What\'s new items open for more detail; Code words list is complete; new "How texting works" page explains all the texting rules.', 'Tap an update on this page (the ones with a small arrow) to read more about it. Messaging → Driver messages → Code words now lists every word drivers, stores, donors and dispatchers can text us, with who can use each one. The new page Messaging → How texting works explains the texting rules in short points. Drivers see their text words in the app under Profile → Text commands.', 'new'], // Oct 14 client
      ['Office', 'Help (?) button: a welcome tour and a guide to every part of the office portal; "Report a problem" sends a bug report to the admins.', null, 'new'], // Oct 14 client
      ['Office', 'The ? (Help) button shows a "NEW" badge until you open it once, so everyone notices it.', 'Each office user sees a small orange "NEW" badge and a soft glow on the ? button at the top, plus (on a computer) a short note "New: Help, guide & report a problem". Both go away for good once that person opens the ? menu. The welcome tour still opens once for each person, and its last step shows where the ? button is.', 'new'], // Oct 14 client
    ],
  },
  {
    liveAt: '2026-10-13T00:37',
    title: 'New pickups text 1 hour before',
    items: [
      ['Texts', 'A new pickup is texted at the top of the hour before its time (9:53 PM → 9:00 PM), or right away if that time has passed. Tick "Text drivers now" to send it immediately.', 'A new pickup is no longer texted the moment it is saved. It goes out at the top of the hour before its time — a 9:53 PM pickup is texted at 9:00 PM. If that time already passed, it goes right away. Tick "Text drivers now" to send it at once. Drivers\' own quiet hours, Shabbos and Pause still apply.', 'change'],
      ['Office', '"Use info from a previous pickup" also finds it by phone number or contact name.', 'On the New pickup form, "Use info from a previous pickup" now also searches by phone number or contact name, not only by store. Pick one to fill in the form, then change what you need.', 'new'],
      ['Office', '"+ Someone not on our list" in Drivers on this pickup: record an outside helper who covered a pickup. They never get our texts; one tap makes them a volunteer.', 'If someone who is not our volunteer covered a pickup (for example, the office phoned a friend), add them in the pickup\'s "Drivers on this pickup" with "+ Someone not on our list". The pickup counts as covered and reports show who did it. They never get our automatic texts. "Make a volunteer" turns them into a regular volunteer in one tap.', 'new'], // Oct 13 client
    ],
  },
  {
    liveAt: '2026-10-12T17:35',
    title: 'Each text, who got it',
    items: [
      ['Office', 'Tap a send time on a pickup to see who got that text, who didn\'t and why, and who is new this time.', 'A pickup shows each time it was texted. Tap a time to see who got that text, who did not and why (quiet hours, away, app only…), and who is new compared to the text before.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-12T16:33',
    title: 'Plainer pickup times',
    items: [
      ['Office', 'Pickup page in plain English: "Pickup time", "Must be picked up by", "Drivers can take it for 8 more days" with "1 hour more / 1 hour less" buttons.', 'The time rows on the pickup page are now in plain words: "Pickup time", "Must be picked up by", and how long drivers can still take it. Use "1 hour more" or "1 hour less" to change how long it stays open.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-12T07:32',
    title: 'Texts start at 8 AM, dismiss alerts',
    items: [
      ['Texts', 'The first automatic pickup text of the day is now at 8:00 AM (was 9:00). Drivers\' own quiet hours still apply.', 'The office texting day now starts at 8:00 AM instead of 9:00 AM. The first hourly pickup text, and the catch-up text for drivers whose quiet time ended overnight, now come at 8 AM. Each driver\'s own quiet hours still come first.', 'change'],
      ['Office', 'Alerts have a Dismiss button (and Dismiss all); dismissed alerts clear for everyone in the office and from the tablet.', 'Office alerts (the bell and the pop-ups) have a Dismiss button and a Dismiss all button. A dismissed alert is gone for everyone in the office and on the tablet, so two people don\'t handle the same thing.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-12T01:45',
    title: 'Re-adding a driver, text info on cards',
    items: [
      ['Office', 'Pickup cards say how many drivers the next text will reach and when, and how many times it was already sent.', 'Each pickup card shows how many drivers the next text will reach and when, for example "Will go to 23 drivers at 8:00 AM". It also shows how many times it was already texted, and when.', 'new'],
      ['Office', 'Drivers\' texting hours show first, quiet hours under them.', 'On a driver\'s profile, the hours they can get texts are shown first, with their quiet hours under them. It is easier to see when they can be reached.', 'change'],
      ['Office', 'Adding back a driver who was taken off a pickup works now (it said "already changed by someone else").', 'If a driver was taken off a pickup and you add them back, it works now. Before, it showed an error saying someone else already changed the pickup.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-12T00:42',
    title: 'Who gets texts by time of day',
    items: [
      ['Office', 'Who gets texts shows who would get a text right now vs. quiet now, and a day chart: tap any time to see who gets it and who doesn\'t, and why.', 'Messaging → Who gets texts shows who would get a pickup text right now and who is quiet now. A chart of the day lets you tap any time to see who gets a text then, who does not, and why.', 'new'],
      ['Office', 'Who gets texts: a Quiet hours view (every quiet time, quiet day and away date; quiet times that cover most of the day are marked "check?") and an Inactive view (who made them inactive and when, last pickup, "Make active again"). The "turned off since Oct 9" part is gone.', 'Two more views in Who gets texts. Quiet hours lists every driver\'s quiet times, quiet days and away dates; a quiet time that covers most of the day is marked "check?" in case it is a mistake. Inactive lists who made a driver inactive and when, their last pickup, and a "Make active again" button.', 'new'],
      ['Texts', '"Inactive" is now just a label for the office — inactive drivers in the Default text group keep getting pickup texts.', 'Marking a driver "Inactive" no longer stops their texts — it is only a note for the office. If they are in the Default text group, they still get pickup texts. To stop texts, take them out of the group or turn their texts off.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-12T00:22',
    title: 'Long text conversations, alerts clean up',
    items: [
      ['Office', 'Taking a driver off a pickup texts the driver a confirmation and sends the pickup out again as new.', 'When the office takes a driver off a pickup, the driver gets a text saying they are off it. If the pickup still needs someone, it is texted again right away as a new pickup, so another driver can take it. The driver who came off is not texted about it.', 'change'],
      ['Office', 'Tap "36 drivers" on a pickup to see who got the text and why the others didn\'t (quiet hours, away, app only…).', 'On a pickup, tap the number of drivers it was texted to (for example "36 drivers") to see who got the text. Drivers who did not get it are listed with the reason, like quiet hours, away or app only.', 'new'],
      ['Office', 'Messaging → Who gets texts: everyone on and off texts right now and why, incl. who turned texts off since Oct 9 — turn back on in one tap.', 'A new page, Messaging → Who gets texts, lists every driver whose texts are on or off right now, and why. It also listed who turned texts off since Oct 9, with one tap to turn them back on.', 'new'],
      ['Office', 'Long text conversations now show the newest messages (they used to stop at an old date after 500). "Show all" loads the whole history.', 'A text conversation with many messages now opens on the newest ones. Before, it stopped at an old date after 500 messages. Tap "Show all" to load the whole history.', 'fix'],
      ['Office', 'Alerts that are no longer needed (a driver took it, the text was answered) clear themselves from the bell and from the tablet\'s pop-ups.', 'Alerts that don\'t need you anymore go away by themselves — for example, when a driver took the pickup or someone in the office answered the text. They leave the bell and close on the tablet too.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-11T08:18',
    title: 'Faster app',
    items: [
      ['Office', 'Office opens much faster: it loads this week\'s pickups and anything still open, not 3 months of history. History and List load their own dates when you open them. All counts stay the same.', 'The office portal opens much faster. At first it loads only this week\'s pickups and anything still open, not three months of history. History and List load their own dates when you open them. Counts and reports stay the same.', 'change'],
      ['Office', 'Pickups → History and List show 50 at a time, with "Show more" at the bottom (Export still includes everything).', 'Pickups → History and List show 50 pickups at a time. Tap "Show more" at the bottom for more. Export still includes everything.', 'change'],
      ['Office', 'The pickup list refreshes on every change as before, and checks every minute instead of every 30 seconds.', 'The pickup list still updates right away when anything changes. The extra background check now runs every minute instead of every 30 seconds, which saves data.', 'change'],
      ['Office', 'Store lists and store chats no longer download big store pictures each time; logos load on their own.', 'Store lists and store chats no longer download big store pictures every time. Logos load by themselves, so these screens open faster.', 'change'],
      ['Drivers', 'The app downloads much less: replies are compressed, and screens like the office portal, map, sign-up forms and kiosk load only when opened.', 'The app uses less data. Replies from the server are compressed, and big screens (office portal, map, sign-up forms, kiosk) load only when someone opens them.', 'change'],
      ['Drivers', 'Filter-proof mode turns on by itself only on devices where an internet filter blocked something (and it tries again right away).', 'Some internet filters block parts of the app. Filter-proof mode now turns on by itself only on a device where a filter blocked something, and it tries again right away. Other devices work as usual.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-11T08:18',
    title: 'Pickup contact choice',
    items: [
      ['Forms', 'The public form\'s store list shows only real, approved stores — no test or private entries.', 'The store list on the public forms shows only real stores we approved. Test entries and private ones are hidden.', 'change'],
      ['Stores', 'Store app: posting a pickup suggests your past contacts and addresses, most used first.', 'When a store posts a pickup in its app, the form suggests the contacts and addresses it used before, most used first. Tap one to fill it in.', 'new'],
      ['Forms', 'Public pickup forms recognize a store we already work with and fill its address and phone.', 'When someone fills a public pickup form for a store we already work with, the form knows the store and fills in its address and phone. Only business info is filled in, nothing private.', 'new'],
      ['Office', 'New pickup: when the store, name, address or phone was used before, it shows past contacts and addresses — most used first — to pick from, or type someone else.', 'On the office New pickup form, if the store, name, address or phone was used before, it shows the past contacts and addresses, most used first. Pick one, or type someone new.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-11T04:21',
    title: 'New pickup form',
    items: [
      ['Office', 'Picking a saved store fills its name, address and phone (this was broken: the form read the store\'s address and phone under the wrong names, so only the name and town came through).', 'Picking a saved store on the New pickup form now fills its name, address and phone. Before, because of a bug, only the name and town came through.', 'fix'],
      ['Office', 'The address shows as one line with "change"; stores without an address are looked up by name and saved, so you type it only once.', 'The address shows as one line with a "change" link. If a store has no address on file, we look it up by name and save it, so you type it only once.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-11T04:00',
    title: 'Filter-proof data, store texts',
    items: [
      ['Office', 'Type a store\'s name (e.g. "Evergreen") and pick it — address, phone and map spot fill in.', 'On the pickup form, start typing a store\'s name (for example "Evergreen") and pick it from the list. The address, phone and map spot fill in by themselves.', 'new'],
      ['Office', 'Suppliers → "Find missing locations" puts stores without a map spot on the map (you approve each).', 'Suppliers → "Find missing locations" looks up stores that are not on the map yet. You check each one and approve it before it is saved.', 'new'],
      ['Stores', 'Texts to stores ("driver on the way" and "your food was picked up") are off. Each store profile has switches to turn them on later.', 'The texts to stores — "driver on the way" and "your food was picked up" — are off for every store. Each store profile has two switches to turn them on later, one store at a time.', 'change'],
      ['Stores', 'Stores choose in their app how to hear from us — app pop-up, text, both or off — for "driver on the way" and "picked up". The office switch still decides if a notice is used at all.', 'When the office turns a store notice on, the store chooses in its own app how to get it: app pop-up, text, both, or off. The office switch still decides if the notice is used at all. STOP still stops texts.', 'new'],
      ['Office', 'If an internet filter blocks part of a page, the screen now says so plainly. All data is sent scrambled so filters can\'t read or block it.', 'If an internet filter blocks part of a page, the screen now says so in plain words instead of showing a strange error. The data is sent scrambled, so filters can\'t read it or block it.', 'new'],
      ['Office', 'Driver and store profiles show how fast pickups usually get taken, with View all (who took it and after how long).', 'Driver and store profiles show how fast their pickups usually get taken. Tap "View all" to see each pickup, who took it, and how long it took.', 'new'],
      ['Office', 'If an internet filter blocks something, a banner at the top says so.', 'When an internet filter blocks something, a banner at the top of the screen says so. Then you know it is the filter, not the app.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-11T03:06',
    title: 'Driver map, store picked-up text, New sign-ups, call log, dispatcher alerts, At a glance, kiosk mode, store profile, code words',
    items: [
      ['Office', 'Driver messages → Code words: every word drivers can text (PICKUPS, INFO, DONE, CANCEL, STOP…), what it does, who used it and when. DONE / CANCEL work but are no longer mentioned in our texts.', 'Messaging → Driver messages → Code words lists the words people can text us (like PICKUPS, INFO, DONE, CANCEL, STOP), what each does, how often it was used, and by whom. DONE and CANCEL still work, but our texts no longer mention them.', 'new'],
      ['Office', 'One "Messaging" menu item again (as before Oct 9): Driver messages (texts, app chat, replies, code words), Store chat, Send texts, Emails — with the unread count on it.', 'The menu has one "Messaging" item again, like before Oct 9. Inside are Driver messages (texts, app chat, replies, code words), Store chat, Send texts and Emails. The unread count shows on Messaging.', 'change'],
      ['Drivers', 'A real map in the app: open pickups as pins (yours in green), tap a pin to Take it or get Directions; "Show my location"; a list under the map.', 'The driver app has a real map. Open pickups are pins, and your own pickups are green. Tap a pin to take the pickup or get directions. "Show my location" puts you on the map, and there is a list under it.', 'new'],
      ['Stores', 'Stores get a text when their food is picked up: "Moshe picked up your donation at 3:12 PM. Thank you!" (8 AM–9 PM, never Shabbos).', 'Stores could get a text when their food is picked up, with the driver\'s first name and the time. It goes only 8 AM–9 PM and never on Shabbos. (Later the same day this text was turned off by default — see "Filter-proof data, store texts".)', 'new'],
      ['Office', 'Drivers → New sign-ups: everyone waiting for review, their answers, and one-click Approve (Active + Default text group + optional welcome text) or Not now.', 'Drivers → New sign-ups shows everyone who applied and is waiting for review, with their answers. Approve makes them active, adds them to the Default text group and can send a welcome text. "Not now" declines them.', 'new'],
      ['Office', 'On call now: "Log call" after calling a driver (Will take it / Can\'t / No answer / Left a message + note); the card shows who was already called today.', 'On the Live Board under "On call now", tap "Log call" after you call a driver and pick what happened: Will take it, Can\'t, No answer, or Left a message, with a note. The card shows who was already called today, so nobody calls twice.', 'new'],
      ['Office', 'Driver profile → Alerts & schedule → On call: "Recent calls" with who called, when, what happened.', 'On a driver\'s profile, Alerts & schedule → On call shows "Recent calls": who called them, when, and what happened.', 'new'],
      ['Texts', 'Automatic checks of the text replies run before every go-live (117 tests).', 'Before each go-live, automatic checks test how text replies are read and how our texts are written (117 checks at the time; more now). They catch mistakes before they reach drivers.', 'new'],
      ['Office', 'Dispatcher alerts: pop-up with a beep + a bell in the portal, and a phone notification to whoever is on duty — new text reply, driver gave a pickup back, store post with no driver after 15 min, pickup starting within an hour with no driver, reply not opened in 10 min.', 'The office gets alerts with a beep and a bell in the portal, and a phone notification for the dispatcher on duty. They come for a new text reply, a driver giving back a pickup, a store post with no driver after 15 minutes, a pickup starting within an hour with no driver, and a reply nobody opened in 10 minutes.', 'new'],
      ['Office', '"Turn on phone alerts" (bell menu, Settings, My shift): add the portal to the phone\'s Home Screen first.', 'To get alerts on your phone, tap "Turn on phone alerts" in the bell menu, Settings or My shift. On a phone, first add the portal to the Home Screen, or the phone won\'t allow alerts.', 'new'],
      ['Office', 'Driver Overview → "At a glance": a one-line verdict, their latest texts/tries/app use, and last-30-day numbers; "Show all activity" opens the full list.', 'A driver\'s Overview starts with "At a glance": a one-line summary, their latest texts, tries and app use, and numbers for the last 30 days. "Show all activity" opens the full list.', 'new'],
      ['Kiosk', 'Kiosk mode: ⚙ on the kiosk start screen → Start kiosk mode (PIN). The browser stays on the kiosk — back, reload, other pages and shortcuts are blocked — until someone taps 🔒 and enters the PIN.', 'On the kiosk start screen, tap ⚙ → Start kiosk mode and use the PIN. The browser then stays on the kiosk — back, reload and other pages are blocked — until someone taps 🔒 and types the PIN.', 'new'],
      ['Kiosk', 'Kiosk mode: the browser Back button stays on the kiosk; exiting with the PIN also turns off the old "this device is the kiosk" switch.', 'In kiosk mode, the browser Back button stays on the kiosk page. Leaving kiosk mode with the PIN also turns off the old "this device is the kiosk" switch.', 'fix'],
      ['Office', 'Store profile → Overview: At a glance (how often they give, how many get picked up, steady days with no driver), stats, usual drivers, days, steady schedule, what they give, texts, and "Show all".', 'A store profile\'s Overview starts with At a glance: how often they give, how much gets picked up, and steady days with no driver. Under it are stats, usual drivers, days, the steady schedule, what they give, and texts, with "Show all".', 'new'],
      ['Office', 'Driver "Gave back" and Reliability count only real give-backs (released before the pickup, not office-cancelled) — old cleanups no longer count against drivers.', 'A driver\'s "Gave back" number and reliability count only real give-backs: pickups the driver let go before the time. Pickups the office cancelled or cleaned up no longer count against them.', 'fix'],
      ['Stores', '"Same as last time" says it opens the form filled in — every field can be changed before posting.', 'In the store app, the "Same as last time" button now says it opens the form already filled in. The store can change any field before posting.', 'change'],
      ['Kiosk', 'The old "Make this device the kiosk" switch is gone — use ⚙ → Start kiosk mode on the kiosk page. Settings has "Open the kiosk" and "Copy kiosk link". Tablets that used the old switch move to the new mode by themselves.', 'The old "Make this device the kiosk" switch is gone; use ⚙ → Start kiosk mode on the kiosk page. Settings has "Open the kiosk" and "Copy kiosk link". Tablets that used the old switch moved to the new mode by themselves.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-11T00:38',
    title: 'Cancelled pickups show as cancelled, with Un-cancel',
    items: [
      ['Office', 'A cancelled pickup shows a grey "Cancelled" tag (reason on hover) and no "Assign driver" button.', 'A cancelled pickup shows a grey "Cancelled" tag (point at it to see why) and no "Assign driver" button — in History, lists and Live Board cards.', 'fix'],
      ['Office', 'Inside a cancelled pickup: a banner at the top with when and why, and an "Un-cancel" button (text drivers now, or just put it back). The history shows who un-cancelled it.', 'When you open a cancelled pickup, a banner at the top says when and why it was cancelled. "Un-cancel" brings it back: you choose to text drivers now, or just put it back. The history shows who un-cancelled it.', 'new'],
    ],
  },
  {
    liveAt: '2026-10-10T23:41',
    title: 'Clearer pickup texts, text bug fixes, "Text drivers now"',
    items: [
      ['Texts', 'The newest pickup is on top of the text, marked "NEW:", then "Also still open:" with the rest — each line keeps its own reply number.', 'In pickup texts, the newest pickup is on top with "NEW:", then "Also still open:" with the others. Every line keeps its own reply number, so drivers can take any of them.', 'change'],
      ['Office', 'Admin → What\'s new: this page, with every update and its go-live date.', 'This page: Admin → What\'s new. It lists every update, who it affects, and when it went live. Tap an update with an arrow to read more.', 'new'],
      ['Texts', 'A bare "Cancel" gives back your pickup (or asks which one) — only STOP stops all texts.', 'If a driver texts just "Cancel", it gives back their pickup (or asks which one if they have several). Only STOP turns off all texts. Before, "Cancel" could turn off a driver\'s texts by mistake.', 'fix'],
      ['Texts', '"347." or "#347" counts as taking pickup 347.', 'Drivers often type "347." or "#347". Both now count as taking pickup 347, the same as "347".', 'fix'],
      ['Texts', 'Drivers whose quiet time ends early morning get the open pickups at about 9:05 AM.', 'Drivers whose quiet time ends before the texting day starts now get the open pickups a few minutes after it starts. It was about 9:05 AM; since Oct 12 the texting day starts at 8 AM, so it is about 8:05 AM.', 'change'],
      ['Texts', 'The 90-minute "still no driver" text is plain, shows the store, never a family name, and follows drivers\' settings.', 'When a pickup still has no driver after 90 minutes, drivers get a reminder text. It is now short and plain, shows the store name (never a family\'s name), and follows each driver\'s text settings.', 'change'],
      ['Stores', 'Store cancel/edit texts to drivers never go out on Shabbos.', 'When a store cancels or changes a pickup, the texts to its drivers never go out on Shabbos.', 'fix'],
      ['Office', 'The office new-pickup alert shows the real number and group (no more "code undefined").', 'The office alert for a new pickup now shows the real pickup number and text group. Before, it sometimes said "code undefined".', 'fix'],
      ['Texts', 'A driver writing "call my landline" no longer gets their texts turned off.', 'Before, a driver who wrote something like "call my landline" could have their texts turned off by mistake. Now only real phone auto-replies (like "this number cannot receive texts") turn texts off.', 'fix'],
      ['Office', '"Text drivers now" unticked on a new pickup = no text right away; it goes out with the next pickup text and shows in PICKUPS. (HOLD by text still waits for SEND.)', 'On a new pickup, if "Text drivers now" is not ticked, there is no text right away. The pickup still goes out with the next pickup text and shows in PICKUPS. A pickup added by text with HOLD still waits for SEND.', 'change'],
    ],
  },
  {
    liveAt: '2026-10-09T17:52',
    title: 'Driver app round 2, smarter texts, Shabbos by candle lighting, simpler forms, store app, kiosk, office',
    items: [
      ['Drivers', '"I can\'t make it" and "Decline" buttons on a pickup; the office is told.', 'A pickup in the driver app has "I can\'t make it" and "Decline" buttons. When a driver taps one, the office is told and the pickup can go to someone else.', 'new'],
      ['Drivers', 'Each pickup shows its text number ("Text code: 37").', 'Each pickup in the driver app shows its text number, for example "Text code: 37", so drivers can match it with our texts.', 'new'],
      ['Drivers', '"Done — dropped off" from any step and from pickup cards; miles optional.', 'Drivers can tap "Done — dropped off" from any step of a pickup and from the pickup cards. Miles are optional.', 'change'],
      ['Drivers', 'Home: "Coming up" pickups; pausing texts asks For today / For a week / Until I turn it back on.', 'The driver home screen shows "Coming up" pickups. When a driver pauses texts, the app asks for how long: today, a week, or until they turn it back on.', 'new'],
      ['Drivers', '"Can\'t connect — try again" when there is no signal, instead of "Nothing open".', 'When the phone has no signal, the app says "Can\'t connect — try again" instead of "Nothing open", so drivers don\'t think there are no pickups.', 'fix'],
      ['Drivers', 'My Activity counts every finished pickup.', 'A driver\'s My Activity now counts every pickup they finished, not only some kinds.', 'fix'],
      ['Drivers', 'Profile on the bottom bar, bigger text and buttons, unsaved-changes warning, friendly crash screen.', 'Profile is on the bottom bar of the driver app. Text and buttons are bigger, the app warns before you leave unsaved changes, and a friendly screen shows if something breaks.', 'change'],
      ['Drivers', 'Away dates, Quiet days and "App only" settings are now followed.', 'Before, drivers could set Away dates, Quiet days and "App only" in the app, but our texts did not follow them. Now every pickup text and app alert follows these settings.', 'fix'],
      ['Texts', 'STOP / START; "309 CANCEL" gives a pickup back; a bare DONE or "yes" is understood.', 'Drivers can text STOP to stop all texts and START to get them again. "309 CANCEL" gives back pickup 309. A bare DONE is understood, and a bare "yes" gets the question "Which one? Reply its number".', 'new'],
      ['Texts', '"You already have pickup 309" instead of "someone beat you".', 'If a driver texts the number of a pickup they already took, the answer is "You already have pickup 309" instead of "someone beat you".', 'fix'],
      ['Texts', 'PICKUPS shows the same pickups as the new-pickup text; "Pickup", "List", "Open" and typos work.', 'The answer to PICKUPS lists the same pickups as the new-pickup text. "Pickup", "List", "Open" and small typos work too.', 'fix'],
      ['Texts', 'Shorter pickup lines; accept text says how to finish (DONE) and give back (CANCEL).', 'Lines in pickup texts are shorter. The text a driver gets after taking a pickup said how to finish (DONE) and give back (CANCEL). Since Oct 11 our texts no longer mention DONE and CANCEL, but both still work.', 'change'],
      ['Texts', 'Texts stop 15 minutes before Monsey candle lighting until Motzei Shabbos; Yom Tov through 2028.', 'Automatic texts stop 15 minutes before Monsey candle lighting and start again after Motzei Shabbos, worked out for each week. Yom Tov works the same way, with dates through 2028. Before, a fixed Friday 5 PM time was used.', 'change'],
      ['Texts', 'Drivers coming out of their quiet time get one text with the pickups still open.', 'A driver whose own quiet time just ended gets one text with the pickups still open, so they don\'t miss what came in while they were quiet.', 'new'],
      ['Texts', 'Store replies reach the office with the store\'s name; the store gets a thank-you.', 'When a store texts back, the office sees the store\'s name with the message, and the store gets a short thank-you. A plain "thank you" from a store is not sent to the office.', 'new'],
      ['Forms', 'Store, steady-pickup and one-time donation forms are short and simple.', 'The sign-up forms for stores, steady pickups and one-time donations are shorter and easier, with fewer questions.', 'change'],
      ['Forms', 'The public one-time form no longer shows drivers or office tools.', 'The public one-time donation form no longer shows the driver list or office tools. Donors see only what they need to fill in.', 'fix'],
      ['Office', 'New stores from the public sign-up wait for approval (Suppliers → Approve).', 'Stores that sign up on the public form wait for approval. In Suppliers they have a "Waiting for approval" tag; tap Approve to add them. Until then they are hidden from public lists and the kiosk.', 'new'],
      ['Stores', 'Drivers are told when a store cancels or edits; 5-second Undo on cancel.', 'When a store cancels or changes a pickup in its app, the drivers on it are told. After cancelling, the store has 5 seconds to tap Undo.', 'new'],
      ['Stores', 'My Pickups shows today and tomorrow first; shorter store profile; plain errors.', 'In the store app, My Pickups shows today and tomorrow first. The store profile is shorter, and errors are in plain words.', 'change'],
      ['Kiosk', '"Your drop-off is saved ✓" when labels don\'t print; no double saves; longer thank-you.', 'If labels don\'t print at the kiosk, it still says "Your drop-off is saved ✓". A drop-off can\'t be saved twice, and the thank-you screen stays longer.', 'fix'],
      ['Office', 'Assign a driver shows everyone: recommended, on call and regulars first; search by unit #.', 'The "Assign a driver" list shows everyone, with recommended, on-call and regular drivers first. You can search by unit number.', 'change'],
      ['Office', 'Rewards can\'t pay twice if a reward is renamed.', 'Rewards are tracked so a driver can\'t be paid twice for the same period, even if a reward\'s name is changed.', 'fix'],
      ['Office', '"Did these happen?" has 7/30 days and Mark all done.', 'The "Did these happen?" list can show the last 7 or 30 days, and "Mark all done" clears many at once.', 'new'],
      ['Office', 'Reports split Done from Took it, not checked in.', 'Reports show "Done" (signed in at the kiosk or marked done) apart from "Took it, not checked in" (a driver took it but never signed in at the kiosk).', 'change'],
      ['Office', 'One Driver messages inbox; Repost on cards; Waiting N chip; "Are you sure?" on one-click actions.', 'Driver texts and app messages are in one Driver messages inbox. Pickup cards have a Repost button, a "Waiting N" chip shows how long a pickup has waited, and one-click actions ask "Are you sure?" first.', 'change'],
      ['Office', 'Phone-app alerts to a pickup\'s drivers work again.', 'App notifications to the drivers on a pickup (for example when it changes) had stopped working. They work again.', 'fix'],
    ],
  },
  {
    liveAt: '2026-10-09T09:46',
    title: 'Deliveries, rewards, on-call hours, Alerts & schedule tab, texting rules',
    items: [
      ['Office', 'Deliveries from 3 Regina Road to a family; drivers never see the family\'s name.', 'The office can set up deliveries from 3 Regina Road to a family. The driver gets the address (and with INFO, the family\'s phone), but never sees the family\'s name.', 'new'],
      ['Office', 'Rewards: each driver\'s own 30-day period; 4+ = $10 ice cream, 8+ = $25 gas card.', 'Rewards are counted per driver over their own 30-day period: 4 or more pickups = $10 ice cream, 8 or more = $25 gas card. See Reports → Rewards. Giving a reward does not restart the count.', 'change'],
      ['Office', 'Alerts & schedule tab on every driver: texts, groups, quiet times, on-call, steady pickups and reminders, what\'s coming up.', 'Every driver\'s profile has an "Alerts & schedule" tab: their texts, groups, quiet times, on-call hours, steady pickups and reminders, and what is coming up — all in one place.', 'new'],
      ['Office', 'Profile says plainly whether a driver really gets pickup texts, and why not.', 'A driver\'s profile says in plain words if they really get pickup texts right now, and if not, why not (for example quiet hours, or not in the group).', 'new'],
      ['Office', 'The big group is now "Default text group"; adding someone to it is the review.', 'The main texting group is now called "Default text group". Adding a driver to it is how the office approves them for pickup texts.', 'change'],
      ['Office', 'Pickup page shows time left in the queue with −1 / +1 / +3 / +6 hour buttons.', 'The pickup page shows how much time drivers still have to take it, with buttons to change it by −1, +1, +3 or +6 hours. (Since Oct 12 this reads in plain English.)', 'new'],
      ['Office', 'Reposting an expired pickup asks "Text drivers now?" or "just the queue".', 'When you repost a pickup that expired, it asks: text drivers now, or just put it back in the queue?', 'new'],
      ['Office', '"Did you drop it off?" text is a per-driver switch, off for everyone.', 'The "Did you drop it off?" reminder text is a switch on each driver\'s profile. It is off for everyone until the office turns it on.', 'change'],
      ['Office', 'Do-not-contact drivers get no steady reminders unless you turn them on.', 'Drivers marked do-not-contact don\'t get steady pickup reminders. The office can still turn them on for one driver (it asks first).', 'change'],
      ['Office', 'Style pass: 12-hour times, "Thu, Oct 9" dates, plain sentences instead of codes.', 'Across the office, times are in 12-hour style (4:00 PM), dates look like "Thu, Oct 9", and codes were replaced with plain sentences.', 'change'],
      ['Drivers', 'On-call hours ("happy to be called") in the profile; "On call now" on the Live Board.', 'Drivers can set the hours when they are happy to get a phone call about a waiting pickup. The Live Board shows "On call now" with who can be called.', 'new'],
      ['Drivers', 'Several quiet times allowed; hours can run past midnight.', 'A driver can have more than one quiet time, for example morning and night. Hours can go past midnight, like 10 PM–7 AM.', 'new'],
      ['Texts', 'A new pickup\'s text also lists all the other open pickups.', 'When a new pickup is texted, the same text also lists all the other pickups still open, with the new one first.', 'change'],
      ['Texts', 'Pause and Shabbos also stop app notifications.', 'When the office pauses texts, and on Shabbos, app notifications about pickups stop too — not only texts.', 'change'],
      ['Stores', 'Stores get a text when a driver is on the way.', 'Stores that posted a pickup got a text when a driver was on the way. Since Oct 11 this text is off unless the office turns it on for that store.', 'new'],
      ['Forms', 'Volunteer application asks about texts, urgent alerts, reminders and on-call hours.', 'The volunteer application asks if they want texts, urgent alerts and steady reminders, and when they are happy to be called (on-call hours).', 'new'],
    ],
  },
  {
    liveAt: '2026-10-08T10:32',
    title: 'Audit fixes, store summary, gas rewards, text fixes',
    items: [
      ['Office', 'Security: dev can\'t text real people; open admin pages locked.', null, 'fix'],
      ['Office', 'Store profile shows "What they usually give".', null, 'new'],
      ['Office', 'Send SMS asks before texting a pickup again.', null, 'new'],
      ['Texts', 'INFO only while a pickup is open; closed INFO offers what is open.', null, 'change'],
      ['Stores', 'Store My Pickups page and a friendlier thank-you.', null, 'new'],
      ['Office', 'Form popups no longer close on an outside click (lost typing).', null, 'fix'],
    ],
  },
  {
    liveAt: '2026-10-07T01:43',
    title: 'Reports, store posts, Live Board',
    items: [
      ['Office', 'Reports tiles: counts match the filters; distinct stores and drivers lists.', null, 'fix'],
      ['Stores', 'Simpler store post form with a confirmation.', null, 'change'],
      ['Office', 'Live Board "usually active now" card.', null, 'new'],
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
const kindOf = (it: Item): Kind => (it.length === 4 ? it[3] : 'change');
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
                            <button type="button" onClick={() => openReportProblem({ kind: 'comment', whatsNewItem: ref })}
                                    className="haptic rounded-full border border-line bg-paper px-3 py-1 text-[12px] font-bold text-ink hover:bg-cream">💬 Comment</button>
                            <button type="button" onClick={() => openReportProblem({ kind: 'problem', whatsNewItem: ref })}
                                    className="haptic rounded-full border border-line bg-paper px-3 py-1 text-[12px] font-bold text-ink hover:bg-cream">🐞 Something&apos;s wrong with this</button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-start gap-2">{kindTag}{tag}{newTag}{cTag}<span>{t}</span></div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
