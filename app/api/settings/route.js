import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';

const UNITS = ['kg', 'lb'];

/**
 * GET /api/settings — the current user's preferences.
 */
export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return Response.json({
      settings: {
        preferred_unit: user.preferred_unit ?? 'kg',
        training_goal: user.training_goal ?? null,
        experience_level: user.experience_level ?? null,
        training_days_per_week: user.training_days_per_week ?? null,
        onboarding_completed: user.onboarding_completed ?? false,
      },
    });
  } catch (err) {
    console.error('GET /api/settings failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings — update preferences. Currently just preferred_unit.
 */
export async function PATCH(request) {
  const user = await getDbUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.preferred_unit === undefined) {
    return Response.json(
      { error: 'preferred_unit is required' },
      { status: 400 }
    );
  }
  if (!UNITS.includes(body.preferred_unit)) {
    return Response.json(
      { error: "preferred_unit must be 'kg' or 'lb'" },
      { status: 400 }
    );
  }

  try {
    const rows = await sql`
      UPDATE users
      SET preferred_unit = ${body.preferred_unit}
      WHERE id = ${user.id}
      RETURNING preferred_unit
    `;
    return Response.json({ settings: { preferred_unit: rows[0].preferred_unit } });
  } catch (err) {
    console.error('PATCH /api/settings failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
