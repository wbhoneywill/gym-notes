import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

export async function DELETE(_request, { params }) {
  const user = await getDbUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const rows = await sql`
      DELETE FROM workout_schedules
      WHERE id = ${id} AND owner_user_id = ${user.id}
      RETURNING id
    `;
    if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/schedules/:id failed:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
