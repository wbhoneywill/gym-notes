import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';
import { derivePersonalRecords } from '@/app/lib/personal-records';

/**
 * GET /api/sessions/:id/records — personal records earned in one completed
 * session, compared with the caller's earlier completed working sets.
 */
export async function GET(_request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const sessions = await sql`
      SELECT id, status, started_at
      FROM training_sessions
      WHERE id = ${id} AND owner_user_id = ${user.id}
    `;
    const session = sessions[0];
    if (!session) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (session.status !== 'completed') {
      return Response.json({
        eligible: false,
        records: [],
        workoutRecord: null,
        unit: 'kg',
      });
    }

    const rows = await sql`
      SELECT s.id AS session_id,
             s.name AS session_name,
             s.started_at,
             se.exercise_id,
             e.name AS exercise_name,
             ROUND((CASE
               WHEN ws.weight_unit = 'lb' THEN ws.weight / 2.2046226218
               ELSE ws.weight
             END)::numeric, 4)::float AS weight_kg,
             ws.reps
      FROM workout_sets ws
      JOIN session_exercises se ON se.id = ws.session_exercise_id
      JOIN training_sessions s ON s.id = se.session_id
      JOIN exercises e ON e.id = se.exercise_id
      WHERE s.owner_user_id = ${user.id}
        AND s.status = 'completed'
        AND (s.started_at < ${session.started_at} OR s.id = ${id})
        AND ws.completed = TRUE
        AND ws.set_type <> 'warmup'
        AND ws.weight IS NOT NULL
        AND ws.reps IS NOT NULL
      ORDER BY s.started_at ASC, ws.set_order ASC
    `;

    return Response.json({
      eligible: true,
      ...derivePersonalRecords(rows, id),
      unit: 'kg',
    });
  } catch (err) {
    console.error('GET /api/sessions/:id/records failed:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
