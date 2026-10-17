# GymNotes Merge Handoff

**Prepared:** 17 October 2026
**Source branch:** `codex/exercise-history`
**Target branch:** `main`
**Base commit:** `359a34d` (`Add security hardening + account deletion (Milestone 9)`)

## Purpose

This document explains the complete cumulative change set prepared after the current `main` branch. It is intended for the repository owner, human reviewers, and another AI development agent. The work advances GymNotes from an online workout tracker toward a mobile-first, installable, offline-capable training companion while preserving authenticated ownership boundaries.

The authoritative implementation record remains:

- `.kiro/specs/workout-tracker/requirements.md`
- `.kiro/specs/workout-tracker/design.md`
- `.kiro/specs/workout-tracker/tasks.md`

Those files were updated with the decisions and acceptance criteria described below.

## Product changes

### Exercise discovery and education

- Expanded the shared exercise catalogue with common exercises across chest, back, lats, shoulders, arms, legs, glutes, calves, core, traps, forearms, adductors, abductors, and neck.
- Added explicit front/back body-side filtering. Front is the default and only exposes front-mapped body groups; Back only exposes back-mapped groups.
- Added an interactive anatomy selector and compact selected-exercise body previews to the exercise library, plan builder, and active workout selector.
- Added trained-body context to workout and exercise history.
- Added locally hosted, reviewed Free Exercise DB start/finish demonstration images for exactly mapped shared exercises. Personal exercises and ambiguous names never receive an automatic mapping.
- Added a searchable in-app Help/FAQ covering plans, workouts, sets, exercise discovery, history, progress, units, privacy, offline behavior, and scheduling.

**Why:** choosing an unfamiliar exercise was difficult without knowing its target area or execution. The visual taxonomy and demonstrations reduce that ambiguity without making the graphic the only accessible control.

### Workout recording and recovery

- Preserved live weight and repetition edits in React state so finishing a workout cannot silently lose an entered set merely because the input did not blur.
- Finishing detects entered-but-not-completed sets, asks the user to confirm that they should count, persists them, and aborts finalization if any write fails.
- Added per-exercise rest-duration overrides and an absolute-time rest timer after a successfully completed working set.
- Added `+30 seconds`, Skip, completion sound/vibration where supported, reload-safe timer state, and actual-versus-planned rest recording.
- Added actual rest values and average rest to workout history and previous-performance context.
- Added more precise volume labels so values such as `96 kg` are described as total completed working-set volume rather than as a lifted weight.

**Why:** set capture is the product's highest-risk workflow. The changes prioritize data integrity, fast input, and useful recovery guidance without encouraging unsafe maximum-weight behavior.

### History, progress, and personal records

- Added exercise-specific history pages with completed working sets, workout source links, preferred-unit display, target body group, and equipment.
- Excluded empty planned exercises and incomplete sets from meaningful performance chronology.
- Added derived personal records for heaviest completed set, repetitions at the same normalized weight, highest single-set volume, and highest workout volume.
- Personal-record cards show the previous best and the improved workout together, including dates, workout names, values, and a link to the prior source session.
- Record copy emphasizes controlled progression instead of weight-at-any-cost behavior.

**Why:** users need to understand improvement in context. Deriving records at read time avoids redundant aggregate data and makes each celebration auditable against its source workouts.

### Account, onboarding, and profile UX

- Added first-run onboarding for preferred unit, goal, experience level, and planned training frequency, with an optional conservative starter plan.
- Existing accounts remain onboarded; only newly provisioned users enter the flow.
- Added a profile summary in Settings and made onboarding answers editable.
- Added a persistent header logout icon using Clerk's sign-out flow.
- Kept account deletion separate and collapsed under Advanced account actions so logout is not visually associated with destructive deletion.
- Added restrained fine-pointer hover feedback throughout the application while preserving disabled and reduced-motion behavior.

**Why:** new users receive a useful starting configuration, while reversible logout and irreversible deletion are now clearly separated.

### Installable PWA and offline workouts

