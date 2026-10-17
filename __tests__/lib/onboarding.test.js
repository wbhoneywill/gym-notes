import { starterPlanRows, validateOnboarding } from '@/app/lib/onboarding.js';

const valid = {
  preferred_unit: 'kg',
  training_goal: 'muscle',
  experience_level: 'beginner',
  training_days_per_week: 3,
  starter_plan: 'full_body',
};

describe('onboarding configuration', () => {
  it('validates the persisted training profile', () => {
    expect(validateOnboarding(valid)).toBeNull();
    expect(validateOnboarding({ ...valid, preferred_unit: 'stone' })).toMatch(/kilograms/i);
    expect(validateOnboarding({ ...valid, training_days_per_week: 0 })).toMatch(/between 1 and 7/i);
    expect(validateOnboarding({ ...valid, starter_plan: 'unknown' })).toMatch(/starter plan/i);
  });

  it('uses approachable beginner hypertrophy targets', () => {
    const rows = starterPlanRows('full_body', 'muscle', 'beginner');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      name: 'Back Squat',
      position: 0,
      target_sets: 2,
      target_rep_min: 8,
      target_rep_max: 12,
      rest_seconds: 90,
    });
  });

  it('adjusts strength targets without prescribing weight', () => {
    expect(starterPlanRows('push', 'strength', 'intermediate')[0]).toMatchObject({
      target_sets: 3,
      target_rep_min: 5,
      target_rep_max: 8,
      rest_seconds: 120,
    });
  });
});
