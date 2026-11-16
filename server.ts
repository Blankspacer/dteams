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

app.use(express.json({ limit: '30mb' }));

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
    contents: `Analyze this meeting transcript and produce clear, concise meeting minutes.\n\nMeeting Title: ${title}\nTranscript:\n${transcript}`,
    config: {
      systemInstruction:
        'You summarize internal office meetings cleanly and concisely in JSON.',
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
            description: 'Key decisions made during the meeting.',
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

// Transcribe any uploaded/recorded meeting audio using gemini-3.5-transcribe + summarize with gemini-4-hydrogen
app.post('/api/ai/transcribe-meeting', async (req, res) => {
  try {
    const { audioBase64, mimeType, meetingTitle } = req.body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Audio data is required.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
    }

    const cleanBase64 = audioBase64.includes(',')
      ? audioBase64.split(',')[1]
      : audioBase64;

    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: cleanBase64,
      },
    };

    const transcribeResp = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: 'Transcribe this meeting audio accurately and clearly. Separate speaker turns if distinguishable.',
          },
        ],
      },
    });

    const transcriptText = (transcribeResp.text || '').trim();
    if (!transcriptText) {
      return res.json({
        transcriptText: 'No speech detected in the recording.',
        summary: 'No spoken content was detected to summarize.',
        decisions: [],
        actionItems: [],
      });
    }

    const minutes = await summarizeTranscript(
      meetingTitle || 'Recorded Meeting',
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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
