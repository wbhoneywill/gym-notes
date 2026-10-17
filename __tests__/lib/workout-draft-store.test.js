import {
  createWorkoutDraft,
  hasDirtyWorkoutInputs,
  mergeWorkoutDraft,
  uniqueOfflineOwnerKey,
  withDraftSetPatch,
  withoutDraftSetFields,
} from '@/app/lib/workout-draft-store.js';

const session = {
  id: 'session-1',
  name: 'Push day',
  status: 'in_progress',
  exercises: [{ id: 'exercise-1', sets: [{ id: 'set-1', weight: 20, reps: 8 }] }],
};

describe('workout draft recovery', () => {
  it('restores only locally dirty input fields', () => {
    let draft = createWorkoutDraft(session, {}, 100);
    draft = withDraftSetPatch(draft, session, 'exercise-1', 'set-1', { weight: 30 }, 200);

    const serverSession = {
      ...session,
      exercises: [{ id: 'exercise-1', sets: [{ id: 'set-1', weight: 20, reps: 10 }] }],
    };
    const recovered = mergeWorkoutDraft(serverSession, draft);

    expect(recovered.session.exercises[0].sets[0]).toMatchObject({ weight: 30, reps: 10 });
    expect(recovered.recoveredSetCount).toBe(1);
  });

  it('ignores drafts belonging to another session', () => {
    const draft = createWorkoutDraft({ ...session, id: 'other-session' });
    expect(mergeWorkoutDraft(session, draft)).toEqual({ session, recoveredSetCount: 0 });
  });

  it('clears fields after the server accepts them', () => {
    let draft = withDraftSetPatch(null, session, 'exercise-1', 'set-1', { weight: 30, reps: 4 });
    draft = withoutDraftSetFields(draft, 'set-1', ['weight']);
    expect(draft.dirtySets['set-1']).toEqual({ sessionExerciseId: 'exercise-1', reps: 4 });
    draft = withoutDraftSetFields(draft, 'set-1', ['reps']);
    expect(hasDirtyWorkoutInputs(draft)).toBe(false);
  });

  it('recovers one existing owner namespace for an upgraded offline client', () => {
    expect(uniqueOfflineOwnerKey({
      changes: [{ ownerKey: 'user_1' }],
      drafts: [{ draftKey: 'user_1:session-1' }],
      exerciseCatalogues: [{ ownerKey: 'user_1' }],
    })).toBe('user_1');
  });

  it('does not guess an owner on a device containing more than one account', () => {
    expect(uniqueOfflineOwnerKey({
      changes: [{ ownerKey: 'user_1' }, { ownerKey: 'user_2' }],
    })).toBeNull();
  });
});
