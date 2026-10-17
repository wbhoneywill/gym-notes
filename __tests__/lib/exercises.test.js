import { groupExercisesByMuscle } from '@/app/lib/exercises.js';

describe('exercise grouping', () => {
  const exercises = [
    { id: '3', name: 'Mystery Move', primary_muscle_group: null },
    { id: '2', name: 'Incline Press', primary_muscle_group: 'Chest' },
    { id: '1', name: 'Bench Press', primary_muscle_group: 'Chest' },
    { id: '4', name: 'Back Squat', primary_muscle_group: 'Quadriceps' },
  ];

  it('groups exercises by their data-driven primary muscle', () => {
    expect(groupExercisesByMuscle(exercises)).toEqual([
      {
        name: 'Chest',
        exercises: [exercises[2], exercises[1]],
      },
      { name: 'Quadriceps', exercises: [exercises[3]] },
      { name: 'Other', exercises: [exercises[0]] },
    ]);
  });

  it('respects taxonomy order and always places uncategorized exercises last', () => {
    const groups = groupExercisesByMuscle(exercises, ['Quadriceps', 'Chest']);
    expect(groups.map((group) => group.name)).toEqual([
      'Quadriceps',
      'Chest',
      'Other',
    ]);
  });

  it('handles an empty library', () => {
    expect(groupExercisesByMuscle()).toEqual([]);
  });
});
