import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Phone,
  Play,
  Send,
  Trash2,
  UserPlus,
  Users,
  Video,
  Check,
  X,
  Plus,
  Bell,
  BellRing,
  Globe,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMeetingNotifications } from '../../context/NotificationContext';
import { MeetingRecord } from '../../types';
import {
  CALENDAR_TIME_SLOTS,
  formatDateKey,
  formatDisplayDate,
  formatScheduledValue,
  formatTime12h,
  formatTimeDual,
  getAvailableTimeZones,
  getMonthCalendarDays,
  getTimeZoneShortName,
  parseScheduledMeeting,
} from '../../utils/calendar';
import { getEffectiveUserStatus, sortUsersByPresence } from '../../utils/presence';
import { UserStatusBadge } from '../common/UserStatusBadge';
import { AddMemberModal } from '../common/AddMemberModal';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SimpleCalendarView: React.FC = () => {
  const {
    firebaseUser,
    teamUsers,
    contacts,
    meetings,
    presenceNow,
    selectedTimezone,
    setSelectedTimezone,
    scheduleMeeting,
    rescheduleMeeting,
    shareScheduledMeetingToChat,
    joinVideoCall,
    deleteMeetingRecord,
    setActiveTab,
    setErrorBanner,
  } = useApp();

  const {
    permission: notifPermission,
    remindersEnabled,
    toggleRemindersEnabled,
    requestNotificationPermission,
    sendTestReminder,
  } = useMeetingNotifications();

  const today = new Date();
  const todayKey = formatDateKey(today, selectedTimezone);
  const timeZones = useMemo(() => getAvailableTimeZones(), []);
  const selectedTzShort = getTimeZoneShortName(selectedTimezone, presenceNow);
  const currentTimeInZone = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: selectedTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(presenceNow));
      const h = parts.find((p) => p.type === 'hour')?.value || '00';
      const m = parts.find((p) => p.type === 'minute')?.value || '00';
      return formatTimeDual(`${h === '24' ? '00' : h}:${m}`);
    } catch {
      return '';
    }
  }, [selectedTimezone, presenceNow]);

  const [viewMonth, setViewMonth] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [selectedTime, setSelectedTime] = useState<string>('10:00');
  const [slotPeriodFilter, setSlotPeriodFilter] = useState<'all' | 'am' | 'pm'>('all');
  const [meetingTitle, setMeetingTitle] = useState<string>('');
  const [meetingMode, setMeetingMode] = useState<'video' | 'voice'>('video');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastScheduled, setLastScheduled] = useState<MeetingRecord | null>(null);
  const [sharedMeetingId, setSharedMeetingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState<boolean>(false);
  const [timeConflictModal, setTimeConflictModal] = useState<{
    title: string;
    whenText: string;
  } | null>(null);

  const calendarDays = useMemo(
    () => getMonthCalendarDays(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth]
  );

  const monthLabel = useMemo(
    () =>
      viewMonth.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [viewMonth]
  );

  const scheduledEvents = useMemo(() => {
    const items: Array<{
      meeting: MeetingRecord;
      parsed: NonNullable<ReturnType<typeof parseScheduledMeeting>>;
      isVoice: boolean;
    }> = [];

    for (const meeting of meetings) {
      if (meeting.status !== 'upcoming' && meeting.status !== 'live') continue;
      const parsed = parseScheduledMeeting(meeting.scheduledTime, selectedTimezone);
      if (!parsed) continue;
      items.push({
        meeting,
        parsed,
        isVoice: meeting.title.toLowerCase().includes('voice'),
      });
    }

    items.sort((a, b) => a.parsed.sortValue - b.parsed.sortValue);
    return items;
  }, [meetings, selectedTimezone]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof scheduledEvents>();
    for (const ev of scheduledEvents) {
      const existing = map.get(ev.parsed.dateKey) || [];
      existing.push(ev);
      map.set(ev.parsed.dateKey, existing);
    }
    return map;
  }, [scheduledEvents]);

  const selectedDayEvents = useMemo(
    () => eventsByDate.get(selectedDate) || [],
    [eventsByDate, selectedDate]
  );

  const bookedTimesOnSelectedDate = useMemo(() => {
    const set = new Set<string>();
    for (const ev of selectedDayEvents) {
      if (editingMeetingId && ev.meeting.id === editingMeetingId) continue;
      set.add(ev.parsed.time24);
    }
    return set;
  }, [selectedDayEvents, editingMeetingId]);

  const upcomingOnlyEvents = useMemo(
    () => scheduledEvents.filter((ev) => ev.meeting.status === 'upcoming'),
    [scheduledEvents]
  );

  const addedUidSet = useMemo(() => new Set(contacts.map((c) => c.uid)), [contacts]);

  const otherTeammates = useMemo(
    () =>
      sortUsersByPresence(
        teamUsers.filter((u) => u.uid !== firebaseUser?.uid && addedUidSet.has(u.uid)),
        firebaseUser?.uid,
        presenceNow
      ),
    [teamUsers, firebaseUser?.uid, addedUidSet, presenceNow]
  );

  const filteredTimeSlots = useMemo(() => {
    if (slotPeriodFilter === 'am') {
      return CALENDAR_TIME_SLOTS.filter((slot) => Number(slot.slice(0, 2)) < 12);
    }
    if (slotPeriodFilter === 'pm') {
      return CALENDAR_TIME_SLOTS.filter((slot) => Number(slot.slice(0, 2)) >= 12);
    }
    return CALENDAR_TIME_SLOTS;
  }, [slotPeriodFilter]);

  const selectDateAndSyncMonth = (dateKey: string) => {
    setSelectedDate(dateKey);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]) - 1;
      if (viewMonth.getFullYear() !== y || viewMonth.getMonth() !== m) {
        setViewMonth(new Date(y, m, 1));
      }
    }
  };

  const resetForm = (keepDate = true) => {
    setEditingMeetingId(null);
    setMeetingTitle('');
    setMeetingMode('video');
    setSelectedParticipantIds([]);
    if (!keepDate) {
      selectDateAndSyncMonth(todayKey);
      setSelectedTime('10:00');
    }
  };

  const startEditingMeeting = (meeting: MeetingRecord) => {
    const parsed = parseScheduledMeeting(meeting.scheduledTime, selectedTimezone);
    setEditingMeetingId(meeting.id);
    const isVoice = meeting.title.toLowerCase().includes('voice');
    setMeetingMode(isVoice ? 'voice' : 'video');
    setMeetingTitle(meeting.title.replace(/^Voice Call:\s*/i, ''));
    if (parsed) {
      selectDateAndSyncMonth(parsed.dateKey);
      setSelectedTime(parsed.time24);
    }
    setSelectedParticipantIds(
      meeting.isPublic
        ? []
        : meeting.participantIds.filter((uid) => uid !== firebaseUser?.uid)
    );
    setLastScheduled(null);
  };

  const toggleParticipant = (uid: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const findConflictingEvent = (dateKey: string, time24: string) => {
    if (!dateKey || !time24) return null;
    const candidateIso = formatScheduledValue(dateKey, time24, selectedTimezone);
    const candidateParsed = parseScheduledMeeting(candidateIso, selectedTimezone);
    return (
      scheduledEvents.find((ev) => {
        if (editingMeetingId && ev.meeting.id === editingMeetingId) return false;
        const sameWall = ev.parsed.dateKey === dateKey && ev.parsed.time24 === time24;
        const sameInstant =
          Boolean(candidateParsed) &&
          Math.abs(ev.parsed.sortValue - candidateParsed!.sortValue) < 60_000;
        return sameWall || sameInstant;
      }) || null
    );
  };

  const selectedSlotConflict = findConflictingEvent(selectedDate, selectedTime);

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !selectedDate || !selectedTime) return;

    const conflict = findConflictingEvent(selectedDate, selectedTime);
    if (conflict) {
      setTimeConflictModal({
        title: conflict.meeting.title,
        whenText: conflict.parsed.displayFull,
      });
      return;
    }

    setSubmitting(true);
    try {
      if (editingMeetingId) {
        await rescheduleMeeting(editingMeetingId, {
          title: meetingTitle,
          date: selectedDate,
          time: selectedTime,
          timeZone: selectedTimezone,
          mode: meetingMode,
          participantIds: selectedParticipantIds,
        });
        const updated = meetings.find((m) => m.id === editingMeetingId);
        if (updated) {
          setLastScheduled({
            ...updated,
            title: meetingTitle.trim() || updated.title,
            scheduledTime: formatScheduledValue(selectedDate, selectedTime, selectedTimezone),
          });
        }
        resetForm(true);
      } else {
        const created = await scheduleMeeting({
          title: meetingTitle,
          date: selectedDate,
          time: selectedTime,
          timeZone: selectedTimezone,
          mode: meetingMode,
          participantIds: selectedParticipantIds,
        });
        if (created) {
          setLastScheduled(created);
          resetForm(true);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save scheduled meeting.';
      if (msg.toLowerCase().includes("can't add 2 meetings at the same time")) {
        setTimeConflictModal({
          title: selectedSlotConflict?.meeting.title || 'Another meeting',
          whenText:
            selectedSlotConflict?.parsed.displayFull ||
            `${formatDisplayDate(selectedDate)} · ${formatTimeDual(selectedTime)}`,
        });
      } else {
        setErrorBanner(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareInvite = async (meeting: MeetingRecord) => {
    if (sharingId) return;
    setSharingId(meeting.id);
    try {
      const ok = await shareScheduledMeetingToChat(meeting);
      if (ok) {
        setSharedMeetingId(meeting.id);
        setTimeout(() => {
          setSharedMeetingId((cur) => (cur === meeting.id ? null : cur));
        }, 3000);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Could not post invite to chat.'
      );
    } finally {
      setSharingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                Meeting Calendar &amp; Scheduler
              </h1>
              <p className="text-xs text-slate-500">
                24-hour AM &amp; PM scheduling · Now in <span className="font-semibold text-slate-700">{selectedTzShort}</span>: {currentTimeInZone}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 min-h-[38px] rounded-xl border border-slate-200 bg-slate-50">
              <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <select
                value={selectedTimezone}
                onChange={(e) => setSelectedTimezone(e.target.value)}
                aria-label="Select calendar time zone"
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none max-w-[200px]"
              >
                {timeZones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold tabular-nums">
              {upcomingOnlyEvents.length} Upcoming
            </span>

            {notifPermission === 'default' && (
              <button
                type="button"
                onClick={() => requestNotificationPermission()}
                className="min-h-[38px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Allow browser push alerts 5 minutes before meetings"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Enable 5-Min Push Alerts</span>
              </button>
            )}

            {notifPermission === 'granted' && (
              <button
                type="button"
                onClick={toggleRemindersEnabled}
                className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  remindersEnabled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
                title="Toggle automatic 5-minute meeting notifications"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>5-Min Alerts: {remindersEnabled ? 'ON' : 'OFF'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => sendTestReminder()}
              className="min-h-[38px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Preview the 5-minute meeting notification alert"
            >
              <Bell className="w-3.5 h-3.5 text-sky-600" />
              <span>Test Alert</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm(false);
              }}
              className="min-h-[38px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Today</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Monthly Calendar + Selected Day Schedule + Upcoming List */}
          <div className="lg:col-span-7 space-y-5">
            {/* Monthly Calendar Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">{monthLabel}</h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setViewMonth(
                        (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                      )
                    }
                    className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-colors"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => selectDateAndSyncMonth(todayKey)}
                    className="h-9 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setViewMonth(
                        (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                      )
                    }
                    className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-colors"
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Weekday Labels */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide py-1"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* 42-Cell Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((cell) => {
                  const dayEvents = eventsByDate.get(cell.dateKey) || [];
                  const isToday = cell.dateKey === todayKey;
                  const isSelected = cell.dateKey === selectedDate;
                  const isPast = cell.dateKey < todayKey;

                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() => selectDateAndSyncMonth(cell.dateKey)}
                      className={`min-h-[68px] sm:min-h-[82px] p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                        isSelected
                          ? 'border-sky-600 bg-sky-50/80 ring-2 ring-sky-200'
                          : isToday
                            ? 'border-sky-300 bg-white hover:bg-slate-50'
                            : cell.inCurrentMonth
                              ? 'border-slate-200 bg-white hover:bg-slate-50'
                              : 'border-slate-100 bg-slate-50/60 text-slate-400 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span
                          className={`text-xs font-semibold tabular-nums w-6 h-6 rounded-full flex items-center justify-center ${
                            isToday
                              ? 'bg-sky-600 text-white'
                              : isSelected
                                ? 'text-sky-800'
                                : cell.inCurrentMonth
                                  ? isPast
                                    ? 'text-slate-500'
                                    : 'text-slate-800'
                                  : 'text-slate-400'
                          }`}
                        >
                          {cell.date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 tabular-nums">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-0.5 w-full overflow-hidden">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div
                            key={ev.meeting.id}
                            className={`text-[10px] font-medium px-1 py-0.5 rounded truncate ${
                              ev.meeting.status === 'live'
                                ? 'bg-rose-100 text-rose-700'
                                : ev.isVoice
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-sky-100 text-sky-800'
                            }`}
                            title={`${ev.parsed.displayTime} — ${ev.meeting.title}`}
                          >
                            {ev.parsed.time24} {ev.meeting.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-[10px] font-semibold text-slate-500 px-1">
                            +{dayEvents.length - 2} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Day Meetings */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Schedule for {formatDisplayDate(selectedDate)}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedDayEvents.length === 0
                      ? 'No meetings scheduled yet for this date.'
                      : `${selectedDayEvents.length} meeting${selectedDayEvents.length > 1 ? 's' : ''} scheduled`}
                  </p>
                </div>
                <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg tabular-nums">
                  {selectedDate}
                </span>
              </div>

              {selectedDayEvents.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {selectedDayEvents.map(({ meeting, parsed, isVoice }) => {
                    const isOrganizer = meeting.organizerId === firebaseUser?.uid;
                    const isLive = meeting.status === 'live';
                    return (
                      <div
                        key={meeting.id}
                        className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 tabular-nums">
                              <Clock className="w-3.5 h-3.5 text-sky-600" />
                              {parsed.displayTime}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                isLive
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : isVoice
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                              }`}
                            >
                              {isVoice ? (
                                <Phone className="w-3 h-3" />
                              ) : (
                                <Video className="w-3 h-3" />
                              )}
                              <span>{isLive ? 'Live Now' : isVoice ? 'Voice Call' : 'Video Meeting'}</span>
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {meeting.title}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                            <span>Organizer: {meeting.organizerName}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {meeting.isPublic
                                ? 'Open to team'
                                : `${meeting.participantIds.length} invited`}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => joinVideoCall(meeting, isVoice ? 'voice' : 'video')}
                            className="min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{isLive ? 'Join' : 'Start'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleShareInvite(meeting)}
                            disabled={sharingId === meeting.id}
                            className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Share meeting invite in #general chat"
                          >
                            {sharedMeetingId === meeting.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700">Shared</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Invite Chat</span>
                              </>
                            )}
                          </button>

                          {isOrganizer && !isLive && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditingMeeting(meeting)}
                                className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                                title="Reschedule meeting"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteMeetingRecord(meeting.id)}
                                className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                                title="Cancel scheduled meeting"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* All Upcoming Scheduled Meetings */}
            {upcomingOnlyEvents.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">All Upcoming Meetings</h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {upcomingOnlyEvents.length} scheduled
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {upcomingOnlyEvents.map(({ meeting, parsed, isVoice }) => (
                    <div
                      key={meeting.id}
                      onClick={() => selectDateAndSyncMonth(parsed.dateKey)}
                      className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                        parsed.dateKey === selectedDate
                          ? 'border-sky-300 bg-sky-50/50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-sky-700">
                          {parsed.displayFull}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {meeting.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {isVoice ? 'Voice Call' : 'Video Meeting'} · {meeting.organizerName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          joinVideoCall(meeting, isVoice ? 'voice' : 'video');
                        }}
                        className="min-h-[34px] px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0"
                      >
                        Start
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Schedule / Reschedule Form */}
          <div className="lg:col-span-5">
            <form
              onSubmit={handleScheduleSubmit}
              className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 sticky top-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingMeetingId ? 'Reschedule Meeting' : 'Schedule a Meeting'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Picked: <span className="font-semibold text-slate-700">{formatDisplayDate(selectedDate)}</span> at{' '}
                    <span className="font-semibold text-slate-700">{formatTimeDual(selectedTime)}</span>{' '}
                    <span className="text-slate-400">({selectedTzShort})</span>
                  </p>
                </div>
                {editingMeetingId && (
                  <button
                    type="button"
                    onClick={() => resetForm(true)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>

              {lastScheduled && !editingMeetingId && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="text-xs font-semibold text-emerald-900">
                    Scheduled "{lastScheduled.title}" for{' '}
                    {parseScheduledMeeting(lastScheduled.scheduledTime, selectedTimezone)?.displayFull ||
                      lastScheduled.scheduledTime}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleShareInvite(lastScheduled)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>
                        {sharedMeetingId === lastScheduled.id
                          ? 'Posted to #general!'
                          : 'Post Invite to #general'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('chat')}
                      className="px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-semibold"
                    >
                      Open Chat
                    </button>
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="e.g., Website Redesign Review or Sprint Sync"
                  className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>

              {/* Meeting Mode */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Meeting Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMeetingMode('video')}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      meetingMode === 'video'
                        ? 'border-sky-600 bg-sky-50 text-sky-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    <span>Video Meeting</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingMode('voice')}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      meetingMode === 'voice'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                    <span>Voice Call</span>
                  </button>
                </div>
              </div>

              {/* Time Zone Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Time Zone
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <select
                    value={selectedTimezone}
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                    className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-600 focus:bg-white"
                  >
                    {timeZones.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Exact Date & Custom 24-Hour Time Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        selectDateAndSyncMonth(e.target.value);
                      }
                    }}
                    required
                    className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Time (24h &amp; AM/PM)
                  </label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedTime(e.target.value);
                      }
                    }}
                    required
                    className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
                  <div className="text-[11px] font-medium text-slate-500 tabular-nums">
                    {formatTimeDual(selectedTime)} · {selectedTzShort}
                  </div>
                </div>
              </div>

              {selectedSlotConflict && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>
                    You can&apos;t add 2 meetings at the same time —{' '}
                    <span className="font-semibold">&ldquo;{selectedSlotConflict.meeting.title}&rdquo;</span> is already scheduled at {selectedSlotConflict.parsed.displayTime}.
                  </span>
                </div>
              )}

              {/* 24-Hour AM & PM Quick Time Slots Grid */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700">24-Hour Time Slots (AM &amp; PM)</span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
                    {(['all', 'am', 'pm'] as const).map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => setSlotPeriodFilter(period)}
                        className={`px-2 py-0.5 rounded-md transition-colors ${
                          slotPeriodFilter === period
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {period === 'all' ? 'All 24h' : period.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                {bookedTimesOnSelectedDate.size > 0 && (
                  <div className="text-[11px] text-amber-700 font-medium">
                    • Amber slots already have a scheduled meeting on this date
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-52 overflow-y-auto pr-1">
                  {filteredTimeSlots.map((slot) => {
                    const active = selectedTime === slot;
                    const booked = bookedTimesOnSelectedDate.has(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          const conflict = findConflictingEvent(selectedDate, slot);
                          if (conflict) {
                            setTimeConflictModal({
                              title: conflict.meeting.title,
                              whenText: conflict.parsed.displayFull,
                            });
                            return;
                          }
                          setSelectedTime(slot);
                        }}
                        className={`py-1.5 px-1.5 rounded-lg border text-center tabular-nums transition-colors ${
                          active
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : booked
                              ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-[11px] font-bold leading-tight">{slot}</div>
                        <div className={`text-[10px] leading-tight ${active ? 'text-sky-100' : 'text-slate-500'}`}>
                          {formatTime12h(slot)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Invite Added Contacts */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    Invite Contacts ({selectedParticipantIds.length === 0 ? 'Private / Open' : `${selectedParticipantIds.length} selected`})
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddMemberOpen(true)}
                    className="text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add User</span>
                  </button>
                </div>

                {otherTeammates.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No contacts added yet. Search and add a user by @username to invite them directly.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {otherTeammates.map((user) => {
                      const checked = selectedParticipantIds.includes(user.uid);
                      const effectiveStatus = getEffectiveUserStatus(
                        user,
                        firebaseUser?.uid,
                        presenceNow
                      );
                      return (
                        <button
                          key={user.uid}
                          type="button"
                          onClick={() => toggleParticipant(user.uid)}
                          className={`min-h-[42px] px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                            checked
                              ? 'border-sky-600 bg-sky-50 text-sky-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium truncate">{user.displayName}</span>
                              <UserStatusBadge status={effectiveStatus} compact />
                            </div>
                            {user.username && (
                              <div className="text-[10px] text-slate-500 truncate">
                                @{user.username}
                              </div>
                            )}
                          </div>
                          {checked && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <CalendarIcon className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Saving...'
                    : editingMeetingId
                      ? 'Save Meeting Changes'
                      : 'Schedule Meeting'}
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <AddMemberModal isOpen={addMemberOpen} onClose={() => setAddMemberOpen(false)} />

      {/* Duplicate Time Conflict Popup Modal */}
      {timeConflictModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="conflict-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h3
                  id="conflict-modal-title"
                  className="text-base font-bold text-slate-900 leading-snug"
                >
                  You can&apos;t add 2 meetings at the same time
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-800">
                    &ldquo;{timeConflictModal.title}&rdquo;
                  </span>{' '}
                  is already scheduled for{' '}
                  <span className="font-semibold text-slate-800">
                    {timeConflictModal.whenText}
                  </span>
                  . Please select a different date or time slot.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setTimeConflictModal(null)}
                className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors"
              >
                OK, Choose Another Time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
