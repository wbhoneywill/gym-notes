# Design — Offline-First Workout Tracker

## Overview

A mobile-first, offline-first PWA for recording gym workouts, built on Next.js 16 (App
Router) with a Neon Postgres backend, Clerk authentication, and Nodemailer email. The
browser (IndexedDB + service worker) is the durable source of truth during a workout; the
Next.js API routes are an idempotent sync target backed by Postgres.

This document covers the full architecture, but the **first implementation milestone
(Milestone 0) is the foundation only** — exactly the files in Prompt 1, with just the
`users` table. Domain tables, routes, and UI follow in later milestones.

### Guiding principles

- **Recording a set never blocks on the network.** Writes land in IndexedDB first; sync is a
  background reconciliation, never a prerequisite for data entry.
- **Server is the authority for identity and ownership.** The client never asserts whose data
  it is; the server derives the user from Clerk and the `users` table.
- **Idempotent, append-only migrations.** `CREATE TABLE IF NOT EXISTS` statements run on every
  deploy via `postbuild`; new tables are appended, never rewritten destructively.
- **One API convention.** Every authenticated handler: auth → validate → try/catch →
  `Response.json`.
- **Derive, don't duplicate.** Analytics are computed from recorded sets, not stored as the
  authoritative aggregate.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        iPhone Safari (PWA)                     │
│                                                                │
│  React UI (App Router pages)                                   │
│       │                                                        │
│       ▼                                                        │
│  Local store layer  ──writes──►  IndexedDB  (source of truth   │
│       │                           for unsynced changes)        │
│       │                                                        │
│       ▼                                                        │
│  Sync engine  ◄── triggers: app open / focus / online / manual │
│       │                                                        │
│  Service worker (asset + app-shell cache, PWA manifest)        │
└───────┼────────────────────────────────────────────────────────┘
        │  HTTPS (batched, idempotent sync requests)
        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js 16 (serverless, Vercel-style)        │
