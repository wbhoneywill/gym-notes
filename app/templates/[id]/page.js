'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import GroupedExerciseOptions from '@/app/components/GroupedExerciseOptions';
import ExerciseBodyPreview from '@/app/components/ExerciseBodyPreview';

export default function TemplateEditorPage({ params }) {
  const { id } = use(params);

  const [template, setTemplate] = useState(null);
  const [allExercises, setAllExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [name, setName] = useState('');
  const [selectedExercise, setSelectedExercise] = useState('');
  const [targetSets, setTargetSets] = useState('');
  const selectedExerciseDetails = allExercises.find((exercise) => exercise.id === selectedExercise) ?? null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, exRes] = await Promise.all([
        fetch(`/api/templates/${id}`),
        fetch('/api/exercises'),
      ]);
      if (tplRes.status === 401) {
        setError('Please sign in.');
        return;
      }
      if (tplRes.status === 404) {
        setError('Template not found.');
        return;
      }
      if (!tplRes.ok || !exRes.ok) {
        setError('Could not load the template.');
        return;
      }
      const tplData = await tplRes.json();
      const exData = await exRes.json();
      setTemplate(tplData.template);
      setName(tplData.template.name);
      setAllExercises(exData.exercises ?? []);
    } catch {
      setError('Could not load the template.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function mutation(url, options, fallbackMessage) {
    setSuccess(null);
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || fallbackMessage);
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError(fallbackMessage);
      return false;
    }
  }

  async function rename() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Template name is required.');
      return;
    }
    const ok = await mutation(`/api/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }, 'Could not rename the template.');
    if (ok) {
      setSuccess('Template name saved.');
      await load();
    }
  }

  async function addExercise(e) {
    e.preventDefault();
    if (!selectedExercise) {
      setError('Choose an exercise to add.');
      return;
    }
    const body = { exercise_id: selectedExercise };
    if (targetSets) body.target_sets = Number(targetSets);
    const ok = await mutation(`/api/templates/${id}/exercises`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 'Could not add exercise.');
    if (!ok) return;
    setSelectedExercise('');
    setTargetSets('');
    setError(null);
    setSuccess('Exercise added to template.');
    await load();
  }

  async function removeExercise(teId) {
    const ok = await mutation(`/api/templates/${id}/exercises/${teId}`, {
      method: 'DELETE',
    }, 'Could not remove the exercise.');
    if (ok) {
      setSuccess('Exercise removed.');
      await load();
    }
  }

  async function move(index, direction) {
    const items = [...template.exercises];
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= items.length) return;
    [items[index], items[swapWith]] = [items[swapWith], items[index]];
    const order = items.map((it) => it.id);
    const ok = await mutation(`/api/templates/${id}/exercises/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }, 'Could not reorder the exercises.');
    if (ok) {
      setSuccess('Exercise order updated.');
      await load();
    }
  }

  async function saveTargets(e, teId) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const optionalNumber = (key) => {
      const value = form.get(key);
      return value === '' ? null : Number(value);
    };
    const targetRepMin = optionalNumber('target_rep_min');
    const targetRepMax = optionalNumber('target_rep_max');
    if (
      targetRepMin !== null &&
      targetRepMax !== null &&
      targetRepMin > targetRepMax
    ) {
      setError('Minimum reps cannot be greater than maximum reps.');
      return;
    }

    const ok = await mutation(`/api/templates/${id}/exercises/${teId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_sets: optionalNumber('target_sets'),
        target_rep_min: targetRepMin,
        target_rep_max: targetRepMax,
        target_weight: optionalNumber('target_weight'),
        rest_seconds: optionalNumber('rest_seconds'),
      }),
    }, 'Could not save exercise targets.');
    if (ok) {
      setSuccess('Targets saved.');
      await load();
    }
  }

  if (loading) {
    return (
      <main className="container">
        <p>Loading…</p>
      </main>
    );
  }

  if (error && !template) {
    return (
      <main className="container">
        <div className="notice notice-error" role="alert">
          {error}
        </div>
        <Link href="/templates">← Back to templates</Link>
      </main>
    );
  }

  return (
    <main className="container">
      <Link className="back-link" href="/templates">← Templates</Link>

      {error && (
        <div className="notice notice-error" role="alert" style={{ marginTop: '0.75rem' }}>
          {error}
        </div>
      )}

      {success && <div className="notice notice-success" role="status">✓ {success}</div>}

      <header className="page-header compact">
        <p className="eyebrow">Workout plan</p>
        <div className="field template-name-field">
        <label htmlFor="tpl-rename">Template name</label>
        <input
          id="tpl-rename"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
        />
        <small>Saved when you leave the field</small>
        </div>
      </header>

      <div className="section-heading"><div><p className="eyebrow">Sequence</p><h2>Exercises</h2></div><span className="count-badge">{template.exercises.length}</span></div>

      {template.exercises.length === 0 ? (
        <p>No exercises yet. Add one below.</p>
      ) : (
        <ul className="exercise-list">
          {template.exercises.map((te, i) => (
            <li key={te.id} className="template-card">
              <div className="template-card-top"><span className="drag-mark" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><div><span className="name">{te.exercise_name}</span>
              <span className="meta template-summary">
                {[
                  te.primary_muscle_group,
                  te.target_sets ? `${te.target_sets} sets` : null,
                  te.target_rep_min !== null || te.target_rep_max !== null
                    ? `${te.target_rep_min ?? '–'}–${te.target_rep_max ?? '–'} reps`
                    : null,
                  te.target_weight !== null ? `${te.target_weight} kg target` : null,
                  te.rest_seconds !== null ? `${te.rest_seconds}s rest` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span></div></div>
              <details className="target-editor">
                <summary>Edit targets</summary>
              <form
                onSubmit={(e) => saveTargets(e, te.id)}
                aria-label={`Targets for ${te.exercise_name}`}
                style={{ marginTop: '0.75rem' }}
              >
                <div className="template-target-grid">
                  <label className="field">
                    <span>Sets</span>
                    <input name="target_sets" type="number" min="0" defaultValue={te.target_sets ?? ''} />
                  </label>
                  <label className="field">
                    <span>Min reps</span>
                    <input name="target_rep_min" type="number" min="0" defaultValue={te.target_rep_min ?? ''} />
                  </label>
                  <label className="field">
                    <span>Max reps</span>
                    <input name="target_rep_max" type="number" min="0" defaultValue={te.target_rep_max ?? ''} />
                  </label>
                  <label className="field">
                    <span>Weight (kg)</span>
                    <input name="target_weight" type="number" min="0" step="0.01" defaultValue={te.target_weight ?? ''} />
                  </label>
                  <label className="field">
                    <span>Rest (seconds)</span>
                    <input name="rest_seconds" type="number" min="0" defaultValue={te.rest_seconds ?? ''} />
                  </label>
                </div>
                <button className="btn btn-secondary" type="submit">
                  Save targets
                </button>
              </form>
              </details>
              <div className="card-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${te.exercise_name} up`}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === template.exercises.length - 1}
                  aria-label={`Move ${te.exercise_name} down`}
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => removeExercise(te.id)}
                  aria-label={`Remove ${te.exercise_name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addExercise} aria-label="Add exercise to template" className="form-panel">
        <div className="section-heading"><div><p className="eyebrow">Build your plan</p><h2>Add exercise</h2></div></div>
        <div className="field">
          <label htmlFor="add-ex">Add exercise</label>
          <select
            id="add-ex"
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
          >
            <option value="">— choose an exercise —</option>
            <GroupedExerciseOptions exercises={allExercises} />
          </select>
        </div>
        <ExerciseBodyPreview exercise={selectedExerciseDetails} />
        <div className="field">
          <label htmlFor="target-sets">Target sets (optional)</label>
          <input
            id="target-sets"
            type="number"
            inputMode="numeric"
            min="0"
            value={targetSets}
            onChange={(e) => setTargetSets(e.target.value)}
          />
        </div>
        <button className="btn" type="submit">
          Add to template
        </button>
      </form>
    </main>
  );
}
