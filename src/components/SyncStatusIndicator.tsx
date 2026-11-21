import React from 'react';
import { AlertTriangle, Cloud, CloudOff, HardDrive, RefreshCw } from 'lucide-react';
import type { SyncStatus } from '../types/cbt';

interface SyncStatusIndicatorProps {
  syncStatus: SyncStatus;
  compact?: boolean;
  conflictCount?: number;
  onOpenConflicts?: () => void;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Menunggu sinkronisasi...';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  syncStatus,
  compact = false,
  conflictCount = 0,
  onOpenConflicts,
}) => {
  const isConflict = syncStatus.state === 'conflict' || conflictCount > 0;
  const isSyncing = !isConflict && syncStatus.state === 'syncing';
  const isSynced = !isConflict && syncStatus.state === 'synced';
  const isLocalForced = !isConflict && syncStatus.state === 'local_forced';
  const isOffline =
    !isConflict && (syncStatus.state === 'offline' || syncStatus.state === 'pending_local');

  let badgeStyle =
    'bg-emerald-500/12 border-emerald-500/30 text-emerald-900 dark:text-emerald-200';
  let dotColor = 'bg-emerald-500';
  let title = 'Tersimpan & Tersinkron Otomatis (Real-Time)';
  let icon = <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-300 shrink-0" />;

  if (isConflict) {
    badgeStyle =
      'bg-amber-100/95 dark:bg-amber-950/75 border-amber-500/70 text-amber-950 dark:text-amber-100';
    dotColor = 'bg-amber-500';
    title = `Konflik Sinkronisasi Terdeteksi (${conflictCount || 1})`;
    icon = <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />;
  } else if (isSyncing) {
    badgeStyle = 'bg-sky-500/15 border-sky-500/35 text-sky-900 dark:text-sky-200';
    dotColor = 'bg-sky-500';
    title = 'Menyimpan & Menyinkronkan ke Database Pusat...';
    icon = <RefreshCw className="w-4 h-4 text-sky-600 dark:text-sky-300 animate-spin shrink-0" />;
  } else if (isLocalForced) {
    badgeStyle = 'bg-amber-500/15 border-amber-500/35 text-amber-900 dark:text-amber-200';
    dotColor = 'bg-amber-500';
    title = 'Mode Lokal Aktif · Tersimpan Otomatis di Perangkat';
    icon = <HardDrive className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />;
  } else if (isOffline) {
    badgeStyle = 'bg-amber-500/15 border-amber-500/35 text-amber-900 dark:text-amber-200';
    dotColor = 'bg-amber-500';
    title = 'Offline / Tertunda · Tersimpan Lokal & Auto-Sinkron Saat Online';
    icon = <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />;
  } else if (syncStatus.state === 'error') {
    badgeStyle = 'bg-rose-500/15 border-rose-500/35 text-rose-900 dark:text-rose-200';
    dotColor = 'bg-rose-500';
    title = 'Koneksi Database Perlu Perhatian · Backup Lokal Aman';
    icon = <CloudOff className="w-4 h-4 text-rose-600 dark:text-rose-300 shrink-0" />;
  }

  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="sync-status-indicator"
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-semibold backdrop-blur-md transition-all ${badgeStyle}`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {(isSynced || isSyncing || isConflict) && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
        </span>
        <span className="truncate max-w-[230px]">
          {isConflict
            ? `Konflik (${conflictCount || 1})`
            : isSyncing
            ? 'Menyinkronkan...'
            : isSynced
            ? 'Tersinkron Real-Time'
            : 'Mode Lokal'}
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sync-status-indicator"
      className={`no-print glass-surface rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 transition-all ${badgeStyle}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-white/60 dark:bg-slate-900/50 flex items-center justify-center shrink-0 shadow-sm">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {(isSynced || isSyncing || isConflict) && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`}
                />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`} />
            </span>
            <span className="text-xs sm:text-sm font-bold truncate">{title}</span>
          </div>
          <div className="text-[11px] opacity-85 truncate mt-0.5">{syncStatus.lastEvent}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums shrink-0">
        {isConflict && onOpenConflicts && (
          <button
            type="button"
            onClick={onOpenConflicts}
            data-testid="open-conflict-dialog-btn"
            className="font-sans px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm transition-colors"
          >
            Selesaikan Konflik
          </button>
        )}
        <span className="px-2.5 py-1 rounded-lg bg-white/65 dark:bg-slate-900/50 font-semibold">
          {syncStatus.mode === 'firebase'
            ? `Cloud: ${syncStatus.projectId}`
            : 'Penyimpanan Lokal'}
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-white/65 dark:bg-slate-900/50">
          Sinkron: {formatSyncTime(syncStatus.lastSyncedAt)}
        </span>
      </div>
    </div>
  );
};
