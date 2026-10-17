'use client';

import { useEffect, useState } from 'react';
import { discoverOfflineOwnerKey } from '@/app/lib/workout-draft-store';

const STORAGE_KEY = 'gymnotes:offline-owner';

export default function useOfflineOwnerKey(userId, isLoaded) {
  const [offlineOwnerKey, setOfflineOwnerKey] = useState(null);

  useEffect(() => {
    let active = true;
    async function readRememberedOwner() {
      if (navigator.onLine || userId) return;
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const recovered = stored || await discoverOfflineOwnerKey();
        if (!active) return;
        setOfflineOwnerKey(recovered);
        if (recovered && !stored) window.localStorage.setItem(STORAGE_KEY, recovered);
      } catch {
        if (active) setOfflineOwnerKey(null);
      }
    }

    if (userId) {
      setOfflineOwnerKey(userId);
      try {
        window.localStorage.setItem(STORAGE_KEY, userId);
      } catch {
        // IndexedDB operations can still proceed for this open session.
      }
    } else if (!navigator.onLine) {
      void readRememberedOwner();
    } else if (isLoaded && navigator.onLine) {
      setOfflineOwnerKey(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing else to clear.
      }
    }

    const onOffline = () => { void readRememberedOwner(); };
    window.addEventListener('offline', onOffline);
    return () => {
      active = false;
      window.removeEventListener('offline', onOffline);
    };
  }, [isLoaded, userId]);

  return userId ?? offlineOwnerKey;
}
