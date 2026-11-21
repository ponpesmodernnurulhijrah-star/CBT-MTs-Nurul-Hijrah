import type {
  ExamResult,
  ExamSchedule,
  Question,
  QuestionOption,
  QuestionType,
  StudentAnswerValue,
} from '../types/cbt';

export const APP_VERSION = '2026.11.21-ma-nh-v1';

export const DEFAULT_SUBJECTS: string[] = [
  'Bahasa Indonesia',
  'Bahasa Inggris',
  'IPS',
  'Matematika',
  'Bahasa Arab',
  'Tahfidz Fiqih',
  'SKI',
  'Aqidah Akhlaq',
  'Qurdits',
  'TIK',
  'Seni Rupa',
  'PPKN',
];

export const DEFAULT_CLASSES: string[] = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const HEAD_TURN_LIMIT = 50; // 50x turns triggers loud alarm without ending exam
export const TAB_EXIT_TOLERANCE = 3; // > 3x triggers auto-submit violation

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const hashBuffer = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback only if subtle unavailable in non-secure context
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function generateSalt(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function hashSaltedPassword(
  password: string,
  providedSalt?: string
): Promise<{ salt: string; passHash: string }> {
  const salt = providedSalt || generateSalt(16);
  const passHash = await sha256Hex(`nh-cbt::${salt}::${password}`);
  return { salt, passHash };
}

export async function verifySaltedOrLegacyPassword(
  password: string,
  expectedHash: string,
  salt?: string
): Promise<boolean> {
  if (!expectedHash) return false;
  if (salt) {
    const salted = await sha256Hex(`nh-cbt::${salt}::${password}`);
    if (salted === expectedHash) return true;
  }
  const legacy = await sha256Hex(password);
  return legacy === expectedHash;
}

export function maskCredential(_value: string): string {
  return '••••••••';
}

export function generateToken(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function sanitizeQuestionHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  let clean = rawHtml
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed|form|input|button|link|meta)[^>]*?>([\s\S]*?<\/\1>)?/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');

  // Preserve safe src on img (https, http, data:image/)
  clean = clean.replace(/<img([^>]*)>/gi, (_match, attrs: string) => {
    const srcMatch = attrs.match(/src\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const src = srcMatch ? (srcMatch[1] || srcMatch[2] || '').trim() : '';
    const isSafeSrc =
      src.startsWith('data:image/') ||
      src.startsWith('https://') ||
      src.startsWith('http://') ||
      src.startsWith('/');
    if (!isSafeSrc) return '';
    const altMatch = attrs.match(/alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const alt = altMatch ? altMatch[1] || altMatch[2] || 'Gambar soal' : 'Gambar soal';
    return `<img src="${src.replace(/"/g, '&quot;')}" alt="${alt.replace(/"/g, '&quot;')}" referrerpolicy="no-referrer" />`;
  });

  return clean.trim();
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gradeSubmission(
  questions: Question[],
  answers: Record<string, StudentAnswerValue>,
  manualEssayScores: Record<string, number> = {}
): {
  skorPG: number;
  skorEsai: number;
  nilaiAkhir: number;
  hasEssay: boolean;
} {
  if (!questions || questions.length === 0) {
    return { skorPG: 0, skorEsai: 0, nilaiAkhir: 0, hasEssay: false };
  }

  let autoWeightTotal = 0;
  let autoWeightEarned = 0;
  let essayWeightTotal = 0;
  let essayWeightEarned = 0;
  let hasEssay = false;

  for (const q of questions) {
    const weight = q.bobot > 0 ? q.bobot : 1;
    const ans = answers[q.id];

    if (q.tipe === 'esai') {
      hasEssay = true;
      essayWeightTotal += weight;
      const manual = manualEssayScores[q.id];
      if (typeof manual === 'number' && !Number.isNaN(manual)) {
        const clamped = Math.max(0, Math.min(100, manual));
        essayWeightEarned += (clamped / 100) * weight;
      }
      continue;
    }

    autoWeightTotal += weight;

    if (q.tipe === 'pg' || q.tipe === 'benar_salah') {
      const selected = typeof ans === 'string' ? ans.trim().toUpperCase() : '';
      const expected = (q.kunciJawaban[0] || '').trim().toUpperCase();
      if (selected && expected && selected === expected) {
        autoWeightEarned += weight;
      }
    } else if (q.tipe === 'pg_kompleks') {
      const selectedList = Array.isArray(ans)
        ? ans.map((x) => x.trim().toUpperCase()).filter(Boolean).sort()
        : [];
      const expectedList = q.kunciJawaban
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean)
        .sort();
      if (
        expectedList.length > 0 &&
        selectedList.length === expectedList.length &&
        selectedList.every((v, idx) => v === expectedList[idx])
      ) {
        autoWeightEarned += weight;
      }
    } else if (q.tipe === 'isian_singkat') {
      const given = typeof ans === 'string' ? ans.trim().toLowerCase() : '';
      const accepted = q.kunciJawaban.map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (given && accepted.includes(given)) {
        autoWeightEarned += weight;
      }
    }
  }

  const skorPG =
    autoWeightTotal > 0 ? Math.round((autoWeightEarned / autoWeightTotal) * 100) : 0;
  const skorEsai =
    essayWeightTotal > 0 ? Math.round((essayWeightEarned / essayWeightTotal) * 100) : 0;

  const totalWeight = autoWeightTotal + essayWeightTotal;
  const nilaiAkhir =
    totalWeight > 0
      ? Math.round(((autoWeightEarned + essayWeightEarned) / totalWeight) * 100)
      : 0;

  return {
    skorPG,
    skorEsai,
    nilaiAkhir,
    hasEssay,
  };
}

export function createScheduleWithSnapshot(
  params: {
    id: string;
    judulUjian: string;
    mataPelajaran: string;
    guruId: string;
    guruNama: string;
    kelasTarget: string[];
    durasiMenit: number;
    token?: string;
    aktif?: boolean;
  },
  bankQuestions: Question[]
): ExamSchedule {
  const snapshot: Question[] = bankQuestions.map((q) => ({
    ...q,
    opsi: q.opsi.map((o) => ({ ...o })),
    kunciJawaban: [...q.kunciJawaban],
  }));

  return {
    id: params.id,
    judulUjian: params.judulUjian.trim(),
    mataPelajaran: params.mataPelajaran,
    guruId: params.guruId,
    guruNama: params.guruNama,
    kelasTarget: params.kelasTarget.length > 0 ? [...params.kelasTarget] : ['X'],
    durasiMenit: Math.max(5, params.durasiMenit || 60),
    token: (params.token || generateToken(6)).toUpperCase(),
    aktif: params.aktif ?? true,
    questionsSnapshot: snapshot,
    createdAt: new Date().toISOString(),
  };
}

export function parseWordTextFallback(
  rawInput: string,
  mataPelajaran: string,
  guruId: string
): Omit<Question, 'id' | 'createdAt'>[] {
  const text = rawInput.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  // Split blocks starting with "1.", "2.", "1)", etc.
  const blocks = text
    .split(/\n(?=\s*\d+[\.\)]\s+)/)
    .map((b) => b.trim())
    .filter(Boolean);

  const parsed: Omit<Question, 'id' | 'createdAt'>[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // Remove leading number "1. " or "1) "
    const stemLines: string[] = [];
    const options: QuestionOption[] = [];
    let keys: string[] = [];
    let explicitType: QuestionType | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (i === 0) {
        line = line.replace(/^\d+[\.\)]\s*/, '');
      }

      const tipeMatch = line.match(/^Tipe\s*:\s*(.+)$/i);
      if (tipeMatch) {
        const val = tipeMatch[1].trim().toLowerCase();
        if (val.includes('kompleks')) explicitType = 'pg_kompleks';
        else if (val.includes('benar') || val.includes('true')) explicitType = 'benar_salah';
        else if (val.includes('singkat')) explicitType = 'isian_singkat';
        else if (val.includes('esai') || val.includes('uraian')) explicitType = 'esai';
        else explicitType = 'pg';
        continue;
      }

      const keyMatch = line.match(/^(?:Kunci|Jawaban)\s*:\s*(.+)$/i);
      if (keyMatch) {
        const rawKey = keyMatch[1].trim();
        keys = rawKey
          .split(/[,;\s]+/)
          .map((k) => k.trim())
          .filter(Boolean);
        continue;
      }

      const optMatch = line.match(/^([A-Ea-e])[\.\)]\s+(.+)$/);
      if (optMatch) {
        options.push({
          key: optMatch[1].toUpperCase(),
          label: optMatch[2].trim(),
        });
        continue;
      }

      stemLines.push(line);
    }

    const pertanyaanTeks = stemLines.join(' ').trim();
    if (!pertanyaanTeks) continue;

    let tipe: QuestionType = explicitType || 'pg';
    let finalOptions = options;

    if (!explicitType) {
      if (options.length >= 2) {
        tipe = keys.length > 1 ? 'pg_kompleks' : 'pg';
      } else if (
        keys.length === 1 &&
        ['benar', 'salah', 'true', 'false'].includes(keys[0].toLowerCase())
      ) {
        tipe = 'benar_salah';
      } else if (keys.length >= 1 && options.length === 0) {
        tipe = 'isian_singkat';
      } else {
        tipe = 'esai';
      }
    }

    if (tipe === 'benar_salah' && finalOptions.length === 0) {
      finalOptions = [
        { key: 'BENAR', label: 'Benar' },
        { key: 'SALAH', label: 'Salah' },
      ];
      keys = keys.map((k) =>
        k.toLowerCase().startsWith('b') || k.toLowerCase() === 'true' ? 'BENAR' : 'SALAH'
      );
    }

    parsed.push({
      mataPelajaran,
      guruId,
      tipe,
      pertanyaanHtml: `<p>${pertanyaanTeks.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
      pertanyaanTeks,
      opsi: finalOptions,
      kunciJawaban: keys.length > 0 ? keys : tipe === 'pg' ? ['A'] : [],
      bobot: 1,
    });
  }

  return parsed;
}

export function computeScoreDistribution(
  results: ExamResult[],
  kkm = 75
): {
  buckets: { range: string; jumlah: number }[];
  classAverages: { kelas: string; rataRata: number; jumlahSiswa: number; lulus: number }[];
  overallAverage: number;
  lulusCount: number;
  remedialCount: number;
  passRate: number;
  highestScore: number;
  lowestScore: number;
} {
  const buckets = [
    { range: '0-59', jumlah: 0 },
    { range: '60-69', jumlah: 0 },
    { range: '70-79', jumlah: 0 },
    { range: '80-89', jumlah: 0 },
    { range: '90-100', jumlah: 0 },
  ];

  const classMap = new Map<string, { sum: number; count: number; lulus: number }>();
  let totalSum = 0;
  let lulusCount = 0;
  let highestScore = 0;
  let lowestScore = results.length > 0 ? 100 : 0;

  for (const r of results) {
    const score = Number.isFinite(r.nilaiAkhir) ? r.nilaiAkhir : 0;
    totalSum += score;
    if (score >= kkm) lulusCount++;
    if (score > highestScore) highestScore = score;
    if (score < lowestScore) lowestScore = score;

    if (score < 60) buckets[0].jumlah++;
    else if (score < 70) buckets[1].jumlah++;
    else if (score < 80) buckets[2].jumlah++;
    else if (score < 90) buckets[3].jumlah++;
    else buckets[4].jumlah++;

    const prev = classMap.get(r.kelas) || { sum: 0, count: 0, lulus: 0 };
    classMap.set(r.kelas, {
      sum: prev.sum + score,
      count: prev.count + 1,
      lulus: prev.lulus + (score >= kkm ? 1 : 0),
    });
  }

  const classAverages = Array.from(classMap.entries()).map(([kelas, stats]) => ({
    kelas,
    rataRata: Math.round((stats.sum / stats.count) * 10) / 10,
    jumlahSiswa: stats.count,
    lulus: stats.lulus,
  }));

  const overallAverage =
    results.length > 0 ? Math.round((totalSum / results.length) * 10) / 10 : 0;
  const remedialCount = Math.max(0, results.length - lulusCount);
  const passRate = results.length > 0 ? Math.round((lulusCount / results.length) * 100) : 0;

  return {
    buckets,
    classAverages,
    overallAverage,
    lulusCount,
    remedialCount,
    passRate,
    highestScore,
    lowestScore,
  };
}

export function evaluateProctoringAction(params: {
  tabExits: number;
  headTurns: number;
}): {
  shouldTriggerAlarm: boolean;
  shouldAutoSubmitViolation: boolean;
  reason?: string;
} {
  if (params.tabExits > TAB_EXIT_TOLERANCE) {
    return {
      shouldTriggerAlarm: true,
      shouldAutoSubmitViolation: true,
      reason: `Keluar aplikasi/pindah tab melebihi batas toleransi (${params.tabExits}x dari maksimal ${TAB_EXIT_TOLERANCE}x)`,
    };
  }
  if (params.headTurns >= HEAD_TURN_LIMIT) {
    // Per user spec: 50x head/eye turn limit triggers loud alarm and does NOT end the exam!
    return {
      shouldTriggerAlarm: true,
      shouldAutoSubmitViolation: false,
      reason: `Batas menoleh/mata berpaling (${HEAD_TURN_LIMIT}x) tercapai! Alarm peringatan diaktifkan.`,
    };
  }
  return {
    shouldTriggerAlarm: false,
    shouldAutoSubmitViolation: false,
  };
}

export function normalizeQuestionType(rawType: unknown): QuestionType {
  const val = String(rawType || 'pg').toLowerCase().trim();
  if (val === 'pgk' || val === 'pg_kompleks') return 'pg_kompleks';
  if (val === 'bs' || val === 'benar_salah') return 'benar_salah';
  if (val === 'isian' || val === 'isian_singkat') return 'isian_singkat';
  if (val === 'esai' || val === 'uraian') return 'esai';
  return 'pg';
}

export function toRemoteQuestionType(tipe: QuestionType): string {
  switch (tipe) {
    case 'pg_kompleks':
      return 'pgk';
    case 'benar_salah':
      return 'bs';
    case 'isian_singkat':
      return 'isian';
    default:
      return tipe;
  }
}

export function normalizeQuestionDoc(
  raw: Record<string, unknown>,
  fallbackId?: string
): Question {
  const tipe = normalizeQuestionType(raw.tipe ?? raw.type);
  const pertanyaanHtml = String(
    raw.pertanyaanHtml ?? raw.pertanyaan ?? raw.teks ?? ''
  );
  const pertanyaanTeks = String(
    raw.pertanyaanTeks || stripHtmlToText(pertanyaanHtml)
  );

  const rawOpsi = Array.isArray(raw.opsi)
    ? raw.opsi
    : Array.isArray(raw.options)
    ? raw.options
    : [];

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const opsi: QuestionOption[] = rawOpsi
    .map((item, idx) => {
      if (typeof item === 'string') {
        return { key: letters[idx] || String(idx + 1), label: item };
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return {
          key: String(obj.key || letters[idx] || String(idx + 1)).toUpperCase(),
          label: String(obj.label ?? obj.teks ?? obj.text ?? ''),
        };
      }
      return null;
    })
    .filter((o): o is QuestionOption => Boolean(o && (o.label || o.key)));

  const rawKunci = raw.kunciJawaban ?? raw.kunci;
  let kunciJawaban: string[] = [];
  if (Array.isArray(rawKunci)) {
    kunciJawaban = rawKunci.map((k) => {
      if (typeof k === 'number' && letters[k]) return letters[k];
      return String(k).trim();
    });
  } else if (typeof rawKunci === 'string' && rawKunci.trim()) {
    kunciJawaban = rawKunci
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (typeof rawKunci === 'number' && letters[rawKunci]) {
    kunciJawaban = [letters[rawKunci]];
  }

  return {
    id: String(raw.id || fallbackId || `q-${Date.now()}`),
    mataPelajaran: String(raw.mataPelajaran || raw.mapel || 'Matematika'),
    guruId: String(raw.guruId || ''),
    tipe,
    pertanyaanHtml: pertanyaanHtml || `<p>${pertanyaanTeks}</p>`,
    pertanyaanTeks,
    opsi,
    kunciJawaban,
    bobot: Number(raw.bobot) || 1,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

export function normalizeScheduleDoc(
  raw: Record<string, unknown>,
  fallbackId?: string
): ExamSchedule {
  const rawKelas = raw.kelasTarget ?? raw.kelas;
  const kelasTarget = Array.isArray(rawKelas)
    ? rawKelas.map(String).filter(Boolean)
    : typeof rawKelas === 'string' && rawKelas.trim()
    ? rawKelas
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const rawSnapshot = Array.isArray(raw.questionsSnapshot)
    ? raw.questionsSnapshot
    : Array.isArray(raw.soal)
    ? raw.soal
    : [];

  return {
    id: String(raw.id || fallbackId || `sched-${Date.now()}`),
    judulUjian: String(raw.judulUjian || raw.judul || 'Ujian CBT'),
    mataPelajaran: String(raw.mataPelajaran || raw.mapel || 'Matematika'),
    guruId: String(raw.guruId || ''),
    guruNama: String(raw.guruNama || 'Guru Mapel'),
    kelasTarget,
    token: String(raw.token || 'NH2026').toUpperCase(),
    durasiMenit: Number(raw.durasiMenit ?? raw.durasi) || 60,
    aktif: raw.aktif !== false,
    questionsSnapshot: rawSnapshot.map((q, idx) =>
      normalizeQuestionDoc((q || {}) as Record<string, unknown>, `q-snap-${idx}`)
    ),
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

export function normalizeResultDoc(
  raw: Record<string, unknown>,
  fallbackId?: string
): ExamResult {
  const rawStatus = String(raw.status || 'Selesai').toLowerCase();
  const status = rawStatus.includes('pelanggaran') ? 'Pelanggaran' : 'Selesai';
  const rawSnap = Array.isArray(raw.snapshotQuestions)
    ? raw.snapshotQuestions
    : Array.isArray(raw.soalSnapshot)
    ? raw.soalSnapshot
    : undefined;

  return {
    id: String(raw.id || fallbackId || `res-${Date.now()}`),
    sessionId: String(raw.sessionId || raw.id || fallbackId || ''),
    waktuSubmit: String(
      raw.waktuSubmit || raw.submittedAt || raw.createdAt || new Date().toISOString()
    ),
    namaSiswa: String(raw.namaSiswa || raw.nama || 'Siswa'),
    noPeserta: String(raw.noPeserta || '-'),
    kelas: String(raw.kelas || '-'),
    mataPelajaran: String(raw.mataPelajaran || raw.mapel || '-'),
    judulUjian: String(raw.judulUjian || raw.judulTes || 'Ujian CBT'),
    scheduleId: String(raw.scheduleId || raw.tesId || ''),
    guruId: String(raw.guruId || ''),
    skorPG: Number(raw.skorPG ?? raw.skorPg ?? 0) || 0,
    skorEsai: Number(raw.skorEsai ?? 0) || 0,
    nilaiAkhir: Number(raw.nilaiAkhir ?? 0) || 0,
    status,
    alasanPelanggaran:
      typeof (raw.alasanPelanggaran ?? raw.alasan) === 'string'
        ? String(raw.alasanPelanggaran ?? raw.alasan)
        : undefined,
    jumlahKeluarTab: Number(raw.jumlahKeluarTab ?? raw.pelanggaranTab ?? 0) || 0,
    jumlahMenoleh: Number(raw.jumlahMenoleh ?? raw.menoleh ?? 0) || 0,
    jawabanDetail:
      (raw.jawabanDetail as Record<string, StudentAnswerValue>) ||
      (raw.jawaban as Record<string, StudentAnswerValue>) ||
      {},
    skorEsaiPerSoal: raw.skorEsaiPerSoal as Record<string, number> | undefined,
    snapshotQuestions: rawSnap
      ? rawSnap.map((q, idx) =>
          normalizeQuestionDoc((q || {}) as Record<string, unknown>, `q-res-${idx}`)
        )
      : undefined,
    sudahDinilaiEsai: Boolean(raw.sudahDinilaiEsai ?? raw.dinilaiEsai ?? true),
  };
}

export function getTeacherSubjects(teacher: {
  mataPelajaran: string;
  mataPelajaranList?: string[];
}): string[] {
  const list = Array.isArray(teacher.mataPelajaranList)
    ? teacher.mataPelajaranList.map((s) => s.trim()).filter(Boolean)
    : [];
  if (list.length > 0) return Array.from(new Set(list));
  return teacher.mataPelajaran ? [teacher.mataPelajaran] : [];
}

export function computeExamLiveCounts(
  scheduleId: string,
  results: ExamResult[],
  liveStreams: Array<{ scheduleId: string; status: string }>
): { activeCount: number; submittedCount: number } {
  const activeCount = liveStreams.filter(
    (l) => l.scheduleId === scheduleId && l.status === 'Mengerjakan'
  ).length;
  const submittedCount = results.filter((r) => r.scheduleId === scheduleId).length;
  return { activeCount, submittedCount };
}

export function buildResultsCsv(results: ExamResult[]): string {
  const header =
    'Waktu_Submit,Nama_Siswa,No_Peserta,Kelas,Mata_Pelajaran,Judul_Ujian,Skor_PG,Skor_Esai,Nilai_Akhir,Status,Alasan_Pelanggaran\n';
  const rows = results
    .map((r) =>
      [
        r.waktuSubmit,
        `"${(r.namaSiswa || '').replace(/"/g, '""')}"`,
        `"${(r.noPeserta || '').replace(/"/g, '""')}"`,
        `"${(r.kelas || '').replace(/"/g, '""')}"`,
        `"${(r.mataPelajaran || '').replace(/"/g, '""')}"`,
        `"${(r.judulUjian || '').replace(/"/g, '""')}"`,
        r.skorPG,
        r.skorEsai,
        r.nilaiAkhir,
        r.status === 'Selesai' ? 'Selesai (Normal)' : 'Pelanggaran',
        `"${(r.alasanPelanggaran || '-').replace(/"/g, '""')}"`,
      ].join(',')
    )
    .join('\n');
  return '\uFEFF' + header + rows;
}

export function buildResultsExcelHtml(results: ExamResult[], title = 'Rekap Nilai CBT'): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const rowsHtml = results
    .map(
      (r, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${esc(r.namaSiswa)}</td>
        <td>${esc(r.noPeserta)}</td>
        <td>${esc(r.kelas)}</td>
        <td>${esc(r.mataPelajaran)}</td>
        <td>${esc(r.judulUjian)}</td>
        <td>${r.skorPG}</td>
        <td>${r.skorEsai}</td>
        <td>${r.nilaiAkhir}</td>
        <td>${r.status === 'Selesai' ? 'Selesai (Normal)' : 'Pelanggaran'}</td>
      </tr>`
    )
    .join('');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body>
    <h3>${esc(title)} - MA Nurul Hijrah</h3>
    <table border="1">
      <thead><tr><th>No</th><th>Nama Siswa</th><th>No Peserta</th><th>Kelas</th><th>Mata Pelajaran</th><th>Judul Ujian</th><th>Skor PG</th><th>Skor Esai</th><th>Nilai Akhir</th><th>Status</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body></html>`;
}

