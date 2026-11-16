import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { MeetingRecord } from '../types';
import { parseScheduledMeeting } from '../utils/calendar';
import { sounds } from '../utils/audio';

const LEAD_MINUTES = 5;
const LEAD_MS = LEAD_MINUTES * 60 * 1000;
const POST_START_GRACE_MS = 10 * 60 * 1000;

const STORAGE_REMINDERS_ENABLED = 'spherecall_meeting_reminders_enabled';
const STORAGE_SOUND_ENABLED = 'spherecall_meeting_reminder_sound';
const STORAGE_NOTIFIED_KEYS = 'spherecall_notified_meeting_keys_v1';

export interface ActiveMeetingReminder {
  key: string;
  meeting: MeetingRecord;
  startMs: number;
  displayDate: string;
  displayTime: string;
  isVoice: boolean;
  isTest?: boolean;
}

export type BrowserNotifPermission = NotificationPermission | 'unsupported';

interface NotificationContextType {
  permission: BrowserNotifPermission;
  remindersEnabled: boolean;
  soundEnabled: boolean;
  activeReminders: ActiveMeetingReminder[];
  nowMs: number;
  toggleRemindersEnabled: () => void;
  toggleSoundEnabled: () => void;
  requestNotificationPermission: () => Promise<BrowserNotifPermission>;
  dismissReminder: (key: string) => void;
  sendTestReminder: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function getInitialPermission(): BrowserNotifPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function loadNotifiedKeys(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_NOTIFIED_KEYS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pruned: Record<string, number> = {};
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && ts > cutoff) {
        pruned[k] = ts;
      }
    }
    return pruned;
  } catch {
    return {};
  }
}

