import React, { useMemo, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import mammoth from 'mammoth';
import {
  Activity,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Pencil,
  PlayCircle,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type {
  ExamResult,
  ExamSchedule,
  LiveProctorSession,
  Question,
  QuestionOption,
  QuestionType,
  SyncStatus,
  TeacherAccount,
} from '../types/cbt';
import { cbtStore } from '../services/cbtStore';
import {
  buildResultsCsv,
  buildResultsExcelHtml,
  computeExamLiveCounts,
  computeScoreDistribution,
  createScheduleWithSnapshot,
  generateToken,
  getTeacherSubjects,
  gradeSubmission,
  parseWordTextFallback,
  sanitizeQuestionHtml,
  stripHtmlToText,
} from '../utils/cbtLogic';
import {
  GOOGLE_APPS_SCRIPT_CODE,
  testGoogleSheetsConnection,
} from '../services/googleSheetsService';
import { BrandLogo } from './GlassUI';
import { LiveMonitoringGrid } from './LiveMonitoringGrid';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { computeEntityFingerprint } from '../utils/conflictLogic';
import {
  InteractiveTourBanner,
  TOUR_STEPS,
  VideoTutorialModal,
} from './TeacherTutorialModals';

export type TeacherTab =
  | 'dashboard'
  | 'bank_soal'
  | 'jadwal'
  | 'hasil'
  | 'monitoring'
  | 'sheets';

interface TeacherPortalProps {
  teacher: TeacherAccount | null;
  onLoginSuccess: (t: TeacherAccount) => void;
  onLogout: () => void;
  onBackHome: () => void;
  activeTab: TeacherTab;
  onTabChange: (tab: TeacherTab) => void;
  tourStep: number | null;
  onStartTour: () => void;
  onNextTour: () => void;
  onFinishTour: () => void;
  videoOpen: boolean;
  onVideoOpenChange: (open: boolean) => void;
  questions: Question[];
  schedules: ExamSchedule[];
  results: ExamResult[];
  liveStreams: LiveProctorSession[];
  classes: string[];
  googleSheetsUrl: string;
  syncStatus: SyncStatus;
  conflictCount?: number;
  onOpenConflicts?: () => void;
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({
  teacher,
  onLoginSuccess,
  onLogout,
  onBackHome,
  activeTab,
  onTabChange,
  tourStep,
  onStartTour,
  onNextTour,
  onFinishTour,
  videoOpen,
  onVideoOpenChange,
  questions,
  schedules,
  results,
  liveStreams,
  classes,
  googleSheetsUrl,
  syncStatus,
  conflictCount = 0,
  onOpenConflicts,
}) => {
  // Login form state (completely clean, zero pre-filled credentials)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Multi-mapel active subject selector
  const teacherSubjects = useMemo(
    () => (teacher ? getTeacherSubjects(teacher) : []),
    [teacher]
  );
  const [selectedMapel, setSelectedMapel] = useState('');
  const activeMapel = useMemo(() => {
    if (!teacher) return '';
    if (selectedMapel && teacherSubjects.includes(selectedMapel)) return selectedMapel;
    return teacherSubjects[0] || teacher.mataPelajaran;
  }, [teacher, selectedMapel, teacherSubjects]);

  // Manual Question Form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [qType, setQType] = useState<QuestionType>('pg');
  const [qHtml, setQHtml] = useState('');
  const [qOptions, setQOptions] = useState<QuestionOption[]>([
    { key: 'A', label: '' },
    { key: 'B', label: '' },
    { key: 'C', label: '' },
    { key: 'D', label: '' },
    { key: 'E', label: '' },
  ]);
  const [qKeys, setQKeys] = useState<string[]>(['A']);
  const [qWeight, setQWeight] = useState(1);

  // Edit Question modal state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editQuestionBaseFp, setEditQuestionBaseFp] = useState('');
  const [eqHtml, setEqHtml] = useState('');
  const [eqTipe, setEqTipe] = useState<QuestionType>('pg');
  const [eqOpsi, setEqOpsi] = useState<QuestionOption[]>([]);
  const [eqKeys, setEqKeys] = useState<string[]>([]);
  const [eqWeight, setEqWeight] = useState(1);
  const [gradingBaseFp, setGradingBaseFp] = useState('');

  // Smart AI Importer state
  const [showImportModal, setShowImportModal] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [rawPasteHtml, setRawPasteHtml] = useState('');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [parsingAi, setParsingAi] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [previewQuestions, setPreviewQuestions] = useState<
    Omit<Question, 'id' | 'createdAt'>[]
  >([]);

  // Clear Bank Soal confirmation
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Schedule Form state
  const [schedTitle, setSchedTitle] = useState('');
  const [schedClasses, setSchedClasses] = useState<string[]>(classes);
  const [schedDuration, setSchedDuration] = useState(60);
  const [schedToken, setSchedToken] = useState(() => generateToken(6));
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // Essay Grading Modal & Results Filter
  const [gradingResult, setGradingResult] = useState<ExamResult | null>(null);
  const [essayScoresInput, setEssayScoresInput] = useState<Record<string, number>>({});
  const [filterKelas, setFilterKelas] = useState('ALL');
  const [kkmValue, setKkmValue] = useState(75);
  const [sheetsPushMsg, setSheetsPushMsg] = useState('');
  const [sheetsPushing, setSheetsPushing] = useState(false);

  // Google Sheets state
  const [sheetsInput, setSheetsInput] = useState(googleSheetsUrl);
  const [sheetsTestMsg, setSheetsTestMsg] = useState('');
  const [sheetsTesting, setSheetsTesting] = useState(false);
  const [showCodeGs, setShowCodeGs] = useState(false);

  const wordPasteEditorRef = useRef<HTMLDivElement | null>(null);

  // Subject-isolated datasets (scoped to activeMapel)
  const myQuestions = useMemo(
    () => (teacher ? questions.filter((q) => q.mataPelajaran === activeMapel) : []),
    [questions, teacher, activeMapel]
  );
  const mySchedules = useMemo(
    () => (teacher ? schedules.filter((s) => s.mataPelajaran === activeMapel) : []),
    [schedules, teacher, activeMapel]
  );
  const myResults = useMemo(
    () => (teacher ? results.filter((r) => r.mataPelajaran === activeMapel) : []),
    [results, teacher, activeMapel]
  );
  const filteredMyResults = useMemo(
    () =>
      filterKelas === 'ALL' ? myResults : myResults.filter((r) => r.kelas === filterKelas),
    [myResults, filterKelas]
  );
  const myLiveStreams = useMemo(
    () => (teacher ? liveStreams.filter((l) => l.mataPelajaran === activeMapel) : []),
    [liveStreams, teacher, activeMapel]
  );

  const analytics = useMemo(
    () => computeScoreDistribution(myResults, kkmValue),
    [myResults, kkmValue]
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!username.trim() || !password) {
      setLoginError('Username dan Password wajib diisi.');
      return;
    }
    setLoginLoading(true);
    const acc = await cbtStore.authenticateTeacher(username, password);
    setLoginLoading(false);
    if (!acc) {
      setLoginError('Username atau Password tidak valid, atau akun sedang dinonaktifkan.');
      return;
    }
    setUsername('');
    setPassword('');
    onLoginSuccess(acc);
  };

  if (!teacher) {
    return (
      <div className="max-w-md mx-auto animate-ios-enter">
        <div className="glass-surface rounded-3xl p-7 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <BrandLogo size="lg" />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Login Portal Guru
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                CBT MA Nurul Hijrah · Akses Terisolasi Per Mata Pelajaran
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="guru-login-user"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Username Guru
              </label>
              <input
                id="guru-login-user"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="guru-login-pass"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Password
              </label>
              <input
                id="guru-login-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {loginError && (
              <div
                role="alert"
                className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-200"
              >
                {loginError}
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onBackHome}
                className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={loginLoading}
                className="glass-pill-btn flex-1 py-2.5 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold shadow-lg"
              >
                {loginLoading ? 'Memverifikasi...' : 'Masuk Portal Guru'}
              </button>
            </div>
          </form>

          <div className="pt-4 border-t border-slate-200/50 dark:border-slate-700/50 text-center text-[11px] text-slate-500 dark:text-slate-400">
            Didukung penuh pada Google Chrome, Microsoft Edge, Safari iOS/macOS, dan Mozilla Firefox.
          </div>
        </div>
      </div>
    );
  }

  // Save manual question
  const handleSaveManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeHtml = sanitizeQuestionHtml(qHtml);
    const plainText = stripHtmlToText(safeHtml);
    if (!plainText) return;

    let finalOpsi: QuestionOption[] = [];
    let finalKeys: string[] = qKeys;

    if (qType === 'pg' || qType === 'pg_kompleks') {
      finalOpsi = qOptions.filter((o) => o.label.trim().length > 0);
      if (finalOpsi.length < 2) return;
    } else if (qType === 'benar_salah') {
      finalOpsi = [
        { key: 'BENAR', label: 'Benar' },
        { key: 'SALAH', label: 'Salah' },
      ];
      finalKeys = qKeys[0] === 'SALAH' ? ['SALAH'] : ['BENAR'];
    } else if (qType === 'esai') {
      finalKeys = [];
    }

    const newQ: Question = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mataPelajaran: activeMapel,
      guruId: teacher.id,
      tipe: qType,
      pertanyaanHtml: safeHtml.includes('<') ? safeHtml : `<p>${safeHtml}</p>`,
      pertanyaanTeks: plainText,
      opsi: finalOpsi,
      kunciJawaban: finalKeys,
      bobot: qWeight || 1,
      createdAt: new Date().toISOString(),
    };

    await cbtStore.addQuestions([newQ]);
    setQHtml('');
    setQOptions([
      { key: 'A', label: '' },
      { key: 'B', label: '' },
      { key: 'C', label: '' },
      { key: 'D', label: '' },
      { key: 'E', label: '' },
    ]);
    setQKeys(['A']);
    setShowManualForm(false);
  };

  const openEditQuestion = (q: Question) => {
    setEditingQuestion(q);
    setEditQuestionBaseFp(computeEntityFingerprint(q as unknown as Record<string, unknown>));
    setEqHtml(q.pertanyaanHtml || q.pertanyaanTeks);
    setEqTipe(q.tipe);
    setEqOpsi(
      q.opsi.length > 0
        ? q.opsi
        : [
            { key: 'A', label: '' },
            { key: 'B', label: '' },
            { key: 'C', label: '' },
            { key: 'D', label: '' },
          ]
    );
    setEqKeys(q.kunciJawaban);
    setEqWeight(q.bobot || 1);
  };

  const handleSaveEditQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    const safeHtml = sanitizeQuestionHtml(eqHtml);
    const plainText = stripHtmlToText(safeHtml);
    if (!plainText) return;
    const finalOpsi =
      eqTipe === 'pg' || eqTipe === 'pg_kompleks'
        ? eqOpsi.filter((o) => o.label.trim().length > 0)
        : eqTipe === 'benar_salah'
        ? [
            { key: 'BENAR', label: 'Benar' },
            { key: 'SALAH', label: 'Salah' },
          ]
        : [];
    await cbtStore.updateQuestion(
      {
        ...editingQuestion,
        tipe: eqTipe,
        pertanyaanHtml: safeHtml.includes('<') ? safeHtml : `<p>${safeHtml}</p>`,
        pertanyaanTeks: plainText,
        opsi: finalOpsi,
        kunciJawaban: eqTipe === 'esai' ? [] : eqKeys,
        bobot: eqWeight || 1,
      },
      editQuestionBaseFp || undefined
    );
    setEditingQuestion(null);
    setEditQuestionBaseFp('');
  };

  // Handle Document Upload (.docx / .pdf / .txt / .csv)
  const handleFileUpload = async (file: File) => {
    setImportFileName(file.name);
    setImportStatus('');
    setPdfBase64(null);
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.docx')) {
      setImportStatus('Mengekstrak dokumen Word (.docx) beserta tabel & gambar...');
      try {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        setRawPasteHtml(result.value);
        setRawPasteText(stripHtmlToText(result.value));
        if (wordPasteEditorRef.current) {
          wordPasteEditorRef.current.innerHTML = sanitizeQuestionHtml(result.value);
        }
        setImportStatus(
          'Berhasil mengekstrak file Word (.docx)! Klik "Ekstrak Soal Pintar AI" untuk memecah menjadi butir soal.'
        );
      } catch {
        setImportStatus('Gagal membaca file .docx. Pastikan file tidak terproteksi kata sandi.');
      }
    } else if (lower.endsWith('.pdf')) {
      setImportStatus('Memuat file PDF untuk ekstraksi AI...');
      const reader = new FileReader();
      reader.onload = () => {
        const resStr = String(reader.result || '');
        const base64 = resStr.includes(',') ? resStr.split(',')[1] : resStr;
        setPdfBase64(base64);
        setImportStatus(
          'File PDF siap! Klik "Ekstrak Soal Pintar AI" untuk memproses soal.'
        );
      };
      reader.readAsDataURL(file);
    } else {
      const txt = await file.text();
      setRawPasteText(txt);
      setRawPasteHtml('');
      setImportStatus('Teks dokumen dimuat. Klik "Ekstrak Soal Pintar AI" untuk pratinjau.');
    }
  };

  // Run Smart AI Question Parser
  const handleRunSmartParser = async () => {
    const htmlFromEditor = wordPasteEditorRef.current?.innerHTML || rawPasteHtml;
    const textFromEditor = wordPasteEditorRef.current?.innerText || rawPasteText;

    if (!textFromEditor.trim() && !htmlFromEditor.trim() && !pdfBase64) {
      setImportStatus('Tempel soal dari Word atau unggah file terlebih dahulu.');
      return;
    }

    setParsingAi(true);
    setImportStatus('Memproses dengan Smart AI Parser...');

    try {
      const res = await fetch('/api/ai/parse-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawContent: textFromEditor,
          htmlContent: htmlFromEditor,
          pdfBase64,
          mataPelajaran: activeMapel,
        }),
      });
      const data = (await res.json()) as {
        questions?: Array<{
          tipe: QuestionType;
          pertanyaanHtml: string;
          pertanyaanTeks: string;
          opsi: QuestionOption[];
          kunciJawaban: string[];
        }>;
        error?: string;
      };

      if (!res.ok || !data.questions || data.questions.length === 0) {
        throw new Error(data.error || 'AI tidak menemukan soal.');
      }

      const mapped = data.questions.map((q) => ({
        mataPelajaran: activeMapel,
        guruId: teacher.id,
        tipe: q.tipe || 'pg',
        pertanyaanHtml: sanitizeQuestionHtml(q.pertanyaanHtml || q.pertanyaanTeks),
        pertanyaanTeks: q.pertanyaanTeks || stripHtmlToText(q.pertanyaanHtml || ''),
        opsi: Array.isArray(q.opsi) ? q.opsi : [],
        kunciJawaban: Array.isArray(q.kunciJawaban) ? q.kunciJawaban : [],
        bobot: q.tipe === 'esai' ? 2 : 1,
      }));
      setPreviewQuestions(mapped);
      setImportStatus(`Berhasil mengekstrak ${mapped.length} soal siap simpan!`);
    } catch {
      // Deterministic heuristic fallback if AI key/network unavailable
      const fallback = parseWordTextFallback(
        textFromEditor || stripHtmlToText(htmlFromEditor),
        activeMapel,
        teacher.id
      );
      if (fallback.length > 0) {
        setPreviewQuestions(fallback);
        setImportStatus(
          `Diekstrak otomatis ${fallback.length} soal (mode parser lokal). Silakan periksa pratinjau.`
        );
      } else {
        setImportStatus(
          'Format soal belum dikenali. Gunakan penomoran seperti "1. Pertanyaan", opsi "A. ...", dan "Kunci: A".'
        );
      }
    } finally {
      setParsingAi(false);
    }
  };

  const handleSaveImportedQuestions = async () => {
    if (previewQuestions.length === 0) return;
    const ready: Question[] = previewQuestions.map((pq, i) => ({
      ...pq,
      id: `q-imp-${Date.now()}-${i}`,
      createdAt: new Date().toISOString(),
    }));
    await cbtStore.addQuestions(ready);
    setPreviewQuestions([]);
    setRawPasteText('');
    setRawPasteHtml('');
    setPdfBase64(null);
    setImportFileName('');
    setShowImportModal(false);
  };

  const downloadCsvTemplate = () => {
    const csv =
      'Nomor,Tipe,Pertanyaan,Opsi_A,Opsi_B,Opsi_C,Opsi_D,Opsi_E,Kunci\n' +
      '1,pg,"Hasil dari 5 x 6 adalah...",25,30,35,40,45,B\n' +
      '2,esai,"Jelaskan pengertian bangun datar persegi!",,,,,,';
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Template_Soal_CBT_MA_Nurul_Hijrah.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTitle.trim() || myQuestions.length === 0) return;
    const schedule = createScheduleWithSnapshot(
      {
        id: `sched-${Date.now()}`,
        judulUjian: schedTitle,
        mataPelajaran: activeMapel,
        guruId: teacher.id,
        guruNama: teacher.nama,
        kelasTarget: schedClasses.length > 0 ? schedClasses : classes,
        durasiMenit: schedDuration,
        token: schedToken,
        aktif: true,
      },
      myQuestions
    );
    await cbtStore.upsertSchedule(schedule);
    setSchedTitle('');
    setSchedToken(generateToken(6));
  };

  const exportTeacherResultsCsv = () => {
    const csv = buildResultsCsv(filteredMyResults);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Nilai_${activeMapel.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTeacherResultsExcel = () => {
    const html = buildResultsExcelHtml(filteredMyResults, `Rekap Nilai ${activeMapel}`);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Nilai_${activeMapel.replace(/\s+/g, '_')}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openGradingModal = (r: ExamResult) => {
    setGradingResult(r);
    setGradingBaseFp(computeEntityFingerprint(r as unknown as Record<string, unknown>));
    setEssayScoresInput(r.skorEsaiPerSoal || {});
  };

  const handleSaveEssayScores = async () => {
    if (!gradingResult) return;
    const qs = gradingResult.snapshotQuestions || myQuestions;
    const graded = gradeSubmission(qs, gradingResult.jawabanDetail, essayScoresInput);
    await cbtStore.updateResultEssayScores(
      gradingResult.id,
      essayScoresInput,
      graded.skorEsai,
      graded.nilaiAkhir,
      gradingBaseFp || undefined
    );
    setGradingResult(null);
    setGradingBaseFp('');
  };

  const sidebarItems: Array<{ id: TeacherTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'bank_soal', label: 'Data Modul / Bank Soal', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'jadwal', label: 'Data Tes / Jadwal Ujian', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'hasil', label: 'Hasil Tes & Koreksi Esai', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'monitoring', label: 'Live Monitoring Siswa', icon: <Video className="w-4 h-4" /> },
    { id: 'sheets', label: 'Pengaturan Google Sheets', icon: <Database className="w-4 h-4" /> },
  ];

  const highlightedTourTab = tourStep !== null ? TOUR_STEPS[tourStep]?.tab : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-ios-enter">
      {/* Left Sidebar (ZYACBT Modernized Glassmorphism) */}
      <aside className="lg:col-span-3 space-y-4">
        <div className="glass-surface rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {teacher.nama}
              </div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                Mapel: {activeMapel}
              </div>
            </div>
          </div>

          {teacherSubjects.length > 1 && (
            <div className="space-y-1">
              <label
                htmlFor="teacher-mapel-switch"
                className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
              >
                Pilih Mata Pelajaran Aktif:
              </label>
              <select
                id="teacher-mapel-switch"
                value={activeMapel}
                onChange={(e) => setSelectedMapel(e.target.value)}
                className="w-full rounded-xl glass-subtle px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
              >
                {teacherSubjects.map((subj) => (
                  <option key={subj} value={subj} className="bg-white dark:bg-slate-900">
                    {subj}
                  </option>
                ))}
              </select>
            </div>
          )}

          <nav className="space-y-1.5" aria-label="Menu Portal Guru">
            {sidebarItems.map((item) => {
              const active = activeTab === item.id;
              const isHighlighted = highlightedTourTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`glass-pill-btn w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                    active
                      ? 'bg-emerald-700 text-white shadow-md'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-emerald-500/15'
                  } ${isHighlighted ? 'ring-2 ring-amber-400' : ''}`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={onLogout}
            className="glass-pill-btn w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-200 text-xs font-bold"
          >
            <LogOut className="w-4 h-4" />
            Keluar Akun Guru
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <section className="lg:col-span-9 space-y-5">
        {/* PERSISTENT REAL-TIME SYNC INDICATOR ON EVERY TEACHER DASHBOARD TAB */}
        <SyncStatusIndicator
          syncStatus={syncStatus}
          conflictCount={conflictCount}
          onOpenConflicts={onOpenConflicts}
        />

        {tourStep !== null && (
          <InteractiveTourBanner
            stepIndex={tourStep}
            onNext={onNextTour}
            onFinish={onFinishTour}
          />
        )}

        {/* ==================== TAB: DASHBOARD ==================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            <div className="glass-surface rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Dashboard Guru — {activeMapel}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Kelola bank soal, jadwal tes, pemantauan kamera langsung, dan analisis nilai
                  kelas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onStartTour}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl glass-subtle text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5"
                >
                  <Compass className="w-4 h-4 text-emerald-600" />
                  Mulai Tur Panduan
                </button>
                <button
                  type="button"
                  onClick={() => onVideoOpenChange(true)}
                  className="glass-pill-btn px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <PlayCircle className="w-4 h-4" />
                  Tonton Video Tutorial (3 Menit)
                </button>
              </div>
            </div>

            {/* KPI Cards & KKM Control */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass-surface rounded-2xl p-5">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Soal di Modul
                </div>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {myQuestions.length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-5">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Jadwal Tes Aktif
                </div>
                <div className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                  {mySchedules.filter((s) => s.aktif).length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-5">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Siswa Mengumpulkan
                </div>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {myResults.length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-5 space-y-1">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>Tuntas KKM</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label="Nilai KKM"
                    value={kkmValue}
                    onChange={(e) =>
                      setKkmValue(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    className="w-14 rounded-lg glass-subtle px-1.5 py-0.5 text-center font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {analytics.lulusCount} ({analytics.passRate}%)
                </div>
              </div>
            </div>

            {/* Recharts Visual Analysis Module */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="glass-surface rounded-3xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Distribusi Nilai Ujian Siswa
                  </h3>
                  <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    Rata-rata: {analytics.overallAverage}
                  </span>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.buckets}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="jumlah" name="Jumlah Siswa" fill="#047857" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-surface rounded-3xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Rata-Rata Performa Per Kelas
                </h3>
                {analytics.classAverages.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-xs text-slate-500">
                    Belum ada data nilai siswa untuk ditampilkan.
                  </div>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.classAverages}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                        <XAxis dataKey="kelas" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="rataRata" name="Rata-rata Nilai" fill="#0284c7" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB: BANK SOAL ==================== */}
        {activeTab === 'bank_soal' && (
          <div className="space-y-5">
            <div className="glass-surface rounded-3xl p-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Bank Soal — {activeMapel}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Total {myQuestions.length} butir soal tersedia di modul
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onVideoOpenChange(true)}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl glass-subtle text-xs font-semibold flex items-center gap-1.5"
                >
                  <PlayCircle className="w-4 h-4 text-emerald-600" />
                  Tonton Video Tutorial (3 Menit)
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="glass-pill-btn px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  Import Soal Pintar AI
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualForm((v) => !v)}
                  className="glass-pill-btn px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Soal
                </button>
                {myQuestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(true)}
                    className="glass-pill-btn px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    Kosongkan Bank Soal
                  </button>
                )}
              </div>
            </div>

            {/* Manual Form */}
            {showManualForm && (
              <form
                onSubmit={handleSaveManualQuestion}
                className="glass-surface rounded-3xl p-6 space-y-4 animate-ios-enter"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Tambah Soal Baru ({activeMapel})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    aria-label="Tutup form soal"
                    className="w-8 h-8 rounded-lg glass-subtle flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Tipe Soal</label>
                    <select
                      value={qType}
                      onChange={(e) => {
                        const t = e.target.value as QuestionType;
                        setQType(t);
                        if (t === 'benar_salah') setQKeys(['BENAR']);
                        else if (t === 'pg') setQKeys(['A']);
                      }}
                      className="w-full rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="pg" className="bg-white dark:bg-slate-900">Pilihan Ganda (A-E)</option>
                      <option value="pg_kompleks" className="bg-white dark:bg-slate-900">Pilihan Ganda Kompleks</option>
                      <option value="benar_salah" className="bg-white dark:bg-slate-900">Benar / Salah</option>
                      <option value="isian_singkat" className="bg-white dark:bg-slate-900">Jawaban Singkat</option>
                      <option value="esai" className="bg-white dark:bg-slate-900">Esai / Uraian</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Bobot Poin</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={qWeight}
                      onChange={(e) => setQWeight(Number(e.target.value) || 1)}
                      className="w-full rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Pertanyaan Soal (Mendukung HTML/Tabel)
                  </label>
                  <textarea
                    rows={3}
                    value={qHtml}
                    onChange={(e) => setQHtml(e.target.value)}
                    placeholder="Ketik pertanyaan soal di sini..."
                    className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                {(qType === 'pg' || qType === 'pg_kompleks') && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold">
                      Opsi Jawaban & Kunci ({qType === 'pg_kompleks' ? 'Boleh pilih > 1' : 'Pilih 1 kunci'})
                    </label>
                    {qOptions.map((opt, idx) => {
                      const isKey = qKeys.includes(opt.key);
                      return (
                        <div key={opt.key} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (qType === 'pg') setQKeys([opt.key]);
                              else
                                setQKeys((prev) =>
                                  prev.includes(opt.key)
                                    ? prev.filter((k) => k !== opt.key)
                                    : [...prev, opt.key]
                                );
                            }}
                            className={`w-9 h-9 rounded-xl text-xs font-bold shrink-0 ${
                              isKey
                                ? 'bg-emerald-700 text-white'
                                : 'glass-subtle text-slate-600 dark:text-slate-300'
                            }`}
                            title="Klik untuk jadikan kunci jawaban"
                          >
                            {opt.key}
                          </button>
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => {
                              const next = [...qOptions];
                              next[idx] = { ...opt, label: e.target.value };
                              setQOptions(next);
                            }}
                            placeholder={`Teks pilihan ${opt.key}`}
                            className="flex-1 rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {qType === 'benar_salah' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold">Kunci Jawaban:</span>
                    {['BENAR', 'SALAH'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setQKeys([val])}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold ${
                          qKeys[0] === val
                            ? 'bg-emerald-700 text-white'
                            : 'glass-subtle text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                )}

                {qType === 'isian_singkat' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Kata Kunci Jawaban Benar
                    </label>
                    <input
                      type="text"
                      value={qKeys[0] || ''}
                      onChange={(e) => setQKeys([e.target.value])}
                      placeholder="Contoh: Jakarta"
                      className="w-full rounded-xl glass-subtle px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="glass-pill-btn px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"
                  >
                    Simpan ke Bank Soal
                  </button>
                </div>
              </form>
            )}

            {/* Question List */}
            {myQuestions.length === 0 ? (
              <div className="glass-surface rounded-3xl p-10 text-center space-y-2">
                <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Bank soal masih kosong
                </p>
                <p className="text-xs text-slate-500">
                  Tambahkan soal manual atau gunakan Import Soal Pintar AI dari file Word (.docx).
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {myQuestions.map((q, idx) => (
                  <div key={q.id} className="glass-surface rounded-2xl p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                        #{idx + 1} · {q.tipe.toUpperCase()} · Bobot {q.bobot}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditQuestion(q)}
                          aria-label={`Edit soal nomor ${idx + 1}`}
                          className="w-8 h-8 rounded-xl glass-subtle text-sky-600 hover:bg-sky-500/15 flex items-center justify-center"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => cbtStore.deleteQuestion(q.id)}
                          aria-label={`Hapus soal nomor ${idx + 1}`}
                          className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div
                      className="question-rich-html text-sm text-slate-900 dark:text-slate-100"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeQuestionHtml(q.pertanyaanHtml || q.pertanyaanTeks),
                      }}
                    />
                    {q.opsi.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-xs">
                        {q.opsi.map((o) => {
                          const isKey = q.kunciJawaban.includes(o.key);
                          return (
                            <div
                              key={o.key}
                              className={`px-3 py-1.5 rounded-xl ${
                                isKey
                                  ? 'bg-emerald-600/15 font-bold text-emerald-900 dark:text-emerald-200'
                                  : 'glass-subtle text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {o.key}. {o.label}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: JADWAL TES ==================== */}
        {activeTab === 'jadwal' && (
          <div className="space-y-5">
            <form
              onSubmit={handleCreateSchedule}
              className="glass-surface rounded-3xl p-6 space-y-4"
            >
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Buat Paket Tes / Jadwal Ujian Baru
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Saat jadwal dibuat, salinan (snapshot) {myQuestions.length} soal saat ini otomatis
                  dikunci ke dalam jadwal agar aman jika Bank Soal dikosongkan nanti.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Judul Ujian</label>
                  <input
                    type="text"
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    placeholder={`Contoh: PAS ${activeMapel}`}
                    className="w-full rounded-xl glass-subtle px-3.5 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Durasi (Menit)</label>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={schedDuration}
                    onChange={(e) => setSchedDuration(Number(e.target.value) || 60)}
                    className="w-full rounded-xl glass-subtle px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Kelas Target</label>
                  <div className="flex flex-wrap gap-1.5">
                    {classes.map((c) => {
                      const checked = schedClasses.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setSchedClasses((prev) =>
                              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                            )
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                            checked
                              ? 'bg-emerald-700 text-white'
                              : 'glass-subtle text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Token Ujian</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={schedToken}
                      onChange={(e) => setSchedToken(e.target.value.toUpperCase())}
                      className="flex-1 rounded-xl glass-subtle px-3.5 py-2 text-sm font-mono uppercase tracking-widest text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setSchedToken(generateToken(6))}
                      className="glass-pill-btn px-3 py-2 rounded-xl glass-subtle text-xs font-semibold"
                    >
                      Acak
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={myQuestions.length === 0 || !schedTitle.trim()}
                  className="glass-pill-btn px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 text-white text-xs font-bold"
                >
                  Terbitkan Jadwal Tes ({myQuestions.length} Soal)
                </button>
              </div>
            </form>

            {/* Schedule Cards */}
            <div className="space-y-3">
              {mySchedules.map((s) => {
                const counts = computeExamLiveCounts(s.id, results, liveStreams);
                return (
                  <div
                    key={s.id}
                    className="glass-surface rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {s.judulUjian}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            s.aktif
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {s.aktif ? 'AKTIF' : 'TERHENTI'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 tabular-nums">
                        Kelas: {(Array.isArray(s.kelasTarget) ? s.kelasTarget : []).join(', ') || 'Semua Kelas'} ·{' '}
                        {s.durasiMenit} Menit ·{' '}
                        {Array.isArray(s.questionsSnapshot) ? s.questionsSnapshot.length : 0} Soal Snapshot
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-sky-700 dark:text-sky-300 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          Sedang mengerjakan: {counts.activeCount}
                        </span>
                        <span className="text-emerald-700 dark:text-emerald-300">
                          Sudah mengirim: {counts.submittedCount}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(s.token);
                          setCopiedTokenId(s.id);
                          setTimeout(() => setCopiedTokenId(null), 1800);
                        }}
                        className="glass-pill-btn px-3 py-1.5 rounded-xl glass-subtle font-mono text-xs font-bold flex items-center gap-1.5"
                      >
                        {copiedTokenId === s.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        Token: {s.token}
                      </button>

                      <button
                        type="button"
                        onClick={() => cbtStore.upsertSchedule({ ...s, aktif: !s.aktif })}
                        className={`glass-pill-btn px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                          s.aktif
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                        }`}
                      >
                        {s.aktif ? 'Hentikan Paksa' : 'Aktifkan'}
                      </button>

                      <button
                        type="button"
                        onClick={() => cbtStore.deleteSchedule(s.id)}
                        aria-label={`Hapus jadwal ${s.judulUjian}`}
                        className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-600 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== TAB: HASIL TES & KOREKSI ESAI ==================== */}
        {activeTab === 'hasil' && (
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Hasil Tes &amp; Koreksi Esai ({activeMapel})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Menampilkan seluruh pengumpulan normal maupun pelanggaran secara real-time.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 no-print">
                <select
                  aria-label="Filter kelas hasil ujian"
                  value={filterKelas}
                  onChange={(e) => setFilterKelas(e.target.value)}
                  className="rounded-xl glass-subtle px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900">
                    Semua Kelas
                  </option>
                  {classes.map((c) => (
                    <option key={c} value={c} className="bg-white dark:bg-slate-900">
                      Kelas {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="glass-pill-btn px-3 py-2 rounded-xl glass-subtle text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={exportTeacherResultsCsv}
                  className="glass-pill-btn px-3 py-2 rounded-xl glass-subtle text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={exportTeacherResultsExcel}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel
                </button>
                <button
                  type="button"
                  disabled={sheetsPushing || filteredMyResults.length === 0}
                  onClick={async () => {
                    setSheetsPushing(true);
                    const res = await cbtStore.pushAllResultsToSheets(filteredMyResults);
                    setSheetsPushMsg(
                      !googleSheetsUrl
                        ? 'URL Web App Google Sheets belum diatur. Atur di menu Pengaturan Google Sheets.'
                        : `${res.sent} hasil berhasil dikirim ke Google Sheets${
                            res.failed > 0 ? `, ${res.failed} gagal.` : '.'
                          }`
                    );
                    setSheetsPushing(false);
                  }}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-45 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sheetsPushing ? 'Mengirim...' : 'Kirim ke Sheets'}
                </button>
              </div>
            </div>

            {sheetsPushMsg && (
              <div className="rounded-xl glass-subtle px-4 py-2.5 text-xs font-semibold text-sky-800 dark:text-sky-200">
                {sheetsPushMsg}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/70 dark:border-slate-700/70 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3 text-right">PG</th>
                    <th className="py-2.5 px-3 text-right">Esai</th>
                    <th className="py-2.5 px-3 text-right">Nilai Akhir</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 pl-3 text-right no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-slate-700/40">
                  {filteredMyResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Belum ada siswa yang mengumpulkan ujian untuk mata pelajaran / kelas ini.
                      </td>
                    </tr>
                  ) : (
                    filteredMyResults.map((r) => (
                      <tr key={r.id} className="hover:bg-white/30 dark:hover:bg-slate-800/30">
                        <td className="py-3 pr-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {r.namaSiswa}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {r.noPeserta}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold">{r.kelas}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{r.skorPG}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{r.skorEsai}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {r.nilaiAkhir}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                              r.status === 'Selesai'
                                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-200'
                            }`}
                          >
                            {r.status === 'Selesai' ? 'Selesai (Normal)' : 'Pelanggaran'}
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right space-x-1.5 no-print whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openGradingModal(r)}
                            className="px-2.5 py-1 rounded-lg bg-sky-600/15 text-sky-800 dark:text-sky-200 font-semibold"
                          >
                            Koreksi
                          </button>
                          <button
                            type="button"
                            onClick={() => cbtStore.resetStudentExamSession(r.id)}
                            title="Reset Sesi Ujian"
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200 font-semibold inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset Sesi
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB: LIVE MONITORING ==================== */}
        {activeTab === 'monitoring' && (
          <LiveMonitoringGrid
            sessions={myLiveStreams}
            title={`Live Monitoring Video & Audio (${activeMapel})`}
          />
        )}

        {/* ==================== TAB: GOOGLE SHEETS CONFIG ==================== */}
        {activeTab === 'sheets' && (
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Pengaturan Sinkronisasi Google Sheets (Apps Script)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Tempelkan URL Web App Google Apps Script untuk mencatat bank soal & hasil ujian ke
                Google Spreadsheet sekolah secara otomatis.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">
                URL Web App Google Apps Script
              </label>
              <input
                type="url"
                value={sheetsInput}
                onChange={(e) => setSheetsInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>

            {sheetsTestMsg && (
              <div className="rounded-xl glass-subtle px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                {sheetsTestMsg}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={sheetsTesting}
                onClick={async () => {
                  setSheetsTesting(true);
                  await cbtStore.saveSettings({ googleSheetsUrl: sheetsInput.trim() });
                  if (sheetsInput.trim()) {
                    const res = await testGoogleSheetsConnection(sheetsInput.trim());
                    setSheetsTestMsg(res.message);
                  } else {
                    setSheetsTestMsg('URL dikosongkan. Sistem menggunakan Firebase + LocalStorage.');
                  }
                  setSheetsTesting(false);
                }}
                className="glass-pill-btn px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold"
              >
                {sheetsTesting ? 'Menguji Koneksi...' : 'Simpan & Tes Koneksi'}
              </button>
              <button
                type="button"
                onClick={() => setShowCodeGs((v) => !v)}
                className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle text-xs font-semibold"
              >
                {showCodeGs ? 'Tutup Kode Code.gs' : 'Lihat Kode Google Apps Script (Code.gs)'}
              </button>
            </div>

            {showCodeGs && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span>Salin kode berikut ke Ekstensi &gt; Apps Script di Google Sheets:</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(GOOGLE_APPS_SCRIPT_CODE)}
                    className="text-emerald-700 dark:text-emerald-300 font-bold"
                  >
                    Salin Semua Kode
                  </button>
                </div>
                <pre className="rounded-2xl bg-slate-950 text-emerald-200 p-4 text-[11px] font-mono overflow-x-auto max-h-72">
                  {GOOGLE_APPS_SCRIPT_CODE}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ==================== MODAL: SMART AI IMPORTER ==================== */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-surface max-w-3xl w-full rounded-3xl p-6 space-y-4 max-h-[88vh] overflow-y-auto animate-ios-enter">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Smart AI Question Parser (Word / PDF / CSV / Paste)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Mendukung PG, PG Kompleks, Benar/Salah, Esai — menjaga tabel & gambar dari Microsoft Word!
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                aria-label="Tutup modal import"
                className="w-8 h-8 rounded-xl glass-subtle flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="glass-subtle rounded-2xl p-4 border border-dashed border-emerald-500/50 cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 hover:bg-emerald-500/10">
                <Upload className="w-6 h-6 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {importFileName || 'Upload File .docx, .pdf, .csv, atau .txt'}
                </span>
                <span className="text-[11px] text-slate-500">Klik untuk memilih file</span>
                <input
                  type="file"
                  accept=".docx,.pdf,.txt,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
              </label>

              <div className="glass-subtle rounded-2xl p-4 flex flex-col justify-between gap-2">
                <div className="text-xs text-slate-700 dark:text-slate-200">
                  Ingin mengisi lewat Excel terlebih dahulu? Unduh template CSV baku.
                </div>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="glass-pill-btn px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-800/70 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Unduh Template CSV
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">
                Atau Paste Langsung dari Microsoft Word / Notepad (Tabel & Gambar Terjaga):
              </label>
              <div
                ref={wordPasteEditorRef}
                contentEditable
                onInput={(e) => {
                  setRawPasteHtml(e.currentTarget.innerHTML);
                  setRawPasteText(e.currentTarget.innerText);
                }}
                className="question-rich-html min-h-[140px] max-h-[220px] overflow-y-auto rounded-2xl glass-subtle p-3.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {importStatus && (
              <div className="rounded-xl bg-emerald-600/15 px-3.5 py-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                {importStatus}
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-2">
              <button
                type="button"
                disabled={parsingAi}
                onClick={handleRunSmartParser}
                className="glass-pill-btn px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                {parsingAi ? 'AI Sedang Menganalisis...' : 'Ekstrak Soal Pintar AI'}
              </button>

              {previewQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveImportedQuestions}
                  className="glass-pill-btn px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Simpan {previewQuestions.length} Soal ke Bank Soal
                </button>
              )}
            </div>

            {previewQuestions.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                <div className="text-xs font-bold">Pratinjau Soal Hasil Ekstraksi:</div>
                {previewQuestions.map((pq, i) => (
                  <div key={i} className="glass-subtle rounded-2xl p-3.5 space-y-1.5 text-xs">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300">
                      #{i + 1} · {pq.tipe.toUpperCase()} · Kunci:{' '}
                      {(Array.isArray(pq.kunciJawaban) ? pq.kunciJawaban : []).join(', ') || 'Manual'}
                    </div>
                    <div
                      className="question-rich-html"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeQuestionHtml(pq.pertanyaanHtml),
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: CONFIRM CLEAR BANK SOAL ==================== */}
      {confirmClearOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-surface max-w-sm w-full rounded-3xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-rose-600">Kosongkan Bank Soal?</h3>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              Seluruh {myQuestions.length} soal di Bank Soal <b>{activeMapel}</b> akan
              dihapus. <b>Jadwal Tes yang sudah terbit tetap aman</b> karena menggunakan salinan
              (snapshot).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-4 py-2 rounded-xl glass-subtle text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  await cbtStore.clearTeacherQuestionBank(activeMapel);
                  setConfirmClearOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Ya, Kosongkan Bank Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: ESSAY GRADING ==================== */}
      {gradingResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-surface max-w-2xl w-full rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lembar Jawaban & Koreksi Esai — {gradingResult.namaSiswa}
                </h3>
                <p className="text-xs text-slate-500">
                  {gradingResult.kelas} · Status: {gradingResult.status}
                </p>
              </div>
              <button
                onClick={() => setGradingResult(null)}
                aria-label="Tutup koreksi"
                className="w-8 h-8 rounded-xl glass-subtle flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {(gradingResult.snapshotQuestions || myQuestions).map((q, idx) => {
                const ans = gradingResult.jawabanDetail[q.id];
                return (
                  <div key={q.id} className="glass-subtle rounded-2xl p-4 space-y-2 text-xs">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300">
                      Soal #{idx + 1} ({q.tipe.toUpperCase()})
                    </div>
                    <div className="text-slate-800 dark:text-slate-100">{q.pertanyaanTeks}</div>
                    <div className="rounded-xl bg-white/50 dark:bg-slate-900/50 p-2.5">
                      <b>Jawaban Siswa:</b>{' '}
                      {Array.isArray(ans) ? ans.join(', ') : ans || '(Tidak dijawab)'}
                    </div>
                    {q.tipe === 'esai' && (
                      <div className="flex items-center gap-2 pt-1">
                        <label className="font-semibold">Nilai Esai (0-100):</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={essayScoresInput[q.id] ?? 0}
                          onChange={(e) =>
                            setEssayScoresInput((prev) => ({
                              ...prev,
                              [q.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-24 rounded-lg glass-subtle px-2.5 py-1 font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGradingResult(null)}
                className="px-4 py-2 rounded-xl glass-subtle text-xs font-semibold"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleSaveEssayScores}
                className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold"
              >
                Simpan & Hitung Nilai Akhir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: EDIT QUESTION ==================== */}
      {editingQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEditQuestion}
            className="glass-surface max-w-2xl w-full rounded-3xl p-6 space-y-4 max-h-[88vh] overflow-y-auto animate-ios-enter"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Soal ({activeMapel})
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                aria-label="Tutup edit soal"
                className="w-8 h-8 rounded-xl glass-subtle flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Tipe Soal</label>
                <select
                  value={eqTipe}
                  onChange={(e) => {
                    const t = e.target.value as QuestionType;
                    setEqTipe(t);
                    if (t === 'benar_salah') setEqKeys(['BENAR']);
                    else if (t === 'pg' && eqKeys.length === 0) setEqKeys(['A']);
                  }}
                  className="w-full rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="pg" className="bg-white dark:bg-slate-900">Pilihan Ganda</option>
                  <option value="pg_kompleks" className="bg-white dark:bg-slate-900">Pilihan Ganda Kompleks</option>
                  <option value="benar_salah" className="bg-white dark:bg-slate-900">Benar / Salah</option>
                  <option value="isian_singkat" className="bg-white dark:bg-slate-900">Jawaban Singkat</option>
                  <option value="esai" className="bg-white dark:bg-slate-900">Esai / Uraian</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Bobot Poin</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={eqWeight}
                  onChange={(e) => setEqWeight(Number(e.target.value) || 1)}
                  className="w-full rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Pertanyaan Soal (HTML/Teks)</label>
              <textarea
                rows={4}
                value={eqHtml}
                onChange={(e) => setEqHtml(e.target.value)}
                className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>

            {(eqTipe === 'pg' || eqTipe === 'pg_kompleks') && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold">Opsi &amp; Kunci Jawaban</label>
                {eqOpsi.map((opt, idx) => {
                  const isKey = eqKeys.includes(opt.key);
                  return (
                    <div key={opt.key} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (eqTipe === 'pg') setEqKeys([opt.key]);
                          else
                            setEqKeys((prev) =>
                              prev.includes(opt.key)
                                ? prev.filter((k) => k !== opt.key)
                                : [...prev, opt.key]
                            );
                        }}
                        className={`w-9 h-9 rounded-xl text-xs font-bold shrink-0 ${
                          isKey
                            ? 'bg-emerald-700 text-white'
                            : 'glass-subtle text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {opt.key}
                      </button>
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => {
                          const next = [...eqOpsi];
                          next[idx] = { ...opt, label: e.target.value };
                          setEqOpsi(next);
                        }}
                        className="flex-1 rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {eqTipe === 'benar_salah' && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold">Kunci Jawaban:</span>
                {['BENAR', 'SALAH'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setEqKeys([val])}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold ${
                      eqKeys[0] === val
                        ? 'bg-emerald-700 text-white'
                        : 'glass-subtle text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            )}

            {eqTipe === 'isian_singkat' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Kata Kunci Jawaban Benar</label>
                <input
                  type="text"
                  value={eqKeys[0] || ''}
                  onChange={(e) => setEqKeys([e.target.value])}
                  className="w-full rounded-xl glass-subtle px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl glass-subtle text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Video Tutorial Modal */}
      <VideoTutorialModal open={videoOpen} onClose={() => onVideoOpenChange(false)} />
    </div>
  );
};
