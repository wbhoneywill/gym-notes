import { getDbUser } from '@/app/lib/auth';
import { sql } from '@/app/lib/db';
import { orderSyncChanges, validateSyncBatch } from '@/app/lib/sync-change';

async function applySetPatch(user, change) {
  const { clientChangeId, entity, payload } = change;
  const rows = await sql`
    WITH owned AS (
      SELECT ws.id
      FROM workout_sets ws
      JOIN session_exercises se ON se.id = ws.session_exercise_id
      JOIN training_sessions s ON s.id = se.session_id
      WHERE ws.id = ${entity.setId}
        AND se.id = ${entity.sessionExerciseId}
        AND s.id = ${entity.sessionId}
        AND s.owner_user_id = ${user.id}
        AND s.status = 'in_progress'
    ), accepted AS (
      INSERT INTO sync_change_log
        (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'workout_set', ${entity.setId}
      WHERE EXISTS (SELECT 1 FROM owned)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING
      RETURNING client_change_id
    ), updated AS (
      UPDATE workout_sets ws
      SET
        weight = CASE WHEN ${payload.weight !== undefined}
          THEN ${payload.weight ?? null} ELSE weight END,
        reps = CASE WHEN ${payload.reps !== undefined}
          THEN ${payload.reps ?? null} ELSE reps END,
        completed = CASE WHEN ${payload.completed !== undefined}
          THEN ${payload.completed ?? false} ELSE completed END,
        planned_rest_seconds = CASE
          WHEN ${payload.completed === false} THEN NULL
          WHEN ${payload.planned_rest_seconds !== undefined}
            THEN ${payload.planned_rest_seconds ?? null}
          ELSE planned_rest_seconds END,
        rest_duration_seconds = CASE
          WHEN ${payload.completed === false} THEN NULL
          WHEN ${payload.rest_duration_seconds !== undefined}
            THEN ${payload.rest_duration_seconds ?? null}
          ELSE rest_duration_seconds END,
        rest_outcome = CASE
          WHEN ${payload.completed === false} THEN NULL
          WHEN ${payload.rest_outcome !== undefined}
            THEN ${payload.rest_outcome ?? null}
          ELSE rest_outcome END,
        updated_at = NOW()
      WHERE ws.id IN (SELECT id FROM owned)
        AND EXISTS (SELECT 1 FROM accepted)
      RETURNING ws.id, ws.session_exercise_id, ws.weight, ws.reps,
        ws.completed, ws.planned_rest_seconds, ws.rest_duration_seconds,
        ws.rest_outcome
    )
    SELECT
      EXISTS (SELECT 1 FROM accepted) AS applied,
      (SELECT row_to_json(u) FROM updated u) AS entity
  `;

  if (rows[0]?.applied) return { clientChangeId, status: 'applied', entity: rows[0].entity };

  const duplicate = await sql`
    SELECT client_change_id
    FROM sync_change_log
    WHERE owner_user_id = ${user.id} AND client_change_id = ${clientChangeId}
  `;
  return duplicate[0]
    ? { clientChangeId, status: 'duplicate' }
    : { clientChangeId, status: 'rejected', code: 'not_editable', error: 'The workout changed or is no longer editable.' };
}

async function applySetCreate(user, change) {
  const { clientChangeId, entity, payload } = change;
  const rows = await sql`
    WITH owned AS (
      SELECT se.id
      FROM session_exercises se
      JOIN training_sessions s ON s.id = se.session_id
      WHERE se.id = ${entity.sessionExerciseId}
        AND s.id = ${entity.sessionId}
        AND s.owner_user_id = ${user.id}
        AND s.status = 'in_progress'
        AND NOT EXISTS (SELECT 1 FROM workout_sets WHERE id = ${entity.setId})
    ), accepted AS (
      INSERT INTO sync_change_log (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'workout_set', ${entity.setId}
      WHERE EXISTS (SELECT 1 FROM owned)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING
      RETURNING client_change_id
    ), inserted AS (
      INSERT INTO workout_sets
        (id, session_exercise_id, set_order, weight, weight_unit, reps, completed, set_type)
      SELECT ${entity.setId}, ${entity.sessionExerciseId}, ${Number(payload.set_order)},
        ${payload.weight ?? null}, ${payload.weight_unit === 'lb' ? 'lb' : 'kg'},
        ${payload.reps ?? null}, ${payload.completed === true},
        ${payload.set_type === 'warmup' ? 'warmup' : 'working'}
      WHERE EXISTS (SELECT 1 FROM accepted)
      RETURNING id, session_exercise_id, set_order, weight, weight_unit, reps, completed, set_type
    )
    SELECT EXISTS (SELECT 1 FROM accepted) AS applied,
      (SELECT row_to_json(i) FROM inserted i) AS entity
  `;
  if (rows[0]?.applied) return { clientChangeId, status: 'applied', entity: rows[0].entity };
  return replayOrRejected(user, change);
}

