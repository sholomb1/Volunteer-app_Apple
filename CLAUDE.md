# Zeh L'Zeh Food-Rescue App — Build Spec

> Handoff for **Claude Code**. Keep this file at the repo root as `CLAUDE.md` (it's read automatically). The `screens/` mockups in this kit define the target look and flows — build to match them.

## 1. What we're building

One self-hosted **Progressive Web App** (installable on Android/iOS, runs in any browser) that replaces two clunky native apps with a single, clean experience across three roles:

- **Volunteer** — see available pickups, claim/sign up, navigate, mark picked-up/delivered, and track their own activity (four metrics, below).
- **Supplier** (store/donor) — post "food is ready now" in a few taps and see who's coming.
- **Coordinator** (admin) — a desktop dispatch portal: map, live feed, assign drivers, manage stores/volunteers, report.

The UI is **original** but its UX patterns are deliberately lifted from two best-in-class apps (we are copying *concepts*, not code, so there are no license/stack entanglements):
- **Karrot** → the map + date-grouped activity feed, the **sign-up slot avatars** (filled vs. dashed-empty showing "2 of 4 needed"), per-pickup chat, and the coordinator portal's left-nav + Places layout.
- **Sharing Excess** → the colour-coded task-hub home, the detail screen with summary stats and **chip selectors**, and the quantity slider.

### The mockups (source of truth for the face)
- `screens/01-role-screens.html` — volunteer home, available-pickups feed, pickup detail + status timeline, supplier "post a pickup", and the desktop coordinator console.
- `screens/02-volunteer-activity.html` — the four-metric tracker and per-trip capture.
- `screens/03-coordinator-portal.html` — the full Karrot-style coordinator portal (map + nav + Places + activity feed).

Match these layouts, the design tokens in §9, and the flows. Palette, logo, and placeholder store/volunteer names are swappable for the real Zeh L'Zeh identity.

## 2. Hard constraints — do not violate

- **Stack:** React PWA frontend (TypeScript, Vite). **Node/Express** backend (TypeScript). **PostgreSQL** (matches the existing InvenTree/IONOS world; use Prisma or Knex). **No Django, no Python web backend, no PHP.**
- **InvenTree integration is API-ONLY.** Never modify InvenTree backend files (`urls.py`, `api.py`), never touch its database directly, never add plugins requiring backend changes. All interaction is outbound HTTPS from this app to InvenTree's REST API with token auth, against **existing** endpoints only. Discover the live schema from the running instance's OpenAPI rather than hardcoding. (See §6.)
- **Self-host** on the existing VPS with **PM2 + nginx + Let's Encrypt**, mirroring the `donate.zehlzeh.org` deploy pattern. No Railway/Vercel/Bun-only assumptions.
- **Git:** work on the `staging` branch (→ staging server). Never push directly to `deployment` (→ production/live). Small PRs.
- **Notifications:** primary channel is **ntfy.sh** (already wired for Android here); web push + email (reuse the donation platform's Gmail SMTP) as fallbacks. (See §7.)
- No secrets in the repo. Use `.env` (gitignored) + document in `.env.example`.

## 3. Roles & screens to build

| Role | Screens (match the mockups) |
| --- | --- |
| Volunteer | Home (task-hub cards) · Available Pickups feed (date groups + sign-up slots) · Pickup Detail (stats, container chips, status timeline) · **My Activity** (four metrics + log) · Pickup capture (auto miles/time, editable) |
| Supplier | Post a Pickup (food-type chips, quantity slider, container chips, ready-by time, refrigerated toggle, photo) · My posted pickups + status |
| Coordinator | Portal: top bar + left (map, nav, Places) + main live feed with slots, status pills, assign-driver · Volunteers · Suppliers · History · Reports |

## 4. Data model (Postgres)

- **Supplier** — name, contacts, address/geo, default pickup notes, hours, status (active/paused).
- **Recipient** — destination pantry/org: name, address/geo, capacity, accepted food types.
- **Volunteer** — profile, phone, vehicle/capacity, service area, availability, notification prefs.
- **Pickup** (central) — origin (supplier), destination (recipient, optional until assigned), items `[{foodType, quantity, unit, perishable, photo?}]`, time window (`ready_at`, `expires_at`), status (see §5), volunteer signups (many — supports the slot model), per-transition timestamps, proof (photo/weight), and the linked InvenTree stock record id(s).
- **PickupSignup** — `(pickup_id, volunteer_id, slot)` so a pickup can need N volunteers and show filled vs. open slots (the Karrot pattern). Enforce capacity with a transaction / row lock so two volunteers can't claim the last slot simultaneously.
- **FoodType** — canonical list; maps to InvenTree Part/category.
- **ActivityLog** — per-volunteer, per-pickup record powering the four metrics (§8): `volunteer_id, pickup_id, store_id, miles, minutes, completed_at`.

**Pickup lifecycle:** `ready` → `claimed` → `en_route` → `picked_up` → `delivered` → `closed`. Side states: `cancelled`, `expired` (window passed unclaimed → re-notify/escalate to coordinator).

## 5. Feature spec by role

**Supplier — "food is ready":** one-tap new pickup → quick form (food-type chips, quantity slider, container chips, ready-by, refrigerated toggle, optional photo) → posts and notifies nearby volunteers. This supplier-initiated real-time post is the core net-new flow — build it first-class.

**Volunteer:** feed/map of available pickups → **sign up for a slot** (slots show filled avatars + open dashed slots; "2 of 4 needed") → navigate to supplier then recipient → mark picked-up (photo/weight) → mark delivered. Release a claimed slot with notice. Per-pickup chat. Plus the activity tracker (§8).

**Coordinator:** live board (map + date-grouped feed) of all pickups by status; manually assign/reassign volunteers and recipients; nudge; manage suppliers/recipients/volunteers/food types; reports (incl. volunteer hours & miles for grant/reimbursement export).

## 6. Volunteer activity tracking — EXACTLY four metrics

Track only these, per the mockup (`02-volunteer-activity.html`). **No badges, milestones, streaks, or gamification.**

1. **Number of pickups** — count of completed pickups.
2. **Miles** — sum of trip distances (store → drop-off).
3. **Stores** — number of distinct stores picked up from (show distinct-store count; total visits available as a secondary figure if wanted).
4. **Hours** — total time spent on pickups.

Rules:
- **Miles and hours are captured automatically** from the trip (start on depart/claim, stop on delivery) and are **editable before saving** (GPS can be off). Pure manual entry gets skipped — auto-with-edit is the pattern.
- Totals are scopable (This month / All time) and **exportable** (CSV) for the office.
- Each `ActivityLog` row rolls up into the four totals; the per-pickup capture screen is the write path.

## 7. InvenTree integration (API-only)

Thin `inventree` client module in the Node backend; outbound REST only, token auth, no backend mods.
- **On delivery:** create/adjust stock in InvenTree for rescued items (map `FoodType` → InvenTree Part; create StockItem / stock adjustment at the recipient location). **Idempotent** — store the InvenTree record id on the Pickup, never double-post.
- **Discovery first:** fetch InvenTree's OpenAPI schema from the live instance and confirm exact endpoints/payloads before writing the client. Base URL + token in env. Provide a `--dry-run` mode that logs intended calls without posting.
- **Never a blocker:** if InvenTree is unreachable, the pickup still completes locally and the stock post is queued for retry. InvenTree is downstream.

## 8. Notifications

- Volunteer: new nearby `ready` pickup, slot reminders. Supplier: `claimed`, `delivered`. Coordinator: `expired`/escalation, unfilled slots.
- Primary ntfy.sh topic push; web push + email fallbacks. Keep routing in one service module, channels toggle-able per user.

## 9. Design system (match the mockups)

```
Fonts:   Display = Fraunces (600 for headers, italic for accents)
         Body    = Hanken Grotesk (400/600/700)
Palette: --cream #FAF5EC   --paper #FFFFFF   --ink #1C2A21   --muted #6E7C70
         --forest #2C5A3B  --forest-deep #1E3F29  --sage #E5EEE2  --sage-line #CFE0CC
         --clay #D27A4C (CTA/urgency)  --amber #E5A93F  --sky #3E6F8E
         --line #EAE3D4
Feel:    warm, generous spacing, rounded 14–20px cards, big tap targets,
         status via colour + check icons, chips for categorical input, sliders for quantity.
Signature pattern: sign-up slot avatars — filled circles (initials) + dashed empty circles,
         with "N of M needed" in clay when short, "covered" in forest when full.
```
These are placeholders — confirm/replace with the real Zeh L'Zeh brand before launch.

## 10. Milestones / definition of done

0. Scaffold: React+Vite PWA, Node/Express+TS API, Postgres, auth + roles, migrations/seeds, one-command local dev that runs without InvenTree.
1. Supplier "post a pickup" → visible to volunteers.
2. Volunteer feed + **slot sign-up** (capacity-safe) → navigate → picked-up → delivered, with per-pickup chat.
3. Volunteer activity tracker: the four metrics, auto-capture + edit, CSV export.
4. Notifications (ntfy.sh) for the key events.
5. Coordinator portal: map + live feed + assign/reassign + manage entities + reports.
6. InvenTree client: dry-run first, then live, idempotent stock-on-delivery.
7. PWA install/offline basics + mobile polish to match the mockups.
8. Staging deploy (nginx + PM2 + TLS) + README + `.env.example`.

Each milestone on `staging`; write a test for every status transition and for the InvenTree client.

## 11. Kickoff prompt for Claude Code

> Read CLAUDE.md and open the three files in `screens/`. Scaffold the app per §2 (React+Vite PWA, Node/Express+TS, Postgres) on the `staging` branch. Build to match the mockups' look (§9) and flows (§3, §5). Start with milestone 0, then the supplier post-a-pickup flow. InvenTree is API-only — never modify its backend. Pause for review at the end of each milestone.