- Added a web app manifest, branded icons, maskable/Apple assets, standalone metadata, Train/History shortcuts, install guidance, offline fallback, and a production service worker.
- Added user-scoped IndexedDB stores for active workout snapshots, dirty fields, cached exercise/plan data, queued mutations, synchronization state, and conflicts.
- Offline-capable flows now include blank and cached-plan workout start, exercise and set structure changes, weight/repetition changes, rest settings and outcomes, workout finalization, close/reopen recovery, and reconnect synchronization.
- Added stable client UUIDs and an authenticated, atomic, idempotent synchronization endpoint. A per-user change ledger makes replay safe.
- Added ordered replay, dependency preservation, exponential retry/backoff, connectivity probing, focus/visibility/online retries, and global saved/syncing/attention indicators.
- Added a Sync Issues screen for rejected changes with Retry and confirmed Keep server value actions. Rejected data remains local until the user resolves it.
- Added several cold-launch and localhost-specific recovery fixes: remembered offline owner lookup, cached recorder UUID hydration, Clerk browser-bundle independence, retryable API fallback, and auth-hydration deadlock recovery.

**Why:** gym connectivity is unreliable. Local workout recording must remain usable without weakening server authorization or leaking one user's cached data to another. APIs and authenticated HTML are deliberately not service-worker cached; private data stays in user-scoped IndexedDB.

### Weekly workout scheduling

- Added recurring plan slots with weekday and optional local wall-clock time.
- Added a mobile-first scheduler under Plans with a localized time display and Today marker.
- Adding the same plan/day updates that slot instead of creating duplicates; schedules can be removed.
- Starting a workout remains an explicit user action. No push-notification or background-reminder promise is made.

**Why:** this provides lightweight planning value now, without prematurely introducing notification permissions, timezone jobs, or unsupported delivery guarantees.

## Architecture and important files

| Area | Important files | Notes |
| --- | --- | --- |
| Requirements and decisions | `.kiro/specs/workout-tracker/{requirements,design,tasks}.md` | Full acceptance criteria and milestone log |
| Database | `scripts/migrate.js` | Idempotent schema additions, indexes, and exercise seeds |
| Active recorder | `app/train/[id]/page.js`, `app/lib/workout-session.js`, `app/lib/rest-timer.js` | Live/offline state, timer, and recorder UX |
| Offline persistence | `app/lib/workout-draft-store.js`, `app/lib/offline-session.js` | User-scoped IndexedDB data and cached starts |
| Synchronization | `app/api/sync/route.js`, `app/components/SyncManager.js`, `app/lib/sync-change.js`, `app/lib/sync-issues.js` | Atomic replay, lifecycle retries, status, conflict handling |
| PWA shell | `app/manifest.js`, `public/sw.js`, `public/offline.html`, `app/components/InstallAppCard.js` | Install and safe shell caching |
| Exercise UX | `app/exercises/page.js`, `app/components/BodyGroupSelector.js`, `app/components/ExerciseBodyPreview.js`, `app/lib/body-map.js`, `app/lib/exercises.js` | Catalogue grouping, anatomy mapping, front/back logic |
| Demonstrations | `app/components/ExerciseDemonstration.js`, `app/lib/exercise-media.js`, `public/vendor/free-exercise-db/` | Exact mapping and locally hosted public-domain assets |
| History and records | `app/history/`, `app/exercises/[id]/history/page.js`, `app/api/sessions/[id]/records/`, `app/lib/personal-records.js` | Historical detail and derived records |
| Onboarding/profile | `app/onboarding/`, `app/api/onboarding/`, `app/components/OnboardingFlow.js`, `app/settings/page.js` | First-run setup and profile maintenance |
| Help | `app/help/page.js`, `app/lib/help-content.js`, `app/components/HelpLink.js` | Searchable contextual FAQ |
| Scheduling | `app/templates/page.js`, `app/api/schedules/`, `app/lib/schedules.js` | Weekly plan-slot management |

## Database migration impact

All changes in `scripts/migrate.js` are designed to be repeatable and deploy through the existing `postbuild` workflow.

