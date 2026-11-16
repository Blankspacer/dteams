import { Timestamp } from 'firebase/firestore';
import { UserProfile, UserStatus } from '../types';

export const PRESENCE_STALE_MS = 3 * 60 * 1000; // 3 minutes without heartbeat => offline

export const STATUS_META: Record<
  UserStatus,
  {
    label: string;
    dotClass: string;
    badgeClass: string;
    textClass: string;
    ringClass: string;
  }
> = {
  online: {
    label: 'Online',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    textClass: 'text-emerald-700',
    ringClass: 'ring-emerald-500/20',
  },
  busy: {
    label: 'Busy',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    textClass: 'text-rose-700',
    ringClass: 'ring-rose-500/20',
  },
  away: {
    label: 'Away',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    textClass: 'text-amber-700',
    ringClass: 'ring-amber-500/20',
  },
  offline: {
    label: 'Offline',
    dotClass: 'bg-slate-400',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    textClass: 'text-slate-500',
    ringClass: 'ring-slate-400/20',
  },
};

export function timestampToMillis(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.toMillis();
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return ((ts as { seconds: number }).seconds || 0) * 1000;
  }
  return 0;
}

export function getEffectiveUserStatus(
  user: Pick<UserProfile, 'uid' | 'status' | 'updatedAt'>,
  currentUid?: string | null,
  nowMs: number = Date.now()
): UserStatus {
  if (user.status === 'offline') return 'offline';
  if (currentUid && user.uid === currentUid) return user.status;

  const updatedMs = timestampToMillis(user.updatedAt);
  if (updatedMs > 0 && nowMs - updatedMs > PRESENCE_STALE_MS) {
    return 'offline';
  }
  return user.status || 'offline';
}

const STATUS_PRIORITY: Record<UserStatus, number> = {
  online: 0,
  busy: 1,
  away: 2,
  offline: 3,
};

export function sortUsersByPresence(
  users: UserProfile[],
  currentUid?: string | null,
  nowMs: number = Date.now()
): UserProfile[] {
  return [...users].sort((a, b) => {
    const sa = STATUS_PRIORITY[getEffectiveUserStatus(a, currentUid, nowMs)];
    const sb = STATUS_PRIORITY[getEffectiveUserStatus(b, currentUid, nowMs)];
    if (sa !== sb) return sa - sb;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function countUsersByPresence(
  users: UserProfile[],
  currentUid?: string | null,
  nowMs: number = Date.now()
): Record<UserStatus, number> {
  const counts: Record<UserStatus, number> = {
    online: 0,
    busy: 0,
    away: 0,
    offline: 0,
  };
  for (const user of users) {
    const effective = getEffectiveUserStatus(user, currentUid, nowMs);
    counts[effective] += 1;
  }
  return counts;
}
