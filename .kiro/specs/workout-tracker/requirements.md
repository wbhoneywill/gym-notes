# Requirements — Offline-First Workout Tracker

## Introduction

An offline-first, mobile-first Progressive Web App (PWA) for tracking gym workouts,
intended primarily for use in Safari on an iPhone during training sessions. It replaces
an Apple Notes-based workflow with a structured experience for planning workouts,
recording exercises and sets, reviewing previous performance, and (later) analysing
progress.

The core product principle: **recording a set must be fast, reliable, and independent of
internet connectivity.** The MVP must be genuinely usable for personal training, while the
architecture must support evolution into a multi-user production product and a future
native mobile app.

### Tech stack (authoritative)

The implementation stack is fixed and takes precedence over any stack implied elsewhere:

- **Framework:** Next.js 16 (App Router), React 19. ES modules throughout
  (`"type": "module"` in `package.json`). Current stable releases of all packages.
  (Updated from the originally proposed Next.js 15 / React 18 — see Requirement 1.1.)
- **Database:** PostgreSQL via the Neon serverless driver (`@neondatabase/serverless`),
  using the tagged-template `sql` query style.
- **Auth:** Clerk (`@clerk/nextjs`) with middleware-based route protection.
- **Email:** Nodemailer, with Resend SMTP as the production transport and a local SMTP
  fallback for development.
- **Testing:** Jest 30 in ESM mode (Node test environment).
- **Local env:** `dotenv` for loading `.env.local` in scripts.
- **Deployment:** Serverless host (Vercel-style). `next build` followed by a `postbuild`
  step that runs idempotent migrations against `DATABASE_URL`.

### Scope and milestone strategy

This spec documents the **full product vision and a phased roadmap**, but the **first
implementation milestone (Milestone 0) is strictly the foundation**: authentication,
database layer, email helper, testing harness, and deployment wiring. No domain-specific
tables, API routes, or UI are built in Milestone 0 beyond the placeholder `users` table
and example `/api/user` route. Domain features are layered on in later milestones, each as
a complete, tested vertical slice.

### Stack-reconciliation notes (requirements that are re-mapped)

Some product requirements were originally framed for a different stack and are re-mapped
onto this one. These are explicit decisions, not silent changes:

- **Authentication** is provided by **Clerk**, not a server-framework auth system. Clerk
  covers registration, login, logout, password recovery, and session management. The
  backend derives user identity from Clerk's server `auth()` and the local `users` table;
  it never trusts a client-supplied user identifier.
- **Migrations** are plain idempotent `CREATE TABLE IF NOT EXISTS` statements in
  `scripts/migrate.js`, run automatically on `postbuild`.
- **Real-device offline testing** on a physical iPhone is a manual acceptance step the
  user performs; it cannot be verified by the agent and is flagged as such.
- **Background Sync APIs** are treated as unreliable on iOS; synchronization must also be
  triggered on app open, focus regain, and detected connectivity restoration.

---

## Requirements

### Requirement 1: Project foundation (Milestone 0)

**User Story:** As a developer, I want a correctly wired Next.js foundation with auth,
database, email, testing, and deployment, so that domain features can be built on a
verified base.

#### Acceptance Criteria

1. WHEN the repository is scaffolded THEN it SHALL use Next.js 16 (App Router), React 19,
   and ES modules (`"type": "module"`).
2. WHEN dependencies are installed THEN they SHALL be current stable releases of
   `@clerk/nextjs`, `@neondatabase/serverless`, `dotenv`, `next`, `nodemailer`, `react`,
   `react-dom` (runtime) and `@jest/globals`, `jest` (dev), not pinned to any prior
   project's patch versions.
3. WHEN `jsconfig.json` is present THEN `baseUrl` SHALL be `.` and `@/*` SHALL map to
   `./*` so imports use `@/app/lib/...`.
