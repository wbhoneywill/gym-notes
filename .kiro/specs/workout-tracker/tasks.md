# Implementation Plan — Offline-First Workout Tracker

> **Scope decision (2026-10-15): offline deferred, not dropped.** The near-term goal is
> a shippable **online-first MVP**. Milestones 6 (offline persistence/PWA) and 7 (sync
> engine) are intentionally deferred until the online product is complete and polished,
> because they are the most complex and hardest-to-reverse work and are lower-risk once
> the data model and UI have settled. Offline remains the headline next-version feature
> and the long-term definition of full MVP success (see "Definition of MVP success" in
> requirements.md). Near-term order: **M8 Analytics → Settings + UX polish → M9 Security
> hardening → PWA install (manifest/icons)**, then revisit offline (M6/M7).

Milestone 0 is the only milestone scoped for immediate implementation. It is exactly the
Prompt 1 foundation — no domain tables, routes, or UI. Later milestones are listed so the
full roadmap is captured, but should not be started until Milestone 0 is installed, tested,
and building green, and until their scope is confirmed.

## Milestone 0 — Foundation (implement now)

- [x] 1. Initialize project configuration and dependencies
  - Create `package.json` with `"type": "module"`, the required scripts (`dev`, `build`,
    `start`, `migrate`, `postbuild`, `test`, `test:watch` with `--experimental-vm-modules`),
    and current stable versions of `@clerk/nextjs`, `@neondatabase/serverless`, `dotenv`,
    `next`, `nodemailer`, `react`, `react-dom`, plus dev deps `@jest/globals`, `jest`.
  - Create `jsconfig.json` with `baseUrl: "."` and `@/*` → `./*`.
  - Create `jest.config.js` (node env, `transform: {}`, `@/` moduleNameMapper, ignore
    node_modules and `__tests__/setup.js`).
  - Create `.gitignore` (`node_modules/`, `.next/`, `.env.local`, `.env*.local`).
  - Create `.env.example` documenting `DATABASE_URL`,
    `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `RESEND_API_KEY` or
    `SMTP_HOST`/`SMTP_PORT`, `EMAIL_FROM` (no secrets).
  - _Requirements: 1.2, 1.3, 1.4, 1.12, 1.15, 1.16_

- [x] 2. Implement the library layer
  - [x] 2.1 `app/lib/db.js` — export `sql` from
    `neon(process.env.DATABASE_URL, { fetchConnectionCache: true })`.
    - _Requirements: 1.5_
  - [x] 2.2 `app/lib/auth.js` — async `getDbUser()` using Clerk `auth()`; `null` when no
    `userId`, else the `users` row keyed by `clerk_user_id`.
    - _Requirements: 1.6, 2.5, 11.2_
  - [x] 2.3 `app/lib/email.js` — async `sendEmail({ to, subject, html })`; Resend SMTP (465)
    when `RESEND_API_KEY`, else `SMTP_HOST`/`SMTP_PORT` (default `localhost:1025`); sender from
    `EMAIL_FROM`; try/catch logs failures without throwing.
    - _Requirements: 1.7_

- [x] 3. Implement Clerk middleware and app shell
  - [x] 3.1 `middleware.ts` — `clerkMiddleware` + `createRouteMatcher`; protect
    `/dashboard(.*)`, `/admin(.*)`, `/api(.*)`; exempt `/api/webhooks(.*)`; standard
    `config.matcher`.
    - _Requirements: 1.8_
  - [x] 3.2 `app/layout.js` — `<ClerkProvider>` with sign-in/sign-up fallback redirects to
    `/dashboard`, placeholder metadata, `<html lang="en">`.
    - _Requirements: 1.9_
  - [x] 3.3 `app/page.js` (public landing placeholder) and `app/globals.css` (minimal).
    - _Requirements: 1.1_
  - [x] 3.4 `app/sign-in/[[...sign-in]]/page.js` and `app/sign-up/[[...sign-up]]/page.js`
    rendering Clerk `<SignIn />` / `<SignUp />`.
    - _Requirements: 1.11_

- [x] 4. Implement the migration runner (users table only)
  - `scripts/migrate.js` — load `.env.local` via dotenv, build Neon `sql`, run
    `CREATE TABLE IF NOT EXISTS users (...)` in a try/catch logging per-table progress;
    `process.exit(1)` on failure; structured so later tables append.
  - _Requirements: 1.10_

- [x] 5. Implement the example authenticated route (placeholder)
  - `app/api/user/route.js` — GET returning the current user via `getDbUser()`, following the
    convention (401 on null, try/catch → 500, `Response.json`).
  - _Requirements: 1.14, 2.1, 2.3, 2.4_

- [x] 6. Implement the Jest ESM test harness and example test
  - [x] 6.1 `__tests__/setup.js` — `mockSql`, `mockGetDbUser`, Clerk `auth` mock registered
    via `jest.unstable_mockModule` before route imports; export `resetMocks()` and
    `makeRequest(url, opts)` (JSON content-type).
    - _Requirements: 1.13_
  - [x] 6.2 `__tests__/api/user.test.js` — dynamic handler import in `beforeEach` after
    `resetMocks()`; cover 401 (null user) and authenticated-success cases.
    - _Requirements: 1.14_

- [x] 7. Verify the foundation
  - Run `npm install`, then `npm test` (confirm user-route tests pass), then `npm run build`
    (confirm compile). Report anything unverifiable (e.g. live DB connection without env vars).
  - _Requirements: 1.17_

---

## Later milestones (roadmap — do not start until Milestone 0 is green and scope is confirmed)

- [x] 8. Milestone 1 — Domain model and migrations
  - Finalize entity columns, relationships, ownership, deletion behaviour, indexes, timestamps,
    and constraints; append domain `CREATE TABLE IF NOT EXISTS` statements to `scripts/migrate.js`
    (exercises, muscle_groups, exercise_muscles, workout_templates, template_exercises,
    training_sessions, session_exercises, workout_sets, sync_change_log). Seed muscle groups.
  - _Requirements: 4.1, 4.2, 6.1, 8.*, 9.*, 10.1, 11.3_

- [x] 9. Milestone 2 — Exercise library (API + UI)
  - CRUD for shared/personal exercises following the API convention; data-driven muscle groups.
  - Routes: `GET /api/muscle-groups`; `GET`/`POST /api/exercises`;
    `GET`/`PATCH`/`DELETE /api/exercises/[id]` (soft-delete via is_archived).
  - Ownership enforced in SQL (shared OR owner = user); foreign access returns 404 (no leak).
  - Mobile-first `/exercises` page: list + add form, muscle groups from the API.
  - 22 tests incl. cross-user denial; queries validated against Postgres 16.
  - _Requirements: 4.1, 4.2, 4.3, 2.*, 13.1, 13.4_

- [x] 10. Milestone 3 — Templates (API + UI)
  - Create/rename/duplicate/edit/archive templates; add/reorder exercises; targets.
  - Routes: `GET`/`POST /api/templates`; `GET`/`PATCH`/`DELETE /api/templates/[id]`;
    `POST /api/templates/[id]/duplicate`; `POST /api/templates/[id]/exercises`;
    `PATCH`/`DELETE /api/templates/[id]/exercises/[teId]`;
    `PUT /api/templates/[id]/exercises/order` (atomic reorder via sql.transaction).
  - Ownership enforced in SQL (incl. subquery guards for nested rows); foreign access 404.
  - Added exercises must be visible to the user (shared or owned); archive = soft-delete.
  - UI: `/templates` list (create/duplicate/archive) + `/templates/[id]` editor
    (rename, add, up/down reorder, remove, target sets). Dashboard links enabled.
  - 22 new tests incl. cross-user denial (48 total); SQL validated against Postgres 16.
  - NOTE: snapshot-on-start deferred to Milestone 4 (session creation).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 13.4_

- [x] 11. Milestone 4 — Live session + set logging
  - Start from template (snapshot-on-start, atomic via sql.transaction) or blank.
  - Routes: sessions CRUD + status (finish/abandon/resume); session-exercise add/skip/
    reorder/remove; previous-performance query; set add/edit/delete.
  - Snapshot-on-start copies template_exercises into session_exercises so later template
    edits never change history (validated against Postgres 16).
  - Ownership enforced in SQL at every nesting level (session -> exercise -> set); 404 on
    foreign access.
  - UI: `/train` (start/resume) + `/train/[id]` (set-entry table, mark/add/edit/delete sets,
    show-last-time, add/skip/remove exercise, finish/abandon). Dashboard card enabled.
  - 24 new tests incl. cross-user denial (72 total).
  - _Requirements: 5.*, 6.*, 7.2, 3.5, 13.4_

- [x] 12. Milestone 5 — Training history
  - Browse/open completed sessions; actual-vs-planned distinction; resume unfinished.
  - Reuses the existing sessions API (no new routes/migration).
  - `app/lib/metrics.js` — shared working-volume rules (completed, non-warm-up only),
    unit-tested; used by history summaries and future analytics.
  - UI: `/history` (unfinished + completed lists, resume links) and `/history/[id]`
    (read-only session with per-exercise working-set count + volume). Dashboard card enabled.
  - 5 new metrics tests (77 total).
  - _Requirements: 7.1, 7.2, 6.4_

- [x] 12.1 Onboarding maintenance and integrity hardening
  - Standardize local development on Node.js 22 LTS (`engines`, `.nvmrc`, README).
  - Enforce immutable completed/abandoned sessions and complete nested URL scoping in SQL.
  - Normalize mixed kg/lb history volume to kilograms before summing.
  - Surface template mutation failures and expose all existing exercise target fields.
  - Add regression tests for status guards, URL hierarchy, and unit conversion.

- [x] 12.2 Mobile application UI refinement
  - Add the authenticated app shell with persistent mobile navigation and a focused
    live-session mode.
  - Rework the dashboard hierarchy around the primary training action.
  - Refine live set entry with automatic previous-performance context, large numeric inputs,
    clear completion states, progress, confirmations, and save/error feedback.
  - Compact template planning into scannable summaries with expandable target editing.
  - Standardize cards, section headings, loading states, safe-area spacing, focus styles, and
    reduced-motion behavior across templates, exercises, training, and history.
  - No new dependencies, schema changes, or claims of offline synchronization.
  - _Requirements: 5.2, 5.3, 5.5, 12.1, 12.2, 12.3, 12.5_

- [ ] 13. Milestone 6 — Offline persistence + PWA shell  **(DEFERRED — post online-MVP)**
  - IndexedDB local store (UUID IDs, pending-changes queue); service worker + manifest; install
    to Home Screen; durable write path; sync-status UI.
  - Deferred by the 2026-10-15 scope decision; the data model already uses client-generatable
    UUIDs to keep this path open. (PWA install — manifest/icons — may be done earlier on its
    own, independent of offline.)
  - _Requirements: 8.*, 12.1, 12.2, 12.3_

- [ ] 14. Milestone 7 — Synchronization engine + idempotent endpoints  **(DEFERRED — post online-MVP)**
  - Idempotent sync endpoint (client_change_id ledger, UUID upserts); triggers on open/focus/
    online/manual; backoff; connectivity probe; documented conflict policy; server-side
    validation/authz. Tests: idempotent replay, out-of-order, failed-sync preserves local data.
  - Deferred by the 2026-10-15 scope decision; `sync_change_log` table already exists for this.
  - 2026-10-17 partial: set PATCH queue, atomic idempotent batch endpoint, ownership/finalized
    guards, ordered local overlay, open/focus/visibility/online retries, and status UI implemented.
    Session creation/finalization, structural mutations, backoff/checkpoints, and conflict UI remain.
  - _Requirements: 9.*, 13.3_

- [x] 15. Milestone 8 — Analytics foundation
  - Derived volume/progression queries; documented muscle-group attribution; unit-conversion
    correctness. Tests exclude warm-up/incomplete sets by default.
  - Routes: `GET /api/analytics/volume-by-muscle?weeks=N` (weekly volume per muscle group,
    primary full + secondary 0.5 credit, lb→kg normalized) and
    `GET /api/analytics/exercise/[exerciseId]` (per-session volume + top set).
  - Attribution factors documented and single-sourced in `app/lib/metrics.js`
    (PRIMARY=1, SECONDARY=0.5); primary muscle from `exercises`, secondaries from
    `exercise_muscles`, via UNION ALL. All derived at query time; no aggregate tables.
  - UI: `/progress` page (volume-by-muscle bars + exercise progression table), linked from
    the dashboard. Ownership scoped to the user; cross-user noise excluded (validated).
  - 10 new tests (89 total); the two analytics queries validated against Postgres 16.
  - _Requirements: 10.1, 10.2, 10.3, 12.4_

- [x] 15b. Settings + UX polish (online-MVP readiness)
  - `GET`/`PATCH /api/settings` for `preferred_unit` ('kg'|'lb'); `/settings` page with a
    segmented toggle; Settings link in the app-shell header.
  - Preferred unit wired through display: `/progress` and `/history/[id]` convert canonical
    kg to the user's unit via `convertWeight`/`totalVolume(targetUnit)`; stored values
    unchanged (non-destructive). `formatWeight` helper added to `app/lib/metrics.js`.
  - Confirmation prompts on destructive actions (template archive here; the live-session
    remove/finish/abandon confirms were added by the collaborator).
  - 8 new tests (97 total).
  - _Requirements: 12.4_

- [x] 16. Milestone 9 — Security hardening + cross-user tests
  - Systematic cross-user denial audit (`__tests__/api/cross-user-access.test.js`): every
    resource route returns 404 (not 403) for a non-owned resource — exercises, templates,
    template-exercises, sessions, session-exercises, sets, analytics.
  - Account deletion: `DELETE /api/account` deletes the local user row (cascades all owned
    data) then the Clerk user; two-step confirm in Settings danger zone. Retention policy
    documented in design.md (private by default, retained while account exists, immediate
    irreversible deletion).
  - Audit: all env access server-only; no secrets client-exposed; generic error responses
    (no raw error/stack leak); HTTPS in prod.
  - 23 new tests (120 total).
  - _Requirements: 11.2, 13.1, 13.4, 13.5_

- [x] 16.1 Exercise-specific performance history
  - Extend per-exercise analytics with workout name, working-set count, and top-set reps.
  - Restrict the chronology to completed/abandoned sessions with completed working sets so
    empty planned exercises do not hide meaningful earlier performance.
  - Add `/exercises/[id]/history` with preferred-unit display and links back to source workouts.
  - Link every exercise-library item and Progress session row to the relevant history detail.
  - _Requirements: 7.1, 10.1, 10.3, 10.5, 12.4_

- [x] 16.2 Body-group exercise discovery and catalogue expansion
  - Expand the shared seed catalogue with common movements across chest, back, lats,
    shoulders, arms, legs, glutes, calves, core, traps, forearms, adductors, and abductors.
  - Group the exercise library into data-driven body-group sections with a touch-friendly
    filter, and group template/live-workout selectors with native `optgroup` elements.
  - Preserve personal exercises and collect uncategorized entries under `Other`.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 16.3 Preserve recorded sets when finishing a workout
  - Keep weight and repetition inputs in live React state rather than relying only on blur.
  - Detect entered sets that are not marked Done, confirm how many will be counted, and save
    their latest values as completed before finalizing the workout.
  - Abort finalization if any recorded set fails to save so history cannot silently lose it.
  - _Requirements: 5.3, 5.5, 5.6, 6.2, 6.3_

- [x] 16.4 Visual body-group exercise selector
  - Add a responsive front/back SVG anatomy guide to the exercise library with the selected
    primary region highlighted in the existing design-system accent.
  - Synchronize body taps, view changes, labelled group filters, explanatory copy, and the
    visible exercise results through an explicit tested taxonomy mapping.
  - Keep labelled controls available for keyboard and screen-reader users because the body
    graphic is a progressive visual enhancement.
  - Pin the MIT-licensed React 19-compatible `react-muscle-highlighter` dependency.
  - _Requirements: 4.3, 4.4, 4.6, 12.1, 12.3_

- [x] 16.5 Selected-exercise body preview
  - Reuse the shared taxonomy-to-anatomy mapping in the template builder and live-workout
    exercise pickers.
  - Update a compact front/back body preview, primary-group label, exercise name, and equipment
    immediately when the selected exercise changes.
  - Keep the native grouped select as the authoritative accessible control and require no new
    API request or persisted data.
  - _Requirements: 4.4, 4.7, 12.1, 12.3_

- [x] 16.6 Trained-body context in history
  - Show a compact highlighted body preview and explicit primary-group label for every exercise
    in workout history detail.
  - Provide the same context on individual exercise-history pages by returning the existing
    muscle-group and equipment metadata from the analytics exercise lookup.
  - Reuse the shared anatomy mapping and require no schema migration or stored history changes.
  - _Requirements: 7.1, 7.4, 12.1, 12.3_

- [x] 16.7 In-app help and FAQ
  - Add a searchable `/help` page with a five-step getting-started workflow and practical FAQs
    for plans, training, sets, exercises, history, progress, units, privacy, and current offline
    limitations.
  - Keep help content in a shared data module with tested case-insensitive filtering.
  - Add a persistent header affordance, a Settings help card, and contextual links from every
    main workflow to the matching FAQ section.
  - Use semantic `details`/`summary` disclosures and the existing design tokens with no new
    dependency or backend data.
  - _Requirements: 12.3, 12.5, 12.6_

- [x] 16.8 Explicit logout
  - Add an accessible logout icon to the persistent app header using the installed Clerk
    `SignOutButton`, returning the user to the public landing page without deleting data.
  - Keep the reversible logout action visually separate from Settings' destructive account
    deletion area; keep deletion and its warning collapsed under Advanced account actions until
    deliberately opened.
  - Document the behavior in the in-app FAQ and architecture decision log.
  - _Requirements: 11.1, 12.3, 12.5_

- [x] 16.9 Consistent pointer hover feedback
  - Add restrained hover feedback for primary, secondary, destructive, icon, filter,
    segmented, menu, navigation, card, and disclosure controls using existing design tokens.
  - Apply hover behavior only to fine-pointer devices, preserve disabled states, and retain
    the global reduced-motion override.
  - _Requirements: 12.1, 12.2, 12.5_

- [x] 16.10 Front/back catalogue filters and exercise expansion
  - Make the anatomy guide's Front and Back controls filter the exercise catalogue to only
    body groups mapped to the selected side, without conflating the Back side with the Back
    muscle-group filter.
  - Make Front the initial catalogue filter, use explicit side membership, and display the
    currently visible exercise count rather than the unfiltered total. Synchronize the labelled
    body-group button row so only groups for the active side are offered.
  - Add 43 common shared movements across pressing, pulling, arms, legs, core, carries, and
    neck work through an idempotent seed migration.
  - Cover the front/back taxonomy split with unit tests.
  - _Requirements: 4.4, 4.5, 4.6, 4.8, 12.1, 12.5_

- [x] 16.11 Live workout rest timer
  - Let users enable, disable, or adjust each session exercise's rest duration without
    changing the plan it came from.
  - Start the countdown only after the Done mutation succeeds, using an absolute timestamp and
    session-scoped local storage so refreshes and background throttling do not reset it.
  - Present a compact safe-area-aware recovery panel with +30 seconds, Skip, visible completion,
    and best-effort sound/vibration alerts that require no notification permission.
  - Record actual versus planned recovery when the user starts the next set or skips, then show
    per-set and average rest in workout history and average rest in previous performance.
  - Validate rest overrides and measurements server-side and cover API validation plus timer calculations.
  - _Requirements: 3.3, 3.5, 5.3, 5.7, 5.8, 5.9, 12.2, 12.3, 12.5_

- [x] 16.12 Exercise demonstration media
  - Vendor reviewed Free Exercise DB start/finish assets and preserve the public-domain licence.
  - Map 29 existing shared exercises to durable provider IDs and locally hosted image pairs.
  - Show demonstrations behind an accessible disclosure on exercise history and live workout
    cards and in the live exercise picker; any future animation starts only after explicit Play.
  - Keep provider mapping isolated and exact so personal or similarly named exercises never
    receive an incorrect demonstration.
  - _Requirements: 4.9, 5.2, 12.2, 12.3, 12.5_

- [x] 16.13 Installable PWA shell
  - Add a standards-based manifest, branded any-purpose and maskable icons, Apple touch icon,
    standalone presentation metadata, theme colors, and Train/History shortcuts.
  - Add device-aware installation guidance in Settings, including the manual Safari workflow.
  - Keep the product copy explicit that installation does not yet provide offline workout writes.
  - _Requirements: 4.10, 8.1, 12.1, 12.3, 12.5_

- [x] 16.14 First-run onboarding
  - Preserve existing accounts as onboarded while routing new accounts through a skippable
    setup for preferred unit, goal, experience, and planned training days.
  - Offer one optional starter plan and create its template/exercises atomically, using reviewed
    shared movements and conservative targets without prescribing weight.
  - Hand off to an explicitly started first workout, plan review, or dashboard; allow later
    profile editing from Settings without duplicating a plan.
  - Cover validation, authentication, persistence failure, target generation, and transactional
    starter-plan creation.
  - _Requirements: 3.1, 4.1, 5.1, 12.1, 12.3, 12.5, 12.7_

- [x] 16.15 Active-workout local recovery slice
  - Persist the active session snapshot and dirty weight/repetition inputs in IndexedDB without
    adding a dependency or claiming server synchronization.
  - Merge unacknowledged inputs over the next authenticated server load and clear each field only
    after the corresponding server write succeeds.
  - On a network-level load failure, expose the cached recorder with explicit local-only status;
    allow numeric entry but disable server-dependent completion, finish, delete, rest, and workout
    structure actions. Never use cached private data after an HTTP 401, 404, or server error.
  - Full offline start/finish, service-worker app-shell caching, queued mutations, and reconnect
    synchronization remain in Milestones 6 and 7.
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 12.2, 12.3, 12.5_

- [x] 16.16 Idempotent set synchronization foundation
  - Queue retryable set changes in a user-scoped IndexedDB store and overlay them in chronological
    order over recovered/server session state.
  - Apply batches through an authenticated endpoint whose single-statement CTE combines nested
    ownership/status checks, ledger insertion, and update; acknowledge replays without rewriting.
  - Retry on open, focus, visibility regain, and reconnect; preserve rejected changes and surface
    local, syncing, and attention states globally.
  - Register a production-only service worker that caches public static assets and a safe offline
    fallback, never authenticated HTML or API data.
  - PostgreSQL 16 validation confirmed first application, replay no-op, and cross-user rejection.
  - _Requirements: 8.2, 8.4, 8.5, 9.1, 9.2, 9.4, 12.2, 12.3, 13.3_

- [x] 16.17 Offline set creation and workout finalization
  - Generate set UUIDs in the recorder and accept them through both the ordinary online route and
    the queued sync endpoint.
  - Optimistically add and snapshot sets locally, overlay pending creation on reload, and replay
    creation before subsequent edits.
  - Queue completed/abandoned session finalization after all recorded incomplete sets have queued
    their final values; keep the local record visible until server acknowledgement.
  - Validate both new CTE paths against PostgreSQL 16 and retain ownership/in-progress guards.
  - _Requirements: 5.3, 5.5, 8.2, 8.3, 8.5, 9.1, 9.2, 9.4_

- [x] 16.18 Offline blank workouts and structural editing
  - Generate and persist blank-session identity before the network write; queue creation on a
    retryable failure and recognize its user-scoped pending 404 in the live recorder.
  - Cache the exercise catalogue per authenticated user, then optimistically queue exercise
    creation/removal and set deletion with stable UUIDs.
  - Replay dependent operations in creation order and preserve nested ownership, visibility,
    in-progress, and idempotency guards in each atomic PostgreSQL CTE.
  - Validate session creation, exercise creation, and set deletion against PostgreSQL 16.
  - Template-based offline starts, offline plan editing, and user-directed conflict resolution remain.
  - _Requirements: 5.1, 5.2, 5.3, 8.1, 8.2, 8.3, 8.5, 9.1, 9.2, 9.4_

- [x] 16.19 Cached-plan offline starts
  - Expand and cache each owned plan's ordered exercises and targets after a successful Train load,
    preserving an older valid cache if an individual detail refresh fails.
  - Build the live session snapshot with fresh UUIDs offline, then queue the session and every
    exercise in dependency order without re-reading the mutable plan during synchronization.
  - Validate plan ownership when the server creates the session and preserve target sets,
    repetitions, weight, and rest values on queued exercise inserts.
  - Validate the plan-linked session and target snapshot CTEs against PostgreSQL 16.
  - _Requirements: 3.5, 5.1, 5.2, 8.1, 8.2, 8.3, 9.1, 9.2, 9.4_

- [x] 16.20 Recorder cold-launch shell
  - Cache exact previously visited Train/live-recorder navigation shells in production and
    proactively cache the executable assets already loaded during the first service-worker visit.
  - Keep navigations network-first and fall back to the exact recorder shell, then a public offline
    page; do not cache arbitrary application screens.
  - Exclude all API responses and keep private workout state in user-scoped IndexedDB only.
  - Add source-level regression coverage for route scope, API exclusion, and first-visit assets.
  - Physical iPhone/PWA airplane-mode acceptance remains manual.
  - _Requirements: 8.1, 8.3, 8.4, 8.5, 12.1, 12.3_

- [x] 16.21 User-directed synchronization conflicts
  - Park rejected and invalid queued changes instead of retrying them indefinitely; retain their
    attempted values in the authenticated user's local queue.
  - Link the global attention indicator and Settings to a dedicated Sync Issues screen.
  - Allow retry one/all and confirmed keep-server resolution, clearing only the selected queue
    entry and matching dirty set fields after the user decides.
  - Keep completed server workouts immutable and use a generic non-leaking conflict response.
  - Add unit and route regression coverage for classification, attempted-value presentation, and
    the rejection contract.
  - _Requirements: 8.2, 8.3, 8.5, 9.1, 9.3, 9.4, 12.3_

- [x] 16.22 Offline acceptance fixes: rest settings and complete-workout sync
  - Queue per-exercise rest-duration updates and keep the rest timer controls usable offline.
  - Persist the selected duration in the local session snapshot and synchronize it through an
    ownership-, status-, and idempotency-guarded CTE.
  - Drain queues in dependency-safe batches of 50 and recover queue entries previously parked only
    because the old client submitted an oversized batch.
  - Refresh History after sync so a newly acknowledged completed workout appears without reload.
  - Validate rest-setting application, replay no-op, cross-user denial, and finalized-session denial
    against disposable PostgreSQL 16; add regression tests for validation, overlays, ordering, and
    batch limits.
  - _Requirements: 5.4, 8.2, 8.3, 8.5, 9.1, 9.2, 9.3, 9.4_

- [x] 16.23 New-workout offline launch recovery
  - Remember the last authenticated owner namespace on-device for offline recovery and clear it
    when Clerk confirms an online signed-out state.
  - Treat failed responses as queueable while offline even if live Clerk state temporarily drops,
    while retaining server authorization for every later synchronization write.
  - Pre-cache a generic live-recorder route and navigate new offline UUID sessions through it.
  - Make workout start single-flight so repeated taps cannot create duplicate local sessions.
  - Bump the service-worker cache version and add regression coverage for offline response
    classification, recorder URLs, and the generic shell fallback.
  - _Requirements: 5.1, 8.1, 8.2, 8.3, 8.5, 12.1, 12.3_

- [x] 16.24 Upgraded-client offline owner recovery
  - Recover the offline namespace from existing drafts, queue records, or cached catalogues when
    the device contains exactly one known owner and the new local marker has not yet been written.
  - Refuse to guess on a shared browser containing multiple owners.
  - Keep blank workout start available with calm offline-ready copy even when no plans are cached.
  - Add regression tests for unique-owner recovery and multi-owner refusal.
  - _Requirements: 5.1, 8.1, 8.2, 8.3, 8.5, 11.2, 12.3_

- [x] 16.25 Localhost offline-response fallback
  - Treat a retryable API response as equivalent to a transport failure when a matching
    user-scoped in-progress draft exists.
  - Cover the localhost test case where Next.js remains reachable but Neon returns 5xx after Wi-Fi
    is disabled, while preserving 404 handling when online and refusing fallback without a draft.
  - Replace the red recorder error with a calm saved-locally status after recovery.
  - _Requirements: 5.1, 8.1, 8.2, 8.3, 8.5, 12.3_

- [x] 16.26 Cached-recorder UUID hydration
  - Resolve the new local session UUID from the live browser URL after the generic cached shell
    hydrates; do not retain the shell's server-rendered null query value.
  - Delay recorder loading until the UUID exists, preventing `/api/sessions/null` and ensuring the
    matching user-scoped draft is selected.
  - Add query parsing coverage and bump the service-worker cache generation.
  - _Requirements: 5.1, 8.1, 8.2, 8.3, 8.5, 12.3_

- [x] 16.27 Online start/auth-hydration decoupling
  - Keep start controls enabled while online even when Clerk's client hook has not yet supplied the
    offline namespace; rely on the authenticated API for the online write.
  - Require a known owner only for offline local creation and track connectivity reactively.
  - Add regression coverage for online, prepared-offline, and unprepared-offline start states.
  - _Requirements: 5.1, 8.1, 8.2, 11.2, 12.3_

- [x] 16.28 Cold-offline Clerk independence
  - Recover the remembered or uniquely discoverable local owner while offline even when Clerk's
    remote SDK never reaches `isLoaded`.
  - Start the recorder load once the local owner and session UUID exist, while retaining Clerk and
    server authorization as mandatory synchronization boundaries.
  - Add regression coverage for local-owner loading, ordinary authenticated loading, missing owner,
    and missing session identity; bump the service-worker cache generation.
  - _Requirements: 5.1, 8.1, 8.2, 8.3, 8.5, 11.2, 12.3_

- [x] 16.29 Derived personal records and safe celebrations
  - Compare an owned completed workout with earlier owned completed sessions at read time, without
    storing redundant record aggregates.
  - Detect strict improvements for heaviest completed set, repetitions at the same normalized
    weight, single-set volume, and total workout volume; use first performances as baselines.
  - Present supportive History celebrations that emphasize controlled progression rather than
    maximum-weight attempts, with display conversion to the user's preferred unit.
  - Add derivation and route regression coverage for authentication, ownership, eligibility,
    unit-normalized comparison, baseline behavior, and failures; validate SQL against PostgreSQL 16.
  - _Requirements: 6.4, 10.1, 10.3, 10.4, 10.6, 10.7, 11.2, 11.3_

- [x] 16.30 Recorder auth-hydration deadlock recovery
  - Start the online recorder API load from the existing authenticated cookie without waiting
    indefinitely for Clerk's remote browser bundle to hydrate.
  - Retain the local-owner boundary for offline private data and replace an unrecoverable offline
    skeleton with an explicit reconnect message after a short recovery window.
  - React to connectivity changes and cover online auth-bundle failure versus prepared and
    unprepared offline loading; bump the service-worker cache generation so installed clients
    receive the repaired recorder shell.
  - _Requirements: 8.1, 8.3, 8.5, 11.2, 12.3_

- [x] 16.31 Personal-record before/after comparison
  - Include source-session identity, name, date, and prior metric values in derived record results.
  - Show the previous best and improved workout together in each History record card, linking back
    to the earlier source workout for verification.
  - Preserve preferred-unit conversion and the safe-progression guidance.
  - _Requirements: 10.3, 10.6, 10.7, 10.8, 11.2_

- [x] 16.32 Weekly workout scheduling foundation
  - Add idempotent recurring plan slots with weekday, optional local time, ownership, cascade, and
    one-slot-per-plan/day database guarantees.
  - Add authenticated list/upsert/delete routes with validation, SQL ownership enforcement, and
    non-leaking 404 behavior.
  - Provide a mobile-first Plans scheduler ordered across the week with a local Today indicator,
    while keeping workout start manual and avoiding unsupported notification promises.
  - Add route and schedule-helper coverage and document the reminder boundary.
  - _Requirements: 3.1, 3.4, 11.2, 13.1, 14.1, 15.*_

- [ ] 17. Manual acceptance (user-performed; agent cannot verify)
  - Real-iPhone test: install to Home Screen, record a full session in airplane mode,
    close/reopen without data loss, sync on reconnect, review history.
  - _Requirements: Definition of MVP success; 8.*, 9.*, 12.1_
