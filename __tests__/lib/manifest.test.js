import manifest from '@/app/manifest.js';

describe('PWA manifest', () => {
  it('defines an installable, branded standalone application', () => {
    const value = manifest();
    expect(value).toMatchObject({
      name: 'GymNotes — Workout Tracker',
      short_name: 'GymNotes',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
    ]));
  });

  it('offers shortcuts to the most useful installed-app destinations', () => {
    expect(manifest().shortcuts.map(({ url }) => url)).toEqual(['/train', '/history']);
  });
});
