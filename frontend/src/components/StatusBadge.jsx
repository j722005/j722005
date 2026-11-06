import React from 'react';
import {
  getBookingStatusBadge,
  getSlotStatusBadge,
  getTicketStatusBadge,
  getTicketPriorityBadge,
} from '../utils/formatters';

export function StatusBadge({ type = 'slot', status }) {
  if (type === 'booking') {
    const badge = getBookingStatusBadge(status);
    return (
      <span className={`badge px-2.5 py-1.5 rounded-pill fw-medium ${badge.bg}`}>
        {badge.label}
      </span>
    );
  }

  if (type === 'ticket') {
    const badge = getTicketStatusBadge(status);
    return (
      <span className={`badge px-2.5 py-1.5 rounded-pill fw-semibold text-2xs ${badge.bg}`}>
        {badge.label}
      </span>
    );
  }

  if (type === 'priority') {
    const badge = getTicketPriorityBadge(status);
    return (
      <span className={`badge px-2.5 py-1 rounded-pill fw-medium text-3xs ${badge.bg} d-inline-flex align-items-center gap-1`}>
        {badge.label}
      </span>
    );
  }

  const badge = getSlotStatusBadge(status);
  return (
    <span className={`badge px-2.5 py-1.5 rounded-pill fw-medium ${badge.bg} d-inline-flex align-items-center gap-1.5`}>
      <span className={`badge-dot ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

export default StatusBadge;

