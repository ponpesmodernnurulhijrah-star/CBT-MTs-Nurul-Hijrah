import { useEffect, useState } from 'react';
import { APP_VERSION } from '../utils/cbtLogic';

export function useAppVersionCheck(isExamActive: boolean) {
  const [updatePending, setUpdatePending] = useState(false);

  useEffect(() => {
    let active = true;

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (data.version && data.version !== APP_VERSION && active) {
          setUpdatePending(true);
        }
      } catch {
        // Ignore network errors during periodic check
      }
    };

    const interval = window.setInterval(checkVersion, 30000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (updatePending && !isExamActive) {
      const timer = window.setTimeout(() => {
        window.location.reload();
      }, 2200);
      return () => window.clearTimeout(timer);
    }
  }, [updatePending, isExamActive]);

  return { updatePending };
}
