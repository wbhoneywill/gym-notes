'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HelpLink from '@/app/components/HelpLink';
import { useAuth } from '@clerk/nextjs';
import useOfflineOwnerKey from '@/app/components/useOfflineOwnerKey';
import { canStartWorkout, offlineRecorderPath, shouldQueueOfflineStart } from '@/app/lib/offline-session';
import {
  createSyncChange,
  createWorkoutDraft,
  enqueueSyncChange,
  readTemplateCatalogue,
  writeExerciseCatalogue,
  writeTemplateCatalogue,
  writeWorkoutDraft,
} from '@/app/lib/workout-draft-store';

export default function StartTrainingPage() {
  const router = useRouter();
  const { isLoaded: authLoaded, userId } = useAuth();
  const ownerKey = useOfflineOwnerKey(userId, authLoaded);
  const [templates, setTemplates] = useState([]);
  const [inProgress, setInProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offlineMessage, setOfflineMessage] = useState(null);
  const [starting, setStarting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const startLockRef = useRef(false);

  async function load() {
    setLoading(true);
    setError(null);
    setOfflineMessage(null);
    try {
      const [tplRes, sessRes, exerciseRes] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/sessions?status=in_progress'),
        fetch('/api/exercises'),
      ]);
      if (tplRes.status === 401 || sessRes.status === 401) {
        setError('Please sign in to start training.');
        return;
      }
      const tplData = await tplRes.json();
      const sessData = await sessRes.json();
      const exerciseData = exerciseRes.ok ? await exerciseRes.json() : { exercises: [] };
      const summaries = tplData.templates ?? [];
      const existingCached = ownerKey ? await readTemplateCatalogue(ownerKey).catch(() => []) : [];
      const detailedTemplates = await Promise.all(summaries.map(async (summary) => {
        try {
          const response = await fetch(`/api/templates/${summary.id}`);
          if (!response.ok) return existingCached.find((template) => template.id === summary.id) ?? { ...summary, exercises: [] };
          const data = await response.json();
          return { ...summary, ...data.template, exercise_count: data.template.exercises?.length ?? 0 };
        } catch {
          return existingCached.find((template) => template.id === summary.id) ?? { ...summary, exercises: [] };
        }
      }));
      setTemplates(detailedTemplates);
      if (ownerKey) await writeTemplateCatalogue(ownerKey, detailedTemplates);
      if (ownerKey && exerciseRes.ok) await writeExerciseCatalogue(ownerKey, exerciseData.exercises ?? []);
      setInProgress(sessData.sessions ?? []);
    } catch {
      const cachedTemplates = ownerKey ? await readTemplateCatalogue(ownerKey).catch(() => []) : [];
      setTemplates(cachedTemplates);
      if (ownerKey) {
        setError(null);
        setOfflineMessage(cachedTemplates.length
          ? 'Offline · showing plans saved on this device.'
          : 'Offline · you can start a blank workout. Plans appear after they have been opened online.');
      } else {
        setError('Open GymNotes while signed in and online once to prepare offline workouts.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [ownerKey]);

  useEffect(() => {
    const updateConnectivity = () => setIsOnline(navigator.onLine);
    updateConnectivity();
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  async function start(templateId) {
    if (startLockRef.current) return;
    if (!canStartWorkout({ online: isOnline, ownerKey })) {
      setError('Open GymNotes once while signed in and online before starting an offline workout.');
      return;
    }
    startLockRef.current = true;
    setStarting(true);
    setError(null);
    const sessionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateId ? { id: sessionId, template_id: templateId } : { id: sessionId }),
      });
      if (!res.ok) {
        if (shouldQueueOfflineStart({ status: res.status, online: navigator.onLine, ownerKey })) throw new TypeError('retryable');
        setError('Could not start the session.');
        return;
      }
      const data = await res.json();
      router.push(`/train/${data.session.id}`);
    } catch {
      if (ownerKey) {
        const cachedTemplate = templateId ? templates.find((template) => template.id === templateId && Array.isArray(template.exercises)) : null;
        if (templateId && !cachedTemplate) {
          setError('Open this plan online once before starting it offline.');
          return;
        }
        const localExercises = (cachedTemplate?.exercises ?? []).map((exercise) => ({
          id: crypto.randomUUID(),
          exercise_id: exercise.exercise_id,
          exercise_name: exercise.exercise_name,
          primary_muscle_group: exercise.primary_muscle_group,
          position: exercise.position,
          skipped: false,
          target_sets: exercise.target_sets,
          target_rep_min: exercise.target_rep_min,
          target_rep_max: exercise.target_rep_max,
          target_weight: exercise.target_weight,
          rest_seconds: exercise.rest_seconds,
          sets: [],
        }));
        const localSession = { id: sessionId, name: cachedTemplate?.name ?? null, template_id: templateId ?? null, status: 'in_progress', started_at: startedAt, finished_at: null, exercises: localExercises };
        try {
          await writeWorkoutDraft(createWorkoutDraft(localSession, {}, Date.now(), `${ownerKey}:${sessionId}`));
          const baseTime = Date.now();
          await enqueueSyncChange(createSyncChange(ownerKey, 'session.create', { sessionId }, { name: localSession.name, template_id: templateId ?? null, started_at: startedAt }, baseTime));
          for (const [index, exercise] of localExercises.entries()) {
            await enqueueSyncChange(createSyncChange(ownerKey, 'session_exercise.create', {
              sessionId,
              sessionExerciseId: exercise.id,
            }, {
              exercise_id: exercise.exercise_id,
              exercise_name: exercise.exercise_name,
              primary_muscle_group: exercise.primary_muscle_group,
              position: exercise.position,
              target_sets: exercise.target_sets,
              target_rep_min: exercise.target_rep_min,
              target_rep_max: exercise.target_rep_max,
              target_weight: exercise.target_weight,
              rest_seconds: exercise.rest_seconds,
            }, baseTime + index + 1));
          }
          window.dispatchEvent(new Event('gymnotes:sync-request'));
          router.push(offlineRecorderPath(sessionId));
          return;
        } catch {
          setError('Could not save the workout on this device.');
        }
      } else setError('Could not start the session.');
    } finally {
      startLockRef.current = false;
      setStarting(false);
    }
  }

  return (
    <main className="container">
      <header className="page-header"><p className="eyebrow">Session</p><h1 className="page-title">Start training</h1><p className="page-lead">Pick up where you left off or begin something new.</p><HelpLink topic="training" /></header>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {offlineMessage && <div className="notice" role="status">{offlineMessage}</div>}

      {inProgress.length > 0 && (
        <section>
          <div className="section-heading"><div><p className="eyebrow">In progress</p><h2>Resume</h2></div><span className="status-dot">Live</span></div>
          <ul className="exercise-list">
            {inProgress.map((s) => (
              <li key={s.id} className="exercise-item session-list-card">
                <span className="name">
                  <Link href={`/train/${s.id}`}>
                    {s.name || 'Workout'}
                  </Link>
                </span>
                <span className="meta">
                  In progress · {s.exercise_count} exercises
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="start-blank-panel">
        <button
          className="btn"
          type="button"
          disabled={starting || !canStartWorkout({ online: isOnline, ownerKey })}
          onClick={() => start(null)}
        >
          <span>Start a blank workout</span><span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="content-section">
        <div className="section-heading"><div><p className="eyebrow">Your plans</p><h2>From a template</h2></div></div>
        {loading ? (
          <p>Loading…</p>
        ) : templates.length === 0 ? (
          <p>
            No templates yet. <Link href="/templates">Create one</Link>.
          </p>
        ) : (
          <ul className="exercise-list">
            {templates.map((t) => (
              <li key={t.id} className="exercise-item template-launch-card">
                <span className="name">{t.name}</span>
                <span className="meta">{t.exercise_count} exercises</span>
                <span className="meta">Saved for offline start</span>
                <div className="card-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={starting || !canStartWorkout({ online: isOnline, ownerKey })}
                    onClick={() => start(t.id)}
                  >
                    Start <span aria-hidden="true">→</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
