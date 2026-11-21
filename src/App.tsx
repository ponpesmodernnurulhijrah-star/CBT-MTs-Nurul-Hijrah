import React, { useEffect, useRef, useState } from 'react';
import {
  GraduationCap,
  Moon,
  QrCode,
  ShieldCheck,
  Sun,
  UserCheck,
  WifiOff,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import type {
  AdminAccount,
  PetCommandAction,
  PortalRole,
  Question,
  TeacherAccount,
} from './types/cbt';
import { cbtStore, type CbtSnapshotState } from './services/cbtStore';
import { BrandLogo, QRInstallModal } from './components/GlassUI';
import { StudentPortal } from './components/StudentPortal';
import { TeacherPortal, type TeacherTab } from './components/TeacherPortal';
import { AdminPortal, type AdminTab } from './components/AdminPortal';
import { VirtualPetAssistant } from './components/VirtualPetAssistant';
import { SyncConflictModal, SyncConflictNotification } from './components/SyncConflictDialog';
import { useAppVersionCheck } from './hooks/useAppVersionCheck';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import { TOUR_STEPS } from './components/TeacherTutorialModals';

export default function App() {
  const [storeState, setStoreState] = useState<CbtSnapshotState>(() => cbtStore.getState());
  const [role, setRole] = useState<PortalRole>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' || params.get('portal') === 'student') {
        return 'student';
      }
      if (params.get('portal') === 'teacher') return 'teacher';
      if (params.get('portal') === 'admin') return 'admin';
    }
    return 'home';
  });

  const [darkMode, setDarkMode] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [isExamActive, setIsExamActive] = useState(false);

  // Auth sessions
  const [loggedTeacher, setLoggedTeacher] = useState<TeacherAccount | null>(null);
  const [loggedAdmin, setLoggedAdmin] = useState<AdminAccount | null>(null);

  // Sub-tabs
  const [teacherTab, setTeacherTab] = useState<TeacherTab>('dashboard');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  // Teacher Tutorial & Tour state
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  // Pet action toast
  const [globalToast, setGlobalToast] = useState('');

  // Sync Conflict Notification & Resolution Dialog
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictBannerDismissed, setConflictBannerDismissed] = useState(false);
  const prevConflictCountRef = useRef(storeState.syncConflicts.length);

  const isOnline = useOnlineStatus();
  const { updatePending } = useAppVersionCheck(isExamActive);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    cbtStore.init();
    const unsub = cbtStore.subscribe((next) => setStoreState(next));
    return unsub;
  }, []);

  useEffect(() => {
    const count = storeState.syncConflicts.length;
    if (count > prevConflictCountRef.current) {
      setConflictBannerDismissed(false);
    }
    if (count === 0) {
      setConflictModalOpen(false);
      setConflictBannerDismissed(false);
    }
    prevConflictCountRef.current = count;
  }, [storeState.syncConflicts.length]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const showToast = (msg: string) => {
    setGlobalToast(msg);
    setTimeout(() => setGlobalToast(''), 4000);
  };

  const handlePetAction = async (action: PetCommandAction) => {
    const payload = action.payload || {};
    switch (action.type) {
      case 'navigate_portal': {
        const target = String(payload.portal || 'home') as PortalRole;
        if (['home', 'student', 'teacher', 'admin'].includes(target)) {
          if (!isExamActive) setRole(target);
        }
        break;
      }
      case 'navigate_tab': {
        const tab = String(payload.tab || 'dashboard');
        if (role === 'teacher') {
          setTeacherTab(tab as TeacherTab);
        } else if (role === 'admin') {
          setAdminTab(tab as AdminTab);
        }
        break;
      }
      case 'toggle_theme': {
        const t = String(payload.theme || 'toggle');
        if (t === 'dark') setDarkMode(true);
        else if (t === 'light') setDarkMode(false);
        else setDarkMode((prev) => !prev);
        break;
      }
      case 'start_tour': {
        setRole('teacher');
        setTourStep(0);
        setTeacherTab(TOUR_STEPS[0].tab);
        break;
      }
      case 'open_video_tutorial': {
        setRole('teacher');
        setVideoOpen(true);
        break;
      }
      case 'add_sample_question': {
        const mapel = loggedTeacher?.mataPelajaran || storeState.subjects[0] || 'Matematika';
        const guruId = loggedTeacher?.id || 'guru-winnie';
        const qText = String(payload.pertanyaan || 'Berapakah hasil dari 12 + 8?');
        const opsi = Array.isArray(payload.opsi)
          ? (payload.opsi as Array<{ key: string; label: string }>)
          : [
              { key: 'A', label: '18' },
              { key: 'B', label: '20' },
              { key: 'C', label: '22' },
              { key: 'D', label: '24' },
            ];
        const kunci = Array.isArray(payload.kunciJawaban)
          ? (payload.kunciJawaban as string[])
          : ['B'];
        const newQ: Question = {
          id: `q-pet-${Date.now()}`,
          mataPelajaran: mapel,
          guruId,
          tipe: (payload.tipe as Question['tipe']) || 'pg',
          pertanyaanHtml: `<p>${qText}</p>`,
          pertanyaanTeks: qText,
          opsi,
          kunciJawaban: kunci,
          bobot: 1,
          createdAt: new Date().toISOString(),
        };
        await cbtStore.addQuestions([newQ]);
        showToast(`Asisten Pet menambahkan 1 soal baru ke Bank Soal ${mapel}!`);
        break;
      }
      default:
        break;
    }
  };

  const contextSummary = `Portal aktif: ${role}, Total Soal: ${storeState.questions.length}, Jadwal Aktif: ${
    storeState.schedules.filter((s) => s.aktif).length
  }, Hasil Ujian: ${storeState.results.length}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar Contract: 3 zones (Brand, 4 single-line links, 1 primary action) */}
      {!isExamActive && (
        <header className="no-print sticky top-0 z-30 backdrop-blur-xl bg-white/45 dark:bg-slate-950/45 border-b border-white/40 dark:border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-8">
            <button
              type="button"
              onClick={() => setRole('home')}
              className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left"
            >
              <BrandLogo size="sm" />
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                CBT MA Nurul Hijrah
              </span>
            </button>

            <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <button
                type="button"
                onClick={() => setRole('home')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300 ${
                  role === 'home' ? 'text-emerald-700 dark:text-emerald-300 underline underline-offset-8' : ''
                }`}
              >
                Beranda
              </button>
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300 ${
                  role === 'student' ? 'text-emerald-700 dark:text-emerald-300 underline underline-offset-8' : ''
                }`}
              >
                Portal Siswa
              </button>
              <button
                type="button"
                onClick={() => setRole('teacher')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300 ${
                  role === 'teacher' ? 'text-emerald-700 dark:text-emerald-300 underline underline-offset-8' : ''
                }`}
              >
                Portal Guru
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300 ${
                  role === 'admin' ? 'text-emerald-700 dark:text-emerald-300 underline underline-offset-8' : ''
                }`}
              >
                Portal Admin
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="glass-pill-btn px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-md shadow-emerald-900/15"
              >
                <QrCode className="w-3.5 h-3.5" />
                Instal Aplikasi
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Mobile Quick Portal Switcher */}
      {!isExamActive && (
        <div className="no-print md:hidden max-w-7xl w-full mx-auto px-4 pt-2.5 flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              { id: 'home', label: 'Beranda' },
              { id: 'student', label: 'Siswa' },
              { id: 'teacher', label: 'Guru' },
              { id: 'admin', label: 'Admin' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRole(item.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                role === item.id
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'glass-surface text-slate-700 dark:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Workspace Utility Bar (Theme toggle & Connectivity / Auto-Update Banner) */}
      {!isExamActive && (
        <div className="no-print max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-1 font-semibold text-amber-900 dark:text-amber-200">
                <WifiOff className="w-3.5 h-3.5" />
                Mode Offline — Data tersimpan di perangkat
              </span>
            )}
            {updatePending && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500/20 border border-sky-500/40 px-3 py-1 font-semibold text-sky-900 dark:text-sky-200">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Memperbarui aplikasi ke versi terbaru...
              </span>
            )}
            {globalToast && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600/20 border border-emerald-600/35 px-3 py-1 font-semibold text-emerald-900 dark:text-emerald-200">
                {globalToast}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            className="glass-surface glass-pill-btn px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
            {darkMode ? 'Mode Terang' : 'Mode Gelap'}
          </button>
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {role === 'home' && (
          <div className="space-y-8 animate-ios-enter">
            {/* Hero Section */}
            <section className="glass-surface rounded-[28px] p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-4">
                <div className="text-xs font-bold tracking-wide text-emerald-700 dark:text-emerald-300">
                  MA NURUL HIJRAH · SISTEM EVALUASI BERBASIS KOMPUTER
                </div>
                <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.12] [text-wrap:balance]">
                  Portal Ujian Online CBT MA Nurul Hijrah
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                  Platform ujian terpadu bergaya Apple iOS Glassmorphism dengan sinkronisasi cloud
                  real-time, Live Proctoring WebRTC, deteksi fokus wajah &amp; mata, serta Smart AI
                  Question Parser.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className="glass-pill-btn px-6 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                  >
                    Masuk Portal Ujian Siswa
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {!isInstalled && isInstallable && (
                    <button
                      type="button"
                      onClick={install}
                      className="glass-pill-btn px-5 py-3.5 rounded-xl glass-subtle text-sm font-bold text-slate-800 dark:text-white"
                    >
                      Instal Aplikasi ke HP
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 grid grid-cols-2 gap-3">
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Ujian Aktif</div>
                  <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                    {storeState.schedules.filter((s) => s.aktif).length}
                  </div>
                </div>
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Mata Pelajaran</div>
                  <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                    {storeState.subjects.length}
                  </div>
                </div>
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Kelas Terdaftar</div>
                  <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                    {storeState.classes.length}
                  </div>
                </div>
                <div className="glass-subtle rounded-2xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Butir Soal</div>
                  <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                    {storeState.questions.length}
                  </div>
                </div>
              </div>
            </section>

            {/* 3 Role Access Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <button
                type="button"
                onClick={() => setRole('student')}
                className="glass-surface glass-card-interactive rounded-3xl p-6 text-left space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Portal Ujian Siswa
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Lembar ujian ergonomis dengan navigasi nomor soal, auto-save jawaban, kamera
                    proctoring live, dan perlindungan sinyal lemah.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 pt-2">
                  Buka Ruang Ujian <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRole('teacher')}
                className="glass-surface glass-card-interactive rounded-3xl p-6 text-left space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-sky-600/15 text-sky-700 dark:text-sky-300 flex items-center justify-center">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Portal Guru Mapel
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Bank soal terisolasi per mapel, Smart AI Importer (.docx/.pdf), analisis grafik
                    nilai, koreksi esai, dan pantau video siswa.
                  </p>
                </div>
                <span className="text-xs font-bold text-sky-700 dark:text-sky-300 inline-flex items-center gap-1 pt-2">
                  Login Guru <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRole('admin')}
                className="glass-surface glass-card-interactive rounded-3xl p-6 text-left space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-600/15 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Portal Super Admin
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Kelola akun guru terenkripsi, mata pelajaran dinamis, kelas, rekap nilai
                    terpusat, dan integrasi Google Sheets.
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1 pt-2">
                  Login Super Admin <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            </section>
          </div>
        )}

        {role === 'student' && (
          <StudentPortal
            schedules={storeState.schedules}
            classes={storeState.classes}
            onBackHome={() => setRole('home')}
            onExamActiveChange={setIsExamActive}
            onOpenQrInstall={() => setQrModalOpen(true)}
          />
        )}

        {role === 'teacher' && (
          <TeacherPortal
            teacher={loggedTeacher}
            onLoginSuccess={(t) => setLoggedTeacher(t)}
            onLogout={() => {
              setLoggedTeacher(null);
              setTeacherTab('dashboard');
              setTourStep(null);
            }}
            onBackHome={() => setRole('home')}
            activeTab={teacherTab}
            onTabChange={setTeacherTab}
            tourStep={tourStep}
            onStartTour={() => {
              setTourStep(0);
              setTeacherTab(TOUR_STEPS[0].tab);
            }}
            onNextTour={() => {
              if (tourStep === null) return;
              const next = tourStep + 1;
              if (next >= TOUR_STEPS.length) {
                setTourStep(null);
              } else {
                setTourStep(next);
                setTeacherTab(TOUR_STEPS[next].tab);
              }
            }}
            onFinishTour={() => setTourStep(null)}
            videoOpen={videoOpen}
            onVideoOpenChange={setVideoOpen}
            questions={storeState.questions}
            schedules={storeState.schedules}
            results={storeState.results}
            liveStreams={storeState.liveStreams}
            classes={storeState.classes}
            googleSheetsUrl={storeState.settings.googleSheetsUrl}
            syncStatus={storeState.syncStatus}
            conflictCount={storeState.syncConflicts.length}
            onOpenConflicts={() => setConflictModalOpen(true)}
          />
        )}

        {role === 'admin' && (
          <AdminPortal
            admin={loggedAdmin}
            onLoginSuccess={(a) => setLoggedAdmin(a)}
            onAdminUpdated={(a) => setLoggedAdmin(a)}
            onLogout={() => {
              setLoggedAdmin(null);
              setAdminTab('dashboard');
            }}
            onBackHome={() => setRole('home')}
            activeTab={adminTab}
            onTabChange={setAdminTab}
            teachers={storeState.teachers}
            subjects={storeState.subjects}
            subjectItems={storeState.subjectItems}
            classes={storeState.classes}
            classItems={storeState.classItems}
            questions={storeState.questions}
            schedules={storeState.schedules}
            results={storeState.results}
            liveStreams={storeState.liveStreams}
            cloudConnected={storeState.cloudConnected}
            googleSheetsUrl={storeState.settings.googleSheetsUrl}
            syncStatus={storeState.syncStatus}
            conflictCount={storeState.syncConflicts.length}
            onOpenConflicts={() => setConflictModalOpen(true)}
          />
        )}
      </main>

      {/* Quiet Footer */}
      {!isExamActive && (
        <footer className="no-print py-5 text-center text-xs text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} MA Nurul Hijrah · Sistem Ujian Online CBT
        </footer>
      )}

      {/* QR Install Modal */}
      <QRInstallModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} />

      {/* Sync Conflict Floating Notification Banner */}
      <SyncConflictNotification
        conflicts={storeState.syncConflicts}
        visible={
          !isExamActive &&
          storeState.syncConflicts.length > 0 &&
          !conflictBannerDismissed &&
          !conflictModalOpen
        }
        onOpenDialog={() => setConflictModalOpen(true)}
        onDismissBanner={() => setConflictBannerDismissed(true)}
      />

      {/* Sync Conflict Resolution Dialog */}
      <SyncConflictModal
        open={conflictModalOpen}
        conflicts={storeState.syncConflicts}
        onClose={() => setConflictModalOpen(false)}
        onResolve={async (conflictId, choice, fieldChoices) => {
          await cbtStore.resolveSyncConflict(conflictId, choice, fieldChoices);
          showToast(
            choice === 'use_server'
              ? 'Konflik diselesaikan dengan versi server terbaru.'
              : choice === 'keep_local'
              ? 'Konflik diselesaikan dengan mempertahankan perubahan lokal.'
              : 'Konflik diselesaikan dengan menggabungkan perubahan (merge).'
          );
        }}
        onResolveAll={async (choice) => {
          await cbtStore.resolveAllConflicts(choice);
          showToast('Semua konflik sinkronisasi telah diselesaikan.');
        }}
      />

      {/* Draggable Floating AI Assistant "Virtual Pet" */}
      <VirtualPetAssistant
        role={role}
        contextSummary={contextSummary}
        isExamActive={isExamActive}
        onExecuteAction={handlePetAction}
      />
    </div>
  );
}
