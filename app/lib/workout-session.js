export function recordedIncompleteSets(exercises = []) {
  return exercises.flatMap((exercise) => exercise.sets
    .filter((set) => (
      !set.completed
      && (set.weight !== null && set.weight !== undefined
        || set.reps !== null && set.reps !== undefined)
    ))
    .map((set) => ({ ...set, sessionExerciseId: exercise.id })));
}
