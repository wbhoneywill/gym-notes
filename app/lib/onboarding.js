export const TRAINING_GOALS = [
  { value: 'strength', label: 'Build strength', description: 'Prioritize heavier, controlled working sets.' },
  { value: 'muscle', label: 'Build muscle', description: 'Balance training volume, repetitions, and recovery.' },
  { value: 'general_fitness', label: 'General fitness', description: 'Build a sustainable whole-body training habit.' },
];

export const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner', description: 'I am learning movements and building consistency.' },
  { value: 'intermediate', label: 'Intermediate', description: 'I train consistently and understand the main lifts.' },
  { value: 'advanced', label: 'Advanced', description: 'I manage my own programming and progression.' },
];

export const STARTER_PLANS = {
  none: { name: null, exercises: [] },
  full_body: {
    name: 'Full Body Starter',
    exercises: ['Back Squat', 'Incline Dumbbell Press', 'Lat Pulldown', 'Romanian Deadlift', 'Overhead Press'],
  },
  push: {
    name: 'Push Starter',
    exercises: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Overhead Press', 'Lateral Raise', 'Triceps Pushdown'],
  },
  pull: {
    name: 'Pull Starter',
    exercises: ['Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Face Pull', 'Barbell Curl'],
  },
  legs: {
    name: 'Legs Starter',
    exercises: ['Back Squat', 'Romanian Deadlift', 'Leg Press', 'Lying Leg Curl', 'Standing Calf Raise'],
  },
};

export function validateOnboarding(input) {
  if (!['kg', 'lb'].includes(input.preferred_unit)) return 'Choose kilograms or pounds.';
  if (!TRAINING_GOALS.some(({ value }) => value === input.training_goal)) return 'Choose a training goal.';
  if (!EXPERIENCE_LEVELS.some(({ value }) => value === input.experience_level)) return 'Choose an experience level.';
  const days = Number(input.training_days_per_week);
  if (!Number.isInteger(days) || days < 1 || days > 7) return 'Training days must be between 1 and 7.';
  if (input.starter_plan !== undefined && !STARTER_PLANS[input.starter_plan]) return 'Choose a valid starter plan.';
  return null;
}

export function starterPlanRows(planKey, goal, experience) {
  const plan = STARTER_PLANS[planKey] ?? STARTER_PLANS.none;
  const targetSets = experience === 'beginner' ? 2 : 3;
  const [targetRepMin, targetRepMax] = goal === 'strength'
    ? [5, 8]
    : goal === 'muscle'
      ? [8, 12]
      : [8, 15];
  const restSeconds = goal === 'strength' ? 120 : 90;

  return plan.exercises.map((name, position) => ({
    name,
    position,
    target_sets: targetSets,
    target_rep_min: targetRepMin,
    target_rep_max: targetRepMax,
    rest_seconds: restSeconds,
  }));
}
