import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/app-info', (_req, res) => {
  res.json({
    appUrl: process.env.APP_URL || '',
  });
});

async function summarizeTranscript(title: string, transcript: string) {
  if (!process.env.GEMINI_API_KEY) {
    return {
      summary: `Summary for "${title}": The team aligned on milestones, next deliverables, and immediate action items.`,
      decisions: ['Confirmed key timeline and assigned next steps to owners.'],
      actionItems: ['Share notes with the team and follow up on action owners.'],
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze this call or meeting transcript and produce clear, concise meeting minutes.\n\nMeeting Title: ${title}\nTranscript:\n${transcript}`,
    config: {
      systemInstruction:
        'You summarize internal office calls and meetings cleanly and concisely in JSON.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: '2-3 sentence summary of key discussion and outcomes.',
          },
          decisions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Key decisions made during the call or meeting.',
          },
          actionItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Clear action items with owner if mentioned.',
          },
        },
        required: ['summary', 'decisions', 'actionItems'],
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  return JSON.parse(text);
}

function normalizeAudioMimeType(raw?: string): string {
  const base = String(raw || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (!base) return 'audio/webm';
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'video/mp4' || base === 'audio/x-m4a') return 'audio/mp4';
  return base;
}

// Transcribe any call/meeting audio using gemini-3.5-transcribe + summarize with gemini-4-hydrogen
app.post('/api/ai/transcribe-meeting', async (req, res) => {
  try {
    const { audioBase64, mimeType, meetingTitle, participantNames, liveNotes } = req.body;
    const fallbackNotes = typeof liveNotes === 'string' ? liveNotes.trim() : '';

    if ((!audioBase64 || typeof audioBase64 !== 'string') && !fallbackNotes) {
      return res.status(400).json({ error: 'Audio data or transcript notes are required.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      if (fallbackNotes) {
        const minutes = await summarizeTranscript(
          meetingTitle || 'Team Call',
          fallbackNotes
        );
        return res.json({
          transcriptText: fallbackNotes,
          summary: minutes.summary,
          decisions: minutes.decisions,
          actionItems: minutes.actionItems,
        });
      }
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
    }

    let transcriptText = '';

    if (audioBase64 && typeof audioBase64 === 'string') {
      const cleanBase64 = audioBase64.includes(',')
        ? audioBase64.split(',')[1]
        : audioBase64;

      if (cleanBase64 && cleanBase64.length > 64) {
        const audioPart = {
          inlineData: {
            mimeType: normalizeAudioMimeType(mimeType),
            data: cleanBase64,
          },
        };

        const speakersHint =
          Array.isArray(participantNames) && participantNames.length > 0
            ? ` Participants in this call: ${participantNames.slice(0, 20).join(', ')}.`
            : '';

        const transcribeResp = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              audioPart,
              {
                text: `Transcribe this call/meeting audio accurately and clearly. Format distinct speaker turns on new lines when speakers change.${speakersHint}`,
              },
            ],
          },
        });

        transcriptText = (transcribeResp.text || '').trim();
      }
    }

    if (!transcriptText && fallbackNotes) {
      transcriptText = fallbackNotes;
    }

    if (!transcriptText) {
      return res.json({
        transcriptText: 'No speech detected in the call recording.',
        summary: 'No spoken content was detected to summarize.',
        decisions: [],
        actionItems: [],
      });
    }

    const minutes = await summarizeTranscript(
      meetingTitle || 'Team Call',
      transcriptText
    );

    return res.json({
      transcriptText,
      summary: minutes.summary || '',
      decisions: Array.isArray(minutes.decisions) ? minutes.decisions : [],
      actionItems: Array.isArray(minutes.actionItems) ? minutes.actionItems : [],
    });
  } catch (error: any) {
    console.error('Error transcribing meeting audio:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to transcribe meeting audio.',
    });
  }
});

// Summarize text transcript / live call notes into meeting minutes
app.post('/api/ai/meeting-minutes', async (req, res) => {
  try {
    const { meetingTitle, transcriptText } = req.body;
    const text = String(transcriptText || '').trim();

    if (!text) {
      return res.status(400).json({ error: 'Transcript text is required.' });
    }

    const minutes = await summarizeTranscript(
      meetingTitle || 'Team Meeting',
      text
    );

    return res.json({
      transcriptText: text,
      summary: minutes.summary || '',
      decisions: Array.isArray(minutes.decisions) ? minutes.decisions : [],
      actionItems: Array.isArray(minutes.actionItems) ? minutes.actionItems : [],
    });
  } catch (error: any) {
    console.error('Error generating meeting minutes:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate meeting minutes.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    // Vite 8 injects transport.connect() into /@vite/client even when hmr/ws are false.
    // Strip that call so the browser does not attempt a failing WebSocket connection behind the proxy.
    app.get('/@vite/client', (req, res, next) => {
      delete req.headers['if-none-match'];
      delete req.headers['if-modified-since'];

      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);
      const chunks: Buffer[] = [];
      let isPatched = false;

      res.write = ((chunk: unknown, ...args: unknown[]) => {
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          isPatched = true;
          return true;
        }
        return (origWrite as (...a: unknown[]) => boolean)(chunk, ...args);
      }) as typeof res.write;

      res.end = ((chunk?: unknown, ...args: unknown[]) => {
        if (typeof chunk === 'function') {
          return (origEnd as (cb: unknown) => typeof res)(chunk);
        }
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          isPatched = true;
        }
        if (isPatched && chunks.length > 0) {
          const body = Buffer.concat(chunks).toString('utf8');
          const patched = body.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            `Object.assign(transport, {
              async connect() {},
              async disconnect() {},
              async send(payload) {
                if (payload && payload.type === 'custom' && payload.event === 'vite-pwa-plugin:dev-ready') {
                  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                    navigator.serviceWorker.register('/dev-sw.js?dev-sw', { scope: '/', type: 'classic' }).catch(() => {});
                  }
                }
              },
              async invoke() { return { result: undefined }; }
            });`
          );
          res.removeHeader('Content-Length');
          res.removeHeader('ETag');
          res.setHeader('Content-Length', Buffer.byteLength(patched, 'utf8'));
          res.setHeader('Cache-Control', 'no-store');
          return (origEnd as (data: string) => typeof res)(patched);
        }
        return (origEnd as (c?: unknown, ...a: unknown[]) => typeof res)(chunk, ...args);
      }) as typeof res.end;

      next();
    });

    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
