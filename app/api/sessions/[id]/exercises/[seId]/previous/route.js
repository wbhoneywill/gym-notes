import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

/**
 * GET /api/sessions/:id/exercises/:seId/previous — the most recent prior
 * performance of this exercise, for comparison during training.
 *
 * Finds the latest OTHER session owned by the user that contains the same
 * exercise, and returns that session's date and its sets for the exercise.
 * Returns { previous: null } when there is no prior history.
 */
export async function GET(_request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, seId } = await params;

  try {
    // Resolve the exercise behind this session-exercise, confirming the
    // current session is owned by the user.
    const current = await sql`
      SELECT se.exercise_id
      FROM session_exercises se
      JOIN training_sessions s ON s.id = se.session_id
      WHERE se.id = ${seId} AND se.session_id = ${id}
        AND s.owner_user_id = ${user.id}
    `;
    if (!current[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const exerciseId = current[0].exercise_id;

    // Most recent prior session (any status) containing this exercise,
    // excluding the current session.
    const prior = await sql`
      SELECT s.id AS session_id, s.started_at, se.id AS session_exercise_id
      FROM session_exercises se
      JOIN training_sessions s ON s.id = se.session_id
      WHERE s.owner_user_id = ${user.id}
        AND se.exercise_id = ${exerciseId}
        AND s.id <> ${id}
      ORDER BY s.started_at DESC
      LIMIT 1
    `;

    if (!prior[0]) {
      return Response.json({ previous: null });
    }

    const sets = await sql`
      SELECT set_order, weight, weight_unit, reps, completed, set_type,
             planned_rest_seconds, rest_duration_seconds, rest_outcome
      FROM workout_sets
      WHERE session_exercise_id = ${prior[0].session_exercise_id}
      ORDER BY set_order ASC, created_at ASC
    `;

    return Response.json({
      previous: {
        session_id: prior[0].session_id,
        date: prior[0].started_at,
        sets,
      },
    });
  } catch (err) {
    console.error('GET previous performance failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
