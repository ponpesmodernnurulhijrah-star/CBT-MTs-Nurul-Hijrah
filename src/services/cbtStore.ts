import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  enableIndexedDbPersistence,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type {
  AdminAccount,
  AppSettings,
  ClassItem,
  ConflictEntityKind,
  ConflictResolutionChoice,
  ExamResult,
  ExamSchedule,
  FirebaseOverrideConfig,
  LiveProctorSession,
  PendingLocalChange,
  Question,
  SubjectItem,
  SyncConflict,
  SyncStatus,
  TeacherAccount,
} from '../types/cbt';
import {
  APP_VERSION,
  DEFAULT_CLASSES,
  DEFAULT_SUBJECTS,
  getTeacherSubjects,
  hashSaltedPassword,
  normalizeQuestionDoc,
  normalizeResultDoc,
  normalizeScheduleDoc,
  sha256Hex,
  verifySaltedOrLegacyPassword,
} from '../utils/cbtLogic';
import {
  buildMergedEntity,
  computeEntityFingerprint,
  evaluatePendingVsServer,
} from '../utils/conflictLogic';
import { syncToGoogleSheets } from './googleSheetsService';

// Permanent embedded default Firebase config
export const DEFAULT_FIREBASE_CONFIG: FirebaseOverrideConfig = {
  apiKey: 'AIzaSyDW4jsS43wIbo6DqsPBxHv9CppqHkEQV_Y',
  authDomain: 'cbt-mas-nurul-hijrah.firebaseapp.com',
  databaseURL:
    'https://cbt-mas-nurul-hijrah-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'cbt-mas-nurul-hijrah',
  storageBucket: 'cbt-mas-nurul-hijrah.firebasestorage.app',
  messagingSenderId: '677195675269',
  appId: '1:677195675269:web:02e6168d5f97ee05751bec',
  measurementId: 'G-99TVYEBXGE',
};

const LS_KEYS = {
  initialized: 'cbt_ma_nh_seeded_v3',
  admins: 'cbt_ma_nh_admins',
  teachers: 'cbt_ma_nh_teachers',
  subjects: 'cbt_ma_nh_subjects',
  subjectItems: 'cbt_ma_nh_subject_items',
  classes: 'cbt_ma_nh_classes',
  classItems: 'cbt_ma_nh_class_items',
  questions: 'cbt_ma_nh_questions',
  schedules: 'cbt_ma_nh_schedules',
  results: 'cbt_ma_nh_results',
  liveStreams: 'cbt_ma_nh_live_streams',
  settings: 'cbt_ma_nh_settings',
  pendingMutations: 'cbt_ma_nh_pending_mutations',
  syncConflicts: 'cbt_ma_nh_sync_conflicts',
  forceLocal: 'cbt_force_local',
  fbOverride: 'cbt_fb_override',
};

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let persistenceAttempted = false;

