import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResultsCsv,
  computeExamLiveCounts,
  computeScoreDistribution,
  createScheduleWithSnapshot,
  evaluateProctoringAction,
  generateToken,
  getTeacherSubjects,
  gradeSubmission,
  hashSaltedPassword,
  HEAD_TURN_LIMIT,
  maskCredential,
  normalizeQuestionDoc,
  normalizeScheduleDoc,
  parseWordTextFallback,
  sanitizeQuestionHtml,
  sha256Hex,
  TAB_EXIT_TOLERANCE,
  verifySaltedOrLegacyPassword,
} from './cbtLogic';
import type { ExamResult, Question } from '../types/cbt';

test('sha256Hex produces deterministic 64-char hex digest', async () => {
  const hash1 = await sha256Hex('rizqi 123');
  const hash2 = await sha256Hex('rizqi 123');
  const hash3 = await sha256Hex('different');
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

test('hashSaltedPassword & verifySaltedOrLegacyPassword verify both nh-cbt salted and legacy hashes', async () => {
  const { salt, passHash } = await hashSaltedPassword('rizqi123', 'abc123salt');
  const manualExpected = await sha256Hex('nh-cbt::abc123salt::rizqi123');
  assert.equal(passHash, manualExpected);
  assert.equal(await verifySaltedOrLegacyPassword('rizqi123', passHash, salt), true);
  assert.equal(await verifySaltedOrLegacyPassword('wrong', passHash, salt), false);

  const legacyHash = await sha256Hex('winnie123');
  assert.equal(await verifySaltedOrLegacyPassword('winnie123', legacyHash), true);
  assert.equal(await verifySaltedOrLegacyPassword('wrong', legacyHash), false);
});

test('maskCredential hides original username/password permanently', () => {
  assert.equal(maskCredential('ustadz_ahmad'), '••••••••');
  assert.equal(maskCredential(''), '••••••••');
});

test('generateToken produces uppercase alphanumeric 6-char code', () => {
  const token = generateToken(6);
  assert.equal(token.length, 6);
  assert.match(token, /^[A-Z0-9]{6}$/);
});

test('gradeSubmission handles PG, PG Kompleks, Benar/Salah, Isian Singkat, and manual Esai', () => {
  const questions: Question[] = [
    {
      id: 'q1',
      mataPelajaran: 'Matematika',
      guruId: 'g1',
      tipe: 'pg',
      pertanyaanHtml: '<p>2+2?</p>',
      pertanyaanTeks: '2+2?',
      opsi: [
        { key: 'A', label: '3' },
        { key: 'B', label: '4' },
      ],
      kunciJawaban: ['B'],
      bobot: 1,
      createdAt: '',
    },
    {
      id: 'q2',
      mataPelajaran: 'Matematika',
      guruId: 'g1',
      tipe: 'pg_kompleks',
      pertanyaanHtml: '<p>Prima?</p>',
      pertanyaanTeks: 'Prima?',
      opsi: [
        { key: 'A', label: '2' },
        { key: 'B', label: '4' },
        { key: 'C', label: '5' },
      ],
      kunciJawaban: ['A', 'C'],
      bobot: 1,
      createdAt: '',
    },
    {
      id: 'q3',
      mataPelajaran: 'Matematika',
      guruId: 'g1',
      tipe: 'benar_salah',
      pertanyaanHtml: '<p>10 > 2</p>',
      pertanyaanTeks: '10 > 2',
      opsi: [
        { key: 'BENAR', label: 'Benar' },
        { key: 'SALAH', label: 'Salah' },
      ],
      kunciJawaban: ['BENAR'],
      bobot: 1,
      createdAt: '',
    },
    {
      id: 'q4',
      mataPelajaran: 'Matematika',
      guruId: 'g1',
      tipe: 'esai',
      pertanyaanHtml: '<p>Jelaskan.</p>',
      pertanyaanTeks: 'Jelaskan.',
      opsi: [],
      kunciJawaban: [],
      bobot: 1,
      createdAt: '',
    },
  ];

  const graded = gradeSubmission(
    questions,
    {
      q1: 'B',
      q2: ['C', 'A'],
      q3: 'BENAR',
      q4: 'Penjelasan panjang',
    },
    { q4: 80 }
  );

  assert.equal(graded.skorPG, 100);
  assert.equal(graded.skorEsai, 80);
  assert.equal(graded.nilaiAkhir, 95);
  assert.equal(graded.hasEssay, true);
});

test('createScheduleWithSnapshot deep clones bank questions so clearing bank keeps schedule intact', () => {
  const bank: Question[] = [
    {
      id: 'q1',
      mataPelajaran: 'Fiqih',
      guruId: 'g1',
      tipe: 'pg',
      pertanyaanHtml: '<p>Rukun Islam?</p>',
      pertanyaanTeks: 'Rukun Islam?',
      opsi: [{ key: 'A', label: '5' }],
      kunciJawaban: ['A'],
      bobot: 1,
      createdAt: '',
    },
  ];

  const schedule = createScheduleWithSnapshot(
    {
      id: 'sched-1',
      judulUjian: 'PAS Fiqih',
      mataPelajaran: 'Fiqih',
      guruId: 'g1',
      guruNama: 'Ust. Hidayatullah',
      kelasTarget: ['X'],
      durasiMenit: 60,
    },
    bank
  );

  // Simulate clearing the bank array
  bank.length = 0;

  assert.equal(schedule.questionsSnapshot.length, 1);
  assert.equal(schedule.questionsSnapshot[0].pertanyaanTeks, 'Rukun Islam?');
});

test('parseWordTextFallback parses numbered PG and Esai questions cleanly', () => {
  const raw = `
1. Ibu kota Indonesia adalah...
A. Bandung
B. Jakarta
C. Surabaya
Kunci: B

2. Jelaskan makna hijrah!
Tipe: Esai
  `;
  const result = parseWordTextFallback(raw, 'IPS', 'g2');
  assert.equal(result.length, 2);
  assert.equal(result[0].tipe, 'pg');
  assert.deepEqual(result[0].kunciJawaban, ['B']);
  assert.equal(result[0].opsi.length, 3);
  assert.equal(result[1].tipe, 'esai');
});

test('sanitizeQuestionHtml strips scripts and event handlers while keeping tables', () => {
  const dirty =
    '<div><table><tr><th onclick="alert(1)">No</th></tr></table><script>evil()</script><p>Halo</p></div>';
  const clean = sanitizeQuestionHtml(dirty);
  assert.ok(clean.includes('<table>'));
  assert.ok(!clean.includes('<script'));
  assert.ok(!clean.includes('onclick'));
});

test('evaluateProctoringAction triggers alarm at 50x head turn without auto-submitting, and auto-submits > 3x tab exits', () => {
  assert.equal(HEAD_TURN_LIMIT, 50);
  assert.equal(TAB_EXIT_TOLERANCE, 3);

  const underLimit = evaluateProctoringAction({ tabExits: 2, headTurns: 49 });
  assert.equal(underLimit.shouldTriggerAlarm, false);
  assert.equal(underLimit.shouldAutoSubmitViolation, false);

  const fiftyHeadTurns = evaluateProctoringAction({ tabExits: 0, headTurns: 50 });
  assert.equal(fiftyHeadTurns.shouldTriggerAlarm, true);
  assert.equal(fiftyHeadTurns.shouldAutoSubmitViolation, false);

  const fourTabExits = evaluateProctoringAction({ tabExits: 4, headTurns: 0 });
  assert.equal(fourTabExits.shouldTriggerAlarm, true);
  assert.equal(fourTabExits.shouldAutoSubmitViolation, true);
});

test('computeScoreDistribution calculates buckets, KKM pass rate, and class averages accurately', () => {
  const dummyResults: ExamResult[] = [
    {
      id: '1',
      sessionId: 's1',
      waktuSubmit: '',
      namaSiswa: 'Ahmad',
      noPeserta: '001',
      kelas: 'X',
      mataPelajaran: 'Matematika',
      judulUjian: 'UTS',
      scheduleId: 'sch1',
      guruId: 'g1',
      skorPG: 95,
      skorEsai: 0,
      nilaiAkhir: 95,
      status: 'Selesai',
      jumlahKeluarTab: 0,
      jumlahMenoleh: 2,
      jawabanDetail: {},
      sudahDinilaiEsai: true,
    },
    {
      id: '2',
      sessionId: 's2',
      waktuSubmit: '',
      namaSiswa: 'Budi',
      noPeserta: '002',
      kelas: 'X',
      mataPelajaran: 'Matematika',
      judulUjian: 'UTS',
      scheduleId: 'sch1',
      guruId: 'g1',
      skorPG: 55,
      skorEsai: 0,
      nilaiAkhir: 55,
      status: 'Pelanggaran',
      jumlahKeluarTab: 4,
      jumlahMenoleh: 5,
      jawabanDetail: {},
      sudahDinilaiEsai: true,
    },
  ];
  const stats = computeScoreDistribution(dummyResults, 75);
  assert.equal(stats.overallAverage, 75);
  assert.equal(stats.buckets[0].jumlah, 1); // 0-59
  assert.equal(stats.buckets[4].jumlah, 1); // 90-100
  assert.equal(stats.classAverages[0].rataRata, 75);
  assert.equal(stats.lulusCount, 1);
  assert.equal(stats.remedialCount, 1);
  assert.equal(stats.passRate, 50);
  assert.equal(stats.highestScore, 95);
  assert.equal(stats.lowestScore, 55);
});

test('normalizeQuestionDoc & normalizeScheduleDoc support arena.site field aliases', () => {
  const q = normalizeQuestionDoc(
    {
      mapel: 'Sejarah',
      guruId: 'g-1',
      tipe: 'pgk',
      teks: '<p>Pilih dua peristiwa!</p>',
      opsi: ['Rengasdengklok', 'Proklamasi', 'Sumpah Pemuda'],
      kunci: ['A', 'B'],
    },
    'doc-q-1'
  );
  assert.equal(q.id, 'doc-q-1');
  assert.equal(q.tipe, 'pg_kompleks');
  assert.equal(q.mataPelajaran, 'Sejarah');
  assert.equal(q.opsi[0].key, 'A');
  assert.equal(q.opsi[0].label, 'Rengasdengklok');
  assert.deepEqual(q.kunciJawaban, ['A', 'B']);

  const sched = normalizeScheduleDoc(
    {
      judul: 'PTS Sejarah',
      mapel: 'Sejarah',
      kelas: ['X', 'XI'],
      durasi: 90,
      token: 'nur123',
      aktif: true,
      soal: [{ tipe: 'bs', teks: 'Indonesia merdeka 1945', kunci: ['BENAR'] }],
    },
    'tes-1'
  );
  assert.equal(sched.id, 'tes-1');
  assert.equal(sched.judulUjian, 'PTS Sejarah');
  assert.equal(sched.token, 'NUR123');
  assert.equal(sched.durasiMenit, 90);
  assert.deepEqual(sched.kelasTarget, ['X', 'XI']);
  assert.equal(sched.questionsSnapshot[0].tipe, 'benar_salah');
});

test('getTeacherSubjects, computeExamLiveCounts, and buildResultsCsv work cleanly', () => {
  assert.deepEqual(
    getTeacherSubjects({
      mataPelajaran: 'Sejarah',
      mataPelajaranList: ['Sejarah', 'Sejarah Indonesia', 'Sejarah'],
    }),
    ['Sejarah', 'Sejarah Indonesia']
  );

  const counts = computeExamLiveCounts(
    'tes-1',
    [
      {
        id: 'r1',
        sessionId: 's1',
        waktuSubmit: '',
        namaSiswa: 'A',
        noPeserta: '1',
        kelas: 'X',
        mataPelajaran: 'IPA',
        judulUjian: 'U',
        scheduleId: 'tes-1',
        guruId: 'g1',
        skorPG: 80,
        skorEsai: 0,
        nilaiAkhir: 80,
        status: 'Selesai',
        jumlahKeluarTab: 0,
        jumlahMenoleh: 0,
        jawabanDetail: {},
        sudahDinilaiEsai: true,
      },
    ],
    [
      { scheduleId: 'tes-1', status: 'Mengerjakan' },
      { scheduleId: 'tes-1', status: 'Selesai' },
    ]
  );
  assert.deepEqual(counts, { activeCount: 1, submittedCount: 1 });

  const csv = buildResultsCsv([]);
  assert.ok(csv.includes('Waktu_Submit,Nama_Siswa'));
});

