import { derivePersonalRecords } from '@/app/lib/personal-records.js';

const row = (session, exercise, weight, reps, extra = {}) => ({
  session_id: session,
  exercise_id: exercise,
  exercise_name: exercise === 'bench' ? 'Bench Press' : 'Row',
  weight_kg: weight,
  reps,
  session_name: session === 'current' ? 'Push Day' : 'Push Day Previous',
  started_at: session === 'current' ? '2026-10-17T10:00:00Z' : '2026-10-10T10:00:00Z',
  ...extra,
});

describe('personal records', () => {
  it('derives meaningful exercise and workout improvements against prior sessions', () => {
    const result = derivePersonalRecords([
      row('prior-1', 'bench', 80, 5),
      row('prior-1', 'bench', 70, 7),
      row('prior-1', 'row', 50, 10),
      row('current', 'bench', 82.5, 5),
      row('current', 'bench', 80, 7),
      row('current', 'row', 50, 10),
    ], 'current');

    expect(result.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'heaviest_set', exercise_id: 'bench', weight_kg: 82.5,
        previous_weight_kg: 80,
        previous_session: expect.objectContaining({ session_id: 'prior-1', session_name: 'Push Day Previous' }),
      }),
      expect.objectContaining({
        type: 'best_set_volume', exercise_id: 'bench', volume_kg: 560,
        previous_volume_kg: 490,
      }),
      expect.objectContaining({
        type: 'reps_at_weight', exercise_id: 'bench', reps: 7, previous_reps: 5,
        previous_session: expect.objectContaining({ session_id: 'prior-1' }),
      }),
    ]));
    expect(result.records.some((record) => record.exercise_id === 'row')).toBe(false);
    expect(result.workoutRecord).toMatchObject({
      type: 'workout_volume',
      current_session: { session_id: 'current', session_name: 'Push Day' },
      previous_session: { session_id: 'prior-1', session_name: 'Push Day Previous' },
    });
  });

  it('does not celebrate a first performance without a prior baseline', () => {
    const result = derivePersonalRecords([row('current', 'bench', 100, 5)], 'current');
    expect(result.records).toEqual([]);
    expect(result.workoutRecord).toBeNull();
  });

  it('requires strict improvement and compares equivalent normalized weights', () => {
    const result = derivePersonalRecords([
      row('prior', 'bench', 50.00001, 8),
      row('current', 'bench', 50.00002, 8),
    ], 'current');
    expect(result.records).toEqual([]);
  });
});
