'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import InstallAppCard from '@/app/components/InstallAppCard';
import { EXPERIENCE_LEVELS, TRAINING_GOALS } from '@/app/lib/onboarding';

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label ?? 'Not set';
}

export default function SettingsPage() {
  const [unit, setUnit] = useState('kg');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({
    training_goal: null,
    experience_level: null,
    training_days_per_week: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.status === 401) {
          setError('Please sign in.');
          return;
        }
        if (!res.ok) {
          setError('Could not load settings.');
          return;
        }
        const data = await res.json();
        setUnit(data.settings.preferred_unit ?? 'kg');
        setProfile({
          training_goal: data.settings.training_goal ?? null,
          experience_level: data.settings.experience_level ?? null,
          training_days_per_week: data.settings.training_days_per_week ?? null,
        });
      } catch {
        setError('Could not load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    const confirmed = window.confirm(
      'Permanently delete your account and all workout data? This cannot be undone.'
    );
    if (!confirmed) return;
    // Second confirmation for an irreversible action.
    if (!window.confirm('This is permanent. Delete everything?')) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not delete your account. Please try again.');
        return;
      }
      // Account gone — send them to the public landing page.
      window.location.href = '/';
    } catch {
      setError('Could not delete your account. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function save(nextUnit) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_unit: nextUnit }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save.');
        return;
      }
      setUnit(nextUnit);
      setSaved(true);
    } catch {
      setError('Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container">
      <h1 className="page-title">Settings</h1>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div className="notice notice-success" role="status">
          Saved.
        </div>
      )}

      <Link className="settings-help-card" href="/help">
        <span aria-hidden="true">?</span>
        <span><strong>Help & FAQ</strong><small>Learn how plans, training, history, and progress work.</small></span>
        <span aria-hidden="true">→</span>
      </Link>

      <Link className="settings-help-card" href="/settings/sync">
        <span aria-hidden="true">↻</span>
        <span><strong>Offline sync</strong><small>Review locally saved changes and resolve anything that needs attention.</small></span>
        <span aria-hidden="true">→</span>
      </Link>

      <InstallAppCard />

      {!loading && (
        <section className="profile-summary" aria-labelledby="profile-summary-title">
          <div className="profile-summary-heading">
            <div><p className="eyebrow">Saved preferences</p><h2 id="profile-summary-title">Training profile</h2></div>
            <Link className="btn btn-secondary" href="/onboarding?edit=1">Edit profile</Link>
          </div>
          <dl>
            <div><dt>Goal</dt><dd>{optionLabel(TRAINING_GOALS, profile.training_goal)}</dd></div>
            <div><dt>Experience</dt><dd>{optionLabel(EXPERIENCE_LEVELS, profile.experience_level)}</dd></div>
            <div><dt>Training rhythm</dt><dd>{profile.training_days_per_week ? `${profile.training_days_per_week} ${profile.training_days_per_week === 1 ? 'day' : 'days'} per week` : 'Not set'}</dd></div>
            <div><dt>Weight unit</dt><dd>{unit === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</dd></div>
          </dl>
          {(!profile.training_goal || !profile.experience_level || !profile.training_days_per_week) && (
            <p className="profile-summary-note">Complete your training profile to personalize future starter recommendations.</p>
          )}
        </section>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <section>
          <div className="field">
            <label id="unit-label">Preferred weight unit</label>
            <div
              className="segmented"
              role="group"
              aria-labelledby="unit-label"
            >
              {['kg', 'lb'].map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`segmented-option${unit === u ? ' is-active' : ''}`}
                  aria-pressed={unit === u}
                  disabled={saving}
                  onClick={() => u !== unit && save(u)}
                >
                  {u === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}
                </button>
              ))}
            </div>
            <p className="meta" style={{ color: 'var(--text-dim)', marginTop: '0.4rem' }}>
              Changes how weights are shown. Your recorded workouts keep their
              original values — only the display converts.
            </p>
          </div>
        </section>
      )}

      {!loading && (
        <details className="advanced-account-actions">
          <summary>Advanced account actions</summary>
          <section className="danger-zone">
            <h2>Delete account</h2>
            <p className="meta">
              Permanently removes your templates, exercises, sessions, and
              history. This cannot be undone.
            </p>
            <button
              type="button"
              className="btn btn-secondary danger-button"
              disabled={deleting}
              onClick={deleteAccount}
            >
              {deleting ? 'Deleting…' : 'Delete my account'}
            </button>
          </section>
        </details>
      )}

      <p style={{ marginTop: '2rem' }}>
        <Link href="/dashboard">← Dashboard</Link>
      </p>
    </main>
  );
}
