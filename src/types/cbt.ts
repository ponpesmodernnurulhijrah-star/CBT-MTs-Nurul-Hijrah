export type PortalRole = 'home' | 'student' | 'teacher' | 'admin';

export type QuestionType =
  | 'pg'
  | 'pg_kompleks'
  | 'benar_salah'
  | 'isian_singkat'
  | 'esai';

export type SubmissionStatus = 'Selesai' | 'Pelanggaran';

export type PetCharacter = 'kucing' | 'burung_hantu' | 'gajah' | 'rubah';

export type SyncStateKind =
  | 'synced'
  | 'syncing'
  | 'pending_local'
  | 'offline'
  | 'local_forced'
  | 'conflict'
  | 'error';

export interface SyncStatus {
  state: SyncStateKind;
  mode: 'firebase' | 'local';
  pendingWrites: number;
  lastSyncedAt: string | null;
  lastEvent: string;
  projectId: string;
  fromCache: boolean;
}

export type ConflictEntityKind =
  | 'question'
  | 'schedule'
  | 'teacher'
  | 'result'
  | 'subject'
  | 'class'
  | 'settings';

export type ConflictResolutionChoice = 'keep_local' | 'use_server' | 'merge';

export interface ConflictFieldDiff {
  field: string;
  label: string;
  localValue: string;
  serverValue: string;
}

export interface SyncConflict {
  id: string;
  entityKind: ConflictEntityKind;
  entityId: string;
  entityTitle: string;
  detectedAt: string;
  localUpdatedAt: string;
  serverUpdatedAt: string;
  localData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  diffs: ConflictFieldDiff[];
  supportsMerge: boolean;
  reason: string;
}

export interface PendingLocalChange {
  conflictKey: string;
  entityKind: ConflictEntityKind;
  entityId: string;
  entityTitle: string;
  localUpdatedAt: string;
  localData: Record<string, unknown>;
  baseHash: string;
}

export interface FirebaseOverrideConfig {
  apiKey: string;
  authDomain?: string;
  databaseURL?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}

export interface SubjectItem {
  id: string;
  nama: string;
  urut: number;
}

export interface ClassItem {
  id: string;
  nama: string;
  urut: number;
}

export interface TeacherAccount {
  id: string;
  nama: string;
  username: string;
  passwordHash: string;
  salt?: string;
  mataPelajaran: string;
  mataPelajaranList?: string[];
  aktif: boolean;
  createdAt: string;
}

export interface AdminAccount {
  id: string;
  nama: string;
  username: string;
  passwordHash: string;
  salt?: string;
}

export interface QuestionOption {
  key: string; // 'A' | 'B' | 'C' | 'D' | 'E' | 'BENAR' | 'SALAH'
  label: string;
}

export interface Question {
  id: string;
  mataPelajaran: string;
  guruId: string;
  tipe: QuestionType;
  pertanyaanHtml: string;
  pertanyaanTeks: string;
  opsi: QuestionOption[];
  kunciJawaban: string[]; // e.g. ['A'] or ['A','C'] or ['BENAR'] or ['jakarta']
  bobot: number;
  createdAt: string;
}

export interface ExamSchedule {
  id: string;
  judulUjian: string;
  mataPelajaran: string;
  guruId: string;
  guruNama: string;
  kelasTarget: string[]; // e.g. ['VII', 'VIII', 'IX']
  durasiMenit: number;
  token: string;
  aktif: boolean;
  questionsSnapshot: Question[];
  createdAt: string;
}

export type StudentAnswerValue = string | string[];

export interface ExamResult {
  id: string;
  sessionId: string;
  waktuSubmit: string;
  namaSiswa: string;
  noPeserta: string;
  kelas: string;
  mataPelajaran: string;
  judulUjian: string;
  scheduleId: string;
  guruId: string;
  skorPG: number;
  skorEsai: number;
  nilaiAkhir: number;
  status: SubmissionStatus;
  alasanPelanggaran?: string;
  jumlahKeluarTab: number;
  jumlahMenoleh: number;
  jawabanDetail: Record<string, StudentAnswerValue>;
  skorEsaiPerSoal?: Record<string, number>;
  snapshotQuestions?: Question[];
  sudahDinilaiEsai: boolean;
}

export interface LiveProctorSession {
  sessionId: string;
  namaSiswa: string;
  noPeserta: string;
  kelas: string;
  mataPelajaran: string;
  judulUjian: string;
  scheduleId: string;
  guruId: string;
  status: 'Mengerjakan' | 'Selesai' | 'Pelanggaran';
  audioLevel: number;
  jumlahKeluarTab: number;
  jumlahMenoleh: number;
  warningMessage?: string;
  offerSdp?: string;
  answerSdp?: string;
  updatedAt: string;
}

export interface AppSettings {
  googleSheetsUrl: string;
  appVersion: string;
  institutionName: string;
  updatedAt: string;
}

export interface PetCommandAction {
  type:
    | 'navigate_portal'
    | 'navigate_tab'
    | 'toggle_theme'
    | 'change_pet'
    | 'hide_pet'
    | 'add_sample_question'
    | 'start_tour'
    | 'open_video_tutorial'
    | 'export_csv';
  payload?: Record<string, unknown>;
}