function saveNotifiedKeys(map: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_NOTIFIED_KEYS, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

async function dispatchBrowserPushNotification(params: {
  title: string;
  body: string;
  tag: string;
  meetingId?: string;
  onClickFallback?: () => void;
}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const options: NotificationOptions & {
    vibrate?: number[];
    actions?: Array<{ action: string; title: string }>;
  } = {
    body: params.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: params.tag,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      meetingId: params.meetingId || null,
      url: params.meetingId
        ? `/?joinMeeting=${encodeURIComponent(params.meetingId)}`
        : '/?tab=calendar',
    },
  };

  if (params.meetingId) {
    options.actions = [
      { action: 'join', title: 'Join Meeting' },
      { action: 'calendar', title: 'View Calendar' },
    ];
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(params.title, options);
        return;
      }
    }
  } catch {
    // Fallback to standard Notification API below
  }

  try {
    const { actions: _actions, vibrate: _vibrate, ...plainOptions } = options;
    const n = new Notification(params.title, plainOptions);
    n.onclick = () => {
      window.focus();
      params.onClickFallback?.();
      n.close();
    };
  } catch {
    // Ignore restricted notification context errors
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    firebaseUser,
    meetings,
    activeMeeting,
    joinVideoCall,
    setActiveTab,
  } = useApp();

  const [permission, setPermission] = useState<BrowserNotifPermission>(getInitialPermission);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_REMINDERS_ENABLED) !== 'false';
    } catch {
      return true;
    }
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_SOUND_ENABLED) !== 'false';
    } catch {
      return true;
    }
  });
  const [activeReminders, setActiveReminders] = useState<ActiveMeetingReminder[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const notifiedMapRef = useRef<Record<string, number>>(loadNotifiedKeys());
  const dismissedKeysRef = useRef<Set<string>>(new Set());
  const pendingJoinMeetingIdRef = useRef<string | null>(null);
  const meetingsRef = useRef<MeetingRecord[]>(meetings);
  meetingsRef.current = meetings;

  // Keep permission state synced
  useEffect(() => {
    setPermission(getInitialPermission());
  }, []);

  // Resolve queued joinMeeting once meetings load
  useEffect(() => {
    const pendingId = pendingJoinMeetingIdRef.current;
    if (!pendingId || meetings.length === 0) return;
    const target = meetings.find((m) => m.id === pendingId);
    if (target) {
      pendingJoinMeetingIdRef.current = null;
      if (target.status !== 'completed') {
        const isVoice = target.title.toLowerCase().includes('voice');
        joinVideoCall(target, isVoice ? 'voice' : 'video');
      } else {
        setActiveTab('calendar');
      }
    }
  }, [meetings, joinVideoCall, setActiveTab]);

  // Listen to Service Worker notification clicks and URL deep links
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const handleMeetingAction = (action: string, meetingId: string | null) => {
      if (action === 'join' && meetingId) {
        const target = meetingsRef.current.find((m) => m.id === meetingId);
        if (target && target.status !== 'completed') {
          const isVoice = target.title.toLowerCase().includes('voice');
          joinVideoCall(target, isVoice ? 'voice' : 'video');
          return;
        }
        if (meetingsRef.current.length === 0) {
          pendingJoinMeetingIdRef.current = meetingId;
          setActiveTab('calendar');
          return;
        }
      }
      setActiveTab('calendar');
    };

    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('joinMeeting');
    const tabParam = params.get('tab');
    if (joinId) {
      handleMeetingAction('join', joinId);
      window.history.replaceState({}, '', '/');
    } else if (tabParam === 'calendar') {
      setActiveTab('calendar');
      window.history.replaceState({}, '', '/');
    }

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MEETING_NOTIFICATION_ACTION') {
        handleMeetingAction(event.data.action || 'open', event.data.meetingId || null);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, [firebaseUser?.uid, firebaseUser?.emailVerified]);

  const requestNotificationPermission = useCallback(async (): Promise<BrowserNotifPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      const current = Notification.permission;
      setPermission(current);
      return current;
    }
  }, []);

  const toggleRemindersEnabled = useCallback(() => {
    setRemindersEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_REMINDERS_ENABLED, String(next));
      } catch {
        // Ignore
      }
      if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
          .then((res) => setPermission(res))
          .catch(() => {});
      }
      return next;
    });
  }, []);

  const toggleSoundEnabled = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_SOUND_ENABLED, String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const dismissReminder = useCallback((key: string) => {
    dismissedKeysRef.current.add(key);
    setActiveReminders((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const triggerAlertEffects = useCallback(
    (reminder: ActiveMeetingReminder) => {
      if (soundEnabled) {
        try {
          sounds.playMeetingReminder();
        } catch {
          // Ignore if browser audio not yet unlocked
        }
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {
          // Ignore
        }
      }

      const minutesLeft = Math.max(
        1,
        Math.ceil((reminder.startMs - Date.now()) / 60000)
      );
      const timePhrase = reminder.isTest
        ? 'in 5 minutes (Test Alert)'
        : reminder.startMs <= Date.now()
          ? 'now'
          : `in ${minutesLeft} min`;

      dispatchBrowserPushNotification({
        title: `Meeting starts ${timePhrase}: ${reminder.meeting.title}`,
        body: `${reminder.isVoice ? 'Voice Call' : 'Video Meeting'} at ${reminder.displayTime} · Organizer: ${reminder.meeting.organizerName}`,
        tag: `meeting-reminder-${reminder.key}`,
        meetingId: reminder.isTest ? undefined : reminder.meeting.id,
        onClickFallback: () => {
          if (reminder.isTest) {
            setActiveTab('calendar');
          } else {
            joinVideoCall(reminder.meeting, reminder.isVoice ? 'voice' : 'video');
          }
        },
      });
    },
    [soundEnabled, joinVideoCall, setActiveTab]
  );

  // Core 10-second scheduler checking for upcoming meetings within 5 minutes
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !remindersEnabled) {
      setActiveReminders((prev) => prev.filter((r) => r.isTest));
      return;
    }

    const evaluateMeetings = () => {
      const currentMs = Date.now();
      setNowMs(currentMs);

      const newlyTriggered: ActiveMeetingReminder[] = [];
      const validUpcomingReminders: ActiveMeetingReminder[] = [];

      for (const meeting of meetings) {
        if (meeting.status !== 'upcoming') continue;
        if (activeMeeting?.id === meeting.id) continue;

        const isInvited =
          meeting.isPublic ||
          meeting.organizerId === firebaseUser.uid ||
          meeting.participantIds.includes(firebaseUser.uid);
        if (!isInvited) continue;

        const parsed = parseScheduledMeeting(meeting.scheduledTime);
        if (!parsed) continue;

        const startMs = parsed.sortValue;
        const msUntilStart = startMs - currentMs;
        const msSinceStart = currentMs - startMs;

        // Alert window: 5 minutes before start through 10 minutes grace window if user opens app right at start
        const isInWindow = msUntilStart <= LEAD_MS && msSinceStart <= POST_START_GRACE_MS;
        if (!isInWindow) continue;

        const key = `${meeting.id}__${meeting.scheduledTime || parsed.dateKey + parsed.time24}`;
        if (dismissedKeysRef.current.has(key)) continue;

        const isVoice = meeting.title.toLowerCase().includes('voice');
        const reminder: ActiveMeetingReminder = {
          key,
          meeting,
          startMs,
          displayDate: parsed.displayDate,
          displayTime: parsed.displayTime,
          isVoice,
        };

        validUpcomingReminders.push(reminder);

        if (!notifiedMapRef.current[key]) {
          notifiedMapRef.current[key] = currentMs;
          saveNotifiedKeys(notifiedMapRef.current);
          newlyTriggered.push(reminder);
        }
      }

      setActiveReminders((prev) => {
        const testReminders = prev.filter((r) => r.isTest && r.startMs - currentMs > -60000);
        const combined = [...testReminders, ...validUpcomingReminders];
        combined.sort((a, b) => a.startMs - b.startMs);
        return combined;
      });

      if (newlyTriggered.length > 0) {
        newlyTriggered.forEach((rem) => triggerAlertEffects(rem));
      }
    };

    evaluateMeetings();
    const timer = setInterval(evaluateMeetings, 10000);
    return () => clearInterval(timer);
  }, [
    firebaseUser?.uid,
    firebaseUser?.emailVerified,
    meetings,
    activeMeeting?.id,
    remindersEnabled,
    triggerAlertEffects,
  ]);

  const sendTestReminder = useCallback(async () => {
    let currentPerm = permission;
    if (currentPerm === 'default') {
      currentPerm = await requestNotificationPermission();
    }

    const startMs = Date.now() + LEAD_MS;
    const testKey = `test-${Date.now()}`;
    const testMeeting: MeetingRecord = {
      id: testKey,
      title: 'Team Sync (5-Min Alert Preview)',
      organizerId: firebaseUser?.uid || 'test',
      organizerName: firebaseUser?.displayName || 'SphereCall Calendar',
      status: 'upcoming',
      scheduledTime: 'In 5 minutes',
      isPublic: true,
      participantIds: firebaseUser ? [firebaseUser.uid] : [],
    };

    const testReminder: ActiveMeetingReminder = {
      key: testKey,
      meeting: testMeeting,
      startMs,
      displayDate: 'Today',
      displayTime: new Date(startMs).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
      isVoice: false,
      isTest: true,
    };

    setActiveReminders((prev) => [testReminder, ...prev.filter((r) => !r.isTest)]);
    triggerAlertEffects(testReminder);
  }, [permission, requestNotificationPermission, firebaseUser, triggerAlertEffects]);

  const value = useMemo<NotificationContextType>(
    () => ({
      permission,
      remindersEnabled,
      soundEnabled,
      activeReminders,
      nowMs,
      toggleRemindersEnabled,
      toggleSoundEnabled,
      requestNotificationPermission,
      dismissReminder,
      sendTestReminder,
    }),
    [
      permission,
      remindersEnabled,
      soundEnabled,
      activeReminders,
      nowMs,
      toggleRemindersEnabled,
      toggleSoundEnabled,
      requestNotificationPermission,
      dismissReminder,
      sendTestReminder,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export function useMeetingNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useMeetingNotifications must be used inside NotificationProvider');
  }
  return ctx;
}