4. WHEN `package.json` scripts are defined THEN they SHALL include `dev`, `build`, `start`,
   `migrate`, `postbuild` (running `node scripts/migrate.js`), `test`, and `test:watch`,
   with Jest invoked via `node --experimental-vm-modules`.
5. WHEN `app/lib/db.js` is created THEN it SHALL export a `sql` client built from
   `neon(process.env.DATABASE_URL, { fetchConnectionCache: true })`.
6. WHEN `app/lib/auth.js` is created THEN it SHALL export an async `getDbUser()` that calls
   Clerk's server `auth()`, returns `null` when there is no `userId`, otherwise returns the
   matching row from `users` keyed by `clerk_user_id`.
7. WHEN `app/lib/email.js` is created THEN it SHALL export an async
   `sendEmail({ to, subject, html })` that uses Resend SMTP (port 465) when
   `RESEND_API_KEY` is present, otherwise falls back to `SMTP_HOST`/`SMTP_PORT`
   (default `localhost:1025`), reads the sender from `EMAIL_FROM`, and wraps the send in
   try/catch — logging failures without throwing.
8. WHEN `middleware.ts` is created THEN it SHALL use `clerkMiddleware` + `createRouteMatcher`
   to protect `/dashboard(.*)`, `/admin(.*)`, and `/api(.*)`, exempt `/api/webhooks(.*)`,
   and export the standard Clerk `config.matcher` that skips Next internals and static assets.
9. WHEN `app/layout.js` is created THEN it SHALL wrap the app in `<ClerkProvider>` with
   `signInFallbackRedirectUrl="/dashboard"` and `signUpFallbackRedirectUrl="/dashboard"`,
   export placeholder metadata, and use `<html lang="en">`.
10. WHEN `scripts/migrate.js` is created THEN it SHALL load `.env.local` via `dotenv`,
    create a Neon `sql` client, and run `CREATE TABLE IF NOT EXISTS` statements inside a
    try/catch that logs per-table progress and calls `process.exit(1)` on failure, creating
    only the `users` table initially, structured so additional tables can be appended.
11. WHEN sign-in and sign-up pages are created THEN they SHALL render Clerk's `<SignIn />`
    and `<SignUp />` at `app/sign-in/[[...sign-in]]/page.js` and
    `app/sign-up/[[...sign-up]]/page.js`.
12. WHEN the Jest config is created THEN it SHALL set `testEnvironment: 'node'`,
    `transform: {}`, map `^@/(.*)$` to `<rootDir>/$1`, and ignore `/node_modules/` and
    `__tests__/setup.js`.
13. WHEN the test harness `__tests__/setup.js` is created THEN it SHALL provide a `mockSql`
    for `@/app/lib/db`, a `mockGetDbUser` for `@/app/lib/auth`, and a mock for
    `@clerk/nextjs/server`'s `auth`, registered via `jest.unstable_mockModule` before any
    route import, and export `resetMocks()` and a `makeRequest(url, opts)` helper that sets
    a JSON content-type.
14. WHEN the example route and test exist THEN `app/api/user/route.js` SHALL expose a GET
    returning the current user via `getDbUser()`, following the API convention, and
    `__tests__/api/user.test.js` SHALL import the handler dynamically inside `beforeEach`
    (after `resetMocks()`) and cover the 401 (null user) and authenticated-success cases.
15. WHEN `.gitignore` is created THEN it SHALL ignore `node_modules/`, `.next/`,
    `.env.local`, and `.env*.local`.
