import type { ExamResult, ExamSchedule, Question } from '../types/cbt';

export const GOOGLE_APPS_SCRIPT_CODE = `// =========================================================================
// GOOGLE APPS SCRIPT (Code.gs) — CBT MA NURUL HIJRAH
// Tempelkan kode ini di Google Sheets > Ekstensi > Apps Script > Deploy Web App
// =========================================================================

var SHEETS_CONFIG = {
  Akun_Guru: ['ID', 'Nama_Guru', 'Username_Hash', 'Password_Hash', 'Mata_Pelajaran', 'Aktif'],
  Bank_Soal: ['ID', 'Mata_Pelajaran', 'Guru_ID', 'Tipe', 'Pertanyaan_Teks', 'Opsi_JSON', 'Kunci_JSON', 'Bobot', 'Waktu_Buat'],
  Jadwal_Tes: ['ID', 'Judul_Ujian', 'Mata_Pelajaran', 'Guru_ID', 'Kelas_Target', 'Durasi_Menit', 'Token', 'Aktif', 'Snapshot_JSON'],
  Hasil_Ujian: [
    'Waktu_Submit',
    'Nama_Siswa',
    'No_Peserta',
    'Kelas',
    'Mata_Pelajaran',
    'Judul_Ujian',
    'Skor_PG',
    'Skor_Esai',
    'Nilai_Akhir',
    'Status_Pelanggaran',
    'Detail_Jawaban'
  ]
};

function ensureSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS_CONFIG).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(SHEETS_CONFIG[name]);
      sheet.getRange(1, 1, 1, SHEETS_CONFIG[name].length).setFontWeight('bold');
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(SHEETS_CONFIG[name]);
    }
  });
  return ss;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var ss = ensureSheets();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';

    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'Koneksi Google Sheets CBT MA Nurul Hijrah aktif!' });
    }

    var sheetName = 'Hasil_Ujian';
    if (action === 'get_teachers') sheetName = 'Akun_Guru';
    else if (action === 'get_questions') sheetName = 'Bank_Soal';
    else if (action === 'get_schedules') sheetName = 'Jadwal_Tes';

    var sheet = ss.getSheetByName(sheetName);
    var values = sheet.getDataRange().getValues();
    var headers = values[0] || [];
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var item = {};
      for (var c = 0; c < headers.length; c++) {
        item[headers[c]] = values[i][c];
      }
      rows.push(item);
    }
    return jsonResponse({ ok: true, sheet: sheetName, data: rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    var ss = ensureSheets();
    var body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
    var action = body.action || 'submit_result';

    if (action === 'submit_result') {
      var sheet = ss.getSheetByName('Hasil_Ujian');
      var r = body.data || {};
      sheet.appendRow([
        r.waktuSubmit || new Date().toISOString(),
        r.namaSiswa || '',
        r.noPeserta || '',
        r.kelas || '',
        r.mataPelajaran || '',
        r.judulUjian || '',
        r.skorPG || 0,
        r.skorEsai || 0,
        r.nilaiAkhir || 0,
        r.status === 'Pelanggaran' ? 'Pelanggaran (' + (r.alasanPelanggaran || 'Keluar Aplikasi') + ')' : 'Selesai (Normal)',
        JSON.stringify(r.jawabanDetail || {})
      ]);
      return jsonResponse({ ok: true, message: 'Hasil ujian tersimpan ke Google Sheets' });
    }

    if (action === 'save_question') {
      var qSheet = ss.getSheetByName('Bank_Soal');
      var q = body.data || {};
      qSheet.appendRow([
        q.id || '',
        q.mataPelajaran || '',
        q.guruId || '',
        q.tipe || 'pg',
        q.pertanyaanTeks || '',
        JSON.stringify(q.opsi || []),
        JSON.stringify(q.kunciJawaban || []),
        q.bobot || 1,
        q.createdAt || new Date().toISOString()
      ]);
      return jsonResponse({ ok: true, message: 'Soal tersimpan ke Bank_Soal' });
    }

    if (action === 'save_schedule') {
      var sSheet = ss.getSheetByName('Jadwal_Tes');
      var s = body.data || {};
      sSheet.appendRow([
        s.id || '',
        s.judulUjian || '',
        s.mataPelajaran || '',
        s.guruId || '',
        (s.kelasTarget || []).join(','),
        s.durasiMenit || 60,
        s.token || '',
        s.aktif ? 'AKTIF' : 'NONAKTIF',
        JSON.stringify(s.questionsSnapshot || [])
      ]);
      return jsonResponse({ ok: true, message: 'Jadwal tersimpan ke Jadwal_Tes' });
    }

    if (action === 'update_essay_score') {
      var hSheet = ss.getSheetByName('Hasil_Ujian');
      var upd = body.data || {};
      var rows = hSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][1] === upd.namaSiswa && rows[i][5] === upd.judulUjian) {
          hSheet.getRange(i + 1, 8).setValue(upd.skorEsai || 0);
          hSheet.getRange(i + 1, 9).setValue(upd.nilaiAkhir || 0);
          break;
        }
      }
      return jsonResponse({ ok: true, message: 'Nilai esai diperbarui' });
    }

    return jsonResponse({ ok: false, error: 'Action tidak dikenali: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}
`;

export async function testGoogleSheetsConnection(url: string): Promise<{ ok: boolean; message: string }> {
  if (!url.trim()) {
    return { ok: false, message: 'URL Web App Google Apps Script masih kosong.' };
  }
  try {
    const pingUrl = url.includes('?') ? `${url}&action=ping` : `${url}?action=ping`;
    const res = await fetch('/api/sheets/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: pingUrl, method: 'GET' }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    if (res.ok && data.ok) {
      return { ok: true, message: data.message || 'Terhubung ke Google Sheets!' };
    }
    return { ok: false, message: data.error || 'Respons Google Sheets tidak valid.' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Gagal menghubungi endpoint Google Sheets.',
    };
  }
}

export async function syncToGoogleSheets(
  url: string,
  action: 'submit_result' | 'save_question' | 'save_schedule' | 'update_essay_score',
  data: ExamResult | Question | ExamSchedule | Record<string, unknown>
): Promise<boolean> {
  if (!url || !url.startsWith('https://script.google.com/')) return false;
  try {
    const res = await fetch('/api/sheets/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        method: 'POST',
        payload: { action, data },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
