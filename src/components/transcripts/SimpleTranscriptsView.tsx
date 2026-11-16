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
  Calendar,
  UserCheck,
  MessageSquare,
  ListChecks,
  Send,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MeetingRecord, MeetingTask } from '../../types';
import {
  downloadTranscriptText,
  formatTranscriptAsText,
  pickSupportedAudioMimeType,
} from '../../utils/transcript';

export const SimpleTranscriptsView: React.FC = () => {
  const {
    firebaseUser,
    currentProfile,
    meetings,
    conversations,
    lastTranscribedMeetingId,
    setLastTranscribedMeetingId,
    saveMeetingTranscript,
    toggleMeetingTask,
    postMomToChat,
    deleteMeetingRecord,
    setActiveTab,
  } = useApp();

  const [subView, setSubView] = useState<'meetings' | 'tasks'>('meetings');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRecordedId, setJustRecordedId] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [liveSpeechNotes, setLiveSpeechNotes] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedChatId, setSharedChatId] = useState<string | null>(null);
  const [sharingToChat, setSharingToChat] = useState(false);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef<string>('audio/webm');
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const speechRecRef = useRef<any>(null);
  const keepSpeechRunningRef = useRef<boolean>(false);
  const liveSpeechNotesRef = useRef<string>('');

  useEffect(() => {
    liveSpeechNotesRef.current = liveSpeechNotes;
  }, [liveSpeechNotes]);

  useEffect(() => {
    if (!isRecordingAudio) {
      setRecordSeconds(0);
      return;
    }
    const timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecordingAudio]);

  const completedMeetings = meetings.filter(
    (m) => m.transcriptText || m.aiSummary || m.momText || m.status === 'completed'
  );

  useEffect(() => {
    if (!lastTranscribedMeetingId) return;
    const match = meetings.find((m) => m.id === lastTranscribedMeetingId);
    if (match) {
      setSelectedMeeting(match);
      setSubView('meetings');
      setLastTranscribedMeetingId(null);
    }
  }, [lastTranscribedMeetingId, meetings, setLastTranscribedMeetingId]);

  const activeDetail =
    selectedMeeting
      ? meetings.find((m) => m.id === selectedMeeting.id) || selectedMeeting
      : completedMeetings[0] || null;

  // Global Action Tracker items across all meetings
  const allTrackedTasks = completedMeetings.flatMap((m) =>
    (m.tasks || []).map((t, index) => ({
      meetingId: m.id,
      meetingTitle: m.title,
      scheduledTime: m.scheduledTime || 'Completed',
      taskIndex: index,
      ...t,
    }))
  );
  const openTasksCount = allTrackedTasks.filter((t) => !t.completed).length;

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
          organizerName: m.organizerName,
          scheduledTime: m.scheduledTime,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to generate AI Meeting Minutes.');
      await saveMeetingTranscript({
        meetingId: m.id,
        title: m.title,
        transcriptText: m.transcriptText,
        aiSummary: data.summary || '',
        discussionPoints: data.discussionPoints || [],
        decisions: data.decisions || [],
        actionItems: data.actionItems || [],
        tasks: data.tasks || [],
        momText: data.momText || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI Meeting Minutes.');
    } finally {
      setProcessing(false);
    }
  };

  const transcribeBlob = async (blob: Blob | null, titleFallback: string, liveNotes = '') => {
    setError(null);
    setProcessing(true);
    try {
      let base64 = '';
      if (blob && blob.size > 0) {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read audio file.'));
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }

      const finalTitle = meetingTitle.trim() || titleFallback;
      const scheduledTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const organizerName = currentProfile?.displayName || 'Member';

      const resp = await fetch('/api/ai/transcribe-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64 || undefined,
          mimeType: blob?.type || 'audio/webm',
          meetingTitle: finalTitle,
          organizerName,
          scheduledTime,
          liveNotes: liveNotes.trim() || undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Transcription failed.');
      }

      const transcriptText = data.transcriptText || liveNotes.trim() || '';
      const discussionPoints: string[] = data.discussionPoints || [];
      const decisions: string[] = data.decisions || [];
      const tasks: MeetingTask[] = data.tasks || [];
      const actionItems: string[] = data.actionItems || [];
      const momText: string = data.momText || '';

      const id = await saveMeetingTranscript({
        title: finalTitle,
        transcriptText,
        aiSummary: data.summary || '',
        discussionPoints,
        decisions,
        actionItems,
        tasks,
        momText,
      });

      setMeetingTitle('');
      setLiveSpeechNotes('');
      if (id) {
        setJustRecordedId(id);
        setSelectedMeeting({
          id,
          title: finalTitle,
          organizerId: firebaseUser?.uid || '',
          organizerName,
          status: 'completed',
          scheduledTime,
          isPublic: true,
          participantIds: firebaseUser ? [firebaseUser.uid] : [],
          transcriptText,
          aiSummary: data.summary || '',
          discussionPoints,
          decisions,
          actionItems,
          tasks,
          momText,
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
      keepSpeechRunningRef.current = false;
      try {
        speechRecRef.current?.stop();
      } catch {
        // Ignore
      }
      speechRecRef.current = null;
      recorderRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      return;
    }

    setError(null);
    setJustRecordedId(null);
    setLiveSpeechNotes('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      chunksRef.current = [];

      const mime = pickSupportedAudioMimeType();
      recorderMimeRef.current = mime || 'audio/webm';
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorderMimeRef.current });
        const notes = liveSpeechNotesRef.current;
        if (blob.size > 0 || notes.trim()) {
          await transcribeBlob(
            blob.size > 0 ? blob : null,
            `Voice Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            notes
          );
        }
      };
      recorder.start(500);
      recorderRef.current = recorder;
      setIsRecordingAudio(true);

      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        keepSpeechRunningRef.current = true;
        const startSpeech = () => {
          if (!keepSpeechRunningRef.current) return;
          try {
            const rec = new SpeechRec();
            rec.continuous = true;
            rec.interimResults = false;
            rec.lang = 'en-US';
            rec.onresult = (event: any) => {
              let finalText = '';
              for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                  finalText += event.results[i][0].transcript + ' ';
                }
              }
              if (finalText.trim()) {
                setLiveSpeechNotes((prev) => `${prev}${prev ? ' ' : ''}${finalText.trim()}`);
              }
            };
            rec.onend = () => {
              if (keepSpeechRunningRef.current) setTimeout(startSpeech, 400);
            };
            rec.start();
            speechRecRef.current = rec;
          } catch {
            // Ignore SpeechRecognition failures
          }
        };
        startSpeech();
      }
    } catch {
      setError('Microphone access is needed to record audio.');
    }
  };

  const handleSummarizeText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notesInput.trim()) return;
    setError(null);
    setProcessing(true);
    try {
      const title = meetingTitle.trim() || `Meeting Notes ${new Date().toLocaleDateString()}`;
      const scheduledTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const organizerName = currentProfile?.displayName || 'Member';

      const resp = await fetch('/api/ai/meeting-minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingTitle: title,
          transcriptText: notesInput.trim(),
          organizerName,
          scheduledTime,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'AI Meeting Assistant processing failed.');

      const transcriptText = data.transcriptText || notesInput.trim();
      const discussionPoints: string[] = data.discussionPoints || [];
      const decisions: string[] = data.decisions || [];
      const tasks: MeetingTask[] = data.tasks || [];
      const actionItems: string[] = data.actionItems || [];
      const momText: string = data.momText || '';

      const id = await saveMeetingTranscript({
        title,
        transcriptText,
        aiSummary: data.summary || '',
        discussionPoints,
        decisions,
        actionItems,
        tasks,
        momText,
      });

      setMeetingTitle('');
      setNotesInput('');
      if (id) {
        setJustRecordedId(id);
        setSelectedMeeting({
          id,
          title,
          organizerId: firebaseUser?.uid || '',
          organizerName,
          status: 'completed',
          scheduledTime,
          isPublic: true,
          participantIds: firebaseUser ? [firebaseUser.uid] : [],
          transcriptText,
          aiSummary: data.summary || '',
          discussionPoints,
          decisions,
          actionItems,
          tasks,
          momText,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process meeting notes.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCopy = (m: MeetingRecord) => {
    navigator.clipboard.writeText(formatTranscriptAsText(m));
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadTxt = (m: MeetingRecord) => {
    downloadTranscriptText(m);
  };

  const handleShareMomToChat = async (m: MeetingRecord) => {
    if (sharingToChat) return;
    setSharingToChat(true);
    try {
      const ok = await postMomToChat(m);
      if (ok) {
        setSharedChatId(m.id);
        setTimeout(() => setSharedChatId(null), 4000);
      }
    } finally {
      setSharingToChat(false);
    }
  };

  const formatRecTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const defaultChannelName =
    conversations.find((c) => c.id === 'general')?.name || conversations[0]?.name || 'general';

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Top Bar: AI Meeting Assistant Title & Sub-view Switcher */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">AI Meeting Assistant</h1>
              <p className="text-xs text-slate-500">
                Automatically transcribes calls, extracts discussion points, decisions, owners &amp; deadlines, and generates MoM.
              </p>
            </div>
          </div>

          <div className="inline-flex bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setSubView('meetings')}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                subView === 'meetings'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Meetings &amp; MoM</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('tasks')}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                subView === 'tasks'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Action Tracker</span>
              {openTasksCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-bold tabular-nums">
                  {openTasksCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {subView === 'tasks' ? (
          /* Global Action Item & Task Responsibility Tracker */
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Meeting Action Tracker
                </h2>
                <p className="text-xs text-slate-500">
                  All tasks, responsible owners, and deadlines automatically extracted by AI across your meetings.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {openTasksCount} pending · {allTrackedTasks.length - openTasksCount} completed
              </span>
            </div>

            {allTrackedTasks.length === 0 ? (
              <div className="py-10 text-center text-slate-500 space-y-2">
                <ListChecks className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">No tasks extracted yet</p>
                <p className="text-xs">
                  Record a call or submit meeting notes under Meetings &amp; MoM to automatically extract tasks, assignees, and deadlines.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {allTrackedTasks.map((item) => (
                  <div
                    key={`${item.meetingId}-${item.taskIndex}`}
                    className="py-3.5 flex items-start gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMeetingTask(item.meetingId, item.taskIndex)}
                      className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        item.completed
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white hover:border-sky-600'
                      }`}
                      aria-label={item.completed ? 'Mark task incomplete' : 'Mark task complete'}
                    >
                      {item.completed && <Check className="w-3.5 h-3.5" />}
                    </button>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div
                        className={`text-sm font-semibold ${
                          item.completed ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {item.task}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 font-medium text-sky-700">
                          <UserCheck className="w-3.5 h-3.5" />
                          Assigned to: {item.assignedTo}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                          <Calendar className="w-3.5 h-3.5" />
                          Deadline: {item.deadline}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const m = meetings.find((x) => x.id === item.meetingId);
                            if (m) {
                              setSelectedMeeting(m);
                              setSubView('meetings');
                            }
                          }}
                          className="text-slate-500 hover:text-sky-600 underline decoration-slate-300"
                        >
                          From: {item.meetingTitle}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Meetings & MoM Split View */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Capture / Process + Saved Meetings List */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Process Call or Meeting Notes
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Record, upload audio, or paste meeting notes to auto-generate MoM, decisions, and assigned tasks.
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
                  placeholder="Meeting title (e.g. Website Redesign Sync)"
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
                        <span>Stop ({formatRecTimer(recordSeconds)})</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        <span>Record</span>
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
                    <span>AI Meeting Assistant is generating MoM, decisions &amp; tasks...</span>
                  </div>
                )}

                {/* Paste Transcript / Meeting Notes */}
                <form onSubmit={handleSummarizeText} className="space-y-2.5 pt-2 border-t border-slate-100">
                  <textarea
                    rows={3}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Paste discussion notes or transcript (e.g. Discussed website redesign progress. Approved new homepage design. Marketing Team will complete mobile optimization by November 20.)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white resize-none"
                  />
                  <button
                    type="submit"
                    disabled={processing || !notesInput.trim()}
                    className="w-full min-h-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI MoM &amp; Tasks</span>
                  </button>
                </form>
              </div>

              {/* Saved Meetings List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Meeting Minutes History</h2>
                  <span className="text-xs text-slate-500 tabular-nums">{completedMeetings.length}</span>
                </div>

                {completedMeetings.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    No meetings recorded yet. Start a voice/video call or record notes above.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {completedMeetings.map((m) => {
                      const isSelected = activeDetail?.id === m.id;
                      const taskCount = m.tasks?.length || m.actionItems?.length || 0;
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
                              {taskCount > 0 ? ` · ${taskCount} task${taskCount > 1 ? 's' : ''}` : ''}
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

            {/* Right Column: Selected Meeting AI Assistant MoM Report */}
            <div className="lg:col-span-7">
              {activeDetail ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6">
                  {justRecordedId && activeDetail.id === justRecordedId && (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>AI Meeting Minutes (MoM) generated and ready to download!</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadTxt(activeDetail)}
                        className="min-h-[36px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download (.txt)</span>
                      </button>
                    </div>
                  )}

                  {sharedChatId === activeDetail.id && (
                    <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between gap-2 text-xs text-sky-900">
                      <span className="font-semibold">
                        Meeting Minutes posted to #{defaultChannelName}!
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('chat')}
                        className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                      >
                        View in Chat
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{activeDetail.title}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Organized by {activeDetail.organizerName} · {activeDetail.scheduledTime || 'Completed'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleShareMomToChat(activeDetail)}
                        disabled={sharingToChat}
                        className="min-h-[38px] px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                        title={`Post MoM summary to #${defaultChannelName}`}
                      >
                        {sharingToChat ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 text-sky-600" />
                        )}
                        <span>Post to #{defaultChannelName}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(activeDetail)}
                        className="min-h-[38px] px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                      >
                        {copiedId === activeDetail.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedId === activeDetail.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadTxt(activeDetail)}
                        className="min-h-[38px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download (.txt)</span>
                      </button>

                      {(activeDetail.organizerId === firebaseUser?.uid ||
                        currentProfile?.role === 'admin') && (
                        <button
                          type="button"
                          onClick={() => {
                            deleteMeetingRecord(activeDetail.id);
                            setSelectedMeeting(null);
                          }}
                          className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center"
                          title="Delete meeting record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Meeting Summary */}
                  {activeDetail.aiSummary ? (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Meeting Summary
                      </h3>
                      <p className="text-sm text-slate-800 leading-relaxed">
                        {activeDetail.aiSummary}
                      </p>
                    </div>
                  ) : activeDetail.transcriptText ? (
                    <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-xs text-sky-900">
                        Run the AI Meeting Assistant to extract discussion points, decisions, assigned tasks, deadlines, and MoM:
                      </p>
                      <button
                        type="button"
                        disabled={processing}
                        onClick={() => handleGenerateMinutesForDetail(activeDetail)}
                        className="min-h-[38px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{processing ? 'Analyzing...' : 'Generate AI MoM'}</span>
                      </button>
                    </div>
                  ) : null}

                  {/* Important Discussion Points */}
                  {activeDetail.discussionPoints && activeDetail.discussionPoints.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Important Discussion Points
                      </h3>
                      <ul className="space-y-1.5">
                        {activeDetail.discussionPoints.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                            <MessageSquare className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                            <span>
                              <span className="font-semibold text-slate-900">Discussion:</span> {point}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Decisions */}
                  {activeDetail.decisions && activeDetail.decisions.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Decisions
                      </h3>
                      <ul className="space-y-1.5">
                        {activeDetail.decisions.map((d, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>
                              <span className="font-semibold text-slate-900">Decision:</span> {d}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Structured Action Items (Task + Assigned To + Deadline) */}
                  {activeDetail.tasks && activeDetail.tasks.length > 0 ? (
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Action Items &amp; Responsibilities
                      </h3>
                      <div className="space-y-2">
                        {activeDetail.tasks.map((t, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3"
                          >
                            <button
                              type="button"
                              onClick={() => toggleMeetingTask(activeDetail.id, idx)}
                              className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                t.completed
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 bg-white hover:border-sky-600'
                              }`}
                              aria-label={t.completed ? 'Mark task incomplete' : 'Mark task complete'}
                            >
                              {t.completed && <Check className="w-3.5 h-3.5" />}
                            </button>

                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div
                                className={`text-sm font-semibold ${
                                  t.completed ? 'line-through text-slate-400' : 'text-slate-900'
                                }`}
                              >
                                Task: {t.task}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Assigned to: {t.assignedTo}
                                </span>
                                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                                  <Calendar className="w-3.5 h-3.5" />
                                  Deadline: {t.deadline}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : activeDetail.actionItems && activeDetail.actionItems.length > 0 ? (
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
                  ) : null}

                  {/* Formal Meeting Minutes (MoM) */}
                  {activeDetail.momText && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Minutes of Meeting (MoM)
                      </h3>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {activeDetail.momText}
                      </div>
                    </div>
                  )}

                  {/* Full Transcript */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      Full Transcript
                    </h3>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                      {activeDetail.transcriptText || 'No transcript text available.'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-2">
                  <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">No meeting selected</p>
                  <p className="text-xs">
                    Start a voice or video call, record audio, or paste meeting notes on the left to automatically generate your Meeting Minutes (MoM) and action tracker.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
