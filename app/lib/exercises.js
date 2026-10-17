const UNCATEGORIZED_GROUP = 'Other';

export function groupExercisesByMuscle(exercises = [], preferredOrder = []) {
  const groups = new Map();

  for (const exercise of exercises) {
    const groupName = exercise.primary_muscle_group || UNCATEGORIZED_GROUP;
    const group = groups.get(groupName) ?? [];
    group.push(exercise);
    groups.set(groupName, group);
  }

  const order = new Map(preferredOrder.map((name, index) => [name, index]));

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === UNCATEGORIZED_GROUP) return 1;
      if (right === UNCATEGORIZED_GROUP) return -1;

      const leftIndex = order.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = order.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.localeCompare(right);
    })
    .map(([name, items]) => ({
      name,
      exercises: [...items].sort((left, right) => left.name.localeCompare(right.name)),
    }));
}
