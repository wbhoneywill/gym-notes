export const BODY_GROUP_VISUALS = {
  Chest: { slugs: ['chest'], view: 'front' },
  Back: { slugs: ['upper-back', 'lower-back'], view: 'back' },
  Shoulders: { slugs: ['deltoids'], view: 'front' },
  Biceps: { slugs: ['biceps'], view: 'front' },
  Triceps: { slugs: ['triceps'], view: 'back' },
  Forearms: { slugs: ['forearm'], view: 'front' },
  Quadriceps: { slugs: ['quadriceps'], view: 'front' },
  Hamstrings: { slugs: ['hamstring'], view: 'back' },
  Glutes: { slugs: ['gluteal'], view: 'back' },
  Calves: { slugs: ['calves'], view: 'back' },
  Core: { slugs: ['abs', 'obliques'], view: 'front' },
  Traps: { slugs: ['trapezius'], view: 'back' },
  Lats: { slugs: ['upper-back'], view: 'back' },
  Adductors: { slugs: ['adductors'], view: 'front' },
  // The package has no dedicated abductor path; the lateral glute region is
  // the closest honest visual approximation. The text label remains explicit.
  Abductors: { slugs: ['gluteal'], view: 'back' },
  Neck: { slugs: ['neck'], view: 'back' },
};

export const FRONT_BODY_FILTER = '__front_body__';
export const BACK_BODY_FILTER = '__back_body__';

const BODY_VIEW_GROUPS = {
  front: ['Chest', 'Shoulders', 'Biceps', 'Forearms', 'Core', 'Adductors'],
  back: ['Back', 'Lats', 'Traps', 'Triceps', 'Hamstrings', 'Glutes', 'Calves', 'Abductors', 'Neck'],
};

const BODY_SLUG_TO_GROUP = {
  chest: 'Chest',
  'upper-back': 'Back',
  'lower-back': 'Back',
  deltoids: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearm: 'Forearms',
  quadriceps: 'Quadriceps',
  hamstring: 'Hamstrings',
  gluteal: 'Glutes',
  calves: 'Calves',
  abs: 'Core',
  obliques: 'Core',
  trapezius: 'Traps',
  adductors: 'Adductors',
  neck: 'Neck',
};

export function visualForBodyGroup(groupName) {
  return BODY_GROUP_VISUALS[groupName] ?? null;
}

export function bodyGroupForSlug(slug, availableGroups = []) {
  const group = BODY_SLUG_TO_GROUP[slug] ?? null;
  return group && availableGroups.includes(group) ? group : null;
}

export function bodyGroupsForView(view, availableGroups = []) {
  const groupsForView = BODY_VIEW_GROUPS[view] ?? [];
  return groupsForView.filter((group) => availableGroups.includes(group));
}
