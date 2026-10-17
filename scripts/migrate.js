import 'dotenv/config';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Load .env.local explicitly for local script runs. In deployment the
// environment variables are provided by the host.
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL, { fetchConnectionCache: true });

/**
 * Each migration is a named, idempotent CREATE TABLE IF NOT EXISTS statement.
 * Append new tables to this list following the same pattern; migrations run on
 * every build via the `postbuild` script, so they must stay idempotent.
 */
const migrations = [
  {
    name: 'users',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        clerk_user_id TEXT UNIQUE NOT NULL,
        email TEXT,
        name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // --- Milestone 1: domain model ---------------------------------------

  // Add the user's preferred display unit. Idempotent for existing rows.
  {
    name: 'users.preferred_unit',
    run: () => sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS preferred_unit TEXT NOT NULL DEFAULT 'kg';
    `,
  },

  // Existing accounts remain uninterrupted; after this column is added its
  // default is changed to false so newly provisioned users enter onboarding.
  {
    name: 'users.onboarding_completed',
    run: () => sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE;
    `,
  },
  {
    name: 'users.onboarding_completed_default',
    run: () => sql`
      ALTER TABLE users
        ALTER COLUMN onboarding_completed SET DEFAULT FALSE;
    `,
  },
  {
    name: 'users.training_goal',
    run: () => sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS training_goal TEXT;
    `,
  },
  {
    name: 'users.experience_level',
    run: () => sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS experience_level TEXT;
    `,
  },
  {
    name: 'users.training_days_per_week',
    run: () => sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS training_days_per_week INTEGER;
    `,
  },

  // Reference taxonomy. Seeded, never client-created, so a SERIAL id is fine.
  {
    name: 'muscle_groups',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS muscle_groups (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // Exercises. owner_user_id NULL => shared/global exercise; non-null =>
  // personal exercise. UUID so personal exercises can be created offline.
  {
    name: 'exercises',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS exercises (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        primary_muscle_group_id INTEGER REFERENCES muscle_groups(id) ON DELETE SET NULL,
        equipment TEXT,
        movement_category TEXT,
        description TEXT,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // Secondary muscle involvement (many-to-many), with a role for future
  // weighted volume attribution.
  {
    name: 'exercise_muscles',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS exercise_muscles (
        exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        muscle_group_id INTEGER NOT NULL REFERENCES muscle_groups(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'secondary',
        PRIMARY KEY (exercise_id, muscle_group_id)
      );
    `,
  },

  // Reusable workout templates. Soft-deleted via is_archived.
  {
    name: 'workout_templates',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS workout_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // Exercises planned within a template, with optional targets.
  {
    name: 'template_exercises',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS template_exercises (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL DEFAULT 0,
        target_sets INTEGER,
        target_rep_min INTEGER,
        target_rep_max INTEGER,
        target_weight NUMERIC(7, 2),
        rest_seconds INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // A training session. UUID so it can be created offline. template_id is
  // nullable for blank sessions; the planned sequence is snapshotted into
  // session_exercises at start so later template edits never alter history.
  {
    name: 'training_sessions',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS training_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'in_progress',
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // Optional recurring weekly slots for owned plans. Times are intentionally
  // local wall-clock values; this MVP does not schedule server push jobs.
  {
    name: 'workout_schedules',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS workout_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        local_time TIME,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (owner_user_id, template_id, weekday)
      );
    `,
  },

  // Snapshot of an exercise within a session. Keeps a reference to the source
  // exercise plus snapshotted planned targets.
  {
    name: 'session_exercises',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS session_exercises (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
        exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL DEFAULT 0,
        skipped BOOLEAN NOT NULL DEFAULT FALSE,
        target_sets INTEGER,
        target_rep_min INTEGER,
        target_rep_max INTEGER,
        target_weight NUMERIC(7, 2),
        rest_seconds INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // Individual recorded sets. UUID + client-generatable for offline entry.
  {
    name: 'workout_sets',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS workout_sets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_exercise_id UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
        set_order INTEGER NOT NULL DEFAULT 0,
        weight NUMERIC(7, 2),
        weight_unit TEXT NOT NULL DEFAULT 'kg',
        reps INTEGER,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        set_type TEXT NOT NULL DEFAULT 'working',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    name: 'workout_sets_planned_rest_seconds',
    run: () => sql`
      ALTER TABLE workout_sets
      ADD COLUMN IF NOT EXISTS planned_rest_seconds INTEGER;
    `,
  },
  {
    name: 'workout_sets_rest_duration_seconds',
    run: () => sql`
      ALTER TABLE workout_sets
      ADD COLUMN IF NOT EXISTS rest_duration_seconds INTEGER;
    `,
  },
  {
    name: 'workout_sets_rest_outcome',
    run: () => sql`
      ALTER TABLE workout_sets
      ADD COLUMN IF NOT EXISTS rest_outcome TEXT;
    `,
  },

  // Idempotency ledger for sync. A (owner_user_id, client_change_id) pair is
  // recorded once a change is applied; replays become no-ops.
  {
    name: 'sync_change_log',
    run: () => sql`
      CREATE TABLE IF NOT EXISTS sync_change_log (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_change_id UUID NOT NULL,
        entity_type TEXT,
        entity_id UUID,
        applied_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (owner_user_id, client_change_id)
      );
    `,
  },

  // Indexes for common ownership / ordering lookups. The Neon HTTP driver
  // runs one statement per tagged-template call, so each index is its own.
  {
    name: 'idx_exercises_owner',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_exercises_owner ON exercises(owner_user_id);`,
  },
  {
    name: 'idx_templates_owner',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_templates_owner ON workout_templates(owner_user_id);`,
  },
  {
    name: 'idx_template_exercises_template',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id);`,
  },
  {
    name: 'idx_sessions_owner',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_sessions_owner ON training_sessions(owner_user_id);`,
  },
  {
    name: 'idx_workout_schedules_owner_weekday',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_workout_schedules_owner_weekday ON workout_schedules(owner_user_id, weekday);`,
  },
  {
    name: 'idx_session_exercises_session',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises(session_id);`,
  },
  {
    name: 'idx_workout_sets_session_exercise',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_workout_sets_session_exercise ON workout_sets(session_exercise_id);`,
  },
  {
    name: 'idx_sync_log_owner',
    run: () => sql`CREATE INDEX IF NOT EXISTS idx_sync_log_owner ON sync_change_log(owner_user_id);`,
  },

  // Seed the baseline muscle-group taxonomy. Idempotent via ON CONFLICT.
  {
    name: 'seed_muscle_groups',
    run: () => sql`
      INSERT INTO muscle_groups (name) VALUES
        ('Chest'), ('Back'), ('Shoulders'), ('Biceps'), ('Triceps'),
        ('Forearms'), ('Quadriceps'), ('Hamstrings'), ('Glutes'),
        ('Calves'), ('Core'), ('Traps'), ('Lats'), ('Adductors'),
        ('Abductors'), ('Neck')
      ON CONFLICT (name) DO NOTHING;
    `,
  },

  // Enforce one shared exercise per name so the starter seed is idempotent.
  // Partial unique index applies only to shared rows (owner_user_id IS NULL);
  // personal exercises are unaffected and may share names freely.
  {
    name: 'uniq_shared_exercise_name',
    run: () => sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_shared_exercise_name
      ON exercises (name)
      WHERE owner_user_id IS NULL;
    `,
  },

  // Seed a starter set of shared exercises so a new user's library isn't empty.
  // primary_muscle_group_id is resolved by name; ON CONFLICT keeps it idempotent.
  {
    name: 'seed_shared_exercises',
    run: () => sql`
      INSERT INTO exercises (owner_user_id, name, primary_muscle_group_id, equipment, movement_category)
      VALUES
        (NULL, 'Barbell Bench Press',      (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Barbell',  'Push'),
        (NULL, 'Incline Dumbbell Press',   (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Dumbbell', 'Push'),
        (NULL, 'Overhead Press',           (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Barbell',  'Push'),
        (NULL, 'Lateral Raise',            (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Dumbbell', 'Isolation'),
        (NULL, 'Triceps Pushdown',         (SELECT id FROM muscle_groups WHERE name = 'Triceps'),    'Cable',    'Isolation'),
        (NULL, 'Pull-Up',                  (SELECT id FROM muscle_groups WHERE name = 'Lats'),       'Bodyweight','Pull'),
        (NULL, 'Barbell Row',              (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Barbell',  'Pull'),
        (NULL, 'Lat Pulldown',             (SELECT id FROM muscle_groups WHERE name = 'Lats'),       'Cable',    'Pull'),
        (NULL, 'Barbell Curl',             (SELECT id FROM muscle_groups WHERE name = 'Biceps'),     'Barbell',  'Isolation'),
        (NULL, 'Face Pull',                (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Cable',    'Pull'),
        (NULL, 'Back Squat',               (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Barbell',  'Legs'),
        (NULL, 'Romanian Deadlift',        (SELECT id FROM muscle_groups WHERE name = 'Hamstrings'), 'Barbell',  'Legs'),
        (NULL, 'Deadlift',                 (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Barbell',  'Pull'),
        (NULL, 'Leg Press',                (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Machine',  'Legs'),
        (NULL, 'Leg Curl',                 (SELECT id FROM muscle_groups WHERE name = 'Hamstrings'), 'Machine',  'Isolation'),
        (NULL, 'Standing Calf Raise',      (SELECT id FROM muscle_groups WHERE name = 'Calves'),     'Machine',  'Isolation'),
        (NULL, 'Plank',                    (SELECT id FROM muscle_groups WHERE name = 'Core'),       'Bodyweight','Core'),
        (NULL, 'Hip Thrust',               (SELECT id FROM muscle_groups WHERE name = 'Glutes'),     'Barbell',  'Legs')
      ON CONFLICT (name) WHERE owner_user_id IS NULL DO NOTHING;
    `,
  },

  // Expand the shared catalogue across the seeded body-group taxonomy.
  // The partial unique index makes repeat deploys safe.
  {
    name: 'expand_shared_exercise_catalogue',
    run: () => sql`
      INSERT INTO exercises (owner_user_id, name, primary_muscle_group_id, equipment, movement_category)
      VALUES
        (NULL, 'Dumbbell Bench Press',         (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Dumbbell',   'Push'),
        (NULL, 'Push-Up',                       (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Bodyweight', 'Push'),
        (NULL, 'Cable Fly',                     (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Cable',      'Isolation'),
        (NULL, 'Seated Cable Row',              (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Cable',      'Pull'),
        (NULL, 'Chest-Supported Row',           (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Dumbbell',   'Pull'),
        (NULL, 'Single-Arm Dumbbell Row',       (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Dumbbell',   'Pull'),
        (NULL, 'Chin-Up',                       (SELECT id FROM muscle_groups WHERE name = 'Lats'),       'Bodyweight', 'Pull'),
        (NULL, 'Straight-Arm Pulldown',         (SELECT id FROM muscle_groups WHERE name = 'Lats'),       'Cable',      'Isolation'),
        (NULL, 'Arnold Press',                  (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Dumbbell',   'Push'),
        (NULL, 'Rear Delt Fly',                 (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Dumbbell',   'Isolation'),
        (NULL, 'Machine Shoulder Press',        (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Machine',    'Push'),
        (NULL, 'Hammer Curl',                   (SELECT id FROM muscle_groups WHERE name = 'Biceps'),     'Dumbbell',   'Isolation'),
        (NULL, 'Incline Dumbbell Curl',         (SELECT id FROM muscle_groups WHERE name = 'Biceps'),     'Dumbbell',   'Isolation'),
        (NULL, 'Cable Curl',                    (SELECT id FROM muscle_groups WHERE name = 'Biceps'),     'Cable',      'Isolation'),
        (NULL, 'Skull Crusher',                 (SELECT id FROM muscle_groups WHERE name = 'Triceps'),    'Barbell',    'Isolation'),
        (NULL, 'Overhead Triceps Extension',    (SELECT id FROM muscle_groups WHERE name = 'Triceps'),    'Dumbbell',   'Isolation'),
        (NULL, 'Close-Grip Bench Press',        (SELECT id FROM muscle_groups WHERE name = 'Triceps'),    'Barbell',    'Push'),
        (NULL, 'Front Squat',                   (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Barbell',    'Legs'),
        (NULL, 'Bulgarian Split Squat',         (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Dumbbell',   'Legs'),
        (NULL, 'Leg Extension',                 (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Machine',    'Isolation'),
        (NULL, 'Walking Lunge',                 (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Dumbbell',   'Legs'),
        (NULL, 'Lying Leg Curl',                (SELECT id FROM muscle_groups WHERE name = 'Hamstrings'), 'Machine',    'Isolation'),
        (NULL, 'Good Morning',                  (SELECT id FROM muscle_groups WHERE name = 'Hamstrings'), 'Barbell',    'Legs'),
        (NULL, 'Glute Bridge',                  (SELECT id FROM muscle_groups WHERE name = 'Glutes'),     'Bodyweight', 'Legs'),
        (NULL, 'Cable Kickback',                (SELECT id FROM muscle_groups WHERE name = 'Glutes'),     'Cable',      'Isolation'),
        (NULL, 'Seated Calf Raise',             (SELECT id FROM muscle_groups WHERE name = 'Calves'),     'Machine',    'Isolation'),
        (NULL, 'Hanging Leg Raise',             (SELECT id FROM muscle_groups WHERE name = 'Core'),       'Bodyweight', 'Core'),
        (NULL, 'Cable Crunch',                  (SELECT id FROM muscle_groups WHERE name = 'Core'),       'Cable',      'Core'),
        (NULL, 'Russian Twist',                 (SELECT id FROM muscle_groups WHERE name = 'Core'),       'Bodyweight', 'Core'),
        (NULL, 'Dumbbell Shrug',                (SELECT id FROM muscle_groups WHERE name = 'Traps'),      'Dumbbell',   'Pull'),
        (NULL, 'Farmer Carry',                  (SELECT id FROM muscle_groups WHERE name = 'Forearms'),   'Dumbbell',   'Carry'),
        (NULL, 'Wrist Curl',                    (SELECT id FROM muscle_groups WHERE name = 'Forearms'),   'Dumbbell',   'Isolation'),
        (NULL, 'Hip Adduction',                 (SELECT id FROM muscle_groups WHERE name = 'Adductors'),  'Machine',    'Isolation'),
        (NULL, 'Hip Abduction',                 (SELECT id FROM muscle_groups WHERE name = 'Abductors'),  'Machine',    'Isolation')
      ON CONFLICT (name) WHERE owner_user_id IS NULL DO NOTHING;
    `,
  },

  // Extend the catalogue with more common gym movements and ensure every
  // visual body side has a useful selection. Safe on repeat deploys.
  {
    name: 'expand_shared_exercise_catalogue_v2',
    run: () => sql`
      INSERT INTO exercises (owner_user_id, name, primary_muscle_group_id, equipment, movement_category)
      VALUES
        (NULL, 'Incline Barbell Bench Press', (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Barbell',    'Push'),
        (NULL, 'Decline Bench Press',         (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Barbell',    'Push'),
        (NULL, 'Machine Chest Press',         (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Machine',    'Push'),
        (NULL, 'Pec Deck',                    (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Machine',    'Isolation'),
        (NULL, 'Dumbbell Fly',                (SELECT id FROM muscle_groups WHERE name = 'Chest'),      'Dumbbell',   'Isolation'),
        (NULL, 'T-Bar Row',                   (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Machine',    'Pull'),
        (NULL, 'Bent-Over Dumbbell Row',      (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Dumbbell',   'Pull'),
        (NULL, 'Pendlay Row',                 (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Barbell',    'Pull'),
        (NULL, 'Machine Row',                 (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Machine',    'Pull'),
        (NULL, 'Back Extension',              (SELECT id FROM muscle_groups WHERE name = 'Back'),       'Bodyweight', 'Pull'),
        (NULL, 'Neutral-Grip Pulldown',       (SELECT id FROM muscle_groups WHERE name = 'Lats'),       'Cable',      'Pull'),
        (NULL, 'Assisted Pull-Up',            (SELECT id FROM muscle_groups WHERE name = 'Lats'),       'Machine',    'Pull'),
        (NULL, 'Dumbbell Pullover',           (SELECT id FROM muscle_groups WHERE name = 'Lats'),       'Dumbbell',   'Pull'),
        (NULL, 'Front Raise',                 (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Dumbbell',   'Isolation'),
        (NULL, 'Cable Lateral Raise',         (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Cable',      'Isolation'),
        (NULL, 'Landmine Press',              (SELECT id FROM muscle_groups WHERE name = 'Shoulders'),  'Barbell',    'Push'),
        (NULL, 'Preacher Curl',               (SELECT id FROM muscle_groups WHERE name = 'Biceps'),     'EZ-Bar',     'Isolation'),
        (NULL, 'Concentration Curl',          (SELECT id FROM muscle_groups WHERE name = 'Biceps'),     'Dumbbell',   'Isolation'),
        (NULL, 'EZ-Bar Curl',                 (SELECT id FROM muscle_groups WHERE name = 'Biceps'),     'EZ-Bar',     'Isolation'),
        (NULL, 'Triceps Dip',                 (SELECT id FROM muscle_groups WHERE name = 'Triceps'),    'Bodyweight', 'Push'),
        (NULL, 'Rope Pushdown',               (SELECT id FROM muscle_groups WHERE name = 'Triceps'),    'Cable',      'Isolation'),
        (NULL, 'Dumbbell Kickback',           (SELECT id FROM muscle_groups WHERE name = 'Triceps'),    'Dumbbell',   'Isolation'),
        (NULL, 'Hack Squat',                  (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Machine',    'Legs'),
        (NULL, 'Goblet Squat',                (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Dumbbell',   'Legs'),
        (NULL, 'Step-Up',                     (SELECT id FROM muscle_groups WHERE name = 'Quadriceps'), 'Dumbbell',   'Legs'),
        (NULL, 'Seated Leg Curl',             (SELECT id FROM muscle_groups WHERE name = 'Hamstrings'), 'Machine',    'Isolation'),
        (NULL, 'Nordic Hamstring Curl',       (SELECT id FROM muscle_groups WHERE name = 'Hamstrings'), 'Bodyweight', 'Legs'),
        (NULL, 'Single-Leg Romanian Deadlift',(SELECT id FROM muscle_groups WHERE name = 'Hamstrings'), 'Dumbbell',   'Legs'),
        (NULL, 'Sumo Deadlift',               (SELECT id FROM muscle_groups WHERE name = 'Glutes'),     'Barbell',    'Legs'),
        (NULL, 'Reverse Lunge',               (SELECT id FROM muscle_groups WHERE name = 'Glutes'),     'Dumbbell',   'Legs'),
        (NULL, 'Frog Pump',                   (SELECT id FROM muscle_groups WHERE name = 'Glutes'),     'Bodyweight', 'Isolation'),
        (NULL, 'Leg Press Calf Raise',        (SELECT id FROM muscle_groups WHERE name = 'Calves'),     'Machine',    'Isolation'),
        (NULL, 'Donkey Calf Raise',           (SELECT id FROM muscle_groups WHERE name = 'Calves'),     'Bodyweight', 'Isolation'),
        (NULL, 'Ab Wheel Rollout',            (SELECT id FROM muscle_groups WHERE name = 'Core'),       'Ab Wheel',   'Core'),
        (NULL, 'Decline Sit-Up',              (SELECT id FROM muscle_groups WHERE name = 'Core'),       'Bodyweight', 'Core'),
        (NULL, 'Pallof Press',                (SELECT id FROM muscle_groups WHERE name = 'Core'),       'Cable',      'Core'),
        (NULL, 'Barbell Shrug',               (SELECT id FROM muscle_groups WHERE name = 'Traps'),      'Barbell',    'Pull'),
        (NULL, 'Rack Pull',                    (SELECT id FROM muscle_groups WHERE name = 'Traps'),      'Barbell',    'Pull'),
        (NULL, 'Reverse Curl',                (SELECT id FROM muscle_groups WHERE name = 'Forearms'),   'EZ-Bar',     'Isolation'),
        (NULL, 'Wrist Roller',                (SELECT id FROM muscle_groups WHERE name = 'Forearms'),   'Cable',      'Isolation'),
        (NULL, 'Cossack Squat',               (SELECT id FROM muscle_groups WHERE name = 'Adductors'),  'Bodyweight', 'Legs'),
        (NULL, 'Banded Lateral Walk',         (SELECT id FROM muscle_groups WHERE name = 'Abductors'),  'Resistance Band', 'Isolation'),
        (NULL, 'Neck Flexion',                (SELECT id FROM muscle_groups WHERE name = 'Neck'),       'Plate',      'Isolation'),
        (NULL, 'Neck Extension',              (SELECT id FROM muscle_groups WHERE name = 'Neck'),       'Plate',      'Isolation')
      ON CONFLICT (name) WHERE owner_user_id IS NULL DO NOTHING;
    `,
  },
];

async function migrate() {
  try {
    for (const migration of migrations) {
      console.log(`Running migration: ${migration.name}`);
      await migration.run();
      console.log(`  ✓ ${migration.name}`);
    }
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
