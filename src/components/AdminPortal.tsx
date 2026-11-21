import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Layers,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  School,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import type {
  AdminAccount,
  ClassItem,
  ExamResult,
  ExamSchedule,
  LiveProctorSession,
  Question,
  QuestionOption,
  QuestionType,
  SubjectItem,
  SyncStatus,
  TeacherAccount,
} from '../types/cbt';
import {
  cbtStore,
  getActiveFirebaseConfig,
  isForceLocalMode,
} from '../services/cbtStore';
import {
  APP_VERSION,
  buildResultsCsv,
  buildResultsExcelHtml,
  computeExamLiveCounts,
  computeScoreDistribution,
  getTeacherSubjects,
  hashSaltedPassword,
  maskCredential,
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

export type AdminTab =
  | 'dashboard'
  | 'guru'
  | 'mapel'
  | 'kelas'
  | 'bank_soal'
  | 'jadwal'
  | 'rekap_nilai'
  | 'analisis'
  | 'monitoring'
  | 'sheets'
  | 'database'
  | 'akun';

interface AdminPortalProps {
  admin: AdminAccount | null;
  onLoginSuccess: (a: AdminAccount) => void;
  onAdminUpdated: (a: AdminAccount) => void;
  onLogout: () => void;
  onBackHome: () => void;
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  teachers: TeacherAccount[];
  subjects: string[];
  subjectItems: SubjectItem[];
  classes: string[];
  classItems: ClassItem[];
  questions: Question[];
  schedules: ExamSchedule[];
  results: ExamResult[];
  liveStreams: LiveProctorSession[];
  cloudConnected: boolean;
  syncStatus: SyncStatus;
  conflictCount?: number;
  onOpenConflicts?: () => void;
  googleSheetsUrl: string;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  admin,
  onLoginSuccess,
  onAdminUpdated,
  onLogout,
  onBackHome,
  activeTab,
  onTabChange,
  teachers,
  subjects,
  subjectItems,
  classes,
  classItems,
  questions,
  schedules,
  results,
  liveStreams,
  cloudConnected,
  syncStatus,
  conflictCount = 0,
  onOpenConflicts,
  googleSheetsUrl,
}) => {
  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Subject CRUD & Inline Rename
  const [newSubject, setNewSubject] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');

  // Class CRUD & Inline Rename
  const [newClass, setNewClass] = useState('');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState('');

  // Teacher CRUD & Multi-Mapel
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [tNama, setTNama] = useState('');
  const [tUser, setTUser] = useState('');
  const [tPass, setTPass] = useState('');
  const [tMapelList, setTMapelList] = useState<string[]>(() =>
    subjects[0] ? [subjects[0]] : []
  );

  // Edit Teacher Modal
  const [editingTeacher, setEditingTeacher] = useState<TeacherAccount | null>(null);
  const [editTeacherBaseFp, setEditTeacherBaseFp] = useState('');
  const [editNama, setEditNama] = useState('');
  const [editMapelList, setEditMapelList] = useState<string[]>([]);
  const [editAktif, setEditAktif] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState('');

  // Print Teachers Preview
  const [showPrintTeachers, setShowPrintTeachers] = useState(false);

  // Monitor Bank Soal (Semua Guru)
  const [bankFilterMapel, setBankFilterMapel] = useState('ALL');
  const [bankFilterTipe, setBankFilterTipe] = useState('ALL');
  const [bankSearch, setBankSearch] = useState('');
  const [confirmClearBank, setConfirmClearBank] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editQuestionBaseFp, setEditQuestionBaseFp] = useState('');
  const [eqHtml, setEqHtml] = useState('');
  const [eqTipe, setEqTipe] = useState<QuestionType>('pg');
  const [eqOpsi, setEqOpsi] = useState<QuestionOption[]>([]);
  const [eqKeys, setEqKeys] = useState<string[]>([]);
  const [eqWeight, setEqWeight] = useState(1);

  // Jadwal & Kontrol Ujian
  const [schedFilterMapel, setSchedFilterMapel] = useState('ALL');
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // Results filters & export
  const [filterMapel, setFilterMapel] = useState('ALL');
  const [filterKelas, setFilterKelas] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [sheetsPushMsg, setSheetsPushMsg] = useState('');
  const [sheetsPushing, setSheetsPushing] = useState(false);

  // Analisis Nilai
  const [analisisMapel, setAnalisisMapel] = useState('ALL');
  const [analisisKelas, setAnalisisKelas] = useState('ALL');
  const [kkmValue, setKkmValue] = useState(75);

  // Google Sheets config
  const [sheetsInput, setSheetsInput] = useState(googleSheetsUrl);
  const [sheetsMsg, setSheetsMsg] = useState('');
  const [sheetsTesting, setSheetsTesting] = useState(false);
  const [showCodeGs, setShowCodeGs] = useState(false);

  // Database Connection tab
  const [dbTestMsg, setDbTestMsg] = useState('');
  const [dbTesting, setDbTesting] = useState(false);
  const [fbJsonInput, setFbJsonInput] = useState('');
  const [fbOverrideMsg, setFbOverrideMsg] = useState('');

  // Admin Account Settings tab
  const [curAdminPass, setCurAdminPass] = useState('');
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [adminAccountMsg, setAdminAccountMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [adminSaving, setAdminSaving] = useState(false);

  const filteredQuestions = useMemo(() => {
    const qLower = bankSearch.trim().toLowerCase();
    return questions.filter((q) => {
      if (bankFilterMapel !== 'ALL' && q.mataPelajaran !== bankFilterMapel) return false;
      if (bankFilterTipe !== 'ALL' && q.tipe !== bankFilterTipe) return false;
      if (qLower && !q.pertanyaanTeks.toLowerCase().includes(qLower)) return false;
      return true;
    });
  }, [questions, bankFilterMapel, bankFilterTipe, bankSearch]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (schedFilterMapel !== 'ALL' && s.mataPelajaran !== schedFilterMapel) return false;
      return true;
    });
  }, [schedules, schedFilterMapel]);

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (filterMapel !== 'ALL' && r.mataPelajaran !== filterMapel) return false;
      if (filterKelas !== 'ALL' && r.kelas !== filterKelas) return false;
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      return true;
    });
  }, [results, filterMapel, filterKelas, filterStatus]);

  const analisisResults = useMemo(() => {
    return results.filter((r) => {
      if (analisisMapel !== 'ALL' && r.mataPelajaran !== analisisMapel) return false;
      if (analisisKelas !== 'ALL' && r.kelas !== analisisKelas) return false;
      return true;
    });
  }, [results, analisisMapel, analisisKelas]);

  const analisisStats = useMemo(
    () => computeScoreDistribution(analisisResults, kkmValue),
    [analisisResults, kkmValue]
  );

  const rekapAvg = useMemo(() => {
    if (filteredResults.length === 0) return 0;
    const sum = filteredResults.reduce((acc, r) => acc + (r.nilaiAkhir || 0), 0);
    return Math.round((sum / filteredResults.length) * 10) / 10;
  }, [filteredResults]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!username.trim() || !password) {
      setLoginError('Username dan Password Admin wajib diisi.');
      return;
    }
    setLoginLoading(true);
    const acc = await cbtStore.authenticateAdmin(username, password);
    setLoginLoading(false);
    if (!acc) {
      setLoginError('Username atau Password Super Admin tidak valid.');
      return;
    }
    setUsername('');
    setPassword('');
    onLoginSuccess(acc);
  };

  if (!admin) {
    return (
      <div className="max-w-md mx-auto animate-ios-enter">
        <div className="glass-surface rounded-3xl p-7 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <BrandLogo size="lg" />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Login Super Admin
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                CBT MA Nurul Hijrah · Kendali Pusat Sistem Ujian
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-login-user"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Username Admin
              </label>
              <input
                id="admin-login-user"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username admin"
                className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="admin-login-pass"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Password Admin
              </label>
              <input
                id="admin-login-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password admin"
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
                {loginLoading ? 'Memverifikasi...' : 'Masuk Super Admin'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // HANDLERS
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim()) return;
    await cbtStore.addSubject(newSubject.trim());
    setNewSubject('');
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.trim()) return;
    await cbtStore.addClass(newClass.trim());
    setNewClass('');
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tNama.trim() || !tUser.trim() || !tPass) return;
    const selectedMapel = tMapelList.length > 0 ? tMapelList : [subjects[0] || 'Matematika'];
    const { salt, passHash } = await hashSaltedPassword(tPass);
    const created: TeacherAccount = {
      id: `guru-${Date.now()}`,
      nama: tNama.trim(),
      username: tUser.trim().toLowerCase(),
      passwordHash: passHash,
      salt,
      mataPelajaran: selectedMapel[0],
      mataPelajaranList: selectedMapel,
      aktif: true,
      createdAt: new Date().toISOString(),
    };
    await cbtStore.upsertTeacher(created);
    setTNama('');
    setTUser('');
    setTPass('');
    setTMapelList(subjects[0] ? [subjects[0]] : []);
    setShowAddTeacher(false);
  };

  const openEditTeacher = (t: TeacherAccount) => {
    setEditingTeacher(t);
    setEditTeacherBaseFp(computeEntityFingerprint(t as unknown as Record<string, unknown>));
    setEditNama(t.nama);
    setEditMapelList(getTeacherSubjects(t));
    setEditAktif(t.aktif);
    setEditNewPassword('');
  };

  const handleSaveEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher || !editNama.trim()) return;
    const selectedMapel =
      editMapelList.length > 0 ? editMapelList : [editingTeacher.mataPelajaran];
    let passwordHash = editingTeacher.passwordHash;
    let salt = editingTeacher.salt;
    if (editNewPassword.trim()) {
      const hashed = await hashSaltedPassword(editNewPassword.trim());
      passwordHash = hashed.passHash;
      salt = hashed.salt;
    }
    await cbtStore.upsertTeacher(
      {
        ...editingTeacher,
        nama: editNama.trim(),
        mataPelajaran: selectedMapel[0],
        mataPelajaranList: selectedMapel,
        aktif: editAktif,
        passwordHash,
        salt,
      },
      editTeacherBaseFp || undefined
    );
    setEditingTeacher(null);
    setEditTeacherBaseFp('');
    setEditNewPassword('');
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

  const exportAllResultsCsv = () => {
    const csv = buildResultsCsv(filteredResults);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Rekap_Nilai_Terpusat_CBT_MA_Nurul_Hijrah.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAllResultsExcel = () => {
    const html = buildResultsExcelHtml(filteredResults, 'Rekap Nilai Terpusat CBT');
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Rekap_Nilai_Terpusat_CBT_MA_Nurul_Hijrah.xls';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpdateAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAccountMsg(null);
    if (!curAdminPass) {
      setAdminAccountMsg({ ok: false, text: 'Masukkan Password Saat Ini untuk konfirmasi.' });
      return;
    }
    if (newAdminPass && newAdminPass !== confirmAdminPass) {
      setAdminAccountMsg({ ok: false, text: 'Password Baru dan Ulangi Password tidak cocok.' });
      return;
    }
    setAdminSaving(true);
    const res = await cbtStore.updateAdminAccount({
      currentAdmin: admin,
      currentPassword: curAdminPass,
      newUsername: newAdminUser.trim() || undefined,
      newPassword: newAdminPass.trim() || undefined,
    });
    setAdminSaving(false);
    setAdminAccountMsg({ ok: res.ok, text: res.message });
    if (res.ok && res.updated) {
      onAdminUpdated(res.updated);
      setCurAdminPass('');
      setNewAdminPass('');
      setConfirmAdminPass('');
    }
  };

  const sidebarItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'guru', label: 'Manajemen Guru', icon: <Users className="w-4 h-4" /> },
    { id: 'mapel', label: 'Mata Pelajaran', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'kelas', label: 'Manajemen Kelas', icon: <School className="w-4 h-4" /> },
    { id: 'bank_soal', label: 'Monitor Bank Soal', icon: <Layers className="w-4 h-4" /> },
    { id: 'jadwal', label: 'Jadwal & Kontrol Ujian', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'rekap_nilai', label: 'Rekap Nilai Terpusat', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'analisis', label: 'Analisis Nilai', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'monitoring', label: 'Live Monitoring (Video)', icon: <Video className="w-4 h-4" /> },
    { id: 'sheets', label: 'Pengaturan Google Sheets', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'database', label: 'Koneksi Database', icon: <Database className="w-4 h-4" /> },
    { id: 'akun', label: 'Pengaturan Akun Admin', icon: <KeyRound className="w-4 h-4" /> },
  ];

  const activeFbConfig = getActiveFirebaseConfig();
  const forceLocal = isForceLocalMode();
  const liveDoingCount = liveStreams.filter((l) => l.status === 'Mengerjakan').length;
  const normalCount = results.filter((r) => r.status === 'Selesai').length;
  const violationCount = results.filter((r) => r.status === 'Pelanggaran').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-ios-enter">
      {/* Sidebar */}
      <aside className="lg:col-span-3 space-y-4 no-print">
        <div className="glass-surface rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {admin.nama}
              </div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                Super Admin / Operator
              </div>
            </div>
          </div>

          <nav className="space-y-1" aria-label="Menu Super Admin">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`glass-pill-btn w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left ${
                  activeTab === item.id
                    ? 'bg-emerald-700 text-white shadow-md'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-emerald-500/15'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={onLogout}
            className="glass-pill-btn w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-200 text-xs font-bold"
          >
            <LogOut className="w-4 h-4" />
            Keluar Admin
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <section className="lg:col-span-9 space-y-5">
        {/* PERSISTENT REAL-TIME SYNC INDICATOR ON EVERY ADMIN DASHBOARD TAB */}
        <SyncStatusIndicator
          syncStatus={syncStatus}
          conflictCount={conflictCount}
          onOpenConflicts={onOpenConflicts}
        />

        {/* ==================== 1. DASHBOARD ==================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            <div className="glass-surface rounded-3xl p-6">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                Selamat datang, {admin.nama}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Pengendali utama seluruh sistem CBT MA Nurul Hijrah — setiap perubahan langsung
                tersinkron real-time ke seluruh perangkat.
              </p>
            </div>

            {/* 8 KPI Cards matching arena.site */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Akun Guru</div>
                <div className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                  {teachers.length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Mata Pelajaran</div>
                <div className="text-3xl font-extrabold text-sky-600 dark:text-sky-300 mt-1 tabular-nums">
                  {subjects.length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Soal (Semua)</div>
                <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-300 mt-1 tabular-nums">
                  {questions.length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Tes Aktif</div>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {schedules.filter((s) => s.aktif).length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Hasil Masuk</div>
                <div className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                  {results.length}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Selesai (Normal)</div>
                <div className="text-3xl font-extrabold text-sky-600 dark:text-sky-300 mt-1 tabular-nums">
                  {normalCount}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Sedang Mengerjakan (Live)
                </div>
                <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-300 mt-1 tabular-nums">
                  {liveDoingCount}
                </div>
              </div>
              <div className="glass-surface rounded-2xl p-4 sm:p-5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Pelanggaran</div>
                <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                  {violationCount}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8 glass-surface rounded-3xl p-6 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Panduan Penggunaan Sistem
                </h3>
                <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <div className="font-bold">Kelola Guru & Mapel</div>
                      <div className="text-slate-500 dark:text-slate-400">
                        Tambah/edit akun guru (mendukung multi-mapel), mata pelajaran, dan kelas.
                        Perubahan langsung tersinkron ke semua perangkat.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      <div className="font-bold">Pantau Bank Soal & Ujian</div>
                      <div className="text-slate-500 dark:text-slate-400">
                        Lihat semua soal, aktifkan/hentikan paksa ujian, dan reset sesi siswa bila
                        ada kendala teknis.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      <div className="font-bold">Rekap Nilai & Analisis KKM</div>
                      <div className="text-slate-500 dark:text-slate-400">
                        Lihat & unduh rekap nilai seluruh guru dan mata pelajaran (CSV / Excel /
                        PDF) serta pantau kelulusan KKM.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0">
                      4
                    </span>
                    <div>
                      <div className="font-bold">Live Monitoring Video & Audio</div>
                      <div className="text-slate-500 dark:text-slate-400">
                        Pantau video & suara seluruh siswa secara langsung, kirim peringatan bila
                        mencurigakan.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 glass-surface rounded-3xl p-6 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Info Akun
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Nama</div>
                    <div className="font-bold text-slate-900 dark:text-white">{admin.nama}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Peran</div>
                    <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-200 font-bold">
                      Super Admin / Operator
                    </span>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Keamanan</div>
                    <div className="text-slate-700 dark:text-slate-200">
                      Kata sandi disimpan terenkripsi (SHA-256 + Salt) dan tidak pernah
                      ditampilkan.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. MANAJEMEN GURU ==================== */}
        {activeTab === 'guru' && (
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Manajemen Akun Guru ({teachers.length})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Mendukung penugasan multi-mapel per guru. Username &amp; password disensor permanen.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintTeachers(true)}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl glass-subtle text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak Data Guru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tMapelList.length === 0 && subjects[0]) setTMapelList([subjects[0]]);
                    setShowAddTeacher((v) => !v);
                  }}
                  className="glass-pill-btn px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Akun Guru
                </button>
              </div>
            </div>

            {showAddTeacher && (
              <form
                onSubmit={handleAddTeacher}
                className="glass-subtle rounded-2xl p-4 space-y-3 animate-ios-enter"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={tNama}
                    onChange={(e) => setTNama(e.target.value)}
                    placeholder="Nama Lengkap Guru"
                    className="rounded-xl glass-surface px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={tUser}
                    onChange={(e) => setTUser(e.target.value)}
                    placeholder="Username Unik"
                    className="rounded-xl glass-surface px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="password"
                    value={tPass}
                    onChange={(e) => setTPass(e.target.value)}
                    placeholder="Password Guru (SHA-256 + Salt)"
                    className="rounded-xl glass-surface px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-200">
                    Pilih Mata Pelajaran Diampu (Boleh Lebih Dari 1):
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {subjects.map((subj) => {
                      const checked = tMapelList.includes(subj);
                      return (
                        <button
                          key={subj}
                          type="button"
                          onClick={() =>
                            setTMapelList((prev) =>
                              prev.includes(subj)
                                ? prev.filter((x) => x !== subj)
                                : [...prev, subj]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                            checked
                              ? 'bg-emerald-700 text-white'
                              : 'glass-surface text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {subj}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddTeacher(false)}
                    className="px-3 py-1.5 rounded-xl glass-surface text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                  >
                    Simpan Guru
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/70 dark:border-slate-700/70 text-slate-500">
                    <th className="py-2.5 pr-3">Nama Guru</th>
                    <th className="py-2.5 px-3">Mata Pelajaran</th>
                    <th className="py-2.5 px-3">Username</th>
                    <th className="py-2.5 px-3">Password</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 pl-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-slate-700/40">
                  {teachers.map((t) => {
                    const subjs = getTeacherSubjects(t);
                    return (
                      <tr key={t.id}>
                        <td className="py-3 pr-3 font-bold text-slate-900 dark:text-white">
                          {t.nama}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {subjs.map((s) => (
                              <span
                                key={s}
                                className="px-2 py-0.5 rounded-md glass-subtle text-[11px] font-semibold"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400">
                          {maskCredential(t.username)}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400">
                          {maskCredential(t.passwordHash)}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`font-semibold ${
                              t.aktif ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'
                            }`}
                          >
                            {t.aktif ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditTeacher(t)}
                            aria-label={`Edit guru ${t.nama}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-800 dark:text-sky-200 font-semibold"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => cbtStore.deleteTeacher(t.id)}
                            aria-label={`Hapus guru ${t.nama}`}
                            className="inline-flex items-center px-2 py-1 rounded-lg bg-rose-500/15 text-rose-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 3. MATA PELAJARAN ==================== */}
        {activeTab === 'mapel' && (
          <div className="glass-surface rounded-3xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                Kelola Daftar Mata Pelajaran ({subjectItems.length})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Perubahan mata pelajaran langsung tersinkron ke semua perangkat Guru, Admin, dan
                Portal Siswa.
              </p>
            </div>

            <form onSubmit={handleAddSubject} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Tambah mata pelajaran baru..."
                className="flex-1 min-w-[220px] rounded-xl glass-subtle px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="glass-pill-btn px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Mapel
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {subjectItems.map((item, idx) => {
                const qCount = questions.filter((q) => q.mataPelajaran === item.nama).length;
                const isEditing = editingSubjectId === item.id;
                return (
                  <div
                    key={item.id}
                    className="glass-subtle rounded-2xl px-4 py-3 flex items-center justify-between gap-2"
                  >
                    {isEditing ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await cbtStore.renameSubject(item.id, item.nama, editingSubjectName);
                          setEditingSubjectId(null);
                        }}
                        className="flex-1 flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={editingSubjectName}
                          onChange={(e) => setEditingSubjectName(e.target.value)}
                          className="flex-1 rounded-lg glass-surface px-2.5 py-1.5 text-xs"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-bold"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSubjectId(null)}
                          className="px-2 py-1.5 rounded-lg glass-surface text-[11px]"
                        >
                          Batal
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            <span className="text-emerald-700 dark:text-emerald-300 font-mono mr-1.5">
                              #{idx + 1}
                            </span>
                            {item.nama}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {qCount} butir soal di Bank Soal
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSubjectId(item.id);
                              setEditingSubjectName(item.nama);
                            }}
                            aria-label={`Edit mata pelajaran ${item.nama}`}
                            className="px-2 py-1 rounded-lg bg-sky-500/15 text-sky-800 dark:text-sky-200 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => cbtStore.deleteSubject(item.id, item.nama)}
                            aria-label={`Hapus mata pelajaran ${item.nama}`}
                            className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== 4. MANAJEMEN KELAS ==================== */}
        {activeTab === 'kelas' && (
          <div className="glass-surface rounded-3xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <School className="w-5 h-5 text-emerald-600" />
                Manajemen Daftar Kelas ({classItems.length})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Dropdown kelas pada Portal Siswa, Jadwal Tes Guru, dan Filter Nilai otomatis
                diperbarui secara real-time.
              </p>
            </div>

            <form onSubmit={handleAddClass} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                placeholder="Contoh: X-IPA-1 atau XII-IPS"
                className="flex-1 min-w-[200px] rounded-xl glass-subtle px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="glass-pill-btn px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Kelas
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {classItems.map((cls) => {
                const isEditing = editingClassId === cls.id;
                const examCount = schedules.filter((s) =>
                  (s.kelasTarget || []).includes(cls.nama)
                ).length;
                return (
                  <div
                    key={cls.id}
                    className="glass-subtle rounded-2xl p-4 flex items-center justify-between gap-2"
                  >
                    {isEditing ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await cbtStore.renameClass(cls.id, cls.nama, editingClassName);
                          setEditingClassId(null);
                        }}
                        className="flex-1 flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={editingClassName}
                          onChange={(e) => setEditingClassName(e.target.value)}
                          className="flex-1 min-w-0 rounded-lg glass-surface px-2.5 py-1 text-xs"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-bold"
                        >
                          OK
                        </button>
                      </form>
                    ) : (
                      <>
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            Kelas {cls.nama}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {examCount} jadwal terkait
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClassId(cls.id);
                              setEditingClassName(cls.nama);
                            }}
                            aria-label={`Edit kelas ${cls.nama}`}
                            className="p-1.5 rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-200"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => cbtStore.deleteClass(cls.id, cls.nama)}
                            aria-label={`Hapus kelas ${cls.nama}`}
                            className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== 5. MONITOR BANK SOAL (SEMUA GURU) ==================== */}
        {activeTab === 'bank_soal' && (
          <div className="space-y-4">
            <div className="glass-surface rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Monitor Bank Soal Semua Guru ({filteredQuestions.length} / {questions.length})
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Pantau, sunting, atau hapus butir soal lintas mata pelajaran secara terpusat.
                  </p>
                </div>
                {filteredQuestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearBank(true)}
                    className="glass-pill-btn px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {bankFilterMapel === 'ALL'
                      ? 'Kosongkan Semua Bank Soal'
                      : `Kosongkan Bank Soal ${bankFilterMapel}`}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  value={bankFilterMapel}
                  onChange={(e) => setBankFilterMapel(e.target.value)}
                  className="rounded-xl glass-subtle px-3 py-2 text-xs"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900">
                    Semua Mata Pelajaran
                  </option>
                  {subjects.map((s) => (
                    <option key={s} value={s} className="bg-white dark:bg-slate-900">
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={bankFilterTipe}
                  onChange={(e) => setBankFilterTipe(e.target.value)}
                  className="rounded-xl glass-subtle px-3 py-2 text-xs"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900">
                    Semua Tipe Soal
                  </option>
                  <option value="pg" className="bg-white dark:bg-slate-900">
                    Pilihan Ganda
                  </option>
                  <option value="pg_kompleks" className="bg-white dark:bg-slate-900">
                    PG Kompleks
                  </option>
                  <option value="benar_salah" className="bg-white dark:bg-slate-900">
                    Benar / Salah
                  </option>
                  <option value="isian_singkat" className="bg-white dark:bg-slate-900">
                    Jawaban Singkat
                  </option>
                  <option value="esai" className="bg-white dark:bg-slate-900">
                    Esai / Uraian
                  </option>
                </select>
                <input
                  type="search"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Cari teks pertanyaan..."
                  className="rounded-xl glass-subtle px-3 py-2 text-xs"
                />
              </div>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="glass-surface rounded-3xl p-10 text-center space-y-2">
                <Layers className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Belum ada soal yang cocok dengan filter saat ini
                </p>
                <p className="text-xs text-slate-500">
                  Guru dapat menambahkan soal di Portal Guru (Bank Soal atau Smart AI Importer).
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredQuestions.map((q, idx) => (
                  <div key={q.id} className="glass-surface rounded-2xl p-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                        #{idx + 1} · {q.mataPelajaran} · {q.tipe.toUpperCase()} · Bobot {q.bobot}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditQuestion(q)}
                          className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-800 dark:text-sky-200 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => cbtStore.deleteQuestion(q.id)}
                          aria-label={`Hapus soal ${idx + 1}`}
                          className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600"
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

        {/* ==================== 6. JADWAL & KONTROL UJIAN ==================== */}
        {activeTab === 'jadwal' && (
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-emerald-600" />
                  Jadwal &amp; Kontrol Ujian ({filteredSchedules.length})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Pantau peserta aktif, salin token, aktifkan, atau hentikan paksa ujian secara
                  real-time.
                </p>
              </div>
              <select
                value={schedFilterMapel}
                onChange={(e) => setSchedFilterMapel(e.target.value)}
                className="rounded-xl glass-subtle px-3 py-2 text-xs"
              >
                <option value="ALL" className="bg-white dark:bg-slate-900">
                  Semua Mata Pelajaran
                </option>
                {subjects.map((s) => (
                  <option key={s} value={s} className="bg-white dark:bg-slate-900">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {filteredSchedules.length === 0 ? (
              <div className="rounded-2xl glass-subtle p-8 text-center text-xs text-slate-500">
                Belum ada jadwal ujian untuk filter ini.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSchedules.map((s) => {
                  const counts = computeExamLiveCounts(s.id, results, liveStreams);
                  return (
                    <div
                      key={s.id}
                      className="glass-subtle rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {s.mataPelajaran} — {s.judulUjian}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              s.aktif
                                ? 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-200'
                                : 'bg-rose-500/20 text-rose-700 dark:text-rose-200'
                            }`}
                          >
                            {s.aktif ? 'AKTIF' : 'DIHENTIKAN'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                          Pengampu: {s.guruNama || '-'} · Kelas:{' '}
                          {(Array.isArray(s.kelasTarget) ? s.kelasTarget : []).join(', ') ||
                            'Semua Kelas'}{' '}
                          · {s.durasiMenit} Menit ·{' '}
                          {Array.isArray(s.questionsSnapshot) ? s.questionsSnapshot.length : 0} Soal
                        </div>
                        <div className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 flex items-center gap-1.5 tabular-nums">
                          <Activity className="w-3.5 h-3.5" />
                          Sedang mengerjakan: {counts.activeCount} • Sudah mengirim:{' '}
                          {counts.submittedCount}
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
                          className="glass-pill-btn px-3 py-1.5 rounded-xl glass-surface font-mono text-xs font-bold flex items-center gap-1.5"
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
            )}
          </div>
        )}

        {/* ==================== 7. REKAP NILAI TERPUSAT ==================== */}
        {activeTab === 'rekap_nilai' && (
          <div className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Rekapitulasi Nilai Terpusat (Semua Mapel &amp; Guru)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Menampilkan seluruh pengumpulan Selesai (Normal) dan Pelanggaran secara real-time.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 no-print">
                <button
                  type="button"
                  onClick={exportAllResultsCsv}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={exportAllResultsExcel}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl glass-subtle text-xs font-semibold flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl glass-subtle text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  PDF / Cetak
                </button>
                <button
                  type="button"
                  disabled={sheetsPushing || !googleSheetsUrl}
                  onClick={async () => {
                    setSheetsPushing(true);
                    const res = await cbtStore.pushAllResultsToSheets();
                    setSheetsPushMsg(
                      `Terkirim ${res.sent} hasil ke Google Sheets (${res.failed} gagal).`
                    );
                    setSheetsPushing(false);
                  }}
                  className="glass-pill-btn px-3.5 py-2 rounded-xl bg-sky-600 disabled:opacity-45 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sheetsPushing ? 'Mengirim...' : 'Kirim ke Sheets'}
                </button>
              </div>
            </div>

            {sheetsPushMsg && (
              <div className="rounded-xl glass-subtle px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                {sheetsPushMsg}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="glass-subtle rounded-2xl p-3.5">
                <div className="text-[11px] text-slate-500">Total Masuk</div>
                <div className="text-xl font-extrabold tabular-nums">{filteredResults.length}</div>
              </div>
              <div className="glass-subtle rounded-2xl p-3.5">
                <div className="text-[11px] text-slate-500">Selesai Normal</div>
                <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {filteredResults.filter((r) => r.status === 'Selesai').length}
                </div>
              </div>
              <div className="glass-subtle rounded-2xl p-3.5">
                <div className="text-[11px] text-slate-500">Pelanggaran</div>
                <div className="text-xl font-extrabold text-rose-600 tabular-nums">
                  {filteredResults.filter((r) => r.status === 'Pelanggaran').length}
                </div>
              </div>
              <div className="glass-subtle rounded-2xl p-3.5">
                <div className="text-[11px] text-slate-500">Rata-rata Nilai</div>
                <div className="text-xl font-extrabold text-sky-600 dark:text-sky-300 tabular-nums">
                  {rekapAvg}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 no-print">
              <select
                value={filterMapel}
                onChange={(e) => setFilterMapel(e.target.value)}
                className="rounded-xl glass-subtle px-3 py-2 text-xs"
              >
                <option value="ALL" className="bg-white dark:bg-slate-900">
                  Semua Mata Pelajaran
                </option>
                {subjects.map((s) => (
                  <option key={s} value={s} className="bg-white dark:bg-slate-900">
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={filterKelas}
                onChange={(e) => setFilterKelas(e.target.value)}
                className="rounded-xl glass-subtle px-3 py-2 text-xs"
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
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-xl glass-subtle px-3 py-2 text-xs"
              >
                <option value="ALL" className="bg-white dark:bg-slate-900">
                  Semua Status
                </option>
                <option value="Selesai" className="bg-white dark:bg-slate-900">
                  Selesai (Normal)
                </option>
                <option value="Pelanggaran" className="bg-white dark:bg-slate-900">
                  Pelanggaran
                </option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/70 dark:border-slate-700/70 text-slate-500">
                    <th className="py-2.5 pr-3">Siswa</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3">Mata Pelajaran</th>
                    <th className="py-2.5 px-3 text-right">PG</th>
                    <th className="py-2.5 px-3 text-right">Esai</th>
                    <th className="py-2.5 px-3 text-right">Akhir</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 pl-3 text-right no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-slate-700/40">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Belum ada hasil ujian untuk filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 pr-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {r.namaSiswa}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{r.noPeserta}</div>
                        </td>
                        <td className="py-3 px-3">{r.kelas}</td>
                        <td className="py-3 px-3">{r.mataPelajaran}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{r.skorPG}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {r.skorEsai}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {r.nilaiAkhir}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                              r.status === 'Selesai'
                                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-200'
                            }`}
                          >
                            {r.status === 'Selesai' ? 'Selesai (Normal)' : 'Pelanggaran'}
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right no-print">
                          <button
                            type="button"
                            onClick={() => cbtStore.resetStudentExamSession(r.id)}
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

        {/* ==================== 8. ANALISIS NILAI (DENGAN KKM) ==================== */}
        {activeTab === 'analisis' && (
          <div className="space-y-5">
            <div className="glass-surface rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Analisis Nilai &amp; Ketuntasan KKM
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Distribusi sebaran nilai, persentase ketuntasan KKM, dan rata-rata per kelas.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={analisisMapel}
                  onChange={(e) => setAnalisisMapel(e.target.value)}
                  className="rounded-xl glass-subtle px-3 py-2 text-xs"
                >
                  <option value="ALL" className="bg-white dark:bg-slate-900">
                    Semua Mata Pelajaran
                  </option>
                  {subjects.map((s) => (
                    <option key={s} value={s} className="bg-white dark:bg-slate-900">
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={analisisKelas}
                  onChange={(e) => setAnalisisKelas(e.target.value)}
                  className="rounded-xl glass-subtle px-3 py-2 text-xs"
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
                <div className="flex items-center gap-2 rounded-xl glass-subtle px-3 py-1.5 text-xs">
                  <label htmlFor="admin-kkm-input" className="font-semibold whitespace-nowrap">
                    Batas KKM:
                  </label>
                  <input
                    id="admin-kkm-input"
                    type="number"
                    min={0}
                    max={100}
                    value={kkmValue}
                    onChange={(e) =>
                      setKkmValue(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    className="w-full rounded-lg glass-surface px-2.5 py-1 font-mono font-bold tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-[11px] text-slate-500">Rata-rata</div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {analisisStats.overallAverage}
                  </div>
                </div>
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-[11px] text-slate-500">Tuntas (&ge; {kkmValue})</div>
                  <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {analisisStats.lulusCount} ({analisisStats.passRate}%)
                  </div>
                </div>
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-[11px] text-slate-500">Perlu Remedial</div>
                  <div className="text-2xl font-extrabold text-rose-600 tabular-nums">
                    {analisisStats.remedialCount}
                  </div>
                </div>
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-[11px] text-slate-500">Tertinggi / Terendah</div>
                  <div className="text-xl font-extrabold tabular-nums">
                    {analisisStats.highestScore} / {analisisStats.lowestScore}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="glass-surface rounded-3xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Distribusi Rentang Nilai
                </h3>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analisisStats.buckets}>
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
                  Rata-Rata Nilai Per Kelas
                </h3>
                {analisisStats.classAverages.length === 0 ? (
                  <div className="h-60 flex items-center justify-center text-xs text-slate-500">
                    Belum ada data nilai untuk dianalisis.
                  </div>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analisisStats.classAverages}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                        <XAxis dataKey="kelas" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar
                          dataKey="rataRata"
                          name="Rata-rata Nilai"
                          fill="#0284c7"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 9. LIVE MONITORING (VIDEO) ==================== */}
        {activeTab === 'monitoring' && (
          <LiveMonitoringGrid
            sessions={liveStreams}
            title="Live Monitoring Pusat (Seluruh Mata Pelajaran & Kelas)"
          />
        )}

        {/* ==================== 10. PENGATURAN GOOGLE SHEETS ==================== */}
        {activeTab === 'sheets' && (
          <div className="glass-surface rounded-3xl p-6 space-y-5">
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Pengaturan Google Sheets (Google Apps Script Web App)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Hubungkan Google Spreadsheet sekolah agar bank soal, jadwal, dan hasil ujian
                otomatis tercatat sebagai arsip tambahan.
              </p>
              <input
                type="url"
                value={sheetsInput}
                onChange={(e) => setSheetsInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
              />
              {sheetsMsg && (
                <div className="rounded-xl glass-subtle px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  {sheetsMsg}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={sheetsTesting}
                  onClick={async () => {
                    setSheetsTesting(true);
                    await cbtStore.saveSettings({ googleSheetsUrl: sheetsInput.trim() });
                    if (sheetsInput.trim()) {
                      const res = await testGoogleSheetsConnection(sheetsInput.trim());
                      setSheetsMsg(res.message);
                    } else {
                      setSheetsMsg('URL dikosongkan.');
                    }
                    setSheetsTesting(false);
                  }}
                  className="glass-pill-btn px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                >
                  {sheetsTesting ? 'Menguji...' : 'Simpan & Tes Koneksi'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCodeGs((v) => !v)}
                  className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle text-xs font-semibold"
                >
                  {showCodeGs ? 'Tutup Code.gs' : 'Tampilkan Kode Google Apps Script (Code.gs)'}
                </button>
              </div>
            </div>

            {showCodeGs && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span>Kode Lengkap Code.gs:</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(GOOGLE_APPS_SCRIPT_CODE)}
                    className="text-emerald-700 dark:text-emerald-300 font-bold"
                  >
                    Salin Kode
                  </button>
                </div>
                <pre className="rounded-2xl bg-slate-950 text-emerald-200 p-4 text-[11px] font-mono overflow-x-auto max-h-72">
                  {GOOGLE_APPS_SCRIPT_CODE}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ==================== 11. KONEKSI DATABASE ==================== */}
        {activeTab === 'database' && (
          <div className="space-y-5">
            <div className="glass-surface rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-600" />
                    Koneksi Database Pusat (Firebase Cloud Firestore)
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Pantau dan kelola sinkronisasi real-time lintas perangkat (Siswa, Guru, Admin).
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-xl text-xs font-bold ${
                    forceLocal
                      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                      : cloudConnected
                      ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-500/20 text-rose-700 dark:text-rose-200'
                  }`}
                >
                  {forceLocal
                    ? 'Mode Lokal Dipaksa'
                    : cloudConnected
                    ? 'Mode Online (Firebase Firestore)'
                    : 'Menunggu Koneksi Cloud'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="glass-subtle rounded-2xl p-3.5">
                  <div className="text-slate-500">Project ID</div>
                  <div className="font-mono font-bold mt-0.5">{activeFbConfig.projectId}</div>
                </div>
                <div className="glass-subtle rounded-2xl p-3.5">
                  <div className="text-slate-500">Auth Domain</div>
                  <div className="font-mono font-bold mt-0.5 truncate">
                    {activeFbConfig.authDomain || '-'}
                  </div>
                </div>
                <div className="glass-subtle rounded-2xl p-3.5">
                  <div className="text-slate-500">App ID</div>
                  <div className="font-mono font-bold mt-0.5 truncate">{activeFbConfig.appId}</div>
                </div>
                <div className="glass-subtle rounded-2xl p-3.5">
                  <div className="text-slate-500">Versi Aplikasi</div>
                  <div className="font-mono font-bold mt-0.5">{APP_VERSION}</div>
                </div>
              </div>

              {dbTestMsg && (
                <div className="rounded-xl glass-subtle px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  {dbTestMsg}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={dbTesting}
                  onClick={async () => {
                    setDbTesting(true);
                    const res = await cbtStore.testCloudConnection();
                    setDbTestMsg(res.message);
                    setDbTesting(false);
                  }}
                  className="glass-pill-btn px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {dbTesting ? 'Menguji Server...' : 'Simpan & Tes Koneksi'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    cbtStore.setForceLocalMode(!forceLocal);
                    setDbTestMsg(
                      !forceLocal
                        ? 'Mode Lokal diaktifkan.'
                        : 'Kembali ke Mode Online Firebase Firestore.'
                    );
                  }}
                  className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle text-xs font-bold"
                >
                  {forceLocal ? 'Kembali ke Mode Online' : 'Paksa Mode Lokal'}
                </button>
              </div>
            </div>

            <div className="glass-surface rounded-3xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Konfigurasi Firebase Kustom (Opsional)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Secara default aplikasi terhubung ke proyek sekolah{' '}
                <span className="font-mono">cbt-mas-nurul-hijrah</span>. Tempel JSON firebaseConfig
                di bawah hanya jika ingin mengarahkan ke proyek Firebase lain.
              </p>
              <textarea
                rows={4}
                value={fbJsonInput}
                onChange={(e) => setFbJsonInput(e.target.value)}
                placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'
                className="w-full rounded-2xl glass-subtle p-3.5 text-xs font-mono"
              />
              {fbOverrideMsg && (
                <div className="rounded-xl glass-subtle px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  {fbOverrideMsg}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await cbtStore.saveFirebaseOverrideConfig(fbJsonInput);
                    setFbOverrideMsg(res.message);
                  }}
                  className="glass-pill-btn px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                >
                  Simpan Konfigurasi &amp; Sambungkan
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setFbJsonInput('');
                    const res = await cbtStore.saveFirebaseOverrideConfig('');
                    setFbOverrideMsg(res.message);
                  }}
                  className="glass-pill-btn px-4 py-2 rounded-xl glass-subtle text-xs font-semibold"
                >
                  Reset ke Default Sekolah
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 12. PENGATURAN AKUN ADMIN ==================== */}
        {activeTab === 'akun' && (
          <form
            onSubmit={handleUpdateAdminCredentials}
            className="glass-surface rounded-3xl p-6 space-y-4 max-w-xl"
          >
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-emerald-600" />
                Pengaturan Akun Super Admin
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Perubahan username atau password akan langsung dienkripsi (SHA-256 + Salt) dan
                disinkronkan ke database pusat.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Password Saat Ini *</label>
                <input
                  type="password"
                  value={curAdminPass}
                  onChange={(e) => setCurAdminPass(e.target.value)}
                  placeholder="Masukkan password saat ini"
                  className="w-full rounded-xl glass-subtle px-3.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Username Baru (Kosongkan jika tetap)
                </label>
                <input
                  type="text"
                  value={newAdminUser}
                  onChange={(e) => setNewAdminUser(e.target.value)}
                  placeholder={`Saat ini: ${admin.username}`}
                  className="w-full rounded-xl glass-subtle px-3.5 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Password Baru (Opsional)
                  </label>
                  <input
                    type="password"
                    value={newAdminPass}
                    onChange={(e) => setNewAdminPass(e.target.value)}
                    placeholder="Kosongkan jika tidak diubah"
                    className="w-full rounded-xl glass-subtle px-3.5 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Ulangi Password Baru</label>
                  <input
                    type="password"
                    value={confirmAdminPass}
                    onChange={(e) => setConfirmAdminPass(e.target.value)}
                    placeholder="Ulangi password baru"
                    className="w-full rounded-xl glass-subtle px-3.5 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            {adminAccountMsg && (
              <div
                className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${
                  adminAccountMsg.ok
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-200'
                }`}
              >
                {adminAccountMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={adminSaving}
              className="glass-pill-btn px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold"
            >
              {adminSaving ? 'Menyimpan...' : 'Simpan Perubahan Akun Admin'}
            </button>
          </form>
        )}
      </section>

      {/* ==================== MODAL: EDIT GURU (MULTI-MAPEL, NO PASSWORD REVEAL) ==================== */}
      {editingTeacher && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEditTeacher}
            className="glass-surface max-w-lg w-full rounded-3xl p-6 space-y-4 animate-ios-enter max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Data Guru
              </h3>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                aria-label="Tutup edit guru"
                className="w-8 h-8 rounded-xl glass-subtle flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Lengkap Guru</label>
                <input
                  type="text"
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  className="w-full rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Mata Pelajaran Diampu (Multi-Mapel)
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded-xl glass-subtle">
                  {subjects.map((s) => {
                    const checked = editMapelList.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setEditMapelList((prev) =>
                            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                          checked
                            ? 'bg-emerald-700 text-white'
                            : 'glass-surface text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Reset Password Baru (Opsional — Password Lama Dirahasiakan)
                </label>
                <input
                  type="password"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Kosongkan jika tidak mengubah password"
                  className="w-full rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAktif}
                  onChange={(e) => setEditAktif(e.target.checked)}
                  className="accent-emerald-700"
                />
                Akun Guru Aktif
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
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

      {/* ==================== MODAL: EDIT QUESTION IN ADMIN ==================== */}
      {editingQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEditQuestion}
            className="glass-surface max-w-xl w-full rounded-3xl p-6 space-y-4 animate-ios-enter max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Butir Soal ({editingQuestion.mataPelajaran})
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Tipe Soal</label>
                <select
                  value={eqTipe}
                  onChange={(e) => setEqTipe(e.target.value as QuestionType)}
                  className="w-full rounded-xl glass-subtle px-3 py-2 text-xs"
                >
                  <option value="pg">Pilihan Ganda</option>
                  <option value="pg_kompleks">PG Kompleks</option>
                  <option value="benar_salah">Benar / Salah</option>
                  <option value="isian_singkat">Jawaban Singkat</option>
                  <option value="esai">Esai</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Bobot</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={eqWeight}
                  onChange={(e) => setEqWeight(Number(e.target.value) || 1)}
                  className="w-full rounded-xl glass-subtle px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Pertanyaan</label>
              <textarea
                rows={3}
                value={eqHtml}
                onChange={(e) => setEqHtml(e.target.value)}
                className="w-full rounded-xl glass-subtle px-3 py-2 text-xs"
              />
            </div>

            {(eqTipe === 'pg' || eqTipe === 'pg_kompleks') && (
              <div className="space-y-2">
                <div className="text-xs font-semibold">Opsi &amp; Kunci:</div>
                {eqOpsi.map((o, idx) => (
                  <div key={o.key} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (eqTipe === 'pg') setEqKeys([o.key]);
                        else
                          setEqKeys((prev) =>
                            prev.includes(o.key)
                              ? prev.filter((k) => k !== o.key)
                              : [...prev, o.key]
                          );
                      }}
                      className={`w-8 h-8 rounded-lg text-xs font-bold shrink-0 ${
                        eqKeys.includes(o.key) ? 'bg-emerald-700 text-white' : 'glass-subtle'
                      }`}
                    >
                      {o.key}
                    </button>
                    <input
                      type="text"
                      value={o.label}
                      onChange={(e) => {
                        const next = [...eqOpsi];
                        next[idx] = { ...o, label: e.target.value };
                        setEqOpsi(next);
                      }}
                      className="flex-1 rounded-xl glass-subtle px-3 py-1.5 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
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
                Simpan &amp; Sinkronkan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== MODAL: CONFIRM CLEAR BANK SOAL ==================== */}
      {confirmClearBank && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-surface max-w-sm w-full rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-rose-600">Kosongkan Bank Soal?</h3>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              Tindakan ini akan menghapus soal di Bank Soal{' '}
              <b>{bankFilterMapel === 'ALL' ? 'SEMUA MATA PELAJARAN' : bankFilterMapel}</b>. Jadwal
              Tes yang sudah diterbitkan tetap aman karena memakai salinan (snapshot).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearBank(false)}
                className="px-4 py-2 rounded-xl glass-subtle text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  await cbtStore.clearTeacherQuestionBank(
                    bankFilterMapel === 'ALL' ? '__ALL__' : bankFilterMapel
                  );
                  setConfirmClearBank(false);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CETAK DATA GURU (NO USERNAME/PASSWORD) ==================== */}
      {showPrintTeachers && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-surface max-w-2xl w-full rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between no-print">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Pratinjau Cetak Daftar Guru (Tanpa Kredensial Rahasia)
              </h3>
              <button
                onClick={() => setShowPrintTeachers(false)}
                aria-label="Tutup pratinjau cetak"
                className="w-8 h-8 rounded-xl glass-subtle flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-white text-slate-900 p-6 border border-slate-200 space-y-4">
              <div className="text-center border-b-2 border-emerald-800 pb-3">
                <h4 className="text-lg font-extrabold text-emerald-900">MA NURUL HIJRAH</h4>
                <p className="text-xs text-slate-600">
                  Daftar Resmi Tenaga Pendidik &amp; Pengampu Mata Pelajaran CBT
                </p>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-emerald-50 text-emerald-950">
                    <th className="border border-slate-300 px-3 py-2">No</th>
                    <th className="border border-slate-300 px-3 py-2">Nama Lengkap Guru</th>
                    <th className="border border-slate-300 px-3 py-2">Mata Pelajaran Diampu</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, idx) => (
                    <tr key={t.id}>
                      <td className="border border-slate-300 px-3 py-2 tabular-nums">{idx + 1}</td>
                      <td className="border border-slate-300 px-3 py-2 font-semibold">{t.nama}</td>
                      <td className="border border-slate-300 px-3 py-2">
                        {getTeacherSubjects(t).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => setShowPrintTeachers(false)}
                className="px-4 py-2 rounded-xl glass-subtle text-xs font-semibold"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Cetak Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
