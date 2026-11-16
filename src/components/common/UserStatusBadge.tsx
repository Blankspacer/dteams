import React from 'react';
import { UserStatus } from '../../types';
import { STATUS_META } from '../../utils/presence';

interface UserStatusBadgeProps {
  status: UserStatus;
  compact?: boolean;
}

export const UserStatusBadge: React.FC<UserStatusBadgeProps> = ({ status, compact = false }) => {
  const meta = STATUS_META[status] || STATUS_META.offline;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.textClass}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
        <span>{meta.label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold shrink-0 ${meta.badgeClass}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
      <span>{meta.label}</span>
    </span>
  );
};
