import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  Grid,
  LogOut,
  Mic,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Volume2,
  X,
} from 'lucide-react';
import { doc, onSnapshot, setDoc, collection, addDoc } from 'firebase/firestore';
import type {
  ExamResult,
  ExamSchedule,
  Question,
  StudentAnswerValue,
  SubmissionStatus,
} from '../types/cbt';
import { cbtStore, getFirestoreInstance } from '../services/cbtStore';
import {
  gradeSubmission,
  HEAD_TURN_LIMIT,
  sanitizeQuestionHtml,
  TAB_EXIT_TOLERANCE,
} from '../utils/cbtLogic';
import { examAudio } from '../utils/audioAlarm';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface StudentPortalProps {
  schedules: ExamSchedule[];
  classes: string[];
  onBackHome: () => void;
  onExamActiveChange: (active: boolean) => void;
  onOpenQrInstall: () => void;
}

type Stage = 'entry' | 'hardware' | 'exam' | 'finished';

const STUDENT_PROFILE_KEY = 'cbt_ma_nh_student_profile';

export const StudentPortal: React.FC<StudentPortalProps> = ({
  schedules,
  classes,
  onBackHome,
  onExamActiveChange,
  onOpenQrInstall,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const savedProfile = useMemo(() => {
    try {
      const raw = localStorage.getItem(STUDENT_PROFILE_KEY);
      return raw ? (JSON.parse(raw) as { namaSiswa?: string; noPeserta?: string; kelas?: string }) : {};
    } catch {
      return {};
    }
  }, []);

  const [stage, setStage] = useState<Stage>('entry');
  const [namaSiswa, setNamaSiswa] = useState(savedProfile.namaSiswa || '');
  const [noPeserta, setNoPeserta] = useState(savedProfile.noPeserta || '');
  const [kelas, setKelas] = useState(
    savedProfile.kelas && classes.includes(savedProfile.kelas)
      ? savedProfile.kelas
      : classes[0] || 'X'
  );
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [entryError, setEntryError] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);

  // Active exam state
  const [activeSchedule, setActiveSchedule] = useState<ExamSchedule | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [answers, setAnswers] = useState<Record<string, StudentAnswerValue>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Media & WebRTC state
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [hardwareError, setHardwareError] = useState('');
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Proctoring & Alerts state
  const [tabExits, setTabExits] = useState(0);
  const [headTurns, setHeadTurns] = useState(0);
  const [gazeNotice, setGazeNotice] = useState('');
  const [teacherWarning, setTeacherWarning] = useState('');
  const [timerToast, setTimerToast] = useState('');
  const [violationRedScreen, setViolationRedScreen] = useState(false);
  const [headTurnAlarmActive, setHeadTurnAlarmActive] = useState(false);

  // Submission & Signal resilience state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryStatus, setRetryStatus] = useState('');
  const [finalResult, setFinalResult] = useState<ExamResult | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const examVideoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const examActiveRef = useRef(false);
  const submittedRef = useRef(false);
  const baselineCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lastTurnTickRef = useRef(0);
  const warn15SentRef = useRef(false);
  const warn5SentRef = useRef(false);
  const retryIntervalRef = useRef<number | null>(null);

  const activeSchedules = useMemo(
    () =>
      schedules.filter(
        (s) =>
          s.aktif &&
          Array.isArray(s.kelasTarget) &&
          (s.kelasTarget.length === 0 || s.kelasTarget.includes(kelas))
      ),
    [schedules, kelas]
  );

  useEffect(() => {
    if (!classes.includes(kelas) && classes.length > 0) {
      setKelas(classes[0]);
    }
  }, [classes, kelas]);

  useEffect(() => {
    if (activeSchedules.length > 0 && !activeSchedules.some((s) => s.id === selectedScheduleId)) {
      setSelectedScheduleId(activeSchedules[0].id);
    } else if (activeSchedules.length === 0) {
      setSelectedScheduleId('');
    }
  }, [activeSchedules, selectedScheduleId]);

  const stopAllSensorsAndMedia = useCallback(async (sid?: string) => {
    examActiveRef.current = false;
    onExamActiveChange(false);
    examAudio.stopAlarm();

    if (retryIntervalRef.current) {
      window.clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }

    if (peerRef.current) {
      try {
        peerRef.current.close();
      } catch {}
      peerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
      setMediaStream(null);
    }

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {}
    }

    if (sid) {
      await cbtStore.removeLiveStream(sid);
    }
  }, [onExamActiveChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllSensorsAndMedia(sessionId);
    };
  }, [sessionId, stopAllSensorsAndMedia]);

  // Attach MediaStream to video elements
  useEffect(() => {
    if (previewVideoRef.current && mediaStream) {
      previewVideoRef.current.srcObject = mediaStream;
    }
    if (examVideoRef.current && mediaStream) {
      examVideoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream, stage]);

  // Entry submit -> move to hardware permission gate
  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEntryError('');
    if (!namaSiswa.trim() || !noPeserta.trim()) {
      setEntryError('Nama Lengkap dan No. Peserta Ujian wajib diisi.');
      return;
    }
    const sched = activeSchedules.find((s) => s.id === selectedScheduleId);
    if (!sched) {
      setEntryError('Tidak ada jadwal ujian aktif untuk kelas yang dipilih.');
      return;
    }
    if (tokenInput.trim().toUpperCase() !== sched.token.trim().toUpperCase()) {
      setEntryError('Token Ujian tidak sesuai. Periksa kembali token dari pengawas/guru.');
      return;
    }
    if (!sched.questionsSnapshot || sched.questionsSnapshot.length === 0) {
      setEntryError('Paket soal pada jadwal ujian ini masih kosong.');
      return;
    }

    setActiveSchedule(sched);
    const sid = `sess-${sched.id}-${noPeserta.trim().replace(/\W+/g, '')}-${Date.now()}`;
    setSessionId(sid);

    // Remember student profile for smooth resume
    try {
      localStorage.setItem(
        STUDENT_PROFILE_KEY,
        JSON.stringify({ namaSiswa: namaSiswa.trim(), noPeserta: noPeserta.trim(), kelas })
      );
    } catch {}

    // Load auto-saved draft answers if present
    const draftKey = `cbt_ma_nh_draft_${sched.id}_${noPeserta.trim()}`;
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft) as Record<string, StudentAnswerValue>;
        setAnswers(parsed);
        setDraftRestored(Object.keys(parsed).length > 0);
      } else {
        setAnswers({});
        setDraftRestored(false);
      }
    } catch {
      setAnswers({});
      setDraftRestored(false);
    }

    setSecondsLeft(sched.durasiMenit * 60);
    setTabExits(0);
    setHeadTurns(0);
    setViolationRedScreen(false);
    setHeadTurnAlarmActive(false);
    submittedRef.current = false;
    setStage('hardware');
  };

  // Request Camera + Mic
  const requestCameraAndMic = async () => {
    setHardwareError('');
    setHardwareLoading(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser perangkat tidak mendukung akses kamera & mikrofon.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 },
        audio: true,
      });
      mediaStreamRef.current = stream;
      setMediaStream(stream);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Izin kamera depan & mikrofon ditolak atau perangkat tidak ditemukan.';
      setHardwareError(
        `Akses Kamera & Mikrofon wajib diizinkan: ${msg}. Pastikan tidak ada aplikasi lain yang memakai kamera.`
      );
    } finally {
      setHardwareLoading(false);
    }
  };

  // Start WebRTC Signaling & Live Stream record
  const startWebRtcBroadcast = useCallback(
    async (stream: MediaStream, sid: string, sched: ExamSchedule) => {
      await cbtStore.upsertLiveStream({
        sessionId: sid,
        namaSiswa: namaSiswa.trim(),
        noPeserta: noPeserta.trim(),
        kelas,
        mataPelajaran: sched.mataPelajaran,
        judulUjian: sched.judulUjian,
        scheduleId: sched.id,
        guruId: sched.guruId,
        status: 'Mengerjakan',
        audioLevel: 0,
        jumlahKeluarTab: 0,
        jumlahMenoleh: 0,
        updatedAt: new Date().toISOString(),
      });

      const db = getFirestoreInstance();
      if (!db || typeof RTCPeerConnection === 'undefined') return;

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        peerRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offerCandidatesCol = collection(db, 'live_streams', sid, 'offerCandidates');
        const answerCandidatesCol = collection(db, 'live_streams', sid, 'answerCandidates');

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(offerCandidatesCol, event.candidate.toJSON()).catch(() => {});
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await setDoc(
          doc(db, 'live_streams', sid),
          { offerSdp: JSON.stringify(offer) },
          { merge: true }
        );

        onSnapshot(doc(db, 'live_streams', sid), (snap) => {
          const data = snap.data() as { answerSdp?: string; warningMessage?: string } | undefined;
          if (data?.warningMessage) {
            setTeacherWarning(data.warningMessage);
            examAudio.playGentleWarningChime();
          }
          if (data?.answerSdp && !pc.currentRemoteDescription) {
            try {
              const ans = JSON.parse(data.answerSdp) as RTCSessionDescriptionInit;
              pc.setRemoteDescription(new RTCSessionDescription(ans)).catch(() => {});
            } catch {}
          }
        });

        onSnapshot(answerCandidatesCol, (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === 'added') {
              try {
                pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
              } catch {}
            }
          });
        });
      } catch {
        // Live proctor metadata continues even if WebRTC signaling blocked
      }
    },
    [kelas, namaSiswa, noPeserta]
  );

  // Unified Submit Handler (Normal, Timeout, & Violation)
  const submitExamResult = useCallback(
    async (status: SubmissionStatus, alasanPelanggaran?: string) => {
      if (!activeSchedule || submittedRef.current) return;
      submittedRef.current = true;
      setIsSubmitting(true);

      const questions = activeSchedule.questionsSnapshot;
      const graded = gradeSubmission(questions, answers);

      const result: ExamResult = {
        id: `res-${sessionId}`,
        sessionId,
        waktuSubmit: new Date().toISOString(),
        namaSiswa: namaSiswa.trim(),
        noPeserta: noPeserta.trim(),
        kelas,
        mataPelajaran: activeSchedule.mataPelajaran,
        judulUjian: activeSchedule.judulUjian,
        scheduleId: activeSchedule.id,
        guruId: activeSchedule.guruId,
        skorPG: graded.skorPG,
        skorEsai: graded.skorEsai,
        nilaiAkhir: graded.nilaiAkhir,
        status,
        alasanPelanggaran,
        jumlahKeluarTab: tabExits,
        jumlahMenoleh: headTurns,
        jawabanDetail: { ...answers },
        snapshotQuestions: questions,
        sudahDinilaiEsai: !graded.hasEssay,
      };

      // Step 1: await save to database FIRST before stopping camera/fullscreen/leaving
      const res = await cbtStore.submitExamResult(result);

      if (!res.syncedCloud && !navigator.onLine) {
        setRetryStatus('Sinyal lemah, sedang mencoba mengirim ulang otomatis...');
        retryIntervalRef.current = window.setInterval(async () => {
          if (navigator.onLine) {
            const retryRes = await cbtStore.submitExamResult(result);
            if (retryRes.syncedCloud) {
              setRetryStatus('Terkirim ke Cloud!');
              if (retryIntervalRef.current) {
                window.clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = null;
              }
            }
          }
        }, 3000);
      }

      // Clear local answer draft
      try {
        localStorage.removeItem(`cbt_ma_nh_draft_${activeSchedule.id}_${noPeserta.trim()}`);
      } catch {}

      // Step 2: stop media, exit fullscreen, disable proctoring sensors
      await stopAllSensorsAndMedia(sessionId);

      setFinalResult(result);
      setIsSubmitting(false);
      setConfirmOpen(false);
      setStage('finished');
    },
    [
      activeSchedule,
      answers,
      headTurns,
      kelas,
      namaSiswa,
      noPeserta,
      sessionId,
      stopAllSensorsAndMedia,
      tabExits,
    ]
  );

  // Start Exam & Fullscreen
  const handleStartExam = async () => {
    if (!mediaStreamRef.current || !activeSchedule) return;
    examAudio.unlock();

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen may be restricted in some embedded contexts
    }

    examActiveRef.current = true;
    onExamActiveChange(true);
    warn15SentRef.current = false;
    warn5SentRef.current = false;
    baselineCenterRef.current = null;

    await startWebRtcBroadcast(mediaStreamRef.current, sessionId, activeSchedule);
    setStage('exam');
  };

  // Auto-save answers to LocalStorage
  const updateAnswer = (questionId: string, val: StudentAnswerValue) => {
    if (!activeSchedule) return;
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: val };
      try {
        localStorage.setItem(
          `cbt_ma_nh_draft_${activeSchedule.id}_${noPeserta.trim()}`,
          JSON.stringify(next)
        );
      } catch {}
      return next;
    });
  };

  // Exam Countdown Timer + 15m/5m Warnings
  useEffect(() => {
    if (stage !== 'exam' || !activeSchedule) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          submitExamResult('Selesai');
          return 0;
        }
        const next = prev - 1;
        if (next === 900 && !warn15SentRef.current) {
          warn15SentRef.current = true;
          setTimerToast('Perhatian: Waktu ujian tersisa 15 menit lagi.');
          examAudio.playGentleWarningChime();
          setTimeout(() => setTimerToast(''), 6000);
        }
        if (next === 300 && !warn5SentRef.current) {
          warn5SentRef.current = true;
          setTimerToast('Segera periksa jawaban Anda! Waktu ujian tersisa 5 menit.');
          examAudio.playGentleWarningChime();
          setTimeout(() => setTimerToast(''), 6000);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [stage, activeSchedule, submitExamResult]);

  // Real-Time Remote Force-Stop Detection ("Hentikan Paksa" by Admin / Teacher)
  useEffect(() => {
    if (stage !== 'exam' || !activeSchedule || submittedRef.current) return;
    const latest = schedules.find((s) => s.id === activeSchedule.id);
    if (latest && !latest.aktif) {
      setTimerToast('Sesi ujian dihentikan paksa oleh Admin/Guru. Jawaban Anda sedang dikirim...');
      examAudio.playGentleWarningChime();
      submitExamResult('Selesai', 'Ujian dihentikan paksa oleh Admin/Guru');
    }
  }, [stage, activeSchedule, schedules, submitExamResult]);

  // Proctoring: App/Tab exit & Fullscreen exit detection (tolerance 3x, >3x auto-submit)
  useEffect(() => {
    if (stage !== 'exam') return;

    const recordExitIncident = () => {
      if (!examActiveRef.current || submittedRef.current) return;
      setTabExits((prev) => {
        const next = prev + 1;
        if (next > TAB_EXIT_TOLERANCE) {
          setViolationRedScreen(true);
          examAudio.startLoudAlarm();
          submitExamResult(
            'Pelanggaran',
            `Keluar aplikasi / pindah tab (${next}x melebihi batas ${TAB_EXIT_TOLERANCE}x)`
          );
        } else {
          setGazeNotice(
            `Peringatan keluar layar/tab (${next}/${TAB_EXIT_TOLERANCE})! Lebih dari ${TAB_EXIT_TOLERANCE}x ujian otomatis dikirim.`
          );
          examAudio.playGentleWarningChime();
        }
        return next;
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') recordExitIncident();
    };
    const onBlur = () => recordExitIncident();
    const onFsChange = () => {
      if (!document.fullscreenElement && examActiveRef.current && !submittedRef.current) {
        recordExitIncident();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFsChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [stage, submitExamResult]);

  // Proctoring: Microphone Audio Meter + Face Turn & Eye Gaze Detector (50x alarm, NO auto-submit)
  useEffect(() => {
    if (stage !== 'exam' || !mediaStream || !activeSchedule) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArr: Uint8Array<ArrayBuffer> | null = null;

    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
      const src = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      dataArr = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {}

    const canvas = offscreenCanvasRef.current || document.createElement('canvas');
    offscreenCanvasRef.current = canvas;
    canvas.width = 96;
    canvas.height = 72;
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

    const interval = window.setInterval(() => {
      if (!examActiveRef.current || submittedRef.current) return;

      // Check track integrity (camera/mic turned off mid-exam)
      const videoTrack = mediaStream.getVideoTracks()[0];
      const audioTrack = mediaStream.getAudioTracks()[0];
      if (!videoTrack || !videoTrack.enabled || videoTrack.readyState === 'ended' || !audioTrack) {
        setHardwareError('Kamera atau Mikrofon terputus di tengah ujian!');
        return;
      }

      // Compute microphone level
      let level = 0;
      if (analyser && dataArr) {
        analyser.getByteFrequencyData(dataArr);
        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
        level = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(level);
      }

      // Compute Face Centroid & Eye-Region Gaze Symmetry
      if (ctx2d && examVideoRef.current && examVideoRef.current.readyState >= 2) {
        ctx2d.drawImage(examVideoRef.current, 0, 0, 96, 72);
        const frame = ctx2d.getImageData(0, 0, 96, 72).data;

        let sumX = 0;
        let sumY = 0;
        let weightSum = 0;
        let leftEyeDark = 0;
        let rightEyeDark = 0;

        for (let y = 12; y < 60; y++) {
          for (let x = 16; x < 80; x++) {
            const idx = (y * 96 + x) * 4;
            const r = frame[idx];
            const g = frame[idx + 1];
            const b = frame[idx + 2];
            // Skin/face luminance & warmth weight
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            if (r > g * 0.95 && luma > 55 && luma < 235) {
              sumX += x * luma;
              sumY += y * luma;
              weightSum += luma;
            }
            if (y >= 22 && y <= 36) {
              if (x >= 28 && x <= 44 && luma < 90) leftEyeDark++;
              if (x >= 52 && x <= 68 && luma < 90) rightEyeDark++;
            }
          }
        }

        if (weightSum > 5000) {
          const cx = sumX / weightSum;
          const cy = sumY / weightSum;
          if (!baselineCenterRef.current) {
            baselineCenterRef.current = { x: cx, y: cy };
          } else {
            const dx = Math.abs(cx - baselineCenterRef.current.x);
            const dy = Math.abs(cy - baselineCenterRef.current.y);
            const eyeAsym = Math.abs(leftEyeDark - rightEyeDark);
            const now = Date.now();
            if ((dx > 9.5 || dy > 8.5 || eyeAsym > 55) && now - lastTurnTickRef.current > 1800) {
              lastTurnTickRef.current = now;
              setHeadTurns((prev) => {
                const next = prev + 1;
                if (next >= HEAD_TURN_LIMIT) {
                  // 50x limit reached -> LOUD ALARM, does NOT end exam!
                  setHeadTurnAlarmActive(true);
                  examAudio.startLoudAlarm();
                  setGazeNotice(
                    `ALARM AKTIF! Terdeteksi menoleh / pandangan keluar layar ${next}x (Batas ${HEAD_TURN_LIMIT}x). Ujian tetap berlanjut, harap hadap ke layar!`
                  );
                } else {
                  setGazeNotice(
                    `Peringatan gestur wajah/mata (${next}/${HEAD_TURN_LIMIT}): Tetap fokus menghadap soal!`
                  );
                }
                return next;
              });
            }
          }
        }
      }

      // Sync live telemetry heartbeat
      cbtStore.upsertLiveStream({
        sessionId,
        namaSiswa: namaSiswa.trim(),
        noPeserta: noPeserta.trim(),
        kelas,
        mataPelajaran: activeSchedule.mataPelajaran,
        judulUjian: activeSchedule.judulUjian,
        scheduleId: activeSchedule.id,
        guruId: activeSchedule.guruId,
        status: 'Mengerjakan',
        audioLevel: level,
        jumlahKeluarTab: tabExits,
        jumlahMenoleh: headTurns,
        updatedAt: new Date().toISOString(),
      });
    }, 1200);

    return () => {
      window.clearInterval(interval);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [
    stage,
    mediaStream,
    activeSchedule,
    sessionId,
    namaSiswa,
    noPeserta,
    kelas,
    tabExits,
    headTurns,
  ]);

  const downloadProofFile = () => {
    const payload = {
      lembaga: 'MA Nurul Hijrah',
      namaSiswa,
      noPeserta,
      kelas,
      mataPelajaran: activeSchedule?.mataPelajaran,
      judulUjian: activeSchedule?.judulUjian,
      waktu: new Date().toISOString(),
      jawaban: answers,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bukti_Jawaban_${namaSiswa.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const answeredCount = useMemo(() => {
    if (!activeSchedule) return 0;
    return activeSchedule.questionsSnapshot.filter((q) => {
      const a = answers[q.id];
      if (Array.isArray(a)) return a.length > 0;
      return typeof a === 'string' && a.trim().length > 0;
    }).length;
  }, [activeSchedule, answers]);

  // ========================== STAGE 1: ENTRY ==========================
  if (stage === 'entry') {
    return (
      <div className="max-w-2xl mx-auto animate-ios-enter">
        <div className="glass-surface rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Portal Ujian Siswa
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Masukkan identitas peserta dan token ujian aktif untuk memulai
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isInstalled && isInstallable && (
                <button
                  type="button"
                  onClick={install}
                  className="glass-pill-btn px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Instal Aplikasi CBT
                </button>
              )}
              <button
                type="button"
                onClick={onOpenQrInstall}
                className="glass-pill-btn px-3 py-2 rounded-xl glass-subtle text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                QR Instal HP
              </button>
            </div>
          </div>

          <form onSubmit={handleEntrySubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="siswa-nama"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  Nama Lengkap Siswa
                </label>
                <input
                  id="siswa-nama"
                  type="text"
                  value={namaSiswa}
                  onChange={(e) => setNamaSiswa(e.target.value)}
                  placeholder="Contoh: Ahmad Fauzan"
                  className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label
                  htmlFor="siswa-nopeserta"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  No. Peserta Ujian
                </label>
                <input
                  id="siswa-nopeserta"
                  type="text"
                  value={noPeserta}
                  onChange={(e) => setNoPeserta(e.target.value)}
                  placeholder="Contoh: 2026-014"
                  className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="siswa-kelas"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  Kelas
                </label>
                <select
                  id="siswa-kelas"
                  value={kelas}
                  onChange={(e) => setKelas(e.target.value)}
                  className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {classes.map((c) => (
                    <option key={c} value={c} className="bg-white dark:bg-slate-900">
                      Kelas {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="siswa-token"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  Token Ujian (6 Karakter)
                </label>
                <input
                  id="siswa-token"
                  type="text"
                  maxLength={8}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                  placeholder="Masukkan token"
                  className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm font-mono uppercase tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="siswa-jadwal"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Mata Pelajaran / Jadwal Ujian Aktif
              </label>
              <select
                id="siswa-jadwal"
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
                className="w-full rounded-xl glass-subtle px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {activeSchedules.length === 0 ? (
                  <option value="" className="bg-white dark:bg-slate-900">
                    -- Belum ada ujian aktif untuk kelas {kelas} --
                  </option>
                ) : (
                  activeSchedules.map((s) => (
                    <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900">
                      {s.mataPelajaran} — {s.judulUjian} ({s.durasiMenit} Menit ·{' '}
                      {s.questionsSnapshot.length} Soal)
                    </option>
                  ))
                )}
              </select>
            </div>

            {entryError && (
              <div
                role="alert"
                className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-xs font-semibold text-rose-700 dark:text-rose-200 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {entryError}
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onBackHome}
                className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Kembali
              </button>
              <button
                type="submit"
                className="glass-pill-btn px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold shadow-lg shadow-emerald-900/20"
              >
                Lanjut ke Verifikasi Kamera
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ========================== STAGE 2: HARDWARE GATE ==========================
  if (stage === 'hardware' && activeSchedule) {
    const hardwareReady = !!mediaStream;
    return (
      <div className="max-w-xl mx-auto animate-ios-enter">
        <div className="glass-surface rounded-3xl p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Verifikasi Keamanan & Proctoring Live
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {activeSchedule.mataPelajaran} · {activeSchedule.judulUjian} ·{' '}
              <span className="tabular-nums">{activeSchedule.durasiMenit} Menit</span>
            </p>
          </div>

          <div className="rounded-2xl glass-subtle p-4 space-y-2 text-xs text-slate-700 dark:text-slate-200">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Aturan Pengawasan Ujian Aktif:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Kamera depan & mikrofon wajib aktif selama ujian berlangsung.</li>
              <li>Toleransi keluar layar / pindah tab maksimal {TAB_EXIT_TOLERANCE}x (lebih dari itu otomatis terkirim).</li>
              <li>Sensor arah wajah & pandangan mata aktif (batas {HEAD_TURN_LIMIT}x menoleh memicu alarm keras).</li>
              <li>Jawaban tersimpan otomatis di perangkat Anda setiap kali dipilih.</li>
            </ul>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-full max-w-xs aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900/90 border border-white/30 flex items-center justify-center relative">
              {mediaStream ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center p-4 text-slate-300 text-xs space-y-2">
                  <Camera className="w-8 h-8 mx-auto opacity-75" />
                  <p>Kamera depan belum aktif</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={requestCameraAndMic}
              disabled={hardwareLoading}
              className="glass-pill-btn px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <Mic className="w-4 h-4" />
              {hardwareLoading
                ? 'Meminta Izin Perangkat...'
                : hardwareReady
                ? 'Kamera & Mikrofon Aktif'
                : 'Aktifkan Kamera Depan & Mikrofon'}
            </button>

            {hardwareError && (
              <div
                role="alert"
                className="w-full rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-200"
              >
                {hardwareError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
            <button
              type="button"
              onClick={() => {
                stopAllSensorsAndMedia();
                setStage('entry');
              }}
              className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Kembali
            </button>
            <button
              type="button"
              disabled={!hardwareReady}
              onClick={handleStartExam}
              className="glass-pill-btn px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg"
            >
              Mulai Ujian & Aktifkan Layar Penuh
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================== STAGE 3: EXAM SHEET ==========================
  if (stage === 'exam' && activeSchedule) {
    const questions: Question[] = activeSchedule.questionsSnapshot;

    return (
      <div className="pb-24 animate-ios-enter">
        {/* Red Violation Screen */}
        {violationRedScreen && (
          <div className="fixed inset-0 z-50 bg-rose-700 text-white flex flex-col items-center justify-center p-6 text-center">
            <ShieldAlert className="w-16 h-16 mb-4 animate-bounce" />
            <h2 className="text-2xl sm:text-3xl font-extrabold max-w-xl">
              PERINGATAN PELANGGARAN! ANDA TERDETEKSI KELUAR DARI APLIKASI UJIAN
            </h2>
            <p className="mt-3 text-sm opacity-90 max-w-md">
              Batas toleransi keluar aplikasi ({TAB_EXIT_TOLERANCE}x) telah terlampaui. Lembar
              ujian dikunci dan jawaban Anda sedang dikirim ke database guru.
            </p>
          </div>
        )}

        {/* Sticky Compact Header (< 15% mobile viewport height) */}
        <header className="sticky top-2 z-30 glass-surface rounded-2xl px-3.5 py-2.5 mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              {activeSchedule.mataPelajaran} · {activeSchedule.judulUjian}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate tabular-nums flex items-center gap-2">
              <span>
                {namaSiswa} ({kelas}) · {answeredCount} dari {questions.length} terjawab
              </span>
              <span className="hidden md:inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Jawaban Tersimpan Otomatis
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`px-3 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-bold tabular-nums flex items-center gap-1.5 ${
                secondsLeft <= 300
                  ? 'bg-rose-600 text-white'
                  : 'bg-emerald-700/15 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {formatTimer(secondsLeft)}
            </div>
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-label="Buka navigasi nomor soal"
              className="glass-pill-btn px-3 py-1.5 rounded-xl glass-subtle text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nomor Soal</span>
            </button>
          </div>
        </header>

        {/* Timer / Gaze / Teacher Alerts */}
        <div className="max-w-3xl mx-auto space-y-2 mb-4">
          {draftRestored && (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 px-4 py-2.5 text-xs font-semibold text-emerald-900 dark:text-emerald-100 flex items-center justify-between gap-2">
              <span>Melanjutkan ujian sebelumnya (jawaban tersimpan otomatis).</span>
              <button onClick={() => setDraftRestored(false)} aria-label="Tutup info resume">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {timerToast && (
            <div className="rounded-2xl bg-amber-500/20 border border-amber-500/40 px-4 py-2.5 text-xs font-semibold text-amber-900 dark:text-amber-100 flex items-center justify-between gap-2">
              <span>{timerToast}</span>
              <button onClick={() => setTimerToast('')} aria-label="Tutup pengingat waktu">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {teacherWarning && (
            <div className="rounded-2xl bg-rose-600 text-white px-4 py-3 text-xs font-bold flex items-center justify-between gap-2 shadow-lg">
              <span className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 shrink-0" />
                Peringatan Pengawas: {teacherWarning}
              </span>
              <button onClick={() => setTeacherWarning('')} aria-label="Tutup peringatan guru">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {gazeNotice && (
            <div
              className={`rounded-2xl px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 ${
                headTurnAlarmActive
                  ? 'bg-rose-600 text-white shadow-lg'
                  : 'bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-100'
              }`}
            >
              <span>{gazeNotice}</span>
              {headTurnAlarmActive ? (
                <button
                  type="button"
                  onClick={() => {
                    examAudio.stopAlarm();
                    setHeadTurnAlarmActive(false);
                    setGazeNotice('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white text-rose-700 font-bold whitespace-nowrap"
                >
                  Saya Fokus Kembali
                </button>
              ) : (
                <button onClick={() => setGazeNotice('')} aria-label="Tutup peringatan gestur">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {hardwareError && (
            <div className="rounded-2xl bg-rose-600 text-white px-4 py-3 text-xs font-bold">
              {hardwareError}
            </div>
          )}
        </div>

        {/* Question Navigator Drawer */}
        {navOpen && (
          <div className="max-w-3xl mx-auto mb-5 glass-surface rounded-2xl p-4 animate-ios-enter">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Navigasi Nomor Soal ({answeredCount}/{questions.length})
              </span>
              <button
                onClick={() => setNavOpen(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                Tutup
              </button>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
              {questions.map((q, idx) => {
                const val = answers[q.id];
                const isAnswered = Array.isArray(val)
                  ? val.length > 0
                  : typeof val === 'string' && val.trim().length > 0;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      document
                        .getElementById(`soal-card-${q.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setNavOpen(false);
                    }}
                    className={`h-9 rounded-xl text-xs font-bold tabular-nums transition-colors ${
                      isAnswered
                        ? 'bg-emerald-700 text-white'
                        : 'glass-subtle text-slate-700 dark:text-slate-200 hover:bg-emerald-500/15'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Google Form Style Question Cards */}
        <div className="max-w-3xl mx-auto space-y-5">
          {questions.map((q, idx) => {
            const currentAns = answers[q.id];
            const safeHtml = sanitizeQuestionHtml(q.pertanyaanHtml || q.pertanyaanTeks);

            return (
              <article
                key={q.id}
                id={`soal-card-${q.id}`}
                className="glass-surface rounded-3xl p-5 sm:p-7 space-y-4"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    Soal {idx + 1} dari {questions.length}
                  </span>
                  <span>
                    {q.tipe === 'pg'
                      ? 'Pilihan Ganda'
                      : q.tipe === 'pg_kompleks'
                      ? 'Pilihan Ganda Kompleks (Pilih lebih dari 1)'
                      : q.tipe === 'benar_salah'
                      ? 'Benar / Salah'
                      : q.tipe === 'isian_singkat'
                      ? 'Jawaban Singkat'
                      : 'Esai / Uraian'}
                  </span>
                </div>

                <div
                  className="question-rich-html text-[15px] sm:text-base leading-relaxed text-slate-900 dark:text-slate-100"
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                />

                {/* Pilihan Ganda & Benar/Salah */}
                {(q.tipe === 'pg' || q.tipe === 'benar_salah') && (
                  <div className="space-y-2.5 pt-1">
                    {q.opsi.map((opt) => {
                      const selected = currentAns === opt.key;
                      return (
                        <label
                          key={opt.key}
                          className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 cursor-pointer transition-all border ${
                            selected
                              ? 'bg-emerald-600/15 border-emerald-600 text-emerald-950 dark:text-emerald-100 shadow-sm'
                              : 'glass-subtle border-transparent hover:border-emerald-500/40 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt.key}
                            checked={selected}
                            onChange={() => updateAnswer(q.id, opt.key)}
                            className="w-4 h-4 accent-emerald-700 shrink-0"
                          />
                          <span className="w-7 h-7 rounded-lg bg-white/70 dark:bg-slate-800/80 text-xs font-bold flex items-center justify-center shrink-0">
                            {opt.key}
                          </span>
                          <span className="text-sm leading-snug">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Pilihan Ganda Kompleks */}
                {q.tipe === 'pg_kompleks' && (
                  <div className="space-y-2.5 pt-1">
                    {q.opsi.map((opt) => {
                      const arr = Array.isArray(currentAns) ? currentAns : [];
                      const checked = arr.includes(opt.key);
                      const toggle = () => {
                        const next = checked
                          ? arr.filter((x) => x !== opt.key)
                          : [...arr, opt.key];
                        updateAnswer(q.id, next);
                      };
                      return (
                        <label
                          key={opt.key}
                          className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 cursor-pointer transition-all border ${
                            checked
                              ? 'bg-emerald-600/15 border-emerald-600 text-emerald-950 dark:text-emerald-100'
                              : 'glass-subtle border-transparent hover:border-emerald-500/40 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={toggle}
                            className="w-4 h-4 accent-emerald-700 rounded shrink-0"
                          />
                          <span className="w-7 h-7 rounded-lg bg-white/70 dark:bg-slate-800/80 text-xs font-bold flex items-center justify-center shrink-0">
                            {opt.key}
                          </span>
                          <span className="text-sm leading-snug">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Jawaban Singkat */}
                {q.tipe === 'isian_singkat' && (
                  <input
                    type="text"
                    value={typeof currentAns === 'string' ? currentAns : ''}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    placeholder="Ketik jawaban singkat Anda..."
                    className="w-full rounded-2xl glass-subtle px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}

                {/* Esai / Uraian */}
                {q.tipe === 'esai' && (
                  <textarea
                    rows={4}
                    value={typeof currentAns === 'string' ? currentAns : ''}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    placeholder="Ketik jawaban uraian Anda secara lengkap..."
                    className="w-full rounded-2xl glass-subtle px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </article>
            );
          })}

          {/* Bottom Submit Section */}
          <div className="glass-surface rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Progres: {answeredCount} dari {questions.length} soal telah dijawab
              </div>
              {retryStatus && (
                <div className="text-amber-700 dark:text-amber-300 font-semibold">
                  {retryStatus}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={downloadProofFile}
                className="glass-pill-btn px-4 py-3 rounded-xl glass-subtle text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
              >
                <FileDown className="w-4 h-4" />
                Simpan Bukti Jawaban (File)
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirmOpen(true)}
                className="glass-pill-btn px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-bold shadow-lg flex-1 sm:flex-initial"
              >
                {isSubmitting ? 'Mengirim Jawaban...' : 'Kirim Jawaban'}
              </button>
            </div>
          </div>
        </div>

        {/* Small Corner Camera & Mic Telemetry Preview */}
        <div className="fixed bottom-4 left-4 z-30 glass-surface rounded-2xl p-2 w-36 shadow-xl">
          <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3]">
            <video
              ref={examVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-rose-600/90 text-[9px] font-bold text-white">
              LIVE
            </span>
          </div>
          <div className="mt-1.5 space-y-1">
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-150"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
              <span>Tab: {tabExits}/{TAB_EXIT_TOLERANCE}</span>
              <span>Fokus: {headTurns}/{HEAD_TURN_LIMIT}</span>
            </div>
          </div>
        </div>

        {/* Confirmation Modal */}
        {confirmOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="glass-surface max-w-sm w-full rounded-3xl p-6 space-y-4 animate-ios-enter">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Konfirmasi Pengiriman Jawaban
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Anda telah menjawab <b>{answeredCount}</b> dari <b>{questions.length}</b> soal.
                Setelah dikirim, lembar ujian akan ditutup dan nilai otomatis tercatat ke guru.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmOpen(false)}
                  className="glass-pill-btn px-4 py-2 rounded-xl glass-subtle text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Periksa Lagi
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => submitExamResult('Selesai')}
                  className="glass-pill-btn px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Ya, Kirim Sekarang'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========================== STAGE 4: FINISHED ==========================
  return (
    <div className="max-w-lg mx-auto animate-ios-enter">
      <div className="glass-surface rounded-3xl p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Ujian Selesai — Terima Kasih
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            Kamera, mikrofon, dan mode layar penuh telah dinonaktifkan dengan aman.
          </p>
        </div>

        {finalResult && (
          <div className="rounded-2xl glass-subtle p-4 text-left text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Nama Peserta</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {finalResult.namaSiswa}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Mata Pelajaran</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {finalResult.mataPelajaran}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Status Pengumpulan</span>
              <span
                className={`font-bold ${
                  finalResult.status === 'Selesai' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'
                }`}
              >
                {finalResult.status === 'Selesai' ? 'Selesai (Normal)' : 'Pelanggaran'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Skor Pilihan Ganda</span>
              <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                {finalResult.skorPG}
              </span>
            </div>
          </div>
        )}

        {retryStatus && (
          <div className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            {retryStatus}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={downloadProofFile}
            className="glass-pill-btn px-4 py-2.5 rounded-xl glass-subtle text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
          >
            <FileDown className="w-4 h-4" />
            Unduh Bukti Jawaban
          </button>
          <button
            type="button"
            onClick={() => {
              setStage('entry');
              onBackHome();
            }}
            className="glass-pill-btn px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            Kembali ke Beranda
          </button>
        </div>
      </div>
    </div>
  );
};
