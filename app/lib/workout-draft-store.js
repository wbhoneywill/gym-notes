const DATABASE_NAME = 'gymnotes-local';
const DATABASE_VERSION = 5;
const STORE_NAME = 'workout-drafts';
const SYNC_STORE_NAME = 'sync-changes';
const CATALOGUE_STORE_NAME = 'exercise-catalogues';
const TEMPLATE_STORE_NAME = 'template-catalogues';
let lastSyncCreatedAt = 0;

export const WORKOUT_DRAFT_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createWorkoutDraft(session, dirtySets = {}, updatedAt = Date.now(), draftKey = session.id) {
  return {
    version: WORKOUT_DRAFT_VERSION,
    draftKey,
    sessionId: session.id,
    updatedAt,
    dirtySets: clone(dirtySets),
    sessionSnapshot: clone(session),
  };
}

export function mergeWorkoutDraft(session, draft) {
  if (!draft || draft.version !== WORKOUT_DRAFT_VERSION || draft.sessionId !== session.id) {
    return { session, recoveredSetCount: 0 };
  }

  const dirtySets = draft.dirtySets ?? {};
  let recoveredSetCount = 0;
  const mergedSession = {
    ...session,
    exercises: (session.exercises ?? []).map((exercise) => ({
      ...exercise,
      sets: (exercise.sets ?? []).map((set) => {
        const saved = dirtySets[set.id];
        if (!saved || saved.sessionExerciseId !== exercise.id) return set;
        const patch = {};
        let changed = false;
        for (const field of ['weight', 'reps']) {
          if (Object.hasOwn(saved, field)) {
            patch[field] = saved[field];
            if (saved[field] !== set[field]) changed = true;
          }
        }
        if (changed) recoveredSetCount += 1;
        return { ...set, ...patch };
      }),
    })),
  };

  return { session: mergedSession, recoveredSetCount };
}

export function withDraftSetPatch(draft, session, sessionExerciseId, setId, patch, updatedAt = Date.now(), draftKey = session.id) {
  const inputPatch = Object.fromEntries(
    Object.entries(patch).filter(([field]) => field === 'weight' || field === 'reps')
  );
  const dirtySets = {
    ...(draft?.dirtySets ?? {}),
    [setId]: {
      ...(draft?.dirtySets?.[setId] ?? {}),
      sessionExerciseId,
      ...inputPatch,
    },
  };
  return createWorkoutDraft(session, dirtySets, updatedAt, draft?.draftKey ?? draftKey);
}

export function withoutDraftSetFields(draft, setId, fields, updatedAt = Date.now()) {
  if (!draft) return null;
  const dirtySets = clone(draft.dirtySets ?? {});
  if (dirtySets[setId]) {
    for (const field of fields) delete dirtySets[setId][field];
    if (Object.keys(dirtySets[setId]).every((field) => field === 'sessionExerciseId')) {
      delete dirtySets[setId];
    }
  }
  return { ...draft, dirtySets, updatedAt };
}

