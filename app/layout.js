import { ClerkProvider } from '@clerk/nextjs';
import AppShell from '@/app/ui/app-shell';
import './globals.css';

export const metadata = {
  applicationName: 'GymNotes',
  title: {
    default: 'GymNotes — Workout Tracker',
    template: '%s · GymNotes',
  },
  description: 'Plan, record, and review gym workouts with focused set tracking.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GymNotes',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0d0e' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html lang="en">
        <body><AppShell>{children}</AppShell></body>
      </html>
    </ClerkProvider>
  );
}
