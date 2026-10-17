function normalizedSet(row) {
  const rawWeightKg = Number(row.weight_kg);
  const reps = Number(row.reps);
  if (!Number.isFinite(rawWeightKg) || !Number.isInteger(reps) || reps < 0) return null;
  // Match the API query's canonical precision so floating-point conversion
  // noise never creates a record for an otherwise equivalent load.
  const weightKg = Number(rawWeightKg.toFixed(4));
  return {
    ...row,
    weight_kg: weightKg,
    reps,
    set_volume_kg: weightKg * reps,
  };
}

function maxBy(items, value) {
  return items.reduce((best, item) => best === null || value(item) > value(best) ? item : best, null);
}

function weightKey(weightKg) {
  return Number(weightKg).toFixed(4);
}

function sessionDetails(set) {
  return {
    session_id: set.session_id,
    session_name: set.session_name ?? 'Workout',
    started_at: set.started_at ?? null,
  };
}

export function derivePersonalRecords(rows = [], currentSessionId) {
  const sets = rows.map(normalizedSet).filter(Boolean);
  const current = sets.filter((set) => set.session_id === currentSessionId);
  const prior = sets.filter((set) => set.session_id !== currentSessionId);
  const exerciseIds = [...new Set(current.map((set) => set.exercise_id))];
  const records = [];

  for (const exerciseId of exerciseIds) {
    const currentSets = current.filter((set) => set.exercise_id === exerciseId);
    const priorSets = prior.filter((set) => set.exercise_id === exerciseId);
    if (!priorSets.length) continue;
    const exerciseName = currentSets[0]?.exercise_name ?? 'Exercise';
    const currentHeaviest = maxBy(currentSets, (set) => set.weight_kg);
    const priorHeaviest = maxBy(priorSets, (set) => set.weight_kg);
    if (currentHeaviest && currentHeaviest.weight_kg > priorHeaviest.weight_kg) {
      records.push({
        type: 'heaviest_set', exercise_id: exerciseId, exercise_name: exerciseName,
        weight_kg: currentHeaviest.weight_kg, reps: currentHeaviest.reps,
        ...sessionDetails(currentHeaviest),
        previous_weight_kg: priorHeaviest.weight_kg,
        previous_reps: priorHeaviest.reps,
        previous_session: sessionDetails(priorHeaviest),
      });
    }

    const currentBestVolume = maxBy(currentSets, (set) => set.set_volume_kg);
    const priorBestVolume = maxBy(priorSets, (set) => set.set_volume_kg);
    if (currentBestVolume && currentBestVolume.set_volume_kg > priorBestVolume.set_volume_kg) {
      records.push({
        type: 'best_set_volume', exercise_id: exerciseId, exercise_name: exerciseName,
        weight_kg: currentBestVolume.weight_kg, reps: currentBestVolume.reps,
        volume_kg: currentBestVolume.set_volume_kg,
        ...sessionDetails(currentBestVolume),
        previous_weight_kg: priorBestVolume.weight_kg,
        previous_reps: priorBestVolume.reps,
        previous_volume_kg: priorBestVolume.set_volume_kg,
        previous_session: sessionDetails(priorBestVolume),
      });
    }

    const priorRepsByWeight = new Map();
    for (const set of priorSets) {
      const key = weightKey(set.weight_kg);
      const previous = priorRepsByWeight.get(key);
      if (!previous || set.reps > previous.reps) priorRepsByWeight.set(key, set);
    }
    const repRecords = currentSets.filter((set) => {
      const previous = priorRepsByWeight.get(weightKey(set.weight_kg));
      return previous && set.reps > previous.reps;
    });
    const bestRepRecord = maxBy(repRecords, (set) => set.reps - priorRepsByWeight.get(weightKey(set.weight_kg)).reps);
    if (bestRepRecord) {
      const previous = priorRepsByWeight.get(weightKey(bestRepRecord.weight_kg));
      records.push({
        type: 'reps_at_weight', exercise_id: exerciseId, exercise_name: exerciseName,
        weight_kg: bestRepRecord.weight_kg, reps: bestRepRecord.reps,
        ...sessionDetails(bestRepRecord),
        previous_reps: previous.reps,
        previous_session: sessionDetails(previous),
      });
    }
  }

  const currentVolumeKg = current.reduce((sum, set) => sum + set.set_volume_kg, 0);
  const priorSessionVolumes = new Map();
  for (const set of prior) {
    const entry = priorSessionVolumes.get(set.session_id) ?? {
      ...sessionDetails(set),
      volume_kg: 0,
    };
    entry.volume_kg += set.set_volume_kg;
    priorSessionVolumes.set(set.session_id, entry);
  }
  const previousBestSession = maxBy([...priorSessionVolumes.values()], (entry) => entry.volume_kg);
  const previousBestVolumeKg = previousBestSession?.volume_kg ?? null;
  const workoutRecord = previousBestVolumeKg !== null && currentVolumeKg > previousBestVolumeKg
    ? {
        type: 'workout_volume',
        volume_kg: currentVolumeKg,
        previous_volume_kg: previousBestVolumeKg,
        current_session: current[0] ? sessionDetails(current[0]) : null,
        previous_session: previousBestSession ? {
          session_id: previousBestSession.session_id,
          session_name: previousBestSession.session_name,
          started_at: previousBestSession.started_at,
        } : null,
      }
    : null;

  return { records, workoutRecord, currentVolumeKg, previousBestVolumeKg };
}
