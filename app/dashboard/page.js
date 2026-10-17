import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDbUser } from '@/app/lib/auth';

export const metadata = {
  title: 'Dashboard — Workout Tracker',
};

export default async function DashboardPage() {
  const user = await getDbUser();

  if (user?.onboarding_completed === false) {
    redirect('/onboarding');
  }

  // The route is protected by Clerk middleware, so a session always exists.
  // getDbUser() provisions the users row on first visit if the webhook was
  // missed, so `user` should be present here.
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Welcome back, ${firstName}` : 'Welcome back';

  return (
    <main className="container dashboard">
      <header className="page-header">
        <p className="eyebrow">Your training</p>
        <h1 className="page-title">{greeting}</h1>
        <p className="page-lead">Ready to make today count?</p>
      </header>

      <Link className="training-hero" href="/train">
        <span>
          <span className="training-hero-kicker">Quick start</span>
          <strong>Start a workout</strong>
          <small>Choose a plan or train without one</small>
        </span>
        <span className="training-hero-arrow" aria-hidden="true">→</span>
      </Link>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Plan and review</h2>
        </div>
      </div>

      <nav className="dashboard-nav" aria-label="Primary">
        <Link className="dashboard-card" href="/templates">
          <span className="dashboard-card-index">01</span>
          <span><span className="dashboard-card-title">Templates</span>
          <span className="dashboard-card-sub">Build repeatable sessions</span></span>
        </Link>

        <Link className="dashboard-card" href="/history">
          <span className="dashboard-card-index">02</span>
          <span><span className="dashboard-card-title">History</span>
          <span className="dashboard-card-sub">Review completed work</span></span>
        </Link>

        <Link className="dashboard-card" href="/exercises">
          <span className="dashboard-card-index">03</span>
          <span><span className="dashboard-card-title">Exercise Library</span>
          <span className="dashboard-card-sub">Browse and add movements</span></span>
        </Link>

        <Link className="dashboard-card" href="/progress">
          <span className="dashboard-card-index">04</span>
          <span><span className="dashboard-card-title">Progress</span>
          <span className="dashboard-card-sub">Volume and progression trends</span></span>
        </Link>
      </nav>
    </main>
  );
}
