import React, { useEffect, useState } from 'react';
import { PhoneIncoming, PhoneOff, Video, Bell } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { sounds } from '../../utils/audio';

export const IncomingCallOverlay: React.FC = () => {
  const { incomingCall, teamUsers, answerIncomingCall, declineIncomingCall } = useApp();
  const [answering, setAnswering] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'denied'
  );

  useEffect(() => {
    if (!incomingCall) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(0);
      }
      return;
    }

    setAnswering(false);
    const prevTitle = document.title;
    let toggle = false;

    const ringOnce = () => {
      try {
        sounds.playIncomingRing();
      } catch {
        // Ignore if browser audio not yet unlocked
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([300, 150, 300]);
        } catch {
          // Ignore vibrate errors
        }
      }
      toggle = !toggle;
      document.title = toggle
        ? `Incoming Call from ${incomingCall.organizerName} — SphereCall`
        : prevTitle;
    };

    ringOnce();
    const interval = setInterval(ringOnce, 2200);

    let notification: Notification | null = null;
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        notification = new Notification(`Incoming call from ${incomingCall.organizerName}`, {
          body: incomingCall.title || 'Tap to answer on SphereCall',
          icon: '/pwa-192x192.png',
          tag: incomingCall.id,
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus();
          answerIncomingCall(incomingCall);
          notification?.close();
        };
      } catch {
        // Ignore notification errors in restricted contexts
      }
    }

    return () => {
      clearInterval(interval);
      document.title = prevTitle;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch {
          // Ignore
        }
      }
      notification?.close();
    };
  }, [incomingCall?.id]);

  if (!incomingCall) return null;

  const caller = teamUsers.find((u) => u.uid === incomingCall.organizerId);
  const callerName = caller?.displayName || incomingCall.organizerName || 'Teammate';
  const initials = callerName.slice(0, 2).toUpperCase();

  const requestAlerts = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      } catch {
        // Ignore
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 text-white text-center space-y-6 shadow-2xl">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative flex items-center justify-center">
            <span className="absolute w-24 h-24 rounded-full bg-emerald-500/25 animate-ping" />
            <span className="absolute w-24 h-24 rounded-full border-2 border-emerald-400/50" />
            {caller?.avatar ? (
              <img
                src={caller.avatar}
                alt={callerName}
                referrerPolicy="no-referrer"
                className="relative w-20 h-20 rounded-full object-cover border-2 border-white/20"
              />
            ) : (
              <div className="relative w-20 h-20 rounded-full bg-sky-600 text-white text-2xl font-bold flex items-center justify-center border-2 border-white/20">
                {initials}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Video className="w-3.5 h-3.5" />
              <span>Incoming Call · Ringing</span>
            </div>
            <h2 className="text-xl font-bold text-white">{callerName}</h2>
            <p className="text-xs text-slate-300 truncate max-w-xs">{incomingCall.title}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            disabled={answering}
            onClick={() => declineIncomingCall(incomingCall)}
            className="min-h-[52px] px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <PhoneOff className="w-5 h-5" />
            <span>Decline</span>
          </button>

          <button
            type="button"
            disabled={answering}
            onClick={async () => {
              setAnswering(true);
              try {
                await answerIncomingCall(incomingCall);
              } finally {
                setAnswering(false);
              }
            }}
            className="min-h-[52px] px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <PhoneIncoming className="w-5 h-5" />
            <span>{answering ? 'Joining...' : 'Answer'}</span>
          </button>
        </div>

        {notifPermission === 'default' && (
          <button
            type="button"
            onClick={requestAlerts}
            className="w-full py-1.5 text-[11px] text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Enable desktop/mobile call alerts</span>
          </button>
        )}
      </div>
    </div>
  );
};
