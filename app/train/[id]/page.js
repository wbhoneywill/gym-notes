'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import useOfflineOwnerKey from '@/app/components/useOfflineOwnerKey';
import GroupedExerciseOptions from '@/app/components/GroupedExerciseOptions';
import ExerciseBodyPreview from '@/app/components/ExerciseBodyPreview';
import ExerciseDemonstration from '@/app/components/ExerciseDemonstration';
import { recordedIncompleteSets } from '@/app/lib/workout-session';
import {
  createWorkoutDraft,
  createSyncChange,
  deleteWorkoutDraft,
  enqueueSyncChange,
  hasDirtyWorkoutInputs,
  listSyncChanges,
  readExerciseCatalogue,
  mergeWorkoutDraft,
  readWorkoutDraft,
  withDraftSetPatch,
  withoutDraftSetFields,
  writeWorkoutDraft,
  writeExerciseCatalogue,
} from '@/app/lib/workout-draft-store';
import { applyPendingSetChanges } from '@/app/lib/sync-change';
import { canLoadRecorder, canUseOfflineDraft, offlineSessionIdFromSearch } from '@/app/lib/offline-session';
import {
  REST_TIMER_STORAGE_PREFIX,
  createRestTimer,
  elapsedRestSeconds,
  formatRestTime,
  remainingRestSeconds,
  restProgress,
} from '@/app/lib/rest-timer';

const REST_OPTIONS = [30, 60, 90, 120, 180, 300];

function formatPrevious(previous) {
  if (previous === undefined) return 'Loading previous performance…';
  if (previous === null) return 'No previous performance yet';
  const sets = previous.sets.filter((set) => set.completed).map((set) => `${set.weight ?? '–'} × ${set.reps ?? '–'}`).join('  ·  ');
  const recordedRests = previous.sets
    .filter((set) => set.rest_duration_seconds !== null && set.rest_duration_seconds !== undefined)
    .map((set) => Number(set.rest_duration_seconds))
    .filter((seconds) => Number.isFinite(seconds));
  const averageRest = recordedRests.length
    ? Math.round(recordedRests.reduce((sum, seconds) => sum + seconds, 0) / recordedRests.length)
    : null;
  const performance = sets || 'No completed sets last time';
  return averageRest === null ? performance : `${performance}  ·  Rest avg ${formatRestTime(averageRest)}`;
}

