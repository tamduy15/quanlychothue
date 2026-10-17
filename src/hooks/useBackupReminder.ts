import { useState, useEffect } from 'react';
import { db } from '../db/db.ts';

export function useBackupReminder() {
  const [daysSinceBackup, setDaysSinceBackup] = useState<number>(0);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [shouldAlert, setShouldAlert] = useState<boolean>(false);

  const checkBackup = async () => {
    try {
      const meta = await db.system_meta.get('last_backup_at');
      if (meta && meta.value) {
        const last = new Date(meta.value);
        setLastBackupDate(meta.value);
        const diffMs = Date.now() - last.getTime();
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        setDaysSinceBackup(days);
        // Alert if not backed up for 3 days or more
        setShouldAlert(days >= 3);
      } else {
        // Never backed up
        setDaysSinceBackup(999);
        setShouldAlert(true);
      }
    } catch {
      setShouldAlert(false);
    }
  };

  useEffect(() => {
    checkBackup();
    const interval = setInterval(checkBackup, 60000); // re-check every minute
    return () => clearInterval(interval);
  }, []);

  return {
    daysSinceBackup,
    lastBackupDate,
    shouldAlert,
    refreshBackupStatus: checkBackup,
  };
}
