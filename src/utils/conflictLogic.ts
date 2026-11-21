import type {
  ConflictEntityKind,
  ConflictFieldDiff,
  PendingLocalChange,
  SyncConflict,
} from '../types/cbt';

const ENTITY_LABELS: Record<ConflictEntityKind, string> = {
  question: 'Bank Soal',
  schedule: 'Jadwal Ujian',
  teacher: 'Akun Guru',
  result: 'Hasil / Nilai Ujian',
  subject: 'Mata Pelajaran',
  class: 'Kelas',
  settings: 'Pengaturan Sistem',
};

const FIELD_METADATA: Record<ConflictEntityKind, Array<{ field: string; label: string }>> = {
  question: [
    { field: 'mataPelajaran', label: 'Mata Pelajaran' },
    { field: 'tipe', label: 'Tipe Soal' },
    { field: 'pertanyaanTeks', label: 'Teks Pertanyaan' },
    { field: 'opsi', label: 'Pilihan Jawaban' },
    { field: 'kunciJawaban', label: 'Kunci Jawaban' },
    { field: 'bobot', label: 'Bobot Poin' },
  ],
  schedule: [
    { field: 'judulUjian', label: 'Judul Ujian' },
    { field: 'mataPelajaran', label: 'Mata Pelajaran' },
    { field: 'kelasTarget', label: 'Kelas Target' },
    { field: 'durasiMenit', label: 'Durasi (Menit)' },
    { field: 'token', label: 'Token Ujian' },
    { field: 'aktif', label: 'Status Aktif' },
  ],
  teacher: [
    { field: 'nama', label: 'Nama Lengkap' },
    { field: 'username', label: 'Username' },
    { field: 'mataPelajaranList', label: 'Mata Pelajaran Diampu' },
    { field: 'aktif', label: 'Status Akun' },
  ],
  result: [
    { field: 'skorPG', label: 'Skor Pilihan Ganda' },
    { field: 'skorEsai', label: 'Skor Esai' },
    { field: 'nilaiAkhir', label: 'Nilai Akhir' },
    { field: 'status', label: 'Status Pengumpulan' },
    { field: 'sudahDinilaiEsai', label: 'Status Koreksi Esai' },
  ],
  subject: [
    { field: 'nama', label: 'Nama Mata Pelajaran' },
    { field: 'urut', label: 'Urutan' },
  ],
  class: [
    { field: 'nama', label: 'Nama Kelas' },
    { field: 'urut', label: 'Urutan' },
  ],
  settings: [
    { field: 'googleSheetsUrl', label: 'URL Google Sheets Apps Script' },
    { field: 'institutionName', label: 'Nama Lembaga' },
  ],
};

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      // Exclude volatile timestamp/hash helper fields from semantic diff comparison
      if (key === 'updatedAt' || key === 'passwordHash' || key === 'salt') continue;
      sorted[key] = stableNormalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function computeEntityFingerprint(data: Record<string, unknown> | null | undefined): string {
  if (!data) return 'null';
  return JSON.stringify(stableNormalize(data));
}