export function getActiveFirebaseConfig(): FirebaseOverrideConfig {
  if (typeof window === 'undefined') return DEFAULT_FIREBASE_CONFIG;
  try {
    const raw = localStorage.getItem(LS_KEYS.fbOverride);
    if (!raw) return DEFAULT_FIREBASE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<FirebaseOverrideConfig>;
    if (parsed.apiKey && parsed.projectId && parsed.appId) {
      return {
        ...DEFAULT_FIREBASE_CONFIG,
        ...parsed,
      };
    }
  } catch {
    // Ignore invalid JSON override
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function isForceLocalMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(LS_KEYS.forceLocal) === '1';
}

export function getFirestoreInstance(): Firestore | null {
  if (typeof window === 'undefined' || isForceLocalMode()) return null;
  if (firestoreDb) return firestoreDb;
  try {
    const cfg = getActiveFirebaseConfig();
    firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(cfg);
    firestoreDb = getFirestore(firebaseApp);
    if (!persistenceAttempted) {
      persistenceAttempted = true;
      enableIndexedDbPersistence(firestoreDb).catch(() => {});
    }
    return firestoreDb;
  } catch {
    return null;
  }
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export interface CbtSnapshotState {
  admins: AdminAccount[];
  teachers: TeacherAccount[];
  subjects: string[];
  subjectItems: SubjectItem[];
  classes: string[];
  classItems: ClassItem[];
  questions: Question[];
  schedules: ExamSchedule[];
  results: ExamResult[];
  liveStreams: LiveProctorSession[];
  settings: AppSettings;
  cloudConnected: boolean;
  syncStatus: SyncStatus;
  pendingChanges: PendingLocalChange[];
  syncConflicts: SyncConflict[];
}

const DEFAULT_SETTINGS: AppSettings = {
  googleSheetsUrl: '',
  appVersion: APP_VERSION,
  institutionName: 'MA Nurul Hijrah',
  updatedAt: new Date().toISOString(),
};

async function buildDefaultAdmins(): Promise<AdminAccount[]> {
  const [rizqiHash, opHash, adminHash] = await Promise.all([
    sha256Hex('rizqi123'),
    sha256Hex('adminmasnh2026'),
    sha256Hex('admin'),
  ]);
  return [
    { id: 'adm-1', nama: 'Rizqi (Super Admin)', username: 'rizqi', passwordHash: rizqiHash },
    {
      id: 'adm-2',
      nama: 'Super Admin NH',
      username: 'operator_nurulhijrah',
      passwordHash: opHash,
    },
    { id: 'adm-3', nama: 'Admin Utama', username: 'admin', passwordHash: adminHash },
  ];
}

async function buildSeedData() {
  const admins = await buildDefaultAdmins();
  const [
    winnieHash,
    khairiyahHash,
    nadilaHash,
    nurhayatiHash,
    lizaHash,
    maratusHash,
    hidayatHash,
    arumHash,
    kiftiaHash,
    puputHash,
    sitiHash,
    ahmadHash,
  ] = await Promise.all([
    sha256Hex('winnie123'),
    sha256Hex('khairiyah123'),
    sha256Hex('nadila123'),
    sha256Hex('nurhayati123'),
    sha256Hex('liza123'),
    sha256Hex('maratus123'),
    sha256Hex('hidayatullah123'),
    sha256Hex('arum123'),
    sha256Hex('kiftia123'),
    sha256Hex('puput123'),
    sha256Hex('siti123'),
    sha256Hex('ahmad123'),
  ]);

  const now = new Date().toISOString();
  const teachers: TeacherAccount[] = [
    {
      id: 'guru-winnie',
      nama: 'Winnie, S.Pd.',
      username: 'winnie',
      passwordHash: winnieHash,
      mataPelajaran: 'Matematika',
      mataPelajaranList: ['Matematika'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-ahmad',
      nama: 'Ustadz Ahmad, M.Pd.',
      username: 'ustadz_ahmad',
      passwordHash: ahmadHash,
      mataPelajaran: 'Matematika',
      mataPelajaranList: ['Matematika'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-khairiyah',
      nama: 'Khairiyah, S.Pd.',
      username: 'khairiyah',
      passwordHash: khairiyahHash,
      mataPelajaran: 'Bahasa Indonesia',
      mataPelajaranList: ['Bahasa Indonesia'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-nadila',
      nama: 'Nadila, S.Pd.',
      username: 'nadila',
      passwordHash: nadilaHash,
      mataPelajaran: 'Bahasa Inggris',
      mataPelajaranList: ['Bahasa Inggris'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-nurhayati',
      nama: 'Nurhayati, S.Pd.',
      username: 'nurhayati',
      passwordHash: nurhayatiHash,
      mataPelajaran: 'IPS',
      mataPelajaranList: ['IPS'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-liza',
      nama: 'Liza Fairuz, Lc.',
      username: 'liza',
      passwordHash: lizaHash,
      mataPelajaran: 'Bahasa Arab',
      mataPelajaranList: ['Bahasa Arab'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-maratus',
      nama: "Mar'atus, S.Ag.",
      username: 'maratus',
      passwordHash: maratusHash,
      mataPelajaran: 'Tahfidz Fiqih',
      mataPelajaranList: ['Tahfidz Fiqih'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-hidayatullah',
      nama: 'Ust. Hidayatullah, S.Pd.I.',
      username: 'hidayatullah',
      passwordHash: hidayatHash,
      mataPelajaran: 'Qurdits',
      mataPelajaranList: ['Qurdits'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-arum',
      nama: 'Arum Umiyati, S.Pd.',
      username: 'arum',
      passwordHash: arumHash,
      mataPelajaran: 'SKI',
      mataPelajaranList: ['SKI'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-kiftia',
      nama: 'Kiftia Nurdini, S.Kom.',
      username: 'kiftia',
      passwordHash: kiftiaHash,
      mataPelajaran: 'TIK',
      mataPelajaranList: ['TIK'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-puput',
      nama: 'Puput, S.Sn.',
      username: 'puput',
      passwordHash: puputHash,
      mataPelajaran: 'Seni Rupa',
      mataPelajaranList: ['Seni Rupa'],
      aktif: true,
      createdAt: now,
    },
    {
      id: 'guru-siti',
      nama: 'Hj. Siti Zakiyah, S.Pd.',
      username: 'siti',
      passwordHash: sitiHash,
      mataPelajaran: 'PPKN',
      mataPelajaranList: ['PPKN'],
      aktif: true,
      createdAt: now,
    },
  ];

  const subjectItems: SubjectItem[] = DEFAULT_SUBJECTS.map((nama, idx) => ({
    id: `mapel-seed-${idx + 1}`,
    nama,
    urut: idx + 1,
  }));

  const classItems: ClassItem[] = DEFAULT_CLASSES.map((nama, idx) => ({
    id: `kelas-seed-${idx + 1}`,
    nama,
    urut: idx + 1,
  }));

  return {
    admins,
    teachers,
    subjects: [...DEFAULT_SUBJECTS],
    subjectItems,
    classes: [...DEFAULT_CLASSES],
    classItems,
    questions: [] as Question[],
    schedules: [] as ExamSchedule[],
    results: [] as ExamResult[],
  };
}

class CbtStore {
  private state: CbtSnapshotState = {
    admins: [],
    teachers: [],
    subjects: [...DEFAULT_SUBJECTS],
    subjectItems: DEFAULT_SUBJECTS.map((nama, idx) => ({
      id: `mapel-def-${idx + 1}`,
      nama,
      urut: idx + 1,
    })),
    classes: [...DEFAULT_CLASSES],
    classItems: DEFAULT_CLASSES.map((nama, idx) => ({
      id: `kelas-def-${idx + 1}`,
      nama,
      urut: idx + 1,
    })),
    questions: [],
    schedules: [],
    results: [],
    liveStreams: [],
    settings: DEFAULT_SETTINGS,
    cloudConnected: false,
    syncStatus: {
      state: isForceLocalMode() ? 'local_forced' : 'syncing',
      mode: isForceLocalMode() ? 'local' : 'firebase',
      pendingWrites: 0,
      lastSyncedAt: null,
      lastEvent: isForceLocalMode()
        ? 'Mode Lokal aktif (tersimpan di perangkat)'
        : 'Menghubungkan sinkronisasi real-time ke database pusat...',
      projectId: getActiveFirebaseConfig().projectId,
      fromCache: false,
    },
    pendingChanges: [],
    syncConflicts: [],
  };

  private listeners = new Set<(state: CbtSnapshotState) => void>();
  private bc: BroadcastChannel | null = null;
  private initPromise: Promise<void> | null = null;
  private unsubs: Array<() => void> = [];
  private defaultAdminsCache: AdminAccount[] = [];
  private remoteAdminsDocs: AdminAccount[] = [];
  private settingsAdminOverride: AdminAccount | null = null;
  private serverLastSeenDocs: Partial<
    Record<ConflictEntityKind, Record<string, Record<string, unknown>>>
  > = {};

  private notify() {
    const snapshot: CbtSnapshotState = {
      ...this.state,
      syncStatus: { ...this.state.syncStatus },
      pendingChanges: [...this.state.pendingChanges],
      syncConflicts: [...this.state.syncConflicts],
    };
    for (const cb of this.listeners) {
      cb(snapshot);
    }
  }

  private setSyncStatus(partial: Partial<SyncStatus>) {
    const hasConflict = this.state.syncConflicts.length > 0;
    const requestedState = partial.state ?? this.state.syncStatus.state;
    const resolvedState =
      hasConflict && requestedState !== 'offline' && requestedState !== 'syncing'
        ? 'conflict'
        : requestedState;
    this.state.syncStatus = {
      ...this.state.syncStatus,
      ...partial,
      state: resolvedState,
    };
    this.notify();
  }

  private rebuildAdminsList() {
    const byUsername = new Map<string, AdminAccount>();
    for (const a of this.defaultAdminsCache) {
      byUsername.set(a.username.toLowerCase(), a);
    }
    for (const a of this.remoteAdminsDocs) {
      if (a.username) {
        byUsername.set(a.username.toLowerCase(), a);
      }
    }
    if (this.settingsAdminOverride && this.settingsAdminOverride.username && this.settingsAdminOverride.salt) {
      // Salted admin account set via Pengaturan Akun Admin strictly replaces matching default username
      byUsername.set(
        this.settingsAdminOverride.username.toLowerCase(),
        this.settingsAdminOverride
      );
    }
    const merged = Array.from(byUsername.values());
    this.state.admins = merged;
    writeLS(LS_KEYS.admins, merged);
  }

  public getState(): CbtSnapshotState {
    return this.state;
  }

  public subscribe(cb: (state: CbtSnapshotState) => void): () => void {
    this.listeners.add(cb);
    cb({
      ...this.state,
      syncStatus: { ...this.state.syncStatus },
    });
    return () => {
      this.listeners.delete(cb);
    };
  }

  public async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.performInit();
    return this.initPromise;
  }

  private async performInit(): Promise<void> {
    this.defaultAdminsCache = await buildDefaultAdmins();
    const alreadySeeded = localStorage.getItem(LS_KEYS.initialized);
    const existingAdmins = readLS<AdminAccount[]>(LS_KEYS.admins, []);

    if (!alreadySeeded || existingAdmins.length === 0) {
      const seed = await buildSeedData();
      writeLS(LS_KEYS.admins, seed.admins);
      if (!alreadySeeded) {
        writeLS(LS_KEYS.teachers, seed.teachers);
        writeLS(LS_KEYS.subjects, seed.subjects);
        writeLS(LS_KEYS.subjectItems, seed.subjectItems);
        writeLS(LS_KEYS.classes, seed.classes);
        writeLS(LS_KEYS.classItems, seed.classItems);
        writeLS(LS_KEYS.questions, seed.questions);
        writeLS(LS_KEYS.schedules, seed.schedules);
        writeLS(LS_KEYS.results, seed.results);
        writeLS(LS_KEYS.settings, DEFAULT_SETTINGS);
        localStorage.setItem(LS_KEYS.initialized, '1');
      }
    }

    this.loadFromLocalStorage();
    this.rebuildAdminsList();

    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel('cbt_ma_nh_sync');
      this.bc.onmessage = (ev) => {
        this.loadFromLocalStorage();
        const eventMsg =
          typeof ev.data?.event === 'string'
            ? ev.data.event
            : 'Perubahan dari tab lain tersinkron';
        this.setSyncStatus({
          lastEvent: eventMsg,
          lastSyncedAt: new Date().toISOString(),
        });
      };
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (ev) => {
        if (ev.key?.startsWith('cbt_ma_nh_')) {
          this.loadFromLocalStorage();
          this.notify();
        }
      });
      window.addEventListener('online', () => {
        if (!isForceLocalMode()) {
          this.setSyncStatus({
            state: 'syncing',
            lastEvent: 'Koneksi kembali pulih, menyinkronkan ke database pusat...',
          });
        }
      });
      window.addEventListener('offline', () => {
        this.setSyncStatus({
          state: isForceLocalMode() ? 'local_forced' : 'offline',
          cloudConnected: false,
          lastEvent: 'Offline — perubahan disimpan di perangkat & akan tersinkron otomatis',
        } as Partial<SyncStatus>);
        this.state.cloudConnected = false;
        this.notify();
      });
    }

    if (!isForceLocalMode()) {
      this.attachFirestoreListeners();
    } else {
      this.state.cloudConnected = false;
      this.setSyncStatus({
        state: 'local_forced',
        mode: 'local',
        lastEvent: 'Mode Lokal Aktif (data tersimpan aman di perangkat)',
      });
    }
    this.notify();
  }

  private loadFromLocalStorage() {
    const cachedAdmins = readLS<AdminAccount[]>(LS_KEYS.admins, []);
    if (cachedAdmins.length > 0) {
      this.state.admins = cachedAdmins;
    }
    this.state.teachers = readLS<TeacherAccount[]>(LS_KEYS.teachers, []).map((t) => {
      const list = getTeacherSubjects(t);
      return {
        ...t,
        mataPelajaran: list[0] || t.mataPelajaran || 'Matematika',
        mataPelajaranList: list,
      };
    });
    this.state.subjects = readLS(LS_KEYS.subjects, [...DEFAULT_SUBJECTS]);
    this.state.subjectItems = readLS(
      LS_KEYS.subjectItems,
      this.state.subjects.map((nama, idx) => ({
        id: `mapel-ls-${idx + 1}`,
        nama,
        urut: idx + 1,
      }))
    );
    this.state.classes = readLS(LS_KEYS.classes, [...DEFAULT_CLASSES]);
    this.state.classItems = readLS(
      LS_KEYS.classItems,
      this.state.classes.map((nama, idx) => ({
        id: `kelas-ls-${idx + 1}`,
        nama,
        urut: idx + 1,
      }))
    );
    this.state.questions = readLS<Array<Record<string, unknown>>>(LS_KEYS.questions, []).map((q) =>
      normalizeQuestionDoc(q)
    );
    this.state.schedules = readLS<Array<Record<string, unknown>>>(LS_KEYS.schedules, []).map((s) =>
      normalizeScheduleDoc(s)
    );
    this.state.results = readLS<Array<Record<string, unknown>>>(LS_KEYS.results, []).map((r) =>
      normalizeResultDoc(r)
    );
    this.state.liveStreams = readLS(LS_KEYS.liveStreams, []);
    this.state.settings = readLS(LS_KEYS.settings, DEFAULT_SETTINGS);
    this.state.pendingChanges = readLS<PendingLocalChange[]>(LS_KEYS.pendingMutations, []);
    this.state.syncConflicts = readLS<SyncConflict[]>(LS_KEYS.syncConflicts, []);
  }

  private broadcastLocalChange(eventLabel?: string) {
    this.bc?.postMessage({ ts: Date.now(), event: eventLabel });
  }

  private detachFirestoreListeners() {
    for (const unsub of this.unsubs) {
      try {
        unsub();
      } catch {}
    }
    this.unsubs = [];
  }

  private attachFirestoreListeners() {
    this.detachFirestoreListeners();
    const db = getFirestoreInstance();
    if (!db) {
      this.state.cloudConnected = false;
      this.setSyncStatus({
        state: isForceLocalMode() ? 'local_forced' : 'offline',
        mode: isForceLocalMode() ? 'local' : 'firebase',
      });
      return;
    }

    const cfg = getActiveFirebaseConfig();
    const safeSub = (unsub: () => void) => this.unsubs.push(unsub);

    const markSnapshotSync = (
      fromCache: boolean,
      hasPendingWrites: boolean,
      label?: string
    ) => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      this.state.cloudConnected = online && !isForceLocalMode();
      let nextState: SyncStatus['state'] = 'synced';
      if (this.state.syncConflicts.length > 0) nextState = 'conflict';
      else if (!online) nextState = 'offline';
      else if (hasPendingWrites || this.state.syncStatus.pendingWrites > 0) nextState = 'syncing';
      else if (fromCache && !online) nextState = 'pending_local';

      this.state.syncStatus = {
        ...this.state.syncStatus,
        mode: 'firebase',
        projectId: cfg.projectId,
        fromCache,
        state: nextState,
        lastSyncedAt:
          !fromCache && !hasPendingWrites
            ? new Date().toISOString()
            : this.state.syncStatus.lastSyncedAt || new Date().toISOString(),
        lastEvent:
          this.state.syncConflicts.length > 0
            ? `${this.state.syncConflicts.length} konflik sinkronisasi menunggu penyelesaian`
            : label || this.state.syncStatus.lastEvent,
      };
    };

    try {
      // 1. GURU (Teachers — authoritative real-time sync with arena.site `guru` collection)
      safeSub(
        onSnapshot(
          collection(db, 'guru'),
          { includeMetadataChanges: true },
          (snap) => {
            const normalized: TeacherAccount[] = snap.docs.map((d) => {
              const raw = d.data() as Record<string, unknown>;
              const rawMapel = raw.mapel ?? raw.mataPelajaranList ?? raw.mataPelajaran;
              const mapelList = Array.isArray(rawMapel)
                ? rawMapel.map(String).map((s) => s.trim()).filter(Boolean)
                : typeof rawMapel === 'string' && rawMapel.trim()
                ? [rawMapel.trim()]
                : ['Matematika'];

              return {
                id: String(raw.id || d.id),
                nama: String(raw.nama || raw.name || 'Guru'),
                username: String(raw.username || ''),
                passwordHash: String(raw.passHash || raw.passwordHash || ''),
                salt: typeof raw.salt === 'string' ? raw.salt : undefined,
                mataPelajaran: mapelList[0] || 'Matematika',
                mataPelajaranList: mapelList,
                aktif: raw.aktif !== false,
                createdAt: String(raw.createdAt || new Date().toISOString()),
              };
            });
            const mergedTeachers = this.reconcileAndPreservePending(
              'teacher',
              normalized,
              (t) => t.id,
              (t) => t as unknown as Record<string, unknown>,
              snap.metadata.fromCache
            ) as unknown as TeacherAccount[];
            this.state.teachers = mergedTeachers;
            writeLS(LS_KEYS.teachers, mergedTeachers);
            markSnapshotSync(
              snap.metadata.fromCache,
              snap.metadata.hasPendingWrites,
              !snap.metadata.fromCache
                ? 'Data tersinkron otomatis ke database pusat'
                : undefined
            );
            this.notify();
          },
          () => {
            this.state.cloudConnected = false;
            this.setSyncStatus({
              state: 'error',
              lastEvent: 'Gagal terhubung ke koleksi guru Firebase',
            });
          }
        )
      );

      // 2. MAPEL (Subjects — authoritative real-time sync with `mapel` collection)
      safeSub(
        onSnapshot(
          collection(db, 'mapel'),
          { includeMetadataChanges: true },
          (snap) => {
            if (!snap.empty) {
              const items: SubjectItem[] = snap.docs
                .map((d, idx) => {
                  const raw = d.data() as Record<string, unknown>;
                  return {
                    id: String(raw.id || d.id),
                    nama: String(raw.nama || raw.name || '').trim(),
                    urut: Number(raw.urut ?? idx + 1) || idx + 1,
                  };
                })
                .filter((m) => m.nama.length > 0)
                .sort((a, b) => a.urut - b.urut || a.nama.localeCompare(b.nama));
              const names = Array.from(new Set(items.map((m) => m.nama)));
              this.state.subjectItems = items;
              this.state.subjects = names;
              writeLS(LS_KEYS.subjectItems, items);
              writeLS(LS_KEYS.subjects, names);
            }
            markSnapshotSync(snap.metadata.fromCache, snap.metadata.hasPendingWrites);
            this.notify();
          },
          () => {}
        )
      );

      // 3. KELAS (Classes — authoritative real-time sync with `kelas` collection)
      safeSub(
        onSnapshot(
          collection(db, 'kelas'),
          { includeMetadataChanges: true },
          (snap) => {
            if (!snap.empty) {
              const items: ClassItem[] = snap.docs
                .map((d, idx) => {
                  const raw = d.data() as Record<string, unknown>;
                  return {
                    id: String(raw.id || d.id),
                    nama: String(raw.nama || raw.name || '').trim(),
                    urut: Number(raw.urut ?? idx + 1) || idx + 1,
                  };
                })
                .filter((k) => k.nama.length > 0)
                .sort((a, b) => a.urut - b.urut || a.nama.localeCompare(b.nama));
              const names = Array.from(new Set(items.map((k) => k.nama)));
              this.state.classItems = items;
              this.state.classes = names;
              writeLS(LS_KEYS.classItems, items);
              writeLS(LS_KEYS.classes, names);
            }
            markSnapshotSync(snap.metadata.fromCache, snap.metadata.hasPendingWrites);
            this.notify();
          },
          () => {}
        )
      );

      // 4. ADMINS & SETTINGS/ADMIN
      safeSub(
        onSnapshot(
          collection(db, 'admins'),
          { includeMetadataChanges: true },
          (snap) => {
            this.remoteAdminsDocs = snap.docs.map((d) => {
              const raw = d.data() as Record<string, unknown>;
              return {
                id: String(raw.id || d.id),
                nama: String(raw.nama || 'Admin'),
                username: String(raw.username || ''),
                passwordHash: String(raw.passHash || raw.passwordHash || ''),
                salt: typeof raw.salt === 'string' ? raw.salt : undefined,
              };
            });
            this.rebuildAdminsList();
            markSnapshotSync(snap.metadata.fromCache, snap.metadata.hasPendingWrites);
            this.notify();
          },
          () => {}
        )
      );

      safeSub(
        onSnapshot(
          doc(db, 'settings', 'admin'),
          { includeMetadataChanges: true },
          (snap) => {
            if (snap.exists()) {
              const raw = snap.data() as Record<string, unknown>;
              if (raw.username && (raw.passHash || raw.passwordHash)) {
                this.settingsAdminOverride = {
                  id: 'adm-settings',
                  nama: String(raw.nama || 'Rizqi (Super Admin)'),
                  username: String(raw.username),
                  passwordHash: String(raw.passHash || raw.passwordHash),
                  salt: typeof raw.salt === 'string' ? raw.salt : undefined,
                };
                this.rebuildAdminsList();
                this.notify();
              }
            }
          },
          () => {}
        )
      );

      // 5. SETTINGS (Google Sheets & App Config)
      safeSub(
        onSnapshot(
          doc(db, 'settings', 'sheets'),
          { includeMetadataChanges: true },
          (snap) => {
            if (snap.exists()) {
              const raw = snap.data() as Record<string, unknown>;
              const url = String(raw.url || raw.googleSheetsUrl || '');
              const serverSettings: AppSettings = {
                ...this.state.settings,
                googleSheetsUrl: url,
                updatedAt: String(raw.updatedAt || new Date().toISOString()),
              };
              const reconciled = this.reconcileAndPreservePending(
                'settings',
                [serverSettings],
                () => 'sheets',
                (s) => s as unknown as Record<string, unknown>,
                snap.metadata.fromCache
              )[0] as unknown as AppSettings | undefined;
              this.state.settings = reconciled || serverSettings;
              writeLS(LS_KEYS.settings, this.state.settings);
              markSnapshotSync(snap.metadata.fromCache, snap.metadata.hasPendingWrites);
              this.notify();
            }
          },
          () => {}
        )
      );

      safeSub(
        onSnapshot(
          doc(db, 'settings', 'app'),
          { includeMetadataChanges: true },
          (snap) => {
            if (snap.exists()) {
              const data = snap.data() as Partial<AppSettings>;
              this.state.settings = {
                ...DEFAULT_SETTINGS,
                ...this.state.settings,
                ...data,
              };
              writeLS(LS_KEYS.settings, this.state.settings);
              this.notify();
            }
          },
          () => {}
        )
      );

      // 6. SOAL (Question Bank — authoritative snapshot replacement so deletions sync!)
      safeSub(
        onSnapshot(
          collection(db, 'soal'),
          { includeMetadataChanges: true },
          (snap) => {
            const items = snap.docs
              .map((d) => normalizeQuestionDoc(d.data() as Record<string, unknown>, d.id))
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            const mergedQuestions = this.reconcileAndPreservePending(
              'question',
              items,
              (q) => q.id,
              (q) => q as unknown as Record<string, unknown>,
              snap.metadata.fromCache
            ) as unknown as Question[];
            this.state.questions = mergedQuestions;
            writeLS(LS_KEYS.questions, mergedQuestions);
            markSnapshotSync(snap.metadata.fromCache, snap.metadata.hasPendingWrites);
            this.notify();
          },
          () => {}
        )
      );

      // 7. TES (Exam Schedules — authoritative snapshot replacement so Hentikan Paksa / Deletes sync!)
      safeSub(
        onSnapshot(
          collection(db, 'tes'),
          { includeMetadataChanges: true },
          (snap) => {
            const items = snap.docs
              .map((d) => normalizeScheduleDoc(d.data() as Record<string, unknown>, d.id))
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            const mergedSchedules = this.reconcileAndPreservePending(
              'schedule',
              items,
              (s) => s.id,
              (s) => s as unknown as Record<string, unknown>,
              snap.metadata.fromCache
            ) as unknown as ExamSchedule[];
            this.state.schedules = mergedSchedules;
            writeLS(LS_KEYS.schedules, mergedSchedules);
            markSnapshotSync(snap.metadata.fromCache, snap.metadata.hasPendingWrites);
            this.notify();
          },
          () => {}
        )
      );

      // 8. HASIL (Exam Results — authoritative snapshot replacement so Reset Sesi syncs!)
      safeSub(
        onSnapshot(
          collection(db, 'hasil'),
          { includeMetadataChanges: true },
          (snap) => {
            const items = snap.docs
              .map((d) => normalizeResultDoc(d.data() as Record<string, unknown>, d.id))
              .sort((a, b) => b.waktuSubmit.localeCompare(a.waktuSubmit));
            const mergedResults = this.reconcileAndPreservePending(
              'result',
              items,
              (r) => r.id,
              (r) => r as unknown as Record<string, unknown>,
              snap.metadata.fromCache
            ) as unknown as ExamResult[];
            this.state.results = mergedResults;
            writeLS(LS_KEYS.results, mergedResults);
            markSnapshotSync(snap.metadata.fromCache, snap.metadata.hasPendingWrites);
            this.notify();
          },
          () => {}
        )
      );

      // 9. LIVE STREAMS (Real-Time Live Proctoring)
      safeSub(
        onSnapshot(
          collection(db, 'live_streams'),
          { includeMetadataChanges: true },
          (snap) => {
            const items = snap.docs.map((d) => {
              const raw = d.data() as Partial<LiveProctorSession>;
              return {
                ...raw,
                sessionId: String(raw.sessionId || d.id),
                namaSiswa: String(raw.namaSiswa || 'Siswa'),
                noPeserta: String(raw.noPeserta || '-'),
                kelas: String(raw.kelas || '-'),
                mataPelajaran: String(raw.mataPelajaran || '-'),
                judulUjian: String(raw.judulUjian || 'Ujian CBT'),
                scheduleId: String(raw.scheduleId || ''),
                guruId: String(raw.guruId || ''),
                status:
                  raw.status === 'Pelanggaran' || raw.status === 'Selesai'
                    ? raw.status
                    : 'Mengerjakan',
                audioLevel: Number(raw.audioLevel) || 0,
                jumlahKeluarTab: Number(raw.jumlahKeluarTab) || 0,
                jumlahMenoleh: Number(raw.jumlahMenoleh) || 0,
                updatedAt: String(raw.updatedAt || new Date().toISOString()),
              } as LiveProctorSession;
            });
            this.state.liveStreams = items;
            writeLS(LS_KEYS.liveStreams, items);
            this.notify();
          },
          () => {}
        )
      );
    } catch {
      this.state.cloudConnected = false;
      this.setSyncStatus({
        state: 'error',
        lastEvent: 'Kesalahan listener real-time Firestore',
      });
    }
  }

  private persistPendingChanges(next: PendingLocalChange[]) {
    this.state.pendingChanges = next;
    writeLS(LS_KEYS.pendingMutations, next);
  }

  private persistSyncConflicts(next: SyncConflict[]) {
    this.state.syncConflicts = next;
    writeLS(LS_KEYS.syncConflicts, next);
  }

  private addOrUpdatePending(
    kind: ConflictEntityKind,
    entityId: string,
    entityTitle: string,
    localData: Record<string, unknown>,
    baseHashOverride?: string
  ) {
    const conflictKey = `${kind}:${entityId}`;
    const existing = this.state.pendingChanges.find((p) => p.conflictKey === conflictKey);
    const prevServer = this.serverLastSeenDocs[kind]?.[entityId] || null;
    const baseHash =
      baseHashOverride ?? existing?.baseHash ?? computeEntityFingerprint(prevServer);

    const entry: PendingLocalChange = {
      conflictKey,
      entityKind: kind,
      entityId,
      entityTitle,
      localUpdatedAt: new Date().toISOString(),
      localData,
      baseHash,
    };

    const next = [
      entry,
      ...this.state.pendingChanges.filter((p) => p.conflictKey !== conflictKey),
    ];
    this.persistPendingChanges(next);
  }

  private clearPending(kind: ConflictEntityKind, entityId: string) {
    const conflictKey = `${kind}:${entityId}`;
    if (this.state.pendingChanges.some((p) => p.conflictKey === conflictKey)) {
      this.persistPendingChanges(
        this.state.pendingChanges.filter((p) => p.conflictKey !== conflictKey)
      );
    }
    if (this.state.syncConflicts.some((c) => c.id === conflictKey)) {
      this.persistSyncConflicts(
        this.state.syncConflicts.filter((c) => c.id !== conflictKey)
      );
    }
  }

  private raiseConflict(conflict: SyncConflict) {
    const next = [
      conflict,
      ...this.state.syncConflicts.filter((c) => c.id !== conflict.id),
    ];
    this.persistSyncConflicts(next);
    this.setSyncStatus({
      state: 'conflict',
      lastEvent: `Konflik sinkronisasi pada ${conflict.entityTitle}`,
    });
  }

  private reconcileAndPreservePending<T>(
    kind: ConflictEntityKind,
    serverItems: T[],
    getId: (item: T) => string,
    toRecord: (item: T) => Record<string, unknown>,
    fromCache: boolean
  ): T[] {
    const serverById: Record<string, Record<string, unknown>> = {};
    const itemById = new Map<string, T>();
    for (const item of serverItems) {
      const id = getId(item);
      serverById[id] = toRecord(item);
      itemById.set(id, item);
    }

    if (!fromCache) {
      this.serverLastSeenDocs[kind] = serverById;
    }

    const pendingForKind = this.state.pendingChanges.filter((p) => p.entityKind === kind);
    const conflictIds = new Set(
      this.state.syncConflicts.filter((c) => c.entityKind === kind).map((c) => c.entityId)
    );

    if (!fromCache && pendingForKind.length > 0) {
      let nextConflicts = [...this.state.syncConflicts];
      let nextPending = [...this.state.pendingChanges];

      for (const pending of pendingForKind) {
        const serverDoc = serverById[pending.entityId] || null;
        const evalRes = evaluatePendingVsServer(pending, serverDoc);

        if (evalRes.status === 'already_synced') {
          nextPending = nextPending.filter((p) => p.conflictKey !== pending.conflictKey);
          nextConflicts = nextConflicts.filter((c) => c.id !== pending.conflictKey);
          conflictIds.delete(pending.entityId);
        } else if (evalRes.status === 'safe_to_push_local') {
          if (typeof navigator === 'undefined' || navigator.onLine) {
            void this.pushEntityToCloud(kind, pending.entityId, pending.localData);
            nextPending = nextPending.filter((p) => p.conflictKey !== pending.conflictKey);
          }
        } else if (evalRes.status === 'conflict') {
          nextConflicts = [
            evalRes.conflict,
            ...nextConflicts.filter((c) => c.id !== evalRes.conflict.id),
          ];
          conflictIds.add(pending.entityId);
        }
      }

      if (nextPending.length !== this.state.pendingChanges.length) {
        this.persistPendingChanges(nextPending);
      }
      if (
        nextConflicts.length !== this.state.syncConflicts.length ||
        nextConflicts.some((c, i) => this.state.syncConflicts[i]?.id !== c.id)
      ) {
        this.persistSyncConflicts(nextConflicts);
      }
    }

    // Preserve local versions for any unresolved conflict or active pending offline change
    const result = [...serverItems];
    const activePending = this.state.pendingChanges.filter((p) => p.entityKind === kind);
    for (const p of activePending) {
      const idx = result.findIndex((item) => getId(item) === p.entityId);
      const localObj = p.localData as unknown as T;
      if (idx >= 0) result[idx] = localObj;
      else result.unshift(localObj);
    }
    for (const c of this.state.syncConflicts.filter((x) => x.entityKind === kind)) {
      const idx = result.findIndex((item) => getId(item) === c.entityId);
      const localObj = c.localData as unknown as T;
      if (idx >= 0) result[idx] = localObj;
      else if (!c.serverData._deletedOnServer) result.unshift(localObj);
    }

    return result;
  }

  private async pushEntityToCloud(
    kind: ConflictEntityKind,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    if (kind === 'teacher') {
      const t = data as unknown as TeacherAccount;
      const list = getTeacherSubjects(t);
      return this.trackedCloudWrite(`Sinkronisasi guru "${t.nama}"`, (db) =>
        setDoc(
          doc(db, 'guru', entityId),
          {
            id: entityId,
            nama: t.nama,
            username: t.username,
            passHash: t.passwordHash,
            passwordHash: t.passwordHash,
            ...(t.salt ? { salt: t.salt } : {}),
            mapel: list,
            mataPelajaran: list[0] || t.mataPelajaran,
            aktif: t.aktif !== false,
            createdAt: t.createdAt || new Date().toISOString(),
          },
          { merge: true }
        )
      );
    }
    if (kind === 'question') {
      const q = data as unknown as Question;
      return this.trackedCloudWrite(`Sinkronisasi soal`, (db) =>
        setDoc(doc(db, 'soal', entityId), this.buildQuestionFirestorePayload(q), { merge: true })
      );
    }
    if (kind === 'schedule') {
      const s = data as unknown as ExamSchedule;
      return this.trackedCloudWrite(`Sinkronisasi jadwal "${s.judulUjian}"`, (db) =>
        setDoc(
          doc(db, 'tes', entityId),
          {
            id: entityId,
            judul: s.judulUjian,
            judulUjian: s.judulUjian,
            mapel: s.mataPelajaran,
            mataPelajaran: s.mataPelajaran,
            guruId: s.guruId,
            guruNama: s.guruNama,
            kelas: s.kelasTarget,
            kelasTarget: s.kelasTarget,
            durasi: s.durasiMenit,
            durasiMenit: s.durasiMenit,
            token: s.token,
            aktif: s.aktif,
            soal: s.questionsSnapshot,
            questionsSnapshot: s.questionsSnapshot,
            createdAt: s.createdAt,
          },
          { merge: true }
        )
      );
    }
    if (kind === 'result') {
      const r = data as unknown as ExamResult;
      return this.trackedCloudWrite(`Sinkronisasi hasil "${r.namaSiswa}"`, (db) =>
        setDoc(
          doc(db, 'hasil', entityId),
          {
            ...r,
            nama: r.namaSiswa,
            mapel: r.mataPelajaran,
            judulTes: r.judulUjian,
            tesId: r.scheduleId,
            submittedAt: r.waktuSubmit,
          },
          { merge: true }
        )
      );
    }
    if (kind === 'settings') {
      const s = data as unknown as AppSettings;
      return this.trackedCloudWrite('Sinkronisasi pengaturan Google Sheets', async (db) => {
        await setDoc(
          doc(db, 'settings', 'sheets'),
          { url: s.googleSheetsUrl, googleSheetsUrl: s.googleSheetsUrl, updatedAt: s.updatedAt },
          { merge: true }
        );
        await setDoc(doc(db, 'settings', 'app'), s, { merge: true });
      });
    }
    return false;
  }

  public async resolveSyncConflict(
    conflictId: string,
    choice: ConflictResolutionChoice,
    fieldChoices?: Record<string, 'local' | 'server'>
  ): Promise<void> {
    const conflict = this.state.syncConflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    const chosenData: Record<string, unknown> | null =
      choice === 'use_server'
        ? conflict.serverData._deletedOnServer
          ? null
          : conflict.serverData
        : choice === 'merge'
        ? buildMergedEntity(conflict, fieldChoices)
        : { ...conflict.localData, updatedAt: new Date().toISOString() };

    const remainingConflicts = this.state.syncConflicts.filter((c) => c.id !== conflictId);
    const remainingPending = this.state.pendingChanges.filter((p) => p.conflictKey !== conflictId);
    this.persistSyncConflicts(remainingConflicts);
    this.persistPendingChanges(remainingPending);

    // Update local state immediately for the chosen entity
    const applyEntityToState = (data: Record<string, unknown> | null) => {
      if (conflict.entityKind === 'teacher') {
        const list = data
          ? [
              ...(this.state.teachers.some((t) => t.id === conflict.entityId)
                ? this.state.teachers.map((t) =>
                    t.id === conflict.entityId ? (data as unknown as TeacherAccount) : t
                  )
                : [...this.state.teachers, data as unknown as TeacherAccount]),
            ]
          : this.state.teachers.filter((t) => t.id !== conflict.entityId);
        this.state.teachers = list;
        writeLS(LS_KEYS.teachers, list);
      } else if (conflict.entityKind === 'question') {
        const list = data
          ? this.state.questions.some((q) => q.id === conflict.entityId)
            ? this.state.questions.map((q) =>
                q.id === conflict.entityId ? (data as unknown as Question) : q
              )
            : [data as unknown as Question, ...this.state.questions]
          : this.state.questions.filter((q) => q.id !== conflict.entityId);
        this.state.questions = list;
        writeLS(LS_KEYS.questions, list);
      } else if (conflict.entityKind === 'schedule') {
        const list = data
          ? this.state.schedules.some((s) => s.id === conflict.entityId)
            ? this.state.schedules.map((s) =>
                s.id === conflict.entityId ? (data as unknown as ExamSchedule) : s
              )
            : [data as unknown as ExamSchedule, ...this.state.schedules]
          : this.state.schedules.filter((s) => s.id !== conflict.entityId);
        this.state.schedules = list;
        writeLS(LS_KEYS.schedules, list);
      } else if (conflict.entityKind === 'result') {
        const list = data
          ? this.state.results.some((r) => r.id === conflict.entityId)
            ? this.state.results.map((r) =>
                r.id === conflict.entityId ? (data as unknown as ExamResult) : r
              )
            : [data as unknown as ExamResult, ...this.state.results]
          : this.state.results.filter((r) => r.id !== conflict.entityId);
        this.state.results = list;
        writeLS(LS_KEYS.results, list);
      } else if (conflict.entityKind === 'settings' && data) {
        this.state.settings = {
          ...this.state.settings,
          ...(data as Partial<AppSettings>),
        };
        writeLS(LS_KEYS.settings, this.state.settings);
      }
    };

    applyEntityToState(chosenData);
    this.broadcastLocalChange(`Konflik "${conflict.entityTitle}" diselesaikan`);

    if ((choice === 'keep_local' || choice === 'merge') && chosenData) {
      await this.pushEntityToCloud(conflict.entityKind, conflict.entityId, chosenData);
    } else {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      this.setSyncStatus({
        state:
          remainingConflicts.length > 0
            ? 'conflict'
            : isForceLocalMode()
            ? 'local_forced'
            : !online
            ? 'offline'
            : 'synced',
        lastSyncedAt: new Date().toISOString(),
        lastEvent: `Sinkronisasi selesai · Menggunakan data server terbaru (${conflict.entityTitle})`,
      });
    }
    this.notify();
  }

  public async resolveAllConflicts(choice: 'keep_local' | 'use_server'): Promise<void> {
    const ids = this.state.syncConflicts.map((c) => c.id);
    for (const id of ids) {
      await this.resolveSyncConflict(id, choice);
    }
  }

  private async trackedCloudWrite(
    eventLabel: string,
    fn: (db: Firestore) => Promise<void>
  ): Promise<boolean> {
    const onlineNow = typeof navigator === 'undefined' ? true : navigator.onLine;
    const db = getFirestoreInstance();
    if (!db || !onlineNow) {
      this.setSyncStatus({
        state: isForceLocalMode() ? 'local_forced' : !onlineNow ? 'offline' : 'pending_local',
        lastEvent: `${eventLabel} (tersimpan lokal${!onlineNow ? ', menunggu sinyal' : ''})`,
        lastSyncedAt: new Date().toISOString(),
      });
      return false;
    }

    const nextPending = this.state.syncStatus.pendingWrites + 1;
    this.setSyncStatus({
      state: 'syncing',
      pendingWrites: nextPending,
      lastEvent: `Menyinkronkan: ${eventLabel}...`,
    });

    let ok = false;
    try {
      await Promise.race([
        fn(db),
        new Promise<void>((_resolve, reject) =>
          setTimeout(() => reject(new Error('timeout')), 6000)
        ),
      ]);
      ok = true;
    } catch {
      ok = false;
    }

    const remaining = Math.max(0, this.state.syncStatus.pendingWrites - 1);
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    this.setSyncStatus({
      pendingWrites: remaining,
      state: !online
        ? 'offline'
        : this.state.syncConflicts.length > 0
        ? 'conflict'
        : remaining > 0
        ? 'syncing'
        : ok
        ? 'synced'
        : 'pending_local',
      lastSyncedAt: ok ? new Date().toISOString() : this.state.syncStatus.lastSyncedAt,
      lastEvent: ok
        ? `${eventLabel} · Tersinkron Cloud`
        : `${eventLabel} (tersimpan lokal, menunggu koneksi cloud)`,
    });
    return ok;
  }

  // AUTHENTICATION (Supports both salted `nh-cbt::salt::pass` and legacy SHA-256)
  public async authenticateAdmin(
    username: string,
    password: string
  ): Promise<AdminAccount | null> {
    await this.init();
    const u = username.trim().toLowerCase();
    for (const a of this.state.admins) {
      if (a.username.toLowerCase() !== u) continue;
      if (await verifySaltedOrLegacyPassword(password, a.passwordHash, a.salt)) {
        return a;
      }
    }
    if (
      this.settingsAdminOverride &&
      this.settingsAdminOverride.username.toLowerCase() === u &&
      (await verifySaltedOrLegacyPassword(
        password,
        this.settingsAdminOverride.passwordHash,
        this.settingsAdminOverride.salt
      ))
    ) {
      return this.settingsAdminOverride;
    }
    return null;
  }

  public async authenticateTeacher(
    username: string,
    password: string
  ): Promise<TeacherAccount | null> {
    await this.init();
    const u = username.trim().toLowerCase();
    for (const t of this.state.teachers) {
      if (t.aktif === false || t.username.toLowerCase() !== u) continue;
      if (await verifySaltedOrLegacyPassword(password, t.passwordHash, t.salt)) {
        return t;
      }
    }
    return null;
  }

  public async updateAdminAccount(params: {
    currentAdmin: AdminAccount;
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
  }): Promise<{ ok: boolean; message: string; updated?: AdminAccount }> {
    const valid = await verifySaltedOrLegacyPassword(
      params.currentPassword,
      params.currentAdmin.passwordHash,
      params.currentAdmin.salt
    );
    if (!valid) {
      return { ok: false, message: 'Password saat ini tidak sesuai.' };
    }

    const targetUsername = (params.newUsername || params.currentAdmin.username).trim().toLowerCase();
    if (!targetUsername) {
      return { ok: false, message: 'Username baru tidak boleh kosong.' };
    }

    const targetPassword = params.newPassword?.trim() || params.currentPassword;
    const { salt, passHash } = await hashSaltedPassword(targetPassword);

    const updated: AdminAccount = {
      id: params.currentAdmin.id || 'adm-1',
      nama: params.currentAdmin.nama || 'Rizqi (Super Admin)',
      username: targetUsername,
      passwordHash: passHash,
      salt,
    };

    this.settingsAdminOverride = updated;
    this.defaultAdminsCache = this.defaultAdminsCache.map((a) =>
      a.id === updated.id || a.username.toLowerCase() === params.currentAdmin.username.toLowerCase()
        ? updated
        : a
    );
    this.rebuildAdminsList();
    this.broadcastLocalChange('Akun Admin diperbarui');
    this.notify();

    await this.trackedCloudWrite('Akun Admin diperbarui', async (db) => {
      await setDoc(doc(db, 'settings', 'admin'), {
        id: updated.id,
        nama: updated.nama,
        username: updated.username,
        passHash: updated.passwordHash,
        salt: updated.salt,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'admins', updated.id), {
        id: updated.id,
        nama: updated.nama,
        username: updated.username,
        passHash: updated.passwordHash,
        salt: updated.salt,
        updatedAt: new Date().toISOString(),
      });
    });

    return { ok: true, message: 'Kredensial Super Admin berhasil diperbarui & tersinkron.', updated };
  }

  // SUBJECTS (`mapel` collection)
  public async addSubject(nama: string) {
    const clean = nama.trim();
    if (!clean) return;
    if (this.state.subjects.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
    const nextUrut =
      this.state.subjectItems.reduce((max, s) => Math.max(max, s.urut), 0) + 1;
    const item: SubjectItem = {
      id: `mapel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nama: clean,
      urut: nextUrut,
    };
    this.state.subjectItems = [...this.state.subjectItems, item];
    this.state.subjects = [...this.state.subjects, clean];
    writeLS(LS_KEYS.subjectItems, this.state.subjectItems);
    writeLS(LS_KEYS.subjects, this.state.subjects);
    this.broadcastLocalChange(`Mapel "${clean}" ditambahkan`);
    this.notify();

    await this.trackedCloudWrite(`Mapel "${clean}" ditambahkan`, (db) =>
      setDoc(doc(db, 'mapel', item.id), item)
    );
  }

  public async renameSubject(subjectId: string, oldName: string, newName: string) {
    const clean = newName.trim();
    if (!clean || clean === oldName) return;

    this.state.subjectItems = this.state.subjectItems.map((m) =>
      m.id === subjectId || m.nama === oldName ? { ...m, nama: clean } : m
    );
    this.state.subjects = Array.from(new Set(this.state.subjectItems.map((m) => m.nama)));
    writeLS(LS_KEYS.subjectItems, this.state.subjectItems);
    writeLS(LS_KEYS.subjects, this.state.subjects);
    this.broadcastLocalChange(`Mapel diubah menjadi "${clean}"`);
    this.notify();

    const target = this.state.subjectItems.find((m) => m.id === subjectId || m.nama === clean);
    if (target) {
      await this.trackedCloudWrite(`Mapel diubah ke "${clean}"`, (db) =>
        setDoc(doc(db, 'mapel', target.id), target, { merge: true })
      );
    }
  }

  public async deleteSubject(subjectId: string, name: string) {
    this.state.subjectItems = this.state.subjectItems.filter(
      (m) => m.id !== subjectId && m.nama !== name
    );
    this.state.subjects = this.state.subjectItems.map((m) => m.nama);
    writeLS(LS_KEYS.subjectItems, this.state.subjectItems);
    writeLS(LS_KEYS.subjects, this.state.subjects);
    this.broadcastLocalChange(`Mapel "${name}" dihapus`);
    this.notify();

    await this.trackedCloudWrite(`Mapel "${name}" dihapus`, (db) =>
      deleteDoc(doc(db, 'mapel', subjectId))
    );
  }

  // CLASSES (`kelas` collection)
  public async addClass(nama: string) {
    const clean = nama.trim();
    if (!clean) return;
    if (this.state.classes.some((c) => c.toLowerCase() === clean.toLowerCase())) return;
    const nextUrut =
      this.state.classItems.reduce((max, c) => Math.max(max, c.urut), 0) + 1;
    const item: ClassItem = {
      id: `kelas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nama: clean,
      urut: nextUrut,
    };
    this.state.classItems = [...this.state.classItems, item];
    this.state.classes = [...this.state.classes, clean];
    writeLS(LS_KEYS.classItems, this.state.classItems);
    writeLS(LS_KEYS.classes, this.state.classes);
    this.broadcastLocalChange(`Kelas "${clean}" ditambahkan`);
    this.notify();

    await this.trackedCloudWrite(`Kelas "${clean}" ditambahkan`, (db) =>
      setDoc(doc(db, 'kelas', item.id), item)
    );
  }

  public async renameClass(classId: string, oldName: string, newName: string) {
    const clean = newName.trim();
    if (!clean || clean === oldName) return;
    this.state.classItems = this.state.classItems.map((c) =>
      c.id === classId || c.nama === oldName ? { ...c, nama: clean } : c
    );
    this.state.classes = Array.from(new Set(this.state.classItems.map((c) => c.nama)));
    writeLS(LS_KEYS.classItems, this.state.classItems);
    writeLS(LS_KEYS.classes, this.state.classes);
    this.broadcastLocalChange(`Kelas diubah menjadi "${clean}"`);
    this.notify();

    const target = this.state.classItems.find((c) => c.id === classId || c.nama === clean);
    if (target) {
      await this.trackedCloudWrite(`Kelas diubah ke "${clean}"`, (db) =>
        setDoc(doc(db, 'kelas', target.id), target, { merge: true })
      );
    }
  }

  public async deleteClass(classId: string, name: string) {
    this.state.classItems = this.state.classItems.filter(
      (c) => c.id !== classId && c.nama !== name
    );
    this.state.classes = this.state.classItems.map((c) => c.nama);
    writeLS(LS_KEYS.classItems, this.state.classItems);
    writeLS(LS_KEYS.classes, this.state.classes);
    this.broadcastLocalChange(`Kelas "${name}" dihapus`);
    this.notify();

    await this.trackedCloudWrite(`Kelas "${name}" dihapus`, (db) =>
      deleteDoc(doc(db, 'kelas', classId))
    );
  }

  private checkAndQueueConflict(
    kind: ConflictEntityKind,
    entityId: string,
    entityTitle: string,
    localData: Record<string, unknown>,
    expectedBaseFingerprint?: string
  ): boolean {
    if (expectedBaseFingerprint) {
      const serverDoc = this.serverLastSeenDocs[kind]?.[entityId] || null;
      const evalRes = evaluatePendingVsServer(
        {
          conflictKey: `${kind}:${entityId}`,
          entityKind: kind,
          entityId,
          entityTitle,
          localUpdatedAt: new Date().toISOString(),
          localData,
          baseHash: expectedBaseFingerprint,
        },
        serverDoc
      );
      if (evalRes.status === 'conflict') {
        this.addOrUpdatePending(kind, entityId, entityTitle, localData, expectedBaseFingerprint);
        this.raiseConflict(evalRes.conflict);
        return true;
      }
    }
    this.addOrUpdatePending(kind, entityId, entityTitle, localData, expectedBaseFingerprint);
    return false;
  }

  // TEACHERS (`guru` collection — supports multi-subject `mapel[]` & salted `passHash`)
  public async upsertTeacher(teacher: TeacherAccount, expectedBaseFingerprint?: string) {
    const subjectsList = getTeacherSubjects(teacher);
    const normalizedTeacher: TeacherAccount = {
      ...teacher,
      mataPelajaran: subjectsList[0] || teacher.mataPelajaran || 'Matematika',
      mataPelajaranList: subjectsList,
    };

    const hadConflict = this.checkAndQueueConflict(
      'teacher',
      normalizedTeacher.id,
      `Guru: ${normalizedTeacher.nama}`,
      normalizedTeacher as unknown as Record<string, unknown>,
      expectedBaseFingerprint
    );

    const next = [...this.state.teachers];
    const idx = next.findIndex((t) => t.id === normalizedTeacher.id);
    if (idx >= 0) next[idx] = normalizedTeacher;
    else next.push(normalizedTeacher);

    this.state.teachers = next;
    writeLS(LS_KEYS.teachers, next);
    this.broadcastLocalChange(`Akun guru "${normalizedTeacher.nama}" disimpan`);
    this.notify();
    if (hadConflict) return;

    const ok = await this.trackedCloudWrite(
      `Akun guru "${normalizedTeacher.nama}" disimpan`,
      (db) =>
        setDoc(
          doc(db, 'guru', normalizedTeacher.id),
          {
            id: normalizedTeacher.id,
            nama: normalizedTeacher.nama,
            username: normalizedTeacher.username,
            passHash: normalizedTeacher.passwordHash,
            passwordHash: normalizedTeacher.passwordHash,
            ...(normalizedTeacher.salt ? { salt: normalizedTeacher.salt } : {}),
            mapel: normalizedTeacher.mataPelajaranList,
            mataPelajaran: normalizedTeacher.mataPelajaran,
            aktif: normalizedTeacher.aktif,
            createdAt: normalizedTeacher.createdAt,
          },
          { merge: true }
        )
    );
    if (ok) this.clearPending('teacher', normalizedTeacher.id);
  }

  public async deleteTeacher(teacherId: string) {
    const target = this.state.teachers.find((t) => t.id === teacherId);
    const next = this.state.teachers.filter((t) => t.id !== teacherId);
    this.state.teachers = next;
    writeLS(LS_KEYS.teachers, next);
    this.broadcastLocalChange(`Akun guru "${target?.nama || ''}" dihapus`);
    this.notify();

    await this.trackedCloudWrite(
      `Akun guru "${target?.nama || teacherId}" dihapus`,
      (db) => deleteDoc(doc(db, 'guru', teacherId))
    );
  }

  // QUESTIONS (`soal` collection)
  private buildQuestionFirestorePayload(q: Question) {
    return {
      id: q.id,
      mapel: q.mataPelajaran,
      mataPelajaran: q.mataPelajaran,
      guruId: q.guruId,
      tipe: q.tipe,
      teks: q.pertanyaanHtml,
      pertanyaanHtml: q.pertanyaanHtml,
      pertanyaanTeks: q.pertanyaanTeks,
      opsi: q.opsi,
      kunci: q.kunciJawaban,
      kunciJawaban: q.kunciJawaban,
      bobot: q.bobot,
      createdAt: q.createdAt,
    };
  }

  public async addQuestions(newQuestions: Question[]) {
    if (newQuestions.length === 0) return;
    for (const q of newQuestions) {
      this.addOrUpdatePending(
        'question',
        q.id,
        `Soal ${q.mataPelajaran}: ${q.pertanyaanTeks.slice(0, 40)}`,
        q as unknown as Record<string, unknown>,
        'null'
      );
    }
    const next = [...newQuestions, ...this.state.questions];
    this.state.questions = next;
    writeLS(LS_KEYS.questions, next);
    this.broadcastLocalChange(`${newQuestions.length} soal ditambahkan`);
    this.notify();

    const ok = await this.trackedCloudWrite(
      `${newQuestions.length} soal ditambahkan ke Bank Soal`,
      async (db) => {
        await Promise.all(
          newQuestions.map((q) =>
            setDoc(doc(db, 'soal', q.id), this.buildQuestionFirestorePayload(q))
          )
        );
      }
    );
    if (ok) {
      for (const q of newQuestions) this.clearPending('question', q.id);
    }

    if (this.state.settings.googleSheetsUrl) {
      for (const q of newQuestions) {
        syncToGoogleSheets(this.state.settings.googleSheetsUrl, 'save_question', q);
      }
    }
  }

  public async updateQuestion(question: Question, expectedBaseFingerprint?: string) {
    const hadConflict = this.checkAndQueueConflict(
      'question',
      question.id,
      `Soal ${question.mataPelajaran}: ${question.pertanyaanTeks.slice(0, 40)}`,
      question as unknown as Record<string, unknown>,
      expectedBaseFingerprint
    );

    const next = this.state.questions.map((q) => (q.id === question.id ? question : q));
    this.state.questions = next;
    writeLS(LS_KEYS.questions, next);
    this.broadcastLocalChange('Butir soal diperbarui');
    this.notify();
    if (hadConflict) return;

    const ok = await this.trackedCloudWrite('Butir soal diperbarui', (db) =>
      setDoc(doc(db, 'soal', question.id), this.buildQuestionFirestorePayload(question), {
        merge: true,
      })
    );
    if (ok) this.clearPending('question', question.id);
  }

  public async deleteQuestion(questionId: string) {
    const next = this.state.questions.filter((q) => q.id !== questionId);
    this.state.questions = next;
    writeLS(LS_KEYS.questions, next);
    this.broadcastLocalChange('Butir soal dihapus');
    this.notify();

    await this.trackedCloudWrite('Butir soal dihapus', (db) =>
      deleteDoc(doc(db, 'soal', questionId))
    );
  }

  /**
   * Empties bank questions for a subject (or ALL subjects when mataPelajaran === '__ALL__')
   * WITHOUT touching questionsSnapshot inside existing ExamSchedules!
   */
  public async clearTeacherQuestionBank(mataPelajaran: string) {
    const isAll = mataPelajaran === '__ALL__';
    const toDelete = isAll
      ? this.state.questions
      : this.state.questions.filter((q) => q.mataPelajaran === mataPelajaran);
    const remaining = isAll
      ? []
      : this.state.questions.filter((q) => q.mataPelajaran !== mataPelajaran);

    this.state.questions = remaining;
    writeLS(LS_KEYS.questions, remaining);
    this.broadcastLocalChange(
      isAll ? 'Semua Bank Soal dikosongkan' : `Bank Soal ${mataPelajaran} dikosongkan`
    );
    this.notify();

    if (toDelete.length > 0) {
      await this.trackedCloudWrite(
        `Mengosongkan ${toDelete.length} soal dari Bank Soal`,
        async (db) => {
          await Promise.all(toDelete.map((q) => deleteDoc(doc(db, 'soal', q.id))));
        }
      );
    }
  }

  // SCHEDULES (`tes` collection)
  public async upsertSchedule(schedule: ExamSchedule, expectedBaseFingerprint?: string) {
    const hadConflict = this.checkAndQueueConflict(
      'schedule',
      schedule.id,
      `Jadwal: ${schedule.judulUjian}`,
      schedule as unknown as Record<string, unknown>,
      expectedBaseFingerprint
    );

    const next = [...this.state.schedules];
    const idx = next.findIndex((s) => s.id === schedule.id);
    if (idx >= 0) next[idx] = schedule;
    else next.unshift(schedule);

    this.state.schedules = next;
    writeLS(LS_KEYS.schedules, next);
    this.broadcastLocalChange(`Jadwal "${schedule.judulUjian}" diperbarui`);
    this.notify();
    if (hadConflict) return;

    const ok = await this.trackedCloudWrite(
      `Jadwal "${schedule.judulUjian}" (${schedule.aktif ? 'Aktif' : 'Dihentikan'})`,
      (db) =>
        setDoc(doc(db, 'tes', schedule.id), {
          id: schedule.id,
          judul: schedule.judulUjian,
          judulUjian: schedule.judulUjian,
          mapel: schedule.mataPelajaran,
          mataPelajaran: schedule.mataPelajaran,
          guruId: schedule.guruId,
          guruNama: schedule.guruNama,
          kelas: schedule.kelasTarget,
          kelasTarget: schedule.kelasTarget,
          durasi: schedule.durasiMenit,
          durasiMenit: schedule.durasiMenit,
          token: schedule.token,
          aktif: schedule.aktif,
          soal: schedule.questionsSnapshot,
          questionsSnapshot: schedule.questionsSnapshot,
          createdAt: schedule.createdAt,
        })
    );
    if (ok) this.clearPending('schedule', schedule.id);

    if (this.state.settings.googleSheetsUrl) {
      syncToGoogleSheets(this.state.settings.googleSheetsUrl, 'save_schedule', schedule);
    }
  }

  public async deleteSchedule(scheduleId: string) {
    const target = this.state.schedules.find((s) => s.id === scheduleId);
    const next = this.state.schedules.filter((s) => s.id !== scheduleId);
    this.state.schedules = next;
    writeLS(LS_KEYS.schedules, next);
    this.broadcastLocalChange(`Jadwal "${target?.judulUjian || ''}" dihapus`);
    this.notify();

    await this.trackedCloudWrite(
      `Jadwal "${target?.judulUjian || scheduleId}" dihapus`,
      (db) => deleteDoc(doc(db, 'tes', scheduleId))
    );
  }

  // RESULTS (`hasil` collection)
  public async submitExamResult(result: ExamResult): Promise<{ ok: boolean; syncedCloud: boolean }> {
    const cleanResult: ExamResult = {
      ...result,
      waktuSubmit: result.waktuSubmit || new Date().toISOString(),
    };

    const next = [cleanResult, ...this.state.results.filter((r) => r.id !== cleanResult.id)];
    this.state.results = next;
    writeLS(LS_KEYS.results, next);
    this.broadcastLocalChange(`Jawaban "${cleanResult.namaSiswa}" dikumpulkan`);
    this.notify();

    const syncedCloud = await this.trackedCloudWrite(
      `Hasil ujian "${cleanResult.namaSiswa}" tersimpan`,
      (db) =>
        setDoc(doc(db, 'hasil', cleanResult.id), {
          ...cleanResult,
          nama: cleanResult.namaSiswa,
          mapel: cleanResult.mataPelajaran,
          judulTes: cleanResult.judulUjian,
          tesId: cleanResult.scheduleId,
          submittedAt: cleanResult.waktuSubmit,
        })
    );

    if (this.state.settings.googleSheetsUrl) {
      await syncToGoogleSheets(
        this.state.settings.googleSheetsUrl,
        'submit_result',
        cleanResult
      );
    }

    return { ok: true, syncedCloud };
  }

  public async updateResultEssayScores(
    resultId: string,
    skorEsaiPerSoal: Record<string, number>,
    skorEsai: number,
    nilaiAkhir: number,
    expectedBaseFingerprint?: string
  ) {
    const existing = this.state.results.find((r) => r.id === resultId);
    if (!existing) return;
    const updatedCandidate: ExamResult = {
      ...existing,
      skorEsaiPerSoal,
      skorEsai,
      nilaiAkhir,
      sudahDinilaiEsai: true,
    };

    const hadConflict = this.checkAndQueueConflict(
      'result',
      resultId,
      `Koreksi Esai: ${existing.namaSiswa}`,
      updatedCandidate as unknown as Record<string, unknown>,
      expectedBaseFingerprint
    );

    const next = this.state.results.map((r) => (r.id === resultId ? updatedCandidate : r));
    this.state.results = next;
    writeLS(LS_KEYS.results, next);
    this.broadcastLocalChange('Nilai esai diperbarui');
    this.notify();
    if (hadConflict) return;

    const ok = await this.trackedCloudWrite(`Nilai esai "${updatedCandidate.namaSiswa}" disimpan`, (db) =>
      setDoc(
        doc(db, 'hasil', updatedCandidate.id),
        {
          ...updatedCandidate,
          dinilaiEsai: true,
        },
        { merge: true }
      )
    );
    if (ok) this.clearPending('result', resultId);
    if (this.state.settings.googleSheetsUrl) {
      await syncToGoogleSheets(
        this.state.settings.googleSheetsUrl,
        'update_essay_score',
        updatedCandidate
      );
    }
  }

  public async resetStudentExamSession(resultId: string) {
    const target = this.state.results.find((r) => r.id === resultId);
    const next = this.state.results.filter((r) => r.id !== resultId);
    this.state.results = next;
    writeLS(LS_KEYS.results, next);
    this.broadcastLocalChange(`Sesi siswa "${target?.namaSiswa || ''}" direset`);
    this.notify();

    await this.trackedCloudWrite(
      `Sesi ujian "${target?.namaSiswa || resultId}" direset`,
      (db) => deleteDoc(doc(db, 'hasil', resultId))
    );
    if (target?.sessionId) {
      await this.removeLiveStream(target.sessionId);
    }
  }

  public async pushAllResultsToSheets(customResults?: ExamResult[]): Promise<{ sent: number; failed: number }> {
    const url = this.state.settings.googleSheetsUrl;
    const list = customResults || this.state.results;
    if (!url) return { sent: 0, failed: list.length };
    let sent = 0;
    let failed = 0;
    for (const r of list) {
      const ok = await syncToGoogleSheets(url, 'submit_result', r);
      if (ok) sent++;
      else failed++;
    }
    return { sent, failed };
  }

  // LIVE PROCTORING STREAMS (`live_streams` collection)
  public async upsertLiveStream(session: LiveProctorSession) {
    const next = [
      session,
      ...this.state.liveStreams.filter((s) => s.sessionId !== session.sessionId),
    ];
    this.state.liveStreams = next;
    writeLS(LS_KEYS.liveStreams, next);
    this.broadcastLocalChange();
    this.notify();

    const db = getFirestoreInstance();
    if (db) {
      setDoc(doc(db, 'live_streams', session.sessionId), session, { merge: true }).catch(() => {});
    }
  }

  public async sendLiveWarning(sessionId: string, message: string) {
    const next = this.state.liveStreams.map((s) =>
      s.sessionId === sessionId
        ? { ...s, warningMessage: message, updatedAt: new Date().toISOString() }
        : s
    );
    this.state.liveStreams = next;
    writeLS(LS_KEYS.liveStreams, next);
    this.broadcastLocalChange('Peringatan pengawas dikirim');
    this.notify();

    await this.trackedCloudWrite('Peringatan live proctoring dikirim', (db) =>
      setDoc(
        doc(db, 'live_streams', sessionId),
        { warningMessage: message, updatedAt: new Date().toISOString() },
        { merge: true }
      )
    );
  }

  public async removeLiveStream(sessionId: string) {
    const next = this.state.liveStreams.filter((s) => s.sessionId !== sessionId);
    this.state.liveStreams = next;
    writeLS(LS_KEYS.liveStreams, next);
    this.broadcastLocalChange();
    this.notify();

    const db = getFirestoreInstance();
    if (db) {
      deleteDoc(doc(db, 'live_streams', sessionId)).catch(() => {});
    }
  }

  // SETTINGS (`settings/sheets`, `settings/app`)
  public async saveSettings(partial: Partial<AppSettings>, expectedBaseFingerprint?: string) {
    const next: AppSettings = {
      ...this.state.settings,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    const hadConflict = this.checkAndQueueConflict(
      'settings',
      'sheets',
      'Pengaturan Google Sheets',
      next as unknown as Record<string, unknown>,
      expectedBaseFingerprint
    );

    this.state.settings = next;
    writeLS(LS_KEYS.settings, next);
    this.broadcastLocalChange('Pengaturan sistem diperbarui');
    this.notify();
    if (hadConflict) return;

    const ok = await this.trackedCloudWrite('Pengaturan sistem disimpan', async (db) => {
      await setDoc(
        doc(db, 'settings', 'sheets'),
        { url: next.googleSheetsUrl, googleSheetsUrl: next.googleSheetsUrl, updatedAt: next.updatedAt },
        { merge: true }
      );
      await setDoc(doc(db, 'settings', 'app'), next, { merge: true });
    });
    if (ok) this.clearPending('settings', 'sheets');
  }

  // DATABASE CONNECTION CONTROLS
  public async testCloudConnection(): Promise<{ ok: boolean; message: string; teacherCount?: number }> {
    if (isForceLocalMode()) {
      return {
        ok: false,
        message: 'Aplikasi sedang dalam Mode Lokal (Paksa Lokal). Klik "Kembali ke Mode Online" untuk menyambungkan ke Firebase.',
      };
    }
    const db = getFirestoreInstance();
    if (!db) {
      return { ok: false, message: 'Inisialisasi Firestore tidak tersedia.' };
    }
    this.setSyncStatus({
      state: 'syncing',
      lastEvent: 'Menguji koneksi langsung ke server Firebase...',
    });
    try {
      const snap = await Promise.race([
        getDocsFromServer(collection(db, 'guru')),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout koneksi ke server Firebase')), 7000)
        ),
      ]);
      this.state.cloudConnected = true;
      this.setSyncStatus({
        state: 'synced',
        lastSyncedAt: new Date().toISOString(),
        lastEvent: `Koneksi Firebase terverifikasi (${snap.size} akun guru di cloud)`,
      });
      return {
        ok: true,
        message: `Terhubung langsung ke Firebase Firestore (${getActiveFirebaseConfig().projectId}). Ditemukan ${snap.size} data guru di server.`,
        teacherCount: snap.size,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menjangkau server Firebase.';
      this.setSyncStatus({
        state: navigator.onLine ? 'error' : 'offline',
        lastEvent: `Gagal tes koneksi: ${msg}`,
      });
      return { ok: false, message: msg };
    }
  }

  public async setForceLocalMode(forceLocal: boolean) {
    if (typeof window === 'undefined') return;
    if (forceLocal) {
      localStorage.setItem(LS_KEYS.forceLocal, '1');
      this.detachFirestoreListeners();
      this.state.cloudConnected = false;
      this.setSyncStatus({
        state: 'local_forced',
        mode: 'local',
        pendingWrites: 0,
        lastEvent: 'Mode Lokal Diaktifkan (bekerja penuh tanpa internet)',
      });
    } else {
      localStorage.removeItem(LS_KEYS.forceLocal);
      firestoreDb = null;
      this.attachFirestoreListeners();
      this.setSyncStatus({
        state: 'syncing',
        mode: 'firebase',
        lastEvent: 'Menyambungkan kembali ke Mode Online Firebase Firestore...',
      });
    }
  }

  public async saveFirebaseOverrideConfig(rawJson: string): Promise<{ ok: boolean; message: string }> {
    if (typeof window === 'undefined') return { ok: false, message: 'Browser tidak tersedia.' };
    const trimmed = rawJson.trim();
    if (!trimmed) {
      localStorage.removeItem(LS_KEYS.fbOverride);
      this.detachFirestoreListeners();
      for (const app of getApps()) {
        await deleteApp(app).catch(() => {});
      }
      firebaseApp = null;
      firestoreDb = null;
      persistenceAttempted = false;
      this.attachFirestoreListeners();
      return { ok: true, message: 'Konfigurasi dikembalikan ke default permanen MA Nurul Hijrah.' };
    }

    try {
      const parsed = JSON.parse(trimmed) as Partial<FirebaseOverrideConfig>;
      if (!parsed.apiKey || !parsed.projectId || !parsed.appId) {
        return {
          ok: false,
          message: 'JSON wajib memiliki field "apiKey", "projectId", dan "appId".',
        };
      }
      localStorage.setItem(LS_KEYS.fbOverride, JSON.stringify(parsed));
      localStorage.removeItem(LS_KEYS.forceLocal);
      this.detachFirestoreListeners();
      for (const app of getApps()) {
        await deleteApp(app).catch(() => {});
      }
      firebaseApp = null;
      firestoreDb = null;
      persistenceAttempted = false;
      this.attachFirestoreListeners();
      return {
        ok: true,
        message: `Konfigurasi Firebase kustom (${parsed.projectId}) tersimpan & disambungkan.`,
      };
    } catch {
      return { ok: false, message: 'Format JSON konfigurasi Firebase tidak valid.' };
    }
  }
}

export const cbtStore = new CbtStore();
