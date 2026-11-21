import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_VERSION = '2026.11.21-ma-nh-v1';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/version', (_req, res) => {
    res.json({
      version: APP_VERSION,
      updatedAt: '2026-11-21T08:30:00Z',
    });
  });

  app.post('/api/ai/parse-questions', async (req, res) => {
    try {
      const { rawContent, htmlContent, pdfBase64, mataPelajaran } = req.body as {
        rawContent?: string;
        htmlContent?: string;
        pdfBase64?: string;
        mataPelajaran?: string;
      };

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            'GEMINI_API_KEY belum tersedia di environment server. Silakan periksa Settings > Secrets atau gunakan parser otomatis bawaan.',
        });
      }

      const instruction = `Anda adalah Smart AI Question Parser untuk CBT MA Nurul Hijrah (Mata Pelajaran: ${mataPelajaran || 'Umum'}).
Tugas Anda: membaca teks soal, HTML dari Microsoft Word (yang bisa berisi tag <table>, <img>, <b>, <i>), atau dokumen PDF yang diberikan, lalu mengekstrak seluruh butir soal menjadi JSON terstruktur.
Aturan:
1. Deteksi tipe soal secara akurat:
   - "pg": Pilihan Ganda biasa (1 kunci jawaban A/B/C/D/E)
   - "pg_kompleks": Pilihan Ganda Kompleks (>1 jawaban benar)
   - "benar_salah": Pernyataan Benar/Salah (opsi key "BENAR" dan "SALAH")
   - "isian_singkat": Jawaban singkat 1-3 kata
   - "esai": Uraian terbuka
2. Pertahankan tag HTML aman seperti <table>, <tr>, <th>, <td>, <p>, <br>, <b>, <i>, dan <img> di dalam "pertanyaanHtml" agar tabel atau gambar dari Word tidak hilang!
3. "pertanyaanTeks" berisi teks bersih dari pertanyaan tanpa tag HTML.
4. Untuk "kunciJawaban", gunakan huruf kapital opsi (["A"] atau ["A", "C"]) untuk PG/PG Kompleks, ["BENAR"] / ["SALAH"] untuk Benar/Salah, atau kata kunci untuk Isian Singkat.`;

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      if (pdfBase64) {
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        });
      }

      const combinedText = [
        htmlContent ? `KONTEN HTML WORD:\n${htmlContent}` : '',
        rawContent ? `KONTEN TEKS:\n${rawContent}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      parts.push({
        text:
          combinedText ||
          'Ekstrak seluruh soal ujian dari dokumen PDF terlampir sesuai format JSON yang diminta.',
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction: instruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tipe: {
                  type: Type.STRING,
                  description: 'pg | pg_kompleks | benar_salah | isian_singkat | esai',
                },
                pertanyaanHtml: { type: Type.STRING },
                pertanyaanTeks: { type: Type.STRING },
                opsi: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      label: { type: Type.STRING },
                    },
                  },
                },
                kunciJawaban: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim());
      res.json({ questions: Array.isArray(parsed) ? parsed : [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses soal dengan AI';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/ai/pet-assistant', async (req, res) => {
    try {
      const { message, role, contextSummary, petName } = req.body as {
        message: string;
        role: string;
        contextSummary?: string;
        petName?: string;
      };

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY belum terpasang pada server.',
        });
      }

      const sysPrompt = `Kamu adalah Asisten Virtual Pet pintar bernama "${petName || 'Mochi'}" di aplikasi ujian online "CBT MA Nurul Hijrah".
Peran pengguna saat ini: ${role}.
Konteks ringkas layar saat ini: ${contextSummary || 'Beranda CBT MA Nurul Hijrah'}.
Kamu BISA melakukan apa saja yang diminta pengguna: menjawab pertanyaan pelajaran, menjelaskan panduan CBT untuk guru/admin/siswa, membuatkan contoh soal baru, maupun menjalankan perintah kontrol UI secara langsung!

Jika pengguna memberi perintah untuk mengubah aplikasi atau berpindah menu, sertakan field "action" dengan salah satu tipe berikut:
- "navigate_portal": payload { "portal": "home" | "student" | "teacher" | "admin" }
- "navigate_tab": payload { "tab": "dashboard" | "bank_soal" | "jadwal" | "hasil" | "monitoring" | "sheets" | "guru_mapel" | "kelas_tes" | "rekap_nilai" }
- "toggle_theme": payload { "theme": "light" | "dark" | "toggle" }
- "change_pet": payload { "pet": "kucing" | "burung_hantu" | "gajah" | "rubah" }
- "hide_pet": payload {}
- "start_tour": payload {}
- "open_video_tutorial": payload {}
- "export_csv": payload {}
- "add_sample_question": payload { "tipe": "pg" | "pg_kompleks" | "benar_salah" | "esai", "pertanyaan": string, "opsi": [{"key":"A","label":"..."}], "kunciJawaban": ["A"] }

Jawab selalu dalam Bahasa Indonesia yang ramah, ringkas, jelas, dan membantu. Jika pengguna meminta membuatkan soal (misal "buatkan 1 soal matematika"), isi action "add_sample_question" lengkap dengan opsi dan kunciJawaban!`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: message,
        config: {
          systemInstruction: sysPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              mood: {
                type: Type.STRING,
                description: 'happy | thinking | celebrate | sleepy',
              },
              action: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  payloadJson: {
                    type: Type.STRING,
                    description: 'JSON string of action payload parameters',
                  },
                },
              },
            },
          },
        },
      });

      const raw = JSON.parse((response.text ?? '{}').trim());
      let action = undefined;
      if (raw.action?.type) {
        let payload: Record<string, unknown> = {};
        if (raw.action.payloadJson) {
          try {
            payload = JSON.parse(raw.action.payloadJson);
          } catch {
            payload = {};
          }
        }
        action = { type: raw.action.type, payload };
      }

      res.json({
        reply: raw.reply || 'Siap! Perintah telah diproses.',
        mood: raw.mood || 'happy',
        action,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi Asisten AI';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/sheets/proxy', async (req, res) => {
    try {
      const { url, method = 'POST', payload } = req.body as {
        url: string;
        method?: 'GET' | 'POST';
        payload?: unknown;
      };
      if (!url || !url.startsWith('https://script.google.com/')) {
        return res.status(400).json({
          error: 'URL Google Apps Script tidak valid. Harus diawali https://script.google.com/',
        });
      }

      const fetchRes = await fetch(url, {
        method,
        headers:
          method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
        redirect: 'follow',
      });

      const text = await fetchRes.text();
      try {
        const json = JSON.parse(text);
        res.status(fetchRes.status).json(json);
      } catch {
        res.status(fetchRes.status).json({ ok: fetchRes.ok, raw: text });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal terhubung ke Google Sheets';
      res.status(502).json({ error: msg });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`CBT MA Nurul Hijrah server running on http://0.0.0.0:${port}`);
  });
}

createServer();
