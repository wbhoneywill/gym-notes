# GymNotes

A mobile-first, offline-first web app for planning, recording, and reviewing gym
workouts — built for use on an iPhone during training sessions.

**Core principle:** recording a set must be fast, reliable, and work offline.
**Brand essence:** quiet strength, measurable progress, no distractions.

Live: https://gym-notes-khaki.vercel.app

## Tech stack

- **Next.js 16** (App Router) · **React 19** · ES modules
- **PostgreSQL** via the **Neon** serverless driver
- **Clerk** authentication
- **Nodemailer** (Resend SMTP in production)
- **Jest 30** (ESM) for tests
- Deployed serverless (Vercel); database migrations run automatically on deploy

## Getting started

**Prerequisites:** Node.js 22 LTS and accounts/credentials for Neon (Postgres) and
Clerk (auth). Docker is optional but used to validate SQL locally.

```bash
# 1. Select the project's Node version and install locked dependencies
nvm use
npm ci

# 2. Create your local env file from the template
cp .env.example .env.local
#    then fill in your own values (see "Environment variables" below)

# 3. Apply the database schema
npm run migrate

# 4. Run the app
npm run dev          # http://localhost:3000
```

### Environment variables

Copy `.env.example` and provide your own values:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (use the **pooled** string) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_...`) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_...`) |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Verifies Clerk user-sync webhooks (`whsec_...`) |
| `EMAIL_FROM` | Sender address for outgoing email |
| `RESEND_API_KEY` *or* `SMTP_HOST`/`SMTP_PORT` | Email transport (optional in dev) |

> **Never commit secrets.** `.env` and `.env*.local` are git-ignored — keep it that
> way. Share credentials with teammates through a password manager, never via git or
> chat.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs migrations afterwards via `postbuild`) |
| `npm run migrate` | Apply idempotent schema migrations to `DATABASE_URL` |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run tests in watch mode |

## Project structure

```
app/
  api/              # Route handlers (REST-ish, follow the API convention)
  lib/              # db (Neon), auth (getDbUser), email, metrics
  dashboard/ exercises/ templates/ train/ history/   # pages
  globals.css       # design tokens + styles
scripts/migrate.js  # idempotent migration runner (runs on deploy)
__tests__/          # Jest ESM tests (+ shared setup/mocks)
.kiro/specs/workout-tracker/   # requirements, design, tasks (source of truth)
AGENTS.md           # conventions for AI agents + contributors
```

## How we work

### Source of truth
The detailed project context lives in `.kiro/specs/workout-tracker/`
(`requirements.md`, `design.md`, `tasks.md`) and the conventions live in
[`AGENTS.md`](./AGENTS.md). Read them before making non-trivial changes, and keep
them updated as the shared decision log when you land a change.

### Working with AI agents
This project is developed with more than one AI coding agent (Kiro and Codex). Both
read repo files as their shared context: Codex reads `AGENTS.md`; Kiro reads
`.kiro/steering/project.md` (which points at `AGENTS.md`). Keep those in sync — they
describe the same conventions for different audiences.

### Branching & pull requests
With more than one contributor, prefer short-lived branches and PRs over pushing
straight to `main`:

```bash
git checkout -b feature/short-description
# ... make changes, commit ...
git push -u origin feature/short-description
# open a PR for review
```

- Keep commits focused with clear messages — they are the durable project history.
- Run `npm run build` and `npm test` before opening a PR; fix anything red.
- Add tests for new features and bug fixes; cover auth, validation, and cross-user
  access for new API routes (see `AGENTS.md` for the conventions).

## Status & roadmap

Built and deployed: foundation (auth, DB, email, tests, deploy), exercise library,
workout templates, live training with set logging, and training history.

The installable PWA shell, active-workout recovery, and first synchronization slice are
implemented. Blank or cached-plan workouts, exercise/set structure, set values, and finalization
can be queued locally and acknowledged updates replay idempotently. Previously visited recorder
routes can launch from the production PWA shell without caching private API data. Rejected changes
stop retrying and can be reviewed, retried, or discarded from Settings → Offline sync. Offline plan
editing and physical-iPhone acceptance remain before complete offline-first operation can be
claimed. See `.kiro/specs/workout-tracker/tasks.md`.

Offline synchronization is drained in dependency-safe batches. Exercise rest durations and recorded
rest outcomes are available in the offline recorder, and History refreshes when a completed local
workout is acknowledged after reconnecting.

Opening Train online also prepares a generic recorder shell, allowing a newly generated blank or
cached-plan session to open offline even though its UUID route has never been visited before.

New accounts also receive a skippable first-run setup for unit, goal, experience, and
training-day preferences, with an optional starter plan and guided first-workout handoff.
Existing accounts are preserved as already onboarded; the profile remains editable in Settings.

## Third-party exercise visuals

Selected start/finish images are vendored from
[Free Exercise DB](https://github.com/yuhonas/free-exercise-db). The upstream dataset is
released into the public domain under the Unlicense; a copy is preserved at
`public/vendor/free-exercise-db/LICENSE.md`. GymNotes stores reviewed provider IDs and
serves the selected files locally so demonstrations remain available offline and do not
depend on a third-party API. The provider-neutral mapping also retains an optional
animation field for a future properly licensed source.