16. WHEN environment variables are documented THEN a `.env.example` SHALL list
    `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
    `RESEND_API_KEY` or `SMTP_HOST`/`SMTP_PORT`, and `EMAIL_FROM`, with no hardcoded secrets.
17. WHEN verification runs THEN `npm install`, `npm test` (example user-route tests pass),
    and `npm run build` SHALL succeed, and anything unverifiable (e.g. live DB connection
    without env vars) SHALL be reported.

### Requirement 2: API route convention

**User Story:** As a developer, I want every authenticated route to follow one convention,
so that auth, validation, and error handling are consistent and testable.

#### Acceptance Criteria

1. WHEN an authenticated route handler runs THEN it SHALL call `getDbUser()` and return
   `Response.json({ error: 'Unauthorized' }, { status: 401 })` when it returns `null`.
2. WHEN a route receives input THEN it SHALL validate it and return `400` on bad input.
3. WHEN a handler body executes THEN it SHALL be wrapped in try/catch, log the error
   server-side, and return `Response.json({ error: 'Internal server error' }, { status: 500 })`
   on failure.
4. WHEN any route responds THEN it SHALL use `Response.json(...)`.
5. WHEN a route creates or updates an entity on behalf of a user THEN ownership SHALL be
   derived from the authenticated user, never from a client-supplied user identifier.

### Requirement 3: Workout templates (later milestone)

**User Story:** As a user, I want reusable workout templates, so that I can start planned
sessions quickly without rebuilding them each time.

#### Acceptance Criteria

1. WHEN managing templates THEN the user SHALL be able to create, rename, duplicate, edit,
   and archive templates (e.g. Push A/B, Pull A/B, Legs A/B, and arbitrary custom routines).
2. WHEN building a template THEN the user SHALL be able to add exercises from a library,
   create personal exercises when missing, and reorder exercises.
3. WHEN configuring a template exercise THEN the user SHALL optionally set target sets,
   repetition ranges, target weight, and rest duration.
4. WHEN starting training THEN the user SHALL be able to start from a template or start a
   blank session.
5. WHEN a template is later edited THEN completed workout records SHALL NOT change
   retroactively; starting a workout SHALL create a session-specific snapshot of the
   planned exercise sequence and defaults.

### Requirement 4: Exercise library (later milestone)

**User Story:** As a user, I want a structured exercise library with personal additions, so
that templates and sessions reference consistent, extensible exercise data.

#### Acceptance Criteria

1. WHEN an exercise is defined THEN it SHALL support name, primary muscle group, secondary
   muscle groups, equipment, movement category, description, and ownership/source
   (shared vs personal).
2. WHEN exercises are stored THEN the data model SHALL support custom exercises and future
   taxonomy expansion.
3. WHEN the frontend lists exercises or muscle groups THEN those values SHALL come from data,
   not be hardcoded into components.
4. WHEN choosing an exercise THEN the user SHALL be able to browse movements grouped and
   filtered by primary body group in the library, template builder, and live workout.
5. WHEN a new account opens the shared library THEN it SHALL include a useful selection of
   common movements across the major seeded body groups.
6. WHEN browsing the exercise library THEN the user SHALL be able to select a primary body
   group from a front/back visual guide, see the selected region highlighted, and retain an
   equivalent labelled control that does not depend on interpreting or operating the image.
7. WHEN choosing an exercise in a template or live workout THEN the selected movement's
   primary body group SHALL be shown with a compact highlighted body preview and a text label.
8. WHEN selecting Front or Back on the exercise-library body guide THEN the visible catalogue
   SHALL include only groups mapped to that side, while selecting a specific labelled group
   SHALL continue to filter to that group alone.
9. WHEN an exercise has licensed demonstration media THEN exercise detail and live training
   SHALL expose it behind a user-controlled disclosure, avoid guessing media for unmatched
   exercises, and visibly preserve any required provider attribution.
10. WHEN a customer installs GymNotes from a supported browser THEN the application SHALL
    provide branded icons and a standalone presentation, while clearly distinguishing
    installability from offline workout support.

### Requirement 5: Live training (later milestone)

**User Story:** As a user training in the gym, I want to record sets quickly while seeing my
last performance, so that I can progress without friction.

#### Acceptance Criteria

1. WHEN starting training THEN the user SHALL tap Start Training, choose a template or blank
   session, and see the planned exercise list.
2. WHEN an exercise is opened THEN its most recent relevant performance SHALL be displayed,
   including date and individual sets, enabling comparison with today.
3. WHEN recording THEN the user SHALL record weight and repetitions per set and mark sets
   complete.
4. WHEN editing a session THEN the user SHALL add, edit, and delete sets, and add, remove,
   skip, and reorder exercises, without losing data when moving between exercises.
5. WHEN ending a session THEN the user SHALL finish or abandon it with appropriate
   confirmation, and SHALL be able to resume an unfinished session.
6. WHEN finishing a session with entered weight or repetition values on an incomplete set
   THEN the app SHALL clearly confirm that those recorded sets will be marked complete and
   SHALL persist them before finalizing the session.
7. WHEN an exercise has a rest duration and its set is successfully marked complete THEN a
   rest countdown SHALL start automatically, remain accurate across page refreshes, allow the
   user to add time or skip it, and provide a visible plus device-supported sound/vibration
   alert when recovery ends.
8. WHEN training is in progress THEN the user SHALL be able to enable, disable, or adjust the
   session exercise's rest duration without changing the original plan.
9. WHEN a rest timer is active THEN the user SHALL be able to indicate that the next set is
   starting, and the completed set SHALL retain planned rest, actual elapsed rest, and whether
   the user completed, shortened, or skipped recovery for later history and comparison.

### Requirement 6: Set tracking (later milestone)

**User Story:** As a user, I want each set stored as structured, extensible data, so that
history and analytics are accurate.

#### Acceptance Criteria

1. WHEN a set is recorded THEN it SHALL have a stable unique identifier, exercise and session
   association, set order, weight, repetitions, completion status, set type (initially
   working and warm-up), and creation/modification timestamps.
2. WHEN a set is edited THEN changes SHALL be saved locally immediately and validated without
   making entry cumbersome.
3. WHEN sets are recorded THEN different weights/reps per set and a variable number of sets
   SHALL be allowed, and historical set data SHALL be preserved after completion.
4. WHEN computing working volume THEN incomplete and warm-up sets SHALL NOT be counted by
   default.
5. WHEN the model stores measurements THEN it SHALL be extensible for future fields (RIR,
   RPE, duration, distance) and exercise-specific units.

### Requirement 7: Training history (later milestone)

**User Story:** As a user, I want to browse past sessions, so that I can review actual
results separately from planned targets.

#### Acceptance Criteria

1. WHEN browsing history THEN the user SHALL list completed sessions and open one to inspect
   its exercises and sets, date, and workout type.
2. WHEN viewing history THEN historical records SHALL be treated as actual results, distinct
   from planned targets, and unfinished sessions SHALL be resumable.
3. WHEN a session is completed or abandoned THEN exercise and set mutation endpoints SHALL treat
   its recorded results as immutable and return 404 for attempted nested writes.
4. WHEN inspecting workout or exercise history THEN each exercise SHALL identify its primary
   trained body group with a text label and a compact highlighted body preview when mapped.

### Requirement 8: Offline-first operation (later milestone, mandatory for MVP)

**User Story:** As a user, I want to record an entire workout with no connection, so that gym
dead zones never cost me data.

#### Acceptance Criteria

1. WHEN the user has no connectivity THEN they SHALL be able to start, complete, and finish a
   workout, with IndexedDB as the source of truth for unsynchronized changes.
2. WHEN a change is confirmed saved THEN it SHALL be persisted locally before or atomically
   with that confirmation, not held only in in-memory state.
3. WHEN the app reloads, the browser restarts, or the network drops THEN unfinished sessions
   SHALL be recoverable.
4. WHEN synchronization state changes THEN it SHALL be displayed clearly, and no change SHALL
   be claimed synchronized until the server acknowledges it.
5. WHEN a synchronization attempt fails THEN the locally persisted workout SHALL NOT be erased.

**Implemented recovery slice (2026-10-17):** the live recorder persists its latest active-session
snapshot and dirty weight/repetition fields in IndexedDB. A refresh restores unacknowledged input;
when the session request fails at the network layer, the cached recorder remains available for
weight/repetition entry while server-dependent controls are disabled. This does **not** yet satisfy
the full offline-workout criterion: offline session creation, structural mutations, completion,
asset/app-shell caching, and synchronization remain Milestones 6–7 work.

**Implemented synchronization slice (2026-10-17):** failed active-set updates are queued in
IndexedDB with stable client change UUIDs. The authenticated batch endpoint atomically checks
ownership and in-progress status, records the idempotency key, and applies each set patch. Replays
are acknowledged without a second write; cross-user/finalized-session changes are rejected without
entering the ledger. The client retries on app open, focus, visibility regain, and `online`, and
shows pending/syncing/attention state. A production service worker caches immutable static assets
and provides a privacy-safe offline fallback without caching authenticated HTML or API responses.
Template-based offline starts, offline plan editing, complete cold-launch coverage, and
physical-iPhone acceptance remains required before the entire offline roadmap is complete.

The next structural slice adds client-identified set creation and queued completed/abandoned
session finalization for an already loaded workout. Queue order guarantees set creation and final
values are acknowledged before the session becomes immutable. Starting a new session offline,
adding/removing exercises offline, deleting sets offline, and a complete cold-launch recorder still
remain outside the implemented boundary.

The following slice adds offline blank-session creation, a per-user cached exercise catalogue,
queued exercise addition/removal, and queued set deletion. A locally created session is authorized
by the current Clerk user and recovered from that user's IndexedDB namespace while its server
creation is pending. Template-based offline starts and offline plan editing remain deferred.

Cached-plan starts are now implemented. After Train loads a plan online, its ordered exercises and
targets are stored in the authenticated user's IndexedDB namespace. An offline start creates a
local session snapshot with fresh UUIDs, queues the plan-linked session, and then queues each
snapshotted exercise. This preserves the plan as it existed when training began even if the plan
changes before synchronization. Offline plan editing remains deferred.

Cold-launch support is implemented for a previously visited Train or active-workout route in a
production/PWA build. The service worker stores only the generic recorder HTML shell and executable
assets; it never stores API responses or embeds workout data in Cache Storage. The hydrated page
resolves the current Clerk user and reads only that user's IndexedDB snapshot and queue. Unvisited
screens still use the privacy-safe offline fallback. Physical-iPhone acceptance remains required.

User-directed conflict resolution is implemented at `/settings/sync`. A rejected or invalid
change stops automatic retries but remains in the current user's IndexedDB queue with its attempted
values. The user can retry individual/all conflicts, or confirm that the server version should win;
discarding clears only that local change and its corresponding draft fields. Completed server
history remains immutable.

Queue synchronization drains in dependency-safe batches of no more than 50, so a workout with many
set edits cannot exceed the endpoint contract and finalization cannot overtake tied creation/set
writes. Rest duration can be selected per exercise offline; the local snapshot updates immediately
and the owned in-progress exercise setting synchronizes idempotently after reconnecting. History
refreshes when synchronization completes.

A new offline workout opens through a generic recorder shell that `/train` pre-caches while online,
with the new UUID supplied locally rather than requiring its never-visited route to exist in Cache
Storage. The last online-authenticated owner key selects the user's local namespace only while the
device is offline and is cleared by an online signed-out state. Offline API failures are queueable
even if Clerk temporarily cannot expose its live session, and the start action is single-flight to
prevent accidental duplicate sessions.
An upgraded client that has no remembered marker MAY recover a unique owner from existing local
drafts, queue entries, or catalogues; it SHALL NOT choose when more than one owner is present.
WHEN an offline-capable local server responds with 5xx rather than producing a transport exception,
the recorder SHALL load the matching user-scoped draft just as it does for a failed request.

### Requirement 9: Synchronization (later milestone)

**User Story:** As a user, I want reliable sync when connectivity returns, so that offline
work reaches the server exactly once.

#### Acceptance Criteria

1. WHEN connectivity returns and the app is active THEN sync SHALL run automatically, and
   SHALL also be triggered on app open and focus regain (not relying solely on background
   sync APIs or browser online/offline events).
2. WHEN a sync request is retried THEN it SHALL be idempotent using stable client-generated
   identifiers so retries do not create duplicate sessions or sets.
3. WHEN updates arrive out of order THEN they SHALL be handled safely, with conflict
   detection and a documented conflict-resolution policy.
4. WHEN the server processes a sync request THEN it SHALL validate input and enforce
   authorization server-side, and acknowledge via checkpoints so confirmed changes are not
   resubmitted unnecessarily.

### Requirement 10: Progress analytics foundation (later milestone)

**User Story:** As a user, I want my data structured for future analytics, so that progress
metrics can be derived accurately later without rework.

#### Acceptance Criteria

1. WHEN training data is stored THEN it SHALL preserve what is needed to compute per-exercise
   volume, weight/rep progression, working-set counts, weekly volume by muscle group,
   frequency by muscle group, and future PRs/estimated 1RM.
2. WHEN analytics are defined THEN definitions SHALL be documented and account for secondary
   muscle involvement rather than counting every set as full volume for every muscle group.
3. WHEN deciding storage THEN progress metrics SHALL be derived from recorded data rather than
   stored redundant aggregates as the authoritative source.
4. WHEN scoping the MVP THEN complex coaching recommendations and AI features SHALL NOT be
   implemented.
5. WHEN viewing an exercise's history THEN the user SHALL see each session with completed
   working sets, including date, workout name, set count, volume, top weight and repetitions,
   and SHALL be able to open the source workout record.
6. WHEN viewing a completed workout that strictly improves on an earlier completed baseline THEN
   the user SHALL see derived personal records for the heaviest completed working set, most
   repetitions at the same normalized weight, highest single-set volume, and highest total workout
   volume; a first performance SHALL establish a baseline rather than a record.
7. WHEN presenting personal records THEN the UI SHALL celebrate measured progress without urging
   maximum-weight attempts or presenting derived metrics as medical or coaching advice.
8. WHEN a personal record is presented THEN the earlier best and improved result SHALL appear in
   one comparison, identifying and linking the source workout when it is available.

### Requirement 11: Authentication and multi-user readiness

**User Story:** As a user, I want secure, private, per-account data, so that my training is
mine and protected.

#### Acceptance Criteria

1. WHEN a user authenticates THEN registration, login, logout, password recovery, and secure
   session management SHALL be provided by Clerk.
2. WHEN protected resources are accessed THEN server-side authorization SHALL be enforced on
   every one, and the backend SHALL NOT trust a client-supplied user identifier as proof of
   ownership.
3. WHEN records are stored THEN user-owned records (templates, personal exercises, history)
   SHALL stay associated with the correct account and private by default.

### Requirement 12: Target platform and UX

**User Story:** As an iPhone user, I want a fast, installable, touch-friendly app, so that it
feels like a dedicated workout tool during training.

#### Acceptance Criteria

1. WHEN the UI is designed THEN it SHALL be mobile-first (narrow screens first, then tablet
   and desktop) and installable to the iPhone Home Screen as a PWA.
2. WHEN training is active THEN typing and navigation SHALL be minimised, current exercise and
   set-entry controls SHALL stay immediately accessible, and large dialogs, multi-step forms,
   and unnecessary animations SHALL be avoided.
3. WHEN actions occur THEN clear feedback SHALL be given for saved sets, pending
   synchronization, and errors.
4. WHEN units are shown THEN kilograms and pounds SHALL be supported with a user-configurable
   preferred unit, and conversions SHALL preserve the intended physical values.
5. WHEN the UI is built THEN it SHALL use accessible semantic markup, keyboard navigation where
   applicable, and sufficient contrast.
6. WHEN a user needs guidance THEN the app SHALL provide searchable, accessible help for each
   main section, explain core training terms and calculations, and link to relevant guidance
   from the section where it is needed.
7. WHEN a new account first enters the application THEN it SHALL offer a skippable onboarding
   flow for unit, goal, experience, and training-day preferences; MAY create one explicitly
   selected starter plan; and SHALL let the user revise profile preferences later.

**Current implementation note:** The authenticated application now uses a persistent
mobile navigation shell outside the focused live-session route. The live recorder keeps
set inputs and completion controls thumb-accessible, shows previous performance without an
extra tap, provides visible save/error feedback, and keeps the finish action in a safe-area
aware sticky footer. An optional timestamp-based rest timer starts after a completed set is
saved, persists locally across refreshes, and provides skip/add-time controls plus supported
sound and vibration cues. Starting the next set records actual versus planned recovery on the
preceding set, which is shown in workout history and the next workout's previous-performance
strip. Offline/synchronization status remains Milestone 6 work and is not represented as implemented.

### Requirement 13: Security and data integrity

**User Story:** As a user, I want my data validated, authorized, and protected, so that it
stays correct and private.

#### Acceptance Criteria

1. WHEN the API receives input THEN it SHALL validate server-side and enforce authorization and
   ownership on every protected resource.
2. WHEN running in production THEN secure transport SHALL be used and no secrets SHALL be
   exposed in frontend code.
3. WHEN sync requests arrive THEN duplicate requests SHALL be protected against, and invalid,
   missing, or malformed set data SHALL be handled gracefully without corrupting existing
   records.
4. WHEN tests are written THEN they SHALL include cross-user access restriction cases (one user
   cannot access another user's private data).
5. WHEN preparing for public launch THEN account deletion and data-retention behaviour SHALL be
   defined.

### Requirement 14: Scope control

**User Story:** As a stakeholder, I want the MVP kept lean, so that effort stays on the core
training loop.

#### Acceptance Criteria

1. WHEN scoping the MVP THEN AI coaching, social networking, public profiles, subscription
   billing, Apple Watch integration, HealthKit integration, complex periodization, automated
   training prescriptions, and non-essential push notifications SHALL be excluded unless
   explicitly requested.
2. WHEN writing code THEN speculative features and unnecessary abstractions/dependencies SHALL
   be avoided while keeping the code reasonably extensible.

### Requirement 15: Weekly workout scheduling

**User Story:** As a user, I want to arrange reusable plans across my week, so that I can see my
intended training rhythm without workouts starting automatically.

#### Acceptance Criteria

1. WHEN managing plans THEN the user SHALL be able to assign an owned active plan to a weekday
   with an optional local preferred time.
2. WHEN a plan and weekday are scheduled again THEN the existing slot SHALL be updated rather
   than duplicated.
3. WHEN viewing the schedule THEN the current local weekday SHALL be identified and slots SHALL
   be ordered by weekday and time.
4. WHEN removing or archiving a plan THEN its schedule SHALL be removable or cascade safely while
   completed workout history remains unchanged.
5. WHEN scheduling a workout THEN the application SHALL NOT start it automatically or claim that
   a notification will be delivered.
6. WHEN accessing a schedule THEN ownership SHALL be enforced in SQL and inaccessible resources
   SHALL return 404 rather than revealing another user's data.

---

## Definition of MVP success

> **Scope note (2026-10-15):** delivery is split into two stages. The **online MVP** (near-term
> goal) delivers the full training loop with analytics, settings, and security hardening, usable
> wherever there is connectivity. The **full MVP** below adds offline operation and sync, which
> are deferred — not dropped — to a subsequent stage. See the scope decision in `tasks.md`.

**Online MVP (near-term):** a user can sign in on their phone, create and manage workout
templates and exercises, record a complete training session with per-set weight/reps, compare
against previous performance, review history with volume metrics, and see basic progress
analytics — all while online.

**Full MVP (deferred offline stage):** the user can additionally install the web app on an
iPhone, record an entire training session offline, close and reopen the app without losing data,
synchronize the session when connectivity returns, and review the recorded performance afterward.
