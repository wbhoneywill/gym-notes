import {
  createRestTimer,
  elapsedRestSeconds,
  formatRestTime,
  remainingRestSeconds,
  restProgress,
} from '@/app/lib/rest-timer.js';

describe('rest timer helpers', () => {
  it('formats a compact tabular countdown', () => {
    expect(formatRestTime(90)).toBe('1:30');
    expect(formatRestTime(-2)).toBe('0:00');
  });

  it('derives remaining time from timestamps so refreshes do not reset it', () => {
    expect(remainingRestSeconds(95_500, 5_000)).toBe(91);
    expect(remainingRestSeconds(4_000, 5_000)).toBe(0);
  });

  it('creates timers only for exercises with an enabled duration', () => {
    expect(createRestTimer({ id: 'se1', exercise_name: 'Row', rest_seconds: 60 }, { id: 'set1' }, 1_000)).toEqual({
      exerciseId: 'se1',
      exerciseName: 'Row',
      setId: 'set1',
      startedAt: 1_000,
      durationSeconds: 60,
      endsAt: 61_000,
    });
    expect(createRestTimer({ id: 'se1', rest_seconds: null }, { id: 'set1' }, 1_000)).toBeNull();
  });

  it('measures actual elapsed rest independently of the planned countdown', () => {
    expect(elapsedRestSeconds(1_000, 91_900)).toBe(90);
    expect(elapsedRestSeconds(2_000, 1_000)).toBe(0);
  });

  it('clamps progress between zero and one', () => {
    expect(restProgress(45, 90)).toBe(0.5);
    expect(restProgress(100, 90)).toBe(1);
    expect(restProgress(-1, 90)).toBe(0);
  });
});
