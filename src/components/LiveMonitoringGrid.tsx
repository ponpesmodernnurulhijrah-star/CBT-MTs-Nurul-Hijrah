import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Maximize2,
  Send,
  Volume2,
  VolumeX,
  Video,
  X,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import type { LiveProctorSession } from '../types/cbt';
import { cbtStore, getFirestoreInstance } from '../services/cbtStore';

interface StudentStreamTileProps {
  session: LiveProctorSession;
  unmuted: boolean;
  onToggleMute: () => void;
  onSpotlight: () => void;
  onSendWarning: (msg: string) => void;
}

const StudentStreamTile: React.FC<StudentStreamTileProps> = ({
  session,
  unmuted,
  onToggleMute,
  onSpotlight,
  onSendWarning,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [warnInput, setWarnInput] = useState('');

  useEffect(() => {
    const db = getFirestoreInstance();
    if (!db || !session.offerSdp || typeof RTCPeerConnection === 'undefined') return;

    let cancelled = false;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (cancelled) return;
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setStreamConnected(true);
      }
    };

    const answerCandidatesCol = collection(
      db,
      'live_streams',
      session.sessionId,
      'answerCandidates'
    );
    const offerCandidatesCol = collection(
      db,
      'live_streams',
      session.sessionId,
      'offerCandidates'
    );

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        addDoc(answerCandidatesCol, ev.candidate.toJSON()).catch(() => {});
      }
    };

    const connect = async () => {
      try {
        const offer = JSON.parse(session.offerSdp!) as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await setDoc(
          doc(db, 'live_streams', session.sessionId),
          { answerSdp: JSON.stringify(answer) },
          { merge: true }
        );
      } catch {}
    };

    connect();

    const unsubIce = onSnapshot(offerCandidatesCol, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          try {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
          } catch {}
        }
      });
    });

    return () => {
      cancelled = true;
      unsubIce();
      try {
        pc.close();
      } catch {}
    };
  }, [session.sessionId, session.offerSdp]);

  const isAlert = session.jumlahKeluarTab > 0 || session.jumlahMenoleh >= 20;

  return (
    <div
      className={`glass-surface rounded-2xl p-3.5 space-y-2.5 border ${
        isAlert ? 'border-rose-500/60' : 'border-white/40 dark:border-white/10'
      }`}
    >
      <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3] flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={!unmuted}
          className="w-full h-full object-cover"
        />
        {!streamConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-[11px] gap-1 bg-slate-900/80">
            <Video className="w-6 h-6 opacity-70" />
            <span>Menghubungkan stream...</span>
          </div>
        )}
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-600/90 text-[10px] font-bold text-white">
          LIVE · {session.kelas}
        </span>
        <button
          type="button"
          onClick={onSpotlight}
          aria-label={`Perbesar layar ${session.namaSiswa}`}
          className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-slate-950/60 hover:bg-slate-950 text-white flex items-center justify-center"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
          {session.namaSiswa}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {session.mataPelajaran} · Tab {session.jumlahKeluarTab}/3 · Fokus{' '}
          {session.jumlahMenoleh}/50
        </div>
      </div>

      {/* Audio Level Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Level Mikrofon</span>
          <span className="font-mono tabular-nums">{session.audioLevel}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${
              session.audioLevel > 65 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${session.audioLevel}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleMute}
          className={`glass-pill-btn flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 ${
            unmuted
              ? 'bg-emerald-700 text-white'
              : 'glass-subtle text-slate-700 dark:text-slate-200'
          }`}
        >
          {unmuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          {unmuted ? 'Suara Aktif' : 'Dengarkan Suara'}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!warnInput.trim()) return;
          onSendWarning(warnInput.trim());
          setWarnInput('');
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="text"
          value={warnInput}
          onChange={(e) => setWarnInput(e.target.value)}
          placeholder="Kirim peringatan..."
          className="flex-1 min-w-0 rounded-xl glass-subtle px-2.5 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none"
        />
        <button
          type="submit"
          aria-label={`Kirim peringatan ke ${session.namaSiswa}`}
          className="w-7 h-7 rounded-xl bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center shrink-0"
        >
          <Send className="w-3 h-3" />
        </button>
      </form>
    </div>
  );
};

export const LiveMonitoringGrid: React.FC<{
  sessions: LiveProctorSession[];
  title?: string;
}> = ({ sessions, title = 'Live Monitoring Video & Audio Siswa' }) => {
  const [unmutedSessionId, setUnmutedSessionId] = useState<string | null>(null);
  const [spotlightSession, setSpotlightSession] = useState<LiveProctorSession | null>(null);
  const [toast, setToast] = useState('');

  const handleWarn = async (sessionId: string, msg: string) => {
    await cbtStore.sendLiveWarning(sessionId, msg);
    setToast(`Peringatan terkirim: "${msg}"`);
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Seluruh audio siswa otomatis dibisukan (Mute) secara default agar tidak bertabrakan.
          </p>
        </div>
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
          {sessions.length} Peserta Live
        </span>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-600/15 border border-emerald-600/30 px-4 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          {toast}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="glass-surface rounded-3xl p-10 text-center space-y-2">
          <Video className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Belum ada peserta yang sedang melakukan siaran ujian aktif
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Video wajah & mikrofon siswa akan tampil otomatis secara real-time saat ujian dimulai.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((s, idx) => (
            <StudentStreamTile
              key={s.sessionId || `${s.noPeserta}-${idx}`}
              session={s}
              unmuted={unmutedSessionId === s.sessionId}
              onToggleMute={() =>
                setUnmutedSessionId((prev) => (prev === s.sessionId ? null : s.sessionId))
              }
              onSpotlight={() => {
                setSpotlightSession(s);
                setUnmutedSessionId(s.sessionId);
              }}
              onSendWarning={(msg) => handleWarn(s.sessionId, msg)}
            />
          ))}
        </div>
      )}

      {/* Spotlight Modal */}
      {spotlightSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-surface max-w-2xl w-full rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                  Spotlight: {spotlightSession.namaSiswa} ({spotlightSession.kelas})
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {spotlightSession.mataPelajaran} · {spotlightSession.judulUjian}
                </p>
              </div>
              <button
                onClick={() => setSpotlightSession(null)}
                aria-label="Tutup spotlight"
                className="w-9 h-9 rounded-xl glass-subtle flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <StudentStreamTile
              session={spotlightSession}
              unmuted={true}
              onToggleMute={() => setUnmutedSessionId(null)}
              onSpotlight={() => {}}
              onSendWarning={(msg) => handleWarn(spotlightSession.sessionId, msg)}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() =>
                  handleWarn(
                    spotlightSession.sessionId,
                    'Harap tetap menghadap ke layar dan tidak berbicara.'
                  )
                }
                className="glass-pill-btn px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Kirim Peringatan Cepat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