export function hasDirtyWorkoutInputs(draft) {
  return Object.keys(draft?.dirtySets ?? {}).length > 0;
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 2) {
        if (request.result.objectStoreNames.contains(STORE_NAME)) request.result.deleteObjectStore(STORE_NAME);
        request.result.createObjectStore(STORE_NAME, { keyPath: 'draftKey' });
      }
      if (!request.result.objectStoreNames.contains(SYNC_STORE_NAME)) {
        const store = request.result.createObjectStore(SYNC_STORE_NAME, { keyPath: 'clientChangeId' });
        store.createIndex('ownerKey', 'ownerKey', { unique: false });
      }
      if (!request.result.objectStoreNames.contains(CATALOGUE_STORE_NAME)) {
        request.result.createObjectStore(CATALOGUE_STORE_NAME, { keyPath: 'ownerKey' });
      }
      if (!request.result.objectStoreNames.contains(TEMPLATE_STORE_NAME)) {
        request.result.createObjectStore(TEMPLATE_STORE_NAME, { keyPath: 'ownerKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(mode, action, storeName = STORE_NAME) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function readWorkoutDraft(sessionId) {
  return runTransaction('readonly', (store) => store.get(sessionId));
}

export function writeWorkoutDraft(draft) {
  return runTransaction('readwrite', (store) => store.put(draft));
}

export function deleteWorkoutDraft(sessionId) {
  return runTransaction('readwrite', (store) => store.delete(sessionId));
}

function nextSyncCreatedAt() {
  lastSyncCreatedAt = Math.max(Date.now(), lastSyncCreatedAt + 0.001);
  return lastSyncCreatedAt;
}

export function createSyncChange(ownerKey, operation, entity, payload, createdAt = nextSyncCreatedAt()) {
  return {
    clientChangeId: crypto.randomUUID(),
    ownerKey,
    operation,
    entity,
    payload,
    createdAt,
    attempts: 0,
  };
}

export function enqueueSyncChange(change) {
  return runTransaction('readwrite', (store) => store.put(change), SYNC_STORE_NAME);
}

export async function listSyncChanges(ownerKey) {
  const changes = await runTransaction(
    'readonly',
    (store) => store.index('ownerKey').getAll(ownerKey),
    SYNC_STORE_NAME
  );
  return (changes ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export function uniqueOfflineOwnerKey({ changes = [], drafts = [], exerciseCatalogues = [], templateCatalogues = [] }) {
  const candidates = new Set();
  for (const record of [...changes, ...exerciseCatalogues, ...templateCatalogues]) {
    if (typeof record?.ownerKey === 'string' && record.ownerKey) candidates.add(record.ownerKey);
  }
  for (const draft of drafts) {
    if (typeof draft?.draftKey !== 'string') continue;
    const separator = draft.draftKey.indexOf(':');
    if (separator > 0) candidates.add(draft.draftKey.slice(0, separator));
  }
  return candidates.size === 1 ? Array.from(candidates)[0] : null;
}

export async function discoverOfflineOwnerKey() {
  const [changes, drafts, exerciseCatalogues, templateCatalogues] = await Promise.all([
    runTransaction('readonly', (store) => store.getAll(), SYNC_STORE_NAME).catch(() => []),
    runTransaction('readonly', (store) => store.getAll(), STORE_NAME).catch(() => []),
    runTransaction('readonly', (store) => store.getAll(), CATALOGUE_STORE_NAME).catch(() => []),
    runTransaction('readonly', (store) => store.getAll(), TEMPLATE_STORE_NAME).catch(() => []),
  ]);
  return uniqueOfflineOwnerKey({ changes, drafts, exerciseCatalogues, templateCatalogues });
}

export function deleteSyncChange(clientChangeId) {
  return runTransaction('readwrite', (store) => store.delete(clientChangeId), SYNC_STORE_NAME);
}

export async function acknowledgeSyncedSetFields(change) {
  if (change.operation !== 'set.patch') return;
  const draftKey = `${change.ownerKey}:${change.entity.sessionId}`;
  const draft = await readWorkoutDraft(draftKey);
  if (!draft) return;
  const fields = Object.keys(change.payload).filter((field) => field === 'weight' || field === 'reps');
  if (!fields.length) return;
  const nextDraft = withoutDraftSetFields(draft, change.entity.setId, fields);
  await writeWorkoutDraft(nextDraft);
}

export function writeExerciseCatalogue(ownerKey, exercises) {
  return runTransaction('readwrite', (store) => store.put({ ownerKey, exercises, updatedAt: Date.now() }), CATALOGUE_STORE_NAME);
}

export async function readExerciseCatalogue(ownerKey) {
  const record = await runTransaction('readonly', (store) => store.get(ownerKey), CATALOGUE_STORE_NAME);
  return record?.exercises ?? [];
}

export function writeTemplateCatalogue(ownerKey, templates) {
  return runTransaction('readwrite', (store) => store.put({ ownerKey, templates, updatedAt: Date.now() }), TEMPLATE_STORE_NAME);
}

export async function readTemplateCatalogue(ownerKey) {
  const record = await runTransaction('readonly', (store) => store.get(ownerKey), TEMPLATE_STORE_NAME);
  return record?.templates ?? [];
}
