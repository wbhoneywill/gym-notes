import { randomUUID } from 'node:crypto';
import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

/**
 * GET /api/sessions — list the user's sessions, newest first.
 * Optional ?status=in_progress|completed|abandoned filter.
 */
export async function GET(request) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const allowed = ['in_progress', 'completed', 'abandoned'];
  if (status && !allowed.includes(status)) {
    return Response.json({ error: 'invalid status filter' }, { status: 400 });
  }

  try {
    const sessions = status
      ? await sql`
          SELECT s.id, s.name, s.template_id, s.status, s.started_at,
                 s.finished_at, COUNT(se.id)::int AS exercise_count
          FROM training_sessions s
          LEFT JOIN session_exercises se ON se.session_id = s.id
          WHERE s.owner_user_id = ${user.id} AND s.status = ${status}
          GROUP BY s.id
          ORDER BY s.started_at DESC
        `
      : await sql`
          SELECT s.id, s.name, s.template_id, s.status, s.started_at,
                 s.finished_at, COUNT(se.id)::int AS exercise_count
          FROM training_sessions s
          LEFT JOIN session_exercises se ON se.session_id = s.id
          WHERE s.owner_user_id = ${user.id}
          GROUP BY s.id
          ORDER BY s.started_at DESC
        `;
    return Response.json({ sessions });
  } catch (err) {
    console.error('GET /api/sessions failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sessions — start a workout.
 *
 * Body: { template_id?, name? }.
 *   - With template_id: the template (must be owned) is snapshotted into
 *     session_exercises at start, so later template edits never alter this
 *     session (history isolation).
 *   - Without: a blank session is created.
 *
 * The session id is generated here (client-generatable UUID) so the session
 * insert and the exercise snapshot run atomically in one transaction.
 */
export async function POST(request) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    // Empty body is allowed (blank session).
    body = {};
  }

  const templateId =
    typeof body.template_id === 'string' ? body.template_id : null;
  const explicitName = typeof body.name === 'string' ? body.name.trim() : '';

  try {
    let templateName = null;
    if (templateId) {
      const tpl = await sql`
        SELECT name FROM workout_templates
        WHERE id = ${templateId} AND owner_user_id = ${user.id}
      `;
      if (!tpl[0]) {
        return Response.json(
          { error: 'template_id is not a valid template' },
          { status: 400 }
        );
      }
      templateName = tpl[0].name;
    }

    const sessionId = typeof body.id === 'string' && body.id ? body.id : randomUUID();
    const name = explicitName || templateName || null;

    const insertSession = sql`
      INSERT INTO training_sessions
        (id, owner_user_id, template_id, name, status)
      VALUES (${sessionId}, ${user.id}, ${templateId}, ${name}, 'in_progress')
    `;

    if (templateId) {
      // Snapshot the template's exercises into the session atomically.
      const snapshot = sql`
        INSERT INTO session_exercises
          (session_id, exercise_id, position, target_sets, target_rep_min,
           target_rep_max, target_weight, rest_seconds)
        SELECT ${sessionId}, te.exercise_id, te.position, te.target_sets,
               te.target_rep_min, te.target_rep_max, te.target_weight,
               te.rest_seconds
        FROM template_exercises te
        JOIN workout_templates t ON t.id = te.template_id
        WHERE te.template_id = ${templateId} AND t.owner_user_id = ${user.id}
      `;
      await sql.transaction([insertSession, snapshot]);
    } else {
      await insertSession;
    }

    const rows = await sql`
      SELECT id, name, template_id, status, started_at, finished_at
      FROM training_sessions WHERE id = ${sessionId}
    `;
    return Response.json({ session: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('POST /api/sessions failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