function formatDiffValue(val: unknown): string {
  if (val === undefined || val === null || val === '') return '(Kosong)';
  if (typeof val === 'boolean') return val ? 'Aktif / Ya' : 'Nonaktif / Tidak';
  if (Array.isArray(val)) {
    if (val.length === 0) return '(Kosong)';
    return val
      .map((item) => {
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          if ('key' in o && 'label' in o) return `${o.key}: ${o.label}`;
          return JSON.stringify(o);
        }
        return String(item);
      })
      .join(', ');
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

export function computeFieldDiffs(
  entityKind: ConflictEntityKind,
  localData: Record<string, unknown>,
  serverData: Record<string, unknown>
): ConflictFieldDiff[] {
  const fields = FIELD_METADATA[entityKind] || [];
  const diffs: ConflictFieldDiff[] = [];

  for (const meta of fields) {
    const lv = localData[meta.field];
    const sv = serverData[meta.field];
    if (JSON.stringify(stableNormalize(lv)) !== JSON.stringify(stableNormalize(sv))) {
      diffs.push({
        field: meta.field,
        label: meta.label,
        localValue: formatDiffValue(lv),
        serverValue: formatDiffValue(sv),
      });
    }
  }

  // Fallback: if no known metadata field differed (e.g. passwordHash or nested object), inspect top keys
  if (diffs.length === 0) {
    const allKeys = new Set([...Object.keys(localData), ...Object.keys(serverData)]);
    for (const k of allKeys) {
      if (k === 'updatedAt' || k === 'createdAt') continue;
      if (JSON.stringify(stableNormalize(localData[k])) !== JSON.stringify(stableNormalize(serverData[k]))) {
        diffs.push({
          field: k,
          label: k === 'pertanyaanHtml' ? 'Konten HTML Soal' : k,
          localValue: formatDiffValue(localData[k]),
          serverValue: formatDiffValue(serverData[k]),
        });
      }
    }
  }

  return diffs;
}

export function getEntityKindLabel(kind: ConflictEntityKind): string {
  return ENTITY_LABELS[kind] || 'Data CBT';
}

export type ConflictEvalResult =
  | { status: 'already_synced' }
  | { status: 'safe_to_push_local' }
  | { status: 'conflict'; conflict: SyncConflict };

export function evaluatePendingVsServer(
  pending: PendingLocalChange,
  serverData: Record<string, unknown> | null,
  serverUpdatedAt?: string
): ConflictEvalResult {
  const localFp = computeEntityFingerprint(pending.localData);
  const serverFp = computeEntityFingerprint(serverData);

  // If server deleted the record while we modified it locally
  if (!serverData) {
    if (pending.baseHash === 'null') {
      // It's a brand-new local record not yet on server -> safe to push!
      return { status: 'safe_to_push_local' };
    }
    return {
      status: 'conflict',
      conflict: {
        id: pending.conflictKey,
        entityKind: pending.entityKind,
        entityId: pending.entityId,
        entityTitle: pending.entityTitle,
        detectedAt: new Date().toISOString(),
        localUpdatedAt: pending.localUpdatedAt,
        serverUpdatedAt: serverUpdatedAt || new Date().toISOString(),
        localData: pending.localData,
        serverData: { _deletedOnServer: true },
        diffs: [
          {
            field: '_deletedOnServer',
            label: 'Keberadaan Data',
            localValue: 'Ada perubahan lokal yang belum tersinkron',
            serverValue: 'Telah dihapus di server oleh Admin/Guru lain',
          },
        ],
        supportsMerge: false,
        reason: `${getEntityKindLabel(pending.entityKind)} diubah secara lokal namun telah dihapus di server.`,
      },
    };
  }

  // Server already equals local change
  if (localFp === serverFp) {
    return { status: 'already_synced' };
  }

  // Server has not changed since local edit began -> safe to replay local edit without conflict
  if (serverFp === pending.baseHash) {
    return { status: 'safe_to_push_local' };
  }

  // Both server and local changed independently -> Conflict!
  const diffs = computeFieldDiffs(pending.entityKind, pending.localData, serverData);
  if (diffs.length === 0) {
    return { status: 'already_synced' };
  }

  const supportsMerge =
    pending.entityKind === 'question' ||
    pending.entityKind === 'schedule' ||
    pending.entityKind === 'teacher' ||
    pending.entityKind === 'result' ||
    pending.entityKind === 'settings';

  return {
    status: 'conflict',
    conflict: {
      id: pending.conflictKey,
      entityKind: pending.entityKind,
      entityId: pending.entityId,
      entityTitle: pending.entityTitle,
      detectedAt: new Date().toISOString(),
      localUpdatedAt: pending.localUpdatedAt,
      serverUpdatedAt:
        serverUpdatedAt ||
        (typeof serverData.updatedAt === 'string' ? serverData.updatedAt : new Date().toISOString()),
      localData: pending.localData,
      serverData,
      diffs,
      supportsMerge,
      reason: `Perubahan lokal pada ${getEntityKindLabel(pending.entityKind)} berbenturan dengan pembaruan terbaru dari server.`,
    },
  };
}

export function buildMergedEntity(
  conflict: SyncConflict,
  fieldChoices?: Record<string, 'local' | 'server'>
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...conflict.serverData,
  };

  // Start by merging per-field explicit choices (or default smart merge: prefer local non-empty edits on conflicted fields)
  for (const diff of conflict.diffs) {
    const choice = fieldChoices?.[diff.field] || 'local';
    if (choice === 'local') {
      base[diff.field] = conflict.localData[diff.field];
    } else {
      base[diff.field] = conflict.serverData[diff.field];
    }
  }

  // Smart array union when both modified array targets & no explicit override restricted it
  if (
    conflict.entityKind === 'schedule' &&
    (!fieldChoices || !fieldChoices['kelasTarget']) &&
    Array.isArray(conflict.localData.kelasTarget) &&
    Array.isArray(conflict.serverData.kelasTarget)
  ) {
    base.kelasTarget = Array.from(
      new Set([
        ...(conflict.serverData.kelasTarget as string[]),
        ...(conflict.localData.kelasTarget as string[]),
      ])
    );
  }

  if (
    conflict.entityKind === 'teacher' &&
    (!fieldChoices || !fieldChoices['mataPelajaranList']) &&
    Array.isArray(conflict.localData.mataPelajaranList) &&
    Array.isArray(conflict.serverData.mataPelajaranList)
  ) {
    const union = Array.from(
      new Set([
        ...(conflict.serverData.mataPelajaranList as string[]),
        ...(conflict.localData.mataPelajaranList as string[]),
      ])
    );
    base.mataPelajaranList = union;
    base.mataPelajaran = union[0] || base.mataPelajaran;
  }

  if (conflict.entityKind === 'question' && base.pertanyaanTeks && !fieldChoices?.pertanyaanHtml) {
    if (base.pertanyaanTeks === conflict.localData.pertanyaanTeks && conflict.localData.pertanyaanHtml) {
      base.pertanyaanHtml = conflict.localData.pertanyaanHtml;
    } else if (conflict.serverData.pertanyaanHtml) {
      base.pertanyaanHtml = conflict.serverData.pertanyaanHtml;
    }
  }

  base.updatedAt = new Date().toISOString();
  return base;
}
