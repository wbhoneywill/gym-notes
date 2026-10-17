'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { convertWeight, formatWeight, totalVolume, workingSetCount } from '@/app/lib/metrics';
import ExerciseBodyPreview from '@/app/components/ExerciseBodyPreview';
import { formatRestTime } from '@/app/lib/rest-timer';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatVolume(valueKg, unit) {
  return `${Math.round(convertWeight(valueKg, 'kg', unit)).toLocaleString()} ${unit} volume`;
}

function formatShortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function workoutLabel(reference, fallback = 'Workout') {
  if (!reference) return fallback;
  const date = formatShortDate(reference.started_at);
  return `${reference.session_name || fallback}${date ? ` · ${date}` : ''}`;
}

function recordCopy(record, unit) {
  if (record.type === 'heaviest_set') {
    return {
      label: 'Heaviest completed set',
      previous: `${formatWeight(record.previous_weight_kg, unit, { decimals: 1 })} × ${record.previous_reps}`,
      current: `${formatWeight(record.weight_kg, unit, { decimals: 1 })} × ${record.reps}`,
      note: 'Build confidence at this load before adding more.',
    };
  }
  if (record.type === 'reps_at_weight') {
    return {
      label: 'Most reps at this weight',
      previous: `${record.previous_reps} reps at ${formatWeight(record.weight_kg, unit, { decimals: 1 })}`,
      current: `${record.reps} reps at ${formatWeight(record.weight_kg, unit, { decimals: 1 })}`,
      note: `Up from ${record.previous_reps} reps at the same load.`,
    };
  }
  return {
    label: 'Best set volume',
    previous: formatVolume(record.previous_volume_kg, unit),
    current: formatVolume(record.volume_kg, unit),
    note: `${formatWeight(record.weight_kg, unit, { decimals: 1 })} × ${record.reps} controlled reps.`,
  };
}

