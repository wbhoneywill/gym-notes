export const SYNC_BATCH_LIMIT = 50;

export function applyPendingSetChanges(session, changes = []) {
  const patches = new Map();
  const created = new Map();
  const deletedSetIds = new Set();
  const createdExercises = new Map();
  const deletedExerciseIds = new Set();
  let sessionPatch = {};
  for (const change of changes) {
    if (change.entity?.sessionId !== session.id) continue;
    if (change.operation === 'set.patch') {
      patches.set(change.entity.setId, { ...(patches.get(change.entity.setId) ?? {}), ...change.payload });
    } else if (change.operation === 'set.create') {
      created.set(change.entity.setId, {
        id: change.entity.setId,
        session_exercise_id: change.entity.sessionExerciseId,
        weight: null,
        reps: null,
        completed: false,
        weight_unit: 'kg',
        set_type: 'working',
        ...change.payload,
      });
    } else if (change.operation === 'set.delete') {
      deletedSetIds.add(change.entity.setId);
    } else if (change.operation === 'session_exercise.create') {
      createdExercises.set(change.entity.sessionExerciseId, {
        id: change.entity.sessionExerciseId,
        exercise_id: change.payload.exercise_id,
        exercise_name: change.payload.exercise_name,
        primary_muscle_group: change.payload.primary_muscle_group,
        position: change.payload.position,
        skipped: false,
        rest_seconds: null,
        sets: [],
      });
    } else if (change.operation === 'session_exercise.patch') {
      const createdExercise = createdExercises.get(change.entity.sessionExerciseId);
      if (createdExercise) createdExercises.set(change.entity.sessionExerciseId, { ...createdExercise, ...change.payload });
    } else if (change.operation === 'session_exercise.delete') {
      deletedExerciseIds.add(change.entity.sessionExerciseId);
    } else if (change.operation === 'session.patch') {
      sessionPatch = { ...sessionPatch, ...change.payload };
    }
  }
  return {
    ...session,
    ...sessionPatch,
    exercises: [
      ...(session.exercises ?? []).filter((exercise) => !deletedExerciseIds.has(exercise.id)),
      ...Array.from(createdExercises.values()).filter((createdExercise) =>
        !(session.exercises ?? []).some((exercise) => exercise.id === createdExercise.id)
      ),
    ].map((exercise) => ({
      ...exercise,
      ...changes.filter((change) => change.operation === 'session_exercise.patch'
        && change.entity?.sessionId === session.id
        && change.entity?.sessionExerciseId === exercise.id)
        .reduce((patch, change) => ({ ...patch, ...change.payload }), {}),
      sets: [
        ...(exercise.sets ?? []).filter((set) => !deletedSetIds.has(set.id)).map((set) => ({ ...set, ...(patches.get(set.id) ?? {}) })),
        ...Array.from(created.values()).filter((set) =>
          set.session_exercise_id === exercise.id && !(exercise.sets ?? []).some((existing) => existing.id === set.id)
        ),
      ].sort((a, b) => a.set_order - b.set_order),
    })),
  };
}

