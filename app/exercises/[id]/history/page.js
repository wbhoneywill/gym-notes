'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { convertWeight, formatWeight } from '@/app/lib/metrics';
import ExerciseBodyPreview from '@/app/components/ExerciseBodyPreview';
import ExerciseDemonstration from '@/app/components/ExerciseDemonstration';

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

export default function ExerciseHistoryPage({ params }) {
  const { id } = use(params);
  const [exercise, setExercise] = useState(null);
  const [points, setPoints] = useState([]);
  const [unit, setUnit] = useState('kg');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [historyRes, settingsRes] = await Promise.all([
          fetch(`/api/analytics/exercise/${id}`),
          fetch('/api/settings'),
        ]);
        if (historyRes.status === 401) {
          setError('Please sign in to view exercise history.');
          return;
        }
        if (historyRes.status === 404) {
          setError('Exercise not found.');
          return;
        }
        if (!historyRes.ok) {
          setError('Could not load exercise history.');
          return;
        }
        const historyData = await historyRes.json();
        setExercise(historyData.exercise);
        setPoints(historyData.points ?? []);
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setUnit(settingsData.settings?.preferred_unit ?? 'kg');
        }
      } catch {
        setError('Could not load exercise history.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <main className="container"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-card" /></main>;
  }

  if (error) {
    return <main className="container"><div className="notice notice-error" role="alert">{error}</div><Link href="/exercises">← Exercise library</Link></main>;
  }

  const latest = points.at(-1);
  const best = points.reduce((current, point) => (
    !current || point.top_weight_kg > current.top_weight_kg ? point : current
  ), null);
  const totalSets = points.reduce((sum, point) => sum + Number(point.set_count), 0);
  const displayVolume = (kg) => Math.round(convertWeight(kg, 'kg', unit)).toLocaleString();

  return (
    <main className="container exercise-history-page">
      <Link className="back-link" href="/exercises">← Exercise library</Link>
      <header className="page-header">
        <p className="eyebrow">Exercise history</p>
        <h1 className="page-title">{exercise.name}</h1>
        <p className="page-lead">Completed working sets across your workout history.</p>
      </header>

      <ExerciseBodyPreview exercise={exercise} compact />
      <ExerciseDemonstration exercise={exercise} />

      {points.length === 0 ? (
        <div className="empty-state exercise-history-empty">
          <strong>No completed performance yet</strong>
          <span>Add weight and reps, mark the set complete, then finish the workout.</span>
          <Link className="btn" href="/train">Start training</Link>
        </div>
      ) : (
        <>
          <section className="history-summary" aria-label="Exercise summary">
            <div><span>Sessions</span><strong>{points.length}</strong></div>
            <div><span>Working sets</span><strong>{totalSets}</strong></div>
            <div><span>Best weight</span><strong>{formatWeight(best.top_weight_kg, unit, { decimals: 1 })}</strong></div>
          </section>

          <div className="section-heading"><div><p className="eyebrow">Performance</p><h2>Session history</h2></div></div>
          <ol className="performance-list">
            {[...points].reverse().map((point, index) => (
              <li key={point.session_id} className={index === 0 ? 'latest' : ''}>
                <Link href={`/history/${point.session_id}`}>
                  <div className="performance-date"><span>{formatDate(point.started_at)}</span>{index === 0 && <small>Latest</small>}</div>
                  <strong>{point.session_name || 'Workout'}</strong>
                  <dl>
                    <div><dt>Top set</dt><dd>{formatWeight(point.top_weight_kg, unit, { decimals: 1 })} × {point.top_reps}</dd></div>
                    <div><dt>Volume</dt><dd>{displayVolume(point.volume_kg)} {unit}</dd></div>
                    <div><dt>Sets</dt><dd>{point.set_count}</dd></div>
                  </dl>
                  <span className="performance-arrow" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ol>

          {latest && <p className="history-footnote">Only completed, non-warm-up sets are included. Select a session to inspect every recorded set.</p>}
        </>
      )}
    </main>
  );
}
