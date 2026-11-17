export interface ParsedSchedule {
  dateKey: string; // YYYY-MM-DD in target timezone
  time24: string; // HH:mm in target timezone
  displayDate: string; // e.g., Nov 20, 2026
  displayTime12h: string; // e.g., 2:30 PM
  displayTime: string; // e.g., 14:30 (2:30 PM)
  displayFull: string; // e.g., Nov 20, 2026 · 14:30 (2:30 PM) GMT+6
  timeZone: string;
  timeZoneShort: string;
  sortValue: number; // UTC epoch ms
}

export interface TimeZoneOption {
  value: string;
  label: string;
}

const STORAGE_TIMEZONE_KEY = 'spherecall_timezone';

export const CALENDAR_TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, idx) => {
  const hour = String(Math.floor(idx / 2)).padStart(2, '0');
  const minute = idx % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
});

const BASE_TIMEZONES: TimeZoneOption[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time)' },
  { value: 'America/Toronto', label: 'America/Toronto (Eastern)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (Brasilia)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET / CEST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET / CEST)' },
  { value: 'Europe/Istanbul', label: 'Europe/Istanbul (TRT)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo (EET)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (Gulf · UTC+4)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT · UTC+5)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST · UTC+5:30)' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka (BST · UTC+6)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (ICT · UTC+7)' },
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (WIB · UTC+7)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT · UTC+8)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST · UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST · UTC+9)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (KST · UTC+9)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST / AEDT)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST / NZDT)' },
];

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getBrowserTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && isValidTimeZone(resolved)) return resolved;
  } catch {
    // Fallback
  }
  return 'UTC';
}

export function getSavedTimeZone(): string {
  try {
    const stored = localStorage.getItem(STORAGE_TIMEZONE_KEY);
    if (stored && isValidTimeZone(stored)) return stored;
  } catch {
    // Ignore storage error
  }
  return getBrowserTimeZone();
}

export function setSavedTimeZone(tz: string): void {
  if (!isValidTimeZone(tz)) return;
  try {
    localStorage.setItem(STORAGE_TIMEZONE_KEY, tz);
  } catch {
    // Ignore storage error
  }
}

export function getAvailableTimeZones(): TimeZoneOption[] {
  const localTz = getBrowserTimeZone();
  const hasLocal = BASE_TIMEZONES.some((t) => t.value === localTz);
  if (hasLocal) {
    return BASE_TIMEZONES;
  }
  return [{ value: localTz, label: `${localTz} (Device Local)` }, ...BASE_TIMEZONES];
}

export function getTimeZoneShortName(timeZone: string, dateMs = Date.now()): string {
  const safeTz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: safeTz,
      timeZoneName: 'short',
    }).formatToParts(new Date(dateMs));
    return parts.find((p) => p.type === 'timeZoneName')?.value || safeTz;
  } catch {
    return safeTz;
  }
}

export function formatDateKey(date: Date, timeZone?: string): string {
  if (timeZone && isValidTimeZone(timeZone)) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value || String(date.getFullYear());
    const m = parts.find((p) => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
    const d = parts.find((p) => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTime12h(time24: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!match) return time24;
  const h = Number(match[1]);
  const min = match[2];
  if (Number.isNaN(h) || h < 0 || h > 23) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${min} ${period}`;
}

export function formatTimeDual(time24: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!match) return time24;
  const padded24 = `${match[1].padStart(2, '0')}:${match[2]}`;
  return `${padded24} (${formatTime12h(padded24)})`;
}

export function formatDisplayDate(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
  return dt.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getZonedUtcGuessMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || '0');
  const h = get('hour') === 24 ? 0 : get('hour');
  return Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
}

export function toUtcIsoFromZonedDateTime(
  dateKey: string,
  time24: string,
  timeZone?: string
): string {
  const safeTz = timeZone && isValidTimeZone(timeZone) ? timeZone : getSavedTimeZone();
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!dm || !tm) return `${dateKey} · ${time24}`.slice(0, 80);

  const y = Number(dm[1]);
  const m = Number(dm[2]);
  const d = Number(dm[3]);
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);

  const targetAsUtc = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const guess1Offset = getZonedUtcGuessMs(targetAsUtc, safeTz) - targetAsUtc;
  const candidate1 = targetAsUtc - guess1Offset;
  const guess2Offset = getZonedUtcGuessMs(candidate1, safeTz) - candidate1;
  const finalUtcMs = targetAsUtc - guess2Offset;

  return new Date(finalUtcMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function formatScheduledValue(
  dateKey: string,
  time24: string,
  timeZone?: string
): string {
  return toUtcIsoFromZonedDateTime(dateKey, time24, timeZone).slice(0, 80);
}

export function parseScheduledMeeting(
  scheduledTime?: string,
  targetTimeZone?: string
): ParsedSchedule | null {
  if (!scheduledTime) return null;
  const raw = scheduledTime.trim();
  const safeTz =
    targetTimeZone && isValidTimeZone(targetTimeZone) ? targetTimeZone : getSavedTimeZone();

  // Case 1: Full ISO-8601 timestamp with explicit Z or numeric offset
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(dt);
    const getStr = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    const hourRaw = getStr('hour');
    const hh = hourRaw === '24' ? '00' : hourRaw.padStart(2, '0');
    const mm = getStr('minute').padStart(2, '0');
    const dateKey = `${getStr('year')}-${getStr('month')}-${getStr('day')}`;
    const time24 = `${hh}:${mm}`;
    const displayDate = formatDisplayDate(dateKey);
    const displayTime12h = formatTime12h(time24);
    const displayTime = formatTimeDual(time24);
    const tzShort = getTimeZoneShortName(safeTz, dt.getTime());

    return {
      dateKey,
      time24,
      displayDate,
      displayTime12h,
      displayTime,
      displayFull: `${displayDate} · ${displayTime} ${tzShort}`,
      timeZone: safeTz,
      timeZoneShort: tzShort,
      sortValue: dt.getTime(),
    };
  }

  // Case 2: Legacy local wall-clock format "YYYY-MM-DD · HH:mm"
  const match = /(\d{4}-\d{2}-\d{2})\s*(?:·|T|\s)\s*(\d{2}:\d{2})/.exec(raw);
  if (!match) return null;
  const dateKey = match[1];
  const time24 = match[2];
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time24.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  const displayDate = formatDisplayDate(dateKey);
  const displayTime12h = formatTime12h(time24);
  const displayTime = formatTimeDual(time24);
  const tzShort = getTimeZoneShortName(safeTz, dt.getTime());
  return {
    dateKey,
    time24,
    displayDate,
    displayTime12h,
    displayTime,
    displayFull: `${displayDate} · ${displayTime}`,
    timeZone: safeTz,
    timeZoneShort: tzShort,
    sortValue: dt.getTime(),
  };
}

export function getMonthCalendarDays(year: number, monthIndex: number): Array<{
  date: Date;
  dateKey: string;
  inCurrentMonth: boolean;
}> {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const startWeekday = firstDayOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
  const startDate = new Date(year, monthIndex, 1 - startWeekday);

  const cells: Array<{ date: Date; dateKey: string; inCurrentMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + i
    );
    cells.push({
      date: cellDate,
      dateKey: formatDateKey(cellDate),
      inCurrentMonth: cellDate.getMonth() === monthIndex,
    });
  }
  return cells;
}
