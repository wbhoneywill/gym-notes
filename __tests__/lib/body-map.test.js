import { bodyGroupForSlug, bodyGroupsForView, visualForBodyGroup } from '@/app/lib/body-map.js';

describe('body-map taxonomy mapping', () => {
  it('maps GymNotes body groups to the appropriate visual regions', () => {
    expect(visualForBodyGroup('Chest')).toEqual({ slugs: ['chest'], view: 'front' });
    expect(visualForBodyGroup('Core')).toEqual({ slugs: ['abs', 'obliques'], view: 'front' });
    expect(visualForBodyGroup('Hamstrings')).toEqual({ slugs: ['hamstring'], view: 'back' });
  });

  it('maps a clicked anatomy region only when that group has exercises', () => {
    expect(bodyGroupForSlug('quadriceps', ['Chest', 'Quadriceps'])).toBe('Quadriceps');
    expect(bodyGroupForSlug('biceps', ['Chest', 'Quadriceps'])).toBeNull();
  });

  it('returns null for unsupported visual regions and body groups', () => {
    expect(bodyGroupForSlug('hands', ['Chest'])).toBeNull();
    expect(visualForBodyGroup('Other')).toBeNull();
  });

  it('separates available groups into front and back body filters', () => {
    const available = ['Chest', 'Back', 'Quadriceps', 'Hamstrings', 'Other'];
    expect(bodyGroupsForView('front', available)).toEqual(['Chest']);
    expect(bodyGroupsForView('back', available)).toEqual(['Back', 'Hamstrings']);
  });
});