export function validateSyncBatch(body) {
  if (!Array.isArray(body?.changes) || body.changes.length === 0) {
    return { error: 'changes must be a non-empty array' };
  }
  if (body.changes.length > SYNC_BATCH_LIMIT) {
    return { error: `changes cannot contain more than ${SYNC_BATCH_LIMIT} items` };
  }

  const changes = [];
  for (const change of body.changes) {
    if (!change || typeof change !== 'object') return { error: 'each change must be an object' };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(change.clientChangeId ?? '')) {
      return { error: 'clientChangeId must be a UUID' };
    }
    if (!['session.create', 'session.patch', 'session_exercise.create', 'session_exercise.patch', 'session_exercise.delete', 'set.create', 'set.patch', 'set.delete'].includes(change.operation)) return { error: 'unsupported sync operation' };
    const { sessionId, sessionExerciseId, setId } = change.entity ?? {};
    if (change.operation.startsWith('set.') && ![sessionId, sessionExerciseId, setId].every((value) => typeof value === 'string' && value)) {
      return { error: 'set.patch requires sessionId, sessionExerciseId, and setId' };
    }
    if (change.operation === 'session.create') {
      if (typeof sessionId !== 'string' || !sessionId) return { error: 'session.create requires sessionId' };
      const templateId = change.payload?.template_id;
      if (templateId !== undefined && templateId !== null && typeof templateId !== 'string') return { error: 'template_id must be a string or null' };
      changes.push({ ...change, entity: { sessionId }, payload: { name: typeof change.payload?.name === 'string' ? change.payload.name : null, template_id: templateId ?? null, started_at: change.payload?.started_at ?? null } });
      continue;
    }
    if (change.operation === 'session.patch') {
      if (typeof sessionId !== 'string' || !sessionId) return { error: 'session.patch requires sessionId' };
      if (!['completed', 'abandoned'].includes(change.payload?.status)) return { error: 'session.patch requires a final status' };
      changes.push({ ...change, entity: { sessionId }, payload: { status: change.payload.status } });
      continue;
    }
    if (change.operation.startsWith('session_exercise.')) {
      if (![sessionId, sessionExerciseId].every((value) => typeof value === 'string' && value)) return { error: 'session exercise operation requires identifiers' };
      if (change.operation === 'session_exercise.create') {
        if (typeof change.payload?.exercise_id !== 'string' || !Number.isInteger(Number(change.payload?.position)) || Number(change.payload.position) < 0) return { error: 'session exercise creation is invalid' };
        for (const field of ['target_sets', 'target_rep_min', 'target_rep_max', 'rest_seconds']) {
          if (change.payload[field] !== undefined && change.payload[field] !== null && (!Number.isInteger(Number(change.payload[field])) || Number(change.payload[field]) < 0)) return { error: `${field} is invalid` };
        }
        if (change.payload.target_weight !== undefined && change.payload.target_weight !== null && (!Number.isFinite(Number(change.payload.target_weight)) || Number(change.payload.target_weight) < 0)) return { error: 'target_weight is invalid' };
      }
      if (change.operation === 'session_exercise.patch') {
        const restSeconds = change.payload?.rest_seconds;
        if (restSeconds !== null && (!Number.isInteger(Number(restSeconds)) || Number(restSeconds) < 0 || Number(restSeconds) > 3600)) return { error: 'rest_seconds is invalid' };
        changes.push({ ...change, entity: { sessionId, sessionExerciseId }, payload: { rest_seconds: restSeconds } });
        continue;
      }
      changes.push({ ...change, entity: { sessionId, sessionExerciseId }, payload: change.payload ?? {} });
      continue;
    }
    if (change.operation === 'set.delete') {
      changes.push({ ...change, entity: { sessionId, sessionExerciseId, setId }, payload: {} });
      continue;
    }
    const payload = change.payload ?? {};
    const allowed = change.operation === 'set.create'
      ? ['set_order', 'weight', 'reps', 'completed', 'weight_unit', 'set_type']
      : ['weight', 'reps', 'completed', 'planned_rest_seconds', 'rest_duration_seconds', 'rest_outcome'];
    if (!Object.keys(payload).length || Object.keys(payload).some((field) => !allowed.includes(field))) {
      return { error: 'set.patch contains no supported fields' };
    }
    if (payload.weight !== undefined && payload.weight !== null && (!Number.isFinite(Number(payload.weight)) || Number(payload.weight) < 0)) {
      return { error: 'weight must be a non-negative number' };
    }
    if (payload.reps !== undefined && payload.reps !== null && (!Number.isInteger(Number(payload.reps)) || Number(payload.reps) < 0)) {
      return { error: 'reps must be a non-negative integer' };
    }
    if (payload.completed !== undefined && typeof payload.completed !== 'boolean') {
      return { error: 'completed must be a boolean' };
    }
    if (change.operation === 'set.create' && (!Number.isInteger(Number(payload.set_order)) || Number(payload.set_order) < 0)) {
      return { error: 'set_order must be a non-negative integer' };
    }
    for (const field of ['planned_rest_seconds', 'rest_duration_seconds']) {
      if (payload[field] !== undefined && payload[field] !== null) {
        const max = field === 'planned_rest_seconds' ? 3600 : 86400;
        if (!Number.isInteger(Number(payload[field])) || Number(payload[field]) < 0 || Number(payload[field]) > max) {
          return { error: `${field} is invalid` };
        }
      }
    }
    if (payload.rest_outcome !== undefined && payload.rest_outcome !== null && !['completed', 'started_early', 'skipped'].includes(payload.rest_outcome)) {
      return { error: 'rest_outcome is invalid' };
    }
    changes.push({ ...change, entity: { sessionId, sessionExerciseId, setId }, payload });
  }
  return { changes };
}

const SYNC_OPERATION_PRIORITY = {
  'session.create': 0,
  'session_exercise.create': 1,
  'session_exercise.patch': 2,
  'set.create': 3,
  'set.patch': 4,
  'set.delete': 5,
  'session_exercise.delete': 6,
  'session.patch': 7,
};

export function orderSyncChanges(changes = []) {
  return changes.map((change, index) => ({ change, index })).sort((a, b) => {
    const timeDifference = Number(a.change.createdAt ?? 0) - Number(b.change.createdAt ?? 0);
    if (timeDifference !== 0) return timeDifference;
    const priorityDifference = (SYNC_OPERATION_PRIORITY[a.change.operation] ?? 99)
      - (SYNC_OPERATION_PRIORITY[b.change.operation] ?? 99);
    return priorityDifference || a.index - b.index;
  }).map(({ change }) => change);
}

export function nextSyncBatch(changes = []) {
  return orderSyncChanges(changes).slice(0, SYNC_BATCH_LIMIT);
}
