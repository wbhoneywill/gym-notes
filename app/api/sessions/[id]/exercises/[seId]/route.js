import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

/**
 * PATCH /api/sessions/:id/exercises/:seId — update an in-progress session
 * exercise. Ownership enforced via a subquery over owned sessions.
 */
export async function PATCH(request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, seId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.skipped !== undefined && typeof body.skipped !== 'boolean') {
    return Response.json({ error: 'skipped must be a boolean' }, { status: 400 });
  }
  if (body.position !== undefined) {
    const p = Number(body.position);
    if (!Number.isInteger(p) || p < 0) {
      return Response.json(
        { error: 'position must be a non-negative integer' },
        { status: 400 }
      );
    }
  }
  if (body.rest_seconds !== undefined && body.rest_seconds !== null) {
    const seconds = Number(body.rest_seconds);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
      return Response.json(
        { error: 'rest_seconds must be an integer between 0 and 3600' },
        { status: 400 }
      );
    }
  }

  try {
    const rows = await sql`
      UPDATE session_exercises se
      SET
        skipped = CASE WHEN ${body.skipped !== undefined}
          THEN ${body.skipped ?? false} ELSE skipped END,
        position = CASE WHEN ${body.position !== undefined}
          THEN ${body.position ?? 0} ELSE position END,
        rest_seconds = CASE WHEN ${body.rest_seconds !== undefined}
          THEN ${body.rest_seconds === null ? null : Number(body.rest_seconds)}
          ELSE rest_seconds END,
        updated_at = NOW()
      WHERE se.id = ${seId}
        AND se.session_id = ${id}
        AND se.session_id IN (
          SELECT id FROM training_sessions
          WHERE owner_user_id = ${user.id} AND status = 'in_progress'
        )
      RETURNING se.id, se.exercise_id, se.position, se.skipped, se.rest_seconds
    `;
    if (!rows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ sessionExercise: rows[0] });
  } catch (err) {
    console.error('PATCH session exercise failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/:id/exercises/:seId — remove an exercise (and its
 * sets, via cascade) from the user's session.
 */
export async function DELETE(_request, { params }) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, seId } = await params;

  try {
    const rows = await sql`
      DELETE FROM session_exercises se
      WHERE se.id = ${seId}
        AND se.session_id = ${id}
        AND se.session_id IN (
          SELECT id FROM training_sessions
          WHERE owner_user_id = ${user.id} AND status = 'in_progress'
        )
      RETURNING se.id
    `;
    if (!rows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE session exercise failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
