const FREE_EXERCISE_DB_ASSET_ROOT = '/vendor/free-exercise-db';
const FREE_EXERCISE_DB_SOURCE = 'https://github.com/yuhonas/free-exercise-db';

// Deliberately exact: a similarly named or personal exercise must never receive
// instructions for a movement we have not explicitly reviewed as equivalent.
const FREE_EXERCISE_DB_MEDIA = {
  'Incline Dumbbell Press': { id: 'Incline_Dumbbell_Press' },
  'Triceps Pushdown': { id: 'Triceps_Pushdown' },
  'Barbell Curl': { id: 'Barbell_Curl' },
  'Face Pull': { id: 'Face_Pull' },
  'Back Squat': { id: 'Barbell_Full_Squat', providerName: 'Barbell Full Squat' },
  'Romanian Deadlift': { id: 'Romanian_Deadlift' },
  'Leg Press': { id: 'Leg_Press' },
  Plank: { id: 'Plank' },
  'Dumbbell Bench Press': { id: 'Dumbbell_Bench_Press' },
  'Chin-Up': { id: 'Chin-Up' },
  'Straight-Arm Pulldown': { id: 'Straight-Arm_Pulldown' },
  'Incline Dumbbell Curl': { id: 'Incline_Dumbbell_Curl' },
  'Good Morning': { id: 'Good_Morning' },
  'Seated Calf Raise': { id: 'Seated_Calf_Raise' },
  'Hanging Leg Raise': { id: 'Hanging_Leg_Raise' },
  'Cable Crunch': { id: 'Cable_Crunch' },
  'Russian Twist': { id: 'Russian_Twist' },
  'Dumbbell Shrug': { id: 'Dumbbell_Shrug' },
  'Preacher Curl': { id: 'Preacher_Curl' },
  'EZ-Bar Curl': { id: 'EZ-Bar_Curl' },
  'Hack Squat': { id: 'Hack_Squat' },
  'Goblet Squat': { id: 'Goblet_Squat' },
  'Seated Leg Curl': { id: 'Seated_Leg_Curl' },
  'Sumo Deadlift': { id: 'Sumo_Deadlift' },
  'Pallof Press': { id: 'Pallof_Press' },
  'Barbell Shrug': { id: 'Barbell_Shrug' },
  'Wrist Roller': { id: 'Wrist_Roller' },
  'Lat Pulldown': { id: 'Wide-Grip_Lat_Pulldown', providerName: 'Wide-Grip Lat Pulldown' },
  'Bent-Over Dumbbell Row': { id: 'Bent_Over_Two-Dumbbell_Row', providerName: 'Bent Over Two-Dumbbell Row' },
};

export function mediaForExercise(exercise) {
  const exerciseName = exercise?.name ?? exercise?.exercise_name;
  const media = FREE_EXERCISE_DB_MEDIA[exerciseName];
  if (!media) return null;

  return {
    provider: 'Free Exercise DB',
    providerExerciseId: media.id,
    providerName: media.providerName ?? exerciseName,
    sourceUrl: `${FREE_EXERCISE_DB_SOURCE}/tree/main/exercises/${media.id}`,
    license: 'Unlicense',
    licenseUrl: `${FREE_EXERCISE_DB_SOURCE}/blob/main/LICENSE.md`,
    startImage: `${FREE_EXERCISE_DB_ASSET_ROOT}/${media.id}/0.jpg`,
    finishImage: `${FREE_EXERCISE_DB_ASSET_ROOT}/${media.id}/1.jpg`,
    animation: null,
  };
}

export function hasExerciseMedia(exercise) {
  return mediaForExercise(exercise) !== null;
}
