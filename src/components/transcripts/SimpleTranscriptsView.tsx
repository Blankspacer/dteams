import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Mic,
  Square,
  Upload,
  Copy,
  Download,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MeetingRecord } from '../../types';

export const SimpleTranscriptsView: React.FC = () => {
  const {
    firebaseUser,
    currentProfile,
    meetings,
    lastTranscribedMeetingId,
    setLastTranscribedMeetingId,
    saveMeetingTranscript,
    deleteMeetingRecord,
  } = useApp();

  const [meetingTitle, setMeetingTitle] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);

  const completedMeetings = meetings.filter(
    (m) => m.transcriptText || m.aiSummary || m.status === 'completed'
  );

  useEffect(() => {
    if (!lastTranscribedMeetingId) return;
    const match = meetings.find((m) => m.id === lastTranscribedMeetingId);
    if (match) {
      setSelectedMeeting(match);
      setLastTranscribedMeetingId(null);
    }
  }, [lastTranscribedMeetingId, meetings, setLastTranscribedMeetingId]);

  const activeDetail =
    selectedMeeting
      ? meetings.find((m) => m.id === selectedMeeting.id) || selectedMeeting
      : completedMeetings[0] || null;

  const handleGenerateMinutesForDetail = async (m: MeetingRecord) => {
    if (!m.transcriptText?.trim() || processing) return;
    setError(null);
    setProcessing(true);
    try {
      const resp = await fetch('/api/ai/meeting-minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingTitle: m.title,
          transcriptText: m.transcriptText,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to generate AI minutes.');
      await saveMeetingTranscript({
        title: m.title,
        transcriptText: m.transcriptText,
        aiSummary: data.summary || '',
        decisions: data.decisions || [],
        actionItems: data.actionItems || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to summarize transcript.');
    } finally {
      setProcessing(false);
    }
  };

  const transcribeBlob = async (blob: Blob, titleFallback: string) => {
    setError(null);
    setProcessing(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read audio file.'));
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const resp = await fetch('/api/ai/transcribe-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: blob.type || 'audio/webm',
          meetingTitle: meetingTitle.trim() || titleFallback,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Transcription failed.');
      }

      const id = await saveMeetingTranscript({
        title: meetingTitle.trim() || titleFallback,
        transcriptText: data.transcriptText || '',
        aiSummary: data.summary || '',
        decisions: data.decisions || [],
        actionItems: data.actionItems || [],
      });

      setMeetingTitle('');
      if (id) {
        setSelectedMeeting({
          id,
          title: meetingTitle.trim() || titleFallback,
          organizerId: firebaseUser?.uid || '',
          organizerName: currentProfile?.displayName || 'Member',
          status: 'completed',
          isPublic: true,
          participantIds: firebaseUser ? [firebaseUser.uid] : [],
          transcriptText: data.transcriptText,
          aiSummary: data.summary,
          decisions: data.decisions,
          actionItems: data.actionItems,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription error.');
    } finally {
      setProcessing(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) {
      setError('Audio file must be under 18 MB.');
      return;
    }
    await transcribeBlob(file, file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleToggleVoiceRecord = async () => {
    if (isRecordingAudio) {
      setIsRecordingAudio(false);
      recorderRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          await transcribeBlob(blob, `Voice Meeting ${new Date().toLocaleTimeString()}`);
        }
      };
      recorder.start(500);
      recorderRef.current = recorder;
      setIsRecordingAudio(true);
    } catch {
      setError('Microphone access is needed to record a meeting.');
    }
  };

  const handleSummarizeText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notesInput.trim()) return;
    setError(null);
    setProcessing(true);
    try {
      const title = meetingTitle.trim() || `Meeting Notes ${new Date().toLocaleDateString()}`;
      const resp = await fetch('/api/ai/meeting-minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingTitle: title,
          transcriptText: notesInput.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Summarization failed.');

      const id = await saveMeetingTranscript({
        title,
        transcriptText: data.transcriptText || notesInput.trim(),
        aiSummary: data.summary || '',
        decisions: data.decisions || [],
        actionItems: data.actionItems || [],
      });

      setMeetingTitle('');
      setNotesInput('');
      if (id) {
        setSelectedMeeting({
          id,
          title,
          organizerId: firebaseUser?.uid || '',
          organizerName: currentProfile?.displayName || 'Member',
          status: 'completed',
          isPublic: true,
          participantIds: firebaseUser ? [firebaseUser.uid] : [],
          transcriptText: data.transcriptText || notesInput.trim(),
          aiSummary: data.summary,
          decisions: data.decisions,
          actionItems: data.actionItems,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process meeting notes.');
    } finally {
      setProcessing(false);
    }
  };

  const formatMarkdown = (m: MeetingRecord) => {
    return `# ${m.title}\n\n## Summary\n${m.aiSummary || 'N/A'}\n\n## Decisions\n${
      (m.decisions || []).map((d) => `- ${d}`).join('\n') || '- None noted'
    }\n\n## Action Items\n${
      (m.actionItems || []).map((a) => `- [ ] ${a}`).join('\n') || '- None noted'
    }\n\n## Full Transcript\n${m.transcriptText || ''}`;
  };

  const handleCopy = (m: MeetingRecord) => {
    navigator.clipboard.writeText(formatMarkdown(m));
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (m: MeetingRecord) => {
    const blob = new Blob([formatMarkdown(m)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Transcribe Any Meeting + Saved List */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">AI Meeting Transcription</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Record audio, upload any meeting recording, or paste notes to get a transcript and summary.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Meeting title (optional)"
              className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
            />

            {/* Record or Upload Audio */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleToggleVoiceRecord}
                disabled={processing}
                className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  isRecordingAudio
                    ? 'bg-rose-600 text-white'
                    : 'bg-sky-600 hover:bg-sky-700 text-white'
                } disabled:opacity-50`}
              >
                {isRecordingAudio ? (
                  <>
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop & Transcribe</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Record Audio</span>
                  </>
                )}
              </button>

              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,video/webm,video/mp4"
                onChange={handleAudioUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={processing || isRecordingAudio}
                className="min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Audio</span>
              </button>
            </div>

            {processing && (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Transcribing and generating meeting minutes...</span>
              </div>
            )}

            {/* Paste Notes Fallback / Quick Summarize */}
            <form onSubmit={handleSummarizeText} className="space-y-2.5 pt-2 border-t border-slate-100">
              <textarea
                rows={3}
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Or paste raw meeting transcript / notes here..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white resize-none"
              />
              <button
                type="submit"
                disabled={processing || !notesInput.trim()}
                className="w-full min-h-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold transition-colors"
              >
                Summarize Notes
              </button>
            </form>
          </div>

          {/* Saved Transcripts List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Saved Transcripts</h2>
              <span className="text-xs text-slate-500 tabular-nums">{completedMeetings.length}</span>
            </div>

            {completedMeetings.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No transcripts saved yet. Record a call or upload meeting audio above.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {completedMeetings.map((m) => {
                  const isSelected = activeDetail?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMeeting(m)}
                      className={`w-full py-3 px-2.5 text-left rounded-xl transition-colors flex items-center justify-between gap-2 ${
                        isSelected ? 'bg-sky-50 text-sky-950' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {m.title}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {m.organizerName} · {m.scheduledTime || 'Recorded'}
                        </div>
                      </div>
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Transcript & Minutes */}
        <div className="lg:col-span-7">
          {activeDetail ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{activeDetail.title}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    By {activeDetail.organizerName} · {activeDetail.scheduledTime || 'Completed'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(activeDetail)}
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                  >
                    {copiedId === activeDetail.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === activeDetail.id ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={() => handleDownload(activeDetail)}
                    className="min-h-[40px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>

                  {(activeDetail.organizerId === firebaseUser?.uid ||
                    currentProfile?.role === 'admin') && (
                    <button
                      onClick={() => {
                        deleteMeetingRecord(activeDetail.id);
                        setSelectedMeeting(null);
                      }}
                      className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center"
                      title="Delete transcript"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {activeDetail.aiSummary ? (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    AI Summary
                  </h3>
                  <p className="text-sm text-slate-800 leading-relaxed">
                    {activeDetail.aiSummary}
                  </p>
                </div>
              ) : activeDetail.transcriptText ? (
                <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-sky-900">
                    Generate an AI summary, decisions, and action items from this transcript:
                  </p>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => handleGenerateMinutesForDetail(activeDetail)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{processing ? 'Summarizing...' : 'Generate AI Minutes'}</span>
                  </button>
                </div>
              ) : null}

              {activeDetail.decisions && activeDetail.decisions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Decisions
                  </h3>
                  <ul className="space-y-1.5">
                    {activeDetail.decisions.map((d, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeDetail.actionItems && activeDetail.actionItems.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Action Items
                  </h3>
                  <ul className="space-y-1.5">
                    {activeDetail.actionItems.map((item, idx) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Full Transcript
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                  {activeDetail.transcriptText || 'No transcript text available.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-2">
              <FileText className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No meeting selected</p>
              <p className="text-xs">
                Record or upload any meeting audio on the left to generate an AI transcript and summary.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