async function applySessionPatch(user, change) {
  const { clientChangeId, entity, payload } = change;
  const rows = await sql`
    WITH owned AS (
      SELECT id FROM training_sessions
      WHERE id = ${entity.sessionId} AND owner_user_id = ${user.id} AND status = 'in_progress'
    ), accepted AS (
      INSERT INTO sync_change_log (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'training_session', ${entity.sessionId}
      WHERE EXISTS (SELECT 1 FROM owned)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING
      RETURNING client_change_id
    ), updated AS (
      UPDATE training_sessions
      SET status = ${payload.status}, finished_at = NOW(), updated_at = NOW()
      WHERE id IN (SELECT id FROM owned) AND EXISTS (SELECT 1 FROM accepted)
      RETURNING id, name, status, started_at, finished_at
    )
    SELECT EXISTS (SELECT 1 FROM accepted) AS applied,
      (SELECT row_to_json(u) FROM updated u) AS entity
  `;
  if (rows[0]?.applied) return { clientChangeId, status: 'applied', entity: rows[0].entity };
  return replayOrRejected(user, change);
}

async function applySessionCreate(user, change) {
  const { clientChangeId, entity, payload } = change;
  const rows = await sql`
    WITH available AS (
      SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM training_sessions WHERE id = ${entity.sessionId})
        AND (${payload.template_id}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM workout_templates WHERE id = ${payload.template_id}::uuid
            AND owner_user_id = ${user.id} AND is_archived = FALSE
        ))
    ), accepted AS (
      INSERT INTO sync_change_log (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'training_session', ${entity.sessionId}
      WHERE EXISTS (SELECT 1 FROM available)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING RETURNING client_change_id
    ), inserted AS (
      INSERT INTO training_sessions (id, owner_user_id, template_id, name, status, started_at)
      SELECT ${entity.sessionId}, ${user.id}, ${payload.template_id}, ${payload.name}, 'in_progress',
        COALESCE(${payload.started_at}::timestamptz, NOW())
      WHERE EXISTS (SELECT 1 FROM accepted)
      RETURNING id, name, status, started_at
    )
    SELECT EXISTS (SELECT 1 FROM accepted) AS applied,
      (SELECT row_to_json(i) FROM inserted i) AS entity
  `;
  if (rows[0]?.applied) return { clientChangeId, status: 'applied', entity: rows[0].entity };
  return replayOrRejected(user, change);
}

async function applySessionExerciseCreate(user, change) {
  const { clientChangeId, entity, payload } = change;
  const rows = await sql`
    WITH allowed AS (
      SELECT s.id FROM training_sessions s
      WHERE s.id = ${entity.sessionId} AND s.owner_user_id = ${user.id}
        AND s.status = 'in_progress'
        AND EXISTS (
          SELECT 1 FROM exercises e WHERE e.id = ${payload.exercise_id}
            AND e.is_archived = FALSE
            AND (e.owner_user_id IS NULL OR e.owner_user_id = ${user.id})
        )
        AND NOT EXISTS (SELECT 1 FROM session_exercises WHERE id = ${entity.sessionExerciseId})
    ), accepted AS (
      INSERT INTO sync_change_log (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'session_exercise', ${entity.sessionExerciseId}
      WHERE EXISTS (SELECT 1 FROM allowed)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING RETURNING client_change_id
    ), inserted AS (
      INSERT INTO session_exercises
        (id, session_id, exercise_id, position, target_sets, target_rep_min,
         target_rep_max, target_weight, rest_seconds)
      SELECT ${entity.sessionExerciseId}, ${entity.sessionId}, ${payload.exercise_id},
        ${Number(payload.position)}, ${payload.target_sets ?? null},
        ${payload.target_rep_min ?? null}, ${payload.target_rep_max ?? null},
        ${payload.target_weight ?? null}, ${payload.rest_seconds ?? null}
      WHERE EXISTS (SELECT 1 FROM accepted)
      RETURNING id, exercise_id, position, skipped
    )
    SELECT EXISTS (SELECT 1 FROM accepted) AS applied,
      (SELECT row_to_json(i) FROM inserted i) AS entity
  `;
  if (rows[0]?.applied) return { clientChangeId, status: 'applied', entity: rows[0].entity };
  return replayOrRejected(user, change);
}

