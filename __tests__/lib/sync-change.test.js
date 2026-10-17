import { applyPendingSetChanges, nextSyncBatch, orderSyncChanges, validateSyncBatch } from '@/app/lib/sync-change.js';

const change = {
  clientChangeId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  operation: 'set.patch',
  entity: { sessionId: 's1', sessionExerciseId: 'se1', setId: 'set1' },
  payload: { weight: 30, reps: 4, completed: true },
};

describe('sync changes', () => {
  it('validates a supported set patch', () => {
    expect(validateSyncBatch({ changes: [change] })).toEqual({ changes: [change] });
  });

  it('rejects unknown operations and fields', () => {
    expect(validateSyncBatch({ changes: [{ ...change, operation: 'session.delete' }] }).error).toMatch(/unsupported/);
    expect(validateSyncBatch({ changes: [{ ...change, payload: { owner_user_id: 7 } }] }).error).toMatch(/supported fields/);
  });

  it('overlays queued mutations in chronological order', () => {
    const session = { id: 's1', exercises: [{ id: 'se1', sets: [{ id: 'set1', weight: 20, reps: 8, completed: false }] }] };
    const result = applyPendingSetChanges(session, [change, { ...change, clientChangeId: 'second', payload: { reps: 5 } }]);
    expect(result.exercises[0].sets[0]).toMatchObject({ weight: 30, reps: 5, completed: true });
  });

  it('validates and overlays queued set creation and session completion', () => {
    const create = { ...change, operation: 'set.create', entity: { ...change.entity, setId: 'set2' }, payload: { set_order: 1 } };
    const finish = { ...change, operation: 'session.patch', entity: { sessionId: 's1' }, payload: { status: 'completed' } };
    expect(validateSyncBatch({ changes: [create, finish] }).error).toBeUndefined();
    const session = { id: 's1', status: 'in_progress', exercises: [{ id: 'se1', sets: [] }] };
    const result = applyPendingSetChanges(session, [create, finish]);
    expect(result.status).toBe('completed');
    expect(result.exercises[0].sets[0]).toMatchObject({ id: 'set2', set_order: 1 });
  });

  it('overlays exercise creation and structural deletions', () => {
    const addExercise = { ...change, operation: 'session_exercise.create', entity: { sessionId: 's1', sessionExerciseId: 'se2' }, payload: { exercise_id: 'exercise2', exercise_name: 'Row', primary_muscle_group: 'Back', position: 1 } };
    const deleteSet = { ...change, operation: 'set.delete', entity: { sessionId: 's1', sessionExerciseId: 'se1', setId: 'set1' }, payload: {} };
    const session = { id: 's1', exercises: [{ id: 'se1', sets: [{ id: 'set1', set_order: 0 }] }] };
    const result = applyPendingSetChanges(session, [addExercise, deleteSet]);
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0].sets).toHaveLength(0);
    expect(result.exercises[1]).toMatchObject({ id: 'se2', exercise_name: 'Row' });
  });

  it('validates and overlays an offline rest-duration selection', () => {
    const rest = {
      ...change,
      operation: 'session_exercise.patch',
      entity: { sessionId: 's1', sessionExerciseId: 'se1' },
      payload: { rest_seconds: 90 },
    };
    expect(validateSyncBatch({ changes: [rest] }).error).toBeUndefined();
    const session = { id: 's1', exercises: [{ id: 'se1', rest_seconds: null, sets: [] }] };
    expect(applyPendingSetChanges(session, [rest]).exercises[0].rest_seconds).toBe(90);
  });

  it('orders tied dependent writes before finalization and limits a batch to 50', () => {
    const finish = { ...change, clientChangeId: 'finish', createdAt: 100, operation: 'session.patch' };
    const create = { ...change, clientChangeId: 'create', createdAt: 100, operation: 'session.create' };
    const setPatch = { ...change, createdAt: 100 };
    expect(orderSyncChanges([finish, setPatch, create]).map((item) => item.operation)).toEqual([
      'session.create', 'set.patch', 'session.patch',
    ]);
    expect(nextSyncBatch(Array.from({ length: 51 }, (_, index) => ({ ...change, clientChangeId: String(index), createdAt: index })))).toHaveLength(50);
  });
});
