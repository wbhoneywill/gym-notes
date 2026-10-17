import { randomUUID } from 'node:crypto';
import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';
import { STARTER_PLANS, starterPlanRows, validateOnboarding } from '@/app/lib/onboarding';

export async function GET() {
  const user = await getDbUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return Response.json({
      onboarding: {
        completed: user.onboarding_completed ?? false,
        preferred_unit: user.preferred_unit ?? 'kg',
        training_goal: user.training_goal,
        experience_level: user.experience_level,
        training_days_per_week: user.training_days_per_week,
      },
    });
  } catch (err) {
    console.error('GET /api/onboarding failed:', err);
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

  if (body?.skip === true) {
    try {
      await sql`
        UPDATE users SET onboarding_completed = TRUE WHERE id = ${user.id}
      `;
      return Response.json({ onboarding: { completed: true, skipped: true }, template: null });
    } catch (err) {
      console.error('POST /api/onboarding skip failed:', err);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  const validationError = validateOnboarding(body ?? {});
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const editing = body.mode === 'edit';
  if (user.onboarding_completed && !editing) {
    return Response.json({ onboarding: { completed: true }, template: null });
  }

  const days = Number(body.training_days_per_week);
  const starterPlanKey = editing ? 'none' : (body.starter_plan ?? 'none');
  const starterPlan = STARTER_PLANS[starterPlanKey];

  try {
    let template = null;
    if (starterPlan.name) {
      const templateId = randomUUID();
      const rows = starterPlanRows(starterPlanKey, body.training_goal, body.experience_level);
      const insertTemplate = sql`
        INSERT INTO workout_templates (id, owner_user_id, name)
        VALUES (${templateId}, ${user.id}, ${starterPlan.name})
      `;
      const insertExercises = sql`
        INSERT INTO template_exercises
          (template_id, exercise_id, position, target_sets, target_rep_min,
           target_rep_max, rest_seconds)
        SELECT ${templateId}, e.id, planned.position, planned.target_sets,
               planned.target_rep_min, planned.target_rep_max, planned.rest_seconds
        FROM json_to_recordset(${JSON.stringify(rows)}::json) AS planned(
          name TEXT, position INTEGER, target_sets INTEGER,
          target_rep_min INTEGER, target_rep_max INTEGER, rest_seconds INTEGER
        )
        JOIN exercises e ON e.name = planned.name
          AND e.owner_user_id IS NULL AND e.is_archived = FALSE
      `;
      const updateUser = sql`
        UPDATE users SET
          preferred_unit = ${body.preferred_unit},
          training_goal = ${body.training_goal},
          experience_level = ${body.experience_level},
          training_days_per_week = ${days},
          onboarding_completed = TRUE
        WHERE id = ${user.id}
      `;
      await sql.transaction([insertTemplate, insertExercises, updateUser]);
      template = { id: templateId, name: starterPlan.name };
    } else {
      await sql`
        UPDATE users SET
          preferred_unit = ${body.preferred_unit},
          training_goal = ${body.training_goal},
          experience_level = ${body.experience_level},
          training_days_per_week = ${days},
          onboarding_completed = TRUE
        WHERE id = ${user.id}
      `;
    }

    return Response.json({
      onboarding: {
        completed: true,
        preferred_unit: body.preferred_unit,
        training_goal: body.training_goal,
        experience_level: body.experience_level,
        training_days_per_week: days,
      },
      template,
    });
  } catch (err) {
    console.error('POST /api/onboarding failed:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
