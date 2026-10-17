import {
  discardableSetFields,
  partitionSyncChanges,
  syncAttemptDetails,
  syncIssueReason,
  syncIssueTitle,
} from '@/app/lib/sync-issues.js';

describe('sync issue presentation', () => {
  it('separates blocked changes from retryable changes', () => {
    const pending = { clientChangeId: 'pending' };
    const blocked = { clientChangeId: 'blocked', blocked: true };
    expect(partitionSyncChanges([blocked, pending])).toEqual({ blocked: [blocked], pending: [pending] });
  });

  it('describes attempted set values without hiding zeroes', () => {
    const change = { operation: 'set.patch', payload: { weight: 0, reps: 4, completed: true } };
    expect(syncIssueTitle(change)).toBe('Save set');
    expect(syncAttemptDetails(change)).toEqual([
      ['Weight', '0'],
      ['Reps', '4'],
      ['Set status', 'Done'],
    ]);
  });

  it('uses the stored safe reason and has a useful fallback', () => {
    expect(syncIssueReason({ syncError: 'Invalid repetitions.' })).toBe('Invalid repetitions.');
    expect(syncIssueReason({})).toMatch(/no longer editable/i);
  });

  it('does not clear draft fields still represented by a newer queued change', () => {
    const older = {
      clientChangeId: 'older', ownerKey: 'user', operation: 'set.patch',
      entity: { setId: 'set-1' }, payload: { weight: 20, reps: 8 },
    };
    const newer = {
      clientChangeId: 'newer', ownerKey: 'user', operation: 'set.patch',
      entity: { setId: 'set-1' }, payload: { weight: 25 },
    };
    expect(discardableSetFields(older, [older, newer])).toEqual(['reps']);
  });
});
