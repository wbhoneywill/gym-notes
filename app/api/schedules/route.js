import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';
import { validateSchedule } from '@/app/lib/schedules';

export async function GET() {
  const user = await getDbUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const schedules = await sql`
      SELECT ws.id, ws.template_id, wt.name AS template_name, ws.weekday,
             TO_CHAR(ws.local_time, 'HH24:MI') AS local_time, ws.is_active
      FROM workout_schedules ws
      JOIN workout_templates wt ON wt.id = ws.template_id
      WHERE ws.owner_user_id = ${user.id}
        AND wt.owner_user_id = ${user.id}
        AND wt.is_archived = FALSE
        AND ws.is_active = TRUE
      ORDER BY ws.weekday ASC, ws.local_time ASC NULLS LAST, wt.name ASC
    `;
    return Response.json({ schedules });
  } catch (err) {
    console.error('GET /api/schedules failed:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getDbUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const validationError = validateSchedule(body);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const templateId = body.template_id.trim();
  const weekday = Number(body.weekday);
  const localTime = body.local_time || null;
  try {
    const rows = await sql`
      INSERT INTO workout_schedules (owner_user_id, template_id, weekday, local_time)
      SELECT ${user.id}, wt.id, ${weekday}, ${localTime}::time
      FROM workout_templates wt
      WHERE wt.id = ${templateId}
        AND wt.owner_user_id = ${user.id}
        AND wt.is_archived = FALSE
      ON CONFLICT (owner_user_id, template_id, weekday)
      DO UPDATE SET local_time = EXCLUDED.local_time, is_active = TRUE, updated_at = NOW()
      RETURNING id, template_id, weekday, TO_CHAR(local_time, 'HH24:MI') AS local_time, is_active
    `;
    if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ schedule: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('POST /api/schedules failed:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
