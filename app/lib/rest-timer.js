export const REST_TIMER_STORAGE_PREFIX = 'gymnotes:rest-timer:';

export function formatRestTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function remainingRestSeconds(endsAt, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(endsAt) - Number(now)) / 1000));
}

export function restProgress(remainingSeconds, durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, Number(remainingSeconds) / duration));
}

export function elapsedRestSeconds(startedAt, now = Date.now()) {
  return Math.max(0, Math.floor((Number(now) - Number(startedAt)) / 1000));
}

export function createRestTimer(exercise, set, now = Date.now()) {
  const durationSeconds = Number(exercise?.rest_seconds);
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) return null;
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.exercise_name,
    setId: set?.id,
    startedAt: now,
    durationSeconds,
    endsAt: now + durationSeconds * 1000,
  };
}
