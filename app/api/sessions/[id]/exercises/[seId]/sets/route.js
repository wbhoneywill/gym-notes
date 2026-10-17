import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

/**
 * POST /api/sessions/:id/exercises/:seId/sets — add a set to a session
 * exercise. Validates ownership through session_exercise -> session -> user.
 */
export async function POST(request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, seId } = await params;

  let body = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }

  // Validate optional fields.
  let weight = null;
  if (body.weight !== undefined && body.weight !== null) {
    const w = Number(body.weight);
    if (!Number.isFinite(w) || w < 0) {
      return Response.json(
        { error: 'weight must be a non-negative number' },
        { status: 400 }
      );
    }
    weight = w;
  }
  let reps = null;
  if (body.reps !== undefined && body.reps !== null) {
    const r = Number(body.reps);
    if (!Number.isInteger(r) || r < 0) {
      return Response.json(
        { error: 'reps must be a non-negative integer' },
        { status: 400 }
      );
    }
    reps = r;
  }
  const weightUnit = body.weight_unit === 'lb' ? 'lb' : 'kg';
  const setType = body.set_type === 'warmup' ? 'warmup' : 'working';
  const completed = body.completed === true;
  const setId = typeof body.id === 'string' && body.id ? body.id : null;
  const requestedOrder = body.set_order === undefined ? null : Number(body.set_order);
  if (requestedOrder !== null && (!Number.isInteger(requestedOrder) || requestedOrder < 0)) {
    return Response.json({ error: 'set_order must be a non-negative integer' }, { status: 400 });
  }

  try {
    // Confirm the session-exercise belongs to the user's session.
    const owned = await sql`
      SELECT se.id FROM session_exercises se
      JOIN training_sessions s ON s.id = se.session_id
      WHERE se.id = ${seId} AND se.session_id = ${id}
        AND s.owner_user_id = ${user.id} AND s.status = 'in_progress'
    `;
    if (!owned[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const next = await sql`
      SELECT COALESCE(MAX(set_order), -1) + 1 AS next
      FROM workout_sets WHERE session_exercise_id = ${seId}
    `;

    const rows = setId ? await sql`
      INSERT INTO workout_sets
        (id, session_exercise_id, set_order, weight, weight_unit, reps,
         completed, set_type)
      VALUES
        (${setId}, ${seId}, ${requestedOrder ?? next[0].next}, ${weight}, ${weightUnit}, ${reps},
         ${completed}, ${setType})
      RETURNING id, session_exercise_id, set_order, weight, weight_unit,
        reps, completed, set_type
    ` : await sql`
      INSERT INTO workout_sets
        (session_exercise_id, set_order, weight, weight_unit, reps,
         completed, set_type)
      VALUES
        (${seId}, ${next[0].next}, ${weight}, ${weightUnit}, ${reps},
         ${completed}, ${setType})
      RETURNING id, session_exercise_id, set_order, weight, weight_unit,
        reps, completed, set_type
    `;
    return Response.json({ set: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('POST set failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
