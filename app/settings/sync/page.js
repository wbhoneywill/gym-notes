'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { SYNC_REQUEST_EVENT } from '@/app/components/SyncManager';
import {
  acknowledgeSyncedSetFields,
  deleteSyncChange,
  enqueueSyncChange,
  listSyncChanges,
} from '@/app/lib/workout-draft-store';
import {
  discardableSetFields,
  partitionSyncChanges,
  syncAttemptDetails,
  syncIssueReason,
  syncIssueTitle,
} from '@/app/lib/sync-issues';

function changeTime(change) {
  if (!change.createdAt) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(change.createdAt));
}

export default function SyncIssuesPage() {
  const { isLoaded, userId } = useAuth();
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setChanges(await listSyncChanges(userId));
      setError(null);
    } catch {
      setError('Could not read locally saved changes on this device.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isLoaded && userId) load();
  }, [isLoaded, userId, load]);

  useEffect(() => {
    const onComplete = () => load();
    window.addEventListener('gymnotes:sync-complete', onComplete);
    return () => window.removeEventListener('gymnotes:sync-complete', onComplete);
  }, [load]);

  async function retry(change) {
    setBusyId(change.clientChangeId);
    setError(null);
    try {
      await enqueueSyncChange({
        ...change,
        blocked: false,
        syncErrorCode: null,
        syncError: null,
        lastAttemptAt: null,
      });
      await load();
      window.dispatchEvent(new Event(SYNC_REQUEST_EVENT));
    } catch {
      setError('Could not retry this change.');
    } finally {
      setBusyId(null);
    }
  }

  async function retryAll(blocked) {
    setBusyId('all');
    setError(null);
    try {
      for (const change of blocked) {
        await enqueueSyncChange({
          ...change,
          blocked: false,
          syncErrorCode: null,
          syncError: null,
          lastAttemptAt: null,
        });
      }
      await load();
      window.dispatchEvent(new Event(SYNC_REQUEST_EVENT));
    } catch {
      setError('Could not retry the saved changes.');
    } finally {
      setBusyId(null);
    }
  }

  async function discard(change) {
    const confirmed = window.confirm(
      'Use the server version and discard this locally saved change? This cannot be undone.'
    );
    if (!confirmed) return;
    setBusyId(change.clientChangeId);
    setError(null);
    try {
      const fields = discardableSetFields(change, changes);
      await acknowledgeSyncedSetFields({
        ...change,
        payload: Object.fromEntries(fields.map((field) => [field, change.payload[field]])),
      });
      await deleteSyncChange(change.clientChangeId);
      await load();
      window.dispatchEvent(new CustomEvent('gymnotes:sync-complete', { detail: { results: [] } }));
    } catch {
      setError('Could not discard this local change.');
    } finally {
      setBusyId(null);
    }
  }

  const { blocked, pending } = partitionSyncChanges(changes);

  return (
    <main className="container sync-issues-page">
      <p className="eyebrow">Offline data</p>
      <h1 className="page-title">Sync issues</h1>
      <p className="page-lede">
        GymNotes keeps unsent workout changes on this device. Changes that the server cannot safely apply wait here for your decision.
      </p>

      {error && <div className="notice notice-error" role="alert">{error}</div>}

      {loading ? (
        <p>Checking this device…</p>
      ) : !changes.length ? (
        <section className="empty-state sync-empty-state">
          <span className="empty-state-icon" aria-hidden="true">✓</span>
          <h2>Everything is synced</h2>
          <p>There are no locally saved changes waiting on this device.</p>
        </section>
      ) : (
        <>
          {blocked.length > 0 && (
            <section className="sync-issue-section" aria-labelledby="needs-attention-title">
              <div className="section-heading sync-section-heading">
                <div>
                  <p className="eyebrow">Action needed</p>
                  <h2 id="needs-attention-title">{blocked.length} {blocked.length === 1 ? 'change needs' : 'changes need'} attention</h2>
                </div>
                {blocked.length > 1 && (
                  <button className="btn btn-secondary" type="button" disabled={busyId !== null} onClick={() => retryAll(blocked)}>
                    {busyId === 'all' ? 'Retrying…' : 'Retry all'}
                  </button>
                )}
              </div>
              <p className="sync-guidance">
                Retry if the workout is still in progress. If it has already been completed or changed elsewhere, keep the server version. Your attempted values stay visible below until you decide.
              </p>
              <div className="sync-issue-list">
                {blocked.map((change) => {
                  const details = syncAttemptDetails(change);
                  const isBusy = busyId === change.clientChangeId;
                  return (
                    <article className="sync-issue-card" key={change.clientChangeId}>
                      <div className="sync-issue-card-heading">
                        <div><p className="eyebrow">Not synced</p><h3>{syncIssueTitle(change)}</h3></div>
                        {changeTime(change) && <time dateTime={new Date(change.createdAt).toISOString()}>{changeTime(change)}</time>}
                      </div>
                      <p className="sync-issue-reason">{syncIssueReason(change)}</p>
                      {details.length > 0 && (
                        <dl className="sync-attempt-details">
                          {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                        </dl>
                      )}
                      <div className="sync-issue-actions">
                        <button className="btn btn-primary" type="button" disabled={busyId !== null} onClick={() => retry(change)}>
                          {isBusy ? 'Working…' : 'Retry'}
                        </button>
                        <button className="btn btn-secondary" type="button" disabled={busyId !== null} onClick={() => discard(change)}>
                          Keep server version
                        </button>
                        {change.entity?.sessionId && <Link href={`/train/${change.entity.sessionId}`}>Open workout</Link>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {pending.length > 0 && (
            <section className="sync-pending-card" aria-labelledby="pending-title">
              <div><p className="eyebrow">Waiting</p><h2 id="pending-title">{pending.length} saved locally</h2></div>
              <p>These changes will retry automatically when the app is online.</p>
              <button className="btn btn-secondary" type="button" disabled={busyId !== null} onClick={() => window.dispatchEvent(new Event(SYNC_REQUEST_EVENT))}>Sync now</button>
            </section>
          )}
        </>
      )}

      <p className="back-link"><Link href="/settings">← Settings</Link></p>
    </main>
  );
}