│                                                                │
│  proxy.ts       ── Clerk route protection                      │
│       │                                                        │
│       ▼                                                        │
│  app/api/*/route.js  ── convention: getDbUser → validate →     │
│                          try/catch → Response.json             │
│       │                                                        │
│       ▼                                                        │
│  app/lib/db.js (Neon sql)   app/lib/auth.js (getDbUser)        │
│  app/lib/email.js (Nodemailer: Resend SMTP | local SMTP)       │
└───────┼────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Neon Postgres  — users + domain tables (idempotent migrate)   │
└─────────────────────────────────────────────────────────────┘

Deploy:  next build  →  postbuild: node scripts/migrate.js  (idempotent)
```

### Why these choices

- **Neon serverless driver + tagged-template `sql`.** Works over HTTP from serverless
  functions without connection-pool management; `fetchConnectionCache: true` reuses
  connections. Tagged templates parameterize queries, preventing SQL injection by default.
- **Clerk for auth.** Provides registration, login, logout, password recovery, and session
  management out of the box, with first-class Next.js middleware. Removes the need to build
  custom credential/token handling (satisfies the multi-user-readiness requirement without
  reinventing security primitives).
- **IndexedDB as source of truth.** The only browser storage able to hold structured,
  queryable workout data durably across reloads and restarts, and large enough for full
  session history. `localStorage` is too small/synchronous; in-memory state is not durable.
- **Idempotent sync via client-generated IDs.** iOS restricts background execution, so sync
  cannot rely on Background Sync APIs or `online`/`offline` events alone. Stable UUIDs plus
  server-side upserts make retries safe and exactly-once in effect.

## Milestone 0 — Foundation (built first)

Exactly the Prompt 1 deliverables. No domain tables/routes/UI beyond the placeholders.

### File layout

```
app/
  layout.js                        # Root layout, <ClerkProvider>
  page.js                          # Public landing placeholder
  globals.css                      # Minimal placeholder styles
  lib/
    db.js                          # Neon sql client
    auth.js                        # getDbUser()
    email.js                       # sendEmail()
  sign-in/[[...sign-in]]/page.js   # <SignIn />
  sign-up/[[...sign-up]]/page.js   # <SignUp />
  api/
    user/route.js                  # GET current user (placeholder, follows convention)
proxy.ts                           # Clerk middleware + route matcher (Next 16 convention)
scripts/
  migrate.js                       # Idempotent migration runner (users table only)
__tests__/
  setup.js                         # Shared Jest ESM mocks + helpers
  api/user.test.js                 # Example route test
jest.config.js
jsconfig.json
.gitignore
.env.example
package.json
```

### Key module contracts

**`app/lib/db.js`**
```js
import { neon } from '@neondatabase/serverless';
export const sql = neon(process.env.DATABASE_URL, { fetchConnectionCache: true });
```

**`app/lib/auth.js`**
```js
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/app/lib/db';

export async function getDbUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const rows = await sql`SELECT * FROM users WHERE clerk_user_id = ${userId}`;
  return rows[0] ?? null;
}
```

**`app/lib/email.js`** — `sendEmail({ to, subject, html })`. Transport selection:
`RESEND_API_KEY` present → Resend SMTP (`smtp.resend.com:465`, secure); otherwise
`SMTP_HOST`/`SMTP_PORT` defaulting to `localhost:1025`. Sender from `EMAIL_FROM`. Send wrapped
in try/catch; failures logged, never thrown.

**`proxy.ts`** (Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`;
same code) — `clerkMiddleware` + `createRouteMatcher`. Protected:
`/dashboard(.*)`, `/admin(.*)`, `/api(.*)`. Exempt: `/api/webhooks(.*)`. Standard
`config.matcher` skipping Next internals and static assets.

**`scripts/migrate.js`** — loads `.env.local` via dotenv, builds a Neon `sql` client, runs
each `CREATE TABLE IF NOT EXISTS` in a try/catch logging per-table progress; `process.exit(1)`
on failure. Milestone 0 creates only:
```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```
Written so later tables are appended following the same pattern.

### API route convention (applies to all later routes too)

```js
import { getDbUser } from '@/app/lib/auth';

export async function GET(request) {
  const user = await getDbUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // validate input → 400 on bad input
    // do work
    return Response.json({ user });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Testing harness

- `jest.config.js`: `testEnvironment: 'node'`, `transform: {}`,
  `moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }`,
  `testPathIgnorePatterns: ['/node_modules/', '__tests__/setup\\.js']`.
- `__tests__/setup.js`: exports `mockSql`, `mockGetDbUser`, Clerk `auth` mock, all registered
  with `jest.unstable_mockModule` before route imports; plus `resetMocks()` and
  `makeRequest(url, opts)` (sets JSON content-type).
- `__tests__/api/user.test.js`: dynamically imports the handler in `beforeEach` after
  `resetMocks()`; asserts 401 when `mockGetDbUser` resolves `null`, and the user payload when
  authenticated. The same pattern extends to cross-user access tests in later milestones.

### Milestone 0 verification

`npm install` → `npm test` (user-route tests green) → `npm run build`. Live DB connectivity is
not verifiable without real env vars and is reported as such.

## Domain architecture (later milestones)

### Data model

Entities and relationships (snapshot-on-start isolates history from template edits):

```
users (1)──<(N) workout_templates (1)──<(N) template_exercises >──(1) exercises
   │                                                                     │
   │                                                              exercise_muscles
   │                                                                     │
   │                                                             (N)>── muscle_groups
   │
   └──<(N) training_sessions (1)──<(N) session_exercises (1)──<(N) workout_sets
                   │
             (snapshot of template at start; never mutated by later template edits)

sync_change_log  — per-user record of applied client change IDs (idempotency ledger)
```

**Finalized decisions (Milestone 1, implemented in `scripts/migrate.js`):**

- **Primary keys:** `users` and `muscle_groups` use `SERIAL` (server-created / seeded,
  never offline). Everything client-creatable uses `UUID DEFAULT gen_random_uuid()` so IDs
  can be generated offline and are stable for idempotent sync: `exercises`,
  `workout_templates`, `template_exercises`, `training_sessions`, `session_exercises`,
  `workout_sets`. `sync_change_log` uses `BIGSERIAL`.
- **Units:** each `workout_sets` row stores a canonical `weight NUMERIC(7,2)` plus explicit
  `weight_unit` ('kg'|'lb'); `users.preferred_unit` (default 'kg') holds the display
  preference. Conversions are computed, never destructive.
- **Onboarding profile:** `users.onboarding_completed` defaults false for new accounts while
  the migration preserves existing accounts as completed. Optional `training_goal`,
  `experience_level`, and `training_days_per_week` fields personalize starter targets without
  affecting historical workout calculations.
- **Deletion:** templates and exercises soft-delete via `is_archived`; the session tree
  (`training_sessions` → `session_exercises` → `workout_sets`) cascades on delete; exercises
  referenced by templates/sessions use `ON DELETE RESTRICT` so history is never orphaned;
  `training_sessions.template_id` is `ON DELETE SET NULL` so archiving/removing a template
  leaves history intact.
- **Validation:** schema applied and idempotency verified against Postgres 16 before commit.
  `gen_random_uuid()` is built in (no `pgcrypto`/`uuid-ossp` extension required).

**User provisioning (Clerk → DB sync):** Clerk owns identity; the local `users` row is
created/updated/removed by a public webhook at `app/api/webhooks/clerk/route.js` (exempted
from auth in `proxy.ts`). It verifies the Svix signature with `verifyWebhook()` from
`@clerk/nextjs/webhooks` (reads `CLERK_WEBHOOK_SIGNING_SECRET`), then on `user.created` /
`user.updated` upserts `clerk_user_id`, primary email, and name via
`INSERT ... ON CONFLICT (clerk_user_id) DO UPDATE` (idempotent), and on `user.deleted`
removes the row (owned data cascades). Unhandled event types are acknowledged with 200 so
Clerk does not retry. This is the bridge that makes `getDbUser()` resolve a row for a signed-in
user.

**Lazy provisioning fallback:** `getDbUser()` also provisions the `users` row on demand — if
a valid Clerk session has no matching row, it reads `currentUser()` and upserts the row before
returning it. The webhook remains the primary path, but this fallback means a signed-in user
never lacks a row even if a webhook is missed, and it makes local development work without the
webhook (which only fires against the deployed URL).

**Starter data & post-sign-in landing:** the migration seeds ~18 shared exercises
(`owner_user_id IS NULL`), guarded by a partial unique index on `name WHERE owner_user_id IS
NULL` so the seed is idempotent. A minimal protected `/dashboard` page is the post-sign-in
landing spot (Clerk redirects here) and links out to the exercise library, with placeholders
for templates / training / history.

**First-run onboarding:** incomplete accounts are redirected from `/dashboard` to a skippable,
mobile-first `/onboarding` flow. `POST /api/onboarding` validates and stores the training
profile. When requested, it atomically creates one owned starter template from reviewed shared
exercise names and goal/experience-based set, repetition, and rest targets. It never prescribes
weight or starts a workout automatically. Completion hands off to plan review, the dashboard,
or an explicitly started first session. Existing users are not interrupted, and Settings links
to an edit mode that updates preferences without creating another starter plan.

**Known tech debt:** Clerk now recommends resource-based auth checks over
`createRouteMatcher` in middleware/proxy. Our API routes are already individually protected via
`getDbUser()` (the real data-layer gate); the proxy matcher is defense-in-depth. Migrating off
`createRouteMatcher` is deferred, non-blocking.

Core columns (indicative; finalized above):

- **exercises**: `id`, `owner_user_id` (nullable → shared), `name`, `primary_muscle_group_id`,
  `equipment`, `movement_category`, `description`, timestamps. Secondary muscles via
  `exercise_muscles(exercise_id, muscle_group_id, role)`.
- **muscle_groups**: `id`, `name`. Seeded, not hardcoded in the frontend.
- **workout_templates**: `id`, `owner_user_id`, `name`, `is_archived`, timestamps.
- **template_exercises**: `id`, `template_id`, `exercise_id`, `position`, `target_sets`,
  `target_rep_min`, `target_rep_max`, `target_weight`, `rest_seconds`.
- **training_sessions**: `id` (UUID, client-generatable), `owner_user_id`, `template_id`
  (nullable for blank), `name`/`type` snapshot, `started_at`, `finished_at` (null = in
  progress), `status`, timestamps.
- **session_exercises**: `id` (UUID), `session_id`, `exercise_id`, `position`, `skipped`,
  snapshotted targets.
- **workout_sets**: `id` (UUID), `session_exercise_id`, `set_order`, `weight`, `weight_unit`,
  `reps`, `completed`, `set_type` (`working` | `warmup`), `created_at`, `updated_at`.
  Extensible for RIR/RPE/duration/distance via nullable columns added later.
- **sync_change_log**: `id`, `owner_user_id`, `client_change_id` (unique per user),
  `applied_at`.

Ownership is enforced in every query (`WHERE owner_user_id = ${user.id}`); the client-supplied
user id is never trusted.

### Exercise library API (Milestone 2, implemented)

- `GET /api/muscle-groups` — seeded taxonomy, so the frontend never hardcodes muscle names.
- `GET /api/exercises` — lists shared (`owner_user_id IS NULL`) plus the caller's personal
  exercises, excluding archived; joins the primary muscle-group name.
- `POST /api/exercises` — creates a personal exercise; `owner_user_id` is taken from the
  authenticated user, never the request body (a spoofed `owner_user_id` is ignored).
- `GET` / `PATCH` / `DELETE /api/exercises/[id]` — single-exercise read/update/soft-delete.
  **Authorization is enforced in the SQL `WHERE` clause** (`owner_user_id = ${user.id}` for
  mutations; shared-or-owned for reads). A row the caller may not touch simply matches
  nothing, so the handler returns **404 rather than 403** — this avoids leaking the existence
  of other users' private exercises. DELETE is a soft-delete (`is_archived = TRUE`) so
  templates/sessions that reference the exercise stay intact.
- **UI:** mobile-first `/exercises` page (client component) that groups and filters exercises
  by their data-driven primary body group and adds a personal one, with muscle-group options
  loaded from `GET /api/muscle-groups`. Template and live-workout selectors use native
  `optgroup` sections derived from the same exercise response. Uncategorized personal
  movements appear under `Other`. The library also provides a front/back SVG body selector
  using the MIT-licensed `react-muscle-highlighter` package. A tested mapping layer translates
  the app taxonomy to anatomy slugs and keeps the selected group, view, highlight, and results
  synchronized. Because the package's SVG paths are pointer-oriented, the labelled filter
  buttons remain the authoritative keyboard/screen-reader control; the image is a progressive
  visual enhancement rather than the only way to filter. Template and live-workout exercise
  pickers reuse the same taxonomy mapping in a compact, non-interactive body preview. Changing
  the native select immediately updates the highlighted primary region and its text label;
  no additional API request or stored data is required. The library's Front and Back controls
  also act as side-level filters: an internal filter token avoids colliding with the actual
  `Back` muscle-group label, and the same taxonomy mapping determines which grouped sections
  belong to each side. The library initializes with Front as the active filter rather than an
  All-results state, the count reflects only visible movements, and the explicit Front list
  excludes abductors, calves, glutes, quadriceps, and neck; those groups remain reachable via
  Show all. The horizontal labelled-filter row is synchronized with the active body side, so
  it does not present Back-only group buttons while Front is selected or vice versa.
- **Demonstration media:** a provider-neutral exact mapping connects 29 reviewed shared
  exercises to durable Free Exercise DB IDs. Selected public-domain start/finish images are
  self-hosted for offline use, with the upstream source and bundled Unlicense recorded both in
  the media descriptor and the UI. The descriptor keeps animation optional so a future licensed
  provider can be added without changing consumers. No fuzzy name matching is used, so personal
  or similarly named movements never receive an incorrect demonstration.
- Cross-user denial is covered by tests and additionally validated at the SQL level against
  Postgres 16.

### Templates API (Milestone 3, implemented)

- `GET /api/templates` — the user's non-archived templates with an `exercise_count`.
- `POST /api/templates` — create (owner from auth user).
- `GET /api/templates/[id]` — a template plus its ordered exercises (joined to exercise +
  muscle-group names).
- `PATCH /api/templates/[id]` — rename and/or archive-toggle. `DELETE` = soft-delete (archive).
- `POST /api/templates/[id]/duplicate` — copies the template and its exercises via
  `INSERT ... SELECT` (re-scoped to the owned source), named "<name> (copy)".
- `POST /api/templates/[id]/exercises` — add an exercise; validates the template is owned
  **and** the `exercise_id` is visible to the user (shared or owned); position defaults to end.
- `PATCH`/`DELETE /api/templates/[id]/exercises/[teId]` — edit targets/position or remove.
  Ownership of the nested row is enforced via a `template_id IN (SELECT ... WHERE owner = user)`
  subquery guard, so foreign rows match nothing → 404.
- `PUT /api/templates/[id]/exercises/order` — atomic reorder. Takes `{ order: [teId,...] }` and
  issues one scoped `UPDATE ... SET position = index` per id inside a single `sql.transaction()`
  (lazy `NeonQueryPromise` descriptors), so the reorder is all-or-nothing.
- **UI:** `/templates` (list, create, duplicate, archive) and `/templates/[id]` (rename on
  blur, add exercise from the library, up/down reorder, remove, and edit target sets, rep
  range, weight, and rest seconds). Exercise targets use collapsed summaries so full planning
  detail remains available without making the mobile list visually dense. The add-exercise
  picker previews the selected movement's primary body region, name, and equipment. Mutations provide
  explicit success/error feedback. Mobile-first;
  reorder uses up/down buttons rather than drag-drop for touch reliability.
- Cross-user denial covered by tests and validated at the SQL level against Postgres 16.

### Sessions / live training API (Milestone 4, implemented)

- `GET /api/sessions` — the user's sessions (optional `?status=` filter), with exercise counts.
- `POST /api/sessions` — start a workout. The session UUID is generated in the handler
  (`crypto.randomUUID()`) so, when a `template_id` is given, the session insert and the
  **snapshot** (`INSERT ... SELECT` of `template_exercises` into `session_exercises`) run
  atomically in one `sql.transaction()`. This is the **snapshot-on-start** that isolates
  history: validated against Postgres 16 that editing the template afterwards does not change
  the session's copied targets (Req 3.5). Generating ids client-side also sets up the offline
  model for Milestone 6.
- `GET /api/sessions/[id]` — the full session with exercises (ordered) and their sets (ordered),
  nested server-side. `PATCH` finishes/abandons/resumes (status + `finished_at`) or renames.
  `DELETE` removes the session (cascades to exercises/sets).
- `POST /api/sessions/[id]/exercises` — add an exercise mid-session (visible-exercise check);
  `PATCH [seId]` skip/unskip or reposition; `DELETE [seId]` remove (cascades to its sets).
  All session mutations require an owned `in_progress` parent; completed/abandoned history is
  immutable. Nested set mutations also scope the set to the session id present in the URL.
- `GET /api/sessions/[id]/exercises/[seId]/previous` — **previous performance**: the most
  recent other session (any status) containing the same exercise, with that session's sets, for
  side-by-side comparison. `{ previous: null }` when there is no history.
- `POST /api/sessions/[id]/exercises/[seId]/sets` — add a set (weight/reps/unit/type/completed,
  order defaults to end); `PATCH`/`DELETE [setId]` edit/remove.
- Ownership is enforced in SQL at every nesting level via subquery guards
  (`... IN (SELECT ... WHERE owner_user_id = user)`), so a foreign session/exercise/set matches
  nothing → 404 (no leak). Covered by tests and validated against Postgres 16.
- **UI:** `/train` (start blank or from a template, resume in-progress) and `/train/[id]` (the
  live screen: per-set weight/reps/complete entry, add/edit/delete sets, automatically loaded
  previous performance, add/skip/remove exercise, progress indicator, finish/abandon
  confirmation, and save/error feedback). Mobile-first with large numeric inputs and a
  safe-area-aware sticky finish action; mutations reload for correctness (optimistic/offline
  writes arrive in Milestone 6). The mid-workout exercise picker previews the selected
  movement's primary body region, name, and equipment. When finishing, entered-but-unchecked sets are identified
  from live input state, confirmed with the user, and persisted with `completed: true` before
  the session status changes. A failed set save leaves the workout open, preventing silent
  history loss. Each session exercise can use its snapshotted `rest_seconds` value or an
  in-workout override. Successfully marking a set Done starts an optional recovery timer;
  an absolute `endsAt` timestamp is stored under a session-scoped `localStorage` key so a
  refresh or background interval throttling cannot reset the countdown. A compact panel above
  the workout actions supports +30 seconds and Skip, then provides a visible completion state
  plus best-effort Web Audio and vibration cues. Timer state is local UI state, not workout
  history until the user chooses Start next set or Skip. That action stores planned rest,
  actual elapsed rest, and an outcome (`completed`, `started_early`, or `skipped`) on the set
  that initiated recovery. Workout history displays actual/planned rest per set and average
  actual rest per exercise; the next workout's previous-performance strip includes that
  exercise's average. Changing the session rest target does not mutate the source template.

### Training history (Milestone 5, implemented)

History is a UI layer over the existing sessions API — no new routes or migration. `GET
/api/sessions` (with `?status=`) powers the list; `GET /api/sessions/[id]` powers the detail
view. A shared `app/lib/metrics.js` defines the working-volume rule in one place (only
completed, non-warm-up sets count; weights are converted to one display unit before volume is
summed), unit-tested, and reused by history
summaries now and analytics later (Milestone 8). UI: `/history` (unfinished sessions with
resume links + completed/abandoned list) and `/history/[id]` (read-only session detail with
per-exercise working-set count and volume). Historical records are presented as actual results,
visually distinct from planned targets. Each exercise in session detail reuses the shared
taxonomy-to-anatomy mapping to show its primary trained body region with both a compact SVG
highlight and a text label. The individual exercise-history header provides the same context;
its analytics response includes the exercise's primary group and equipment alongside its name.

### Visual design system (brand pass)

Brand essence: **quiet strength, measurable progress, no distractions.** Dark-first with a
sophisticated light mode. A token layer in `app/globals.css` (`:root`, overridden under
`prefers-color-scheme: light`) defines everything so screens stay consistent and restyling is
centralized:

- **Palette:** deep graphite / near-black background (`--bg #0c0d0e`), matte raised surfaces
  (`--surface`), fine borders (`--border`), off-white text (`--text #f4f5f3`) with muted/dim/
  faint steps. **One restrained electric-lime accent** (`--accent #c8ff3c`, deepened to
  `#86b300` in light mode) reserved for the primary action and progress — never decorative.
- **Material:** matte surfaces, fine 1px borders, minimal depth. No gloss, gradients,
  glassmorphism, or neon glow.
- **Typography:** system sans with strong hierarchy; **tabular numerals** on all metrics
  (`font-variant-numeric: tabular-nums`) for instrument-like column alignment.
- **Landing page (`/`):** the showcase for the system — wordmark + hairline header, eyebrow
  label, large tight hero, an instrument-style stat band (sample volume / working sets /
  +% vs previous), a crisp hairline feature list, and a single lime CTA (auth-aware via
  server-side `auth()`).
- **Authenticated shell:** a compact brand/status header and safe-area-aware bottom navigation
  provide stable access to Home, Plans, Train, History, and Exercises. The live-session route
  hides the general navigation to reduce distraction and reserve the thumb zone for workout
  completion controls. A persistent help affordance opens `/help`, which provides a searchable,
  data-driven FAQ and getting-started workflow. Plans, Train, Exercises, History, and Progress
  link directly to their FAQ section; Settings also exposes a larger help card. Native
  `details`/`summary` disclosure keeps answers keyboard-accessible without another dependency.
- **Application screens:** the dashboard prioritizes the training CTA; list screens share
  section headings, counts, empty/loading states, and consistent action groups; history uses a
  restrained timeline; the live recorder uses high-legibility set rows and completion states.
  On fine-pointer devices, buttons, icon actions, navigation links, cards, and disclosures use
  restrained token-based hover feedback (color, border, lift, or surface change). Hover styles
  are gated behind `hover: hover` / `pointer: fine`; motion remains subtle and is disabled
  through `prefers-reduced-motion`.

### Security hardening & data policy (Milestone 9, implemented)

**Authorization audit.** Every API route (21 handlers) calls `getDbUser()` and enforces
ownership in SQL; the only unauthenticated route is the Clerk webhook, which verifies a Svix
signature. A dedicated `__tests__/api/cross-user-access.test.js` asserts systematically that
every resource route returns **404 (not 403)** for a resource the caller does not own — proving
the no-existence-leak guarantee across exercises, templates, template-exercises, sessions,
session-exercises, sets, and analytics in one auditable place (Req 13.4).

**Secrets & transport.** All `process.env` access is server-only (`app/lib/db.js`,
`app/lib/email.js`); the only client-exposed key is Clerk's publishable key (designed public).
Error responses are generic (`Unauthorized` / `Internal server error`); details are logged
server-side only, never echoed to clients. Production runs over HTTPS (Vercel) and secrets are
host-provided env vars, never committed.

**Account deletion & data retention (Req 13.5).** Users can delete their account from Settings
(an intentionally collapsed Advanced account actions disclosure plus two-step confirmation) via
`DELETE /api/account`. Destructive red styling is revealed only after the disclosure opens:
1. The local `users` row is deleted, which **cascades** to all owned records (templates,
   personal exercises, sessions, session-exercises, sets) through `ON DELETE CASCADE`.
2. The Clerk identity is removed via `clerkClient().users.deleteUser()`. If that call fails the
   data is already gone and Clerk's `user.deleted` webhook reconciles the identity later.

Retention policy: workout data is private by default and retained only while the account
exists. Deletion is immediate and irreversible — no soft-delete/grace period in the MVP
(a future enhancement could add a recovery window). Clerk is the system of record for identity
and auth credentials; the app stores no passwords or tokens.

**Session exit.** The persistent app header exposes Clerk's `SignOutButton` as a labelled exit
icon beside Help and Settings. Clerk clears the authenticated session and redirects to the
public landing page; no local workout data is deleted. Keeping logout out of Settings visually
separates the reversible session action from permanent account deletion.

### Offline + sync design

- **Local store:** IndexedDB object stores mirroring sessions, session_exercises, sets, plus a
  `pending_changes` queue. All entity IDs are client-generated UUIDs so records exist locally
  before any server round-trip.
- **Write path:** UI → write to IndexedDB (durable) → enqueue change → UI confirms "saved
  locally". Only server acknowledgement flips state to "synced".
- **Sync engine:** batches pending changes and POSTs them to an idempotent sync endpoint.
  Triggered on app open, `visibilitychange`/focus, `online`, and manual retry — never relying
  solely on Background Sync. Retries use exponential backoff.
- **Idempotency:** each change carries a `client_change_id`; the server records applied IDs in
  `sync_change_log` and upserts by entity UUID, so replays are no-ops. A real connectivity
  probe (an app-level request), not `navigator.onLine`, decides reachability.
- **Conflict policy (documented):** last-write-wins per field using `updated_at`, except
  completed historical sessions are immutable once `finished_at` is set server-side. Conflicts
  are detected via version/updated_at comparison and surfaced in sync status.
- **Durability guarantee:** a failed sync leaves IndexedDB untouched; nothing is deleted until
  the server acknowledges.

### Weekly workout scheduling

`workout_schedules` stores recurring weekly intent separately from workout history. Each row is
owned, references one template, uses a browser-local weekday (`0` Sunday through `6` Saturday),
and may contain a wall-clock `TIME`. A unique `(owner_user_id, template_id, weekday)` constraint
makes schedule writes idempotent and turns repeat selection into an update. Template deletion
cascades schedules; historical training sessions remain independent snapshots.

Endpoints:
- `GET /api/schedules` — active slots joined to active owned plan names, ordered for weekly display.
- `POST /api/schedules` — ownership-checked upsert of one plan/day/time slot.
- `DELETE /api/schedules/[id]` — remove one owned slot, returning 404 for inaccessible IDs.

The Plans UI highlights the current local day. Scheduling never starts a session automatically and
does not request notification permission; reminders remain deferred pending a reliable opt-in push
design.

### Analytics foundation (Milestone 8, implemented)

Working volume = sum over completed, non-warm-up sets, with each weight normalized to kg
(lb→kg) before `weight × reps` so mixed-unit sessions total correctly. Muscle-group volume
attributes **full** credit to the exercise's primary muscle (`exercises.primary_muscle_group_id`)
and **0.5** credit to each secondary (`exercise_muscles`, role ≠ primary), avoiding counting
every set as full volume for every muscle it touches. These factors are documented and
single-sourced in `app/lib/metrics.js` (`PRIMARY_MUSCLE_FACTOR` / `SECONDARY_MUSCLE_FACTOR`);
0.5 is a tunable convention. All metrics are derived from `workout_sets` at query time via CTEs
+ `UNION ALL`; no authoritative aggregate tables.

Endpoints (ownership-scoped to the caller):
- `GET /api/analytics/volume-by-muscle?weeks=N` (default 8, max 52) — weekly volume per muscle
  group across the window.
- `GET /api/analytics/exercise/[exerciseId]` — per-session volume and top working set for one
  exercise (visibility-checked: shared or owned, else 404).
- `GET /api/sessions/[id]/records` — records earned in one owned completed session compared with
  earlier owned completed sessions. The read-time calculation normalizes pounds to kilograms,
  excludes warm-up and incomplete sets, and requires strict improvement over an existing baseline.

Personal records are derived rather than stored. `app/lib/personal-records.js` compares the current
session with earlier data and reports heaviest completed set, repetitions at an equivalent weight,
best single-set volume, and total-workout volume. The History detail UI uses supportive copy and
does not prescribe maximum attempts. Abandoned/in-progress sessions are ineligible, and a first
performance establishes the baseline without generating a celebration. Each celebration presents
the previous best and current result side by side and links the previous source workout, with both
workout name and date, so the improvement is auditable without leaving the current page.

UI: `/progress` — ranked volume-by-muscle bars and an exercise-progression table, linked from
the dashboard. `/exercises/[id]/history` provides an exercise-first chronology with workout
name, date, working-set count, normalized volume, and the heaviest top set with repetitions;
each entry links to the immutable source session. Sessions containing only planned exercises
or incomplete sets are intentionally excluded so they cannot mask older valid performance.
Both queries were validated against Postgres 16 (unit normalization, warm-up/incomplete
exclusion, primary+secondary attribution, and cross-user isolation all confirmed).

### PWA / UX

- **Implemented install shell:** `app/manifest.js`, branded any-purpose and maskable PNGs,
  Apple touch icon, theme/standalone metadata, Train/History shortcuts, and device-aware
  Settings guidance support Home Screen installation. Product copy explicitly states that
  installation does not yet make workout writes available offline.
- **Deferred offline layer:** a future service worker will cache the app shell and static
  assets needed for a complete offline recorder. The current production service worker caches
  only public static assets and an offline fallback; it intentionally never caches authenticated
  HTML or API responses.
- **Implemented active-workout recovery slice:** `app/lib/workout-draft-store.js` keeps one
  user-and-session-keyed IndexedDB snapshot plus sparse, unacknowledged weight/repetition fields. The
  live recorder merges those fields over a fresh server response after reload. On a network-level
  load failure it may display the cached session and accept numeric input, but disables completion,
  finish, deletion, and structural controls. A 401/404/server response never falls back to private
  cached data. Server acknowledgement removes the corresponding dirty fields; finalized sessions
  remove the draft. This is recovery, not a sync queue or a claim of full offline operation.
- **Implemented set synchronization slice:** retryable live-set PATCH failures enter the
  `sync-changes` IndexedDB store with a stable `clientChangeId`. `POST /api/sync` accepts batches
  of at most 50 `set.patch` operations. One PostgreSQL CTE ownership-checks the full
  session→exercise→set path, inserts `(owner_user_id, client_change_id)` into `sync_change_log`,
  and applies the update only when that insert succeeds. Therefore replay is a no-op and a foreign
  or finalized resource never enters the ledger. Pending changes overlay cached/server session
  state in creation order. Server acknowledgement removes both the queue record and acknowledged
  dirty draft fields. Rejected changes are marked non-retryable, remain local, and surface as
  `Needs attention`; they are not submitted repeatedly without a user decision.
- **Structural sync extension:** set creation uses a browser-generated UUID and explicit order;
  the ordinary POST route accepts the same identity online, while queued `set.create` uses the
  idempotent ledger path offline. `session.patch` queues completed/abandoned finalization after all
  preceding set writes. The recorder remains visible with a locally finalized state until server
  acknowledgement, instead of navigating to history that the server cannot yet provide.
- **Offline blank-workout extension:** `/train` generates the session UUID and timestamp before
  the network request. A retryable failure persists an empty snapshot and queues `session.create`;
  the live route recognizes its authenticated pending creation rather than treating the server's
  temporary 404 as a missing workout. The last successful exercise-library response is stored in
  a per-user IndexedDB catalogue so exercises can be selected after connectivity drops. Exercise
  create/delete and set delete use stable identities and the same ordered ledger protocol.
- **Cached-plan start:** a successful Train load expands each plan summary through its owned detail
  endpoint and stores the complete ordered target snapshot per user. Offline start generates the
  session and session-exercise UUIDs locally, persists the complete live snapshot, and queues
  `session.create` followed by ordered `session_exercise.create` operations. The sync session write
  validates that the referenced plan remains owned and visible but deliberately does not snapshot
  it again; the queued exercise rows are the immutable start-time snapshot.
- **Recorder cold launch:** production registration sends the current `/train` route and the
  already-loaded executable asset URLs to `public/sw.js`. The worker caches exact recorder
  navigation shells plus same-origin static assets and the Clerk loader script. Navigation remains
  network-first; failure falls back to the exact cached recorder shell, then the public offline
  page. `/api/*` is excluded at every fetch/cache entry point, so private workout content remains
  solely in the current user's IndexedDB namespace. This deliberately does not make every app page
  available offline.
- **New-session recorder shell and device owner:** while online, `/train` also pre-caches the
  parameter-neutral `/train/offline` recorder shell. A newly generated local session navigates to
  that shell with its UUID in the URL query, so its route need not have existed before connectivity
  was lost. The last successfully authenticated Clerk user id is remembered locally as a
  device-bound IndexedDB namespace key and is used only while the browser reports offline; an
  online sign-out clears it. This avoids treating a temporary offline Clerk state as a new user and
  does not weaken server authorization when synchronization returns.
  Clients upgraded while already offline recover that namespace only when existing drafts, queued
  changes, and cached catalogues identify exactly one owner; a shared device with multiple owners
  requires online authentication rather than guessing.
  The live recorder uses the same local-draft fallback for thrown network failures and retryable
  HTTP failures. This distinction matters on localhost: the Next.js server remains reachable after
  Wi-Fi is disabled but returns 5xx when Neon is unreachable. A locally saved session therefore
  loads normally in either case instead of showing a server error.
  Because a cached HTML response was rendered without the eventual query string, the client reads
  the local session UUID from `window.location.search` after hydration and does not issue API or
  IndexedDB reads until that UUID is available.
  Online session starts do not require the client-side offline owner marker: the authenticated API
  remains authoritative and may succeed while Clerk's browser hook is still hydrating. The marker
  gates only offline local creation, where it is required to select a private IndexedDB namespace.
  Cold offline recovery likewise does not wait for Clerk's remote SDK to report `isLoaded`: once a
  unique local owner and session UUID are available, the recorder reads that namespace directly.
  Clerk/server authorization is still required before any queued write can synchronize.
- **Conflict resolution:** the global sync status links to `/settings/sync`. The screen separates
  pending work from rejected changes, preserves and displays attempted set values, and lets the
  user retry one/all changes or explicitly keep the server version. Keeping the server version
  requires confirmation, clears only the selected queue entry and its matching dirty set fields,
  and never overwrites immutable completed history. Invalid client batches are also parked for
  review instead of entering an automatic retry loop.
- **Batching and workout dependencies:** the client drains the queue in ordered batches of at most
  50 changes. Stable high-resolution creation order is used for new work; equal-time legacy changes
  are dependency-ordered so session creation precedes exercises/sets and finalization runs last.
  This prevents a larger offline workout from being rejected as one oversized request or becoming
  immutable before its set values arrive.
- **Offline rest settings:** exercise rest-duration selection is an optimistic
  `session_exercise.patch`, persisted in the workout snapshot and synchronized through the same
  ownership/status/idempotency ledger. Timer completion controls queue their set rest metrics while
  offline instead of being disabled.
- Mobile-first layout; set-entry controls kept within thumb reach; large numeric inputs;
  minimal navigation during a live session.
- Visible sync/connectivity indicator; explicit saved/pending/error feedback.
- Unit handling stores a canonical value with an explicit unit; conversions are computed, not
  destructive, preserving the intended physical value.

## Error handling

- **API:** convention returns 401/400/500 with `Response.json`; server-side logging on 500.
- **Migrations:** per-table try/catch with progress logs; `process.exit(1)` on failure so a
  bad deploy fails loudly.
- **Email:** failures logged, never thrown, so transactional flows don't crash on SMTP issues.
- **Sync:** retryable transport/server failures remain queued; non-retryable conflicts and
  validation failures stop retrying and are surfaced with retry/keep-server controls without
  destroying local data before an explicit decision.

## Testing strategy

- **Unit/route (Jest ESM):** the `__tests__/setup.js` mock harness drives route tests with
  mocked `sql`, `getDbUser`, and Clerk `auth`. Covers auth (401), validation (400), success,
  and — for domain routes — cross-user access denial.
- **Sync tests:** idempotency (replayed `client_change_id` is a no-op), out-of-order updates,
  and "failed sync preserves local data".
- **Analytics tests:** weekly volume excludes warm-up/incomplete sets and follows the
  documented muscle-group attribution rule; unit conversions preserve physical values.
- **Manual (user-performed, agent cannot verify):** real-iPhone offline test — install to Home
  Screen, record a full session in airplane mode, close/reopen without data loss, sync on
  reconnect. Flagged explicitly in acceptance.

## Deployment

Serverless (Vercel-style). `next build` then `postbuild` runs `node scripts/migrate.js`
against `DATABASE_URL`, shipping idempotent schema changes with each deploy. No separate CI
file required. Secrets provided via host env vars; never committed (`.gitignore` covers
`.env*.local`), documented in `.env.example`.
