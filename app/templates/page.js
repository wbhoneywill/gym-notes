'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import HelpLink from '@/app/components/HelpLink';
import { formatScheduleTime, WEEKDAYS } from '@/app/lib/schedules';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [scheduleTemplateId, setScheduleTemplateId] = useState('');
  const [scheduleWeekday, setScheduleWeekday] = useState(() => new Date().getDay());
  const [scheduleTime, setScheduleTime] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [res, scheduleRes] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/schedules'),
      ]);
      if (res.status === 401) {
        setError('Please sign in to view your templates.');
        return;
      }
      if (!res.ok) {
        setError('Could not load templates.');
        return;
      }
      const data = await res.json();
      const nextTemplates = data.templates ?? [];
      setTemplates(nextTemplates);
      setScheduleTemplateId((current) => current || nextTemplates[0]?.id || '');
      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json();
        setSchedules(scheduleData.schedules ?? []);
      }
    } catch {
      setError('Could not load templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createTemplate(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Template name is required.');
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not create template.');
        return;
      }
      setName('');
      setSuccess('Template created.');
      await load();
    } catch {
      setError('Could not create template.');
    } finally {
      setCreating(false);
    }
  }

  async function duplicate(id) {
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}/duplicate`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError('Could not duplicate template.');
        return;
      }
      await load();
    } catch {
      setError('Could not duplicate template.');
    }
  }

  async function archive(id) {
    if (!window.confirm('Archive this template? It will be hidden from your list.'))
      return;
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not archive template.');
        return;
      }
      await load();
    } catch {
      setError('Could not archive template.');
    }
  }

  async function saveSchedule(event) {
    event.preventDefault();
    if (!scheduleTemplateId) {
      setError('Create a plan before scheduling it.');
      return;
    }
    setSavingSchedule(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: scheduleTemplateId,
          weekday: scheduleWeekday,
          local_time: scheduleTime || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Could not save the schedule.');
        return;
      }
      setSuccess('Weekly workout scheduled.');
      await load();
    } catch {
      setError('Could not save the schedule.');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function removeSchedule(id) {
    if (!window.confirm('Remove this workout from your weekly schedule?')) return;
    setError(null);
    try {
      const response = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('Could not remove the scheduled workout.');
        return;
      }
      setSuccess('Scheduled workout removed.');
      await load();
    } catch {
      setError('Could not remove the scheduled workout.');
    }
  }

  return (
    <main className="container">
      <header className="page-header"><p className="eyebrow">Programming</p><h1 className="page-title">Templates</h1><p className="page-lead">Build once, then focus on the work.</p><HelpLink topic="plans" /></header>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {success && <div className="notice notice-success" role="status">✓ {success}</div>}

      <form onSubmit={createTemplate} aria-label="Create template" className="inline-create-panel">
        <div className="field">
          <label htmlFor="tpl-name">New template name</label>
          <input
            id="tpl-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Push A"
            autoComplete="off"
          />
        </div>
        <button className="btn" type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create template'}
        </button>
      </form>

      <section className="content-section schedule-section">
        <div className="section-heading">
          <div><p className="eyebrow">Weekly rhythm</p><h2>Workout schedule</h2></div>
          <span className="count-badge">{schedules.length}</span>
        </div>
        <p className="section-description">
          Choose when a plan normally fits your week. Workouts still start only when you choose.
        </p>
        <form className="schedule-form" onSubmit={saveSchedule}>
          <div className="field">
            <label htmlFor="schedule-plan">Plan</label>
            <select id="schedule-plan" value={scheduleTemplateId} onChange={(event) => setScheduleTemplateId(event.target.value)} disabled={!templates.length}>
              {templates.length === 0 && <option value="">No plans available</option>}
              {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-day">Day</label>
            <select id="schedule-day" value={scheduleWeekday} onChange={(event) => setScheduleWeekday(Number(event.target.value))}>
              {WEEKDAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-time">Preferred time <small>optional</small></label>
            <input id="schedule-time" type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={savingSchedule || !templates.length}>
            {savingSchedule ? 'Saving…' : 'Add to week'}
          </button>
        </form>
        {schedules.length > 0 && (
          <ul className="schedule-list">
            {schedules.map((schedule) => {
              const today = schedule.weekday === new Date().getDay();
              return (
                <li key={schedule.id} className={today ? 'today' : ''}>
                  <div className="schedule-day">
                    <span>{WEEKDAYS[schedule.weekday].slice(0, 3)}</span>
                    {today && <small>Today</small>}
                  </div>
                  <div className="schedule-details">
                    <strong>{schedule.template_name}</strong>
                    <span>{formatScheduleTime(schedule.local_time)}</span>
                  </div>
                  <button className="btn btn-secondary btn-compact" type="button" onClick={() => removeSchedule(schedule.id)} aria-label={`Remove ${schedule.template_name} from ${WEEKDAYS[schedule.weekday]}`}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading"><div><p className="eyebrow">Library</p><h2>Your plans</h2></div><span className="count-badge">{templates.length}</span></div>
        {loading ? (
          <p>Loading…</p>
        ) : templates.length === 0 ? (
          <p>No templates yet. Create one above.</p>
        ) : (
          <ul className="exercise-list">
            {templates.map((t) => (
              <li key={t.id} className="exercise-item template-list-card">
                <span className="name">
                  <Link href={`/templates/${t.id}`}>{t.name}</Link>
                </span>
                <span className="meta">
                  {t.exercise_count}{' '}
                  {t.exercise_count === 1 ? 'exercise' : 'exercises'}
                </span>
                <div className="card-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => duplicate(t.id)}
                  >
                    Duplicate
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => archive(t.id)}
                  >
                    Archive
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
