import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Cloud,
  GitMerge,
  Laptop,
  RefreshCw,
  X,
} from 'lucide-react';
import type { ConflictResolutionChoice, SyncConflict } from '../types/cbt';
import { getEntityKindLabel } from '../utils/conflictLogic';

interface SyncConflictNotificationProps {
  conflicts: SyncConflict[];
  visible: boolean;
  onOpenDialog: () => void;
  onDismissBanner: () => void;
}

export const SyncConflictNotification: React.FC<SyncConflictNotificationProps> = ({
  conflicts,
  visible,
  onOpenDialog,
  onDismissBanner,
}) => {
  if (!visible || conflicts.length === 0) return null;
  const first = conflicts[0];

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="sync-conflict-banner"
      className="no-print fixed bottom-5 left-4 right-4 sm:right-auto sm:max-w-md z-50 glass-surface rounded-2xl border border-amber-500/55 bg-amber-50/95 dark:bg-slate-900/95 shadow-2xl p-4 animate-ios-enter"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
              Konflik Sinkronisasi Terdeteksi ({conflicts.length})
            </h3>
            <button
              type="button"
              onClick={onDismissBanner}
              aria-label="Tutup notifikasi konflik"
              className="w-6 h-6 rounded-lg glass-subtle flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
            <b>{first.entityTitle}</b> memiliki perubahan lokal yang berbeda dengan data terbaru di
            server. Pilih versi yang akan disimpan agar tidak ada data yang tertimpa.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              type="button"
              onClick={onOpenDialog}
              data-testid="conflict-banner-resolve-btn"
              className="glass-pill-btn px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              Selesaikan Sekarang
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDismissBanner}
              className="glass-pill-btn px-3 py-1.5 rounded-xl glass-subtle text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Nanti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SyncConflictModalProps {
  open: boolean;
  conflicts: SyncConflict[];
  onClose: () => void;
  onResolve: (
    conflictId: string,
    choice: ConflictResolutionChoice,
    fieldChoices?: Record<string, 'local' | 'server'>
  ) => Promise<void>;
  onResolveAll: (choice: 'keep_local' | 'use_server') => Promise<void>;
}

function formatConflictDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  open,
  conflicts,
  onClose,
  onResolve,
  onResolveAll,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [fieldChoices, setFieldChoices] = useState<Record<string, 'local' | 'server'>>({});
  const [resolving, setResolving] = useState(false);

  const activeConflict =
    conflicts.find((c) => c.id === selectedId) || conflicts[0] || null;

  useEffect(() => {
    if (!activeConflict) return;
    setSelectedId(activeConflict.id);
    const defaults: Record<string, 'local' | 'server'> = {};
    for (const diff of activeConflict.diffs) {
      defaults[diff.field] = 'local';
    }
    setFieldChoices(defaults);
  }, [activeConflict?.id]);

  if (!open || !activeConflict) return null;

  const handleAction = async (choice: ConflictResolutionChoice) => {
    setResolving(true);
    try {
      await onResolve(
        activeConflict.id,
        choice,
        choice === 'merge' ? fieldChoices : undefined
      );
    } finally {
      setResolving(false);
    }
  };

  const handleBulk = async (choice: 'keep_local' | 'use_server') => {
    setResolving(true);
    try {
      await onResolveAll(choice);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      data-testid="sync-conflict-dialog"
    >
      <div className="glass-surface max-w-4xl w-full rounded-3xl p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-ios-enter">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/60 dark:border-slate-700/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="conflict-dialog-title"
                className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white"
              >
                Penyelesaian Konflik Sinkronisasi Data
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {conflicts.length} perbedaan antara perubahan lokal perangkat ini dan database server pusat.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog konflik"
            className="w-8 h-8 rounded-xl glass-subtle flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Multi-conflict switcher */}
        {conflicts.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {conflicts.map((c, idx) => {
              const isSelected = c.id === activeConflict.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    isSelected
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'glass-subtle text-slate-700 dark:text-slate-200'
                  }`}
                >
                  #{idx + 1} · {getEntityKindLabel(c.entityKind)}: {c.entityTitle}
                </button>
              );
            })}
          </div>
        )}

        {/* Active Conflict Meta Card */}
        <div className="glass-subtle rounded-2xl p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200 text-[11px] font-bold">
              {getEntityKindLabel(activeConflict.entityKind)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Terdeteksi: {formatConflictDate(activeConflict.detectedAt)}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {activeConflict.entityTitle}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">{activeConflict.reason}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
            <div className="rounded-xl bg-sky-500/10 border border-sky-500/25 px-3 py-2 flex items-center gap-2 text-sky-900 dark:text-sky-200">
              <Laptop className="w-4 h-4 shrink-0" />
              <span>
                <b>Perubahan Lokal:</b> {formatConflictDate(activeConflict.localUpdatedAt)}
              </span>
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
              <Cloud className="w-4 h-4 shrink-0" />
              <span>
                <b>Versi Server Pusat:</b> {formatConflictDate(activeConflict.serverUpdatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Field-by-Field Diff Comparison */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Perbandingan Perbedaan Data ({activeConflict.diffs.length} field):
          </div>
          <div className="space-y-2.5">
            {activeConflict.diffs.map((diff) => {
              const selectedSource = fieldChoices[diff.field] || 'local';
              return (
                <div
                  key={diff.field}
                  className="glass-subtle rounded-2xl p-3.5 space-y-2.5 border border-white/30 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {diff.label}
                    </span>
                    {activeConflict.supportsMerge && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            setFieldChoices((prev) => ({ ...prev, [diff.field]: 'local' }))
                          }
                          className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 ${
                            selectedSource === 'local'
                              ? 'bg-sky-600 text-white'
                              : 'glass-surface text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {selectedSource === 'local' && <Check className="w-3 h-3" />}
                          Pilih Lokal
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFieldChoices((prev) => ({ ...prev, [diff.field]: 'server' }))
                          }
                          className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 ${
                            selectedSource === 'server'
                              ? 'bg-emerald-700 text-white'
                              : 'glass-surface text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {selectedSource === 'server' && <Check className="w-3 h-3" />}
                          Pilih Server
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                    <div
                      className={`rounded-xl p-3 border ${
                        selectedSource === 'local' && activeConflict.supportsMerge
                          ? 'bg-sky-500/15 border-sky-500/45'
                          : 'bg-white/50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 mb-1">
                        Data Lokal Anda
                      </div>
                      <div className="text-slate-900 dark:text-slate-100 break-words">
                        {diff.localValue}
                      </div>
                    </div>

                    <div
                      className={`rounded-xl p-3 border ${
                        selectedSource === 'server' && activeConflict.supportsMerge
                          ? 'bg-emerald-500/15 border-emerald-500/45'
                          : 'bg-white/50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
                        Data Server Terbaru
                      </div>
                      <div className="text-slate-900 dark:text-slate-100 break-words">
                        {diff.serverValue}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resolution Action Footer */}
        <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
          {conflicts.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <button
                type="button"
                disabled={resolving}
                onClick={() => handleBulk('use_server')}
                className="px-3 py-1.5 rounded-xl glass-subtle font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-500/15"
              >
                Gunakan Server Untuk Semua ({conflicts.length})
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={() => handleBulk('keep_local')}
                className="px-3 py-1.5 rounded-xl glass-subtle font-semibold text-slate-700 dark:text-slate-200 hover:bg-sky-500/15"
              >
                Pertahankan Lokal Untuk Semua
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Pilihan langsung tersinkron ke seluruh perangkat.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={resolving}
              onClick={() => handleAction('use_server')}
              data-testid="conflict-resolve-server-btn"
              className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle hover:bg-emerald-600/20 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5"
            >
              <Cloud className="w-3.5 h-3.5" />
              Gunakan Data Server
            </button>

            <button
              type="button"
              disabled={resolving}
              onClick={() => handleAction('keep_local')}
              data-testid="conflict-resolve-local-btn"
              className="glass-pill-btn px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Laptop className="w-3.5 h-3.5" />
              Pertahankan Data Lokal
            </button>

            {activeConflict.supportsMerge && (
              <button
                type="button"
                disabled={resolving}
                onClick={() => handleAction('merge')}
                data-testid="conflict-resolve-merge-btn"
                className="glass-pill-btn px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-md"
              >
                {resolving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <GitMerge className="w-3.5 h-3.5" />
                )}
                Gabungkan Pilihan (Merge)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
