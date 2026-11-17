import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
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

const aiBeta = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  apiVersion: 'v1beta',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function extractGeminiError(err: unknown): { status?: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown AI error');
  const statusProp = (err as { status?: number })?.status;
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error || parsed;
    return {
      status: typeof inner?.code === 'number' ? inner.code : statusProp,
      message: String(inner?.message || raw),
    };
  } catch {
    return { status: statusProp, message: raw };
  }
}

function isTransientError(err: unknown): boolean {
  const { status, message } = extractGeminiError(err);
  return (
    status === 429 ||
    status === 503 ||
    status === 500 ||
    /high demand|unavailable|resource_exhausted|rate limit|timeout/i.test(message)
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientError(err)) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/app-info', (_req, res) => {
  res.json({
    appUrl: process.env.APP_URL || '',
  });
});

interface ExtractedMeetingTask {
  task: string;
  assignedTo: string;
  deadline: string;
  completed: boolean;
}

interface MeetingMinutesResult {
  summary: string;
  discussionPoints: string[];
  decisions: string[];
  tasks: ExtractedMeetingTask[];
  actionItems: string[];
  momText: string;
}

function buildFallbackMomText(params: {
  title: string;
  organizerName?: string;
  participantNames?: string[];
  scheduledTime?: string;
  summary: string;
  discussionPoints: string[];
  decisions: string[];
  tasks: ExtractedMeetingTask[];
}): string {
  const attendees =
    params.participantNames && params.participantNames.length > 0
      ? params.participantNames.join(', ')
      : params.organizerName || 'Team Members';
  const lines: string[] = [
    `MINUTES OF MEETING (MoM)`,
    `Meeting: ${params.title}`,
    `Date/Time: ${params.scheduledTime || new Date().toLocaleString()}`,
    `Attendees: ${attendees}`,
    '',
    `EXECUTIVE SUMMARY`,
    params.summary || 'Meeting completed.',
    '',
    `IMPORTANT DISCUSSION POINTS`,
    ...(params.discussionPoints.length > 0
      ? params.discussionPoints.map((d) => `- ${d}`)
      : ['- General team updates and alignment']),
    '',
    `KEY DECISIONS`,
    ...(params.decisions.length > 0
      ? params.decisions.map((d) => `- ${d}`)
      : ['- No formal decisions recorded.']),
    '',
    `ACTION ITEMS & RESPONSIBILITIES`,
    ...(params.tasks.length > 0
      ? params.tasks.map(
          (t, i) =>
            `${i + 1}. Task: ${t.task} | Assigned to: ${t.assignedTo} | Deadline: ${t.deadline}`
        )
      : ['- No specific action items assigned.']),
  ];
  return lines.join('\n').slice(0, 20000);
}