export default function LiveSessionPage({ params }) {
  const { id: routeId } = use(params);
  const [offlineSessionId, setOfflineSessionId] = useState(null);
  const id = routeId === 'offline' ? offlineSessionId : routeId;
  const router = useRouter();
  const { isLoaded: authLoaded, userId } = useAuth();
  const ownerKey = useOfflineOwnerKey(userId, authLoaded);
  const [session, setSession] = useState(null);
  const [allExercises, setAllExercises] = useState([]);
  const [previous, setPrevious] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offlineMessage, setOfflineMessage] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [addExerciseId, setAddExerciseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [restTimer, setRestTimer] = useState(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [localOnly, setLocalOnly] = useState(false);
  const [draftStatus, setDraftStatus] = useState(null);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const timerAlertedRef = useRef(false);
  const draftRef = useRef(null);
  const draftHydratedRef = useRef(false);
  const recoveryQueuedRef = useRef(false);
  const restStorageKey = `${REST_TIMER_STORAGE_PREFIX}${id}`;
  const draftStorageKey = ownerKey && id ? `${ownerKey}:${id}` : null;
  const selectedExerciseDetails = allExercises.find((exercise) => exercise.id === addExerciseId) ?? null;

  useEffect(() => {
    if (routeId !== 'offline') return;
    setOfflineSessionId(offlineSessionIdFromSearch(window.location.search));
  }, [routeId]);

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    updateConnectivity();
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    let savedDraft = null;
    let pendingChanges = [];
    let cachedExercises = [];
    function useLocalSession(saved, changes, exercises) {
      draftRef.current = saved;
      const localSession = applyPendingSetChanges(saved.sessionSnapshot, changes);
      setSession(localSession);
      setAllExercises(exercises);
      setLocalOnly(true);
      setDraftStatus('offline');
      setError(null);
      setOfflineMessage('Offline · this workout is saved on this device and will sync when you reconnect.');
      return localSession;
    }

    try {
      savedDraft = draftStorageKey ? await readWorkoutDraft(draftStorageKey) : null;
      pendingChanges = ownerKey ? await listSyncChanges(ownerKey) : [];
      cachedExercises = ownerKey ? await readExerciseCatalogue(ownerKey) : [];
    } catch {
      setDraftStatus('unavailable');
    }
    try {
      let responses;
      try {
        responses = await Promise.all([fetch(`/api/sessions/${id}`), fetch('/api/exercises')]);
      } catch (networkError) {
        if (savedDraft?.sessionSnapshot?.status === 'in_progress') {
          return useLocalSession(savedDraft, pendingChanges, cachedExercises);
        }
        throw networkError;
      }
      const [sessRes, exRes] = responses;
      if (canUseOfflineDraft({
        online: navigator.onLine,
        sessionStatus: sessRes.status,
        exerciseStatus: exRes.status,
        hasDraft: savedDraft?.sessionSnapshot?.status === 'in_progress',
      })) {
        return useLocalSession(savedDraft, pendingChanges, cachedExercises);
      }
      if (sessRes.status === 401) throw new Error('Please sign in.');
      if (sessRes.status === 404 && savedDraft?.sessionSnapshot && pendingChanges.some((change) => change.operation === 'session.create' && change.entity.sessionId === id)) {
        const localSession = applyPendingSetChanges(savedDraft.sessionSnapshot, pendingChanges);
        setSession(localSession);
        setAllExercises(cachedExercises);
        setLocalOnly(true);
        setDraftStatus('offline');
        setError('This workout is saved on this device and will be created on the server when synchronization succeeds.');
        return localSession;
      }
      if (sessRes.status === 404) throw new Error('Session not found.');
      if (!sessRes.ok || !exRes.ok) throw new Error('Could not load the session.');
      const sessData = await sessRes.json();
      const exData = await exRes.json();
      if (sessData.session.status !== 'in_progress') {
        await deleteWorkoutDraft(draftStorageKey).catch(() => {});
        savedDraft = null;
      }
      const recovered = mergeWorkoutDraft(sessData.session, savedDraft);
      const nextSession = applyPendingSetChanges(recovered.session, pendingChanges);
      setSession(nextSession);
      setAllExercises(exData.exercises ?? []);
      if (ownerKey) writeExerciseCatalogue(ownerKey, exData.exercises ?? []).catch(() => {});
      setLocalOnly(false);
      setError(null);
      setOfflineMessage(null);
      if (nextSession.status === 'in_progress') {
        const nextDraft = createWorkoutDraft(nextSession, savedDraft?.dirtySets ?? {}, Date.now(), draftStorageKey);
        draftRef.current = nextDraft;
        await writeWorkoutDraft(nextDraft).catch(() => setDraftStatus('unavailable'));
      }
      if (!draftHydratedRef.current && recovered.recoveredSetCount > 0) {
        setDraftStatus('recovered');
        if (!recoveryQueuedRef.current && ownerKey) {
          recoveryQueuedRef.current = true;
          for (const [setId, saved] of Object.entries(savedDraft?.dirtySets ?? {})) {
            const payload = Object.fromEntries(
              Object.entries(saved).filter(([field]) => field === 'weight' || field === 'reps')
            );
            if (Object.keys(payload).length) {
              enqueueSyncChange(createSyncChange(ownerKey, 'set.patch', {
                sessionId: id,
                sessionExerciseId: saved.sessionExerciseId,
                setId,
              }, payload)).then(() => window.dispatchEvent(new Event('gymnotes:sync-request'))).catch(() => setDraftStatus('unavailable'));
            }
          }
        }
      } else if (hasDirtyWorkoutInputs(savedDraft)) {
        setDraftStatus('local');
      } else if (draftStatus !== 'unavailable') {
        setDraftStatus(null);
      }
      draftHydratedRef.current = true;
      return nextSession;
    } catch (err) {
      setError(err.message || 'Could not load the session.');
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function loadPrevious(exercises) {
    const entries = await Promise.all(exercises.map(async (exercise) => {
      try {
        const res = await fetch(`/api/sessions/${id}/exercises/${exercise.id}/previous`);
        if (!res.ok) return [exercise.id, null];
        const data = await res.json();
        return [exercise.id, data.previous];
      } catch {
        return [exercise.id, null];
      }
    }));
    setPrevious(Object.fromEntries(entries));
  }

  useEffect(() => {
    if (!canLoadRecorder({ sessionId: id, authLoaded, ownerKey, online })) return undefined;
    let active = true;
    load().then((loaded) => { if (active && loaded) loadPrevious(loaded.exercises); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, authLoaded, ownerKey, online]);

  useEffect(() => {
    if (canLoadRecorder({ sessionId: id, authLoaded, ownerKey, online })) return undefined;
    const timeout = window.setTimeout(() => {
      setLoading(false);
      setError('This workout is not available offline on this device. Reconnect, then try again.');
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [id, authLoaded, ownerKey, online]);

  useEffect(() => {
    const onSyncComplete = () => load({ quiet: true });
    window.addEventListener('gymnotes:sync-complete', onSyncComplete);
    return () => window.removeEventListener('gymnotes:sync-complete', onSyncComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ownerKey]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(restStorageKey));
      if (saved?.startedAt && saved?.setId && saved?.durationSeconds > 0) {
        timerAlertedRef.current = false;
        setRestTimer({ ...saved, completed: saved.endsAt <= Date.now() });
        setTimerNow(Date.now());
      } else {
        window.localStorage.removeItem(restStorageKey);
      }
    } catch {
      window.localStorage.removeItem(restStorageKey);
    }
  }, [restStorageKey]);

  useEffect(() => {
    if (!restTimer) return undefined;

    function announceCompletion() {
      if (timerAlertedRef.current) return;
      timerAlertedRef.current = true;
      if ('vibrate' in navigator) navigator.vibrate([180, 100, 260]);
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.45);
          oscillator.addEventListener('ended', () => context.close());
        }
      } catch {
        // The visual and vibration alerts remain available when audio is blocked.
      }
    }

    function tick() {
      const currentTime = Date.now();
      setTimerNow(currentTime);
      if (remainingRestSeconds(restTimer.endsAt, currentTime) === 0) {
        if (!restTimer.completed) {
          announceCompletion();
          setRestTimer((current) => {
            if (!current) return null;
            const completedTimer = { ...current, completed: true };
            window.localStorage.setItem(restStorageKey, JSON.stringify(completedTimer));
            return completedTimer;
          });
        }
      }
    }

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [restStorageKey, restTimer?.completed, restTimer?.endsAt]);

  async function queueChange(change) {
    if (!change || !userId) return false;
    try {
      await enqueueSyncChange(createSyncChange(userId, change.operation, change.entity, change.payload));
      setDraftStatus('local');
      setFeedback('Saved on this device · waiting to sync');
      window.dispatchEvent(new Event('gymnotes:sync-request'));
      return true;
    } catch {
      setDraftStatus('unavailable');
      return false;
    }
  }

  async function persistSessionSnapshot(nextSession) {
    if (!draftStorageKey) return;
    const nextDraft = createWorkoutDraft(
      nextSession,
      draftRef.current?.dirtySets ?? {},
      Date.now(),
      draftStorageKey
    );
    draftRef.current = nextDraft;
    await writeWorkoutDraft(nextDraft).catch(() => setDraftStatus('unavailable'));
  }

  async function mutate(url, options, message, offlineChange = null) {
    setSaving(true);
    setError(null);
    let retryable = true;
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        retryable = res.status >= 500;
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'That change could not be saved.');
      }
      setFeedback(message);
      window.setTimeout(() => setFeedback(null), 1800);
      const refreshed = await load({ quiet: true });
      if (refreshed) await loadPrevious(refreshed.exercises);
      return true;
    } catch (err) {
      if (retryable && offlineChange && await queueChange(offlineChange)) return 'queued';
      setError(err.message || 'That change could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addSet(seId) {
    const exercise = session.exercises.find((item) => item.id === seId);
    if (!exercise) return;
    const setId = crypto.randomUUID();
    const set = {
      id: setId,
      session_exercise_id: seId,
      set_order: exercise.sets.length,
      weight: null,
      reps: null,
      completed: false,
      weight_unit: 'kg',
      set_type: 'working',
    };
    const nextSession = {
      ...session,
      exercises: session.exercises.map((item) => item.id === seId
        ? { ...item, sets: [...item.sets, set] }
        : item),
    };
    setSession(nextSession);
    await persistSessionSnapshot(nextSession);
    const payload = { set_order: set.set_order, weight_unit: set.weight_unit, set_type: set.set_type };
    const result = await mutate(
      `/api/sessions/${id}/exercises/${seId}/sets`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: setId, ...payload }) },
      'Set added',
      { operation: 'set.create', entity: { sessionId: id, sessionExerciseId: seId, setId }, payload }
    );
    if (!result) await load({ quiet: true });
  }
  async function updateSet(seId, setId, patch) {
    const ok = await mutate(
      `/api/sessions/${id}/exercises/${seId}/sets/${setId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) },
      patch.completed !== undefined ? (patch.completed ? 'Set completed' : 'Set reopened') : 'Set saved',
      { operation: 'set.patch', entity: { sessionId: id, sessionExerciseId: seId, setId }, payload: patch }
    );
    const savedFields = Object.keys(patch).filter((field) => field === 'weight' || field === 'reps');
    if (ok === true && savedFields.length && draftRef.current) {
      const nextDraft = withoutDraftSetFields(draftRef.current, setId, savedFields);
      draftRef.current = nextDraft;
      setDraftStatus(hasDirtyWorkoutInputs(nextDraft) ? 'local' : null);
      await writeWorkoutDraft(nextDraft).catch(() => setDraftStatus('unavailable'));
    }
    return ok;
  }

  async function deleteSet(seId, setId) {
    const nextSession = {
      ...session,
      exercises: session.exercises.map((exercise) => exercise.id === seId
        ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) }
        : exercise),
    };
    setSession(nextSession);
    await persistSessionSnapshot(nextSession);
    const ok = await mutate(
      `/api/sessions/${id}/exercises/${seId}/sets/${setId}`,
      { method: 'DELETE' },
      'Set removed',
      { operation: 'set.delete', entity: { sessionId: id, sessionExerciseId: seId, setId }, payload: {} }
    );
    if (ok && draftRef.current) {
      const fields = Object.keys(draftRef.current.dirtySets?.[setId] ?? {}).filter((field) => field !== 'sessionExerciseId');
      const nextDraft = withoutDraftSetFields(draftRef.current, setId, fields);
      draftRef.current = nextDraft;
      await writeWorkoutDraft(nextDraft).catch(() => setDraftStatus('unavailable'));
    }
    if (!ok) await load({ quiet: true });
    return ok;
  }

  function updateSetLocally(seId, setId, patch) {
    const nextSession = {
      ...session,
      exercises: session.exercises.map((exercise) => exercise.id === seId
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set),
          }
        : exercise),
    };
    setSession(nextSession);
    const hasInputPatch = Object.keys(patch).some((field) => field === 'weight' || field === 'reps');
    if (hasInputPatch && !isDone) {
      const nextDraft = withDraftSetPatch(draftRef.current, nextSession, seId, setId, patch, Date.now(), draftStorageKey);
      draftRef.current = nextDraft;
      setDraftStatus(localOnly ? 'offline' : 'local');
      writeWorkoutDraft(nextDraft).catch(() => setDraftStatus('unavailable'));
    }
  }

  function saveRestTimer(timer) {
    timerAlertedRef.current = false;
    setTimerNow(Date.now());
    setRestTimer(timer);
    try {
      window.localStorage.setItem(restStorageKey, JSON.stringify(timer));
    } catch {
      // The timer still works for this open page when storage is unavailable.
    }
  }

  function startRestTimer(exercise, set) {
    const timer = createRestTimer(exercise, set);
    if (timer) saveRestTimer(timer);
  }

  function dismissRestTimer() {
    window.localStorage.removeItem(restStorageKey);
    setRestTimer(null);
  }

  function addRestTime(seconds = 30) {
    if (!restTimer) return;
    const addedSeconds = Math.min(seconds, 3600 - restTimer.durationSeconds);
    if (addedSeconds <= 0) return;
    const timer = {
      ...restTimer,
      completed: false,
      endsAt: Math.max(restTimer.endsAt, Date.now()) + addedSeconds * 1000,
      durationSeconds: restTimer.durationSeconds + addedSeconds,
    };
    saveRestTimer(timer);
  }

  async function recordRest(outcome) {
    if (!restTimer) return;
    const actualSeconds = elapsedRestSeconds(restTimer.startedAt);
    const resolvedOutcome = outcome === 'skipped'
      ? 'skipped'
      : actualSeconds < restTimer.durationSeconds ? 'started_early' : 'completed';
    const ok = await mutate(
      `/api/sessions/${id}/exercises/${restTimer.exerciseId}/sets/${restTimer.setId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planned_rest_seconds: restTimer.durationSeconds,
          rest_duration_seconds: actualSeconds,
          rest_outcome: resolvedOutcome,
        }),
      },
      resolvedOutcome === 'skipped' ? 'Rest skipped and recorded' : 'Rest time recorded',
      {
        operation: 'set.patch',
        entity: { sessionId: id, sessionExerciseId: restTimer.exerciseId, setId: restTimer.setId },
        payload: {
          planned_rest_seconds: restTimer.durationSeconds,
          rest_duration_seconds: actualSeconds,
          rest_outcome: resolvedOutcome,
        },
      }
    );
    if (ok) dismissRestTimer();
  }

  async function handleSetCompletion(exercise, set, completed) {
    updateSetLocally(exercise.id, set.id, { completed });
    const ok = await updateSet(exercise.id, set.id, { completed });
    if (!ok) {
      updateSetLocally(exercise.id, set.id, { completed: !completed });
      return;
    }
    if (completed) startRestTimer(exercise, set);
  }

  async function setRestDuration(exercise, value) {
    const restSeconds = value === '' ? null : Number(value);
    const nextSession = {
      ...session,
      exercises: session.exercises.map((item) => item.id === exercise.id
        ? { ...item, rest_seconds: restSeconds }
        : item),
    };
    setSession(nextSession);
    await persistSessionSnapshot(nextSession);
    const ok = await mutate(
      `/api/sessions/${id}/exercises/${exercise.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rest_seconds: restSeconds }),
      },
      restSeconds ? `Rest timer set to ${formatRestTime(restSeconds)}` : 'Rest timer turned off',
      {
        operation: 'session_exercise.patch',
        entity: { sessionId: id, sessionExerciseId: exercise.id },
        payload: { rest_seconds: restSeconds },
      }
    );
    if (!ok) await load({ quiet: true });
  }

  async function addExercise(event) {
    event.preventDefault();
    if (!addExerciseId || !selectedExerciseDetails) return;
    const sessionExerciseId = crypto.randomUUID();
    const payload = {
      exercise_id: addExerciseId,
      position: session.exercises.length,
      exercise_name: selectedExerciseDetails.name,
      primary_muscle_group: selectedExerciseDetails.primary_muscle_group,
    };
    const localExercise = { id: sessionExerciseId, ...payload, skipped: false, rest_seconds: null, sets: [] };
    const nextSession = { ...session, exercises: [...session.exercises, localExercise] };
    setSession(nextSession);
    await persistSessionSnapshot(nextSession);
    const ok = await mutate(
      `/api/sessions/${id}/exercises`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sessionExerciseId, exercise_id: addExerciseId, position: payload.position }) },
      'Exercise added',
      { operation: 'session_exercise.create', entity: { sessionId: id, sessionExerciseId }, payload }
    );
    if (ok) setAddExerciseId('');
    else await load({ quiet: true });
  }

  const toggleSkip = (seId, skipped) => mutate(`/api/sessions/${id}/exercises/${seId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skipped: !skipped }) }, skipped ? 'Exercise restored' : 'Exercise skipped');

  async function removeExercise(seId) {
    if (!window.confirm('Remove this exercise and all of its sets from this workout?')) return;
    const nextSession = { ...session, exercises: session.exercises.filter((exercise) => exercise.id !== seId) };
    setSession(nextSession);
    await persistSessionSnapshot(nextSession);
    const result = await mutate(
      `/api/sessions/${id}/exercises/${seId}`,
      { method: 'DELETE' },
      'Exercise removed',
      { operation: 'session_exercise.delete', entity: { sessionId: id, sessionExerciseId: seId }, payload: {} }
    );
    if (!result) await load({ quiet: true });
    return result;
  }

  async function finish(status) {
    const verb = status === 'completed' ? 'finish' : 'abandon';
    const setsToComplete = status === 'completed'
      ? recordedIncompleteSets(session.exercises)
      : [];
    const confirmation = setsToComplete.length > 0
      ? `${setsToComplete.length} recorded ${setsToComplete.length === 1 ? 'set is' : 'sets are'} not marked Done. Mark ${setsToComplete.length === 1 ? 'it' : 'them'} complete and finish this workout?`
      : `Are you sure you want to ${verb} this workout?`;
    if (!window.confirm(confirmation)) return;
    for (const set of setsToComplete) {
      updateSetLocally(set.sessionExerciseId, set.id, { completed: true });
      const result = await updateSet(set.sessionExerciseId, set.id, {
        weight: set.weight,
        reps: set.reps,
        completed: true,
      });
      if (!result) {
        setError('Could not save every recorded set. The workout was left open.');
        return;
      }
    }

    const result = await mutate(
      `/api/sessions/${id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) },
      status === 'completed' ? 'Workout finished' : 'Workout abandoned',
      { operation: 'session.patch', entity: { sessionId: id }, payload: { status } }
    );
    if (!result) return;
    if (result === 'queued') {
      const completedIds = new Set(setsToComplete.map((set) => set.id));
      const nextSession = {
        ...session,
        status,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => completedIds.has(set.id) ? { ...set, completed: true } : set),
        })),
      };
      setSession(nextSession);
      await persistSessionSnapshot(nextSession);
      dismissRestTimer();
      setFeedback(status === 'completed' ? 'Finish saved locally · waiting to sync' : 'Workout saved locally · waiting to sync');
      return;
    }
    try {
      if (draftStorageKey) await deleteWorkoutDraft(draftStorageKey).catch(() => {});
      draftRef.current = null;
      dismissRestTimer();
      router.push(status === 'completed' ? `/history/${id}` : '/train');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <main className="container"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-card" /></main>;
  if (error && !session) return <main className="container"><div className="notice notice-error" role="alert">{error}</div><Link href="/train">← Back to training</Link></main>;

  const isDone = session.status !== 'in_progress';
  const completed = session.exercises.reduce((sum, ex) => sum + ex.sets.filter((set) => set.completed).length, 0);
  const total = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const remainingRest = restTimer ? remainingRestSeconds(restTimer.endsAt, timerNow) : 0;
  const elapsedRest = restTimer ? elapsedRestSeconds(restTimer.startedAt, timerNow) : 0;
  const timerProgress = restTimer ? restProgress(remainingRest, restTimer.durationSeconds) : 0;

  return (
    <main className="container live-session">
      <header className="session-header">
        <Link className="back-link" href="/train">← Training</Link>
        <div className="session-heading-row"><div><p className="eyebrow">{isDone ? 'Workout record' : 'Live workout'}</p><h1 className="page-title">{session.name || 'Workout'}</h1></div><div className="session-progress" aria-label={`${completed} of ${total} sets complete`}><strong>{completed}</strong><span>/ {total}</span><small>sets</small></div></div>
        <div className="progress-track"><span style={{ width: total ? `${(completed / total) * 100}%` : '0%' }} /></div>
        {draftStatus && (
          <div className={`draft-status ${draftStatus}`} role="status">
            <span aria-hidden="true" />
            {draftStatus === 'recovered' && 'Recovered unsaved inputs from this device'}
            {draftStatus === 'local' && 'Input saved on this device'}
            {draftStatus === 'offline' && 'Offline · input saved on this device'}
            {draftStatus === 'unavailable' && 'Local recovery is unavailable in this browser'}
          </div>
        )}
      </header>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {offlineMessage && <div className="notice" role="status">{offlineMessage}</div>}
      {feedback && <div className="save-toast" role="status"><span>✓</span>{feedback}</div>}
      {session.exercises.length === 0 && <div className="empty-state"><strong>No exercises yet</strong><span>Add your first movement below.</span></div>}

      <div className="workout-stack">
        {session.exercises.map((ex, exerciseIndex) => (
          <section key={ex.id} className={`workout-card${ex.skipped ? ' skipped' : ''}`}>
            <div className="workout-card-header">
              <div className="exercise-number">{String(exerciseIndex + 1).padStart(2, '0')}</div>
              <div className="exercise-heading"><h2>{ex.exercise_name}{ex.skipped && <span className="badge">skipped</span>}</h2><p>{ex.primary_muscle_group || 'Exercise'}</p></div>
              {!isDone && <details className="action-menu"><summary aria-label={`Actions for ${ex.exercise_name}`}>•••</summary><div><button type="button" disabled={localOnly || saving} onClick={() => toggleSkip(ex.id, ex.skipped)}>{ex.skipped ? 'Restore' : 'Skip exercise'}</button><button className="danger-text" type="button" disabled={saving} onClick={() => removeExercise(ex.id)}>Remove exercise</button></div></details>}
            </div>
            <ExerciseDemonstration exercise={ex} compact />
            <div className="previous-strip"><span>Last time</span><strong>{formatPrevious(previous[ex.id])}</strong></div>
            {!isDone && (
              <div className="rest-setting">
                <label htmlFor={`rest-${ex.id}`}>
                  <span>Rest after Done</span>
                  <select
                    id={`rest-${ex.id}`}
                    value={ex.rest_seconds ?? ''}
                    disabled={saving}
                    onChange={(event) => setRestDuration(ex, event.target.value)}
                  >
                    <option value="">Off</option>
                    {ex.rest_seconds && !REST_OPTIONS.includes(Number(ex.rest_seconds)) && (
                      <option value={ex.rest_seconds}>{formatRestTime(ex.rest_seconds)}</option>
                    )}
                    {REST_OPTIONS.map((seconds) => (
                      <option key={seconds} value={seconds}>{formatRestTime(seconds)}</option>
                    ))}
                  </select>
                </label>
                <span>{ex.rest_seconds ? 'Starts automatically when this exercise’s set is saved.' : 'Optional — choose a duration to enable it.'}</span>
              </div>
            )}
            <div className="set-grid set-grid-head" aria-hidden="true"><span>Set</span><span>Weight</span><span>Reps</span><span>Done</span><span /></div>
            <div className="set-list">
              {ex.sets.map((set, index) => (
                <div className={`set-grid set-row${set.completed ? ' complete' : ''}`} key={set.id}>
                  <span className="set-index">{index + 1}</span>
                  <label><span className="sr-only">Weight for set {index + 1}</span><input type="number" inputMode="decimal" value={set.weight ?? ''} disabled={isDone || saving} onChange={(event) => updateSetLocally(ex.id, set.id, { weight: event.target.value === '' ? null : Number(event.target.value) })} onBlur={(event) => updateSet(ex.id, set.id, { weight: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                  <label><span className="sr-only">Repetitions for set {index + 1}</span><input type="number" inputMode="numeric" value={set.reps ?? ''} disabled={isDone || saving} onChange={(event) => updateSetLocally(ex.id, set.id, { reps: event.target.value === '' ? null : Number(event.target.value) })} onBlur={(event) => updateSet(ex.id, set.id, { reps: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                  <label className="complete-control"><input type="checkbox" checked={set.completed} disabled={isDone || saving} onChange={(event) => handleSetCompletion(ex, set, event.target.checked)} /><span>✓</span></label>
                  <button className="icon-button" type="button" disabled={isDone || saving} onClick={() => deleteSet(ex.id, set.id)} aria-label={`Delete set ${index + 1}`}>×</button>
                </div>
              ))}
            </div>
            {!isDone && <button className="add-set-button" type="button" disabled={saving} onClick={() => addSet(ex.id)}>+ Add set</button>}
          </section>
        ))}
      </div>

      {!isDone && (
        <form className="add-exercise-panel" onSubmit={addExercise} aria-label="Add exercise">
          <div>
            <p className="eyebrow">Keep training</p>
            <h2>Add an exercise</h2>
          </div>
          <div className="inline-form">
            <select value={addExerciseId} disabled={!allExercises.length} onChange={(event) => setAddExerciseId(event.target.value)} aria-label="Exercise">
              <option value="">Choose a movement</option>
              <GroupedExerciseOptions exercises={allExercises} />
            </select>
            <button className="btn btn-secondary" type="submit" disabled={!addExerciseId || saving}>Add</button>
          </div>
          <ExerciseBodyPreview exercise={selectedExerciseDetails} />
          <ExerciseDemonstration exercise={selectedExerciseDetails} compact />
        </form>
      )}

      {restTimer && !isDone && (
        <aside className={`rest-timer${restTimer.completed ? ' complete' : ''}`} aria-label="Rest timer">
          <span className="sr-only" role="status">{restTimer.completed ? `Rest complete for ${restTimer.exerciseName}.` : ''}</span>
          <div className="rest-timer-main">
            <div>
              <span>{restTimer.completed ? 'Rest complete' : 'Recover'}</span>
              <strong>{restTimer.completed ? formatRestTime(elapsedRest) : formatRestTime(remainingRest)}</strong>
            </div>
            <p>{restTimer.completed ? `Ready — rest continues until you start ${restTimer.exerciseName}.` : `Before your next ${restTimer.exerciseName} set`}</p>
          </div>
          <div className="rest-timer-actions">
            {restTimer.durationSeconds < 3600 && <button type="button" disabled={saving} onClick={() => addRestTime(30)}>+30 sec</button>}
            {!restTimer.completed && <button type="button" disabled={saving} onClick={() => recordRest('skipped')}>Skip rest</button>}
            <button className="primary" type="button" disabled={saving} onClick={() => recordRest('started')}>Start next set</button>
          </div>
          <div className="rest-timer-track" aria-hidden="true"><span style={{ width: `${timerProgress * 100}%` }} /></div>
        </aside>
      )}

      <div className={`workout-footer-spacer${restTimer && !isDone ? ' with-timer' : ''}`} />
      <footer className="workout-footer">{!isDone ? <><button className="btn btn-secondary danger-button" type="button" disabled={saving} onClick={() => finish('abandoned')}>Abandon</button><button className="btn" type="button" disabled={saving} onClick={() => finish('completed')}>{saving ? 'Saving…' : 'Finish workout'}</button></> : <Link className="btn" href="/history">Back to history</Link>}</footer>
    </main>
  );
}