export default function HistorySessionPage({ params }) {
  const { id } = use(params);
  const [session, setSession] = useState(null);
  const [unit, setUnit] = useState('kg');
  const [achievements, setAchievements] = useState({ records: [], workoutRecord: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (res.status === 401) {
          setError('Please sign in.');
          return;
        }
        if (res.status === 404) {
          setError('Session not found.');
          return;
        }
        if (!res.ok) {
          setError('Could not load the session.');
          return;
        }
        const data = await res.json();
        setSession(data.session);
        const [setRes, recordsRes] = await Promise.all([
          fetch('/api/settings'),
          fetch(`/api/sessions/${id}/records`),
        ]);
        if (setRes.ok) {
          const setData = await setRes.json();
          setUnit(setData.settings?.preferred_unit ?? 'kg');
        }
        if (recordsRes.ok) {
          const recordsData = await recordsRes.json();
          setAchievements({
            records: recordsData.records ?? [],
            workoutRecord: recordsData.workoutRecord ?? null,
          });
        }
      } catch {
        setError('Could not load the session.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <main className="container">
        <p>Loading…</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="container">
        <div className="notice notice-error" role="alert">
          {error}
        </div>
        <Link href="/history">← Back to history</Link>
      </main>
    );
  }

  const sessionVolume = session.exercises.reduce(
    (sum, ex) => sum + totalVolume(ex.sets, unit),
    0
  );

  return (
    <main className="container">
      <Link href="/history">← History</Link>
      <h1 className="page-title" style={{ marginTop: '0.5rem' }}>
        {session.name || 'Workout'}
      </h1>
      <p className="meta" style={{ opacity: 0.7 }}>
        {formatDate(session.finished_at || session.started_at)} ·{' '}
        {session.status}
      </p>
      <p className="meta" style={{ opacity: 0.7 }}>
        Total working volume: {Math.round(sessionVolume).toLocaleString()} {unit}
      </p>

      {(achievements.workoutRecord || achievements.records.length > 0) && (
        <section className="personal-records-panel" aria-labelledby="personal-records-heading">
          <div className="personal-records-heading">
            <div>
              <span className="eyebrow">Personal records</span>
              <h2 id="personal-records-heading">New bests</h2>
            </div>
            <span className="personal-records-mark" aria-hidden="true">↗</span>
          </div>
          <p className="personal-records-guidance">
            Progress from completed working sets. Keep technique controlled—this is not a prompt to
            attempt a maximum.
          </p>
          <div className="personal-records-grid">
            {achievements.workoutRecord && (
              <article className="personal-record-card">
                <span>Highest workout volume</span>
                <div className="personal-record-comparison">
                  <div>
                    <small>Previous best</small>
                    <strong>{formatVolume(achievements.workoutRecord.previous_volume_kg, unit)}</strong>
                    {achievements.workoutRecord.previous_session?.session_id ? (
                      <Link href={`/history/${achievements.workoutRecord.previous_session.session_id}`}>
                        {workoutLabel(achievements.workoutRecord.previous_session)}
                      </Link>
                    ) : <em>Earlier workout</em>}
                  </div>
                  <b aria-hidden="true">→</b>
                  <div className="improved">
                    <small>This workout</small>
                    <strong>{formatVolume(achievements.workoutRecord.volume_kg, unit)}</strong>
                    <em>{workoutLabel(achievements.workoutRecord.current_session, session.name || 'Workout')}</em>
                  </div>
                </div>
              </article>
            )}
            {achievements.records.map((record) => {
              const copy = recordCopy(record, unit);
              return (
                <article
                  className="personal-record-card"
                  key={`${record.type}-${record.exercise_id}`}
                >
                  <span>{record.exercise_name} · {copy.label}</span>
                  <div className="personal-record-comparison">
                    <div>
                      <small>Previous best</small>
                      <strong>{copy.previous}</strong>
                      {record.previous_session?.session_id ? (
                        <Link href={`/history/${record.previous_session.session_id}`}>
                          {workoutLabel(record.previous_session)}
                        </Link>
                      ) : <em>Earlier workout</em>}
                    </div>
                    <b aria-hidden="true">→</b>
                    <div className="improved">
                      <small>This workout</small>
                      <strong>{copy.current}</strong>
                      <em>{workoutLabel(record, session.name || 'Workout')}</em>
                    </div>
                  </div>
                  <small className="personal-record-note">{copy.note}</small>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {session.exercises.length === 0 ? (
        <p>No exercises were recorded.</p>
      ) : (
        session.exercises.map((ex) => {
          const completedSets = ex.sets.filter((s) => s.completed);
          const recordedRests = completedSets
            .filter((set) => set.rest_duration_seconds !== null && set.rest_duration_seconds !== undefined)
            .map((set) => Number(set.rest_duration_seconds))
            .filter((seconds) => Number.isFinite(seconds));
          const averageRest = recordedRests.length
            ? Math.round(recordedRests.reduce((sum, seconds) => sum + seconds, 0) / recordedRests.length)
            : null;
          return (
            <section
              key={ex.id}
              className="exercise-item"
              style={{ marginBottom: '1rem', opacity: ex.skipped ? 0.5 : 1 }}
            >
              <div className="name">
                {ex.exercise_name}
                {ex.skipped && <span className="badge">skipped</span>}
              </div>
              <ExerciseBodyPreview exercise={ex} compact />
              <div className="meta">
                {[
                  `${workingSetCount(ex.sets)} working sets`,
                  `${Math.round(totalVolume(ex.sets, unit)).toLocaleString()} ${unit} volume`,
                  averageRest === null ? null : `${formatRestTime(averageRest)} average rest`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>

              {completedSets.length === 0 ? (
                <p className="meta">No completed sets.</p>
              ) : (
                <table className="set-table" style={{ marginTop: '0.5rem' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>weight</th>
                      <th>reps</th>
                      <th>type</th>
                      <th>rest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ex.sets.map((s, idx) => (
                      <tr key={s.id} style={{ opacity: s.completed ? 1 : 0.5 }}>
                        <td>{idx + 1}</td>
                        <td>
                          {s.weight ?? '-'} {s.weight_unit}
                        </td>
                        <td>{s.reps ?? '-'}</td>
                        <td>{s.set_type === 'warmup' ? 'warm-up' : 'working'}</td>
                        <td>
                          {s.rest_duration_seconds === null || s.rest_duration_seconds === undefined
                            ? '—'
                            : `${formatRestTime(s.rest_duration_seconds)}${s.planned_rest_seconds ? ` / ${formatRestTime(s.planned_rest_seconds)}` : ''}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
