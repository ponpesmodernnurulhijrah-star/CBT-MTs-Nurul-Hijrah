import React, { useEffect, useState } from 'react';
import {
  Pause,
  Play,
  Printer,
  RotateCcw,
  X,
  MousePointer2,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

interface Chapter {
  title: string;
  startSec: number;
  endSec: number;
  subtitle: string;
  targetScreen: string;
  cursorX: number;
  cursorY: number;
  actionLabel: string;
}

const CHAPTERS: Chapter[] = [
  {
    title: 'Babak 1: Login Guru & Mengenal Bank Soal',
    startSec: 0,
    endSec: 45,
    subtitle:
      'Masuk menggunakan akun guru Anda, lalu pilih menu "Data Modul / Bank Soal" di sidebar kiri untuk melihat soal mata pelajaran Anda.',
    targetScreen: 'Sidebar: Data Modul / Bank Soal',
    cursorX: 22,
    cursorY: 36,
    actionLabel: 'Klik Data Modul / Bank Soal',
  },
  {
    title: 'Babak 2: Input Soal PG, PG Kompleks, & Esai',
    startSec: 45,
    endSec: 90,
    subtitle:
      'Pilih tipe soal (Pilihan Ganda, PG Kompleks, Benar/Salah, atau Esai), tulis pertanyaan, isi opsi dan kunci jawaban, lalu klik Simpan.',
    targetScreen: 'Form Tambah Soal Manual',
    cursorX: 62,
    cursorY: 54,
    actionLabel: 'Simpan Butir Soal',
  },
  {
    title: 'Babak 3: Import Soal Praktis dari File Word (.docx)',
    startSec: 90,
    endSec: 135,
    subtitle:
      'Klik "Import Soal Pintar AI", unggah file .docx/.pdf atau tempel langsung dari Microsoft Word. Tabel dan gambar tetap terjaga utuh!',
    targetScreen: 'Smart AI Question Parser',
    cursorX: 54,
    cursorY: 42,
    actionLabel: 'Ekstrak & Simpan Semua',
  },
  {
    title: 'Babak 4: Terbitkan Jadwal Tes & Salin Token Ujian',
    startSec: 135,
    endSec: 180,
    subtitle:
      'Buka menu "Data Tes / Jadwal Ujian", tentukan kelas target & durasi menit, aktifkan ujian, lalu salin Token 6 karakter untuk siswa.',
    targetScreen: 'Jadwal Tes Aktif · Token: NH2026',
    cursorX: 74,
    cursorY: 64,
    actionLabel: 'Salin Token Ujian',
  },
];

export const VideoTutorialModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const [playing, setPlaying] = useState(true);
  const [currentSec, setCurrentSec] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [showPrintGuide, setShowPrintGuide] = useState(false);

  useEffect(() => {
    if (!open || !playing || showPrintGuide) return;
    const id = window.setInterval(() => {
      setCurrentSec((prev) => (prev >= 180 ? 0 : prev + 1));
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [open, playing, speed, showPrintGuide]);

  if (!open) return null;

  const currentChapter =
    CHAPTERS.find((c) => currentSec >= c.startSec && currentSec < c.endSec) ||
    CHAPTERS[CHAPTERS.length - 1];

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handlePrintGuide = () => {
    setShowPrintGuide(true);
    window.setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-4 animate-ios-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-tutorial-title"
    >
      <div className="glass-surface max-w-3xl w-full rounded-3xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 id="video-tutorial-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Video Tutorial Interaktif Guru (3 Menit)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Simulasi layar otomatis langkah demi langkah pembuatan soal hingga terbit token
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup video tutorial"
            className="w-9 h-9 rounded-xl glass-subtle flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showPrintGuide ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-white/10 space-y-4 text-slate-900 dark:text-slate-100">
              <div className="border-b border-slate-200 dark:border-white/10 pb-3">
                <h4 className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                  Buku Panduan Guru Pembuat Soal — CBT MA Nurul Hijrah
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Panduan resmi pembuatan soal, import Word/PDF, dan penerbitan token ujian
                </p>
              </div>
              <div className="space-y-3">
                {CHAPTERS.map((chap, idx) => (
                  <div key={chap.title} className="space-y-1">
                    <h5 className="text-sm font-bold">
                      {idx + 1}. {chap.title}
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {chap.subtitle}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="no-print flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowPrintGuide(false)}
                className="glass-pill-btn px-4 py-2 rounded-xl glass-subtle text-xs font-semibold"
              >
                Kembali ke Simulasi Video
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="glass-pill-btn px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak / Simpan PDF Sekarang
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Simulated Interactive Screen Player */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-white/20 aspect-video flex flex-col justify-between p-5 text-white">
              <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
                <span>{currentChapter.title}</span>
                <span className="font-mono tabular-nums">
                  {formatTime(currentSec)} / 03:00
                </span>
              </div>

              {/* Interactive Mock Screen Canvas */}
              <div className="relative flex-1 my-3 rounded-xl bg-slate-900/90 border border-white/10 p-4 grid grid-cols-12 gap-3 overflow-hidden">
                <div className="col-span-4 rounded-lg bg-slate-800/80 p-2.5 space-y-2 text-[11px]">
                  <div className="font-bold text-emerald-400">Menu Guru</div>
                  <div className="px-2 py-1 rounded bg-white/5">Dashboard</div>
                  <div
                    className={`px-2 py-1 rounded ${
                      currentSec < 135 ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/5'
                    }`}
                  >
                    Data Modul / Bank Soal
                  </div>
                  <div
                    className={`px-2 py-1 rounded ${
                      currentSec >= 135 ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/5'
                    }`}
                  >
                    Data Tes / Jadwal Ujian
                  </div>
                  <div className="px-2 py-1 rounded bg-white/5">Hasil Tes & Koreksi</div>
                </div>

                <div className="col-span-8 rounded-lg bg-slate-800/60 p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-white mb-1">
                      {currentChapter.targetScreen}
                    </div>
                    <div className="h-2 w-2/3 rounded bg-white/15 mb-2" />
                    <div className="h-14 rounded-lg border border-dashed border-emerald-400/40 bg-emerald-500/10 flex items-center justify-center text-xs text-emerald-200">
                      {currentChapter.actionLabel}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <span className="px-3 py-1 rounded-lg bg-emerald-600 text-[11px] font-bold">
                      {currentChapter.actionLabel}
                    </span>
                  </div>
                </div>

                {/* Animated Moving Cursor */}
                <div
                  className="absolute transition-all duration-700 pointer-events-none flex items-center gap-1"
                  style={{
                    left: `${currentChapter.cursorX}%`,
                    top: `${currentChapter.cursorY}%`,
                  }}
                >
                  <MousePointer2 className="w-5 h-5 text-amber-400 fill-amber-400 drop-shadow-lg" />
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-bold shadow">
                    Klik
                  </span>
                </div>
              </div>

              {/* Subtitle Bar */}
              <div className="rounded-xl bg-black/60 px-4 py-2 text-center text-xs text-slate-100 leading-relaxed">
                {currentChapter.subtitle}
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-2.5">
              <input
                type="range"
                min={0}
                max={180}
                value={currentSec}
                onChange={(e) => setCurrentSec(Number(e.target.value))}
                aria-label="Progres durasi video tutorial"
                className="w-full accent-emerald-600 cursor-pointer"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="glass-pill-btn px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {playing ? 'Jeda' : 'Putar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentSec(0)}
                    className="glass-pill-btn px-3 py-2 rounded-xl glass-subtle text-xs font-semibold flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Ulang
                  </button>
                  <div className="flex items-center gap-1 ml-1">
                    {([1, 1.5, 2] as const).map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setSpeed(sp)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold ${
                          speed === sp
                            ? 'bg-emerald-700 text-white'
                            : 'glass-subtle text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePrintGuide}
                  className="glass-pill-btn px-4 py-2 rounded-xl glass-subtle text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Unduh Buku Panduan Guru (PDF / Cetak)
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {CHAPTERS.map((chap, idx) => (
                  <button
                    key={chap.title}
                    type="button"
                    onClick={() => setCurrentSec(chap.startSec)}
                    className={`text-left p-2 rounded-xl text-[11px] transition-colors ${
                      currentChapter.title === chap.title
                        ? 'bg-emerald-600/20 border border-emerald-600/40 font-bold text-emerald-900 dark:text-emerald-100'
                        : 'glass-subtle text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Babak {idx + 1} · {formatTime(chap.startSec)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const TOUR_STEPS = [
  {
    tab: 'bank_soal' as const,
    title: 'Langkah 1: Buka Bank Soal',
    desc: 'Di sini seluruh soal mata pelajaran Anda dikelola dengan aman. Guru lain tidak dapat melihat atau mengubah soal Anda.',
  },
  {
    tab: 'bank_soal' as const,
    title: 'Langkah 2: Tambah Manual atau Import Word (.docx)',
    desc: 'Gunakan tombol "+ Tambah Soal" untuk input satuan, atau "Import Soal Pintar AI" untuk mengunggah file Word/PDF langsung.',
  },
  {
    tab: 'jadwal' as const,
    title: 'Langkah 3: Buat Jadwal Tes (Snapshot Aman)',
    desc: 'Pilih kelas target & durasi. Sistem menyimpan salinan (snapshot) soal sehingga aman meskipun Bank Soal dikosongkan nanti.',
  },
  {
    tab: 'jadwal' as const,
    title: 'Langkah 4: Aktifkan & Bagikan Token Ujian',
    desc: 'Salin 6 karakter Token Ujian dan berikan kepada siswa agar dapat masuk melalui Portal Ujian Siswa.',
  },
];

export const InteractiveTourBanner: React.FC<{
  stepIndex: number;
  onNext: () => void;
  onFinish: () => void;
}> = ({ stepIndex, onNext, onFinish }) => {
  const step = TOUR_STEPS[stepIndex];
  if (!step) return null;
  const isLast = stepIndex >= TOUR_STEPS.length - 1;

  return (
    <div className="glass-surface rounded-2xl p-4 mb-5 border-2 border-emerald-500/70 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-ios-enter">
      <div className="space-y-1">
        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
          Tur Panduan Interaktif ({stepIndex + 1}/{TOUR_STEPS.length})
        </div>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{step.title}</h4>
        <p className="text-xs text-slate-600 dark:text-slate-300">{step.desc}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onFinish}
          className="px-3 py-1.5 rounded-xl glass-subtle text-xs font-semibold text-slate-600 dark:text-slate-300"
        >
          Tutup Tur
        </button>
        <button
          type="button"
          onClick={isLast ? onFinish : onNext}
          className="glass-pill-btn px-4 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
        >
          {isLast ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Selesai
            </>
          ) : (
            <>
              Lanjut
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
