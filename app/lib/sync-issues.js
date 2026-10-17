const OPERATION_TITLES = {
  'session.create': 'Create workout',
  'session.patch': 'Update workout status',
  'session_exercise.create': 'Add exercise',
  'session_exercise.patch': 'Update exercise settings',
  'session_exercise.delete': 'Remove exercise',
  'set.create': 'Add set',
  'set.patch': 'Save set',
  'set.delete': 'Delete set',
};

export function partitionSyncChanges(changes = []) {
  return {
    blocked: changes.filter((change) => change.blocked === true),
    pending: changes.filter((change) => change.blocked !== true),
  };
}

export function syncIssueTitle(change) {
  return OPERATION_TITLES[change?.operation] ?? 'Save workout change';
}

export function syncIssueReason(change) {
  return change?.syncError
    || 'The workout changed on the server or is no longer editable.';
}

export function syncAttemptDetails(change) {
  const payload = change?.payload ?? {};
  const details = [];
  if (Object.hasOwn(payload, 'weight')) details.push(['Weight', payload.weight == null ? 'Empty' : `${payload.weight} ${payload.weight_unit ?? ''}`.trim()]);
  if (Object.hasOwn(payload, 'reps')) details.push(['Reps', payload.reps == null ? 'Empty' : String(payload.reps)]);
  if (Object.hasOwn(payload, 'completed')) details.push(['Set status', payload.completed ? 'Done' : 'Not done']);
  if (Object.hasOwn(payload, 'status')) details.push(['Workout status', payload.status]);
  if (Object.hasOwn(payload, 'name')) details.push(['Workout', payload.name || 'Untitled workout']);
  if (Object.hasOwn(payload, 'set_order')) details.push(['Set number', String(Number(payload.set_order) + 1)]);
  return details;
}

export function discardableSetFields(change, allChanges = []) {
  if (change?.operation !== 'set.patch') return [];
  const otherFields = new Set(
    allChanges
      .filter((candidate) => candidate.clientChangeId !== change.clientChangeId
        && candidate.operation === 'set.patch'
        && candidate.ownerKey === change.ownerKey
        && candidate.entity?.setId === change.entity?.setId)
      .flatMap((candidate) => Object.keys(candidate.payload ?? {}))
  );
  return Object.keys(change.payload ?? {})
    .filter((field) => (field === 'weight' || field === 'reps') && !otherFields.has(field));
}
