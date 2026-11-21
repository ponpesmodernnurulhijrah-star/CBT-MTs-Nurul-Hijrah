import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Eye,
  Send,
  Sparkles,
  X,
  MessageCircle,
  Compass,
  PlayCircle,
  Loader2,
  GripHorizontal,
} from 'lucide-react';
import type { PetCharacter, PetCommandAction, PortalRole } from '../types/cbt';

interface PetMessage {
  id: string;
  sender: 'user' | 'pet';
  text: string;
}

interface VirtualPetProps {
  role: PortalRole;
  contextSummary: string;
  isExamActive: boolean;
  onExecuteAction: (action: PetCommandAction) => void;
}

const PET_LABELS: Record<PetCharacter, string> = {
  kucing: 'Kucing',
  burung_hantu: 'Burung Hantu',
  gajah: 'Gajah Mini',
  rubah: 'Rubah',
};

const QUICK_PROMPTS_TEACHER = [
  'Bagaimana cara membuat soal Pilihan Ganda?',
  'Bedanya Pilihan Ganda Kompleks & Esai apa?',
  'Cara upload soal dari file Word (.docx) tanpa ketik ulang',
  'Cara mengaktifkan ujian dan membagikan Token ke siswa',
];

const QUICK_PROMPTS_GENERAL = [
  'Buatkan 1 contoh soal Matematika PG dan masukkan ke bank soal',
  'Ubah tampilan ke mode gelap',
  'Ganti hewan peliharaan menjadi rubah',
  'Buka Portal Ujian Siswa',
];

