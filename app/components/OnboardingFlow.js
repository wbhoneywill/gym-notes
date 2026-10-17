'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EXPERIENCE_LEVELS, STARTER_PLANS, TRAINING_GOALS } from '@/app/lib/onboarding';

const PLAN_DESCRIPTIONS = {
  none: 'Start without creating a plan.',
  full_body: 'Five foundational movements for balanced training.',
  push: 'Chest, shoulders, and triceps.',
  pull: 'Back, lats, rear shoulders, and biceps.',
  legs: 'Quadriceps, hamstrings, glutes, and calves.',
};

export default function OnboardingFlow({ editing, firstName, initialValues }) {
  const router = useRouter();
  const totalSteps = editing ? 3 : 4;
  const [step, setStep] = useState(1);
  const [values, setValues] = useState({ ...initialValues, starter_plan: 'full_body' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setError('');
  }

  async function submit({ skip = false } = {}) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skip ? { skip: true } : { ...values, mode: editing ? 'edit' : 'complete' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not save your setup.');
        return;
      }
      if (skip || editing) {
        router.push(editing ? '/settings' : '/dashboard');
        router.refresh();
        return;
      }
      setResult(data);
    } catch {
      setError('Could not save your setup. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function startFirstWorkout() {
    if (!result?.template?.id) {
      router.push('/train');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: result.template.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session?.id) {
        setError(data.error || 'Your plan is ready, but the workout could not be started.');
        return;
      }
      router.push(`/train/${data.session.id}`);
    } catch {
      setError('Your plan is ready, but the workout could not be started.');
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-complete">
          <span className="onboarding-check" aria-hidden="true">✓</span>
          <p className="eyebrow">Setup complete</p>
          <h1>{result.template ? `${result.template.name} is ready` : 'GymNotes is ready'}</h1>
          <p>{result.template
            ? 'Your starter plan uses approachable targets that you can adjust at any time.'
            : 'Start a blank workout or build a plan whenever you are ready.'}</p>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <button className="btn onboarding-primary" type="button" disabled={saving} onClick={startFirstWorkout}>
            {saving ? 'Starting…' : 'Start my first workout'}
          </button>
          <div className="onboarding-complete-links">
            {result.template && <Link href={`/templates/${result.template.id}`}>Review plan</Link>}
            <Link href="/dashboard">Go to dashboard</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Link className="app-wordmark" href={editing ? '/settings' : '/'}>GYM<span>NOTES</span></Link>
        {!editing && <button type="button" className="onboarding-skip" disabled={saving} onClick={() => submit({ skip: true })}>Skip setup</button>}
      </header>

      <section className="onboarding-card">
        <div className="onboarding-progress" aria-label={`Step ${step} of ${totalSteps}`}>
          <span>{editing ? 'Training profile' : `Step ${step} of ${totalSteps}`}</span>
          <div>{Array.from({ length: totalSteps }, (_, index) => <i key={index} className={index < step ? 'active' : ''} />)}</div>
        </div>

        {step === 1 && (
          <div className="onboarding-step">
            <p className="eyebrow">Welcome{firstName ? `, ${firstName}` : ''}</p>
            <h1>How do you measure weight?</h1>
            <p>GymNotes keeps original workout values and converts displays when needed.</p>
            <div className="onboarding-choice-grid two">
              {[['kg', 'Kilograms', 'kg'], ['lb', 'Pounds', 'lb']].map(([value, label, symbol]) => (
                <button key={value} type="button" className={values.preferred_unit === value ? 'selected' : ''} aria-pressed={values.preferred_unit === value} onClick={() => update('preferred_unit', value)}>
                  <strong>{symbol}</strong><span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <p className="eyebrow">Your direction</p>
            <h1>What is your main goal?</h1>
            <p>This shapes starter targets only. GymNotes does not replace professional coaching.</p>
            <div className="onboarding-options">
              {TRAINING_GOALS.map((option) => (
                <button key={option.value} type="button" className={values.training_goal === option.value ? 'selected' : ''} aria-pressed={values.training_goal === option.value} onClick={() => update('training_goal', option.value)}>
                  <span><strong>{option.label}</strong><small>{option.description}</small></span><b aria-hidden="true">✓</b>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step">
            <p className="eyebrow">Training rhythm</p>
            <h1>Tell us about your routine</h1>
            <div className="onboarding-options">
              {EXPERIENCE_LEVELS.map((option) => (
                <button key={option.value} type="button" className={values.experience_level === option.value ? 'selected' : ''} aria-pressed={values.experience_level === option.value} onClick={() => update('experience_level', option.value)}>
                  <span><strong>{option.label}</strong><small>{option.description}</small></span><b aria-hidden="true">✓</b>
                </button>
              ))}
            </div>
            <label className="training-days-control">
              <span><strong>Training days per week</strong><small>A planning preference, not a commitment.</small></span>
              <select value={values.training_days_per_week} onChange={(event) => update('training_days_per_week', Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
          </div>
        )}

        {!editing && step === 4 && (
          <div className="onboarding-step">
            <p className="eyebrow">Optional head start</p>
            <h1>Choose a starter plan</h1>
            <p>We will create one editable plan. Nothing is scheduled or started automatically.</p>
            <div className="onboarding-options">
              {Object.entries(STARTER_PLANS).map(([key, plan]) => (
                <button key={key} type="button" className={values.starter_plan === key ? 'selected' : ''} aria-pressed={values.starter_plan === key} onClick={() => update('starter_plan', key)}>
                  <span><strong>{plan.name ?? 'No starter plan'}</strong><small>{PLAN_DESCRIPTIONS[key]}</small></span><b aria-hidden="true">✓</b>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <footer className="onboarding-actions">
          {step > 1 ? <button className="btn btn-secondary" type="button" disabled={saving} onClick={() => setStep((current) => current - 1)}>Back</button> : <span />}
          {step < totalSteps ? (
            <button className="btn" type="button" onClick={() => setStep((current) => current + 1)}>Continue</button>
          ) : (
            <button className="btn" type="button" disabled={saving} onClick={() => submit()}>{saving ? 'Saving…' : editing ? 'Save profile' : 'Finish setup'}</button>
          )}
        </footer>
      </section>
    </main>
  );
}
