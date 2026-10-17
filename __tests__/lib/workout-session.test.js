import { recordedIncompleteSets } from '@/app/lib/workout-session.js';

describe('recordedIncompleteSets', () => {
  it('finds entered sets that still need to be marked complete', () => {
    const exercises = [{
      id: 'se1',
      sets: [
        { id: 'empty', weight: null, reps: null, completed: false },
        { id: 'recorded', weight: 30, reps: 4, completed: false },
        { id: 'done', weight: 40, reps: 5, completed: true },
      ],
    }];

    expect(recordedIncompleteSets(exercises)).toEqual([
      {
        id: 'recorded',
        weight: 30,
        reps: 4,
        completed: false,
        sessionExerciseId: 'se1',
      },
    ]);
  });

  it('keeps bodyweight or partially entered sets visible to the finish safeguard', () => {
    const exercises = [{
      id: 'se1',
      sets: [
        { id: 'reps-only', weight: null, reps: 10, completed: false },
        { id: 'weight-only', weight: 20, reps: null, completed: false },
      ],
    }];

    expect(recordedIncompleteSets(exercises).map((set) => set.id)).toEqual([
      'reps-only',
      'weight-only',
    ]);
  });

  it('handles sessions without exercises', () => {
    expect(recordedIncompleteSets()).toEqual([]);
  });
});