const PetSvg: React.FC<{
  character: PetCharacter;
  isBlinking: boolean;
  isSleeping: boolean;
  isBouncing: boolean;
}> = ({ character, isBlinking, isSleeping, isBouncing }) => {
  const eyeClosed = isBlinking || isSleeping;

  if (character === 'burung_hantu') {
    return (
      <svg
        viewBox="0 0 96 96"
        className={`w-16 h-16 drop-shadow-md ${isBouncing ? 'pet-bounce' : 'pet-breathe'}`}
      >
        {/* Wings */}
        <ellipse cx="22" cy="58" rx="10" ry="18" fill="#065f46" transform="rotate(14 22 58)" />
        <ellipse cx="74" cy="58" rx="10" ry="18" fill="#065f46" transform="rotate(-14 74 58)" />
        {/* Body */}
        <ellipse cx="48" cy="56" rx="25" ry="26" fill="#047857" />
        <ellipse cx="48" cy="63" rx="16" ry="17" fill="#ecfdf5" />
        {/* Ear tufts */}
        <path d="M26 24 L35 33 L24 36 Z" fill="#064e3b" />
        <path d="M70 24 L61 33 L72 36 Z" fill="#064e3b" />
        {/* Face discs */}
        <circle cx="38" cy="43" r="10" fill="#ffffff" />
        <circle cx="58" cy="43" r="10" fill="#ffffff" />
        {eyeClosed ? (
          <>
            <path d="M33 43 Q38 47 43 43" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M53 43 Q58 47 63 43" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="39" cy="43" r="4.5" fill="#0f172a" />
            <circle cx="57" cy="43" r="4.5" fill="#0f172a" />
            <circle cx="40.5" cy="41.5" r="1.6" fill="#ffffff" />
            <circle cx="58.5" cy="41.5" r="1.6" fill="#ffffff" />
          </>
        )}
        {/* Beak */}
        <path d="M44 48 L52 48 L48 55 Z" fill="#f59e0b" />
        {/* Feet */}
        <path d="M38 82 L35 87 M40 82 L40 87 M42 82 L45 87" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M54 82 L51 87 M56 82 L56 87 M58 82 L61 87" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (character === 'gajah') {
    return (
      <svg
        viewBox="0 0 96 96"
        className={`w-16 h-16 drop-shadow-md ${isBouncing ? 'pet-bounce' : 'pet-breathe'}`}
      >
        {/* Big Ears */}
        <ellipse cx="21" cy="46" rx="14" ry="20" fill="#64748b" />
        <ellipse cx="22" cy="47" rx="9" ry="13" fill="#fbcfe8" />
        <ellipse cx="75" cy="46" rx="14" ry="20" fill="#64748b" />
        <ellipse cx="74" cy="47" rx="9" ry="13" fill="#fbcfe8" />
        {/* Body & Head */}
        <ellipse cx="48" cy="64" rx="22" ry="19" fill="#94a3b8" />
        <circle cx="48" cy="45" r="21" fill="#94a3b8" />
        {/* Cheeks */}
        <circle cx="34" cy="51" r="4" fill="#f9a8d4" opacity="0.6" />
        <circle cx="62" cy="51" r="4" fill="#f9a8d4" opacity="0.6" />
        {/* Eyes */}
        {eyeClosed ? (
          <>
            <path d="M36 42 Q40 46 44 42" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M52 42 Q56 46 60 42" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="40" cy="42" r="3.6" fill="#0f172a" />
            <circle cx="56" cy="42" r="3.6" fill="#0f172a" />
            <circle cx="41.2" cy="40.8" r="1.3" fill="#ffffff" />
            <circle cx="57.2" cy="40.8" r="1.3" fill="#ffffff" />
          </>
        )}
        {/* Cute Trunk */}
        <path
          d="M44 49 Q45 64 56 62 Q60 61 58 57"
          stroke="#64748b"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M44 49 Q45 64 56 62 Q60 61 58 57"
          stroke="#94a3b8"
          strokeWidth="5.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  if (character === 'rubah') {
    return (
      <svg
        viewBox="0 0 96 96"
        className={`w-16 h-16 drop-shadow-md ${isBouncing ? 'pet-bounce' : 'pet-breathe'}`}
      >
        {/* Fluffy Tail */}
        <ellipse cx="74" cy="68" rx="14" ry="8" fill="#ea580c" transform="rotate(-25 74 68)" />
        <circle cx="83" cy="63" r="5" fill="#fff7ed" />
        {/* Body */}
        <ellipse cx="48" cy="66" rx="20" ry="17" fill="#ea580c" />
        <ellipse cx="48" cy="68" rx="11" ry="12" fill="#fff7ed" />
        {/* Ears */}
        <path d="M25 22 L38 35 L22 44 Z" fill="#c2410c" />
        <path d="M27 27 L34 35 L25 40 Z" fill="#fed7aa" />
        <path d="M71 22 L58 35 L74 44 Z" fill="#c2410c" />
        <path d="M69 27 L62 35 L71 40 Z" fill="#fed7aa" />
        {/* Head */}
        <ellipse cx="48" cy="45" rx="23" ry="19" fill="#f97316" />
        <path d="M25 47 Q38 45 48 61 Q58 45 71 47 Q64 64 48 64 Q32 64 25 47 Z" fill="#fff7ed" />
        {/* Eyes */}
        {eyeClosed ? (
          <>
            <path d="M35 44 Q39 48 43 44" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M53 44 Q57 48 61 44" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="39" cy="44" r="3.6" fill="#0f172a" />
            <circle cx="57" cy="44" r="3.6" fill="#0f172a" />
            <circle cx="40.2" cy="42.8" r="1.3" fill="#ffffff" />
            <circle cx="58.2" cy="42.8" r="1.3" fill="#ffffff" />
          </>
        )}
        {/* Nose */}
        <circle cx="48" cy="54" r="3.2" fill="#0f172a" />
      </svg>
    );
  }

  // Default: Kucing
  return (
    <svg
      viewBox="0 0 96 96"
      className={`w-16 h-16 drop-shadow-md ${isBouncing ? 'pet-bounce' : 'pet-breathe'}`}
    >
      {/* Tail */}
      <path
        d="M66 72 Q84 68 80 52"
        stroke="#047857"
        strokeWidth="6.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Body */}
      <ellipse cx="48" cy="67" rx="20" ry="17" fill="#10b981" />
      <ellipse cx="48" cy="69" rx="12" ry="11" fill="#ecfdf5" />
      {/* Ears */}
      <path d="M26 20 L38 35 L23 42 Z" fill="#047857" />
      <path d="M28 26 L35 35 L26 39 Z" fill="#fbcfe8" />
      <path d="M70 20 L58 35 L73 42 Z" fill="#047857" />
      <path d="M68 26 L61 35 L70 39 Z" fill="#fbcfe8" />
      {/* Head */}
      <ellipse cx="48" cy="45" rx="23" ry="19" fill="#34d399" />
      {/* Forehead stripes */}
      <path d="M48 27 L48 33 M42 29 L43 34 M54 29 L53 34" stroke="#065f46" strokeWidth="2.3" strokeLinecap="round" />
      {/* Cheeks */}
      <circle cx="32" cy="50" r="3.8" fill="#f9a8d4" opacity="0.65" />
      <circle cx="64" cy="50" r="3.8" fill="#f9a8d4" opacity="0.65" />
      {/* Whiskers */}
      <path d="M18 47 L28 49 M18 53 L28 52 M78 47 L68 49 M78 53 L68 52" stroke="#064e3b" strokeWidth="1.5" strokeLinecap="round" />
      {/* Eyes */}
      {eyeClosed ? (
        <>
          <path d="M35 44 Q39 48 43 44" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M53 44 Q57 48 61 44" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="39" cy="44" r="3.8" fill="#0f172a" />
          <circle cx="57" cy="44" r="3.8" fill="#0f172a" />
          <circle cx="40.3" cy="42.6" r="1.4" fill="#ffffff" />
          <circle cx="58.3" cy="42.6" r="1.4" fill="#ffffff" />
        </>
      )}
      {/* Cute nose & mouth */}
      <path d="M46 50 L50 50 L48 52.5 Z" fill="#f43f5e" />
      <path d="M44 54 Q48 57 48 53 Q48 57 52 54" stroke="#064e3b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
};

export const VirtualPetAssistant: React.FC<VirtualPetProps> = ({
  role,
  contextSummary,
  isExamActive,
  onExecuteAction,
}) => {
  const [pet, setPet] = useState<PetCharacter>('kucing');
  const [hidden, setHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const [showHearts, setShowHearts] = useState(false);
  const [speechBubble, setSpeechBubble] = useState<string>(
    'Halo! Klik saya untuk tanya apa saja atau beri perintah.'
  );
  const [messages, setMessages] = useState<PetMessage[]>([
    {
      id: 'welcome',
      sender: 'pet',
      text: 'Assalamu’alaikum! Saya asisten pintar CBT MA Nurul Hijrah. Tanya materi, panduan buat soal, atau beri perintah kontrol aplikasi apa saja!',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Drag position offset from bottom-right
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 20, y: 20 });
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  }>({ dragging: false, startX: 0, startY: 0, origX: 20, origY: 20, moved: false });

  // Blink periodically
  useEffect(() => {
    const id = window.setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 180);
    }, 3600);
    return () => window.clearInterval(id);
  }, []);

  // Sleep after 25s of inactivity
  useEffect(() => {
    let sleepTimer: number;
    const resetAwake = () => {
      setIsSleeping(false);
      window.clearTimeout(sleepTimer);
      sleepTimer = window.setTimeout(() => {
        if (!drawerOpen) setIsSleeping(true);
      }, 25000);
    };
    resetAwake();
    window.addEventListener('pointermove', resetAwake, { passive: true });
    window.addEventListener('keydown', resetAwake, { passive: true });
    return () => {
      window.clearTimeout(sleepTimer);
      window.removeEventListener('pointermove', resetAwake);
      window.removeEventListener('keydown', resetAwake);
    };
  }, [drawerOpen]);

  const triggerJoy = (msg?: string) => {
    setIsSleeping(false);
    setIsBouncing(true);
    setShowHearts(true);
    if (msg) setSpeechBubble(msg);
    setTimeout(() => setIsBouncing(false), 600);
    setTimeout(() => setShowHearts(false), 1150);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = dragRef.current.startX - e.clientX;
    const dy = dragRef.current.startY - e.clientY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragRef.current.moved = true;
    }
    const maxW = Math.max(80, window.innerWidth - 110);
    const maxH = Math.max(80, window.innerHeight - 110);
    setPos({
      x: Math.min(maxW, Math.max(12, dragRef.current.origX + dx)),
      y: Math.min(maxH, Math.max(12, dragRef.current.origY + dy)),
    });
  };

  const handlePointerUp = () => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (!wasMoved) {
      triggerJoy('Ada yang bisa saya bantu?');
      setDrawerOpen((prev) => !prev);
    }
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const userMsg: PetMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setIsSleeping(false);

    try {
      const res = await fetch('/api/ai/pet-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          role,
          contextSummary,
          petName: PET_LABELS[pet],
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        action?: PetCommandAction;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghubungi Asisten AI');
      }

      if (data.action) {
        if (data.action.type === 'change_pet' && data.action.payload?.pet) {
          const nextPet = String(data.action.payload.pet) as PetCharacter;
          if (PET_LABELS[nextPet]) setPet(nextPet);
        } else if (data.action.type === 'hide_pet') {
          setHidden(true);
          setDrawerOpen(false);
        } else {
          onExecuteAction(data.action);
        }
      }

      const replyText = data.reply || 'Perintah berhasil dijalankan!';
      setMessages((prev) => [
        ...prev,
        { id: `p-${Date.now()}`, sender: 'pet', text: replyText },
      ]);
      triggerJoy(replyText.slice(0, 68) + (replyText.length > 68 ? '...' : ''));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Koneksi AI sedang sibuk. Silakan coba lagi.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'pet',
          text: `Maaf, Asisten AI belum dapat merespons: ${msg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        aria-label="Tampilkan Asisten Virtual Pet"
        className="no-print fixed bottom-4 right-4 z-40 glass-surface glass-pill-btn px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
      >
        <Eye className="w-3.5 h-3.5" />
        Tampilkan Asisten Pet
      </button>
    );
  }

  return (
    <div
      className="no-print fixed z-40 flex flex-col items-end"
      style={{ right: `${pos.x}px`, bottom: `${pos.y}px` }}
    >
      {/* Chat & Command Drawer */}
      {drawerOpen && (
        <div
          className="glass-surface w-[340px] sm:w-[380px] max-w-[calc(100vw-24px)] rounded-3xl p-4 mb-3 shadow-2xl animate-ios-enter flex flex-col max-h-[72vh]"
          role="dialog"
          aria-label="Asisten Virtual Pet AI"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="truncate">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Asisten {PET_LABELS[pet]}
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                  {role === 'teacher'
                    ? 'Panduan Buat Soal & Perintah Pintar'
                    : 'Tanya & Perintah Apa Saja'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {
                  setHidden(true);
                  setDrawerOpen(false);
                }}
                title="Sembunyikan Pet"
                aria-label="Sembunyikan Virtual Pet"
                className="w-7 h-7 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Tutup panel asisten"
                className="w-7 h-7 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Pet Character Selector */}
          <div className="py-2 flex items-center gap-1.5 overflow-x-auto">
            {(Object.keys(PET_LABELS) as PetCharacter[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setPet(key);
                  triggerJoy(`Halo! Saya sekarang ${PET_LABELS[key]}!`);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  pet === key
                    ? 'bg-emerald-700 text-white'
                    : 'glass-subtle text-slate-700 dark:text-slate-200 hover:bg-emerald-500/15'
                }`}
              >
                {PET_LABELS[key]}
              </button>
            ))}
          </div>

          {/* Teacher Guided Walkthrough & Video Shortcuts */}
          {role === 'teacher' && (
            <div className="grid grid-cols-2 gap-1.5 pb-2">
              <button
                onClick={() => {
                  onExecuteAction({ type: 'start_tour' });
                  setDrawerOpen(false);
                }}
                className="glass-pill-btn px-2.5 py-1.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-800 dark:text-emerald-200 text-[11px] font-semibold flex items-center justify-center gap-1.5"
              >
                <Compass className="w-3.5 h-3.5" />
                Tur Panduan Layar
              </button>
              <button
                onClick={() => {
                  onExecuteAction({ type: 'open_video_tutorial' });
                  setDrawerOpen(false);
                }}
                className="glass-pill-btn px-2.5 py-1.5 rounded-xl bg-sky-600/15 hover:bg-sky-600/25 text-sky-800 dark:text-sky-200 text-[11px] font-semibold flex items-center justify-center gap-1.5"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                Video Tutorial
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-2.5 py-2 pr-1 min-h-[160px] max-h-[260px]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-emerald-700 text-white rounded-br-sm'
                      : 'glass-subtle text-slate-800 dark:text-slate-100 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 px-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                Sedang memproses...
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          {!isExamActive && (
            <div className="py-2 flex flex-wrap gap-1.5 border-t border-slate-200/50 dark:border-slate-700/50">
              {(role === 'teacher' ? QUICK_PROMPTS_TEACHER : QUICK_PROMPTS_GENERAL).map(
                (prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-[11px] px-2.5 py-1 rounded-lg glass-subtle hover:bg-emerald-500/15 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    {prompt}
                  </button>
                )
              )}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="mt-1 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isExamActive
                  ? 'Tanya bantuan teknis ujian...'
                  : 'Tanya atau beri perintah apa saja...'
              }
              aria-label="Ketik pertanyaan atau perintah untuk asisten hewan peliharaan"
              className="flex-1 rounded-xl glass-subtle px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Kirim pesan ke asisten"
              className="glass-pill-btn w-9 h-9 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Pet Trigger */}
      <div className="relative flex flex-col items-end gap-1.5">
        {!drawerOpen && speechBubble && (
          <div className="glass-surface max-w-[210px] rounded-2xl rounded-br-sm px-3 py-1.5 text-[11px] font-medium text-slate-800 dark:text-slate-100 shadow-lg pointer-events-none">
            {isSleeping ? 'Zzz... (klik untuk membangunkan)' : speechBubble}
          </div>
        )}

        <div className="relative flex items-center gap-1.5">
          <button
            onClick={() => setHidden(true)}
            title="Sembunyikan asisten pet"
            aria-label="Sembunyikan asisten pet"
            className="glass-surface w-7 h-7 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-rose-600"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onMouseEnter={() => {
              if (!isSleeping) triggerJoy();
            }}
            aria-label={`Buka Asisten AI ${PET_LABELS[pet]}`}
            className="glass-surface relative w-20 h-20 rounded-3xl flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none hover:shadow-emerald-500/20"
          >
            <GripHorizontal className="w-3.5 h-3.5 text-slate-400 absolute top-1.5 left-1/2 -translate-x-1/2 opacity-70" />
            <PetSvg
              character={pet}
              isBlinking={isBlinking}
              isSleeping={isSleeping}
              isBouncing={isBouncing}
            />
            {showHearts && (
              <span className="pet-heart absolute -top-2 right-2 text-rose-500 font-bold text-sm pointer-events-none">
                ♥ ★
              </span>
            )}
            {isSleeping && (
              <span className="pet-zzz absolute -top-1 right-2 text-sky-600 dark:text-sky-300 font-bold text-xs pointer-events-none">
                Zzz
              </span>
            )}
            <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-emerald-700 text-white flex items-center justify-center shadow">
              <MessageCircle className="w-3.5 h-3.5" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
