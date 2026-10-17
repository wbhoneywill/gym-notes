export function shouldQueueOfflineStart({ status, online, ownerKey }) {
  return Boolean(ownerKey && (online === false || Number(status) >= 500));
}

export function offlineRecorderPath(sessionId) {
  return `/train/offline?session=${encodeURIComponent(sessionId)}`;
}

export function canUseOfflineDraft({ online, sessionStatus, exerciseStatus, hasDraft }) {
  if (!hasDraft) return false;
  if (online === false) return true;
  return Number(sessionStatus) >= 500 || Number(exerciseStatus) >= 500;
}

export function offlineSessionIdFromSearch(search) {
  return new URLSearchParams(search).get('session');
}

export function canStartWorkout({ online, ownerKey }) {
  return online !== false || Boolean(ownerKey);
}

export function canLoadRecorder({ sessionId, authLoaded, ownerKey, online }) {
  // An online request can rely on the existing Clerk session cookie even when
  // the remote Clerk browser bundle is slow or unavailable. Offline loading
  // still requires a known local owner so private drafts never cross accounts.
  return Boolean(sessionId && (online !== false || authLoaded || ownerKey));
}
