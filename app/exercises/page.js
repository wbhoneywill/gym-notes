'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { groupExercisesByMuscle } from '@/app/lib/exercises';
import BodyGroupSelector from '@/app/components/BodyGroupSelector';
import HelpLink from '@/app/components/HelpLink';
import {
  BACK_BODY_FILTER,
  FRONT_BODY_FILTER,
  bodyGroupsForView,
  visualForBodyGroup,
} from '@/app/lib/body-map';

export default function ExercisesPage() {
  const [exercises, setExercises] = useState([]);
  const [muscleGroups, setMuscleGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeMuscleGroup, setActiveMuscleGroup] = useState(FRONT_BODY_FILTER);

  // New-exercise form state
  const [name, setName] = useState('');
  const [primaryMuscleGroupId, setPrimaryMuscleGroupId] = useState('');
  const [equipment, setEquipment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [exRes, mgRes] = await Promise.all([
        fetch('/api/exercises'),
        fetch('/api/muscle-groups'),
      ]);

      if (exRes.status === 401 || mgRes.status === 401) {
        setError('Please sign in to view your exercise library.');
        return;
      }
      if (!exRes.ok || !mgRes.ok) {
        setError('Could not load exercises. Please try again.');
        return;
      }

      const exData = await exRes.json();
      const mgData = await mgRes.json();
      setExercises(exData.exercises ?? []);
      setMuscleGroups(mgData.muscleGroups ?? []);
    } catch {
      setError('Could not load exercises. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Exercise name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          primary_muscle_group_id: primaryMuscleGroupId
            ? Number(primaryMuscleGroupId)
            : null,
          equipment: equipment.trim() || null,
        }),
      });

      if (res.status === 401) {
        setError('Please sign in to add an exercise.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not add the exercise.');
        return;
      }

      // Reset the form and refresh the list.
      setName('');
      setPrimaryMuscleGroupId('');
      setEquipment('');
      setSuccess('Exercise added.');
      await loadData();
    } catch {
      setError('Could not add the exercise.');
    } finally {
      setSubmitting(false);
    }
  }

  const taxonomyOrder = muscleGroups.map((group) => group.name);
  const groupedExercises = groupExercisesByMuscle(exercises, taxonomyOrder);
  const sideGroups = activeMuscleGroup === FRONT_BODY_FILTER || activeMuscleGroup === BACK_BODY_FILTER
    ? bodyGroupsForView(activeMuscleGroup === FRONT_BODY_FILTER ? 'front' : 'back', groupedExercises.map((group) => group.name))
    : null;
  const visibleGroups = activeMuscleGroup === 'All'
    ? groupedExercises
    : groupedExercises.filter((group) => sideGroups
      ? sideGroups.includes(group.name)
      : group.name === activeMuscleGroup);
  const visibleExerciseCount = visibleGroups.reduce((sum, group) => sum + group.exercises.length, 0);
  const activeGroupView = visualForBodyGroup(activeMuscleGroup)?.view;
  const visibleFilterGroups = sideGroups
    ?? (activeGroupView
      ? bodyGroupsForView(activeGroupView, groupedExercises.map((group) => group.name))
      : groupedExercises.map((group) => group.name));

  return (
    <main className="container">
      <header className="page-header"><p className="eyebrow">Movement library</p><h1 className="page-title">Exercises</h1><p className="page-lead">Shared essentials and your personal movements.</p><HelpLink topic="exercises" /></header>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice notice-success" role="status">
          {success}
        </div>
      )}

      <details className="create-drawer">
        <summary>+ Add a personal exercise</summary>
      <form onSubmit={handleSubmit} aria-label="Add exercise" className="form-panel nested">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Incline Dumbbell Press"
            autoComplete="off"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="muscle">Primary muscle group</label>
          <select
            id="muscle"
            value={primaryMuscleGroupId}
            onChange={(e) => setPrimaryMuscleGroupId(e.target.value)}
          >
            <option value="">— none —</option>
            {muscleGroups.map((mg) => (
              <option key={mg.id} value={mg.id}>
                {mg.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="equipment">Equipment (optional)</label>
          <input
            id="equipment"
            type="text"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="e.g. Dumbbell"
            autoComplete="off"
          />
        </div>

        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add exercise'}
        </button>
      </form>
      </details>

      <div className="section-heading"><div><p className="eyebrow">Available</p><h2>Choose a body group</h2></div><span className="count-badge">{visibleExerciseCount}</span></div>

      {loading ? (
        <p>Loading…</p>
      ) : exercises.length === 0 ? (
        <p>No exercises yet. Add your first one above.</p>
      ) : (
        <>
          <BodyGroupSelector
            activeGroup={activeMuscleGroup}
            availableGroups={groupedExercises.map((group) => group.name)}
            onSelect={setActiveMuscleGroup}
          />
          <div className="muscle-filter" role="group" aria-label="Filter exercises by body group">
            {['All', ...visibleFilterGroups].map((groupName) => (
              <button
                key={groupName}
                type="button"
                className={activeMuscleGroup === groupName ? 'active' : ''}
                aria-pressed={activeMuscleGroup === groupName}
                onClick={() => setActiveMuscleGroup(groupName)}
              >
                {groupName}
              </button>
            ))}
          </div>

          <div className="exercise-groups">
            {visibleGroups.map((group) => (
              <section key={group.name} className="exercise-group" aria-labelledby={`group-${group.name}`}>
                <div className="exercise-group-heading">
                  <h3 id={`group-${group.name}`}>{group.name}</h3>
                  <span>{group.exercises.length}</span>
                </div>
                <ul className="exercise-list">
                  {group.exercises.map((ex) => (
                    <li key={ex.id} className="exercise-item">
                      <span className="name exercise-name-row">
                        <Link href={`/exercises/${ex.id}/history`}>{ex.name}</Link>
                        <span className="badge">{ex.is_shared ? 'shared' : 'personal'}</span>
                      </span>
                      {ex.equipment && <span className="meta">{ex.equipment}</span>}
                      <Link className="exercise-history-link" href={`/exercises/${ex.id}/history`}>
                        View performance <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
