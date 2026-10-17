import { hasExerciseMedia, mediaForExercise } from '@/app/lib/exercise-media.js';

describe('exercise media mapping', () => {
  it('maps existing GymNotes names to durable provider IDs and local frames', () => {
    expect(mediaForExercise({ name: 'Incline Dumbbell Press' })).toMatchObject({
      provider: 'Free Exercise DB',
      providerExerciseId: 'Incline_Dumbbell_Press',
      license: 'Unlicense',
      startImage: '/vendor/free-exercise-db/Incline_Dumbbell_Press/0.jpg',
      finishImage: '/vendor/free-exercise-db/Incline_Dumbbell_Press/1.jpg',
      animation: null,
    });
    expect(mediaForExercise({ exercise_name: 'Back Squat' }).providerName).toBe('Barbell Full Squat');
  });

  it('keeps optional animation support without inventing an animation for static media', () => {
    expect(mediaForExercise({ name: 'Bent-Over Dumbbell Row' })).toMatchObject({
      providerExerciseId: 'Bent_Over_Two-Dumbbell_Row',
      animation: null,
    });
    expect(hasExerciseMedia({ name: 'Barbell Row' })).toBe(false);
  });

  it('covers exact matches beyond the original proof of concept', () => {
    expect(mediaForExercise({ name: 'Goblet Squat' })).toMatchObject({
      providerExerciseId: 'Goblet_Squat',
      finishImage: '/vendor/free-exercise-db/Goblet_Squat/1.jpg',
    });
    expect(hasExerciseMedia({ name: 'Pallof Press' })).toBe(true);
  });

  it('does not guess media for personal or unmatched exercises', () => {
    expect(mediaForExercise({ name: 'My custom row' })).toBeNull();
  });
});
