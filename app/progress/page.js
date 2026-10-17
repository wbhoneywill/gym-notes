'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { convertWeight } from '@/app/lib/metrics';
import HelpLink from '@/app/components/HelpLink';

function weekLabel(value) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

export default function ProgressPage() {
  const [muscleData, setMuscleData] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [points, setPoints] = useState([]);
  const [unit, setUnit] = useState('kg');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Values from the analytics API are canonical kg; convert for display.
  const toUnit = (kg) => Math.round(convertWeight(kg, 'kg', unit));

  useEffect(() => {
    (async () => {
      try {
        const [volRes, exRes, setRes] = await Promise.all([
          fetch('/api/analytics/volume-by-muscle?weeks=8'),
          fetch('/api/exercises'),
          fetch('/api/settings'),
        ]);
        if (volRes.status === 401 || exRes.status === 401) {
          setError('Please sign in to view your progress.');
          return;
        }
        if (!volRes.ok || !exRes.ok) {
          setError('Could not load progress.');
          return;
        }
        const volData = await volRes.json();
        const exData = await exRes.json();
        setMuscleData(volData.data ?? []);
        setExercises(exData.exercises ?? []);
        if (setRes.ok) {
          const setData = await setRes.json();
          setUnit(setData.settings?.preferred_unit ?? 'kg');
        }
      } catch {
        setError('Could not load progress.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadExercise(id) {
    setSelectedExercise(id);
    setPoints([]);
    if (!id) return;
    const res = await fetch(`/api/analytics/exercise/${id}`);
    if (res.ok) {
      const data = await res.json();
      setPoints(data.points ?? []);
    }
  }

  // Aggregate muscle volume across the window for a simple ranked bar view.
  const byMuscle = {};
  for (const row of muscleData) {
    byMuscle[row.muscle_group] = (byMuscle[row.muscle_group] || 0) + row.volume_kg;
  }
  const muscleTotals = Object.entries(byMuscle).sort((a, b) => b[1] - a[1]);
  const maxMuscle = muscleTotals.length ? muscleTotals[0][1] : 0;

  const maxPoint = points.reduce((m, p) => Math.max(m, p.volume_kg), 0);

  return (
    <main className="container">
      <header className="page-header"><p className="eyebrow">Analytics</p><h1 className="page-title">Progress</h1><p className="page-lead">Understand your training trends over time.</p><HelpLink topic="progress" /></header>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <section>
            <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
              Volume by muscle group
            </h2>
            <p className="meta" style={{ color: 'var(--text-dim)' }}>
              Last 8 weeks · working sets only · {unit}
            </p>
            {muscleTotals.length === 0 ? (
              <p>No training volume recorded yet.</p>
            ) : (
              <ul className="bar-list">
                {muscleTotals.map(([name, vol]) => (
                  <li key={name} className="bar-row">
                    <span className="bar-label">{name}</span>
                    <span className="bar-track">
                      <span
                        className="bar-fill"
                        style={{ width: `${maxMuscle ? (vol / maxMuscle) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="bar-value num">{toUnit(vol).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
              Exercise progression
            </h2>
            <div className="field">
              <label htmlFor="ex-select">Exercise</label>
              <select
                id="ex-select"
                value={selectedExercise}
                onChange={(e) => loadExercise(e.target.value)}
              >
                <option value="">— choose an exercise —</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedExercise && points.length === 0 && (
              <p className="meta">No recorded sets for this exercise yet.</p>
            )}

            {points.length > 0 && (
              <table className="set-table" style={{ marginTop: '0.5rem' }}>
                <thead>
                  <tr>
                    <th>date</th>
                    <th>volume {unit}</th>
                    <th>top {unit}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.session_id}>
                      <td style={{ textAlign: 'left' }}><Link href={`/history/${p.session_id}`}>{weekLabel(p.started_at)}</Link></td>
                      <td className="num">{toUnit(p.volume_kg).toLocaleString()}</td>
                      <td className="num">{toUnit(p.top_weight_kg)}</td>
                      <td style={{ width: '35%' }}>
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{
                              width: `${maxPoint ? (p.volume_kg / maxPoint) * 100 : 0}%`,
                            }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <p style={{ marginTop: '2rem' }}>
        <Link href="/dashboard">← Dashboard</Link>
      </p>
    </main>
  );
}
