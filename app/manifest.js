export default function manifest() {
  return {
    name: 'GymNotes — Workout Tracker',
    short_name: 'GymNotes',
    description: 'Plan, record, and review gym workouts with focused set tracking.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0c0d0e',
    theme_color: '#0c0d0e',
    orientation: 'portrait-primary',
    categories: ['fitness', 'health', 'productivity'],
    icons: [
      {
        src: '/icons/gymnotes-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/gymnotes-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/gymnotes-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Start training',
        short_name: 'Train',
        url: '/train',
        icons: [{ src: '/icons/gymnotes-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Workout history',
        short_name: 'History',
        url: '/history',
        icons: [{ src: '/icons/gymnotes-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
