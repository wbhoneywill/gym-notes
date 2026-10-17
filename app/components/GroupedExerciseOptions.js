import { groupExercisesByMuscle } from '@/app/lib/exercises';

export default function GroupedExerciseOptions({ exercises }) {
  return groupExercisesByMuscle(exercises).map((group) => (
    <optgroup key={group.name} label={group.name}>
      {group.exercises.map((exercise) => (
        <option key={exercise.id} value={exercise.id}>
          {exercise.name}
        </option>
      ))}
    </optgroup>
  ));
}