async function summarizeTranscript(
  title: string,
  transcript: string,
  options?: {
    organizerName?: string;
    participantNames?: string[];
    scheduledTime?: string;
  }
): Promise<MeetingMinutesResult> {
  const safeTitle = (title || 'Team Meeting').slice(0, 150);
  const participantList =
    Array.isArray(options?.participantNames) && options.participantNames.length > 0
      ? options.participantNames.slice(0, 20)
      : [];

  if (!process.env.GEMINI_API_KEY) {
    const tasks: ExtractedMeetingTask[] = [
      {
        task: 'Follow up on key meeting deliverables and share notes',
        assignedTo: options?.organizerName || 'Team',
        deadline: 'Next check-in',
        completed: false,
      },
    ];
    const summary = `Summary for "${safeTitle}": The team reviewed key priorities, aligned on decisions, and assigned next steps.`;
    const discussionPoints = [`Key topics discussed in ${safeTitle}.`];
    const decisions = ['Confirmed next milestones and responsibilities.'];
    const actionItems = tasks.map(
      (t) => `${t.task} — Assigned to: ${t.assignedTo} (Deadline: ${t.deadline})`
    );
    return {
      summary,
      discussionPoints,
      decisions,
      tasks,
      actionItems,
      momText: buildFallbackMomText({
        title: safeTitle,
        organizerName: options?.organizerName,
        participantNames: participantList,
        scheduledTime: options?.scheduledTime,
        summary,
        discussionPoints,
        decisions,
        tasks,
      }),
    };
  }

  const participantsContext =
    participantList.length > 0 ? `\nParticipants: ${participantList.join(', ')}` : '';
  const todayContext = `Current date: ${new Date().toDateString()}`;
  const promptText = `You are an AI Meeting Assistant. Analyze this meeting transcript carefully and extract structured Meeting Minutes (MoM).\n\n${todayContext}\nMeeting Title: ${safeTitle}${participantsContext}\nTranscript:\n${transcript}`;
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: '2-3 sentence executive summary of the meeting discussion and outcomes.',
      },
      discussionPoints: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Important discussion points covered during the meeting.',
      },
      decisions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Key decisions approved or finalized during the meeting.',
      },
      tasks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            task: {
              type: Type.STRING,
              description: 'Clear description of the action item or task.',
            },
            assignedTo: {
              type: Type.STRING,
              description: 'Person, role, or team responsible for completing the task.',
            },
            deadline: {
              type: Type.STRING,
              description: 'Target due date or timeframe mentioned (or "TBD" if none stated).',
            },
          },
          required: ['task', 'assignedTo', 'deadline'],
        },
        description: 'Structured action items with responsible owner and deadline.',
      },
      momText: {
        type: Type.STRING,
        description:
          'Complete, formatted plain-text Minutes of Meeting (MoM) including Title, Attendees, Summary, Discussion Points, Decisions, and Action Items with Assignee and Deadline.',
      },
    },
    required: ['summary', 'discussionPoints', 'decisions', 'tasks', 'momText'],
  };

  const sysInstruction =
    'You are a precision AI Meeting Assistant for team meetings. Extract concise executive summaries, important discussion points, clear decisions, actionable tasks with who is responsible (assignedTo) and deadlines, and a well-formatted formal Minutes of Meeting (MoM) text in JSON. If an owner or deadline is not explicitly stated, infer reasonably from context or use "Team" / "TBD".';

  let response;
  try {
    response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptText,
        config: {
          systemInstruction: sysInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema,
        },
      })
    );
  } catch (primaryErr) {
    console.warn('gemini-4-hydrogen summary failed, falling back to gemini-3.1-flash-lite:', extractGeminiError(primaryErr).message);
    response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: promptText,
        config: {
          systemInstruction: sysInstruction,
          responseMimeType: 'application/json',
          responseSchema,
        },
      })
    );
  }

  const text = (response.text ?? '{}').trim();
  const parsed = JSON.parse(text);

  const discussionPoints: string[] = Array.isArray(parsed.discussionPoints)
    ? parsed.discussionPoints
        .map((item: unknown) => String(item || '').trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 30)
    : [];

  const decisions: string[] = Array.isArray(parsed.decisions)
    ? parsed.decisions
        .map((item: unknown) => String(item || '').trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 30)
    : [];

  const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const tasks: ExtractedMeetingTask[] = rawTasks
    .slice(0, 30)
    .map((item: any) => ({
      task: String(item?.task || '').trim().slice(0, 500),
      assignedTo: String(item?.assignedTo || 'Unassigned').trim().slice(0, 120) || 'Unassigned',
      deadline: String(item?.deadline || 'TBD').trim().slice(0, 80) || 'TBD',
      completed: false,
    }))
    .filter((t: ExtractedMeetingTask) => t.task.length > 0);

  const actionItems: string[] = tasks.map((t) =>
    `${t.task} — Assigned to: ${t.assignedTo} (Deadline: ${t.deadline})`.slice(0, 500)
  );

  const summary = String(parsed.summary || '').trim().slice(0, 5000);
  const momText =
    String(parsed.momText || '').trim().slice(0, 20000) ||
    buildFallbackMomText({
      title: safeTitle,
      organizerName: options?.organizerName,
      participantNames: participantList,
      scheduledTime: options?.scheduledTime,
      summary,
      discussionPoints,
      decisions,
      tasks,
    });

  return {
    summary,
    discussionPoints,
    decisions,
    tasks,
    actionItems,
    momText,
  };
}

function normalizeAudioMimeType(raw?: string): string {
  const base = String(raw || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (!base) return 'audio/webm';
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'video/mp4' || base === 'audio/x-m4a') return 'audio/mp4';
  return base;
}

