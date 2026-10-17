import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';

export const metadata = {
  title: 'GymNotes — a performance instrument for the gym',
  description:
    'Plan, record, and review your training. Quiet strength. Measurable progress. No distractions.',
};

const features = [
  { name: 'Installable', desc: 'Focused Home Screen experience' },
  { name: 'Previous performance', desc: 'Beat last time' },
  { name: 'Reusable templates', desc: 'Push / Pull / Legs' },
  { name: 'Private by default', desc: 'Your training is yours' },
];

export default async function HomePage() {
  const { userId } = await auth();
  const signedIn = Boolean(userId);

  return (
    <main className="landing">
      <header className="landing-header">
        <span className="landing-wordmark">GYMNOTES</span>
        <span className="landing-version">v0.1</span>
      </header>

      <p className="landing-eyebrow">PERFORMANCE TRACKER</p>
      <h1 className="landing-hero">
        Quiet strength.
        <br />
        Measurable <span className="dim">progress.</span>
      </h1>
      <p className="landing-sub">
        A performance instrument for the gym. Plan, record, and review every rep.
      </p>

      <div className="landing-cta">
        {signedIn ? (
          <>
            <Link className="btn" href="/dashboard">
              Open dashboard
            </Link>
            <Link className="btn btn-secondary" href="/train">
              Start training
            </Link>
          </>
        ) : (
          <>
            <Link className="btn" href="/sign-up">
              Start training
            </Link>
            <Link className="btn btn-secondary" href="/sign-in">
              Sign in
            </Link>
          </>
        )}
      </div>

      <section className="stat-band" aria-label="Sample session summary">
        <div className="stat-band-label">LAST SESSION · PUSH A</div>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-value">8,240</span>
            <span className="stat-key">VOLUME KG</span>
          </div>
          <div className="stat">
            <span className="stat-value">18</span>
            <span className="stat-key">WORKING SETS</span>
          </div>
          <div className="stat">
            <span className="stat-value accent">+4.1%</span>
            <span className="stat-key">VS PREVIOUS</span>
          </div>
        </div>
      </section>

      <p className="landing-section-label">BUILT FOR TRAINING</p>
      <ul className="feature-list">
        {features.map((f) => (
          <li key={f.name} className="feature-row">
            <span className="feature-name">{f.name}</span>
            <span className="feature-desc">{f.desc}</span>
          </li>
        ))}
      </ul>

      <p className="landing-footer">
        Quiet strength. Measurable progress. No distractions.
      </p>
    </main>
  );
}