Additions include:

- Onboarding/profile fields on `users`.
- Planned/actual rest fields on `workout_sets`.
- `workout_schedules`, unique per owner/template/weekday, with owner and template cascades.
- Supporting schedule index.
- Expanded shared exercise catalogue through conflict-safe seed inserts.

The configured Neon development database has already run the migrations successfully. The schedule migration was separately exercised against disposable PostgreSQL 16 for insert, upsert, cross-user denial, and cascade deletion. The sync CTE paths were likewise validated against real PostgreSQL during implementation.

No production/shared data was deleted or rewritten. Deployers should still use the standard backup and migration observability appropriate to their environment.

## Security and privacy decisions

- Every new protected route authenticates first and scopes ownership in SQL.
- Inaccessible user-owned resources return 404 rather than revealing their existence with 403.
- The synchronization API validates session status, nested ownership, operation type, and payload before applying changes.
- Queued private data is namespaced by the authenticated/remembered local owner and is never accepted by the server without Clerk authentication and SQL ownership checks.
- The service worker excludes API responses and does not cache arbitrary authenticated application HTML.
- No database URLs, Clerk secrets, webhook secrets, or other credentials are included in this change set.
- The private `DEVELOPMENT_ONBOARDING.md` file is intentionally excluded from the merge.

## Dependencies and licences

- Added pinned `react-muscle-highlighter@1.2.0` for the anatomy visualization.
- Vendored selected Free Exercise DB images. Their licence is retained at `public/vendor/free-exercise-db/LICENSE.md`.
- No hosted paid exercise-media API is required for the current demonstrations.

## Verification completed

- `npm test -- --runInBand`: **33 suites, 219 tests passed**.
- `npx next build`: **passed** with Next.js 16.4.0.
- `git diff --check`: **passed**.
- Secret-pattern scan across the repository, excluding build/dependency metadata and binary assets: **no credentials found**.
- Local production server: **running successfully** and `/templates` returned HTTP 200.
- User acceptance already completed for the local installed PWA workflow: start and finish offline, close/reopen, reconnect, synchronize, and verify History.

## Reviewer focus areas

1. Review `app/api/sync/route.js` together with `app/lib/sync-change.js` and the sync tests; this is the most security- and data-integrity-sensitive path.
2. Review `public/sw.js` cache scope. It must continue to exclude API responses and private arbitrary pages.
3. Review user scoping in all IndexedDB calls when changing Clerk/session behavior.
4. Preserve stable UUID generation and mutation ordering when extending offline structural edits.
5. Keep front/back anatomy membership explicit in `app/lib/body-map.js`; do not infer it from labels.
6. Keep exercise-media mappings exact and retain the vendor licence when adding assets.
7. Run migrations and the full build/test suite before deployment.

## Remaining work and known boundaries

- Formal physical-iPhone Safari/Home Screen airplane-mode acceptance remains recorded as a manual task in `.kiro/specs/workout-tracker/tasks.md`.
- Weekly schedules do not yet appear as a Today card on Home/Train and do not send notifications. A sensible next slice is a one-tap Today workout card; reminders require a separate product and permission design.
- The schedule stores local wall-clock time without timezone or server job semantics.
- Exercise demonstrations are start/finish frames, not paid-provider animations.
- Personal records are derived on demand; if data volume grows substantially, query/index performance should be measured before introducing stored aggregates.

## Suggested smoke test after merge

1. Sign in and verify the saved profile summary in Settings.
2. Open Exercises; confirm Front and Back expose only their mapped groups and that body previews update.
3. Start a workout, add an exercise, record a set, and verify the rest timer.
4. Finish and confirm weight, repetitions, rest, trained body part, and any personal-record before/after card in History.
5. Create a plan schedule in Plans, refresh, update its time, and remove it.
6. Install/open the PWA, repeat a short workout offline, close/reopen, reconnect, synchronize, and verify History.
7. Confirm logout returns to the public landing page and account deletion remains under Advanced account actions.