async function applySessionExercisePatch(user, change) {
  const { clientChangeId, entity, payload } = change;
  const rows = await sql`
    WITH owned AS (
      SELECT se.id FROM session_exercises se
      JOIN training_sessions s ON s.id = se.session_id
      WHERE se.id = ${entity.sessionExerciseId} AND s.id = ${entity.sessionId}
        AND s.owner_user_id = ${user.id} AND s.status = 'in_progress'
    ), accepted AS (
      INSERT INTO sync_change_log (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'session_exercise', ${entity.sessionExerciseId}
      WHERE EXISTS (SELECT 1 FROM owned)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING RETURNING client_change_id
    ), updated AS (
      UPDATE session_exercises SET rest_seconds = ${payload.rest_seconds}
      WHERE id IN (SELECT id FROM owned) AND EXISTS (SELECT 1 FROM accepted)
      RETURNING id, rest_seconds
    )
    SELECT EXISTS (SELECT 1 FROM accepted) AS applied,
      (SELECT row_to_json(u) FROM updated u) AS entity
  `;
  if (rows[0]?.applied) return { clientChangeId, status: 'applied', entity: rows[0].entity };
  return replayOrRejected(user, change);
}

async function applyDelete(user, change, entityType) {
  const { clientChangeId, entity } = change;
  const isSet = entityType === 'workout_set';
  const rows = isSet ? await sql`
    WITH owned AS (
      SELECT ws.id FROM workout_sets ws
      JOIN session_exercises se ON se.id = ws.session_exercise_id
      JOIN training_sessions s ON s.id = se.session_id
      WHERE ws.id = ${entity.setId} AND se.id = ${entity.sessionExerciseId}
        AND s.id = ${entity.sessionId} AND s.owner_user_id = ${user.id} AND s.status = 'in_progress'
    ), accepted AS (
      INSERT INTO sync_change_log (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'workout_set', ${entity.setId} WHERE EXISTS (SELECT 1 FROM owned)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING RETURNING client_change_id
    ), deleted AS (
      DELETE FROM workout_sets WHERE id IN (SELECT id FROM owned) AND EXISTS (SELECT 1 FROM accepted) RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM accepted) AS applied, (SELECT row_to_json(d) FROM deleted d) AS entity
  ` : await sql`
    WITH owned AS (
      SELECT se.id FROM session_exercises se JOIN training_sessions s ON s.id = se.session_id
      WHERE se.id = ${entity.sessionExerciseId} AND s.id = ${entity.sessionId}
        AND s.owner_user_id = ${user.id} AND s.status = 'in_progress'
    ), accepted AS (
      INSERT INTO sync_change_log (owner_user_id, client_change_id, entity_type, entity_id)
      SELECT ${user.id}, ${clientChangeId}, 'session_exercise', ${entity.sessionExerciseId} WHERE EXISTS (SELECT 1 FROM owned)
      ON CONFLICT (owner_user_id, client_change_id) DO NOTHING RETURNING client_change_id
    ), deleted AS (
      DELETE FROM session_exercises WHERE id IN (SELECT id FROM owned) AND EXISTS (SELECT 1 FROM accepted) RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM accepted) AS applied, (SELECT row_to_json(d) FROM deleted d) AS entity
  `;
  if (rows[0]?.applied) return { clientChangeId, status: 'applied', entity: rows[0].entity };
  return replayOrRejected(user, change);
}

async function replayOrRejected(user, change) {
  const duplicate = await sql`
    SELECT client_change_id FROM sync_change_log
    WHERE owner_user_id = ${user.id} AND client_change_id = ${change.clientChangeId}
  `;
  return duplicate[0]
    ? { clientChangeId: change.clientChangeId, status: 'duplicate' }
    : {
        clientChangeId: change.clientChangeId,
        status: 'rejected',
        code: 'not_editable',
        error: 'The workout changed or is no longer editable.',
      };
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

  const validated = validateSyncBatch(body);
  if (validated.error) return Response.json({ error: validated.error }, { status: 400 });

  try {
    const results = [];
    for (const change of orderSyncChanges(validated.changes)) {
      if (change.operation === 'session.create') results.push(await applySessionCreate(user, change));
      else if (change.operation === 'session_exercise.create') results.push(await applySessionExerciseCreate(user, change));
      else if (change.operation === 'session_exercise.patch') results.push(await applySessionExercisePatch(user, change));
      else if (change.operation === 'session_exercise.delete') results.push(await applyDelete(user, change, 'session_exercise'));
      else if (change.operation === 'set.create') results.push(await applySetCreate(user, change));
      else if (change.operation === 'set.delete') results.push(await applyDelete(user, change, 'workout_set'));
      else if (change.operation === 'session.patch') results.push(await applySessionPatch(user, change));
      else results.push(await applySetPatch(user, change));
    }
    return Response.json({ results });
  } catch (error) {
    console.error('POST /api/sync failed:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
