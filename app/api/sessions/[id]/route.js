import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

/**
 * GET /api/sessions/:id — full session: its exercises (ordered) each with
 * their sets (ordered). 404 if not owned by the caller.
 */
export async function GET(_request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const sessionRows = await sql`
      SELECT id, name, template_id, status, started_at, finished_at
      FROM training_sessions
      WHERE id = ${id} AND owner_user_id = ${user.id}
    `;
    if (!sessionRows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const exercises = await sql`
      SELECT se.id, se.exercise_id, se.position, se.skipped,
             se.target_sets, se.target_rep_min, se.target_rep_max,
             se.target_weight, se.rest_seconds,
             e.name AS exercise_name, mg.name AS primary_muscle_group
      FROM session_exercises se
      JOIN exercises e ON e.id = se.exercise_id
      LEFT JOIN muscle_groups mg ON mg.id = e.primary_muscle_group_id
      WHERE se.session_id = ${id}
      ORDER BY se.position ASC, se.created_at ASC
    `;

    const sets = await sql`
      SELECT ws.id, ws.session_exercise_id, ws.set_order, ws.weight,
             ws.weight_unit, ws.reps, ws.completed, ws.set_type,
             ws.planned_rest_seconds, ws.rest_duration_seconds,
             ws.rest_outcome
      FROM workout_sets ws
      JOIN session_exercises se ON se.id = ws.session_exercise_id
      WHERE se.session_id = ${id}
      ORDER BY ws.set_order ASC, ws.created_at ASC
    `;

    // Nest sets under their exercise.
    const byExercise = new Map(exercises.map((e) => [e.id, { ...e, sets: [] }]));
    for (const s of sets) {
      byExercise.get(s.session_exercise_id)?.sets.push(s);
    }

    return Response.json({
      session: {
        ...sessionRows[0],
        exercises: Array.from(byExercise.values()),
      },
    });
  } catch (err) {
    console.error('GET /api/sessions/:id failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sessions/:id — finish, abandon, resume, or rename a session.
 * Setting status to completed/abandoned stamps finished_at; resuming
 * (in_progress) clears it.
 */
export async function PATCH(request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let status;
  if (body.status !== undefined) {
    const allowed = ['in_progress', 'completed', 'abandoned'];
    if (!allowed.includes(body.status)) {
      return Response.json({ error: 'invalid status' }, { status: 400 });
    }
    status = body.status;
  }

  let name;
  if (body.name !== undefined) {
    name = typeof body.name === 'string' ? body.name.trim() || null : null;
  }

  try {
    const rows = await sql`
      UPDATE training_sessions
      SET
        status = COALESCE(${status ?? null}, status),
        finished_at = CASE
          WHEN ${status ?? null} IN ('completed', 'abandoned') THEN NOW()
          WHEN ${status ?? null} = 'in_progress' THEN NULL
          ELSE finished_at
        END,
        name = CASE WHEN ${body.name !== undefined} THEN ${name ?? null} ELSE name END,
        updated_at = NOW()
      WHERE id = ${id} AND owner_user_id = ${user.id}
      RETURNING id, name, template_id, status, started_at, finished_at
    `;
    if (!rows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ session: rows[0] });
  } catch (err) {
    console.error('PATCH /api/sessions/:id failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/:id — delete a session; cascades to its exercises and
 * sets. (Hard delete: an abandoned/mistaken session can be fully removed.)
 */
export async function DELETE(_request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const rows = await sql`
      DELETE FROM training_sessions
      WHERE id = ${id} AND owner_user_id = ${user.id}
      RETURNING id
    `;
    if (!rows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/sessions/:id failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