// Transcribe any call/meeting audio using gemini-3.5-transcribe + generate AI MoM with gemini-4-hydrogen
app.post('/api/ai/transcribe-meeting', async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType,
      meetingTitle,
      participantNames,
      organizerName,
      scheduledTime,
      liveNotes,
    } = req.body;
    const fallbackNotes = typeof liveNotes === 'string' ? liveNotes.trim() : '';

    if ((!audioBase64 || typeof audioBase64 !== 'string') && !fallbackNotes) {
      return res.status(400).json({ error: 'Audio data or transcript notes are required.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      if (fallbackNotes) {
        const minutes = await summarizeTranscript(meetingTitle || 'Team Call', fallbackNotes, {
          organizerName,
          participantNames,
          scheduledTime,
        });
        return res.json({
          transcriptText: fallbackNotes,
          ...minutes,
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

        const transcribePrompt = `Transcribe this call/meeting audio accurately and clearly. Format distinct speaker turns on new lines when speakers change. If the audio contains no intelligible speech, respond with an empty string.${speakersHint}`;

        const transcribeCandidates: Array<{
          label: string;
          run: () => Promise<{ text?: string }>;
        }> = [
          {
            label: 'v1beta/gemini-3.5-transcribe',
            run: () =>
              aiBeta.models.generateContent({
                model: 'gemini-3.5-transcribe',
                contents: { parts: [audioPart, { text: transcribePrompt }] },
              }),
          },
          {
            label: 'v1/gemini-4-hydrogen',
            run: () =>
              ai.models.generateContent({
                model: 'gemini-4-hydrogen',
                contents: { parts: [audioPart, { text: transcribePrompt }] },
                config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
              }),
          },
          {
            label: 'v1/gemini-3.1-flash-lite',
            run: () =>
              ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: { parts: [audioPart, { text: transcribePrompt }] },
              }),
          },
        ];

        let lastTranscribeErr: unknown = null;
        for (const candidate of transcribeCandidates) {
          try {
            const transcribeResp = await withRetry(candidate.run);
            transcriptText = (transcribeResp.text || '').trim();
            lastTranscribeErr = null;
            break;
          } catch (err) {
            lastTranscribeErr = err;
            console.warn(
              `Audio transcription candidate ${candidate.label} failed:`,
              extractGeminiError(err).message
            );
          }
        }

        if (lastTranscribeErr && !fallbackNotes) {
          throw lastTranscribeErr;
        }
      }
    }

    if (!transcriptText && fallbackNotes) {
      transcriptText = fallbackNotes;
    }

    if (!transcriptText) {
      return res.json({
        transcriptText: 'No speech detected in the call recording.',
        summary: 'No spoken content was detected to summarize.',
        discussionPoints: [],
        decisions: [],
        tasks: [],
        actionItems: [],
        momText: '',
      });
    }

    const minutes = await summarizeTranscript(meetingTitle || 'Team Call', transcriptText, {
      organizerName,
      participantNames,
      scheduledTime,
    });

    return res.json({
      transcriptText,
      ...minutes,
    });
  } catch (error: any) {
    console.error('Error transcribing meeting audio:', error);
    const { status, message } = extractGeminiError(error);
    return res.status(status && status >= 400 && status < 600 ? status : 500).json({
      error: message || 'Failed to transcribe meeting audio.',
    });
  }
});

// Summarize text transcript / live call notes into AI Meeting Minutes (MoM)
app.post('/api/ai/meeting-minutes', async (req, res) => {
  try {
    const {
      meetingTitle,
      transcriptText,
      participantNames,
      organizerName,
      scheduledTime,
    } = req.body;
    const text = String(transcriptText || '').trim();

    if (!text) {
      return res.status(400).json({ error: 'Transcript text is required.' });
    }

    const minutes = await summarizeTranscript(meetingTitle || 'Team Meeting', text, {
      organizerName,
      participantNames,
      scheduledTime,
    });

    return res.json({
      transcriptText: text,
      ...minutes,
    });
  } catch (error: any) {
    console.error('Error generating meeting minutes:', error);
    const { status, message } = extractGeminiError(error);
    return res.status(status && status >= 400 && status < 600 ? status : 500).json({
      error: message || 'Failed to generate meeting minutes.',
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
