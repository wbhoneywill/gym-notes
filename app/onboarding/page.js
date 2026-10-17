import { redirect } from 'next/navigation';
import { getDbUser } from '@/app/lib/auth';
import OnboardingFlow from '@/app/components/OnboardingFlow';

export const metadata = {
  title: 'Set up your training',
  description: 'Personalize GymNotes and prepare your first workout.',
};

export default async function OnboardingPage({ searchParams }) {
  const user = await getDbUser();
  if (!user) redirect('/sign-in');

  const { edit } = await searchParams;
  const editing = edit === '1';
  if (user.onboarding_completed && !editing) redirect('/dashboard');

  return (
    <OnboardingFlow
      editing={editing}
      firstName={user.name?.trim().split(/\s+/)[0] ?? ''}
      initialValues={{
        preferred_unit: user.preferred_unit ?? 'kg',
        training_goal: user.training_goal ?? 'general_fitness',
        experience_level: user.experience_level ?? 'beginner',
        training_days_per_week: user.training_days_per_week ?? 3,
      }}
    />
  );
}
