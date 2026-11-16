import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Circle,
  Users,
  Subtitles,
  Loader2,
  UserPlus,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AddMemberModal } from '../common/AddMemberModal';
import { UserStatusBadge } from '../common/UserStatusBadge';
import { sounds } from '../../utils/audio';
import { useWebRTCCall } from '../../hooks/useWebRTCCall';
import { getEffectiveUserStatus, sortUsersByPresence } from '../../utils/presence';

const AUTO_TRANSCRIBE_STORAGE_KEY = 'spherecall_auto_transcribe';

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read call audio recording.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

const RemoteParticipantTile: React.FC<{
  displayName: string;
  avatar?: string;
  stream?: MediaStream;
}> = ({ displayName, avatar, stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!stream) {
      setHasVideo(false);
      return;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    const checkTracks = () => {
      const videoTracks = stream.getVideoTracks();
      setHasVideo(videoTracks.some((t) => t.readyState === 'live' && t.enabled));
    };
    checkTracks();
    stream.addEventListener('addtrack', checkTracks);
    stream.addEventListener('removetrack', checkTracks);
    return () => {
      stream.removeEventListener('addtrack', checkTracks);
      stream.removeEventListener('removetrack', checkTracks);
    };
  }, [stream]);

  return (
    <div className="aspect-video bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 relative flex items-center justify-center">
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
        />
      )}
      {!hasVideo && (
        <div className="flex flex-col items-center gap-2">
          {avatar ? (
            <img
              src={avatar}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border-2 border-slate-600"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-xl font-bold">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-semibold">{displayName}</span>
          <span className="text-[11px] text-slate-400">
            {stream ? 'Connected (Audio)' : 'Ringing...'}
          </span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-xs font-medium flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${stream ? 'bg-emerald-400' : 'bg-amber-400'}`}
        />
        <span>{displayName}</span>
      </div>
    </div>
  );
};

export const SimpleVideoView: React.FC = () => {
  const {
    firebaseUser,
    currentProfile,
    teamUsers,
    meetings,
    activeMeeting,
    startVideoCall,
    joinVideoCall,
    addCallParticipants,
    endVideoCall,
    saveMeetingTranscript,
    setActiveTab,
    setErrorBanner,
    presenceNow,
  } = useApp();

  const [callTitle, setCallTitle] = useState('');
  const [selectedCallMemberIds, setSelectedCallMemberIds] = useState<string[]>([]);
  const [showLauncherPicker, setShowLauncherPicker] = useState(false);
  const [addPeopleModalOpen, setAddPeopleModalOpen] = useState(false);
  const [editingCallIds, setEditingCallIds] = useState<string[]>([]);
  const [savingPeople, setSavingPeople] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [autoTranscribeEnabled, setAutoTranscribeEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_TRANSCRIBE_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [isRecording, setIsRecording] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [callSeconds, setCallSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef<string>('audio/webm');
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<any>(null);
  const keepSpeechRunningRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mixerDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const connectedTrackIdsRef = useRef<Set<string>>(new Set());
  const liveTranscriptRef = useRef<string>('');
  const endingLocallyRef = useRef<boolean>(false);
  const activeCallMetaRef = useRef<{
    id: string;
    title: string;
    participantNames: string[];
  } | null>(null);

  const liveCalls = meetings.filter((m) => m.status === 'live');
  const canRecord = currentProfile?.canRecordMeetings !== false;

  const { remoteStreams } = useWebRTCCall({
    meetingId: activeMeeting?.id || null,
    myUid: firebaseUser?.uid || null,
    participantIds: activeMeeting?.participantIds || [],
    localStream,
  });

  useEffect(() => {
    liveTranscriptRef.current = liveTranscript;
  }, [liveTranscript]);

  useEffect(() => {
    if (!activeMeeting) {
      activeCallMetaRef.current = null;
      return;
    }
    const participantNames = activeMeeting.participantIds
      .map((uid) => teamUsers.find((u) => u.uid === uid)?.displayName)
      .filter((n): n is string => Boolean(n));
    activeCallMetaRef.current = {
      id: activeMeeting.id,
      title: activeMeeting.title,
      participantNames,
    };
  }, [activeMeeting?.id, activeMeeting?.title, activeMeeting?.participantIds.length, teamUsers]);

  const toggleAutoTranscribePreference = () => {
    const next = !autoTranscribeEnabled;
    setAutoTranscribeEnabled(next);
    try {
      localStorage.setItem(AUTO_TRANSCRIBE_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage errors
    }
  };

  // Call timer
  useEffect(() => {
    if (!activeMeeting) {
      setCallSeconds(0);
      return;
    }
    const interval = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [activeMeeting?.id]);

  // Play gentle outgoing ringback tone while waiting for called member to answer
  useEffect(() => {
    if (!activeMeeting || !firebaseUser) return;
    const isOrganizer = activeMeeting.organizerId === firebaseUser.uid;
    const hasOtherParticipants = activeMeeting.participantIds.some((id) => id !== firebaseUser.uid);
    const hasConnectedPeer = Object.keys(remoteStreams).length > 0;

    if (!isOrganizer || !hasOtherParticipants || hasConnectedPeer || callSeconds > 30) {
      return;
    }

    sounds.playOutgoingRing();
    const interval = setInterval(() => {
      sounds.playOutgoingRing();
    }, 2600);
    return () => clearInterval(interval);
  }, [
    activeMeeting?.id,
    activeMeeting?.participantIds.length,
    Object.keys(remoteStreams).length,
    callSeconds > 30,
  ]);

  const connectStreamAudioToMixer = (stream: MediaStream | null) => {
    const ctx = audioCtxRef.current;
    const dest = mixerDestRef.current;
    if (!ctx || !dest || !stream) return;

    const audioTracks = stream.getAudioTracks();
    const newTracks = audioTracks.filter((t) => !connectedTrackIdsRef.current.has(t.id));
    if (newTracks.length === 0) return;

    try {
      const subStream = new MediaStream(newTracks);
      const source = ctx.createMediaStreamSource(subStream);
      source.connect(dest);
      newTracks.forEach((t) => connectedTrackIdsRef.current.add(t.id));
    } catch {
      // Ignore streams that cannot be attached
    }
  };

  const stopRecordingCapture = async (): Promise<Blob | null> => {
    keepSpeechRunningRef.current = false;
    try {
      speechRecRef.current?.stop();
    } catch {
      // Ignore
    }
    speechRecRef.current = null;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1500);
        const prevOnStop = recorder.onstop;
        recorder.onstop = (ev) => {
          clearTimeout(timeout);
          if (typeof prevOnStop === 'function') {
            prevOnStop.call(recorder, ev);
          }
          resolve();
        };
        try {
          recorder.stop();
        } catch {
          clearTimeout(timeout);
          resolve();
        }
      });
    }
    recorderRef.current = null;
    setIsRecording(false);

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      mixerDestRef.current = null;
      connectedTrackIdsRef.current.clear();
    }

    if (audioChunksRef.current.length === 0) return null;
    const blob = new Blob(audioChunksRef.current, {
      type: recorderMimeRef.current || 'audio/webm',
    });
    return blob.size > 512 ? blob : null;
  };

  const startRecordingCapture = () => {
    if (!canRecord || isRecording) return;

    audioChunksRef.current = [];
    setIsRecording(true);

    // 1. Mix local + remote audio tracks via Web Audio API so BOTH sides of any call are transcribed
    if (typeof MediaRecorder !== 'undefined') {
      try {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          const dest = ctx.createMediaStreamDestination();
          audioCtxRef.current = ctx;
          mixerDestRef.current = dest;
          connectedTrackIdsRef.current.clear();

          connectStreamAudioToMixer(localStreamRef.current);
          Object.values(remoteStreams).forEach((remote) => connectStreamAudioToMixer(remote));

          const mime = pickSupportedAudioMimeType();
          recorderMimeRef.current = mime || 'audio/webm';
          const recorder = mime
            ? new MediaRecorder(dest.stream, { mimeType: mime })
            : new MediaRecorder(dest.stream);

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };
          recorder.start(1000);
          recorderRef.current = recorder;
        }
      } catch {
        // Fallback: record local stream directly if Web Audio mixer unavailable
        if (localStreamRef.current) {
          const audioOnly = new MediaStream(localStreamRef.current.getAudioTracks());
          if (audioOnly.getAudioTracks().length > 0) {
            try {
              const mime = pickSupportedAudioMimeType();
              recorderMimeRef.current = mime || 'audio/webm';
              const recorder = mime
                ? new MediaRecorder(audioOnly, { mimeType: mime })
                : new MediaRecorder(audioOnly);
              recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
              };
              recorder.start(1000);
              recorderRef.current = recorder;
            } catch {
              // SpeechRecognition fallback continues below
            }
          }
        }
      }
    }

    // 2. Live continuous browser SpeechRecognition captions (auto-restarts during call)
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      keepSpeechRunningRef.current = true;
      const startSpeech = () => {
        if (!keepSpeechRunningRef.current) return;
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (event: any) => {
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                finalText += event.results[i][0].transcript + ' ';
              }
            }
            if (finalText.trim()) {
              const speaker = currentProfile?.displayName || 'Speaker';
              setLiveTranscript((prev) =>
                `${prev}${prev ? '\n' : ''}${speaker}: ${finalText.trim()}`
              );
            }
          };
          rec.onend = () => {
            if (keepSpeechRunningRef.current) {
              setTimeout(startSpeech, 400);
            }
          };
          rec.onerror = () => {
            // Stop retry loop on fatal permission errors
          };
          rec.start();
          speechRecRef.current = rec;
        } catch {
          // Ignore if SpeechRecognition unavailable
        }
      };
      startSpeech();
    }
  };

  const transcribeAndSaveCall = async (params: {
    meetingId: string;
    meetingTitle: string;
    participantNames: string[];
    audioBlob: Blob | null;
    liveNotes: string;
  }) => {
    const { meetingId, meetingTitle, participantNames, audioBlob, liveNotes } = params;
    const trimmedNotes = liveNotes.trim();
    if (!audioBlob && !trimmedNotes) return false;

    if (audioBlob) {
      const base64 = await readBlobAsDataUrl(audioBlob);
      const resp = await fetch('/api/ai/transcribe-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: audioBlob.type || 'audio/webm',
          meetingTitle,
          participantNames,
          liveNotes: trimmedNotes,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        await saveMeetingTranscript({
          meetingId,
          title: meetingTitle,
          transcriptText: data.transcriptText || trimmedNotes,
          aiSummary: data.summary || '',
          decisions: data.decisions || [],
          actionItems: data.actionItems || [],
        });
        return true;
      }
      const errData = await resp.json().catch(() => ({}));
      if (!trimmedNotes) {
        throw new Error(errData?.error || 'AI transcription failed.');
      }
    }

    if (trimmedNotes) {
      const resp = await fetch('/api/ai/meeting-minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingTitle,
          transcriptText: trimmedNotes,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        await saveMeetingTranscript({
          meetingId,
          title: meetingTitle,
          transcriptText: trimmedNotes,
          aiSummary: data.summary || '',
          decisions: data.decisions || [],
          actionItems: data.actionItems || [],
        });
        return true;
      }
    }

    return false;
  };

  // Wire any newly connected remote caller audio tracks into the call mixer dynamically
  useEffect(() => {
    if (!isRecording) return;
    Object.values(remoteStreams).forEach((remote) => {
      connectStreamAudioToMixer(remote);
    });
  }, [remoteStreams, isRecording]);

  // Acquire camera + mic when joining/starting a call, and auto-start AI call transcription
  useEffect(() => {
    if (!activeMeeting) return;
    let cancelled = false;
    endingLocallyRef.current = false;
    setLiveTranscript('');
    audioChunksRef.current = [];

    async function initMedia() {
      setMediaError(null);
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStreamRef.current = stream;
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          if (autoTranscribeEnabled && canRecord) {
            startRecordingCapture();
          }
        }
      } catch {
        setMediaError('Camera or microphone permission unavailable. Audio/video preview is disabled.');
      }
    }

    initMedia();

    return () => {
      cancelled = true;
      const meta = activeCallMetaRef.current;
      const capturedNotes = liveTranscriptRef.current;
      const wasEndingLocally = endingLocallyRef.current;

      stopRecordingCapture()
        .then(async (audioBlob) => {
          if (!wasEndingLocally && meta && (audioBlob || capturedNotes.trim())) {
            try {
              await transcribeAndSaveCall({
                meetingId: meta.id,
                meetingTitle: meta.title,
                participantNames: meta.participantNames,
                audioBlob,
                liveNotes: capturedNotes,
              });
            } catch {
              // Background auto-save when remote peer ended call
            }
          }
        })
        .catch(() => {});

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    };
  }, [activeMeeting?.id]);

  // Attach stream if video element mounts later
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isCameraOn, activeMeeting]);

  const toggleMic = () => {
    const next = !isMuted;
    setIsMuted(next);
    sounds.playMuteClick(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const toggleCamera = () => {
    const next = !isCameraOn;
    setIsCameraOn(next);
    sounds.playMuteClick(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      setTimeout(() => {
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }
      }, 50);
      stream.getVideoTracks()[0].onended = () => {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
      };
    } catch {
      // User cancelled screen share
    }
  };

  const toggleRecordingAndTranscript = async () => {
    if (isRecording) {
      keepSpeechRunningRef.current = false;
      try {
        speechRecRef.current?.stop();
      } catch {
        // Ignore
      }
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        try {
          recorderRef.current.pause();
        } catch {
          // Ignore if pause unsupported
        }
      }
      setIsRecording(false);
      return;
    }

    if (recorderRef.current && recorderRef.current.state === 'paused') {
      try {
        recorderRef.current.resume();
        setIsRecording(true);
        return;
      } catch {
        // Fall through to fresh capture
      }
    }
    startRecordingCapture();
  };

  const handleEndCall = async () => {
    if (!activeMeeting || savingTranscript) return;
    endingLocallyRef.current = true;
    const meetingId = activeMeeting.id;
    const meetingTitle = activeMeeting.title;
    const participantNames = activeMeeting.participantIds
      .map((uid) => teamUsers.find((u) => u.uid === uid)?.displayName)
      .filter((n): n is string => Boolean(n));

    setSavingTranscript(true);
    try {
      const audioBlob = await stopRecordingCapture();
      const notes = liveTranscriptRef.current;

      if (audioBlob || notes.trim()) {
        try {
          const saved = await transcribeAndSaveCall({
            meetingId,
            meetingTitle,
            participantNames,
            audioBlob,
            liveNotes: notes,
          });
          if (!saved) {
            await endVideoCall(meetingId, notes.trim() || undefined);
          }
        } catch (err) {
          setErrorBanner(
            err instanceof Error ? err.message : 'Could not auto-transcribe call recording.'
          );
          await endVideoCall(meetingId, notes.trim() || undefined);
        }
        setLiveTranscript('');
        setActiveTab('transcripts');
        return;
      }

      await endVideoCall(meetingId);
    } finally {
      setSavingTranscript(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // No active call -> Simple Call Launcher + Live Calls List
  if (!activeMeeting) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1.5">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Video Call</h1>
                <p className="text-sm text-slate-500">
                  Start an instant call with your team. AI automatically transcribes the conversation and generates minutes when the call ends.
                </p>
              </div>

              {canRecord && (
                <button
                  type="button"
                  onClick={toggleAutoTranscribePreference}
                  className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 ${
                    autoTranscribeEnabled
                      ? 'bg-sky-50 border-sky-200 text-sky-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                  title="Automatically record and transcribe all calls with AI"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${autoTranscribeEnabled ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span>Auto-Transcript: {autoTranscribeEnabled ? 'ON' : 'OFF'}</span>
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={callTitle}
                onChange={(e) => setCallTitle(e.target.value)}
                placeholder="Call title (optional, e.g. Morning Standup)"
                className="flex-1 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowLauncherPicker(!showLauncherPicker)}
                className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 ${
                  selectedCallMemberIds.length > 0
                    ? 'border-sky-600 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {selectedCallMemberIds.length > 0
                    ? `People (${selectedCallMemberIds.length})`
                    : 'Add People'}
                </span>
              </button>
              <button
                onClick={() => {
                  startVideoCall(
                    callTitle.trim() || undefined,
                    selectedCallMemberIds.length > 0 ? selectedCallMemberIds : undefined
                  );
                  setCallTitle('');
                  setSelectedCallMemberIds([]);
                  setShowLauncherPicker(false);
                }}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0"
              >
                <Video className="w-4 h-4" />
                <span>Start Video Call</span>
              </button>
            </div>

            {showLauncherPicker && (
              <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    Select team members for this call
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddMemberOpen(true)}
                    className="text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Invite New Member</span>
                  </button>
                </div>
                {teamUsers.filter((u) => u.uid !== firebaseUser?.uid).length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No other teammates signed up yet. Click Invite New Member to add someone.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {sortUsersByPresence(
                      teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
                      firebaseUser?.uid,
                      presenceNow
                    ).map((u) => {
                      const checked = selectedCallMemberIds.includes(u.uid);
                      const effectiveStatus = getEffectiveUserStatus(
                        u,
                        firebaseUser?.uid,
                        presenceNow
                      );
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() =>
                            setSelectedCallMemberIds((prev) =>
                              prev.includes(u.uid)
                                ? prev.filter((id) => id !== u.uid)
                                : [...prev, u.uid]
                            )
                          }
                          className={`min-h-[42px] px-3 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                            checked
                              ? 'bg-white border-sky-600 text-sky-900'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-medium truncate">{u.displayName}</span>
                            <UserStatusBadge status={effectiveStatus} compact />
                          </div>
                          {checked && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ongoing Calls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Active Team Calls</h2>
              <span className="text-xs text-slate-500 tabular-nums">{liveCalls.length} live</span>
            </div>

            {liveCalls.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No active calls right now. Start one above to invite your team.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {liveCalls.map((call) => (
                  <div
                    key={call.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {call.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        Hosted by {call.organizerName} · {call.participantIds.length} joined
                      </div>
                    </div>
                    <button
                      onClick={() => joinVideoCall(call)}
                      className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0"
                    >
                      Join Call
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <AddMemberModal isOpen={addMemberOpen} onClose={() => setAddMemberOpen(false)} />
      </div>
    );
  }

  // Active Video Call Screen
  const callParticipants = activeMeeting.participantIds
    .map((uid) => teamUsers.find((u) => u.uid === uid))
    .filter(Boolean);

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Call Top Info */}
      <div className="h-14 px-4 sm:px-6 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold truncate">{activeMeeting.title}</h2>
          <div className="text-xs text-slate-400 flex items-center gap-2 tabular-nums">
            <span>{formatTimer(callSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {Math.max(1, callParticipants.length)} in call
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {isRecording && (
            <div className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center gap-1.5 text-xs font-semibold text-rose-300">
              <Circle className="w-2.5 h-2.5 fill-rose-500 text-rose-500 animate-pulse" />
              <span className="hidden sm:inline">AI Auto-Transcript</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingCallIds(activeMeeting.participantIds || []);
              setAddPeopleModalOpen(true);
            }}
            className="min-h-[38px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4 text-sky-400" />
            <span>Add People</span>
          </button>
        </div>
      </div>

      {/* Video Stage */}
      <div className="flex-1 p-3 sm:p-6 overflow-y-auto flex flex-col gap-4 items-center justify-center relative">
        {mediaError && (
          <div className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs">
            {mediaError}
          </div>
        )}

        {isScreenSharing ? (
          <div className="w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden border border-slate-700">
            <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Local User Tile */}
            <div className="aspect-video bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 relative flex items-center justify-center">
              {isCameraOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  {currentProfile?.avatar ? (
                    <img
                      src={currentProfile.avatar}
                      alt={currentProfile.displayName}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border-2 border-slate-600"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-sky-600 flex items-center justify-center text-xl font-bold">
                      {(currentProfile?.displayName || 'Y').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs text-slate-300">Camera off</span>
                </div>
              )}
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-xs font-medium">
                {currentProfile?.displayName || 'You'} {isMuted ? '(Muted)' : ''}
              </div>
            </div>

            {/* Other Participants */}
            {callParticipants
              .filter((u) => u!.uid !== firebaseUser?.uid)
              .map((u) => (
                <RemoteParticipantTile
                  key={u!.uid}
                  displayName={u!.displayName}
                  avatar={u!.avatar}
                  stream={remoteStreams[u!.uid]}
                />
              ))}
          </div>
        )}

        {/* Live Captions */}
        {showCaptions && (
          <div className="w-full max-w-2xl bg-black/75 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 max-h-24 overflow-y-auto">
            {liveTranscript ? (
              liveTranscript.split('\n').slice(-3).join(' · ')
            ) : (
              <span className="text-slate-400">
                {isRecording
                  ? 'AI auto-transcript is listening — full transcript and meeting minutes will be saved automatically when the call ends.'
                  : 'AI transcription is paused. Tap AI Rec below to resume capturing.'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 flex items-center justify-center gap-2 sm:gap-3 shrink-0">
        <button
          onClick={toggleMic}
          className={`min-h-[48px] min-w-[48px] px-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors ${
            isMuted ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
          }`}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          onClick={toggleCamera}
          className={`min-h-[48px] min-w-[48px] px-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors ${
            !isCameraOn ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
          }`}
          aria-label={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
        >
          {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          <span className="hidden sm:inline">{isCameraOn ? 'Camera' : 'Off'}</span>
        </button>

        <button
          onClick={toggleScreenShare}
          className={`min-h-[48px] min-w-[48px] px-3.5 rounded-xl hidden sm:flex items-center justify-center gap-2 text-xs font-semibold transition-colors ${
            isScreenSharing ? 'bg-sky-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
          }`}
        >
          <MonitorUp className="w-5 h-5" />
          <span>Share</span>
        </button>

        <button
          onClick={toggleRecordingAndTranscript}
          disabled={!canRecord}
          className={`min-h-[48px] min-w-[48px] px-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
            isRecording ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
          }`}
          title={isRecording ? 'Pause AI auto-transcript' : 'Start AI auto-transcript'}
        >
          <Circle className={`w-4 h-4 ${isRecording ? 'fill-white' : 'text-rose-400'}`} />
          <span className="hidden sm:inline">{isRecording ? 'AI Rec ON' : 'AI Rec'}</span>
        </button>

        <button
          onClick={() => setShowCaptions(!showCaptions)}
          className={`min-h-[48px] min-w-[48px] rounded-xl hidden sm:flex items-center justify-center transition-colors ${
            showCaptions ? 'bg-slate-700 text-sky-400' : 'bg-slate-800 text-slate-400'
          }`}
          title="Toggle live captions"
        >
          <Subtitles className="w-5 h-5" />
        </button>

        <button
          onClick={handleEndCall}
          disabled={savingTranscript}
          className="min-h-[48px] px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
        >
          {savingTranscript ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Transcribing...</span>
            </>
          ) : (
            <>
              <PhoneOff className="w-4 h-4" />
              <span>End Call</span>
            </>
          )}
        </button>
      </div>

      {/* Add People to Active Call Modal */}
      {addPeopleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 text-slate-900">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add People to Call</h3>
              <button
                type="button"
                onClick={() => setAddPeopleModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-72 overflow-y-auto">
              {teamUsers.filter((u) => u.uid !== firebaseUser?.uid).length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  No other teammates have signed up yet. Invite a member below.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {sortUsersByPresence(
                    teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
                    firebaseUser?.uid,
                    presenceNow
                  ).map((u) => {
                    const included = editingCallIds.includes(u.uid);
                    const effectiveStatus = getEffectiveUserStatus(
                      u,
                      firebaseUser?.uid,
                      presenceNow
                    );
                    return (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() =>
                          setEditingCallIds((prev) =>
                            prev.includes(u.uid)
                              ? prev.filter((id) => id !== u.uid)
                              : [...prev, u.uid]
                          )
                        }
                        className="w-full min-h-[46px] px-3.5 py-2 flex items-center justify-between text-left hover:bg-slate-50 gap-2"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {u.displayName}
                          </span>
                          <UserStatusBadge status={effectiveStatus} compact />
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            included
                              ? 'bg-sky-600 border-sky-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {included && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="min-h-[38px] px-2.5 text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite New Member</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddPeopleModalOpen(false)}
                  className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={savingPeople}
                  onClick={async () => {
                    setSavingPeople(true);
                    try {
                      await addCallParticipants(activeMeeting.id, editingCallIds);
                      setAddPeopleModalOpen(false);
                    } finally {
                      setSavingPeople(false);
                    }
                  }}
                  className="min-h-[38px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                >
                  {savingPeople ? 'Updating...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AddMemberModal isOpen={addMemberOpen} onClose={() => setAddMemberOpen(false)} />
    </div>
  );
};
