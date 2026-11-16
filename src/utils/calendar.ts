export interface ParsedSchedule {
  dateKey: string; // YYYY-MM-DD
  time24: string; // HH:mm
  displayDate: string; // e.g., Nov 20, 2026
  displayTime: string; // e.g., 2:30 PM
  displayFull: string; // e.g., Nov 20, 2026 · 2:30 PM
  sortValue: number;
}

export const CALENDAR_TIME_SLOTS: string[] = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
];

export function formatDateKey(date: Date): string {
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

export function formatDisplayDate(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatScheduledValue(dateKey: string, time24: string): string {
  return `${dateKey} · ${time24}`.slice(0, 80);
}

export function parseScheduledMeeting(scheduledTime?: string): ParsedSchedule | null {
  if (!scheduledTime) return null;
  const match = /(\d{4}-\d{2}-\d{2})\s*(?:·|T|\s)\s*(\d{2}:\d{2})/.exec(scheduledTime.trim());
  if (!match) return null;
  const dateKey = match[1];
  const time24 = match[2];
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time24.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  const displayDate = formatDisplayDate(dateKey);
  const displayTime = formatTime12h(time24);
  return {
    dateKey,
    time24,
    displayDate,
    displayTime,
    displayFull: `${displayDate} · ${displayTime}`,
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
