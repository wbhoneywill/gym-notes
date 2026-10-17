import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

/**
 * PATCH /api/sessions/:id/exercises/:seId/sets/:setId — edit a set
 * (weight, reps, completion, type, order, recorded rest). Ownership is enforced by requiring
 * the set's session_exercise to live in a session owned by the user.
 */
export async function PATCH(request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, seId, setId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.weight !== undefined && body.weight !== null) {
    const w = Number(body.weight);
    if (!Number.isFinite(w) || w < 0) {
      return Response.json(
        { error: 'weight must be a non-negative number' },
        { status: 400 }
      );
    }
  }
  if (body.reps !== undefined && body.reps !== null) {
    const r = Number(body.reps);
    if (!Number.isInteger(r) || r < 0) {
      return Response.json(
        { error: 'reps must be a non-negative integer' },
        { status: 400 }
      );
    }
  }
  if (body.completed !== undefined && typeof body.completed !== 'boolean') {
    return Response.json({ error: 'completed must be a boolean' }, { status: 400 });
  }
  if (
    body.set_type !== undefined &&
    !['working', 'warmup'].includes(body.set_type)
  ) {
    return Response.json({ error: 'invalid set_type' }, { status: 400 });
  }
  if (body.set_order !== undefined) {
    const n = Number(body.set_order);
    if (!Number.isInteger(n) || n < 0) {
      return Response.json(
        { error: 'set_order must be a non-negative integer' },
        { status: 400 }
      );
    }
  }
  for (const field of ['planned_rest_seconds', 'rest_duration_seconds']) {
    if (body[field] !== undefined && body[field] !== null) {
      const seconds = Number(body[field]);
      const maximum = field === 'planned_rest_seconds' ? 3600 : 86400;
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > maximum) {
        return Response.json(
          { error: `${field} must be an integer between 0 and ${maximum}` },
          { status: 400 }
        );
      }
    }
  }
  if (
    body.rest_outcome !== undefined &&
    body.rest_outcome !== null &&
    !['completed', 'started_early', 'skipped'].includes(body.rest_outcome)
  ) {
    return Response.json({ error: 'invalid rest_outcome' }, { status: 400 });
  }

  try {
    const rows = await sql`
      UPDATE workout_sets ws
      SET
        weight = CASE WHEN ${body.weight !== undefined}
          THEN ${body.weight ?? null} ELSE weight END,
        reps = CASE WHEN ${body.reps !== undefined}
          THEN ${body.reps ?? null} ELSE reps END,
        weight_unit = CASE WHEN ${body.weight_unit !== undefined}
          THEN ${body.weight_unit === 'lb' ? 'lb' : 'kg'} ELSE weight_unit END,
        completed = CASE WHEN ${body.completed !== undefined}
          THEN ${body.completed ?? false} ELSE completed END,
        set_type = CASE WHEN ${body.set_type !== undefined}
          THEN ${body.set_type ?? 'working'} ELSE set_type END,
        set_order = CASE WHEN ${body.set_order !== undefined}
          THEN ${body.set_order ?? 0} ELSE set_order END,
        planned_rest_seconds = CASE
          WHEN ${body.completed === false} THEN NULL
          WHEN ${body.planned_rest_seconds !== undefined}
            THEN ${body.planned_rest_seconds ?? null}
          ELSE planned_rest_seconds END,
        rest_duration_seconds = CASE
          WHEN ${body.completed === false} THEN NULL
          WHEN ${body.rest_duration_seconds !== undefined}
            THEN ${body.rest_duration_seconds ?? null}
          ELSE rest_duration_seconds END,
        rest_outcome = CASE
          WHEN ${body.completed === false} THEN NULL
          WHEN ${body.rest_outcome !== undefined}
            THEN ${body.rest_outcome ?? null}
          ELSE rest_outcome END,
        updated_at = NOW()
      WHERE ws.id = ${setId}
        AND ws.session_exercise_id = ${seId}
        AND ws.session_exercise_id IN (
          SELECT se.id FROM session_exercises se
          JOIN training_sessions s ON s.id = se.session_id
          WHERE se.session_id = ${id}
            AND s.owner_user_id = ${user.id}
            AND s.status = 'in_progress'
        )
      RETURNING ws.id, ws.session_exercise_id, ws.set_order, ws.weight,
        ws.weight_unit, ws.reps, ws.completed, ws.set_type,
        ws.planned_rest_seconds, ws.rest_duration_seconds, ws.rest_outcome
    `;
    if (!rows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ set: rows[0] });
  } catch (err) {
    console.error('PATCH set failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/:id/exercises/:seId/sets/:setId — delete a set from
 * the user's session.
 */
export async function DELETE(_request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, seId, setId } = await params;

  try {
    const rows = await sql`
      DELETE FROM workout_sets ws
      WHERE ws.id = ${setId}
        AND ws.session_exercise_id = ${seId}
        AND ws.session_exercise_id IN (
          SELECT se.id FROM session_exercises se
          JOIN training_sessions s ON s.id = se.session_id
          WHERE se.session_id = ${id}
            AND s.owner_user_id = ${user.id}
            AND s.status = 'in_progress'
        )
      RETURNING ws.id
    `;
    if (!rows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE set failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
