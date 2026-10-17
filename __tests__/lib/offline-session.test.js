import { canLoadRecorder, canStartWorkout, canUseOfflineDraft, offlineRecorderPath, offlineSessionIdFromSearch, shouldQueueOfflineStart } from '@/app/lib/offline-session.js';

describe('offline session start', () => {
  it('queues any failed response while the device is offline and has a remembered owner', () => {
    expect(shouldQueueOfflineStart({ status: 401, online: false, ownerKey: 'user_1' })).toBe(true);
    expect(shouldQueueOfflineStart({ status: 500, online: true, ownerKey: 'user_1' })).toBe(true);
  });

  it('does not create private offline data without an authenticated device owner', () => {
    expect(shouldQueueOfflineStart({ status: 500, online: false, ownerKey: null })).toBe(false);
    expect(shouldQueueOfflineStart({ status: 400, online: true, ownerKey: 'user_1' })).toBe(false);
  });

  it('allows online server starts without requiring the offline namespace first', () => {
    expect(canStartWorkout({ online: true, ownerKey: null })).toBe(true);
    expect(canStartWorkout({ online: false, ownerKey: 'user_1' })).toBe(true);
    expect(canStartWorkout({ online: false, ownerKey: null })).toBe(false);
  });

  it('loads a local recorder without waiting for Clerk to initialize offline', () => {
    expect(canLoadRecorder({ sessionId: 'session-1', authLoaded: false, ownerKey: 'user_1', online: false })).toBe(true);
    expect(canLoadRecorder({ sessionId: 'session-1', authLoaded: true, ownerKey: null, online: false })).toBe(true);
    expect(canLoadRecorder({ sessionId: 'session-1', authLoaded: false, ownerKey: null, online: false })).toBe(false);
    expect(canLoadRecorder({ sessionId: null, authLoaded: true, ownerKey: 'user_1', online: false })).toBe(false);
  });

  it('tries the authenticated API online without waiting for Clerk browser hydration', () => {
    expect(canLoadRecorder({ sessionId: 'session-1', authLoaded: false, ownerKey: null, online: true })).toBe(true);
  });

  it('uses the pre-cached recorder route for a new local session', () => {
    expect(offlineRecorderPath('session id')).toBe('/train/offline?session=session%20id');
    expect(offlineSessionIdFromSearch('?session=local-session-id')).toBe('local-session-id');
  });

  it('uses a saved draft for both transport failure and offline server failure', () => {
    expect(canUseOfflineDraft({ online: false, sessionStatus: 401, exerciseStatus: 401, hasDraft: true })).toBe(true);
    expect(canUseOfflineDraft({ online: true, sessionStatus: 500, exerciseStatus: 200, hasDraft: true })).toBe(true);
    expect(canUseOfflineDraft({ online: true, sessionStatus: 404, exerciseStatus: 200, hasDraft: true })).toBe(false);
    expect(canUseOfflineDraft({ online: false, sessionStatus: 500, exerciseStatus: 500, hasDraft: false })).toBe(false);
  });
});
