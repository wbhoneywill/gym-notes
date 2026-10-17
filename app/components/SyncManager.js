'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  acknowledgeSyncedSetFields,
  deleteSyncChange,
  enqueueSyncChange,
  listSyncChanges,
} from '@/app/lib/workout-draft-store';
import { partitionSyncChanges } from '@/app/lib/sync-issues';
import { nextSyncBatch } from '@/app/lib/sync-change';

export const SYNC_REQUEST_EVENT = 'gymnotes:sync-request';

export default function SyncManager() {
  const { isLoaded, userId } = useAuth();
  const pathname = usePathname();
  const [status, setStatus] = useState('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const runningRef = useRef(false);

  const synchronize = useCallback(async () => {
    if (!userId || runningRef.current) return;
    runningRef.current = true;
    try {
      let initialChanges = await listSyncChanges(userId);
      const oversizedBatchBlocks = initialChanges.filter((change) => change.blocked === true
        && change.syncErrorCode === 'invalid_change'
        && /more than 50/i.test(change.syncError ?? ''));
      for (const change of oversizedBatchBlocks) {
        await enqueueSyncChange({ ...change, blocked: false, syncErrorCode: null, syncError: null });
      }
      if (oversizedBatchBlocks.length) initialChanges = await listSyncChanges(userId);
      setPendingCount(initialChanges.length);
      if (!initialChanges.length) {
        setStatus('synced');
        return;
      }
      if (!partitionSyncChanges(initialChanges).pending.length) {
        setStatus('attention');
        return;
      }
      setStatus('syncing');
      const allResults = [];
      while (true) {
        const queued = await listSyncChanges(userId);
        const pending = nextSyncBatch(partitionSyncChanges(queued).pending);
        if (!pending.length) break;
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: pending }),
        });
        if (response.status === 400) {
          const data = await response.json().catch(() => ({}));
          for (const change of pending) {
            await enqueueSyncChange({
              ...change,
              blocked: true,
              syncErrorCode: 'invalid_change',
              syncError: data.error || 'This saved change is invalid and needs your attention.',
              attempts: (change.attempts ?? 0) + 1,
              lastAttemptAt: Date.now(),
            });
          }
          continue;
        }
        if (!response.ok) throw new Error('Sync request failed');
        const { results = [] } = await response.json();
        allResults.push(...results);
        const acknowledgedIds = new Set(
          results.filter((result) => result.status === 'applied' || result.status === 'duplicate')
            .map((result) => result.clientChangeId)
        );
        const resultsById = new Map(results.map((result) => [result.clientChangeId, result]));
        for (const change of pending) {
          if (acknowledgedIds.has(change.clientChangeId)) {
            await acknowledgeSyncedSetFields(change);
            await deleteSyncChange(change.clientChangeId);
            continue;
          }
          const result = resultsById.get(change.clientChangeId);
          if (result?.status !== 'rejected') continue;
          await enqueueSyncChange({
            ...change,
            blocked: true,
            syncErrorCode: result.code || 'not_editable',
            syncError: result.error || 'The workout changed on the server or is no longer editable.',
            attempts: (change.attempts ?? 0) + 1,
            lastAttemptAt: Date.now(),
          });
        }
      }
      const remaining = await listSyncChanges(userId);
      const remainingGroups = partitionSyncChanges(remaining);
      setPendingCount(remaining.length);
      setStatus(remainingGroups.blocked.length ? 'attention' : remaining.length ? 'local' : 'synced');
      window.dispatchEvent(new CustomEvent('gymnotes:sync-complete', { detail: { results: allResults } }));
    } catch {
      const changes = await listSyncChanges(userId).catch(() => []);
      setPendingCount(changes.length);
      setStatus(changes.length ? 'local' : 'idle');
    } finally {
      runningRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!isLoaded || !userId) return undefined;
    synchronize();
    const onVisible = () => { if (document.visibilityState === 'visible') synchronize(); };
    window.addEventListener('online', synchronize);
    window.addEventListener('focus', synchronize);
    window.addEventListener(SYNC_REQUEST_EVENT, synchronize);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', synchronize);
      window.removeEventListener('focus', synchronize);
      window.removeEventListener(SYNC_REQUEST_EVENT, synchronize);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isLoaded, userId, synchronize]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(async () => {
      const registration = await navigator.serviceWorker.ready;
      const assets = performance.getEntriesByType('resource')
        .filter((entry) => ['script', 'link', 'css', 'img'].includes(entry.initiatorType))
        .map((entry) => entry.name)
        .filter((assetUrl) => !assetUrl.includes('/api/'));
      registration.active?.postMessage({ type: 'CACHE_LOADED_ASSETS', assets });
      if (/^\/train(?:\/[^/]+)?$/.test(pathname)) {
        registration.active?.postMessage({ type: 'CACHE_TRAINING_ROUTE', path: pathname });
        if (pathname === '/train') {
          registration.active?.postMessage({ type: 'CACHE_TRAINING_ROUTE', path: '/train/offline' });
        }
      }
    }).catch(() => {});
  }, [pathname]);

  if (!pendingCount && status !== 'syncing') return null;
  const labels = {
    syncing: `Syncing ${pendingCount} change${pendingCount === 1 ? '' : 's'}…`,
    local: `${pendingCount} saved locally`,
    attention: `${pendingCount} need attention`,
  };
  return (
    <Link className={`global-sync-status ${status}`} href="/settings/sync" aria-label={`${labels[status]}. Open sync details.`}>
      <span aria-hidden="true" />{labels[status]}
    </Link>
  );
}
