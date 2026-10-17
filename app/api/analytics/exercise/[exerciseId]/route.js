import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

/**
 * GET /api/analytics/exercise/:exerciseId
 *
 * Per-exercise progression over the caller's completed/abandoned sessions:
 * for each session that trained this exercise, the working volume (kg), set
 * count, and top working set (heaviest completed non-warm-up set, then reps).
 * Derived at query time.
 *
 * The exercise must be visible to the caller (shared or owned); otherwise 404.
 */
export async function GET(_request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { exerciseId } = await params;

  try {
    // Confirm the exercise is visible to the user (no leak of others' private).
    const ex = await sql`
      SELECT e.id, e.name, mg.name AS primary_muscle_group, e.equipment
      FROM exercises e
      LEFT JOIN muscle_groups mg ON mg.id = e.primary_muscle_group_id
      WHERE e.id = ${exerciseId}
        AND (e.owner_user_id IS NULL OR e.owner_user_id = ${user.id})
    `;
    if (!ex[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const points = await sql`
      WITH working AS (
        SELECT
          s.id AS session_id,
          s.name AS session_name,
          s.started_at,
          ws.set_order,
          CASE WHEN ws.weight_unit = 'lb'
            THEN ws.weight / 2.2046226218 ELSE ws.weight END AS weight_kg,
          ws.reps
        FROM workout_sets ws
        JOIN session_exercises se ON se.id = ws.session_exercise_id
        JOIN training_sessions s ON s.id = se.session_id
        WHERE s.owner_user_id = ${user.id}
          AND se.exercise_id = ${exerciseId}
          AND s.status IN ('completed', 'abandoned')
          AND ws.completed = TRUE
          AND ws.set_type <> 'warmup'
          AND ws.weight IS NOT NULL
          AND ws.reps IS NOT NULL
      ),
      session_totals AS (
        SELECT
          session_id,
          session_name,
          started_at,
          COUNT(*)::int AS set_count,
          SUM(weight_kg * reps) AS volume_kg
        FROM working
        GROUP BY session_id, session_name, started_at
      ),
      top_sets AS (
        SELECT DISTINCT ON (session_id)
          session_id,
          weight_kg AS top_weight_kg,
          reps AS top_reps
        FROM working
        ORDER BY session_id, weight_kg DESC, reps DESC, set_order ASC
      )
      SELECT
        totals.session_id,
        totals.session_name,
        totals.started_at,
        totals.set_count,
        ROUND(totals.volume_kg)::int AS volume_kg,
        ROUND(top_sets.top_weight_kg, 2)::float AS top_weight_kg,
        top_sets.top_reps
      FROM session_totals totals
      JOIN top_sets ON top_sets.session_id = totals.session_id
      ORDER BY totals.started_at ASC
    `;

    return Response.json({
      exercise: ex[0],
      unit: 'kg',
      points,
    });
  } catch (err) {
    console.error('GET /api/analytics/exercise/:exerciseId failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
