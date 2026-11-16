import React from 'react';
import { BellRing, Calendar, Clock, Phone, Play, Video, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMeetingNotifications } from '../../context/NotificationContext';

export const MeetingReminderOverlay: React.FC = () => {
  const { joinVideoCall, setActiveTab } = useApp();
  const { activeReminders, nowMs, dismissReminder } = useMeetingNotifications();

  if (activeReminders.length === 0) return null;

  const formatCountdown = (startMs: number) => {
    const diffSec = Math.round((startMs - nowMs) / 1000);
    if (diffSec <= 0) return 'Starting now';
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    if (mins <= 0) return `Starts in ${secs}s`;
    return `Starts in ${mins}m ${String(secs).padStart(2, '0')}s`;
  };

  return (
    <div
      className="fixed top-16 right-3 left-3 sm:left-auto sm:w-96 z-50 space-y-2.5 pointer-events-none"
      aria-live="polite"
    >
      {activeReminders.slice(0, 3).map((rem) => {
        const { meeting, key, startMs, displayTime, isVoice, isTest } = rem;
        return (
          <div
            key={key}
            className="pointer-events-auto bg-slate-900 text-white border border-sky-500/40 rounded-2xl p-4 shadow-xl space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4 animate-bounce" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300 uppercase tracking-wide">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="tabular-nums">{formatCountdown(startMs)}</span>
                    {isTest && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                        Preview
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-white truncate">
                    {meeting.title}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissReminder(key)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                aria-label="Dismiss meeting reminder"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 font-medium">
                {isVoice ? (
                  <Phone className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Video className="w-3 h-3 text-sky-400" />
                )}
                <span>{isVoice ? 'Voice Call' : 'Video Meeting'}</span>
              </span>
              <span>{displayTime}</span>
              <span>·</span>
              <span className="truncate">By {meeting.organizerName}</span>
            </div>

            <div className="flex items-center gap-2">
              {!isTest && (
                <button
                  type="button"
                  onClick={() => {
                    dismissReminder(key);
                    joinVideoCall(meeting, isVoice ? 'voice' : 'video');
                  }}
                  className="flex-1 min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Join Now</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  dismissReminder(key);
                  setActiveTab('calendar');
                }}
                className="flex-1 min-h-[38px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                <span>Open Calendar</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
